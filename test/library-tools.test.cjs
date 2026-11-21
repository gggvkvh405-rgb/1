const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {discoverExecutables,parseVDF,discoverSteam,importSelected}=require('../core/installed-games.cjs');
const {SaveBackups,MAX_SNAPSHOTS}=require('../core/save-backups.cjs');
const {cleanAppearance,onAccent}=require('../public/appearance.js');
const {updateSettings}=require('../core/state.cjs');
async function temp(t){
 const raw=await fs.mkdtemp(path.join(os.tmpdir(),'byazen-library-'));t.after(()=>fs.rm(raw,{recursive:true,force:true}).catch(()=>{}));
 return fs.realpath(raw);
}
async function setup(t){
 const base=await temp(t),profile=path.join(base,'profile'),saves=path.join(base,'saves');await fs.mkdir(profile);await fs.mkdir(saves);
 return {base,profile,saves,game:randomUUID(),backups:new SaveBackups(profile)};
}
const write=async(root,name,content)=>{const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);return file;};
const read=(root,name)=>fs.readFile(path.join(root,name),'utf8');
const pe='MZ-test-only-not-a-real-executable';

test('bounded local discovery skips helpers, malformed executables and unselected files',async t=>{
 const root=await temp(t);
 await write(root,'Adventure.exe',pe);await write(root,'B/Level/B.exe',pe);await write(root,'B/unins000.exe',pe);
 await write(root,'redist/Fake.exe',pe);await write(root,'NotGame.exe','plain text');await write(root,'Game.txt',pe);
 const {found,limited}=await discoverExecutables(root);assert.equal(limited,false);
 assert.deepEqual(found.map(x=>x.title),['Adventure','B']);
 const library=[];assert.deepEqual(await importSelected(library,found,[1]),{added:1,skipped:0});
 assert.equal(library[0].exe,found[1].file);assert.equal(library[0].lastPlayed,'');
 assert.deepEqual(await importSelected(library,found,[1]),{added:0,skipped:1});
 await fs.unlink(found[0].file);assert.deepEqual(await importSelected(library,found,[0]),{added:0,skipped:1});
 await assert.rejects(importSelected(library,found,[500]),/предпросмотра/);
 assert.equal((await discoverExecutables(root,{entries:1})).limited,true);
});
test('Steam discovery accepts only installed matching manifests under the selected steamapps folder',async t=>{
 const root=await temp(t);
 const manifest=(id,name,dir,flags='4')=>`"AppState" { "appid" "${id}" "name" "${name}" "StateFlags" "${flags}" "installdir" "${dir}" "InstalledDepots" { "1" { "manifest" "99" } } }`;
 const dir=path.join(root,'steamapps','common');await fs.mkdir(path.join(dir,'Fixture game'),{recursive:true});
 await write(root,'steamapps/appmanifest_123.acf',manifest('123','Fixture \\"Game\\"','Fixture game'));
 await write(root,'steamapps/appmanifest_555.acf',manifest('555','Not installed','Fixture game','2'));
 await write(root,'steamapps/appmanifest_666.acf',manifest('667','Wrong ID','Fixture game'));
 await write(root,'steamapps/appmanifest_987.acf',manifest('987','Traversal','../profile'));
 await write(root,'steamapps/appmanifest_333.acf',manifest('333','Not present','MissingDir'));
 const {found}=await discoverSteam(root);assert.deepEqual(found.map(x=>[x.steamAppId,x.title]),[['123','Fixture "Game"']]);
 assert.equal((await discoverSteam(path.join(root,'steamapps'))).found.length,1);
 const library=[];assert.deepEqual(await importSelected(library,found,[0]),{added:1,skipped:0});
 assert.equal(library[0].steamAppId,'123');assert.equal(library[0].exe,'');
 assert.deepEqual(await importSelected(library,found,[0]),{added:0,skipped:1});
 assert.throws(()=>parseVDF('"root" { "app" "2" "APP" "3" }'),/Неоднозначные/);
 assert.throws(()=>parseVDF('"root" {'),/Некорректный/);
});
test('copy history and restore preview accurately describe new, replaced and unchanged files',async t=>{
 const f=await setup(t),{game,saves,profile,backups}=f;
 await write(saves,'slot.sav','old');await write(saves,'nested/missing.sav','missing');await write(saves,'settings.ini','equal');
 const copy=await backups.make(game,saves);
 assert.equal(copy.count,3);assert.equal((await backups.list(game)).copies.length,1);
 await write(saves,'slot.sav','now');await fs.rm(path.join(saves,'nested'),{recursive:true});await write(saves,'unrelated.sav','keep');
 const preview=await backups.preview(game,saves,copy.id);
 assert.deepEqual([preview.added,preview.replaced,preview.unchanged],[1,1,1]);
 assert.equal(await read(saves,'slot.sav'),'now');
 assert.equal(await read(saves,'unrelated.sav'),'keep');
 const result=await backups.restore(game,saves,preview);
 assert.equal(result.updated,2);
 assert.equal(await read(saves,'slot.sav'),'old');assert.equal(await read(saves,'nested/missing.sav'),'missing');assert.equal(await read(saves,'unrelated.sav'),'keep');
 assert.equal(await read(profile,`save-backups/${game}/${result.safety}/files/slot.sav`),'now');
 assert.equal((await backups.list(game)).copies.find(x=>x.id===result.safety).reason,'before-restore');
 await backups.remove(game,copy.id);assert.equal((await backups.list(game)).copies.length,1);assert.equal(await read(saves,'slot.sav'),'old');
});
test('stale preview and tampered copy never overwrite current saves',async t=>{
 const {game,saves,profile,backups}=await setup(t);
 await write(saves,'a.sav','original');const copy=await backups.make(game,saves);
 await write(saves,'a.sav','changed');const preview=await backups.preview(game,saves,copy.id);
 await write(saves,'a.sav','another');await assert.rejects(backups.restore(game,saves,preview),/изменились после/);
 const fresh=await backups.preview(game,saves,copy.id);
 await write(profile,`save-backups/${game}/${copy.id}/files/a.sav`,'tampered');
 await assert.rejects(backups.restore(game,saves,fresh),/повреждена/);
 assert.equal(await read(saves,'a.sav'),'another');assert.equal((await backups.list(game)).copies.length,1);
});
test('backup preflight rejects overlap, target conflicts and malformed entry IDs',async t=>{
 const {game,saves,base,profile,backups}=await setup(t);
 await assert.rejects(backups.make(game,base),/вне диска/);
 await assert.rejects(backups.make(game,profile),/вне диска/);
 await assert.rejects(backups.list('../escape'),/запись игры/);
 await write(saves,'sub/slot','original');const copy=await backups.make(game,saves);
 await fs.rm(path.join(saves,'sub'),{recursive:true});await write(saves,'sub','conflict');
 await assert.rejects(backups.preview(game,saves,copy.id),/пути восстановления/);
 assert.equal(await read(saves,'sub'),'conflict');
 const below=path.join(base,'outside');await fs.mkdir(below);await write(below,'private.sav','private');
 const junction=path.join(saves,'link');
 try{await fs.symlink(below,junction,process.platform==='win32'?'junction':'dir');}
 catch(e){if(e.code==='EPERM'){t.diagnostic('Fixture symlink unavailable');return;}throw e;}
 await assert.rejects(backups.make(game,saves),/ссылку|ссылкой/);assert.equal(await read(below,'private.sav'),'private');
});
test('opt-in pre-launch copies skip identical content and preserve existing copies at the limit',async t=>{
 const {game,saves,backups}=await setup(t);
 assert.deepEqual(await backups.make(game,saves,{automatic:true}),{empty:true});
 await write(saves,'slot','a');const auto=await backups.make(game,saves,{automatic:true});assert.equal(auto.reason,'launch');
 assert.deepEqual(await backups.make(game,saves,{automatic:true}),{unchanged:true});
 for(let i=1;i<MAX_SNAPSHOTS;i++){await write(saves,'slot',String(i));await backups.make(game,saves);}
 const plan=await backups.preview(game,saves,auto.id);
 await assert.rejects(backups.restore(game,saves,plan),/лимит/);
 assert.equal((await backups.list(game)).copies.length,MAX_SNAPSHOTS);assert.equal(await read(saves,'slot'),String(MAX_SNAPSHOTS-1));
});
test('editor settings preserve safe preferences and reject injected styles',()=>{
 const prefs=cleanAppearance({enabled:true,accent:'#00B1AA',opacity:70,radius:28,font:'serif',effects:0});
 assert.deepEqual(prefs,{enabled:true,accent:'#00b1aa',opacity:70,radius:28,font:'serif',effects:0});
 assert.deepEqual(updateSettings({appearance:prefs}).appearance,prefs);
 assert.deepEqual(cleanAppearance({accent:'url(file:///a)',font:'evil',opacity:-1,radius:200,effects:'0'}),cleanAppearance(null));
 assert.equal(onAccent('#000000'),'#ffffff');assert.equal(onAccent('#ffffff'),'#000000');
});
test('failure to save the protection copy leaves destination bytes untouched',async t=>{
 const {game,saves,profile,backups}=await setup(t);
 await write(saves,'slot.sav','original');const copy=await backups.make(game,saves);
 await write(saves,'slot.sav','current');const preview=await backups.preview(game,saves,copy.id);
 const readOnly=new SaveBackups(profile,{checkSpace:async folder=>{if(folder.startsWith(profile))throw Error('Backup disk unavailable');}});
 await assert.rejects(readOnly.restore(game,saves,preview),/Backup disk unavailable/);
 assert.equal(await read(saves,'slot.sav'),'current');
 assert.equal((await backups.list(game)).copies.length,1);
});
