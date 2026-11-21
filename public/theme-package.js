import {isTheme} from './themes.js';
import {cleanAppearance} from './appearance.js';
import {prepareWallpaper} from './wallpaper-store.js';
const prefix='data:image/jpeg;base64,';
const maxLength=24*1024*1024;
const encode=async blob=>{const data=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<data.length;i+=16384)binary+=String.fromCharCode(...data.subarray(i,i+16384));return btoa(binary);};
export async function packTheme(settings,wallpaper){
 const image=wallpaper?.enabled?{data:prefix+await encode(wallpaper.blob),name:wallpaper.name,fit:wallpaper.fit}:null;
 return JSON.stringify({format:'byazen-theme',version:1,theme:settings.theme,appearance:cleanAppearance(settings.appearance),image});
}
export function validateThemePackage(text){
 if(typeof text!=='string'||text.length>maxLength)throw Error('Пакет темы слишком большой.');
 let parsed;try{parsed=JSON.parse(text);}catch{throw Error('Ожидается файл темы ByAzen в формате JSON.');}
 if(parsed?.format!=='byazen-theme'||parsed.version!==1||!isTheme(parsed.theme))throw Error('Неизвестный формат темы ByAzen.');
 let image=null;
 if(parsed.image!=null){const {data,name,fit}=parsed.image;if(typeof data!=='string'||!data.startsWith(prefix)||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('В пакете нет допустимого изображения.');image={data:data.slice(prefix.length),name:typeof name==='string'?name.slice(0,120):'Тема ByAzen',fit:fit==='contain'?'contain':'cover'};}
 return {theme:parsed.theme,appearance:cleanAppearance(parsed.appearance),image};
}
export async function unpackTheme(file){
 if(!file||file.size>maxLength)throw Error('Пакет темы слишком большой.');
 const pack=validateThemePackage(await file.text());
 let wallpaper=null;
 if(pack.image){
  let bytes;try{bytes=Uint8Array.from(atob(pack.image.data),ch=>ch.charCodeAt(0));}catch{throw Error('Повреждённое изображение в пакете.');}
  if(bytes[0]!==0xff||bytes[1]!==0xd8)throw Error('Некорректный JPEG в пакете.');
  wallpaper={...await prepareWallpaper(new File([bytes],pack.image.name,{type:'image/jpeg'})),fit:pack.image.fit};
 }
 return {theme:pack.theme,appearance:pack.appearance,wallpaper};
}
