const fs=require('node:fs/promises');
const {setTimeout:wait}=require('node:timers/promises');
const {createHash}=require('node:crypto');
const {createReadStream}=require('node:fs');

const limits=(value,min,max,fallback)=>Number.isInteger(value)&&value>=min&&value<=max?value:fallback;
const timePattern=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const cleanTime=(value,fallback)=>typeof value==='string'&&timePattern.test(value)?value:fallback;
function transferOptions(raw={}){
 return {parallel:limits(raw?.parallel,1,4,1),receiveKiB:limits(raw?.receiveKiB,0,102400,0),sendKiB:limits(raw?.sendKiB,16,10240,128),
  schedule:raw?.schedule===true,from:cleanTime(raw?.from,'23:00'),until:cleanTime(raw?.until,'07:00')};
}
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
function inDownloadWindow(options,now=new Date()){
 if(!options.schedule||options.from===options.until)return true;
 const current=now.getHours()*60+now.getMinutes(),from=minutes(options.from),until=minutes(options.until);
 return from<until?current>=from&&current<until:current>=from||current<until;
}
const issueMessages={ENOSPC:'Недостаточно свободного места на диске.', EACCES:'Windows не разрешил записать или открыть файл.', EPERM:'Нет доступа к файлу или папке.',
  ENOENT:'Папка или файл не найдены.', EEXIST:'Файл или папка назначения уже существуют.',
  HTTP_403:'Сервер не разрешил скачивание файла (HTTP 403).',HTTP_404:'Файл не найден по этому адресу (HTTP 404).',
  HTTP_429:'Сервер ограничил частоту запросов (HTTP 429).',HTTP_RESPONSE:'Сервер вернул неожиданный HTTP-ответ.',
  WEB_PAGE:'Источник вернул веб-страницу вместо файла. Выберите другую ссылку или раздачу.',
  SHA_MISMATCH:'Контрольная сумма не совпала. Файл не сохранён в папке назначения.',
  TORRENT_NO_PEERS:'Не удалось подключиться к участникам раздачи. Проверьте сеть или выберите другой источник или версию.',
  TORRENT_NO_METADATA:'Участники подключались, но не передали метаданные. Повторите попытку или выберите другую раздачу.',
  TORRENT_STALLED:'После получения метаданных за 3 минуты не поступили данные. Нажмите «Повторить», чтобы продолжить, или выберите другую раздачу.',
  TIMEOUT:'Сервер не ответил вовремя.',NETWORK:'Не удалось установить или сохранить соединение с сервером.',
  TEST_SIZE:'Сервер вернул неожиданный размер тестового файла.',DOWNLOAD_ERROR:'Не удалось завершить загрузку.'};
function issue(code){return Object.assign(Error(issueMessages[code]||issueMessages.DOWNLOAD_ERROR),{code});}
function knownCode(code){return typeof code==='string'&&Object.hasOwn(issueMessages,code)?code:'DOWNLOAD_ERROR';}
function downloadError(error){
 const raw=error?.code;
 const known=knownCode(raw);
 const code=known!=='DOWNLOAD_ERROR'?known:(raw==='ETIMEDOUT'||error?.name==='TimeoutError'?'TIMEOUT':/^(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ERR_STREAM_PREMATURE_CLOSE|EHOSTUNREACH|ENETUNREACH)$/.test(raw||'')?'NETWORK':'DOWNLOAD_ERROR');
 return {code,message:code==='DOWNLOAD_ERROR'?String(error?.message||issueMessages[code]).slice(0,340):issueMessages[code]};
}
async function ensureSpace(folder,bytes,statfs=fs.statfs){
 if(!bytes||bytes<0)return;
 try{
  const info=await statfs(folder,{bigint:true});
  const available=BigInt(info.bavail)*BigInt(info.bsize);
  if(info.bsize>0&&available<BigInt(bytes))throw issue('ENOSPC');
 }catch(e){if(!['ENOSYS','ENOTSUP','EOPNOTSUPP','ERR_METHOD_NOT_IMPLEMENTED'].includes(e.code))throw e;}
}
function cleanHash(hash){
 if(hash===undefined||hash===null||hash==='')return '';
 if(typeof hash!=='string'||!/^[a-f0-9]{64}$/i.test(hash.trim()))throw Error('Укажите SHA-256: 64 шестнадцатеричных символа.');
 return hash.trim().toLowerCase();
}
async function verifyFile(file,expected,signal){
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(file,{signal}))hash.update(chunk);
 if(hash.digest('hex')!==expected)throw issue('SHA_MISMATCH');
}
// Pace the HTTP stream without accumulating credits while a server is idle.
function throttle(bytesPerSecond,signal,now=()=>performance.now(),pause=wait){
 let next=0;
 return async bytes=>{
  if(!bytesPerSecond)return;
  const time=now();next=Math.max(next,time)+1000*bytes/bytesPerSecond;
  await pause(Math.max(0,Math.ceil(next-time)),undefined,{signal});
 };
}
class TransferMeter{
 constructor(bytes=0,at=0){this.points=[[at,bytes]];this.trend=[];}
 read(bytes,total,at){
  const [oldAt,oldBytes]=this.points.at(-1);
  if(bytes<oldBytes){this.points=[[at,bytes]];this.trend=[];}
  else if(at-oldAt>=600){
   this.trend.push(Math.round((bytes-oldBytes)*1000/(at-oldAt)));if(this.trend.length>12)this.trend.shift();
   this.points.push([at,bytes]);while(this.points.length>2&&at-this.points[0][0]>5500)this.points.shift();
  }
  const [firstAt,firstBytes]=this.points[0],[lastAt,lastBytes]=this.points.at(-1);
  const speed=lastAt>firstAt?Math.round((lastBytes-firstBytes)*1000/(lastAt-firstAt)):0;
  return {speed,eta:total>bytes&&speed>0?Math.ceil((total-bytes)/speed):null,trend:[...this.trend]};
 }
}
module.exports={transferOptions,inDownloadWindow,ensureSpace,issue,downloadError,knownCode,cleanHash,verifyFile,throttle,TransferMeter};
