const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {gzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const {discoverStore}=require('../core/store-import.cjs');
const {readPlayers,startupPlayer,playerPath,createPlayer,rememberPlayer,shortcutProfile,playerArg,shortcutArg}=require('../core/player-profiles.cjs');
const {officialUpdate,releaseInfo,verifyPackage,backupSettings,newer}=require('../core/official-build.cjs');
const {suggestGames}=require('../public/journal.js');
const {cleanPlan,planICS,playPrefs}=require('../public/play-plans.js');
const {videoMime}=require('../public/wallpaper-store.js');
const {pieceRanges,selectedFiles}=require('../core/torrent.cjs');
async function temp(t){const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'byazen-final-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
const json=(file,body)=>fs.writeFile(file,JSON.stringify(body));
test('Epic, GOG and itch.io imports require their own local metadata and keep executable targets in selected folders',async t=>{
 const root=await temp(t),games=path.join(root,'games'),meta=path.join(root,'manifests'),a=path.join(games,'epic'),b=path.join(games,'gog'),c=path.join(games,'itch'),other=path.join(root,'elsewhere');
 for(const p of [a,b,path.join(c,'.itch'),meta,other])await fs.mkdir(p,{recursive:true});
 for(const p of [a,b,c,other])await fs.writeFile(path.join(p,'fixture.exe'),'MZ fixture');
 await json(path.join(meta,'valid.item'),{DisplayName:'Epic Fixture',InstallLocation:a,LaunchExecutable:'fixture.exe'});
 await json(path.join(meta,'outside.item'),{DisplayName:'Outside',InstallLocation:other,LaunchExecutable:'fixture.exe'});
 await json(path.join(meta,'incomplete.item'),{DisplayName:'Incomplete',InstallLocation:a,bIsIncompleteInstall:true});
 await json(path.join(b,'goggame-123.info'),{name:'GOG Fixture',playTasks:[{isPrimary:true,path:'fixture.exe'}]});
 await fs.writeFile(path.join(c,'.itch','receipt.json.gz'),gzipSync(JSON.stringify({game:{title:'itch Fixture'},install:{folder:other}})));
 for(const [type,title,folder] of [['epic','Epic Fixture',a],['gog','GOG Fixture',b],['itch','itch Fixture',c]]){
  const result=await discoverStore(type,games,meta);assert.equal(result.found.length,1);assert.equal(result.found[0].title,title);assert.equal(result.found[0].file,path.join(folder,'fixture.exe'));assert.equal(result.found[0].root,games);
 }
});
test('player registry uses separate profile directories and remembers the chosen player',async t=>{
 const root=await temp(t);assert.deepEqual(await readPlayers(root),[]);const a=await createPlayer(root,' Плеер '),b=await createPlayer(root,'Other');
 await assert.rejects(createPlayer(root,'плеер'),/неповторяющееся/);
 const folder=await playerPath(root,a.id);assert.notEqual(folder,await playerPath(root,b.id));assert.notEqual(folder,root);
 rememberPlayer(root,a.id);assert.deepEqual(startupPlayer(root,[]),{id:a.id,path:folder});assert.deepEqual(startupPlayer(root,['--byazen-player=default']),{id:'default',path:root});
 assert.equal(playerArg(['--byazen-player=../escape']),'default');assert.equal(shortcutArg([`--byazen-shortcut=${a.id}`]),a.id);
 assert.equal(shortcutProfile({id:'g',profiles:[{name:'A',args:[]}]},{game:'g',signature:'{"name":"A","args":[]}'}),0);
 assert.equal(shortcutProfile({id:'g',profiles:[{name:'Changed',args:[]}]},{game:'g',signature:'{"name":"A","args":[]}'}),null);
});
test('official releases use the pinned repo and GitHub checksum; local binary verification distinguishes alterations',async t=>{
 const sha='a'.repeat(64),raw={tag_name:'v1.0.30',assets:[{name:'ByAzen-1.0.30-win-x64-portable.exe',size:100000000,digest:'sha256:'+sha}]};
 const r=await officialUpdate('1.0.9',{read:async(url,opts)=>{assert.match(url,/^https:\/\/api\.github\.com\/repos\/gggvkvh405-rgb\/1\/releases\/latest$/);assert.throws(()=>opts.validate(new URL('https://example.com')),/Неожиданный/);return raw;}});
 assert.ok(r.available);assert.equal(r.sha256,sha);assert.equal(newer('1.10.0','1.9.9'),true);assert.equal(newer('1.0.8','1.0.30'),false);assert.throws(()=>releaseInfo({...raw,prerelease:true},'1.0.9'));
 const root=await temp(t),file=path.join(root,'example.exe'),bytes=Buffer.from('fixture');await fs.writeFile(file,bytes);
 const info={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};assert.equal((await verifyPackage(file,info)).match,true);await fs.writeFile(file,'changed');assert.equal((await verifyPackage(file,info)).match,false);
 const backup=await backupSettings(root,{theme:'light'},'1.0.25','1.0.26');assert.equal(JSON.parse(await fs.readFile(path.join(root,'update-backups',backup),'utf8')).settings.theme,'light');
});
test('planning exports a calendar event without injecting fields; recommendations honor mood and mode',()=>{
 const p={id:'fixture',...cleanPlan({title:'Кооп;\nATTACH:https://example.com',game:'Game',day:'2030-05-10',time:'19:45',length:90,people:'Friend'},{now:new Date(2029,10,1)})};
 const file=planICS(p,new Date('2029-01-01T12:00:00Z'));assert.match(file,/BEGIN:VEVENT/);assert.ok(!file.includes('\r\nATTACH:'));assert.match(file,/SUMMARY:Кооп\\;\\nATTACH/);
 assert.throws(()=>cleanPlan({...p,time:'28:01'},{now:new Date(2029,10,1)}));
 const a={id:'a',title:'A',playPrefs:playPrefs({mood:'calm',mode:'online',minutes:30})},b={id:'b',title:'B',playPrefs:{mood:'action',mode:'online',minutes:10}};
 assert.deepEqual(suggestGames([a,b],[],60,'',{mood:'calm',mode:'online'}).map(r=>r.game.id),['a']);assert.equal(suggestGames([a,b],[],20,'',{mood:'calm'}).length,0);
});
test('video formats are recognized by signature, and adjacent torrent slices share pieces safely',()=>{
 assert.equal(videoMime(Buffer.from('00000014667479706d703432','hex')),'video/mp4');assert.equal(videoMime(Buffer.concat([Buffer.from('1a45dfa3','hex'),Buffer.from('webm')])),'video/webm');assert.equal(videoMime(Buffer.from('<script>')),'');
 const files=[{length:13,offset:0},{length:14,offset:13},{length:20,offset:27},{length:1,offset:47}];
 assert.deepEqual(pieceRanges(selectedFiles(files,[0,2,2]),16),[[0,2]]);assert.throws(()=>selectedFiles(files,[6]));assert.throws(()=>pieceRanges(files,0));
});
