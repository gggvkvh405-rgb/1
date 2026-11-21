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
test('when pieces stop arriving the next queued job starts and partial data is retained for retry',async t=>{
 const root=await temp(t), items=[];
 const {EventEmitter}=require('node:events');
 let attempts=0;
 class FixtureClient extends EventEmitter{
  add(){const tor=new EventEmitter();tor.files=[{path:'fixture.txt'}];tor.length=2;tor.downloaded=1;
   queueMicrotask(()=>{tor.emit('metadata');tor.emit('ready');tor.emit('download');});return tor;}
  destroy(done){done();}
 }
 const queue=new DownloadQueue(items,()=>{},{torrent:async (job,signal,persist)=>{
  if(++attempts===1)return torrentDownload(job,signal,persist,{engine:FixtureClient,storage:class {},pieceIdleMs:25});
 }});
 queue.addTorrent(magnet,root,'Stalled');const first=items[0];
 queue.addTorrent(magnet,root,'Next');const second=items[0];
 await until(()=>second.status==='done');
 assert.equal(first.status,'error');assert.match(first.error,/не поступили данные/);assert.equal(first.bytes,1);
 assert.ok((await fsp.stat(first.partial)).isDirectory());
});
test('queue discovers its seed via a real UDP tracker and verifies the saved file', {timeout:15000},async t=>{
 const root=await temp(t), {default:Client}=await import('webtorrent');
 const {createSocket}=require('node:dgram'),{once}=require('node:events');
 const tracker=createSocket('udp4');
 tracker.bind(0,'127.0.0.1');await once(tracker,'listening');
 const sender=new Client({tracker:false,dht:false,lsd:false,utPex:false,utp:false,natUpnp:false,natPmp:false});
 try{
  const content=Buffer.from('Local UDP discovery fixture\n'.repeat(6500));
  const seeded=await new Promise((resolve,reject)=>{sender.once('error',reject);sender.seed(content,{name:'tracker-fixture.txt'},resolve);});
  let announced=0;
  tracker.on('message',(msg,remote)=>{
   if(msg.length<16)return;
   const action=msg.readUInt32BE(8);
   const response=Buffer.alloc(action===0?16:26);
   response.writeUInt32BE(action);msg.copy(response,4,12,16);
   if(action===0)response.writeBigUInt64BE(1n,8);
   else if(action===1&&msg.length>=98&&msg.subarray(16,36).toString('hex')===seeded.infoHash){
    announced++;response.writeUInt32BE(60,8);response.writeUInt32BE(1,16);
    response.set([127,0,0,1],20);response.writeUInt16BE(sender.torrentPort,24);
   }else return;
   tracker.send(response,remote.port,remote.address);
  });
  class LocalFixtureClient extends Client{
   constructor(opts){super({...opts,dht:false});}
   set blocked(_){} get blocked(){return {contains:host=>host!=='127.0.0.1'};}
  }
  const uri=new URL(seeded.magnetURI), port=tracker.address().port;
  uri.searchParams.set('tr',`udp://tracker.example:${port}/announce`);
  const items=[];
  const queue=new DownloadQueue(items,()=>{},{torrent:(job,signal,persist)=>torrentDownload(job,signal,persist,{
   engine:LocalFixtureClient,metadataTimeout:4000,pieceIdleMs:4000,
   pin:async raw=>(await prepareMagnet(raw,()=>({address:'1.1.1.1',family:4}))).replace('1.1.1.1','127.0.0.1')
  })});
  queue.addTorrent(uri.href,root,'UDP fixture');
  const job=items[0];
  for(let i=0;i<100&&!['done','error'].includes(job.status);i++)await wait(75);
  assert.equal(job.status,'done',job.error);assert.ok(announced>0);
  assert.ok((await fsp.readFile(path.join(job.file,'tracker-fixture.txt'))).equals(content),'saved bytes must match the seed');
  assert.equal(queue.list()[0].bytes,content.length);
 }finally{
  await new Promise(resolve=>sender.destroy(resolve));
  await new Promise(resolve=>tracker.close(resolve));
 }
});
test('a real multi-file torrent waits for selection and publishes only verified chosen files', {timeout:16000},async t=>{
 const root=await temp(t),{default:Client}=await import('webtorrent');
 const sender=new Client({tracker:false,dht:false,lsd:false,utPex:false,utp:false,natUpnp:false,natPmp:false});
 try{
  const one=Buffer.alloc(35217,0x31),two=Buffer.alloc(290517,0x52);
  const seeded=await new Promise((resolve,reject)=>{sender.once('error',reject);sender.seed([new File([one],'chosen.bin'),new File([two],'not-chosen.bin')],{name:'fixture-multi',pieceLength:16384},resolve);});
  class LocalFixtureClient extends Client{
   constructor(opts){super({...opts,tracker:false,dht:false});}
   set blocked(_){} get blocked(){return null;}
   add(...args){const torrent=super.add(...args);torrent.once('infoHash',()=>torrent.addPeer('127.0.0.1:'+sender.torrentPort));return torrent;}
  }
  const items=[],queue=new DownloadQueue(items,()=>{},{torrent:(job,signal,persist,opts)=>torrentDownload(job,signal,persist,{...opts,engine:LocalFixtureClient,metadataTimeout:5000,pieceIdleMs:4500})});
  queue.addTorrent(seeded.magnetURI,root,'Selective',undefined,true);const job=items[0];
  for(let i=0;i<140&&job.phase!=='selecting-files'&&job.status!=='error';i++)await wait(50);
  assert.equal(job.phase,'selecting-files',job.error);assert.equal(job.bytes,0);
  const files=queue.torrentFiles(job.id,1);assert.equal(files.total,2);
  const chosen=files.rows.find(f=>path.basename(f.name)==='chosen.bin');assert.ok(chosen);
  assert.throws(()=>queue.setTorrentFiles(job.id,[-1]),/Отметьте/);
  queue.setTorrentFiles(job.id,[chosen.index]);
  for(let i=0;i<140&&!['done','error'].includes(job.status);i++)await wait(50);
  assert.equal(job.status,'done',job.error);assert.equal(job.total,one.length);assert.equal(job.bytes,one.length);
  assert.ok((await fsp.readFile(path.join(job.file,chosen.name))).equals(one));
  await assert.rejects(fsp.stat(path.join(job.file,files.rows.find(f=>f.index!==chosen.index).name)));
  await assert.rejects(fsp.stat(job.partial));
 }finally{await new Promise(resolve=>sender.destroy(resolve));}
});
