const {pipeline} = require('node:stream/promises');
const {Transform} = require('node:stream');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {request, webURL} = require('./net.cjs');
const {torrentDownload,magnetV1}=require('./torrent.cjs');
const {transferOptions,inDownloadWindow,ensureSpace,issue,downloadError,knownCode,cleanHash,verifyFile,throttle,TransferMeter}=require('./transfer-policy.cjs');

function length(value) { const n = Number(value); return /^\d+$/.test(value || '') && Number.isSafeInteger(n) ? n : null; }
function rangeInfo(status, headers, offset) {
  if (status === 200) return {append:false,total:length(headers['content-length'])};
  if (status !== 206 || !offset) throw issue([403,404,429].includes(status)?`HTTP_${status}`:'HTTP_RESPONSE');
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(headers['content-range'] || '');
  const start = length(m?.[1]), end = length(m?.[2]), total = length(m?.[3]), size = length(headers['content-length']);
  if (!m || start !== offset || total === null || end === null || end !== total - 1 || start > end || (size !== null && size !== end - start + 1)) throw Error('Сервер вернул неверный диапазон файла.');
  return {append:true,total};
}
function validator(h) { const etag = h.etag; return typeof etag === 'string' && /^"[^\r\n]*"$/.test(etag) ? etag : (typeof h['last-modified'] === 'string' && Number.isFinite(Date.parse(h['last-modified'])) ? h['last-modified'] : ''); }
function nameFromURL(raw) {
  const u = webURL(raw); let base = u.pathname.split('/').pop() || 'download';
  try { base = decodeURIComponent(base); } catch {}
  base = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^[ .]+|[ .]+$/g,'').slice(0,160);
  return !base || /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(base) ? 'download' : base;
}
const reportPhases=new Set(['connecting','metadata','waiting-metadata','selecting-files','pieces','transfer','verifying','saving']);
const reportStatuses=new Set(['queued','running','paused','pausing','scheduling','canceling','canceled','removing','error','done']);
const interrupted=new Set(['queued','running','pausing','canceling','removing','scheduling']);
const count=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const summary=stats=>({peers:count(stats?.peers),peakPeers:count(stats?.peakPeers),trackers:count(stats?.trackers),trackerReplies:count(stats?.trackerReplies),dht:stats?.dht===true});
const originName=raw=>typeof raw==='string'?raw.trim().slice(0,100):'';
class DownloadQueue {
  constructor(items,persist,{fetch=request,torrent=torrentDownload,options={},space=ensureSpace,now=()=>new Date(),clock=()=>performance.now()}={}) {
    Object.assign(this,{items,persist,fetch,torrent,space,now,clock,options:transferOptions(options)});
    this.active=new Map();
    for(const j of items)if(interrupted.has(j.status))j.status='paused';
    this.scheduleTimer();
  }
  scheduleTimer(){
    clearInterval(this.timer);
    if(this.options.schedule){this.timer=setInterval(()=>this.pump(),5000);this.timer.unref();}
  }
  dispose(){clearInterval(this.timer);}
  configure(options){this.options=transferOptions(options);this.scheduleTimer();this.pump();}
  allowed(){return inDownloadWindow(this.options,this.now());}
  waiting(){return this.items.filter(j=>j.status==='queued').reverse().sort((a,b)=>count(b.priority)-count(a.priority));}
  find(id){const j=this.items.find(x=>x.id===id);if(!j)throw Error('Загрузка не найдена.');return j;}
  list(){
    const queued=this.waiting(), positions=new Map(queued.map((j,i)=>[j,i+1]));
    const sorted=[...this.items.filter(j=>this.active.has(j)),...queued,...this.items.filter(j=>!this.active.has(j)&&!positions.has(j))];
    return sorted.map(j=>{
      const {url,partial,validator,expectedSha256,selection,...shown}=j, active=this.active.get(j);
      const moving=active&&j.status==='running'&&!['saving','verifying'].includes(j.phase);
      return {...shown,position:positions.get(j)||null,telemetry:moving?active.meter.read(j.bytes||0,j.total,this.clock()):null,
        diagnostic:j.kind==='torrent'?summary(active?.stats||j.diagnostic):null};
    });
  }
  report(id){
    const j=this.find(id);
    return {kind:j.kind==='torrent'?'BitTorrent':'HTTP(S)',status:reportStatuses.has(j.status)?j.status:'unknown',phase:reportPhases.has(j.phase)?j.phase:'',code:knownCode(j.errorCode),received:count(j.bytes),total:j.total==null?null:count(j.total),
      ...(j.kind==='torrent'?{discovery:summary(this.active.get(j)?.stats||j.diagnostic)}:{})};
  }
  add(raw,file,{expectFile=false,origin,sha256}={}) {
    const url=webURL(raw).href, expectedSha256=cleanHash(sha256);
    if(this.items.length>=200)throw Error('Удалите завершённые записи: в очереди уже 200 загрузок.');
    if(this.items.some(j=>j.file.toLowerCase()===file.toLowerCase()&&!['done','canceled'].includes(j.status)))throw Error('Этот путь уже используется.');
    const id=randomUUID();
    this.items.unshift({id,url,file,title:path.basename(file),origin:originName(origin),partial:path.join(path.dirname(file),`.byazen-${id}.part`),status:'queued',bytes:0,total:null,validator:'',error:'',expectedSha256,expectFile:expectFile===true});
    this.persist();this.pump();
  }
  addTorrent(url,parent,label,origin,pickFiles=false){
    magnetV1(url);
    if(this.items.length>=200)throw Error('Удалите завершённые записи: в очереди уже 200 загрузок.');
    const id=randomUUID();
    let title=String(label||'Torrent').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().replace(/[. ]+$/,'').slice(0,90)||'Torrent';
    if(/^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(title))title='Torrent '+title;
    const folder=path.join(parent,`${title} (${id.slice(0,8)})`);
    this.items.unshift({id,url,file:folder,title,origin:originName(origin),kind:'torrent',pickFiles:pickFiles===true,partial:path.join(parent,`.byazen-${id}.part`),status:'queued',bytes:0,total:null,error:''});
    this.persist();this.pump();
  }
  clearPartial(job){return fsp.rm(job.partial,{force:true,recursive:job.kind==='torrent'});}
  async action(id,op){
    const j=this.find(id),active=this.active.get(j);
    if(active){
      if(!['pause','cancel'].includes(op)||j.status!=='running'||j.phase==='saving')throw Error('Действие сейчас недоступно.');
      j.status=op==='pause'?'pausing':'canceling';active.controller.abort();
    }else if(op==='first'&&j.status==='queued'){
      // Re-number waiting priorities to keep values bounded and stable on disk.
      const old=this.waiting().filter(x=>x!==j&&count(x.priority));
      old.reverse().forEach((x,i)=>{x.priority=i+1;});j.priority=old.length+1;
    }else if(op==='normal'&&j.status==='queued')j.priority=0;
    else if(op==='pause'&&j.status==='queued')j.status='paused';
    else if(op==='resume'&&['paused','error','canceled'].includes(j.status)){j.error='';j.errorCode='';j.completedAt='';j.status='queued';}
    else if((op==='cancel'&&['queued','paused','error'].includes(j.status))||(op==='remove'&&['done','canceled','error','paused'].includes(j.status))){
      const last=j.status;j.status=op==='cancel'?'canceling':'removing';
      try{await this.clearPartial(j);}catch(e){j.status=last;throw e;}
      if(op==='remove')this.items.splice(this.items.indexOf(j),1);
      else{j.status='canceled';j.bytes=0;j.error='';j.errorCode='';j.completedAt=this.now().toISOString();}
    }else throw Error('Действие сейчас недоступно.');
    this.persist();this.pump();
  }
  pump(){
    if(!this.allowed()){
      let changed=false;
      for(const [job,{controller}] of this.active)if(job.status==='running'&&!['verifying','saving'].includes(job.phase)){
        job.status='scheduling';controller.abort();changed=true;
      }
      if(changed)this.persist();
      return;
    }
    while(this.active.size<this.options.parallel){
      const j=this.waiting()[0];if(!j)break;this.start(j);
    }
  }
  torrentFiles(id,page){
    const j=this.find(id),plan=this.active.get(j)?.pick;
    if(j.phase!=='selecting-files'||j.status!=='running'||!plan)throw Error('Список файлов пока недоступен или уже подтверждён.');
    const size=60,total=plan.rows.length,max=Math.max(1,Math.ceil(total/size));
    const p=Number.isInteger(page)?Math.max(1,Math.min(page,max)):1;
    return {id,page:p,max,total,rows:plan.rows.slice((p-1)*size,p*size).map((r,i)=>({...r,index:(p-1)*size+i}))};
  }
  setTorrentFiles(id,indices){
    const j=this.find(id),active=this.active.get(j),pick=active?.pick;
    if(!pick||j.phase!=='selecting-files'||j.status!=='running')throw Error('Запросите список файлов снова.');
    if(indices===null)indices=pick.rows.map((_,i)=>i);
    if(!Array.isArray(indices)||!indices.length||indices.length>pick.rows.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=pick.rows.length))throw Error('Отметьте хотя бы один файл.');
    active.pick=null;pick.accept([...new Set(indices)].sort((a,b)=>a-b));
  }
  start(j){
    const controller=new AbortController(),stats={},opts=this.options;
    const row={controller,stats,meter:new TransferMeter(j.bytes||0,this.clock())};this.active.set(j,row);
    const chooseFiles=files=>new Promise((resolve,reject)=>{
      const abort=()=>{row.pick=null;reject(controller.signal.reason);};
      if(controller.signal.aborted){abort();return;}
      controller.signal.addEventListener('abort',abort,{once:true});
      row.pick={rows:files,accept:indices=>{controller.signal.removeEventListener('abort',abort);resolve(indices);}};
    });
    j.status='running';j.priority=0;j.phase='connecting';j.verified=false;this.persist();
    Promise.resolve().then(()=>j.kind==='torrent'?this.torrent(j,controller.signal,this.persist,{stats,receiveLimit:opts.receiveKiB*1024,sendLimit:opts.sendKiB*1024,checkSpace:this.space,chooseFiles}):this.run(j,controller.signal,opts))
      .then(()=>{j.status='done';j.completedAt=this.now().toISOString();},async err=>{
        if(j.status==='canceling'){await this.clearPartial(j);Object.assign(j,{status:'canceled',bytes:0,error:'',errorCode:'',completedAt:this.now().toISOString()});}
        else if(j.status==='pausing')j.status='paused';
        else if(j.status==='scheduling')j.status='queued';
        else throw err;
      }).catch(err=>{const {code,message}=downloadError(err);Object.assign(j,{status:'error',error:message,errorCode:code});}).finally(()=>{
        if(j.kind==='torrent')j.diagnostic=summary(stats);
        this.active.delete(j);this.persist();this.pump();
      });
  }
  async run(j,signal,options=this.options) {
    const stat = await fsp.lstat(j.partial).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (stat && !stat.isFile()) throw Error('Небезопасный временный путь.');
    const offset = j.validator && stat?.size && stat.size !== j.total ? stat.size : 0;
    const idleMs=options.receiveKiB?Math.max(18000,Math.ceil(128000/options.receiveKiB)+10000):18000;
    const {res} = await this.fetch(j.url, {signal,idleMs, headers:offset ? {Range:`bytes=${offset}-`, 'If-Range':j.validator} : {}});
    let info;
    // IncomingMessage may abort while we check the destination before pipeline attaches.
    res.on('error',()=>{});
    try {
      signal.throwIfAborted();
      info = rangeInfo(res.statusCode,res.headers,offset);
      const contentType=String(res.headers['content-type']||'').split(';')[0].trim().toLowerCase();
      if(j.expectFile&&['text/html','application/xhtml+xml'].includes(contentType))throw issue('WEB_PAGE');
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') throw Error('Сжатый ответ загрузки не поддерживается.');
      const nextValidator = validator(res.headers);
      if (info.append && ((nextValidator && nextValidator !== j.validator) || (j.total !== null && j.total !== info.total))) throw Error('Файл на сервере изменился.');
      if(j.testBytes&&info.total!==j.testBytes)throw issue('TEST_SIZE');
      if(info.total!==null)await this.space(path.dirname(j.file),Math.max(0,info.total-(info.append?offset:0)));
      signal.throwIfAborted();
      j.phase='transfer';
      j.validator = nextValidator || (info.append ? j.validator : '');
      j.total = info.total; j.bytes = info.append ? offset : 0;
      const out = await fsp.open(j.partial, (info.append ? fs.constants.O_APPEND : fs.constants.O_TRUNC) | fs.constants.O_CREAT | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
      this.persist();
      const pace=throttle(options.receiveKiB*1024,signal);
      const progress=new Transform({transform(chunk,_,cb){
        if(j.testBytes&&j.bytes+chunk.length>j.testBytes)return cb(issue('TEST_SIZE'));
        pace(chunk.length).then(()=>{j.bytes+=chunk.length;cb(null,chunk);},cb);
      }});
      await pipeline(res,progress,out.createWriteStream(),{signal});
      if (j.total !== null && j.bytes !== j.total) throw Error('Получен неполный файл.');
      if(j.expectedSha256){
        j.phase='verifying';
        try{await verifyFile(j.partial,j.expectedSha256,signal);}
        catch(e){if(e.code==='SHA_MISMATCH'){await this.clearPartial(j);j.bytes=0;j.validator='';}throw e;}
        j.verified=true;
      }
      signal.throwIfAborted();
      j.phase='saving';
      await fsp.link(j.partial,j.file).catch(async e => {
        if (e.code === 'EEXIST') throw issue('EEXIST');
        if (!['EPERM','ENOTSUP','EXDEV','EOPNOTSUPP','EACCES'].includes(e.code)) throw e;
        await fsp.copyFile(j.partial,j.file,fs.constants.COPYFILE_EXCL);
      });
      await fsp.rm(j.partial,{force:true});
    } catch (error) { res.destroy(); throw error; }
  }
}
module.exports = {DownloadQueue, rangeInfo, nameFromURL};
