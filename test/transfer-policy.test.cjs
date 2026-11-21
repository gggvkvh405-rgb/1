const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {Readable,PassThrough}=require('node:stream');
const {setTimeout:wait}=require('node:timers/promises');
const {DownloadQueue}=require('../core/downloads.cjs');
const {transferOptions,inDownloadWindow,ensureSpace,issue,TransferMeter,throttle}=require('../core/transfer-policy.cjs');
const {checkDownload}=require('../core/download-check.cjs');
const {updateSettings}=require('../core/state.cjs');
const {cleanGame}=require('../core/library.cjs');
const local=(h,m=0)=>new Date(2026,10,20,h,m);
const sha=data=>createHash('sha256').update(data).digest('hex');
const response=(body,headers={})=>({res:Object.assign(Readable.from([body]),{statusCode:200,headers:{'content-length':String(Buffer.byteLength(body)),...headers}})});
async function until(fn){for(let i=0;i<180;i++){if(fn())return;await wait(10);}throw Error('Queue timeout');}
async function root(t){const d=await fs.mkdtemp(path.join(os.tmpdir(),'byazen-queue-v2-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));return d;}

test('transfer options have strict bounds, and a nightly window wraps through midnight',()=>{
 assert.deepEqual(transferOptions({parallel:5,receiveKiB:-1,sendKiB:0,from:'25:00',until:'6:00',schedule:'yes'}),transferOptions());
 const o=transferOptions({schedule:true,from:'22:00',until:'03:00'});
 for(const h of [0,2,22,23])assert.equal(inDownloadWindow(o,local(h)),true);
 for(const h of [3,4,21])assert.equal(inDownloadWindow(o,local(h)),false);
 assert.equal(inDownloadWindow({...o,from:'08:00',until:'13:00'},local(12,59)),true);
 assert.equal(inDownloadWindow({...o,from:'08:00',until:'13:00'},local(13)),false);
 assert.equal(inDownloadWindow({...o,from:'03:00'},local(18)),true);
});
test('transfer meter samples bytes, gives an ETA, decays to zero, and ignores rebasing at resume',()=>{
 const meter=new TransferMeter(100,0);
 assert.deepEqual(meter.read(100,400,100),{speed:0,eta:null,trend:[]});
 assert.deepEqual(meter.read(200,400,1000),{speed:100,eta:2,trend:[100]});
 assert.equal(meter.read(200,400,1500).speed,100);
 for(let t=2;t<14;t++)meter.read(200,400,t*1000);
 assert.equal(meter.read(200,400,14000).speed,0);
 assert.deepEqual(meter.read(0,400,14300),{speed:0,eta:null,trend:[]});
});
test('HTTP pacing uses previous deadline without building a burst and receives the abort signal',async()=>{
 const signal=new AbortController().signal, calls=[];let tick=100;
 const limit=throttle(1024,signal,()=>tick,async(ms,_unused,opts)=>calls.push([ms,opts.signal]));
 await limit(512);tick=600;await limit(256);tick=5000;await limit(256);
 assert.deepEqual(calls.map(c=>c[0]),[500,250,250]);assert.ok(calls.every(c=>c[1]===signal));
});
test('parallel limit is enforced and raising a queued item does not stop the running transfers',async t=>{
 const dir=await root(t),items=[],started=[],streams=new Map();
 const q=new DownloadQueue(items,()=>{},{options:{parallel:2},fetch:async url=>{
  const name=new URL(url).pathname.slice(1);started.push(name);
  const res=Object.assign(new PassThrough(),{statusCode:200,headers:{'content-length':'1'}});streams.set(name,res);return {res};
 }});
 t.after(()=>{for(const res of streams.values())res.destroy();});
 for(const name of ['A','B','C','D'])q.add(`https://example.test/${name}`,path.join(dir,name));
 await until(()=>started.length===2);assert.deepEqual(started,['A','B']);
 const d=items.find(j=>j.title==='D');await q.action(d.id,'first');
 assert.deepEqual(q.list().filter(j=>j.position).map(j=>j.title),['D','C']);
 streams.get('A').end('a');await until(()=>streams.has('D'));assert.deepEqual(started,['A','B','D']);
 streams.get('B').end('b');await until(()=>streams.has('C'));
 streams.get('C').end('c');streams.get('D').end('d');await until(()=>items.every(j=>j.status==='done'));
 assert.equal(await fs.readFile(d.file,'utf8'),'d');assert.ok(d.completedAt);
});
test('outside the schedule it waits, pauses at the boundary without losing bytes and resumes next window',async t=>{
 const dir=await root(t),items=[];let now=local(21),calls=0;const ranges=[];
 const q=new DownloadQueue(items,()=>{},{now:()=>now,options:{schedule:true,from:'22:00',until:'03:00'},fetch:async(_,opt)=>{
  ranges.push(opt.headers.Range);
  if(++calls===1){const res=Object.assign(new PassThrough(),{statusCode:200,headers:{'content-length':'4',etag:'"one"'}});res.write('ab');return {res};}
  return {res:Object.assign(Readable.from(['cd']),{statusCode:206,headers:{'content-range':'bytes 2-3/4','content-length':'2',etag:'"one"'}})};
 }});
 t.after(()=>q.dispose());
 q.add('https://example.test/scheduled',path.join(dir,'scheduled'));const job=items[0];
 assert.equal(job.status,'queued');assert.equal(calls,0);
 now=local(22);q.pump();await until(()=>job.bytes===2);
 now=local(3);q.pump();await until(()=>job.status==='queued');
 assert.equal(await fs.readFile(job.partial,'utf8'),'ab');
 now=local(23);q.pump();await until(()=>job.status==='done');
 assert.deepEqual(ranges,[undefined,'bytes=2-']);assert.equal(await fs.readFile(job.file,'utf8'),'abcd');
});
test('preflight uses available bytes, skips unsupported filesystems, and leaves no partial file if full',async t=>{
 await ensureSpace('/x',10,async()=>({bsize:4n,bavail:3n}));
 await assert.rejects(ensureSpace('/x',13,async()=>({bsize:4n,bavail:3n})),{code:'ENOSPC'});
 await ensureSpace('/x',10,async()=>{throw Object.assign(Error('unsupported'),{code:'ENOSYS'});});
 const dir=await root(t),items=[],q=new DownloadQueue(items,()=>{},{fetch:async()=>response('file'),space:async()=>{throw issue('ENOSPC');}});
 q.add('https://example.test/private?secret=token',path.join(dir,'private.dat'),{origin:'Private title'});
 await until(()=>items[0].status==='error');const job=items[0];
 assert.equal(job.errorCode,'ENOSPC');await assert.rejects(fs.stat(job.partial));
 assert.doesNotMatch(JSON.stringify(q.report(job.id)),/private|token|\.dat|example/i);
});
test('an expected SHA-256 is checked before publication with success and mismatch paths',async t=>{
 const dir=await root(t),items=[],q=new DownloadQueue(items,()=>{},{fetch:async()=>response('bytes')});
 q.add('https://example.test/f',path.join(dir,'good'),{sha256:sha('bytes')});
 const pass=items[0];await until(()=>pass.status==='done');assert.equal(pass.verified,true);assert.equal(await fs.readFile(pass.file,'utf8'),'bytes');
 q.add('https://example.test/f',path.join(dir,'bad'),{sha256:sha('different')});
 const fail=items[0];await until(()=>fail.status==='error');assert.equal(fail.errorCode,'SHA_MISMATCH');
 await assert.rejects(fs.stat(fail.file));await assert.rejects(fs.stat(fail.partial));
 assert.throws(()=>q.add('https://example.test/f',path.join(dir,'malformed'),{sha256:'wrong'}),/64/);
});
test('self-check reuses the real writer, distinguishes network and integrity errors, and cleans up',async t=>{
 const dir=await root(t),sample={url:'https://example.test/fixture',size:4,sha256:sha('test')};
 assert.deepEqual(await checkDownload(dir,{sample,fetch:async()=>response('test')}),{ok:true,received:4,verified:true});
 assert.equal((await checkDownload(dir,{sample,fetch:async()=>response('x')})).code,'TEST_SIZE');
 assert.equal((await checkDownload(dir,{sample,fetch:async()=>response('fail')})).stage,'integrity');
 assert.equal((await checkDownload(dir,{sample,fetch:async()=>{throw Object.assign(Error('reset'),{code:'ECONNRESET'});}})).stage,'network');
 assert.equal((await checkDownload(path.join(dir,'missing'),{sample})).stage,'disk');
 assert.deepEqual(await fs.readdir(dir),[]);
});
test('personalization and game fields validate new persisted data',()=>{
 const settings=updateSettings({favoriteThemes:['theme-1','dark','evil','theme-1','scene-anime-train'],startSection:'downloads'});
 assert.deepEqual(settings.favoriteThemes,['theme-1','scene-anime-train']);assert.equal(settings.startSection,'downloads');
 assert.equal(updateSettings({startSection:'unknown'}).startSection,'home');
 const game=cleanGame({title:'Fixture',notes:' Test note ',rating:8,progress:'finished'});
 assert.deepEqual([game.notes,game.rating,game.progress],['Test note',8,'finished']);
 const invalid=cleanGame({title:'Fixture',notes:' '.repeat(100)+'x'.repeat(4200),rating:11,progress:'wrong'});
 assert.deepEqual([invalid.notes.length,invalid.rating,invalid.progress],[4000,0,'']);
});
