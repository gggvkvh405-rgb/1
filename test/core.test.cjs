const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSource,sourceLink}=require('../core/sources.cjs');
const {steamQuery,parseResults,officialProduct}=require('../core/steam.cjs');
const {searchSources,availability,updateSettings}=require('../core/state.cjs');
const {prepareLaunch,cleanGame}=require('../core/library.cjs');
const {webURL,isPublic}=require('../core/net.cjs');

test('Hydra: valid links, deduplication, rejected links and preview statistics',()=>{
 const mag='magnet:?xt=urn:btih:'+'a'.repeat(40);
 const r=parseSource('\ufeff'+JSON.stringify({name:'  Local ',downloads:[{title:'Cyberpunk™ 2077',uris:['https://example.org/a','https://example.org/a',mag,'javascript:evil()'],fileSize:'1 GB',uploadDate:'2025-01-02'},{title:'Broken',uris:['file:///C:/test']},null]}));
 assert.equal(r.name,'Local');assert.equal(r.skipped,2);assert.equal(r.ignoredLinks,2);
 assert.deepEqual(r.games[0].links,['https://example.org/a',mag]);
 assert.equal(r.games[0].date,'2025-01-02T00:00:00.000Z');
 assert.throws(()=>sourceLink('magnet:?dn=missing'));assert.throws(()=>parseSource('{}'),/Hydra/);
});
test('source search respects enabled state, pagination, exact normalized title and distinct source matches',()=>{
 const g={title:'Cyberpunk™ 2077',links:['https://example.org/test']};
 const s=[{id:'a',enabled:true,name:'One',games:Array(18).fill(g)},{id:'b',enabled:false,name:'Off',games:[g]}];
 const r=searchSources(s,'cyber',2);assert.equal(r.total,18);assert.equal(r.games[0].index,16);assert.equal(r.games.length,2);
 assert.deepEqual(availability(s,['Cyberpunk 2077','Cyberpunk']),[{title:'Cyberpunk 2077',sources:['One']},{title:'Cyberpunk',sources:[]}]);
});
test('HTTP URLs reject credentials and local networking is blocked before requests',()=>{
 assert.throws(()=>webURL('https://user:pw@example.com/'));assert.throws(()=>webURL('javascript:alert(1)'));
 for(const ip of ['127.0.0.1','10.0.0.1','100.64.0.1','169.254.169.254','::1','::ffff:127.0.0.1','fe80::1234','fc00::1'])assert.equal(isPublic(ip),false,ip);
 assert.equal(isPublic('1.1.1.1'),true);
});
test('Steam filters translate to a bounded, encoded page request',()=>{
 const {u,page}=steamQuery({term:'  A&B ',page:3,category1:'998',tags:'19,122',os:'win',maxprice:'20',specials:true,sort_by:'Price_ASC',cc:'US'});
 assert.equal(u.origin,'https://store.steampowered.com');assert.equal(page,3);
 for(const [k,v] of Object.entries({term:'A&B', start:'48',count:'24',category1:'998',tags:'19,122',os:'win',maxprice:'20',specials:'1',sort_by:'Price_ASC',cc:'US'}))assert.equal(u.searchParams.get(k),v);
 const bad=steamQuery({page:Infinity,tags:'19&s=bad',os:'dos',cc:'ZZ',specials:'1'}).u.searchParams;
 assert.equal(bad.get('cc'),'DE');assert.equal(bad.get('start'),'0');for(const p of ['tags','os','specials'])assert.equal(bad.has(p),false);
});
test('Steam output uses official product URLs and observed prices only',()=>{
 const r=parseResults({total_count:'2',results_html:`<a class="search_result_row" href="https://store.steampowered.com/app/1091500/Name/?snr=X"><span class="title">Cyberpunk &amp; Games</span><div class="search_capsule"><img src="https://shared.fastly.steamstatic.com/x.jpg"></div><div class="discount_pct">-50%</div><div class="discount_final_price">30,00€</div></a><a class="search_result_row" href="https://store.steampowered.com/sub/2"><span class="title">No price</span></a><a class="search_result_row" href="https://example.com/app/1/"><span class="title">Fake</span></a>`},2);
 assert.equal(r.games.length,2);assert.equal(r.games[0].price,'30,00€');assert.equal(r.games[0].title,'Cyberpunk & Games');assert.equal(r.games[0].discount,'-50%');assert.equal(r.games[1].price,'');assert.equal(r.games[0].url,'https://store.steampowered.com/app/1091500/');assert.equal(officialProduct('https://store.steampowered.com.example.org/app/4'),null);
});
test('Windows launch validates paths and uses the argument array without a shell',async()=>{
 const options={platform:'win32',stat:async()=>({isFile:()=>true})};
 const args=['--name','My Player','& echo unsafe'];
 const launch=await prepareLaunch('C:\\Program Files\\Game\\game.EXE',args,options);
 assert.equal(launch.options.shell,false);assert.equal(launch.options.cwd,'C:\\Program Files\\Game');assert.deepEqual(launch.args,args);
 for (const exe of ['C:\\Game.cmd','\\\\server\\share\\game.exe','game.exe'])await assert.rejects(prepareLaunch(exe,[],options));
 await assert.rejects(prepareLaunch('C:\\game.exe',['bad\0arg'],options));
 await assert.rejects(prepareLaunch('C:\\missing.exe',[],{...options,stat:async()=>{throw Error('no file');}}));
 await assert.rejects(prepareLaunch('C:\\game.exe',[],{...options,platform:'linux'}));
 assert.deepEqual(cleanGame({title:' A ',collections:['RPG','RPG',' '],profiles:[{name:'Test',args}]}).collections,['RPG']);
 assert.throws(()=>cleanGame({title:'A',profiles:[{name:'Hi',args:[2]}]}));
});
test('settings accept only 100 generated variants and classic themes',()=>{
 assert.equal(updateSettings({theme:'theme-99',motion:true}).theme,'theme-99');assert.equal(updateSettings({theme:'theme-100'}).theme,'dark');
 assert.equal(updateSettings({theme:'oled',region:'xx'}).region,'DE');
});
