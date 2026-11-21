import {isTheme} from './themes.js';
export const navIds=['home','catalog','library','downloads','rankings','journal','settings'];
export const shortcutDefaults={search:'Ctrl+K',library:'Alt+L',downloads:'Alt+D',journal:'Alt+J'};
const soundNames=new Set(['off','soft','arcade','winter','autumn','spring','summer']);
const intros=new Set(['off','fade','scan']);
const clockRx=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const b=(v,min,max,fallback)=>Number.isInteger(v)&&v>=min&&v<=max?v:fallback;
const theme=v=>isTheme(v)?v:'';
const keyPattern=/^(?:Ctrl\+|Alt\+)(?:Shift\+)?[A-Z0-9]$/;
const restricted=/^(?:Ctrl\+(?:[ACFJNPSVWXZ0-9]|Shift\+[IJ])|Alt\+F)$/;
export function cleanPersonal(raw={}){
 const sectionThemes=Object.fromEntries([...navIds,'sources'].map(id=>[id,theme(raw?.sectionThemes?.[id])]).filter(([,v])=>v));
 const visible=(Array.isArray(raw?.nav)?raw.nav:navIds).filter(v=>navIds.includes(v));
 const nav=[...new Set([...visible,'settings'])];
 const used=new Set(),keys={};
 for(const [id,defaultKey] of Object.entries(shortcutDefaults)){
  const input=raw?.keys?.[id];
  const valid=typeof input==='string'&&keyPattern.test(input)&&!restricted.test(input);
  const v=input===''?'':valid?input:defaultKey;keys[id]=v&&!used.has(v)?v:'';if(keys[id])used.add(keys[id]);
 }
 const schedule=raw?.schedule;
 return {sectionThemes,nav,keys,schedule:{enabled:schedule?.enabled===true,time:typeof schedule?.time==='string'&&clockRx.test(schedule.time)?schedule.time:'20:00',day:theme(schedule?.day)||'light',night:theme(schedule?.night)||'oled'},
  parallax:raw?.parallax===true,tv:raw?.tv===true,gamepad:raw?.gamepad===true,contrast:raw?.contrast===true,compact:raw?.compact===true,tray:raw?.tray===true,
  uiScale:b(raw?.uiScale,75,150,100),textScale:b(raw?.textScale,85,135,100),slideSeconds:b(raw?.slideSeconds,5,180,25),
  sound:soundNames.has(raw?.sound)?raw.sound:'off',volume:b(raw?.volume,0,100,25),intro:intros.has(raw?.intro)?raw.intro:'off'};
}
export function wallpaperTheme(personal,section,base,date=new Date()){
 if(personal.sectionThemes[section])return personal.sectionThemes[section];
 if(!personal.schedule.enabled)return base;
 const [hour,min]=personal.schedule.time.split(':').map(Number),now=date.getHours()*60+date.getMinutes();
 return now<hour*60+min&&now>=6*60?personal.schedule.day:personal.schedule.night;
}
export function keyFromEvent(e){
 if(e.metaKey||e.ctrlKey===e.altKey||!/^Key[A-Z]$|^Digit\d$/.test(e.code))return '';
 return (e.ctrlKey?'Ctrl+':'Alt+')+(e.shiftKey?'Shift+':'')+e.code.at(-1);
}
export const seasons=[['winter','Зимний вечер','scene-photo-snow','winter'],['spring','Весенний сад','scene-photo-macro','spring'],['summer','Летний прибой','scene-photo-coast','summer'],['autumn','Осенний клён','theme-48','autumn']];
