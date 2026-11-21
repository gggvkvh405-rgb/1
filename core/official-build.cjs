const fs=require('node:fs/promises');
const {constants,createReadStream}=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {getJSON}=require('./net.cjs');
const {directory,withinDirectory}=require('./installed-games.cjs');
const repo='gggvkvh405-rgb/1',origin='https://api.github.com';
const version=/^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/;
const sha=/^sha256:([a-f0-9]{64})$/;
function newer(a,b){if(!version.test(a)||!version.test(b))return false;const parts=b.split('.').map(Number);for(const [i,n] of a.split('.').map(Number).entries()){if(n!==parts[i])return n>parts[i];}return false;}
function releaseInfo(body,current){
 const ver=typeof body?.tag_name==='string'&&body.tag_name.startsWith('v')?body.tag_name.slice(1):'';
 if(!version.test(ver)||body.draft||body.prerelease)throw Error('Нет подтверждённого стабильного выпуска ByAzen.');
 const name=`ByAzen-${ver}-win-x64-portable.exe`,assets=Array.isArray(body.assets)?body.assets:[];
 const a=assets.find(x=>x?.name===name),digest=sha.exec(a?.digest||'')?.[1];
 if(!digest||!Number.isSafeInteger(a?.size)||a.size<10*1024*1024||a.size>512*1024*1024)throw Error('Официальный выпуск не содержит контрольную сумму portable-сборки.');
 return {version:ver,current,available:newer(ver,current),sha256:digest,name,bytes:a.size,page:`https://github.com/${repo}/releases/tag/v${ver}`};
}
async function officialUpdate(current,{read=getJSON}={}){
 const route=`/repos/${repo}/releases/latest`;
 return releaseInfo(await read(origin+route,{max:512*1024,headers:{accept:'application/vnd.github+json'},validate:u=>{if(u.origin!==origin||u.pathname!==route)throw Error('Неожиданный адрес выпуска.');}}),current);
}
async function verifyPackage(file,info){
 const before=await fs.lstat(file);if(!before.isFile()||before.isSymbolicLink())throw Error('Выберите обычный локальный файл.');
 if(before.size!==info.bytes)return {match:false,sha256:'',reason:'Размер файла не совпадает.'};
 const fd=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const stat=await fd.stat();if(!stat.isFile()||stat.size!==before.size||stat.ino!==before.ino||stat.dev!==before.dev)throw Error('Файл изменился.');
  let n=0;const hash=createHash('sha256');for await(const chunk of createReadStream(file,{fd,autoClose:false})){n+=chunk.length;if(n>info.bytes)throw Error('Файл изменился.');hash.update(chunk);}
  const after=await fd.stat();if(n!==info.bytes||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs)throw Error('Файл изменился.');
  const actual=hash.digest('hex');return {match:actual===info.sha256,sha256:actual,reason:actual===info.sha256?'':'SHA-256 не совпадает.'};
 }finally{await fd.close();}
}
async function backupSettings(profile,settings,from,to,{now=()=>new Date()}={}){
 if(!version.test(from)||!version.test(to))throw Error('Некорректная версия для копирования.');
 const root=await directory(profile),backup=path.join(root,'update-backups');
 await fs.mkdir(backup).catch(e=>{if(e.code!=='EEXIST')throw e;});await withinDirectory(root,backup);
 const stamp=now().toISOString().replace(/[:.]/g,'-'),name=`settings-${from}-to-${to}-${stamp}-${randomUUID().slice(0,8)}.json`,file=path.join(backup,name);
 await fs.writeFile(file,JSON.stringify({format:'byazen-settings-backup',version:1,from,to,at:now().toISOString(),settings},null,2),{flag:'wx',mode:0o600});
 return name;
}
module.exports={newer,releaseInfo,officialUpdate,verifyPackage,backupSettings};
