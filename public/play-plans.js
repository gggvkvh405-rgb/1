import {cleanDate,localDay} from './journal.js';
export const moods=[['','Любое настроение'],['calm','Спокойное'],['story','Сюжетное'],['action','Динамичное'],['challenge','Сложное'],['creative','Творческое']];
export const playModes=[['','Любой режим'],['solo','Одиночная'],['online','Онлайн-кооператив'],['local','Локальный кооператив'],['versus','Соревновательная']];
export function playPrefs(raw){return {mood:moods.some(([key])=>key===raw?.mood)?raw.mood:'',mode:playModes.some(([key])=>key===raw?.mode)?raw.mode:'',minutes:Number.isInteger(raw?.minutes)&&raw.minutes>=5&&raw.minutes<=1440?raw.minutes:0};}
const text=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
export function cleanPlan(value,{allowPast=false,now=new Date()}={}){
 const title=text(value?.title,120),game=text(value?.game,160),day=cleanDate(value?.day),time=text(value?.time,5);
 const length=Number.isInteger(value?.length)&&value.length>=15&&value.length<=720?value.length:0;
 if(!title||!game||!day||(!allowPast&&day<localDay(now))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!length)throw Error('Укажите название, игру, дату, время и длительность от 15 минут до 12 часов.');
 return {title,game,day,time,length,people:text(value.people,250),notes:text(value.notes,1000)};
}
export function cleanPlans(rows){return Array.isArray(rows)?rows.slice(0,100).flatMap(r=>{try{return typeof r?.id==='string'&&r.id.length<=80?[{id:r.id,...cleanPlan(r,{allowPast:true})}]:[];}catch{return [];}}):[];}
const icsText=v=>v.replaceAll('\\','\\\\').replace(/\r?\n|\r/g,'\\n').replaceAll(',','\\,').replaceAll(';','\\;');
const icsTime=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
function fold(line){let sum=0,s='';const encoder=new TextEncoder();for(const ch of line){const bytes=encoder.encode(ch).length;if(sum+bytes>75){s+='\r\n ';sum=1;}s+=ch;sum+=bytes;}return s;}
export function planICS(plan,now=new Date()){
 const [y,m,d]=plan.day.split('-').map(Number),[h,min]=plan.time.split(':').map(Number),start=new Date(y,m-1,d,h,min),end=new Date(+start+plan.length*60000);
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ByAzen//Play Plans//RU','BEGIN:VEVENT',`UID:${String(plan.id).replace(/[^a-z0-9-]/gi,'')}@byazen.local`,`DTSTAMP:${icsTime(now)}`,`DTSTART:${icsTime(start)}`,`DTEND:${icsTime(end)}`,`SUMMARY:${icsText(plan.title)}`,`DESCRIPTION:${icsText(['Игра: '+plan.game,plan.people?'Участники: '+plan.people:'',plan.notes].filter(Boolean).join('\n'))}`,'END:VEVENT','END:VCALENDAR',''].map(fold).join('\r\n');
}
