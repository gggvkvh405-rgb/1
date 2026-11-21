const test=require('node:test');
const assert=require('node:assert/strict');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:wait}=require('node:timers/promises');
const {filePlan,prepareMagnet,magnetV1,torrentDownload}=require('../core/torrent.cjs');
const {DownloadQueue}=require('../core/downloads.cjs');
const magnet='magnet:?xt=urn:btih:'+'a'.repeat(40);
async function temp(t){const d=await fsp.mkdtemp(path.join(os.tmpdir(),'byazen-torrent-'));t.after(()=>fsp.rm(d,{recursive:true,force:true}));return d;}
async function until(status){for(let i=0;i<100;i++){if(status())return;await wait(10);}throw Error('Timeout');}
test('magnet accepts v1, strips web seeds and pins only public UDP trackers',async()=>{
 const params=new URL(magnet);
 params.searchParams.append('tr','https://tracker.example/announce');
 params.searchParams.append('tr','udp://private.example:80/announce');
 params.searchParams.append('tr','udp://public.example:6969/announce');
 params.searchParams.append('ws','https://127.0.0.1/index');
 params.searchParams.append('xs','https://127.0.0.1/metadata');
 const uri=new URL(await prepareMagnet(params.href,host=>({address:host==='private.example'?'127.0.0.1':'1.1.1.1',family:4})));
 assert.deepEqual([...uri.searchParams.keys()],['xt','tr']);
 assert.equal(uri.searchParams.get('tr'),'udp://1.1.1.1:6969/announce');
 assert.throws(()=>magnetV1('magnet:?xt=urn:btmh:1220'+'a'.repeat(64)),/v1/);
});
test('torrent metadata cannot write outside the selected directory or overwrite conflicting paths',()=>{
 assert.equal(filePlan([{path:'work/readme.txt'}])[0].relative,path.join('work','readme.txt'));
 for(const name of ['../x','dir/../../x','C:\\x','dir\\CON.txt','dir/abc.','/absolute','x/..','dir/a:b'])assert.throws(()=>filePlan([{path:name}]));
 for(const names of [['a','a/b'],['a/b','A'],['a','A']])assert.throws(()=>filePlan(names.map(path=>({path}))));
});
test('torrent items share pause, resume and cancellation with HTTP queue without running a file',async t=>{
 const root=await temp(t), items=[];
 const queue=new DownloadQueue(items,()=>{},{torrent:async(j,signal)=>{
  await fsp.mkdir(j.partial,{recursive:true});await fsp.writeFile(path.join(j.partial,'block'),'kept');j.bytes=4;
  signal.throwIfAborted();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 }});
 queue.addTorrent(magnet,root,'Game');const j=items[0];
 await until(()=>j.bytes===4);await queue.action(j.id,'pause');await until(()=>j.status==='paused');
 assert.equal(await fsp.readFile(path.join(j.partial,'block'),'utf8'),'kept');
 await queue.action(j.id,'resume');await queue.action(j.id,'cancel');await until(()=>j.status==='canceled');
 await assert.rejects(fsp.stat(j.partial));assert.equal(j.bytes,0);
});
test('embedded engine receives and saves a verified torrent from a local test peer', {timeout:16000},async t=>{
 const root=await temp(t), {default:Client}=await import('webtorrent');
 const sender=new Client({tracker:false,dht:false,lsd:false,utPex:false,utp:false,natUpnp:false,natPmp:false});
 try{
  const content=Buffer.from('ByAzen torrent integration fixture. '.repeat(1100));
  const seeded=await new Promise((resolve,reject)=>{sender.once('error',reject);sender.seed(content,{name:'fixture.txt'},resolve);});
  class LocalFixtureClient extends Client{
   constructor(opts){super({...opts,tracker:false,dht:false});}
   set blocked(_){} get blocked(){return null;} // Loopback is deliberately allowed only in this integration test.
   add(...args){const torrent=super.add(...args);torrent.once('infoHash',()=>torrent.addPeer('127.0.0.1:'+sender.torrentPort));return torrent;}
  }
  const job={url:seeded.magnetURI,partial:path.join(root,'private'),file:path.join(root,'result')};
  await torrentDownload(job,AbortSignal.timeout(12000),()=>{},{engine:LocalFixtureClient});
  assert.ok((await fsp.readFile(path.join(job.file,'fixture.txt'))).equals(content));
  assert.equal(job.bytes,content.length);assert.equal(job.total,content.length);
  await assert.rejects(fsp.stat(job.partial));
 }finally{await new Promise(resolve=>sender.destroy(resolve));}
});
test('tracker budget skips unsupported and duplicate entries and DNS pins to the IPv4 transport',async()=>{
 const u=new URL(magnet), calls=[];
 for(let i=0;i<13;i++)u.searchParams.append('tr',`https://unsupported.example/${i}`);
 u.searchParams.append('tr','udp://dual.example:6969/a');
 u.searchParams.append('tr','udp://dual.example:6969/b');
 const result=await prepareMagnet(u.href,(...args)=>{
  calls.push(args);return args[2]===4?{family:4,address:'1.1.1.1'}:{family:6,address:'2606:4700:4700::1111'};
 });
 assert.deepEqual(calls,[['dual.example',0,4]]);
 assert.deepEqual(new URL(result).searchParams.getAll('tr'),['udp://1.1.1.1:6969/announce']);
});
test('explicit magnet peers accept only bounded public numeric endpoints',async()=>{
 const u=new URL(magnet);
 for(const addr of ['8.8.8.8:6000','[2606:4700:4700::1111]:443','8.8.8.8:06000','127.0.0.1:80','[::ffff:10.0.0.1]:80','example.org:80','010.001.001.001:80','1.1.1.1:65536'])u.searchParams.append('x.pe',addr);
 const parsed=(await import('magnet-uri')).default(await prepareMagnet(u.href));
 assert.deepEqual(parsed.peerAddresses,['8.8.8.8:6000','[2606:4700:4700::1111]:443']);
});
test('download reports whether a handshake occurred before metadata timed out',async t=>{
 const {EventEmitter}=require('node:events'), root=await temp(t);
 for(const connected of [false,true]){
  class FixtureClient extends EventEmitter{
   add(){const torrent=new EventEmitter();if(connected)queueMicrotask(()=>torrent.emit('wire'));return torrent;}
   destroy(done){done();}
  }
  const job={url:magnet,partial:path.join(root,String(connected))}, phases=[];
  const transfer=torrentDownload(job,AbortSignal.timeout(500),()=>phases.push(job.phase),{engine:FixtureClient,storage:class {},metadataTimeout:15});
  await Promise.all([assert.rejects(transfer,connected?/не передали метаданные/:/Не удалось подключиться к участникам/),wait(30)]);
  assert.deepEqual(phases,connected?['metadata','waiting-metadata']:['metadata']);
 }
});
