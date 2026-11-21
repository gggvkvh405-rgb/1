const {setTimeout:sleep}=require('node:timers/promises');
const {getJSON,webURL}=require('./net.cjs');
const {parseSource,MAX_JSON}=require('./sources.cjs');

const transient=new Set(['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN','ABORT_ERR','ERR_STREAM_PREMATURE_CLOSE']);
const retryableStatus=new Set([408,500,502,503,504]);
function retryable(error = {}){
 return !error.retryAfter&&(transient.has(error.code)||retryableStatus.has(error.statusCode)||error.name==='TimeoutError'||error.name==='AbortError');
}
function sourceError(error){
 if(error.statusCode===403)return 'HTTP 403 — сервер отказал в доступе к списку.';
 if(error.statusCode===404)return 'HTTP 404 — список не найден по этому адресу.';
 if(error.statusCode===429)return 'HTTP 429 — сервер ограничил частоту запросов. Попробуйте позже.';
 if(error.code==='ETIMEDOUT'||error.name==='TimeoutError'||error.code==='ABORT_ERR'||error.name==='AbortError')return 'Сервер не ответил вовремя. Попробуйте обновить список позже.';
 if(error.code==='ECONNRESET'||error.code==='ERR_STREAM_PREMATURE_CLOSE')return 'Соединение прервалось до получения полного списка.';
 if(error.code==='ENOTFOUND'||error.code==='EAI_AGAIN')return 'Не удалось найти адрес сервера (DNS).';
 return error.message||'Не удалось прочитать список.';
}
function createFeedReader({fetchJSON=getJSON,pause=sleep,maxConcurrent=3,timeoutMs=65000}={}){
 const busyHosts=new Set(), queue=[], pending=new Map();
 let active=0;
 function pump(){
  while(active<maxConcurrent){
   const i=queue.findIndex(task=>!busyHosts.has(task.host));
   if(i<0)return;
   const [task]=queue.splice(i,1);
   active++;busyHosts.add(task.host);
   task.run().finally(()=>{busyHosts.delete(task.host);active--;pump();});
  }
 }
 async function fetchFeed(url,limits){
  for(let attempt=0;attempt<2;attempt++){
   try{
    const input=await fetchJSON(url,{max:limits.maxBytes||MAX_JSON,signal:AbortSignal.timeout(timeoutMs),addressIndex:attempt,connectMs:10000,idleMs:18000});
    return parseSource(input,limits);
   }catch(e){
    if(attempt===1||!retryable(e))throw Error(sourceError(e),{cause:e});
    await pause(800);
   }
  }
 }
 return function read(raw,limits={maxBytes:MAX_JSON}){
  const url=webURL(raw), key=`${url.href}|${limits.maxBytes}|${limits.maxEntries}`;
  if(pending.has(key))return pending.get(key);
  const task=new Promise((resolve,reject)=>{
   queue.push({host:url.hostname,run:()=>fetchFeed(url.href,limits).then(resolve,reject)});
   pump();
  }).finally(()=>pending.delete(key));
  pending.set(key,task);
  return task;
 };
}
module.exports={createFeedReader,retryable,sourceError};
