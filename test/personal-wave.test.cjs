const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {cleanPersonal,wallpaperTheme,keyFromEvent,seasons}=require('../public/personal-options.js');
const {getTheme,isTheme}=require('../public/themes.js');
const {cleanJournal,statsFor,cleanDate,journalCSV,suggestGames}=require('../public/journal.js');
const {validateThemePackage,packTheme}=require('../public/theme-package.js');
const {paletteAccent}=require('../public/wallpaper-store.js');
const {updateBatch,prepareMove,applyMove,findScreenshots,readScreenshot}=require('../core/library-batch.cjs');
const {readState,saveState}=require('../core/state.cjs');
async function temp(t){const folder=await fs.mkdtemp(path.join(os.tmpdir(),'byazen-personal-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));return folder;}
test('per-section theme overrides the clock; clock transitions on local minutes',()=>{
 const clean=cleanPersonal({sectionThemes:{journal:'scene-photo-snow',evil:'light',downloads:'bogus'},schedule:{enabled:true,time:'18:45',day:'dark',night:'oled'}});
 assert.deepEqual(clean.sectionThemes,{journal:'scene-photo-snow'});
 assert.equal(wallpaperTheme(clean,'home','light',new Date(2026,10,20,18,44)),'dark');
 assert.equal(wallpaperTheme(clean,'home','light',new Date(2026,10,20,18,45)),'oled');
 assert.equal(wallpaperTheme(clean,'home','light',new Date(2026,10,20,5,59)),'oled');
 assert.equal(wallpaperTheme(clean,'home','light',new Date(2026,10,20,6,0)),'dark');
 assert.equal(wallpaperTheme(clean,'journal','light',new Date(2026,10,20,21)),'scene-photo-snow');
 assert.ok(seasons.every(([, ,id])=>isTheme(id)&&getTheme(id).asset));
});
test('validates sidebar order, reserved shortcuts, audio and zoom bounds',()=>{
 const clean=cleanPersonal({nav:['settings','journal','journal','junk'],keys:{search:'Alt+Y',journal:'Alt+Y',library:'Ctrl+W',downloads:''},uiScale:1000,textScale:90,intro:'x',sound:'winter',volume:0});
 assert.deepEqual(clean.nav,['settings','journal']);assert.deepEqual(clean.keys,{search:'Alt+Y',library:'Alt+L',downloads:'',journal:''});
 assert.equal(clean.uiScale,100);assert.equal(clean.textScale,90);assert.equal(clean.intro,'off');assert.equal(clean.sound,'winter');assert.equal(clean.volume,0);
 assert.equal(keyFromEvent({code:'KeyK',metaKey:false,ctrlKey:true,altKey:false,shiftKey:false}),'Ctrl+K');
 assert.equal(keyFromEvent({code:'KeyK',metaKey:false,ctrlKey:true,altKey:true,shiftKey:false}),'');
});
test('theme export is allowlisted, code-free and excludes identity and sidebar settings',async()=>{
 const text=await packTheme({theme:'dark',appearance:{accent:'#ABCDEF'},name:'Private',personal:{tray:true}},null);
 assert.equal(text.includes('Private'),false);assert.equal(text.includes('tray'),false);
 const pack=validateThemePackage(text);assert.equal(pack.appearance.accent,'#abcdef');assert.equal(pack.image,null);
 const bad={...JSON.parse(text),image:{data:'https://host.example/x.jpg'}};
 assert.throws(()=>validateThemePackage(JSON.stringify(bad)),/изображения/);
 assert.throws(()=>validateThemePackage('{'),/JSON/);
 assert.equal(validateThemePackage(JSON.stringify({...JSON.parse(text),script:'alert(1)'})).script,undefined);
});
test('palette samples actual saturated hues and ignores transparent/neutral pixels',()=>{
 assert.equal(paletteAccent([255,255,255,255,250,0,0,10,28,170,100,255,32,175,104,255,34,176,103,255]),'#21af68');
 assert.equal(paletteAccent([0,0,0,255]),'#bfa9ff');
});
const games=[{id:'a',title:'=HYPERLINK("x")',collections:['Игры'],progress:'finished',finishedAt:'2026-11-18',rating:9},{id:'b',title:'B',collections:['Игры'],progress:'playing',favorite:true},{id:'c',title:'C',collections:[],progress:'shelved'}];
const row=(id,gameId,day,seconds)=>({id,gameId,day,seconds,title:'Локальная игра',manual:true});
test('weekly, yearly, goal and collection stats respect date boundaries; CSV quotes formulas',()=>{
 const journal=cleanJournal({goal:2,sessions:[row('bad','a','2026-02-29',1),row('old','a','2025-12-31',60),row('a1','a','2026-11-13',60),row('a2','a','2026-11-14',3600),row('b1','b','2026-11-20',600),row('future','b','2026-11-21',120)]});
 const stats=statsFor(journal.sessions,games,new Date(2026,10,20));
 assert.equal(journal.sessions.length,5);assert.equal(cleanDate('2024-02-29'),'2024-02-29');
 assert.deepEqual(stats.weekly,{games:2,count:2,seconds:4200});assert.equal(stats.yearly.seconds,4260);assert.equal(stats.finished,1);assert.equal(stats.collections[0].finished,1);
 assert.match(journalCSV(journal.sessions,games),/"'=HYPERLINK\(""x""\)"/);
 assert.deepEqual(suggestGames(games,[row('b1','b','2026-11-20',600)],10,'Игры').map(r=>r.game.id),['b']);
 assert.deepEqual(suggestGames(games,[row('b1','b','2026-11-20',600)],9,'Игры'),[]);
});
test('bulk edit validates all selected records before applying changes',()=>{
 const rows=structuredClone(games);
 assert.throws(()=>updateBatch(rows,['b','nope'],{tags:['test']}),/изменилась/);assert.deepEqual(rows,games);
 assert.throws(()=>updateBatch(rows,['b'],{cover:'../../avatar'}),/обложка/);
 assert.deepEqual(updateBatch(rows,['b','b','c'],{collections:['Игры',' Ретро '],tags:['adventure'],cover:'elden'}),{updated:2});
 assert.deepEqual(rows[1].collections,['Игры','Ретро']);assert.equal(rows[1].cover,'elden');assert.equal(rows[0].cover,undefined);
});
test('path repair is preview-only until confirmation and rejects stale plans',async t=>{
 const root=await temp(t),former=path.join(root,'before'),next=path.join(root,'after'),sub=path.join(next,'Group');await fs.mkdir(sub,{recursive:true});
 const nextExe=path.join(sub,'fixture.exe');await fs.writeFile(nextExe,'file');const oldExe=path.join(former,'Group','fixture.exe'),rows=[{id:'g',title:'Fixture',exe:oldExe},{id:'v',title:'Missing',exe:path.join(former,'missing.exe')},{id:'x',title:'Other',exe:path.join(root,'before2','fixture.exe')}];
 const plan=await prepareMove(rows,former,next);assert.equal(rows[0].exe,oldExe);assert.equal(plan.skipped,1);assert.equal(plan.moves.length,1);
 await fs.rename(nextExe,nextExe+'.bak');await assert.rejects(applyMove(rows,plan));assert.equal(rows[0].exe,oldExe);
 await fs.rename(nextExe+'.bak',nextExe);assert.deepEqual(await applyMove(rows,plan),{updated:1});assert.equal(rows[0].exe,await fs.realpath(nextExe));await assert.rejects(applyMove(rows,plan),/изменилась/);
});
test('screenshots are scoped to the chosen directory and rechecked before reading',async t=>{
 const folder=await temp(t),shot=path.join(folder,'shot.png');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ycAAAAASUVORK5CYII=','base64');
 await fs.writeFile(shot,png);await fs.writeFile(path.join(folder,'bad.jpg'),'<svg/>');await fs.writeFile(path.join(folder,'skip.txt'),'ignore');
 const plan=await findScreenshots(folder);assert.equal(plan.items.length,2);const index=plan.items.findIndex(x=>x.title==='shot.png');
 const result=await readScreenshot(plan,index);assert.equal(result.mime,'image/png');assert.deepEqual(result.data,png);
 await assert.rejects(readScreenshot(plan,plan.items.findIndex(x=>x.title==='bad.jpg')),/JPG/);await assert.rejects(readScreenshot(plan,-1),/не найден/);
 await fs.unlink(shot);await assert.rejects(readScreenshot(plan,index));
});
test('personal settings and journal survive persisted state without requiring migration',async t=>{
 const file=path.join(await temp(t),'state.json'),data=readState(file);assert.equal(data.journal.goal,0);assert.deepEqual(data.notifications,[]);
 data.settings.personal.tray=true;data.settings.startSection='journal';data.journal.sessions.push(row('1','b','2026-11-20',60));
 saveState(file,data);const reread=readState(file);assert.equal(reread.settings.personal.tray,true);assert.equal(reread.settings.startSection,'journal');assert.deepEqual(reread.journal,data.journal);
});
