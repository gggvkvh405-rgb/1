const fs=require('node:fs/promises');
const path=require('node:path');
const {constants}=require('node:fs');
const {randomUUID}=require('node:crypto');
const {cleanGame}=require('./library.cjs');
const key=p=>path.normalize(p).toLowerCase();
const samePath=(a,b)=>process.platform==='win32'?key(a)===key(b):path.normalize(a)===path.normalize(b);
const segment=s=>typeof s==='string'&&s.length>0&&s.length<=200&&!/^(?:\.{1,2}|(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\..*)?)$/i.test(s)&&!/[\\/:*?"<>|\x00-\x1f]|[ .]$/.test(s);
const steamId=id=>typeof id==='string'&&/^[1-9]\d{0,9}$/.test(id)&&Number(id)<=4294967295;
function under(root,file){const rel=path.relative(root,file);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
async function directory(input){
 if(typeof input!=='string'||!path.isAbsolute(input)||process.platform==='win32'&&!/^[a-z]:\\/i.test(input))throw Error('Выберите локальную папку.');
 const folder=await fs.realpath(input);
 if(process.platform==='win32'&&!/^[a-z]:\\/i.test(folder)||!(await fs.stat(folder)).isDirectory())throw Error('Выберите локальную папку.');
 return folder;
}
async function withinDirectory(root,child){
 const st=await fs.lstat(child);
 if(!st.isDirectory()||st.isSymbolicLink()||!under(root,child)||!samePath(await fs.realpath(child),child))throw Error('Папка недоступна или является ссылкой.');
 return child;
}
async function regular(root,file){
 const st=await fs.lstat(file);
 if(!under(root,file)||!st.isFile()||st.isSymbolicLink()||!samePath(await fs.realpath(file),file))throw Error('Файл недоступен или является ссылкой.');
 return st;
}
async function boundedText(file,max=128*1024){
 const fd=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const st=await fd.stat();if(!st.isFile()||st.size>max)throw Error('Слишком большой файл метаданных.');
  const buffer=Buffer.alloc(st.size+1);let off=0;
  while(off<buffer.length){const result=await fd.read(buffer,off,buffer.length-off,off);if(!result.bytesRead)break;off+=result.bytesRead;}
  if(off!==st.size)throw Error('Размер файла изменился.');
  return buffer.subarray(0,off).toString('utf8').replace(/^\uFEFF/,'');
 }finally{await fd.close();}
}
const ignored=/^(?:unins\d*|uninstall.*|setup|install(?:er)?|crash.*|unitycrashhandler.*|.*redist.*|.*prereq.*|vc_redist.*|dxsetup|dotnet.*|(?:updat|patch)er|easyanticheat.*|.*server)(?:\.exe)?$/i;
const ignoredFolders=new Set(['_commonredist','redist','redistributables','directx','vcredist','support','crashreporter','uninstall','node_modules']);
async function isExecutable(root,file){
 await regular(root,file);
 if(path.extname(file).toLowerCase()!=='.exe'||ignored.test(path.basename(file,'.exe')))return false;
 const fd=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{const header=Buffer.alloc(2);const {bytesRead}=await fd.read(header,0,2,0);return bytesRead===2&&header.toString()==='MZ';}finally{await fd.close();}
}
async function discoverExecutables(input,{entries=5000,depth=4,max=120}={}){
 const root=await directory(input), pending=[[root,0]],found=[],seen=new Set();
 let inspected=0,limited=false;
 while(pending.length&&!limited){
  const [folder,level]=pending.shift();
  if(level)try{await withinDirectory(root,folder);}catch{continue;}
  const handle=await fs.opendir(folder).catch(e=>{if(!level)throw e;return null;});if(!handle)continue;
  for await(const entry of handle){
   if(++inspected>entries||found.length>=max){limited=true;break;}
   if(!segment(entry.name)||entry.isSymbolicLink())continue;
   const file=path.join(folder,entry.name);
   if(entry.isDirectory()&&level<depth&&!ignoredFolders.has(entry.name.toLowerCase()))pending.push([file,level+1]);
   else if(entry.isFile()&&/\.exe$/i.test(entry.name)&&!seen.has(key(file))&&await isExecutable(root,file).catch(()=>false)){
    seen.add(key(file));found.push({title:entry.name.slice(0,-4),file,root});
   }
  }
 }
 found.sort((a,b)=>a.file.split(path.sep).length-b.file.split(path.sep).length||a.title.localeCompare(b.title,'ru'));
 return {found,limited};
}
// Steam manifests use quoted strings and nested key/value blocks. Restrict depth,
// token count and byte size; unknown fields are ignored after structural parsing.
function parseVDF(text){
 const end=text.length;let off=0, tokens=0;
 function next(){
  while(off<end){if(/\s/.test(text[off])){off++;continue;}if(text.startsWith('//',off)){const line=text.indexOf('\n',off+2);off=line<0?end:line+1;continue;}break;}
  if(off===end)return null;
  if(++tokens>20000)throw Error('Слишком много полей Steam.');
  const first=text[off++];if(first==='{'||first==='}')return first;
  if(first!=='"')throw Error('Некорректные метаданные Steam.');
  let val='';
  while(off<end){const ch=text[off++];if(ch==='"')return {val};if(ch==='\\'&&['"','\\'].includes(text[off]))val+=text[off++];else val+=ch;}
  throw Error('Некорректные метаданные Steam.');
 }
 function block(depth){
  if(depth>12)throw Error('Слишком глубокие метаданные Steam.');
  const map=new Map();
  while(true){
   const k=next();
   if(depth?k==='}':k===null)return map;
   if(!k||typeof k!=='object')throw Error('Некорректный блок Steam.');
   const v=next(),name=k.val.toLowerCase();
   if(!v||v==='}'||map.has(name))throw Error('Неоднозначные метаданные Steam.');
   map.set(name,v==='{'?block(depth+1):v.val);
  }
 }
 return block(0);
}
async function discoverSteam(input,{max=120,entries=5000}={}){
 const root=await directory(input),base=path.basename(root).toLowerCase()==='steamapps'?root:await withinDirectory(root,path.join(root,'steamapps'));
 const common=await withinDirectory(base,path.join(base,'common'));
 const found=[],seen=new Set();let inspected=0,limited=false;
 for await(const entry of await fs.opendir(base)){
  if(++inspected>entries||found.length>=max){limited=true;break;}
  const match=/^appmanifest_([1-9]\d{0,9})\.acf$/i.exec(entry.name);
  if(!match||!entry.isFile()||entry.isSymbolicLink())continue;
  try{
   const manifest=path.join(base,entry.name);await regular(base,manifest);
   const state=parseVDF(await boundedText(manifest)).get('appstate');if(!(state instanceof Map))continue;
   const id=state.get('appid'),title=state.get('name')?.trim(),install=state.get('installdir'),flags=state.get('stateflags');
   if(!steamId(id)||id!==match[1]||!title||!segment(install)||typeof flags!=='string'||!/^\d{1,9}$/.test(flags)||!(Number(flags)&4)||seen.has(id))continue;
   const folder=await withinDirectory(common,path.join(common,install));
   seen.add(id);found.push({steamAppId:id,title:title.slice(0,160),root:common,file:folder});
  }catch{}
 }
 found.sort((a,b)=>a.title.localeCompare(b.title,'ru'));
 return {found,limited};
}
const identity=row=>row.steamAppId?`steam:${row.steamAppId}`:row.file?`exe:${key(row.file)}`:null;
async function importSelected(library,candidates,indices,{max=1500}={}){
 if(!Array.isArray(indices)||!indices.length||indices.length>120||indices.some(i=>!Number.isSafeInteger(i)||i<0||!candidates[i]))throw Error('Выберите записи из предпросмотра.');
 const known=new Set(library.map(g=>identity({steamAppId:g.steamAppId,file:g.exe})));
 const pending=[];let skipped=0;
 for(const i of new Set(indices)){
  const row=candidates[i],id=identity(row);let valid=false;
  if(!known.has(id))try{valid=row.steamAppId?steamId(row.steamAppId)&&Boolean(await withinDirectory(row.root,row.file)):await isExecutable(row.root,row.file);}catch{}
  if(!valid){skipped++;continue;}
  known.add(id);pending.push({...cleanGame({title:row.title}),id:randomUUID(),lastPlayed:'',exe:row.steamAppId?'':row.file,...(row.steamAppId?{steamAppId:row.steamAppId}:{})});
 }
 if(library.length+pending.length>max)throw Error('Недостаточно мест в библиотеке (лимит 1500 игр).');
 library.push(...pending);return {added:pending.length,skipped};
}
module.exports={key,samePath,segment,under,directory,withinDirectory,regular,boundedText,steamId,parseVDF,discoverExecutables,discoverSteam,importSelected};
