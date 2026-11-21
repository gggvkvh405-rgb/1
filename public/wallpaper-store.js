const MAX_INPUT=16*1024*1024,MAX_PIXELS=28_000_000,MAX_EDGE=12000,OUTPUT_EDGE=2560;
const jpegFrames=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
const ascii=(a,i,s)=>[...s].every((c,j)=>a[i+j]===c.charCodeAt(0));
function checkDimensions(w,h){
 if(!w||!h||w>MAX_EDGE||h>MAX_EDGE||w*h>MAX_PIXELS)throw Error('Слишком большое изображение. Лимит — 28 мегапикселей и 12 000 пикселей по стороне.');
 return {width:w,height:h};
}
export function imageDimensions(bytes){
 const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const d=new DataView(a.buffer,a.byteOffset,a.byteLength);
 if(a.length>=24&&a[0]===0x89&&ascii(a,1,'PNG\r\n\x1a\n')&&d.getUint32(8)===13&&ascii(a,12,'IHDR'))return checkDimensions(d.getUint32(16),d.getUint32(20));
 if(a.length>=4&&a[0]===0xff&&a[1]===0xd8){
  let i=2;
  while(i+3<a.length&&a[i]===0xff){
   while(a[i]===0xff)i++;
   const marker=a[i++];
   if(marker===0xd9||marker===0xda||i+2>a.length)break;
   const len=d.getUint16(i);
   if(len<2||i+len>a.length)break;
   if(jpegFrames.has(marker)&&len>=8)return checkDimensions(d.getUint16(i+5),d.getUint16(i+3));
   i+=len;
  }
 }
 if(a.length>=25&&ascii(a,0,'RIFF')&&ascii(a,8,'WEBP')){
  const u24=i=>a[i]+a[i+1]*256+a[i+2]*65536;
  if(a.length>=30&&ascii(a,12,'VP8X')&&d.getUint32(16,true)>=10)return checkDimensions(u24(24)+1,u24(27)+1);
  if(a.length>=30&&ascii(a,12,'VP8 ')&&d.getUint32(16,true)>=10&&a[23]===0x9d&&a[24]===1&&a[25]===0x2a)return checkDimensions(d.getUint16(26,true)&0x3fff,d.getUint16(28,true)&0x3fff);
  if(ascii(a,12,'VP8L')&&d.getUint32(16,true)>=5&&a[20]===0x2f){const bits=d.getUint32(21,true);return checkDimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);}
 }
 throw Error('Выберите корректное изображение JPG, PNG или WebP.');
}
export async function prepareWallpaper(file){
 if(!file?.size||file.size>MAX_INPUT)throw Error('Требуется изображение размером до 16 МБ.');
 imageDimensions(await file.arrayBuffer());
 let bitmap;
 try{bitmap=await createImageBitmap(file);}catch{throw Error('Не удалось открыть изображение. Попробуйте другой файл.');}
 try{
  checkDimensions(bitmap.width,bitmap.height);
  const scale=Math.min(1,OUTPUT_EDGE/Math.max(bitmap.width,bitmap.height)),output=document.createElement('canvas');
  output.width=Math.max(1,Math.round(bitmap.width*scale));output.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=output.getContext('2d',{alpha:false});ctx.fillStyle='#101018';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(bitmap,0,0,output.width,output.height);
  const blob=await new Promise(resolve=>output.toBlob(resolve,'image/jpeg',.89));
  if(!blob||blob.size>MAX_INPUT)throw Error('Не удалось подготовить фон.');
  return {blob,name:String(file.name||'Изображение').replace(/[\x00-\x1f\x7f]/g,'').slice(0,120),fit:'cover',enabled:true};
 }finally{bitmap.close();}
}
function openStore(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('byazen-wallpaper',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('wallpapers');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=request.onblocked=()=>reject(Error('Хранилище фонов недоступно.'));
 });
}
async function transact(mode,perform){
 const db=await openStore();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('wallpapers',mode),request=perform(tx.objectStore('wallpapers'));
   tx.oncomplete=()=>resolve(request.result);
   tx.onabort=()=>reject(Error('Не удалось сохранить или прочитать фон.'));
  });
 }finally{db.close();}
}
export async function readWallpaper(){
 const value=await transact('readonly',s=>s.get('custom'));
 if(!(value?.blob instanceof Blob)||value.blob.type!=='image/jpeg'||!value.blob.size||value.blob.size>MAX_INPUT)return null;
 return {blob:value.blob,name:typeof value.name==='string'?value.name.slice(0,120):'Изображение',fit:value.fit==='contain'?'contain':'cover',enabled:value.enabled===true};
}
export function saveWallpaper(value){
 return transact('readwrite',s=>value?s.put(value,'custom'):s.delete('custom'));
}
export const slideshowIO={
 read:async()=>{const rows=await transact('readonly',s=>s.get('slides'));return Array.isArray(rows)?rows.filter(x=>x instanceof Blob&&x.type==='image/jpeg'&&x.size>0&&x.size<=MAX_INPUT).slice(0,12):[];},
 save:rows=>transact('readwrite',s=>rows.length?s.put(rows,'slides'):s.delete('slides'))
};
export async function deriveAccent(pic){
 if(!pic)throw Error('Сначала выберите фон.');
 await pic.decode();
 const canvas=document.createElement('canvas');canvas.width=24;canvas.height=24;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(pic,0,0,24,24);
 return paletteAccent(ctx.getImageData(0,0,24,24).data);
}
export function paletteAccent(rgba){
 const boxes=new Map();
 for(let i=0;i<rgba.length;i+=4){
  if(rgba[i+3]<128)continue;
  const r=rgba[i],g=rgba[i+1],b=rgba[i+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b),s=hi-lo;
  if(hi<38||s<18)continue;
  const key=((r>>5)<<6)|((g>>5)<<3)|(b>>5),weight=1+s/80,v=boxes.get(key)||[0,0,0,0];
  v[0]+=r*weight;v[1]+=g*weight;v[2]+=b*weight;v[3]+=weight;boxes.set(key,v);
 }
 const first=[...boxes.values()].sort((a,b)=>b[3]-a[3])[0];
 return first?'#'+first.slice(0,3).map(v=>Math.round(v/first[3]).toString(16).padStart(2,'0')).join(''):'#bfa9ff';
}
const VIDEO_LIMIT=80*1024*1024;
export function videoMime(bytes){
 if(bytes.length>=12&&ascii(bytes,4,'ftyp')&&bytes[0]===0&&bytes[1]===0)return 'video/mp4';
 if(bytes.length>=4&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3&&new TextDecoder().decode(bytes).toLowerCase().includes('webm'))return 'video/webm';
 return '';
}
export async function prepareVideo(file){
 if(!file?.size||file.size>VIDEO_LIMIT)throw Error('Выберите MP4 или WebM до 80 МБ.');
 const mime=videoMime(new Uint8Array(await file.slice(0,4096).arrayBuffer()));
 if(!mime)throw Error('Файл не похож на MP4 или WebM.');
 const blob=file.slice(0,file.size,mime),video=document.createElement('video'),url=URL.createObjectURL(blob);
 let timer;
 try{
  await new Promise((resolve,reject)=>{video.preload='metadata';video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Кодек видео не поддерживается.'));timer=setTimeout(()=>reject(Error('Не удалось прочитать видео.')),8000);video.src=url;});
  if(!video.videoWidth||!video.videoHeight||!Number.isFinite(video.duration)||video.duration<=0||video.duration>1200||video.videoWidth*video.videoHeight>3840*2160||Math.max(video.videoWidth,video.videoHeight)>4096)throw Error('Нужно видео до 4K и не длиннее 20 минут.');
  return {blob,name:String(file.name||'Видеофон').replace(/[\x00-\x1f\x7f]/g,'').slice(0,120)};
 }finally{clearTimeout(timer);video.onerror=null;video.onloadedmetadata=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
export const backgroundVideo={read:async()=>{const r=await transact('readonly',s=>s.get('video'));return r?.blob instanceof Blob&&['video/mp4','video/webm'].includes(r.blob.type)&&r.blob.size&&r.blob.size<=VIDEO_LIMIT?{blob:r.blob,name:String(r.name||'Видео').slice(0,120)}:null;},save:r=>transact('readwrite',s=>r?s.put(r,'video'):s.delete('video'))};
export const userThemeStore={read:async()=>{const r=await transact('readonly',s=>s.get('user-themes'));return Array.isArray(r)?r.slice(0,12):[];},save:rows=>transact('readwrite',s=>s.put(rows.slice(0,12),'user-themes'))};
