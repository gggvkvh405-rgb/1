const test=require('node:test');
const assert=require('node:assert/strict');
const {setImmediate:tick}=require('node:timers/promises');
const {parseSource}=require('../core/sources.cjs');
const {auditSources,sourceCoverage}=require('../core/source-audit.cjs');
const href='https://example.test/game.zip';
const entry=(title,uris=[href])=>({title,uris});
const parsed=parseSource({name:'Fixture',downloads:[entry('A title'),entry('!!!'),entry('No URLs',['file:///tmp/no']),entry('With one accepted URL',[href,'#bogus'])]});

test('audit counts every record and distinguishes searchable titles, accepted records and rejected links',()=>{
 assert.deepEqual(sourceCoverage(parsed),{total:4,accepted:3,skipped:1,ignoredLinks:2,browsable:3,searchable:2});
});

test('audit reads all configured sources with bounded concurrency, including disabled, without changing local records',async()=>{
 const feeds=Array.from({length:5},(_,i)=>({...parsed,id:String(i),kind:i===4?'file':'url',name:'Fixture '+i,enabled:i!==3}));
 const original=structuredClone(feeds), visited=[];
 let active=0,peak=0;
 const rows=await auditSources(feeds,async source=>{
  visited.push(source.id);peak=Math.max(peak,++active);await tick();active--;
  if(source.id==='1')throw Error('HTTP 404');
  return parseSource({name:'new data',downloads:[entry('Different title')]});
 });
 assert.equal(peak,2);assert.equal(visited.length,5);assert.deepEqual(rows.map(r=>r.status),['ok','error','ok','ok','ok']);
 assert.equal(rows[1].error,'HTTP 404');assert.equal(rows[1].cached.searchable,2);
 assert.equal(rows[3].enabled,false);assert.equal(rows[3].current.searchable,1);
 assert.equal(rows[4].kind,'file');assert.deepEqual(feeds,original);
 assert.ok(!JSON.stringify(rows).includes('example.test'));
});
