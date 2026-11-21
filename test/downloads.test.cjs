const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Readable,PassThrough}=require('node:stream');
const {setTimeout:wait}=require('node:timers/promises');
const {DownloadQueue,rangeInfo,nameFromURL}=require('../core/downloads.cjs');
function response(code,headers,data){return Object.assign(Readable.from([data]),{statusCode:code,headers});}
async function until(fn){for(let i=0;i<150;i++){if(fn())return;await wait(10);}throw Error('Queue timeout');}
async function root(t){const d=await fs.mkdtemp(path.join(os.tmpdir(),'byazen-')); t.after(()=>fs.rm(d,{recursive:true,force:true}));return d;}

test('range parser validates Content-Range and 200 fallback',()=>{
 assert.deepEqual(rangeInfo(200,{'content-length':'30'},15),{append:false,total:30});
 assert.deepEqual(rangeInfo(206,{'content-range':'bytes 10-29/30','content-length':'20'},10),{append:true,total:30});
 assert.throws(()=>rangeInfo(206,{'content-range':'bytes 9-29/30'},10));
 assert.throws(()=>rangeInfo(416,{},10));assert.equal(nameFromURL('https://example.com/CON.exe'),'download');
});
test('queue pauses an active stream, resumes with If-Range, then starts the next job',async t=>{
 const dir=await root(t), items=[], seen=[];
 const q=new DownloadQueue(items,()=>{},{fetch:async (url,{headers})=>{
  seen.push([url,headers]);
  if(url.endsWith('/second'))return {res:response(200,{'content-length':'1'},'Z')};
  if(headers.Range) return {res:response(206,{'content-range':'bytes 3-5/6','content-length':'3',etag:'"v1"'},'def')};
  const res=Object.assign(new PassThrough(),{statusCode:200,headers:{'content-length':'6',etag:'"v1"'}});res.write('abc');return {res};
 }});
 const file=path.join(dir,'first');q.add('https://example.com/first',file);const j=items[0];
 await until(()=>j.bytes===3);await q.action(j.id,'pause');await until(()=>j.status==='paused');
 await q.action(j.id,'resume');q.add('https://example.com/second',path.join(dir,'second'));
 await until(()=>items.every(x=>x.status==='done'));
 assert.deepEqual(seen[1][1],{Range:'bytes=3-', 'If-Range':'"v1"'});assert.equal(await fs.readFile(file,'utf8'),'abcdef');
 assert.equal(await fs.readFile(path.join(dir,'second'),'utf8'),'Z');assert.equal(q.list()[0].url,undefined);
});
test('retry restarts when server ignores Range and cancellation discards partial data',async t=>{
 const dir=await root(t),items=[];
 const file=path.join(dir,'file');let calls=0;
 const q=new DownloadQueue(items,()=>{},{fetch:async (_,opt)=>{
  if(++calls===2){assert.equal(opt.headers.Range,'bytes=3-');return {res:response(200,{'content-length':'6'},'UVWXYZ')};}
  const res=Object.assign(new PassThrough(),{statusCode:200,headers:{'content-length':'6',etag:'"one"'}});res.write('abc');return {res};
 }});
 q.add('https://example.com/file',file);const j=items[0];await until(()=>j.bytes===3);await q.action(j.id,'pause');await until(()=>j.status==='paused');
 await q.action(j.id,'resume');await until(()=>j.status==='done');assert.equal(await fs.readFile(file,'utf8'),'UVWXYZ');
 q.add('https://example.com/cancel',path.join(dir,'cancel'));const k=items[0];await until(()=>k.bytes===3);await q.action(k.id,'cancel');await until(()=>k.status==='canceled');await assert.rejects(fs.stat(k.partial));await assert.rejects(fs.stat(k.file));
});
test('existing files are not overwritten and queued jobs are paused on restart',async t=>{
 const dir=await root(t), items=[];const p=path.join(dir,'original');await fs.writeFile(p,'Keep');
 const q=new DownloadQueue(items,()=>{},{fetch:async ()=>({res:response(200,{'content-length':'3'},'new')})});
 q.add('https://example.com/new',p);await until(()=>items[0].status==='error');assert.equal(await fs.readFile(p,'utf8'),'Keep');
 const pre=[{status:'running'},{status:'queued'},{status:'done'}];new DownloadQueue(pre,()=>{});assert.deepEqual(pre.map(j=>j.status),['paused','paused','done']);
});
test('a game link returning a website instead of a file is not marked complete',async t=>{
 const dir=await root(t),items=[];const file=path.join(dir,'archive');
 const q=new DownloadQueue(items,()=>{},{fetch:async()=>({res:response(200,{'content-type':'Text/HTML; charset=UTF-8'},'<html>Login</html>')})});
 q.add('https://example.com/landing',file,{expectFile:true});
 await until(()=>items[0].status==='error');
 assert.match(items[0].error,/страницу вместо файла/);await assert.rejects(fs.stat(file));
 q.add('https://example.com/landing',path.join(dir,'manual.html'));
 await until(()=>items[0].status==='done');
 assert.equal(await fs.readFile(path.join(dir,'manual.html'),'utf8'),'<html>Login</html>');
});
