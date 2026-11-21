const {app, BrowserWindow, protocol, net, ipcMain, shell, dialog, session} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const {randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {parseSource, MAX_JSON, sourceLink} = require('../core/sources.cjs');
const {searchSteam,officialProduct} = require('../core/steam.cjs');
const {webURL,getJSON} = require('../core/net.cjs');
const {cleanGame,launchGame,prepareLaunch} = require('../core/library.cjs');
const {DownloadQueue,nameFromURL} = require('../core/downloads.cjs');
const {magnetV1}=require('../core/torrent.cjs');
const {readState,saveState,sourcesSummary,searchSources,availability,updateSettings,sourceMatches,readSourceGame} = require('../core/state.cjs');

const {installPresets,createPresetSync,urlKey,CUSTOM_SOURCE_LIMIT}=require('../core/presets.cjs');

const root = path.resolve(__dirname,'../public');
const origin = 'byazen://app';
protocol.registerSchemesAsPrivileged([{scheme:'byazen', privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
if (process.env.PORTABLE_EXECUTABLE_DIR) app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR,'ByAzen-data'));

async function bootstrap() {
  const file = path.join(app.getPath('userData'),'state.json');
  const data = readState(file);
  const persist = () => {try { saveState(file,data); } catch (e) { console.error('State:',e.message); window?.webContents.send('storage-error',e.message); }};
  let window;
  const queue = new DownloadQueue(data.downloads,persist);
  const previews = new Map(), exeTokens = new Map();
  function token(map,value) { const id = randomUUID(); map.set(id,value); if (map.size > 6) map.delete(map.keys().next().value); return id; }
  const find = (list,id) => { const value = list.find(x => x.id === id); if (!value) throw Error('Запись не найдена.'); return value; };
  async function readSource(url,limits={maxBytes:MAX_JSON}) {
    return parseSource(await getJSON(webURL(url).href,{max:limits.maxBytes}),limits);
  }
  const presetSync=createPresetSync(data.sources,readSource,persist);
  if(installPresets(data))persist();
  const actions = {
    settings: () => data.settings,
    saveSettings: (x) => { data.settings = updateSettings(x); persist(); return data.settings; },
    steam: searchSteam,
    openSteam: async raw => { const safe = officialProduct(raw); if (!safe) throw Error('Недопустимая страница Steam.'); await shell.openExternal(safe); },
    openSteamCharts: () => shell.openExternal('https://store.steampowered.com/charts/topselling'),
    openProjectFeedback: () => shell.openExternal('https://github.com/gggvkvh405-rgb/1/issues/new'),
    sources: () => sourcesSummary(data.sources).map(s=>({...s,loading:presetSync.loading(s.id)})),
    previewFile: async () => {
      const {filePaths:[file]} = await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Hydra JSON',extensions:['json']}]});
      if (!file) return null;
      const fd = await fs.open(file,'r');
      try {
        const stat = await fd.stat(); if (!stat.isFile() || stat.size > MAX_JSON) throw Error('Выберите файл JSON размером до 4 МБ.');
        const buf = Buffer.alloc(MAX_JSON + 1); const {bytesRead} = await fd.read(buf,0,buf.length,0);
        return stash(parseSource(buf.subarray(0,bytesRead).toString('utf8')),{kind:'file',file});
      } finally { await fd.close(); }
    },
    previewURL: async raw => {const url = webURL(raw).href; return stash(await readSource(url),{kind:'url',url});},
    importSource: id => {
      if (!previews.has(id)) throw Error('Откройте предпросмотр повторно.');
      const draft=previews.get(id);
      if(draft.kind==='url'&&data.sources.some(s=>s.kind==='url'&&urlKey(s.url)===urlKey(draft.url)))throw Error('Источник с такой ссылкой уже добавлен.');
      if (data.sources.filter(s=>!s.presetName).length >= CUSTOM_SOURCE_LIMIT) throw Error('Можно добавить до 20 своих источников.');
      data.sources.push({...draft,id:randomUUID(),enabled:true,updated:new Date().toISOString()}); previews.delete(id); persist();
    },
    sourceAction: async (id,op) => {
      const src = find(data.sources,id);
      if (op === 'remove') data.sources.splice(data.sources.indexOf(src),1);
      else if (op === 'toggle') {
        src.enabled = !src.enabled;
        if(src.enabled&&src.presetName&&(!src.updated||src.syncError))void presetSync.refresh(src).catch(()=>{});
      }
      else if(op==='refresh'&&src.presetName)return presetSync.refresh(src);
      else if (op === 'refresh' && src.kind === 'url') {
        const parsed = await readSource(src.url); if (!data.sources.includes(src)) return;
        Object.assign(src,parsed,{updated:new Date().toISOString()});
      } else if (op === 'refresh' && src.kind === 'file') {
        const fd = await fs.open(src.file,'r');
        try { const stat = await fd.stat(); if (!stat.isFile() || stat.size > MAX_JSON) throw Error('Требуется JSON до 4 МБ.'); const buf = Buffer.alloc(MAX_JSON + 1); const {bytesRead} = await fd.read(buf,0,buf.length); Object.assign(src,parseSource(buf.subarray(0,bytesRead).toString('utf8')),{updated:new Date().toISOString()}); }
        finally { await fd.close(); }
      } else throw Error('Недопустимое действие.');
      persist();
    },
    searchSources: (q,page) => searchSources(data.sources,q,page),
    availability: titles => availability(data.sources,titles),
    sourceMatches: title => sourceMatches(data.sources,title),
    sourceGame: (id,index,title) => readSourceGame(data.sources,id,index,title),
    openSource: async (sourceId,index,linkIndex,action,expected) => {
      const src = find(data.sources,sourceId);
      if (!src.enabled || !Number.isInteger(index) || !Number.isInteger(linkIndex)) throw Error('Ссылка недоступна.');
      const url = sourceLink(src.games[index]?.links[linkIndex]);
      if (url !== expected) throw Error('Источник изменился. Откройте ссылку повторно.');
      if (action === 'browser' && !url.startsWith('magnet:')) await shell.openExternal(webURL(url).href);
      else if (action === 'download') return addDownload(url,src.games[index].title);
      else throw Error('Неподдерживаемое действие.');
    },
    library: () => data.library,
    chooseExe: async () => {
      const {filePaths:[exe]} = await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Windows',extensions:['exe']}]});
      if (!exe) return null;
      await prepareLaunch(exe); return {title:path.basename(exe,'.exe'),path:exe,token:token(exeTokens,exe)};
    },
    saveGame: async (id,raw,exeToken) => {
      const values = cleanGame(raw); const old = id ? find(data.library,id) : null;
      const exe = exeToken ? exeTokens.get(exeToken) : old?.exe || '';
      if (exeToken) {await prepareLaunch(exe); exeTokens.delete(exeToken);}
      if (old) Object.assign(old,values,{exe});
      else {if (data.library.length >= 1500) throw Error('В библиотеке уже 1500 игр.'); data.library.push({...values,exe,id:randomUUID(),lastPlayed:''});}
      persist();
    },
    favorite: id => { const g = find(data.library,id); g.favorite = !g.favorite; persist(); },
    removeGame: id => { data.library.splice(data.library.indexOf(find(data.library,id)),1); persist(); },
    launchGame: async (id,profile) => {
      const g = find(data.library,id);
      if (!g.exe) throw Error('Сначала выберите файл .exe в карточке игры.');
      if (!Number.isInteger(profile) || profile < -1 || profile >= g.profiles.length) throw Error('Профиль не найден.');
      await launchGame(g.exe,g.profiles[profile]?.args || []); g.lastPlayed = new Date().toISOString(); persist();
    },
    downloads: () => queue.list(), addDownload: raw => addDownload(sourceLink(raw)),
    downloadAction: (id,op) => queue.action(id,op)
  };
  async function addDownload(url,title) {
    if(url.startsWith('magnet:')){
      const {xt}=magnetV1(url);
      const label=title||new URL(url).searchParams.get('dn')||`Torrent ${xt.slice(9,17)}`;
      const {filePaths:[folder]}=await dialog.showOpenDialog(window,{title:'Выберите папку для загрузки BitTorrent',defaultPath:app.getPath('downloads'),properties:['openDirectory','createDirectory']});
      if(!folder)return false;
      queue.addTorrent(url,folder,label);return true;
    }
    const {filePath} = await dialog.showSaveDialog(window,{defaultPath:path.join(app.getPath('downloads'),nameFromURL(url))});
    if (filePath) { queue.add(url,filePath); return true; } return false;
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
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.webContents.on('will-navigate', e => e.preventDefault());
  window.once('ready-to-show', () => {window.maximize(); window.show();});
  await window.loadURL(origin+'/');
  void presetSync.startup();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {const w = BrowserWindow.getAllWindows()[0]; if (w) {if (w.isMinimized()) w.restore(); w.focus();}});
  app.whenReady().then(bootstrap).catch(e => {dialog.showErrorBox('ByAzen',e.message); app.quit();});
  app.on('window-all-closed',()=>app.quit());
}
