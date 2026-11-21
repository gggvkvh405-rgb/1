const fs=require('node:fs/promises');
const {createReadStream,constants}=require('node:fs');
const {createHash,randomUUID}=require('node:crypto');
const path=require('node:path');
const {segment,key,samePath,under,directory,withinDirectory,regular,boundedText}=require('./installed-games.cjs');
const {ensureSpace}=require('./transfer-policy.cjs');
const MAX_FILES=2000,MAX_BYTES=512*1024*1024,MAX_SNAPSHOTS=10,MAX_DEPTH=16;
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id);
const overlap=(a,b)=>samePath(a,b)||under(a,b)||under(b,a);
const signature=files=>createHash('sha256').update(JSON.stringify(files.map(({name,size,sha256})=>[name,size,sha256]))).digest('hex');
const isMissing=e=>e.code==='ENOENT';
const safeName=name=>typeof name==='string'&&name.length<=1000&&name.split('/').length<=MAX_DEPTH+1&&name.split('/').every(segment);
const location=(folder,name)=>path.join(folder,...name.split('/'));
const stableOrder=(a,b)=>a.name<b.name?-1:a.name>b.name?1:0;
function safeFiles(files){
 if(!Array.isArray(files)||files.length>MAX_FILES)throw Error('Некорректный список файлов копии.');
 let bytes=0;
 const seen=new Set();
 const result=files.map(f=>{
  if(!safeName(f?.name)||seen.has(f.name.toLowerCase())||!Number.isSafeInteger(f.size)||f.size<0||typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Некорректный файл в копии.');
  bytes+=f.size;seen.add(f.name.toLowerCase());
  return {name:f.name,size:f.size,sha256:f.sha256};
 }).sort(stableOrder);
 for(const f of result){const pieces=f.name.toLowerCase().split('/');pieces.pop();while(pieces.length){if(seen.has(pieces.join('/')))throw Error('Конфликт имён файлов в копии.');pieces.pop();}}
 if(bytes>MAX_BYTES)throw Error('Папка сохранений больше 512 МБ. Выберите более узкую папку.');
 return {files:result,bytes};
}
async function hashFile(file,size){
 const fd=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const before=await fd.stat();if(!before.isFile()||before.size!==size)throw Error('Файл изменился при чтении. Закройте игру и повторите.');
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(file,{fd,autoClose:false})){bytes+=chunk.length;if(bytes>size)throw Error('Файл изменился при чтении.');hash.update(chunk);}
  const after=await fd.stat();
  if(bytes!==size||after.size!==size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('Файл изменился при чтении. Закройте игру и повторите.');
  return hash.digest('hex');
 }finally{await fd.close();}
}
async function inventory(root){
 const queue=[[root,0]],files=[];let bytes=0,entries=0;
 while(queue.length){
  const [dir,depth]=queue.pop();
  if(depth)await withinDirectory(root,dir);
  for await(const item of await fs.opendir(dir)){
   if(++entries>MAX_FILES*2)throw Error('В папке слишком много файлов или подпапок (лимит до 2 000 файлов).');
   if(!segment(item.name))throw Error('Папка содержит недопустимое имя файла.');
   if(item.isSymbolicLink())throw Error('Папка сохранений содержит символическую ссылку. Выберите папку без ссылок.');
   const file=path.join(dir,item.name);
   if(item.isDirectory()){if(depth>=MAX_DEPTH)throw Error('Папка сохранений слишком глубоко вложена.');queue.push([file,depth+1]);continue;}
   if(!item.isFile())throw Error('Папка содержит объект, который не является обычным файлом.');
   if(files.length>=MAX_FILES)throw Error('В папке больше 2 000 файлов.');
   const {size}=await regular(root,file);bytes+=size;
   if(bytes>MAX_BYTES)throw Error('Папка сохранений больше 512 МБ. Выберите более узкую папку.');
   files.push({name:path.relative(root,file).split(path.sep).join('/'),size,sha256:await hashFile(file,size)});
  }
 }
 return safeFiles(files);
}
async function ensureTarget(root,name,{mkdir=false}={}){
 let dir=root;
 const parts=name.split('/');const last=parts.pop();
 for(const part of parts){
  const target=path.join(dir,part);
  try{await withinDirectory(root,target);}
  catch(e){if(!isMissing(e))throw Error('На пути восстановления есть файл или ссылка.');if(mkdir){await fs.mkdir(target).catch(e=>{if(e.code!=='EEXIST')throw e;});await withinDirectory(root,target);}}
  dir=target;
 }
 const dest=path.join(dir,last),st=await regular(root,dest).catch(e=>{if(isMissing(e))return null;throw Error('Целевой путь занят папкой или ссылкой.');});
 return {dest,st};
}
class SaveBackups{
 constructor(profile,{now=()=>new Date(),checkSpace=ensureSpace}={}){this.profile=profile;this.now=now;this.checkSpace=checkSpace;}
 async source(input){
  const root=await directory(input),profile=await directory(this.profile);
  if(samePath(root,path.parse(root).root)||overlap(root,profile))throw Error('Выберите узкую папку сохранений вне диска целиком и данных ByAzen.');
  return root;
 }
 async gameStore(gameId,create=false){
  if(!validId(gameId))throw Error('Некорректная запись игры.');
  const profile=await directory(this.profile),base=path.join(profile,'save-backups'),gameDir=path.join(base,gameId);
  try{
   for(const folder of [base,gameDir]){
    if(create)await fs.mkdir(folder).catch(e=>{if(e.code!=='EEXIST')throw e;});
    await withinDirectory(profile,folder);
   }
  }catch(e){if(isMissing(e)&&!create)return null;throw e;}
  return gameDir;
 }
 async readSnapshot(gameDir,id){
  if(!gameDir||!validId(id))throw Error('Копия не найдена.');
  const folder=await withinDirectory(gameDir,path.join(gameDir,id));
  const meta=path.join(folder,'manifest.json');await regular(folder,meta);
  const raw=JSON.parse(await boundedText(meta,3*1024*1024));
  if(raw?.version!==1||raw.id!==id||typeof raw.created!=='string'||!Number.isFinite(Date.parse(raw.created))||!['manual','launch','before-restore'].includes(raw.reason))throw Error('Некорректные метаданные копии.');
  const {files,bytes}=safeFiles(raw.files);
  const payload=await withinDirectory(folder,path.join(folder,'files'));
  return {id,created:raw.created,reason:raw.reason,files,bytes,payload};
 }
 async records(gameId){
  const store=await this.gameStore(gameId),records=[],brokenIds=[];
  if(!store)return {records,damaged:brokenIds.length,brokenIds};
  for await(const entry of await fs.opendir(store)){
   if(!validId(entry.name))continue;
   if(records.length+brokenIds.length>=MAX_SNAPSHOTS)throw Error('Хранилище содержит слишком много копий.');
   try{records.push(await this.readSnapshot(store,entry.name));}catch{brokenIds.push(entry.name);}
  }
  records.sort((a,b)=>b.created.localeCompare(a.created));
  return {records,damaged:brokenIds.length,brokenIds};
 }
 async list(gameId){
  const {records,damaged,brokenIds}=await this.records(gameId);
  return {damaged,brokenIds,max:MAX_SNAPSHOTS,copies:records.map(({id,created,reason,files,bytes})=>({id,created,reason,count:files.length,bytes}))};
 }
 async capture(gameId,root,manifest,reason){
  const store=await this.gameStore(gameId,true),id=randomUUID();
  await this.checkSpace(store,manifest.bytes);
  const stage=await fs.mkdtemp(path.join(store,'.stage-')),payload=path.join(stage,'files');
  try{
   await fs.mkdir(payload);
   for(const file of manifest.files){
    const from=location(root,file.name),out=location(payload,file.name);
    await regular(root,from);await fs.mkdir(path.dirname(out),{recursive:true});await fs.copyFile(from,out,constants.COPYFILE_EXCL);
    if(await hashFile(out,file.size)!==file.sha256)throw Error('Сохранение изменилось во время копирования. Закройте игру и повторите.');
   }
   const snapshot={version:1,id,created:this.now().toISOString(),reason,files:manifest.files};
   await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify(snapshot),{flag:'wx',mode:0o600});
   await fs.rename(stage,path.join(store,id));
   return {id,created:snapshot.created,reason,count:manifest.files.length,bytes:manifest.bytes};
  }finally{await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});}
 }
 enoughSpace(used){if(used>=MAX_SNAPSHOTS)throw Error(`Достигнут лимит в ${MAX_SNAPSHOTS} копий. Удалите ненужную копию, чтобы освободить место.`);}
 async make(gameId,input,{automatic=false}={}){
  const root=await this.source(input),current=await inventory(root),{records,damaged}=await this.records(gameId);
  if(!current.files.length){if(automatic)return {empty:true};throw Error('В папке нет файлов для копирования.');}
  if(automatic&&records[0]&&signature(records[0].files)===signature(current.files)){
   const actual=await inventory(records[0].payload);
   if(signature(actual.files)===signature(current.files))return {unchanged:true};
  }
  this.enoughSpace(records.length+damaged);
  return this.capture(gameId,root,current,automatic?'launch':'manual');
 }
 async plan(gameId,input,id){
  const root=await this.source(input),store=await this.gameStore(gameId),snapshot=await this.readSnapshot(store,id);
  const current=await inventory(root),byName=new Map(current.files.map(f=>[f.name.toLowerCase(),f]));
  const writes=[];let added=0,replaced=0,unchanged=0;
  for(const file of snapshot.files){
   const old=byName.get(file.name.toLowerCase());
   if(old&&old.name!==file.name&&!samePath(location(root,old.name),location(root,file.name)))throw Error('В папке есть конфликт регистра имён.');
   if(old?.sha256===file.sha256){unchanged++;continue;}
   await ensureTarget(root,file.name);
   if(old)replaced++;else added++;
   writes.push({file,old});
  }
  return {root,store,snapshot,current,writes,summary:{added,replaced,unchanged,total:added+replaced,paths:writes.slice(0,40).map(({file,old})=>({name:file.name,replace:Boolean(old)}))},
   fingerprint:signature(current.files)+':'+signature(snapshot.files)};
 }
 async preview(gameId,input,id){const plan=await this.plan(gameId,input,id);return {root:plan.root,id,fingerprint:plan.fingerprint,...plan.summary};}
 async restore(gameId,input,preview){
  const {root,store,snapshot,current,writes,summary,fingerprint}=await this.plan(gameId,input,preview.id);
  if(!samePath(root,preview.root)||fingerprint!==preview.fingerprint)throw Error('Файлы изменились после предпросмотра. Проверьте изменения заново.');
  if(!writes.length)return {updated:0};
  // Validate the complete source before making a safety copy or overwriting anything.
  const payload=await inventory(snapshot.payload);
  if(signature(payload.files)!==signature(snapshot.files))throw Error('Резервная копия повреждена. Ничего не восстановлено.');
  const {records,damaged}=await this.records(gameId);
  this.enoughSpace(records.length+damaged);
  await this.checkSpace(root,writes.reduce((total,{file})=>total+file.size,0));
  const safety=await this.capture(gameId,root,current,'before-restore');
  let updated=0;const staged=[];
  try{
   for(const {file,old} of writes){
    const {dest}=await ensureTarget(root,file.name,{mkdir:true}),temp=path.join(path.dirname(dest),`.byazen-${randomUUID()}.tmp`);
    const from=location(snapshot.payload,file.name);await regular(snapshot.payload,from);
    await fs.copyFile(from,temp,constants.COPYFILE_EXCL);staged.push({temp,file,old});
    if(await hashFile(temp,file.size)!==file.sha256)throw Error('Резервная копия изменилась во время восстановления.');
   }
   for(const {temp,file,old} of staged){
    const {dest,st}=await ensureTarget(root,file.name);
    if(Boolean(st)!==Boolean(old)||old&&await hashFile(dest,old.size)!==old.sha256)throw Error('Сохранение изменилось во время восстановления.');
    if(old)await fs.rename(temp,dest);
    else await fs.link(temp,dest).catch(async e=>{if(!['ENOSYS','ENOTSUP','EOPNOTSUPP','EPERM','EXDEV'].includes(e.code))throw e;await fs.copyFile(temp,dest,constants.COPYFILE_EXCL);});
    updated++;
   }
   return {updated,safety:safety.id,...summary};
  }catch(e){throw Error(`Восстановление остановлено (записано ${updated} файлов). Исходные данные находятся в копии «Перед восстановлением». ${e.message}`);}
  finally{for(const {temp} of staged)await fs.rm(temp,{force:true}).catch(()=>{});}
 }
 async remove(gameId,id){
  const store=await this.gameStore(gameId);if(!store||!validId(id))throw Error('Копия не найдена.');
  const target=await withinDirectory(store,path.join(store,id));
  await fs.rm(target,{recursive:true,force:false});
 }
}
module.exports={SaveBackups,inventory,signature,MAX_FILES,MAX_BYTES,MAX_SNAPSHOTS};
