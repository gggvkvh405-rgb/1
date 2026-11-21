const {load}=require('cheerio');
const {getJSON}=require('./net.cjs');
const {steamImage}=require('./steam.cjs');
const REGIONS=new Set(['DE','US','GB','FR','PL','CA','UA','KZ','BR','JP','RU']);
const ORIGIN='https://store.steampowered.com';
const MEDIA=new Set(['cdn.akamai.steamstatic.com','cdn.cloudflare.steamstatic.com','cdn.fastly.steamstatic.com','shared.fastly.steamstatic.com','shared.akamai.steamstatic.com','shared.cloudflare.steamstatic.com','video.fastly.steamstatic.com','video.akamai.steamstatic.com','video.cloudflare.steamstatic.com','steamcdn-a.akamaihd.net']);
const text=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const validSteamId=id=>typeof id==='string'&&/^[1-9]\d{0,9}$/.test(id)&&+id<=4_294_967_295;
const region=cc=>REGIONS.has(cc)?cc:'DE';
function mediaURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&MEDIA.has(u.hostname)&&/\.(?:mp4|webm)$/i.test(u.pathname)?u.href:'';}catch{return '';}}
const months='jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
function releaseDay(input){
 const s=text(input,80).replace(/\./g,'');let m=s.match(/^(\d{1,2}) ([A-Za-z]{3,9}),? (\d{4})$/);
 if(!m){const us=s.match(/^([A-Za-z]{3,9}) (\d{1,2}),? (\d{4})$/);if(us)m=[us[0],us[2],us[1],us[3]];}
 if(!m)return '';
 const mon=months.indexOf(m[2].slice(0,3).toLowerCase())+1,year=Number(m[3]),day=Number(m[1]);
 if(!mon||year<1980||year>2200||day<1||day>new Date(Date.UTC(year,mon,0)).getUTCDate())return '';
 return `${m[3]}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function sanitizeDetails(payload,id,cc){
 const item=payload?.[id];if(!item?.success||!item.data||String(item.data.steam_appid)!==id)throw Error('У Steam нет данных об этой игре для выбранного региона.');
 const d=item.data,p=d.price_overview;
 const price=/^[A-Z]{3}$/.test(p?.currency)&&Number.isSafeInteger(p?.final)&&p.final>=0?{minor:p.final,currency:p.currency,formatted:text(p.final_formatted,70),discount:Number.isInteger(p.discount_percent)&&p.discount_percent>0&&p.discount_percent<=100?p.discount_percent:0}:null;
 const desc=typeof d.short_description==='string'?load(d.short_description.slice(0,15000),{},false).text().replace(/\s+/g,' ').trim().slice(0,1700):'';
 const arrays=(a,n)=>Array.isArray(a)?a.slice(0,n):[];
 return {id,cc,name:text(d.name,200),type:text(d.type,40),description:desc,image:steamImage(d.header_image),price,free:d.is_free===true,
  genres:arrays(d.genres,8).map(x=>text(x?.description,70)).filter(Boolean),developers:arrays(d.developers,5).map(x=>text(x,80)).filter(Boolean),
  platforms:['windows','mac','linux'].filter(x=>d.platforms?.[x]===true),categories:arrays(d.categories,80).map(x=>x?.id).filter(Number.isInteger),
  release:text(d.release_date?.date,80),day:releaseDay(d.release_date?.date),upcoming:d.release_date?.coming_soon===true,
  screenshots:arrays(d.screenshots,8).map(x=>steamImage(x?.path_full)).filter(Boolean),
  videos:arrays(d.movies,3).map(x=>({url:[x?.mp4?.['480'],x?.webm?.['480'],x?.mp4?.max,x?.webm?.max].map(mediaURL).find(Boolean),name:text(x?.name,100)})).filter(v=>v.url)};
}
function createSteamDetails({read=getJSON,now=Date.now}={}){
 const running=new Map(),cache=new Map();
 return async (id,country)=>{
  if(!validSteamId(id))throw Error('Неверный Steam App ID.');
  const cc=region(country),key=`${id}:${cc}`,prev=cache.get(key);
  if(prev&&now()-prev.at<12*60000)return prev.data;
  if(running.has(key))return running.get(key);
  if(running.size>=4)throw Error('Слишком много запросов Steam. Повторите немного позже.');
  const url=new URL('/api/appdetails',ORIGIN);url.searchParams.set('appids',id);url.searchParams.set('cc',cc);url.searchParams.set('l','english');
  const task=Promise.resolve().then(()=>read(url.href,{max:2_000_000,validate:u=>{if(u.origin!==ORIGIN||u.pathname!=='/api/appdetails')throw Error('Неожиданное перенаправление Steam.');}})).then(json=>{
   const data=sanitizeDetails(json,id,cc);cache.delete(key);cache.set(key,{data,at:now()});if(cache.size>180)cache.delete(cache.keys().next().value);return data;
  }).finally(()=>running.delete(key));
  running.set(key,task);return task;
 };
}
function cleanStore(raw){
 const rows=Array.isArray(raw?.wishes)?raw.wishes.slice(0,75):[],seen=new Set();
 return {wishes:rows.filter(x=>validSteamId(x?.id)&&!seen.has(x.id)&&seen.add(x.id)).map(x=>({id:x.id,title:text(x.title,200),cc:region(x.cc),notes:text(x.notes,1500),
  currency:/^[A-Z]{3}$/.test(x.currency)?x.currency:'',threshold:Number.isInteger(x.threshold)&&x.threshold>=0&&x.threshold<=100_000_000?x.threshold:null,
  checked:Number.isSafeInteger(x.checked)&&x.checked>=0?x.checked:0,notified:x.notified===true,view:x.view&&typeof x.view==='object'?{release:text(x.view.release,80),day:/^\d{4}-\d\d-\d\d$/.test(x.view.day)?x.view.day:'',upcoming:x.view.upcoming===true,formatted:text(x.view.formatted,70),discount:Number.isInteger(x.view.discount)?x.view.discount:0}:null}))};
}
function saveWish(store,d,raw,notify=()=>{}){
 if(!validSteamId(d?.id))throw Error('Карточка Steam недоступна.');
 const old=store.wishes.find(x=>x.id===d.id);if(!old&&store.wishes.length>=75)throw Error('Лимит желаемого — 75 игр.');
 const threshold=raw?.threshold;
 if(threshold!==null&&(!Number.isSafeInteger(threshold)||threshold<0||threshold>100_000_000||!d.price?.currency))throw Error('Чтобы задать порог, нужна цена Steam в выбранном регионе.');
 const row={id:d.id,title:d.name,cc:d.cc,notes:text(raw?.notes,1500),threshold,currency:threshold===null?'':d.price.currency,checked:0,notified:old?.threshold===threshold&&old?.currency===d.price?.currency&&old?.cc===d.cc&&old.notified===true};
 if(updateWish(row,d))notify('Скидка Steam',`${row.title} · ${d.price.formatted||d.price.currency}`,'catalog');if(old)Object.assign(old,row);else store.wishes.unshift(row);return row;
}
function updateWish(row,d){
 row.title=d.name||row.title;
 row.view={release:d.release,day:d.day,upcoming:d.upcoming,formatted:d.price?.formatted||'',discount:d.price?.discount||0};
 const p=d.price;
 if(row.threshold==null||!p||p.currency!==row.currency)return false;
 const hit=p.discount>0&&p.minor<=row.threshold;
 if(!hit){row.notified=false;return false;}
 if(row.notified)return false;
 row.notified=true;return true;
}
function wishMonitor(store,read,persist,notify,now=Date.now){
 let running=false;
 return async (force=false)=>{
  if(running)return {checked:0,failed:0};running=true;let checked=0,failed=0;
  try{const due=store.wishes.filter(w=>(force||w.threshold!==null)&&(!w.checked||now()-w.checked>=(force?60000:6*3600000))).sort((a,b)=>a.checked-b.checked).slice(0,force?8:2);
   for(const row of due){try{const d=await read(row.id,row.cc);if(!store.wishes.includes(row))continue;
    if(updateWish(row,d))notify('Скидка Steam',`${row.title} · ${d.price.formatted||d.price.currency}`,'catalog');checked++;
   }catch{failed++;}finally{if(store.wishes.includes(row))row.checked=now();}}
   if(due.length)persist();return {checked,failed};
  }finally{running=false;}
 };
}
module.exports={validSteamId,region,mediaURL,releaseDay,sanitizeDetails,createSteamDetails,cleanStore,saveWish,updateWish,wishMonitor};
