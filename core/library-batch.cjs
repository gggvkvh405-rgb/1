const path=require('node:path');
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const {directory,regular,under}=require('./installed-games.cjs');
const {prepareLaunch}=require('./library.cjs');
const {imageDimensions}=require('../public/wallpaper-store.js');
const coverSet=new Set(['cyberpunk','elden','geometry','ghost','gta','last','onimusha','rdr','spider']);
const nameList=raw=>[...new Set((Array.isArray(raw)?raw:[]).slice(0,30).filter(x=>typeof x==='string').map(x=>x.trim().slice(0,50)).filter(Boolean))].slice(0,15);
function updateBatch(library,ids,input){
 if(!Array.isArray(ids)||!ids.length||ids.length>1500||ids.some(id=>typeof id!=='string'))throw Error('Отметьте игры.');
 const unique=new Set(ids),selected=library.filter(g=>unique.has(g.id));
 if(selected.length!==unique.size)throw Error('Библиотека изменилась.');
 const collections=nameList(input?.collections),tags=nameList(input?.tags),cover=typeof input?.cover==='string'?input.cover:'';
 if(cover&&cover!=='clear'&&!coverSet.has(cover))throw Error('Неизвестная обложка.');
 if(!collections.length&&!tags.length&&!cover)throw Error('Укажите хотя бы одно изменение.');
 for(const g of selected){g.collections=nameList([...(g.collections||[]),...collections]);g.tags=nameList([...(g.tags||[]),...tags]);if(cover)g.cover=cover==='clear'?'':cover;}
 return {updated:selected.length};
}
async function prepareMove(library,previous,destination){
 if(typeof previous!=='string'||previous.length>1000||!path.isAbsolute(previous)||/[\x00-\x1f]/.test(previous)||process.platform==='win32'&&!/^[a-z]:\\/i.test(previous))throw Error('Укажите прежний абсолютный путь к папке.');
 previous=path.resolve(previous);
 const root=await directory(destination),moves=[];
 let skipped=0,truncated=false;
 for(const g of library){
  if(moves.length>=120){truncated=true;break;}
  if(g.steamAppId||typeof g.exe!=='string'||!g.exe||!under(previous,g.exe))continue;
  const next=path.join(root,path.relative(previous,g.exe));
  if(path.extname(next).toLowerCase()!=='.exe'||next.toLowerCase()===g.exe.toLowerCase()||!await regular(root,next).catch(()=>null)){skipped++;continue;}
  moves.push({id:g.id,title:g.title,previous:g.exe,next});
 }
 return {root,moves,skipped,truncated};
}
async function applyMove(library,plan){
 if(!plan?.moves.length)throw Error('Нет путей для исправления.');
 const pending=[];
 for(const row of plan.moves){
  const game=library.find(g=>g.id===row.id);
  if(!game||game.exe!==row.previous||game.steamAppId)throw Error('Библиотека изменилась. Проверьте пути повторно.');
  await regular(plan.root,row.next);
  if(process.platform==='win32')await prepareLaunch(row.next);
  pending.push([game,row.next]);
 }
 for(const [g,next] of pending)g.exe=next;
 return {updated:pending.length};
}
async function findScreenshots(folder){
 const root=await directory(folder),found=[];
 for await(const [i,item] of numbered(await fs.opendir(root))){
  if(i>=1000)break;
  if(!item.isFile()||!/(?:\.jpe?g|\.png|\.webp)$/i.test(item.name))continue;
  const file=path.join(root,item.name),st=await regular(root,file).catch(()=>null);
  if(st&&st.size<=8*1024*1024)found.push({file,title:item.name,date:st.mtime.toISOString()});
 }
 return {root,items:found.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,60)};
}
async function* numbered(dir){let i=0;for await(const item of dir)yield[i++,item];}
async function readScreenshot(plan,index){
 const row=Number.isInteger(index)&&plan.items[index];if(!row)throw Error('Кадр не найден.');
 const stat=await regular(plan.root,row.file);if(stat.size>8*1024*1024)throw Error('Кадр слишком большой.');
 const fd=await fs.open(row.file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));try{
  const opened=await fd.stat();if(!opened.isFile()||opened.ino!==stat.ino||opened.dev!==stat.dev||opened.size!==stat.size)throw Error('Кадр изменился.');
  const bytes=Buffer.alloc(stat.size+1);let read=0;
  while(read<bytes.length){const {bytesRead}=await fd.read(bytes,read,bytes.length-read,read);if(!bytesRead)break;read+=bytesRead;}
  if(read!==stat.size)throw Error('Кадр изменился.');
  const data=bytes.subarray(0,read);imageDimensions(data);
  const mime=data[0]===0xff?'image/jpeg':data[0]===0x89?'image/png':'image/webp';
  return {data,mime};
 }finally{await fd.close();}
}
module.exports={updateBatch,prepareMove,applyMove,findScreenshots,readScreenshot};
