const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {pipeline}=require('node:stream/promises');
const {isPublic,publicAddress}=require('./net.cjs');
const {sourceLink}=require('./sources.cjs');

const reserved=/^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i;
function magnetV1(raw){
 const u=new URL(sourceLink(raw));
 const xt=u.searchParams.getAll('xt').find(x=>/^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(x));
 if(!xt)throw Error('Поддерживаются magnet-ссылки BitTorrent v1 и гибридные v1/v2; у этой ссылки нет v1-хеша.');
 return {xt,trackers:u.searchParams.getAll('tr').slice(0,12)};
}
async function prepareMagnet(raw, lookup=publicAddress){
 const {xt,trackers}=magnetV1(raw);
 const base=`magnet:?xt=${xt.toLowerCase()}`;
 const approved=await Promise.all(trackers.map(async raw=>{
  try {
   const tracker=new URL(raw);
   if(tracker.protocol!=='udp:'||!tracker.port||tracker.username||tracker.password)return '';
   const {address,family}=await lookup(tracker.hostname);
   if(!isPublic(address))return '';
   return `udp://${family===6?'['+address+']':address}:${tracker.port}${tracker.pathname||'/announce'}`;
  }catch{return '';}
 }));
 return base+[...new Set(approved.filter(Boolean))].map(tracker=>'&tr='+encodeURIComponent(tracker)).join('');
}
function filePlan(files){
 if(!files.length||files.length>15000)throw Error('Некорректное количество файлов в торренте.');
 const named=new Set(), dirs=new Set();
 return files.map(file=>{
  const pieces=typeof file.path==='string'?file.path.split(/[\\/]/):[];
  if(!pieces.length||pieces.length>32||pieces.some(p=>!p||p==='.'||p==='..'||p.length>160||/[<>:"|?*\x00-\x1f]|[ .]$/.test(p)||reserved.test(p)))throw Error('Торрент содержит недопустимый путь или имя файла.');
  const ids=pieces.map(x=>x.toLowerCase()), key=ids.join('/');
  if(named.has(key)||dirs.has(key))throw Error('Торрент содержит конфликтующие пути.');
  for(let i=1;i<ids.length;i++){
   const dir=ids.slice(0,i).join('/');
   if(named.has(dir))throw Error('Торрент содержит конфликтующие пути.');
   dirs.add(dir);
  }
  named.add(key);
  return {file,relative:path.join(...pieces)};
 });
}
async function publish(job,files,signal){
 const plan=filePlan(files), stage=path.join(job.partial,'payload');
 await fsp.rm(stage,{recursive:true,force:true});
 await fsp.mkdir(stage);
 try{
  for(const {file,relative} of plan){
   signal.throwIfAborted();
   const dest=path.join(stage,relative);
   await fsp.mkdir(path.dirname(dest),{recursive:true});
   if(file.length===0)await fsp.writeFile(dest,'',{flag:'wx'});
   else await pipeline(file.createReadStream(),fs.createWriteStream(dest,{flags:'wx'}),{signal});
  }
  signal.throwIfAborted();
  const current=await fsp.lstat(job.file).catch(e=>{if(e.code!=='ENOENT')throw e;});
  if(current)throw Error('Папка назначения уже существует.');
  await fsp.rename(stage,job.file);
 }finally{await fsp.rm(stage,{recursive:true,force:true});}
}
async function torrentDownload(job,signal,persist,{engine,storage,pin=prepareMagnet}={}){
 const uri=await pin(job.url);
 signal.throwIfAborted();
 const Client=engine||(await import('webtorrent')).default;
 const Store=storage||(await import('fs-chunk-store')).default;
 const info=await fsp.lstat(job.partial).catch(e=>{if(e.code!=='ENOENT')throw e;});
 if(info&&!info.isDirectory())throw Error('Небезопасная временная папка.');
 if(!info)await fsp.mkdir(job.partial,{mode:0o700});
 const blocks=path.join(job.partial,'blocks.bin');
 const previous=await fsp.lstat(blocks).catch(e=>{if(e.code!=='ENOENT')throw e;});
 if(previous&&!previous.isFile())throw Error('Небезопасный временный файл.');
 // The chunk store never touches paths provided by peers. Valid paths are restored only after verification.
 class FlatStore extends Store{constructor(piece,{length}){super(piece,{path:blocks,length});}}
 signal.throwIfAborted();
 const client=new Client({tracker:{},natUpnp:false,natPmp:false,lsd:false,utPex:false,webSeeds:false,utp:false,maxConns:35,seedOutgoingConnections:false,uploadLimit:128*1024});
 client.blocked={contains:host=>!isPublic(host)};
 let cleanupWait=null, torrent, finished=false, failure;
 const onFail=e=>{failure?.(e);};
 client.on('error',onFail);
 function track(){
  if(typeof torrent?.length==='number'&&torrent.length>0){job.total=torrent.length;job.bytes=Math.min(job.total,torrent.downloaded||0);}
 }
 try{
  job.phase='metadata';persist();
  await new Promise((resolve,reject)=>{
   failure=reject;
   const abort=()=>reject(signal.reason);
   signal.addEventListener('abort',abort,{once:true});
   const timeout=setTimeout(()=>reject(Error('Не удалось найти метаданные. Проверьте ссылку и наличие участников.')),90000);
   timeout.unref();
   cleanupWait=()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);};
   if(signal.aborted){abort();return;}
   torrent=client.add(uri,{store:FlatStore,storeCacheSlots:8});
   torrent.on('error',onFail);
   torrent.once('metadata',()=>{
    clearTimeout(timeout);
    try{filePlan(torrent.files);job.phase='pieces';track();persist();}
    catch(e){reject(e);}
   });
   torrent.on('download',track);
   torrent.once('done',resolve);
  });
  signal.throwIfAborted();track();
  job.phase='saving';persist();
  await publish(job,torrent.files,signal);
  finished=true;
 }finally{
  cleanupWait?.();failure=null;
  await new Promise(resolve=>{if(client.destroyed)resolve();else client.destroy(resolve);});
  if(finished)await fsp.rm(job.partial,{recursive:true,force:true}).catch(()=>{});
 }
}
module.exports={torrentDownload,magnetV1,prepareMagnet,filePlan};
