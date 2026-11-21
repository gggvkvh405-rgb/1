const path=require('node:path');
const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const {segment,directory,withinDirectory,regular,samePath}=require('./installed-games.cjs');
const {cleanGame}=require('./library.cjs');
const {updateSettings}=require('./state.cjs');
const partialID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const titles=name=>name.normalize('NFKC').trim().toLocaleLowerCase('ru');
const maxMigration=12*1024*1024;
const migrationKind='byazen-migration';
const shortList=(a,n)=>[...new Set((Array.isArray(a)?a:[]).slice(0,n).filter(x=>typeof x==='string').map(x=>x.trim().slice(0,50)).filter(Boolean))];
function copyCard(g){const info=cleanGame({...g,profiles:[]});delete info.profiles;return {...info,tags:shortList(g.tags,15),cover:/^(cyberpunk|elden|geometry|ghost|gta|last|onimusha|rdr|spider)$/.test(g.cover)?g.cover:''};}
function migrationExport(data){return JSON.stringify({format:migrationKind,version:1,settings:updateSettings(data.settings),library:data.library.map(copyCard)});}
function readMigration(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>maxMigration)throw Error('Требуется пакет ByAzen до 12 МБ.');
 let pack;try{pack=JSON.parse(raw);}catch{throw Error('Некорректный JSON.');}
 if(pack?.format!==migrationKind||pack.version!==1||!Array.isArray(pack.library)||pack.library.length>1500||!pack.settings||typeof pack.settings!=='object')throw Error('Неизвестный формат пакета ByAzen.');
 return {library:pack.library.map(copyCard),settings:updateSettings(pack.settings)};
}
function freshCards(library,pack){const used=new Set(library.map(g=>titles(g.title)));return pack.library.filter(g=>{const name=titles(g.title);if(used.has(name))return false;used.add(name);return true;}).slice(0,1500-library.length);}
function adoptMigration(data,pack,includeGames,includeSettings){
 if(typeof includeGames!=='boolean'||typeof includeSettings!=='boolean'||!includeGames&&!includeSettings)throw Error('Выберите, что перенести.');
 const cards=includeGames?freshCards(data.library,pack):[];
 data.library.push(...cards.map(g=>({...g,id:randomUUID(),exe:'',profiles:[],lastPlayed:'',finishedAt:''})));
 if(includeSettings)data.settings=pack.settings;
 return {added:cards.length,skipped:includeGames?pack.library.length-cards.length:0};
}
function cleanRequired(value){
 if(!Array.isArray(value)||value.length>80)throw Error('Можно указать до 80 относительных путей.');
 const names=new Map();
 for(const input of value){
  const name=typeof input==='string'?input.trim().replaceAll('\\','/'):'';
  if(!name||name.length>400||name.split('/').length>16||!name.split('/').every(segment))throw Error('Нужны относительные пути без «..», дисков и служебных имён.');
  if(!names.has(name.toLowerCase()))names.set(name.toLowerCase(),name);
 }
 return [...names.values()];
}
async function verifyFiles(game){
 const exe=game.exe;if(typeof exe!=='string'||!path.isAbsolute(exe)||path.extname(exe).toLowerCase()!=='.exe')throw Error('Выберите файл .exe для этой игры.');
 const root=await directory(path.dirname(exe)),required=cleanRequired(game.requiredFiles||[]),names=[...new Set([path.basename(exe),...required])];
 return Promise.all(names.map(async name=>{
  const target=path.join(root,...name.split('/'));
  try{const st=await regular(root,target);return {name,ok:true,bytes:st.size};}catch(e){return {name,ok:false,reason:e.code==='ENOENT'?'Не найден':'Недоступен или ссылка'};}
 }));
}
async function diskReport(folder){
 const root=await directory(folder),pending=[[root,0,'Файлы в корне']],groups=new Map(),limit=8000;
 let count=0,total=0,visited=0,partial=false,skipped=0;
 while(pending.length&&visited<limit){
  const [current,depth,key]=pending.pop();
  try{if(depth)await withinDirectory(root,current);
   for await(const item of await fs.opendir(current)){
    if(++visited>limit)break;
    if(!segment(item.name)||item.isSymbolicLink()){skipped++;continue;}
    const p=path.join(current,item.name);
    if(item.isDirectory()){if(depth>=8){partial=true;continue;}pending.push([p,depth+1,depth?key:item.name]);continue;}
    if(!item.isFile()){skipped++;continue;}
    try{const st=await regular(root,p);count++;total+=st.size;groups.set(key,(groups.get(key)||0)+st.size);}catch{skipped++;}
   }
  }catch{if(depth)skipped++;else throw Error('Не удалось прочитать выбранную папку.');}
 }
 let free=null,capacity=null;try{const x=await fs.statfs(root);free=x.bavail*x.bsize;capacity=x.blocks*x.bsize;}catch{}
 return {folder:root,total,count,free,capacity,partial:partial||visited>=limit,skipped,groups:[...groups].map(([name,bytes])=>({name,bytes})).sort((a,b)=>b.bytes-a.bytes).slice(0,20)};
}
async function previewCleanup(items){
 const out=[];for(const job of items){
  if(out.length>=100)break;
  if(job.kind==='torrent'||!partialID.test(job.id)||!['canceled','done'].includes(job.status)||!job.partial||typeof job.file!=='string'||!path.isAbsolute(job.file))continue;
  const filename=`.byazen-${job.id}.part`,parent=path.dirname(job.file),target=path.join(parent,filename);
  if(!samePath(target,job.partial))continue;
  try{
   const root=await directory(parent),file=path.join(root,filename),st=await regular(root,file);
   out.push({id:job.id,title:job.title,root,file,bytes:st.size,mtime:st.mtimeMs,ino:st.ino,dev:st.dev});
  }catch{}
 }
 return out;
}
async function cleanup(items,plan){
 const fresh=await previewCleanup(items),rows=new Map(fresh.map(r=>[r.id,r]));
 for(const r of plan){const next=rows.get(r.id);if(!next||!samePath(r.file,next.file)||next.bytes!==r.bytes||next.mtime!==r.mtime||next.ino!==r.ino||next.dev!==r.dev)throw Error('Состояние файлов изменилось. Откройте предпросмотр заново.');}
 let removed=0,failed=0;for(const row of plan){try{const st=await regular(row.root,row.file);if(st.size!==row.bytes||st.mtimeMs!==row.mtime||st.ino!==row.ino||st.dev!==row.dev)throw Error();await fs.unlink(row.file);removed++;}catch{failed++;}}
 return {removed,failed};
}
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function collectionHTML(library,name){
 if(typeof name!=='string'||name.length>50)throw Error('Коллекция не найдена.');
 const rows=library.filter(g=>name===''||g.collections?.includes(name));if(!rows.length)throw Error('Коллекция пуста.');
 const label=name||'Моя коллекция игр',statuses={planned:'По плану',playing:'В процессе',finished:'Пройдена',shelved:'Отложена'};
 return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${html(label)} — ByAzen</title><style>body{max-width:920px;margin:40px auto;padding:0 20px;color:#f4f0ff;background:#111019;font:1rem/1.55 system-ui}header{color:#d3bfff}ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}li{border:1px solid #655a82;border-radius:12px;padding:12px;overflow-wrap:anywhere}small{display:block;color:#ded5fa}</style><header><p>BYAZEN · ${rows.length} игр</p><h1>${html(label)}</h1></header><ul>${rows.map(g=>`<li><strong>${html(g.title)}</strong><small>${html(statuses[g.progress]||'')}${g.rating?` · ${html(g.rating)}/10`:''}</small></li>`).join('')}</ul></html>`;
}
module.exports={maxMigration,migrationExport,readMigration,freshCards,adoptMigration,cleanRequired,verifyFiles,diskReport,previewCleanup,cleanup,collectionHTML};
