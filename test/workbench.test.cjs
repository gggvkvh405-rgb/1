const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {parseQuery,matchesQuery,steamSeed}=require('../public/query.js');
const {searchSources,groupSources}=require('../public/source-search.js');
const {createPresetSync}=require('../core/presets.cjs');
const {steamQuery}=require('../core/steam.cjs');
const {mediaURL,releaseDay,sanitizeDetails,createSteamDetails,cleanStore,saveWish,wishMonitor}=require('../core/steam-detail.cjs');
const {cleanWorkbench,snapshotDiff,createSourceWorkbench,configure,sourceExport}=require('../core/source-workbench.cjs');
const {parseSource}=require('../core/sources.cjs');
const {migrationExport,readMigration,freshCards,adoptMigration,cleanRequired,verifyFiles,diskReport,previewCleanup,cleanup,collectionHTML}=require('../core/file-workbench.cjs');
const {cleanHome}=require('../public/home-layout.js');
const game=(title,name='fixture',date='2026-11-20')=>({title,size:'2 MB',date,links:[`https://example.com/${name}`]});
const feed=(id,games)=>({id,enabled:true,name:`Feed ${id}`,kind:'url',url:`https://example.com/${id}.json`,updated:'2026-11-20T00:00:00.000Z',games});
async function temp(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'byazen-work-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('compound query preserves phrases, exclusions and numeric sequel boundaries',()=>{
 const q=parseQuery('"Resident Evil" +2 -demo');assert.equal(steamSeed(q),'resident evil');
 assert.equal(matchesQuery('Resident Evil 2',q),true);assert.equal(matchesQuery('Resident Evil 20',q),false);assert.equal(matchesQuery('Resident Evil 2 Demo',q),false);assert.equal(matchesQuery('Resident Dark Evil 2',q),false);
 const s=feed('a',[game('Resident Evil 2'),game('Resident Evil 2 Demo'),game('Resident Evil 20')]);assert.equal(searchSources([s],'"Resident Evil" +2 -demo').total,1);
 assert.equal(searchSources([s],'-demo').total,2);
});
test('Steam search sends separate co-op type, base games only, and upcoming switches',()=>{
 const {u}=steamQuery({term:'"Game Name" -demo',page:4,coop:'48',category1:'21',hideAddons:true});
 assert.equal(u.searchParams.get('category1'),'998');assert.equal(u.searchParams.get('category2'),'48');assert.equal(u.searchParams.get('term'),'game name');assert.equal(u.searchParams.get('start'),'72');
 assert.equal(steamQuery({comingSoon:true}).u.searchParams.get('filter'),'comingsoon');assert.equal(steamQuery({coop:'50'}).u.searchParams.has('category2'),false);
});
test('grouped results preserve unrelated sequels and demos, and show every included feed',()=>{
 const a=feed('a',[game('Game Name v1.2'),game('Game Name 2'),game('Game Name Demo')]),b=feed('b',[game('Game Name Build 40'),game('Название Игры')]);
 const r=groupSources([a,b],'',1,'',[['Game Name','Название Игры']]);assert.equal(r.total,3);assert.equal(r.games[0].versions,3);assert.deepEqual(r.games[0].sourceNames,['Feed a','Feed b']);
 assert.equal(groupSources([a,b],'',1,'b').games.every(g=>g.id==='b'),true);assert.equal(searchSources([a,b]).total,5);
});
test('source history, watch transitions, alias selection and fingerprints survive updates',()=>{
 const s=feed('a',[game('Existing'),game('Removed')]),other=feed('b',[]),data={sources:[s,other],sourceWorkbench:cleanWorkbench()},notices=[];
 const ws=createSourceWorkbench(data,(...args)=>notices.push(args));
 ws.watch('Desert Game');ws.alias('Desert Game','Игра в пустыне');configure(other,{priority:5,hours:6});ws.bookmark(s,s.games[0]);
 const mark=data.sourceWorkbench.bookmarks[0];assert.equal(ws.locate(mark.id).title,'Existing');
 s.games=[game('Existing','moved')];s.updated='2026-11-21T00:00:00.000Z';other.games=[game('Игра в пустыне')];other.updated=s.updated;ws.observe();
 assert.equal(notices.length,1);assert.equal(ws.history(s).rows.length,1);assert.deepEqual(ws.history(s).diff.sample.map(x=>x.kind),['changed','removed']);
 assert.throws(()=>ws.locate(mark.id),/версия исчезла/i);ws.observe();assert.equal(notices.length,1);
 assert.equal(parseSource(sourceExport(other)).games[0].title,'Игра в пустыне');assert.equal(snapshotDiff(s.games,s.games).changed,0);
});
test('scheduled source refresh honors per-feed intervals and opt-out',async()=>{
 let now=Date.parse('2026-11-21T00:00:00.000Z');const a=feed('a',[]),b=feed('b',[]);configure(a,{hours:6,priority:1});configure(b,{hours:0,priority:0});const calls=[];
 const worker=createPresetSync([a,b],async url=>{calls.push(url);return {name:'Fixture',games:[game('Test')]};},()=>{},{now:()=>now});
 await worker.startup();assert.deepEqual(calls,[a.url]);now+=5*3600000;await worker.scheduled();assert.equal(calls.length,1);now+=3600000;await worker.scheduled();assert.equal(calls.length,2);
});
const raw={570:{success:true,data:{steam_appid:570,name:'Fixture Game',type:'game',short_description:'<p>Game <b>text</b></p>',release_date:{coming_soon:true,date:'Nov 23, 2027'},categories:[{id:38}],screenshots:[{path_full:'https://cdn.akamai.steamstatic.com/s.png'},{path_full:'http://unsafe.local/x.png'}],movies:[{name:'Trailer',mp4:{480:'https://cdn.akamai.steamstatic.com/a.mp4'}}],price_overview:{currency:'EUR',final:490,final_formatted:'4,90€',discount_percent:51}}}};
test('Steam detail data sanitizes HTML and only uses allowlisted media; date parser avoids fabricating days',()=>{
 const d=sanitizeDetails(raw,'570','DE');assert.equal(d.description,'Game text');assert.equal(d.day,'2027-11-23');assert.equal(d.price.minor,490);assert.equal(d.categories[0],38);assert.equal(d.screenshots.length,1);assert.equal(d.videos.length,1);
 assert.equal(releaseDay('February 29, 2027'),'');assert.equal(releaseDay('November 2027'),'');assert.equal(releaseDay('29 Feb, 2028'),'2028-02-29');assert.equal(mediaURL('https://cdn.akamai.steamstatic.com.evil.test/a.mp4'),'');
 assert.throws(()=>sanitizeDetails(raw,'571','DE'),/нет данных/);
});
test('Steam details coalesce calls and never fetch attacker-supplied URLs',async()=>{
 let calls=0;const read=createSteamDetails({read:async(url,opts)=>{calls++;assert.match(url,/^https:\/\/store\.steampowered\.com\/api\/appdetails\?/);assert.throws(()=>opts.validate(new URL('https://example.com/api/appdetails')),/Steam/);return raw;}});
 await Promise.all([read('570','DE'),read('570','DE')]);await read('570','DE');assert.equal(calls,1);await assert.rejects(read('https://unsafe.test','DE'),/App ID/);
});
test('wish alert respects currency, threshold and resets only after ending a known discount',async()=>{
 const store=cleanStore(),d=sanitizeDetails(raw,'570','DE'),notices=[];const note=(...args)=>notices.push(args);
 saveWish(store,d,{threshold:500,notes:'Try later'},note);saveWish(store,d,{threshold:500,notes:'Updated'},note);assert.equal(notices.length,1);
 let now=1e10,res={...d,price:{...d.price,currency:'USD',discount:0}};
 const poll=wishMonitor(store,async()=>res,()=>{},note,()=>now);await poll();assert.equal(notices.length,1);
 now+=6*3600000;res={...d,price:{...d.price,discount:0}};await poll();now+=6*3600000;res=d;await poll();assert.equal(notices.length,2);
});
test('migration imports card metadata only, with replace-settings opt-in and no duplicate title',()=>{
 const state={settings:{name:'Old'},library:[{title:'Fixture',exe:'C:\\Personal\\game.exe',profiles:[{name:'A',args:['--cmd']}],folders:{saves:'C:\\Saves'},tags:['A'],notes:'note'},{title:'Other'}]};
 const json=migrationExport(state);assert.ok(!json.includes('Personal')&&!json.includes('Saves')&&!json.includes('--cmd'));
 const plan=readMigration(json),newPC={settings:{name:'New'},library:[{title:'fixture'}]};assert.equal(freshCards(newPC.library,plan).length,1);
 assert.deepEqual(adoptMigration(newPC,plan,true,false),{added:1,skipped:1});assert.equal(newPC.settings.name,'New');assert.equal(newPC.library[1].exe,'');
 adoptMigration(newPC,plan,false,true);assert.equal(newPC.settings.name,'Old');assert.throws(()=>readMigration('invalid'),/JSON/);
});
test('required file checks cannot escape the executable folder; report returns actual file sizes',async t=>{
 const root=await temp(t),folder=path.join(root,'Data');await fs.mkdir(folder);const exe=path.join(root,'fixture.exe');await fs.writeFile(exe,'123');await fs.writeFile(path.join(folder,'ok.dat'),'12');
 for(const input of ['../secret','Data/../../a','C:\\other','nul.txt','//server/share'])assert.throws(()=>cleanRequired([input]),/относительные/);
 const rows=await verifyFiles({exe,requiredFiles:['Data\\ok.dat','Data/missing.dat']});assert.deepEqual(rows.map(x=>x.ok),[true,true,false]);
 const report=await diskReport(root);assert.equal(report.total,5);assert.equal(report.count,2);assert.deepEqual(report.groups.find(g=>g.name==='Data'),{name:'Data',bytes:2});
});
test('cleanup only deletes selected verified completed HTTP temporary files and rejects changes',async t=>{
 const root=await temp(t),id='d757138c-cbd6-4e30-b382-361ffa553234',partial=path.join(root,`.byazen-${id}.part`),file=path.join(root,'game.zip');await fs.writeFile(partial,'orphan');await fs.writeFile(file,'keep');
 const item={id,title:'fixture',file,partial,status:'running'};assert.equal((await previewCleanup([item])).length,0);item.status='done';assert.equal((await previewCleanup([{...item,kind:'torrent'}])).length,0);const [row]=await previewCleanup([item]);assert.equal(row.bytes,6);
 await fs.appendFile(partial,' changed');await assert.rejects(cleanup([item],[row]),/изменилось/);
 const fresh=await previewCleanup([item]);assert.deepEqual(await cleanup([item],fresh),{removed:1,failed:0});assert.equal(await fs.readFile(file,'utf8'),'keep');
});
test('HTML sharing escapes names and excludes links, executable paths and notes; widgets preserve explicit order',()=>{
 const html=collectionHTML([{title:'<script>oops</script>',collections:['A'],notes:'private note',exe:'path-to-secret'},{title:'Hidden',collections:['B']}],'A');
 assert.match(html,/&lt;script&gt;/);for(const secret of ['<script>','Hidden','private note','path-to-secret','href='])assert.ok(!html.includes(secret));
 assert.deepEqual(cleanHome(['activity','activity','none','feature']),['activity','feature']);assert.deepEqual(cleanHome([]),[]);
});
