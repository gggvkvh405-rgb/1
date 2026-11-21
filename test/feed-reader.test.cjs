const test=require('node:test');
const assert=require('node:assert/strict');
const {setImmediate:tick}=require('node:timers/promises');
const {createFeedReader}=require('../core/feed-reader.cjs');
const {presetLimits,PRESET_LIMITS,PRESETS}=require('../core/presets.cjs');
const fixture={name:'Test',downloads:[{title:'Title',uris:['https://example.org/file.zip']}]};
test('feed reader retries a transient connection on another DNS address, but not denial, 404 or invalid JSON',async()=>{
 const seen=[];
 const read=createFeedReader({pause:async()=>{},fetchJSON:async(url,opts)=>{
  const pathname=new URL(url).pathname;seen.push([pathname,opts.addressIndex,opts.max]);
  if(pathname==='/reset'&&opts.addressIndex===0)throw Object.assign(Error('aborted'),{code:'ECONNRESET'});
  if(pathname==='/denied')throw Object.assign(Error('blocked'),{statusCode:403});
  if(pathname==='/missing')throw Object.assign(Error('missing'),{statusCode:404});
  if(pathname==='/limited')throw Object.assign(Error('wait'),{statusCode:503,retryAfter:'60'});
  if(pathname==='/invalid')return {'not':'a source'};
  return fixture;
 }});
 const xatab=PRESETS.find(x=>x[0]==='xatab')[2];
 assert.equal(presetLimits(xatab).maxBytes,64*1048576);
 assert.equal(presetLimits('https://example.org/xatab.json'),PRESET_LIMITS);
 assert.equal((await read('https://example.org/reset',presetLimits(xatab))).games.length,1);
 await assert.rejects(read('https://example.org/denied'),/403/);
 await assert.rejects(read('https://example.org/missing'),/404/);
 await assert.rejects(read('https://example.org/limited'),/wait/);
 await assert.rejects(read('https://example.org/invalid'),/Hydra JSON/);
 assert.deepEqual(seen.map(([name,attempt])=>[name,attempt]),[['/reset',0],['/reset',1],['/denied',0],['/missing',0],['/limited',0],['/invalid',0]]);
 assert.equal(seen[0][2],presetLimits(xatab).maxBytes);
});

test('feed reader queues one request per host and coalesces concurrent requests to the same URL',async()=>{
 const active=new Set(), timeline=[];
 const read=createFeedReader({fetchJSON:async url=>{
  const {hostname,pathname}=new URL(url);
  assert.ok(!active.has(hostname));active.add(hostname);timeline.push(pathname);
  await tick();active.delete(hostname);return fixture;
 }});
 const a=read('https://a.example.org/a1');
 assert.equal(read('https://a.example.org/a1'),a);
 await Promise.all([a,read('https://a.example.org/a2'),read('https://b.example.org/b1')]);
 assert.deepEqual(timeline,['/a1','/b1','/a2']);
});
