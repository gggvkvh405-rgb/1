const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {PRESETS,PRESET_LIMITS,installPresets,createPresetSync}=require('../core/presets.cjs');
const {readState,saveState,sourceMatches}=require('../core/state.cjs');
const {parseSource}=require('../core/sources.cjs');
const {setImmediate:tick}=require('node:timers/promises');

test('18 exact HTTPS preset URLs persist across restarts and preserve earlier choices',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byazen-presets-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const file=path.join(tmp,'state.json'), data=readState(file);
 const url='https://raw.githubusercontent.com/Shisuiicaro/source/main/shisuyssource.json';
 const existing={id:'original',kind:'url',url,enabled:false,games:[{title:'Cached'}],updated:'original-stamp'};
 data.sources.push(existing);
 assert.equal(installPresets(data),true);
 assert.equal(data.sources.length,18);
 assert.equal(new Set(PRESETS.map(x=>x[2])).size,18);
 assert.ok(PRESETS.every(([, ,u])=>new URL(u).protocol==='https:'));
 assert.equal(data.sources.filter(s=>s.enabled).length,17);
 assert.equal(existing.enabled,false);assert.equal(existing.games[0].title,'Cached');assert.equal(existing.updated,'original-stamp');
 data.sources.splice(data.sources.findIndex(s=>s.id==='preset-freetp'),1);
 saveState(file,data);const reopened=readState(file);
 assert.equal(installPresets(reopened),false);
 assert.equal(reopened.sources.length,17);assert.equal(reopened.sources.find(s=>s.id==='original').enabled,false);
});
test('sync is bounded, skips disabled sources, exposes failures and keeps cached data',async()=>{
 const sources=PRESETS.slice(0,6).map(([id,presetName,url],i)=>({id,presetName,url,enabled:i!==5,games:[{title:'Cached',links:['https://example.test/x']}]}));
 let active=0,peak=0,saves=0,calls=0;
 const sync=createPresetSync(sources,async(url,limits)=>{
  assert.equal(limits,PRESET_LIMITS);calls++;peak=Math.max(peak,++active);await tick();active--;
  if(url===sources[0].url)throw Error('HTTP 404');
  return parseSource({name:'fixture',downloads:[{title:'A verified fixture',uris:['https://example.test/file']}]});
 },()=>{saves++;});
 const working=sync.startup();assert.equal(sync.loading(sources[0].id),true);
 await working;
 assert.equal(peak,2);assert.equal(saves,5);assert.equal(calls,5);
 assert.equal(sources[0].syncError,'HTTP 404');assert.equal(sources[0].games[0].title,'Cached');
 assert.equal(sources[1].name,sources[1].presetName);assert.ok(sources[1].updated);
 assert.equal(sourceMatches(sources,'A verified fixture').length,4);
 await sync.startup();assert.equal(calls,6); // Only the failed feed gets retried.
});
test('configured feed accepts more records without raising the custom import limit',()=>{
 const input={name:'large',downloads:Array(10001).fill({title:'Fixture',uris:['https://example.test/file']})};
 assert.throws(()=>parseSource(input),/10000/);
 assert.equal(parseSource(input,PRESET_LIMITS).games.length,10001);
 assert.throws(()=>parseSource({name:'Feed directory',sources:[]},PRESET_LIMITS),/Hydra JSON/);
});
test('the known OnlineFix feed is enabled once by default, prioritized and can be restored explicitly',async()=>{
 const {connectOnlineFix,isPrimaryOnlineFix,prioritizeOnlineFix}=require('../core/presets.cjs');
 const data={sources:[]};installPresets(data);
 const online=data.sources.find(isPrimaryOnlineFix);
 assert.equal(online.enabled,true);
 assert.equal(prioritizeOnlineFix(data.sources)[0],online);
 assert.notEqual(data.sources[0],online);
 const calls=[], sync=createPresetSync(data.sources,async url=>{calls.push(url);return {name:'Fixture',games:[{title:'Fixture',links:['https://example.test/x']}]};},()=>{});
 await sync.startup();assert.equal(calls[0],online.url);
 const cached=online.games;
 online.enabled=false;
 assert.equal(sourceMatches(prioritizeOnlineFix(data.sources),'Fixture').some(s=>s.id===online.id),false);
 assert.equal(connectOnlineFix(data.sources),online);
 assert.equal(online.games,cached);assert.equal(online.enabled,true);
 assert.equal(sourceMatches(prioritizeOnlineFix(data.sources),'Fixture')[0].id,online.id);
 const other={...online,url:'https://example.test/replacement.json'};
 data.sources[data.sources.indexOf(online)]=other;
 const restored=connectOnlineFix(data.sources);
 assert.notEqual(restored.id,online.id);assert.equal(restored.url,online.url);
 assert.equal(connectOnlineFix(data.sources),restored);
 assert.equal(data.sources.filter(isPrimaryOnlineFix).length,1);
 assert.equal(data.sources.find(s=>s.id===other.id),other);
});
test('a successful HTTP response with an empty list does not replace a cached feed',async()=>{
 const cached=[{title:'Cached'}], source={kind:'url',presetName:'Feed',games:cached,enabled:true,updated:'before'};
 const sync=createPresetSync([source],async()=>({name:'Empty',games:[]}),()=>{});
 await assert.rejects(sync.refresh(source),/нет записей/);
 assert.equal(source.games,cached);assert.equal(source.updated,'before');assert.match(source.syncError,/нет записей/);
});
