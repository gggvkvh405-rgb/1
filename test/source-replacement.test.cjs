const test=require('node:test');
const assert=require('node:assert/strict');
const {setImmediate:tick}=require('node:timers/promises');
const {commitReplacement}=require('../core/source-replacement.cjs');
const {createPresetSync}=require('../core/presets.cjs');
const oldURL='https://example.test/old.json', newURL='https://example.test/new.json';
const games=[{title:'A game',links:['https://example.test/test.zip']}];
const setup=()=>({id:'known',name:'Old',presetName:'Old',url:oldURL,kind:'url',enabled:false,games,syncError:'HTTP 404',updated:''});
const draft=(old,more={})=>({replacementFor:old,name:'New',url:newURL,kind:'url',games,...more});

test('replacement requires a valid preview for the current source, preserves ID and toggle, and refuses empty or duplicate lists',()=>{
 const old=setup(), other={id:'another',kind:'url',url:newURL}, list=[old,other];
 assert.throws(()=>commitReplacement(list,old.id,draft(old)),/уже добавлен/);
 assert.throws(()=>commitReplacement(list,old.id,draft(old,{games:[]})),/нет записей/);
 assert.equal(list[0],old);
 const local=draft(old,{kind:'file',url:undefined,file:'fixture.json'});
 const replaced=commitReplacement(list,old.id,local);
 assert.equal(replaced.id,old.id);assert.equal(replaced.enabled,false);assert.equal(replaced.file,'fixture.json');
 assert.equal(replaced.presetURL,oldURL);assert.equal(replaced.syncError,undefined);
 assert.throws(()=>commitReplacement(list,old.id,local),/изменился/);
});
test('a stale remote refresh cannot overwrite a confirmed replacement',async()=>{
 const old={...setup(),enabled:true}, list=[old];let finish,calls=0;
 const sync=createPresetSync(list,async()=>{calls++;return new Promise(resolve=>{finish=resolve;});},()=>{});
 const pending=sync.refresh(old);await tick();
 const updated=commitReplacement(list,old.id,draft(old));
 assert.equal(sync.loading(old.id),false);
 finish({name:'From stale fetch',games:[]});await pending;
 assert.equal(list[0],updated);assert.equal(updated.games.length,1);assert.equal(calls,1);
});
test('delayed reload only targets enabled managed URL lists with transient errors',async()=>{
 const feeds=[{...setup(),id:'t',enabled:true,transientFailure:true},{...setup(),id:'permanent',enabled:true,transientFailure:false},{...setup(),id:'disabled',transientFailure:true},{...setup(),id:'file',enabled:true,kind:'file',transientFailure:true}];let calls=0;
 const sync=createPresetSync(feeds,async()=>{calls++;return {name:'Updated',games};},()=>{});
 await sync.retryTransient();assert.equal(calls,1);assert.equal(feeds[0].transientFailure,false);assert.equal(feeds[1].syncError,'HTTP 404');
});
