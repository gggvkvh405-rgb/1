const fs=require('node:fs/promises');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const {directory,withinDirectory,regular,under,samePath,segment,boundedText,discoverExecutables,isExecutable}=require('./installed-games.cjs');
const label=x=>typeof x==='string'?x.trim().slice(0,160):'';
const validRoot=async(root,requested)=>samePath(root,requested)?root:await withinDirectory(root,requested);
async function execs(gameDir,selectedRoot,store,title,target){
 if(!title)return [];
 if(typeof target==='string'&&target.length<480){
  const parts=target.split(/[\\/]/);
  if(parts.every(segment)&&/\.exe$/i.test(parts.at(-1))){const file=path.join(gameDir,...parts);try{if(!await isExecutable(gameDir,file))throw Error();return [{title,root:selectedRoot,file,store}];}catch{}}
 }
 const {found}=await discoverExecutables(gameDir,{entries:900,depth:3,max:12});
 return found.map((r,i)=>({title:found.length>1?`${title.slice(0,100)} — ${r.title.slice(0,55)}`:title,root:selectedRoot,file:r.file,store}));
}
async function epic(input,manifests){
 const root=await directory(input),meta=await directory(manifests),found=[];let seen=0,limited=false;
 for await(const entry of await fs.opendir(meta)){
  if(++seen>1000||found.length>=120){limited=true;break;}
  if(!entry.isFile()||!entry.name.toLowerCase().endsWith('.item')||!segment(entry.name))continue;
  try{
   const file=path.join(meta,entry.name);await regular(meta,file);
   const data=JSON.parse(await boundedText(file,256*1024)),location=data.InstallLocation;
   if(data.bIsIncompleteInstall===true||data.bIsApplication===false||typeof location!=='string'||!path.isAbsolute(location))continue;
   const install=await fs.realpath(location);
   if(!samePath(root,install)&&!under(root,install))continue;
   found.push(...await execs(await validRoot(root,install),root,'Epic',label(data.DisplayName),data.LaunchExecutable));
  }catch{}
 }
 return {found:found.slice(0,120),limited:limited||found.length>120};
}
async function gogInfo(dir){
 let seen=0;
 for await(const entry of await fs.opendir(dir)){
  if(++seen>200)break;
  if(!entry.isFile()||!/^goggame-\d+\.info$/i.test(entry.name))continue;
  try{const file=path.join(dir,entry.name);await regular(dir,file);const info=JSON.parse(await boundedText(file,128*1024));
   if(info.isDlc===true||!label(info.name))continue;
   const tasks=Array.isArray(info.playTasks)?info.playTasks.slice(0,20):[],task=tasks.find(x=>x?.isPrimary===true&&typeof x.path==='string')||tasks.find(x=>typeof x?.path==='string');
   return {title:label(info.name),target:task?.path};
  }catch{}
 }
 return null;
}
async function itchInfo(dir){
 try{
  const folder=await withinDirectory(dir,path.join(dir,'.itch'));
  for(const name of ['receipt.json.gz','receipt.json']){
   const file=path.join(folder,name),st=await regular(dir,file).catch(()=>null);if(!st||st.size>128*1024)continue;
   let data;
   if(name.endsWith('.gz')){const fd=await fs.open(file,'r');try{const bytes=Buffer.alloc(st.size+1);let count=0;while(count<bytes.length){const read=await fd.read(bytes,count,bytes.length-count,count);if(!read.bytesRead)break;count+=read.bytesRead;}if(count!==st.size)continue;data=gunzipSync(bytes.subarray(0,count),{maxOutputLength:256*1024}).toString('utf8');}finally{await fd.close();}}
   else data=await boundedText(file,128*1024);
   const receipt=JSON.parse(data),title=label(receipt.game?.title);
   if(title)return {title};
  }
 }catch{}
 return null;
}
async function discoverStore(kind,input,meta){
 if(kind==='epic')return epic(input,meta);
 if(!['gog','itch'].includes(kind))throw Error('Неизвестный магазин.');
 const root=await directory(input),dirs=[root],found=[];let seen=0,limited=false;
 for await(const entry of await fs.opendir(root)){
  if(++seen>500||dirs.length>=90){limited=true;break;}
  if(entry.isDirectory()&&!entry.isSymbolicLink()&&segment(entry.name)){const file=path.join(root,entry.name);const dir=await validRoot(root,file).catch(()=>null);if(dir)dirs.push(dir);}
 }
 for(const dir of dirs){
  if(found.length>=120){limited=true;break;}
  const info=await (kind==='gog'?gogInfo(dir):itchInfo(dir)).catch(()=>null);
  if(info)found.push(...await execs(dir,root,kind==='gog'?'GOG':'itch.io',info.title,info.target).catch(()=>[]));
 }
 const used=new Set();return {found:found.filter(x=>!used.has(x.file.toLowerCase())&&used.add(x.file.toLowerCase())).slice(0,120),limited:limited||found.length>120};
}
module.exports={discoverStore};
