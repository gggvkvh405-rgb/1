const {maxMigration,migrationExport,readMigration,freshCards,adoptMigration,cleanRequired,verifyFiles,diskReport,previewCleanup,cleanup,collectionHTML}=require('../core/file-workbench.cjs');
const {createSteamDetails,saveWish,wishMonitor}=require('../core/steam-detail.cjs');
const {configure,createSourceWorkbench,sortedSources,matchesWithAliases,sourceExport}=require('../core/source-workbench.cjs');
const {groupSources}=require('../public/source-search.js');
const {app, BrowserWindow, protocol, net, ipcMain, shell, dialog, session, clipboard, Tray, Menu, nativeImage, powerMonitor} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const {randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {parseSource, MAX_JSON, sourceLink} = require('../core/sources.cjs');
const {searchSteam} = require('../core/steam.cjs');
const {webURL} = require('../core/net.cjs');
const {cleanGame,launchGame,prepareLaunch} = require('../core/library.cjs');
const {DownloadQueue,nameFromURL} = require('../core/downloads.cjs');
const {magnetV1}=require('../core/torrent.cjs');
const {transferOptions,cleanHash}=require('../core/transfer-policy.cjs');
const {updateBatch,prepareMove,applyMove,findScreenshots,readScreenshot}=require('../core/library-batch.cjs');
const {cleanDate,localDay}=require('../public/journal.js');
const {checkDownload}=require('../core/download-check.cjs');
const {SaveBackups}=require('../core/save-backups.cjs');
const {discoverExecutables,discoverSteam,importSelected,steamId,directory,boundedText}=require('../core/installed-games.cjs');
const {readState,saveState,sourcesSummary,searchSources,availability,updateSettings,readSourceGame} = require('../core/state.cjs');

const {auditSources}=require('../core/source-audit.cjs');
const {createFeedReader}=require('../core/feed-reader.cjs');
const {commitReplacement}=require('../core/source-replacement.cjs');
const {installPresets,createPresetSync,urlKey,CUSTOM_SOURCE_LIMIT,presetLimits,managedURL,isPrimaryOnlineFix,prioritizeOnlineFix,connectOnlineFix}=require('../core/presets.cjs');

const root = path.resolve(__dirname,'../public');
const origin = 'byazen://app';
protocol.registerSchemesAsPrivileged([{scheme:'byazen', privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
if (process.env.PORTABLE_EXECUTABLE_DIR) app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR,'ByAzen-data'));

async function bootstrap() {
  const file = path.join(app.getPath('userData'),'state.json');
  const data = readState(file);
  await fs.mkdir(path.dirname(file),{recursive:true});
  const copies=new SaveBackups(path.dirname(file));
  let storageHealth={status:'ok',at:new Date().toISOString()},steamHealth={status:'unknown',at:''},safeAppearance=process.argv.includes('--safe-mode');
  const playing=new Set();let battery=false;
  try{battery=powerMonitor.isOnBatteryPower();}catch{}
  const runtime=()=>({safe:safeAppearance,battery,playing:playing.size>0});
  function sendRuntime(){if(window&&!window.isDestroyed())window.webContents.send('appearance-runtime',runtime());}
  powerMonitor.on('on-battery',()=>{battery=true;sendRuntime();});
  powerMonitor.on('on-ac',()=>{battery=false;sendRuntime();});
  async function observeSteam(fn){try{const result=await fn();steamHealth={status:'ok',at:new Date().toISOString()};return result;}catch(e){steamHealth={status:'error',at:new Date().toISOString()};throw e;}}
  async function syncStore(){if(!data.syncFolder)throw Error('Сначала выберите папку синхронизации.');return new SaveBackups(await directory(data.syncFolder));}
  let transferStates=new Map(data.downloads.map(job=>[job.id,job.status])),sourceStates=new Map(data.sources.map(source=>[source.id,source.updated]));
  function collectNotifications(){
    for(const j of data.downloads)if(transferStates.get(j.id)!==j.status&&['done','error'].includes(j.status))pushNotice(j.status==='done'?'Загрузка завершена':'Ошибка загрузки',j.title,'downloads');
    for(const s of data.sources)if(s.updated&&sourceStates.get(s.id)!==s.updated)pushNotice('Обновлён список источника',s.name,'sources');
    transferStates=new Map(data.downloads.map(j=>[j.id,j.status]));sourceStates=new Map(data.sources.map(s=>[s.id,s.updated]));
  }
  function pushNotice(title,detail,target){
    data.notifications.unshift({id:randomUUID(),title,detail:String(detail||'').slice(0,140),target,at:new Date().toISOString()});data.notifications.splice(80);
    if(window&&!window.isDestroyed())window.webContents.send('notice-changed');
  }
  const persist = () => {try { collectNotifications();sourceWorkbench.observe();saveState(file,data);storageHealth={status:'ok',at:new Date().toISOString()}; } catch (e) { storageHealth={status:'error',at:new Date().toISOString()};console.error('State:',e.message); if(window&&!window.isDestroyed())window.webContents.send('storage-error',e.message); }};
  let window,tray;
  const sourceWorkbench=createSourceWorkbench(data,pushNotice);
  const steamDetails=createSteamDetails(),steamWatch=wishMonitor(data.steamDesk,steamDetails,persist,pushNotice);
  const bulkPlans=new Map(),migrationPlans=new Map(),cleanupPlans=new Map();let bulkBusy=false,cleanupBusy=false,reportBusy=false;
  const queue = new DownloadQueue(data.downloads,persist,{options:data.downloadOptions});
  app.once('before-quit',()=>queue.dispose());
  let downloadCheck;
  function showApp(section){
    if(!window||window.isDestroyed())return;
    if(window.isMinimized())window.restore();window.show();window.focus();
    if(section)window.webContents.send('go-section',section);
  }
  function syncTray(){
    if(!window||window.isDestroyed())return;
    if(!data.settings.personal.tray){if(tray){tray.destroy();tray=null;}return;}
    if(tray)return;
    const img=nativeImage.createFromPath(path.join(root,'assets','tray.png'));
    if(img.isEmpty())return;
    tray=new Tray(img);tray.setToolTip('ByAzen');tray.on('click',()=>showApp());
    const menu=()=>Menu.buildFromTemplate([
      {label:'Открыть ByAzen',click:()=>showApp()},
      {label:`Загрузки · ${queue.list().filter(j=>j.status==='running').length} активных`,click:()=>showApp('downloads')},
      {label:'Пауза для очереди',click:()=>{for(const job of queue.list())if(job.status==='queued'||job.status==='running'&&job.phase!=='saving')void queue.action(job.id,'pause').catch(()=>{});}},
      {type:'separator'},{label:'Выход',click:()=>app.quit()}
    ]);
    tray.setContextMenu(menu());tray.on('right-click',()=>{tray.setContextMenu(menu());});
  }
  app.on('second-instance',()=>showApp());
  app.once('before-quit',()=>{tray?.destroy();tray=null;});
  const previews = new Map(),exeTokens = new Map(),installPlans=new Map(),restorePlans=new Map(), movePlans=new Map(), screenshotPlans=new Map();
  const folderKinds=new Set(['saves','screenshots','mods']);
  let maintenance=false,scanning=false;
  function withMaintenance(fn){
    if(maintenance)throw Error('Дождитесь завершения текущей операции с файлами.');
    maintenance=true;
    return Promise.resolve().then(fn).finally(()=>{maintenance=false;});
  }
  const game=id=>find(data.library,id);
  async function pickFolder(title,defaultPath){
    const {filePaths:[folder]}=await dialog.showOpenDialog(window,{title,defaultPath,properties:['openDirectory']});
    return folder||null;
  }
  function folderOf(g,kind){
    if(!folderKinds.has(kind))throw Error('Неизвестный тип папки.');
    return g.folders?.[kind]||'';
  }
  function savesOf(g){const root=folderOf(g,'saves');if(!root)throw Error('Сначала выберите папку сохранений.');return root;}
  async function scanLibrary(kind){
    if(scanning)throw Error('Поиск уже выполняется.');
    if(!['local','steam'].includes(kind))throw Error('Неизвестный режим импорта.');
    scanning=true;
    try{
      const steam=kind==='steam',programFiles=process.env['ProgramFiles(x86)']||process.env.ProgramFiles;
      const folder=await pickFolder(steam?'Выберите папку библиотеки Steam или steamapps':'Выберите папку с установленными играми',steam&&programFiles?path.join(programFiles,'Steam'):undefined);
      if(!folder)return null;
      const {found,limited}=await (steam?discoverSteam(folder):discoverExecutables(folder));
      return {id:token(installPlans,found),limited,items:found.map((r,i)=>({index:i,title:r.title,path:r.file,steamAppId:r.steamAppId||'',
        present:data.library.some(g=>r.steamAppId?g.steamAppId===r.steamAppId:g.exe?.toLowerCase()===r.file.toLowerCase())}))};
    }finally{scanning=false;}
  }
  function token(map,value) { const id = randomUUID(); map.set(id,value); if (map.size > 6) map.delete(map.keys().next().value); return id; }
  const find = (list,id) => { const value = list.find(x => x.id === id); if (!value) throw Error('Запись не найдена.'); return value; };
  const readSource=createFeedReader();
  function limitsForSource(source){
    const profile=source?.presetURL||(source?.presetName?source.url:null);
    return profile?presetLimits(profile):{maxBytes:MAX_JSON};
  }
  async function readSourceFile(file,limits={maxBytes:MAX_JSON}){
    const fd=await fs.open(file,'r');
    try{
      const stat=await fd.stat();
      if(!stat.isFile()||stat.size>limits.maxBytes)throw Error(`Требуется JSON до ${limits.maxBytes/1048576} МБ.`);
      const buf=Buffer.alloc(stat.size+1);
      let bytes=0;
      while(bytes<buf.length){const {bytesRead}=await fd.read(buf,bytes,buf.length-bytes,bytes);if(!bytesRead)break;bytes+=bytesRead;}
      if(bytes!==stat.size)throw Error('Файл изменился во время чтения. Выберите его повторно.');
      return parseSource(buf.subarray(0,bytes).toString('utf8'),limits);
    }finally{await fd.close();}
  }
  function readConnectedSource(source){
    const limits=limitsForSource(source);
    if(source.kind==='file')return readSourceFile(source.file,limits);
    if(source.kind==='url')return readSource(source.url,limits);
    throw Error('Неизвестный вид источника.');
  }
  let auditTask;
  const presetSync=createPresetSync(data.sources,readSource,persist,{concurrency:3});
  if(installPresets(data))persist();
  const actions = {
    settings: () => data.settings,
    saveSettings: (x) => { data.settings = updateSettings(x); persist();syncTray();return data.settings; },
    steam: filters=>observeSteam(()=>searchSteam(filters)),
    steamDetail: (id,cc)=>observeSteam(()=>steamDetails(id,cc)),
    appearanceRuntime: ()=>runtime(),
    safeAppearance: enabled=>{if(typeof enabled!=='boolean')throw Error('Неверная настройка.');safeAppearance=enabled;sendRuntime();return runtime();},
    statusCenter: ()=>({storage:storageHealth,steam:steamHealth,sources:data.sources.map(s=>({name:s.name,enabled:s.enabled,updated:s.updated||'',error:Boolean(s.syncError),count:s.games.length}))}),
    statusCheck: async()=>{
      try{await observeSteam(()=>searchSteam({page:1,cc:data.settings.region}));}catch{}
      try{await fs.access(path.dirname(file),require('node:fs').constants.W_OK);if(storageHealth.status!=='error')storageHealth={status:'ok',at:new Date().toISOString()};}catch{storageHealth={status:'error',at:new Date().toISOString()};}
    },
    steamWishlist: ()=>data.steamDesk.wishes,
    steamWishSave: async (id,cc,raw)=>{
      const d=await steamDetails(id,cc);saveWish(data.steamDesk,d,raw,pushNotice);
      persist();return data.steamDesk.wishes;
    },
    steamWishRemove: id=>{data.steamDesk.wishes=data.steamDesk.wishes.filter(w=>w.id!==id);persist();return data.steamDesk.wishes;},
    steamWishRefresh: ()=>steamWatch(true),
    openSteamCharts: () => shell.openExternal('https://store.steampowered.com/charts/topselling'),
    openProjectFeedback: () => shell.openExternal('https://github.com/gggvkvh405-rgb/1/issues/new'),
    sources: () => sourcesSummary(sortedSources(prioritizeOnlineFix(data.sources))).map(s=>({...s,primaryOnlineFix:isPrimaryOnlineFix(s),loading:presetSync.loading(s.id)})),
    connectOnlineFix: async () => {
      const source=connectOnlineFix(data.sources);
      persist();
      if(!source.updated||source.syncError)await presetSync.refresh(source);
      return {id:source.id,count:source.games.length};
    },
    retrySourceLists: () => presetSync.retryFailed(),
    auditSources: () => auditTask||=(auditSources(data.sources,readConnectedSource).finally(()=>{auditTask=null;})),
    previewFile: async (id) => {
      const replacementFor=id?find(data.sources,id):undefined;
      const {filePaths:[file]} = await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Hydra JSON',extensions:['json']}]});
      if (!file) return null;
      return stash(await readSourceFile(file,limitsForSource(replacementFor)),{kind:'file',file,replacementFor});
    },
    previewURL: async (raw,id) => {
      const url=webURL(raw).href,replacementFor=id?find(data.sources,id):undefined;
      return stash(await readSource(url,limitsForSource(replacementFor)),{kind:'url',url,replacementFor});
    },
    replaceSource: (sourceId,id) => {commitReplacement(data.sources,sourceId,previews.get(id));previews.delete(id);persist();},
    importSource: id => {
      if (!previews.has(id)) throw Error('Откройте предпросмотр повторно.');
      const draft=previews.get(id);
      if(draft.replacementFor)throw Error('Этот предпросмотр предназначен для замены списка.');
      if(draft.kind==='url'&&data.sources.some(s=>s.kind==='url'&&urlKey(s.url)===urlKey(draft.url)))throw Error('Источник с такой ссылкой уже добавлен.');
      if (data.sources.filter(s=>!s.presetName&&!s.presetURL).length >= CUSTOM_SOURCE_LIMIT) throw Error('Можно добавить до 20 своих источников.');
      data.sources.push({...draft,id:randomUUID(),enabled:true,updated:new Date().toISOString()}); previews.delete(id); persist();
    },
    sourceAction: async (id,op) => {
      const src = find(data.sources,id);
      if (op === 'remove') data.sources.splice(data.sources.indexOf(src),1);
      else if (op === 'toggle') {
        src.enabled = !src.enabled;sourceWorkbench.observe(true);
        if(src.enabled&&managedURL(src)&&(!src.updated||src.syncError))void presetSync.refresh(src).catch(()=>{});
      }
      else if(op==='refresh'&&src.kind==='url')return presetSync.refresh(src);
      else if(op==='refresh'){
        try{const parsed=await readConnectedSource(src);if(!data.sources.includes(src))return;if(!parsed.games.length)throw Error('В списке нет допустимых записей. Кэш сохранён.');Object.assign(src,parsed,{updated:new Date().toISOString(),lastAttempt:new Date().toISOString(),syncError:''});}
        catch(e){if(data.sources.includes(src)){src.lastAttempt=new Date().toISOString();src.syncError=String(e.message).slice(0,220);persist();}throw e;}
      } else throw Error('Недопустимое действие.');
      persist();
    },
    searchSources: (q,page,id,mode) => mode==='grouped'?groupSources(data.sources,q,page,id,data.sourceWorkbench.aliases):searchSources(data.sources,q,page,id,mode),
    availability: titles => {
      const rows=availability(data.sources,titles),aliases=data.sourceWorkbench.aliases;
      if(!aliases.length)return rows;
      return rows.map(row=>({...row,sources:[...new Set(matchesWithAliases(data.sources,row.title,aliases).map(s=>s.name))]}));
    },
    sourceMatches: title => matchesWithAliases(sortedSources(prioritizeOnlineFix(data.sources)),title,data.sourceWorkbench.aliases),
    sourceHistory: id => sourceWorkbench.history(find(data.sources,id)),
    sourceConfigure: (id,options) => {configure(find(data.sources,id),options);persist();},
    sourceWorkbench: () => ({aliases:data.sourceWorkbench.aliases,watch:data.sourceWorkbench.watch,bookmarks:data.sourceWorkbench.bookmarks}),
    sourceWorkbenchChange: (kind,value) => {
      const work=data.sourceWorkbench;
      if(kind==='watch')sourceWorkbench.watch(value);
      else if(kind==='unwatch')work.watch=work.watch.filter(w=>w.id!==value);
      else if(kind==='alias'){sourceWorkbench.alias(value?.from,value?.to);sourceWorkbench.observe(true);}
      else if(kind==='unalias'){if(Number.isInteger(value)&&value>=0)work.aliases.splice(value,1);sourceWorkbench.observe(true);}
      else if(kind==='bookmark'){const g=readSourceGame(data.sources,value?.id,value?.index,value?.title);sourceWorkbench.bookmark(find(data.sources,g.id),g);}
      else if(kind==='unbookmark')work.bookmarks=work.bookmarks.filter(w=>w.id!==value);
      else throw Error('Неизвестное действие источника.');
      persist();
    },
    sourceBookmark: id=>sourceWorkbench.locate(id),
    sourceExport: async id=>{
      const s=find(data.sources,id),{filePath}=await dialog.showSaveDialog(window,{defaultPath:'ByAzen-source.json',filters:[{name:'Hydra JSON',extensions:['json']}]});
      if(!filePath)return false;
      const exportText=sourceExport(s);if(Buffer.byteLength(exportText)>64*1048576)throw Error('Кэш превышает 64 МБ.');
      await fs.writeFile(filePath,exportText,'utf8');return true;
    },
    sourceBulkPreview: async urls=>{
      if(bulkBusy)throw Error('Проверка списка уже запущена.');
      if(!Array.isArray(urls)||urls.length<1||urls.length>5||urls.some(x=>typeof x!=='string'||x.length>4096))throw Error('Укажите от 1 до 5 ссылок.');
      bulkBusy=true;
      try{
        const rows=[],keys=new Set(data.sources.filter(s=>s.kind==='url').map(s=>urlKey(s.url)));
        for(const input of urls){
          let url;
          try{url=webURL(input).href;const key=urlKey(url);if(keys.has(key))throw Error('Повтор ссылки.');keys.add(key);
            const parsed=await readSource(url);if(!parsed.games.length)throw Error('Нет допустимых записей.');rows.push({...parsed,kind:'url',url});
          }catch(e){rows.push({url:url||input,error:String(e.message).slice(0,200)});}
        }
        return {draft:token(bulkPlans,{time:Date.now(),rows}),rows:rows.map(r=>({url:r.url,error:r.error,name:r.name,count:r.games?.length,skipped:r.skipped}))};
      }finally{bulkBusy=false;}
    },
    sourceBulkImport: (id,indices)=>{
      const plan=bulkPlans.get(id);if(!plan||Date.now()-plan.time>10*60000)throw Error('Откройте новый предпросмотр.');
      if(!Array.isArray(indices)||!indices.length||indices.length>5||indices.some(i=>!Number.isInteger(i)||!plan.rows[i]?.games))throw Error('Выберите проверенные списки.');
      const rows=[...new Set(indices)].map(i=>plan.rows[i]),keys=new Set(data.sources.filter(s=>s.kind==='url').map(s=>urlKey(s.url)));
      if(rows.some(r=>keys.has(urlKey(r.url))))throw Error('Список уже добавлен. Откройте новый предпросмотр.');
      if(data.sources.filter(s=>!s.presetName&&!s.presetURL).length+rows.length>CUSTOM_SOURCE_LIMIT)throw Error('Можно добавить до 20 своих источников.');
      data.sources.push(...rows.map(r=>({...r,id:randomUUID(),enabled:true,updated:new Date().toISOString()})));bulkPlans.delete(id);persist();return rows.length;
    },
    sourceGame: (id,index,title) => readSourceGame(data.sources,id,index,title),
    openSource: async (sourceId,index,linkIndex,action,expected) => {
      const src = find(data.sources,sourceId);
      if (!src.enabled || !Number.isInteger(index) || !Number.isInteger(linkIndex)) throw Error('Ссылка недоступна.');
      const url = sourceLink(src.games[index]?.links[linkIndex]);
      if (url !== expected) throw Error('Источник изменился. Откройте ссылку повторно.');
      if (action !== 'download') throw Error('Неподдерживаемое действие.');
      return addDownload(url,src.games[index].title,src.name);
    },
    library: () => data.library,
    diskReport: async()=>{
      if(reportBusy)throw Error('Отчёт уже строится.');reportBusy=true;
      try{const root=await pickFolder('Выберите папку для отчёта по месту');return root?await diskReport(root):null;}finally{reportBusy=false;}
    },
    cleanupPreview: async()=>{
      const rows=await previewCleanup(data.downloads);
      return {id:token(cleanupPlans,rows),items:rows.map(({id,title,bytes})=>({id,title,bytes}))};
    },
    cleanupApply: async(id,ids)=>{
      if(cleanupBusy)throw Error('Очистка уже выполняется.');
      const rows=cleanupPlans.get(id);if(!rows||!Array.isArray(ids)||!ids.length||ids.length>rows.length||ids.some(x=>!rows.some(r=>r.id===x)))throw Error('Выберите файлы из нового предпросмотра.');
      cleanupBusy=true;cleanupPlans.delete(id);
      try{return await cleanup(data.downloads,rows.filter(r=>ids.includes(r.id)));}finally{cleanupBusy=false;}
    },
    migrationExport: async()=>{
      const {filePath}=await dialog.showSaveDialog(window,{defaultPath:'ByAzen-migration.json',filters:[{name:'JSON',extensions:['json']}]});if(!filePath)return false;
      const text=migrationExport(data);if(Buffer.byteLength(text)>maxMigration)throw Error('Пакет превышает 12 МБ.');await fs.writeFile(filePath,text);return true;
    },
    migrationPreview: async()=>{
      const {filePaths:[filename]}=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'ByAzen JSON',extensions:['json']}]});if(!filename)return null;
      const pack=readMigration(await boundedText(filename,maxMigration)),cards=freshCards(data.library,pack);
      return {id:token(migrationPlans,pack),total:pack.library.length,newCards:cards.length,titles:cards.slice(0,30).map(x=>x.title),theme:pack.settings.theme};
    },
    migrationApply: (id,flags)=>withMaintenance(()=>{
      const pack=migrationPlans.get(id);if(!pack)throw Error('Откройте новый предпросмотр.');
      const result=adoptMigration(data,pack,flags?.games,flags?.settings);migrationPlans.delete(id);persist();syncTray();return result;
    }),
    requiredFiles: id=>game(id).requiredFiles||[],
    checkRequired: id=>verifyFiles(game(id)),
    saveRequired: (id,names)=>withMaintenance(()=>{const g=game(id);if(!g.exe)throw Error('Сначала выберите .exe.');g.requiredFiles=cleanRequired(names);persist();}),
    syncFolder: ()=>data.syncFolder,
    pickSyncFolder: ()=>withMaintenance(async()=>{
      const dir=await pickFolder('Папка синхронизации для резервных копий',data.syncFolder||undefined);if(!dir)return false;
      data.syncFolder=await copies.source(dir);persist();return true;
    }),
    syncBackups: async id=>{const store=await syncStore();return store.list(game(id).id);},
    makeSyncBackup: id=>withMaintenance(async()=>{const store=await syncStore(),g=game(id);return store.make(g.id,savesOf(g));}),
    removeSyncBackup: (id,backup)=>withMaintenance(async()=>{const store=await syncStore();return store.remove(game(id).id,backup);}),
    exportCollection: async name=>{
      const text=collectionHTML(data.library,name),{filePath}=await dialog.showSaveDialog(window,{defaultPath:'ByAzen-collection.html',filters:[{name:'HTML',extensions:['html']}]});if(!filePath)return false;await fs.writeFile(filePath,text);return true;
    },
    scanLibrary,
    saveBatch: (ids,patch) => withMaintenance(()=>{const result=updateBatch(data.library,ids,patch);persist();return result;}),
    previewMove: old => withMaintenance(async()=>{
      const next=await pickFolder('Выберите новую папку с играми');if(!next)return null;
      const plan=await prepareMove(data.library,old,next);return {draft:token(movePlans,plan),moves:plan.moves,skipped:plan.skipped,truncated:plan.truncated};
    }),
    applyMove: draft => withMaintenance(async()=>{
      const plan=movePlans.get(draft);if(!plan)throw Error('Откройте предпросмотр путей повторно.');
      const result=await applyMove(data.library,plan);movePlans.delete(draft);persist();return result;
    }),
    screenshots: async id => {
      const g=game(id),folder=folderOf(g,'screenshots');if(!folder)throw Error('Сначала выберите папку скриншотов в «Папках».');
      const plan=await findScreenshots(folder);return {draft:token(screenshotPlans,plan),items:plan.items.map(({title,date})=>({title,date}))};
    },
    screenshot: (draft,index) => {
      const plan=screenshotPlans.get(draft);if(!plan)throw Error('Откройте галерею заново.');
      return readScreenshot(plan,index);
    },
    journal: () => data.journal,
    journalChange: (kind,value) => {
      const journal=data.journal;
      if(kind==='goal'){
        if(!Number.isInteger(value)||value<0||value>50)throw Error('Цель должна быть от 0 до 50.');
        journal.goal=value;
      }else if(kind==='delete-moment')journal.moments=journal.moments.filter(m=>m.id!==value);
      else if(kind==='session'||kind==='moment'){
        const g=game(value?.id),day=cleanDate(value?.day);
        if(!day||day>localDay())throw Error('Выберите дату не позднее сегодняшней.');
        if(kind==='session'){
          if(!Number.isInteger(value.minutes)||value.minutes<1||value.minutes>1440)throw Error('Укажите длительность от 1 до 1 440 минут.');
          journal.sessions.push({id:randomUUID(),gameId:g.id,title:g.title,day,seconds:value.minutes*60,manual:true});journal.sessions=journal.sessions.slice(-4000);
        }else{
          const title=typeof value.title==='string'?value.title.trim().slice(0,200):'';
          if(!title)throw Error('Назовите игровой момент.');
          journal.moments.push({id:randomUUID(),gameId:g.id,day,title});journal.moments=journal.moments.slice(-300);
        }
      }else throw Error('Неизвестное действие журнала.');
      persist();return journal;
    },
    notifications:() => data.notifications,
    clearNotifications:() => {data.notifications=[];persist();},
    saveExport: async (kind,payload) => {
      const exts={theme:['json','ByAzen-theme'],csv:['csv','ByAzen-journal'],year:['png','ByAzen-year']};
      if(!Object.hasOwn(exts,kind)||typeof payload!=='string')throw Error('Неверный формат экспорта.');
      const [ext,name]=exts[kind],binary=kind==='year';
      if(payload.length>(kind==='theme'?24*1024*1024:4*1024*1024))throw Error('Файл слишком большой.');
      if(binary&&!/^iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(payload))throw Error('Ожидается PNG.');
      const {filePath}=await dialog.showSaveDialog(window,{defaultPath:name+'.'+ext,filters:[{name:ext.toUpperCase(),extensions:[ext]}]});
      if(!filePath)return false;
      await fs.writeFile(filePath,binary?Buffer.from(payload,'base64'):payload);return true;
    },
    importInstalledGames: (draft,indices) => withMaintenance(async()=>{
      const found=installPlans.get(draft);if(!found)throw Error('Откройте новый предпросмотр импорта.');
      const result=await importSelected(data.library,found,indices);installPlans.delete(draft);persist();return result;
    }),
    gameFolders: id => {const g=game(id);return {folders:Object.fromEntries([...folderKinds].map(kind=>[kind,folderOf(g,kind)])),auto:g.autoSaveBackup===true};},
    pickGameFolder: (id,kind) => withMaintenance(async()=>{
      const g=game(id),current=folderOf(g,kind),picked=await pickFolder(kind==='saves'?'Выберите папку сохранений игры':'Выберите папку игры',current||undefined);
      if(!picked)return false;
      const selected=kind==='saves'?await copies.source(picked):await directory(picked);
      game(id);g.folders={...g.folders,[kind]:selected};
      if(kind==='saves'&&selected!==current)g.autoSaveBackup=false;
      persist();return true;
    }),
    openGameFolder: async(id,kind)=>{
      const target=folderOf(game(id),kind);if(!target)throw Error('Сначала выберите папку.');
      if(await shell.openPath(await directory(target)))throw Error('Не удалось открыть папку.');
    },
    setAutoSaveBackup: (id,enabled) => withMaintenance(async()=>{
      if(typeof enabled!=='boolean')throw Error('Неверная настройка копирования.');
      const g=game(id);if(enabled)await copies.source(savesOf(g));g.autoSaveBackup=enabled;persist();
    }),
    listSaveBackups: id => copies.list(game(id).id),
    makeSaveBackup: id => withMaintenance(()=>copies.make(game(id).id,savesOf(game(id)))),
    previewSaveRestore: (id,backup) => withMaintenance(async()=>{
      const preview=await copies.preview(game(id).id,savesOf(game(id)),backup);
      const draft=token(restorePlans,{id,preview});
      const {fingerprint,...shown}=preview;return {...shown,draft};
    }),
    restoreSaveBackup: (id,draft) => withMaintenance(async()=>{
      const pending=restorePlans.get(draft);if(!pending||pending.id!==id)throw Error('Откройте новый предпросмотр восстановления.');
      restorePlans.delete(draft);return copies.restore(game(id).id,savesOf(game(id)),pending.preview);
    }),
    deleteSaveBackup: (id,backup) => withMaintenance(()=>copies.remove(game(id).id,backup)),
    chooseExe: async () => {
      const {filePaths:[exe]} = await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Windows',extensions:['exe']}]});
      if (!exe) return null;
      await prepareLaunch(exe); return {title:path.basename(exe,'.exe'),path:exe,token:token(exeTokens,exe)};
    },
    saveGame: async (id,raw,exeToken) => {
      const values = cleanGame(raw); const old = id ? find(data.library,id) : null;
      const exe = exeToken ? exeTokens.get(exeToken) : old?.exe || '';
      if (exeToken) {await prepareLaunch(exe); exeTokens.delete(exeToken);}
      const finishedAt=values.progress==='finished'?(old?.progress==='finished'?(old.finishedAt||''):localDay()):'';
      if(old){Object.assign(old,values,{exe,finishedAt});if(exeToken)delete old.steamAppId;}
      else {if(data.library.length>=1500)throw Error('В библиотеке уже 1500 игр.');data.library.push({...values,exe,id:randomUUID(),lastPlayed:'',finishedAt});}
      persist();
    },
    favorite: id => { const g = find(data.library,id); g.favorite = !g.favorite; persist(); },
    removeGame: id => withMaintenance(()=>{data.library.splice(data.library.indexOf(game(id)),1);persist();}),
    launchGame: (id,profile) => withMaintenance(async()=>{
      const g=game(id),steam=steamId(g.steamAppId);
      if(!steam&&!g.exe)throw Error('Сначала выберите файл .exe в карточке игры.');
      if(!Number.isInteger(profile)||profile < -1||(steam?profile!==-1:profile>=g.profiles.length))throw Error('Профиль не найден.');
      const args=g.profiles[profile]?.args||[];
      if(!steam)await prepareLaunch(g.exe,args);
      if(g.autoSaveBackup===true)await copies.make(g.id,savesOf(g),{automatic:true});
      if(steam)await shell.openExternal(`steam://rungameid/${g.steamAppId}`);
      else{
        const child=await launchGame(g.exe,args),start=performance.now(),day=localDay(),title=g.title;
        playing.add(child);sendRuntime();
        child.once('exit',()=>{
          playing.delete(child);sendRuntime();
          const seconds=Math.min(86400,Math.round((performance.now()-start)/1000));if(seconds<1)return;
          data.journal.sessions.push({id:randomUUID(),gameId:g.id,title,day,seconds,manual:false});data.journal.sessions=data.journal.sessions.slice(-4000);persist();
        });
      }
      g.lastPlayed=new Date().toISOString();g.lastProfile=profile<0?null:JSON.stringify(g.profiles[profile]);persist();
    }),
    downloads: () => queue.list(),
    downloadInfo: () => ({items:queue.list(),options:data.downloadOptions,allowed:queue.allowed(),version:app.getVersion()}),
    saveDownloadOptions: raw => {
      data.downloadOptions=transferOptions(raw);persist();queue.configure(data.downloadOptions);
      return data.downloadOptions;
    },
    checkDownload: () => downloadCheck||=(async()=>{
      const {filePaths:[folder]}=await dialog.showOpenDialog(window,{title:'Куда записать временный тестовый файл?',defaultPath:app.getPath('downloads'),properties:['openDirectory']});
      return folder?await checkDownload(folder):null;
    })().finally(()=>{downloadCheck=null;}),
    copyDownloadReport: id => {
      clipboard.writeText(JSON.stringify({application:'ByAzen',version:app.getVersion(),...queue.report(id)},null,2));
    },
    revealDownload: async id => {
      const {file}=queue.find(id);
      if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Папка назначения недоступна.');
      const target=await fs.lstat(file).catch(()=>null);
      if(target){shell.showItemInFolder(file);return;}
      const parent=path.dirname(file);
      if(!(await fs.lstat(parent).catch(()=>null))?.isDirectory())throw Error('Папка назначения не найдена.');
      if(await shell.openPath(parent))throw Error('Windows не открыла папку назначения.');
    },
    addDownload: (raw,sha256) => addDownload(sourceLink(raw),'','',cleanHash(sha256)),
    downloadAction: (id,op) => {if(cleanupBusy&&['resume','remove','cancel'].includes(op))throw Error('Дождитесь завершения очистки.');return queue.action(id,op);}
  };
  async function addDownload(url,title,source,sha256){
    if(url.startsWith('magnet:')){
      if(sha256)throw Error('Для magnet используется встроенная проверка частей. Поле SHA-256 предназначено для HTTP(S)-файла.');
      const {xt}=magnetV1(url);
      const label=title||new URL(url).searchParams.get('dn')||`Torrent ${xt.slice(9,17)}`;
      const {filePaths:[folder]}=await dialog.showOpenDialog(window,{title:'Выберите папку для загрузки BitTorrent',defaultPath:app.getPath('downloads'),properties:['openDirectory','createDirectory']});
      if(!folder)return false;
      queue.addTorrent(url,folder,label,source);return true;
    }
    const {filePath}=await dialog.showSaveDialog(window,{defaultPath:path.join(app.getPath('downloads'),nameFromURL(url))});
    if(filePath){queue.add(url,filePath,{expectFile:Boolean(title),origin:source,sha256});return true;}return false;
  }
  function stash(parsed,metadata) { const id = token(previews,{...parsed,...metadata}); return {id,name:parsed.name,count:parsed.games.length,skipped:parsed.skipped,ignoredLinks:parsed.ignoredLinks,titles:parsed.games.slice(0,10).map(g=>g.title)}; }
  protocol.handle('byazen', req => {
    const u = new URL(req.url);
    const name = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
    const file = path.resolve(root,name);
    if (u.host !== 'app' || !file.startsWith(root+path.sep)) return new Response('Not found',{status:404});
    return net.fetch(pathToFileURL(file).href);
  });
  session.defaultSession.setPermissionRequestHandler((wc, p, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.on('will-download', (_, item) => item.cancel());
  ipcMain.handle('byazen', async (event,action,args) => {
    const sender = event.senderFrame;
    if (!window || event.sender !== window.webContents || sender !== event.sender.mainFrame || !sender.url.startsWith(origin+'/') || !Object.hasOwn(actions,action) || !Array.isArray(args) || args.length > 5) return {error:'Действие запрещено.'};
    try { return {value:await actions[action](...args)}; }
    catch (e) { return {error:e.message || 'Не удалось выполнить действие.'}; }
  });
  window = new BrowserWindow({width:1440,height:900,minWidth:720,minHeight:480,show:false,backgroundColor:'#101010',title:'ByAzen',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
  syncTray();
  window.on('minimize',()=>{if(tray)window.hide();});
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.webContents.on('will-navigate', e => e.preventDefault());
  window.once('ready-to-show', () => {window.maximize(); window.show();});
  await window.loadURL(origin+'/');
  const schedule=setInterval(()=>void presetSync.scheduled(),60000);schedule.unref();
  const priceSchedule=setInterval(()=>void steamWatch(),120000);priceSchedule.unref();
  app.once('before-quit',()=>{clearInterval(schedule);clearInterval(priceSchedule);});
  void presetSync.startup().then(()=>{const retry=setTimeout(()=>void presetSync.retryTransient(),60000);retry.unref();});
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(bootstrap).catch(e => {dialog.showErrorBox('ByAzen',e.message); app.quit();});
  app.on('window-all-closed',()=>app.quit());
}
