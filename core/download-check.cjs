const fs=require('node:fs/promises');
const path=require('node:path');
const {DownloadQueue}=require('./downloads.cjs');
const {downloadError}=require('./transfer-policy.cjs');
const fixture={url:'https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-2.3.0.tgz',size:15226,sha256:'c38b809ed258e3929e8ef5cebf6cb23ee6deba73c8f5ad3d053565979768c905'};
async function checkDownload(folder,{fetch,sample=fixture,timeout=20000}={}){
 let dir,job;
 const signal=AbortSignal.timeout(timeout);
 try{
  dir=await fs.mkdtemp(path.join(folder,'.byazen-check-'));
  job={url:sample.url,file:path.join(dir,'sample.bin'),partial:path.join(dir,'sample.part'),expectFile:true,expectedSha256:sample.sha256,testBytes:sample.size};
  const queue=new DownloadQueue([],()=>{},{fetch});
  await queue.run(job,signal);
  return {ok:true,received:job.bytes,verified:job.verified===true};
 }catch(e){
  const {code,message}=downloadError(signal.aborted?signal.reason:e);
  return {ok:false,stage:!dir?'disk':job.phase==='verifying'?'integrity':job.phase==='saving'||['ENOSPC','EACCES','EPERM','ENOENT'].includes(code)?'disk':'network',code,message};
 }finally{if(dir)await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={checkDownload};
