const week=7;
const str=(value,n)=>typeof value==='string'?value.trim().slice(0,n):'';
const dateRx=/^\d{4}-\d{2}-\d{2}$/;
export const localDay=(now=new Date())=>`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
export function cleanDate(value){
 if(typeof value!=='string'||!dateRx.test(value))return '';
 const parsed=new Date(value+'T12:00:00');return Number.isFinite(+parsed)&&localDay(parsed)===value?value:'';
}
export function cleanJournal(input={}){
 const source=Array.isArray(input?.sessions)?input.sessions.slice(-4000):[];
 const history=source.flatMap(s=>s&&str(s.id,90)&&str(s.gameId,90)&&cleanDate(s.day)&&Number.isInteger(s.seconds)&&s.seconds>0&&s.seconds<=86400?[{id:str(s.id,90),gameId:str(s.gameId,90),title:str(s.title,160),day:s.day,seconds:s.seconds,manual:s.manual===true}]:[]);
 const moments=(Array.isArray(input?.moments)?input.moments.slice(-300):[]).flatMap(m=>m&&str(m.id,90)&&str(m.gameId,90)&&cleanDate(m.day)&&str(m.title,200)?[{id:str(m.id,90),gameId:str(m.gameId,90),title:str(m.title,200),day:m.day}]:[]);
 const goal=Number.isInteger(input?.goal)&&input.goal>=1&&input.goal<=50?input.goal:0;
 return {sessions:history,moments,goal};
}
export function statsFor(sessions,library,now=new Date()){
 const today=localDay(now),past=new Date(now);past.setDate(past.getDate()-week+1);
 const weekly=sessions.filter(s=>s.day>=localDay(past)&&s.day<=today),yearly=sessions.filter(s=>s.day.startsWith(today.slice(0,4))&&s.day<=today);
 const sum=list=>list.reduce((total,s)=>total+s.seconds,0);
 const byGame=new Map();for(const s of sessions)byGame.set(s.gameId,(byGame.get(s.gameId)||0)+s.seconds);
 const leaders=new Map();for(const s of yearly){const row=leaders.get(s.gameId)||{title:s.title,seconds:0};row.seconds+=s.seconds;leaders.set(s.gameId,row);}
 const month=today.slice(0,7),finished=library.filter(g=>g.progress==='finished'&&g.finishedAt?.startsWith(month)).length;
 const collections=[...new Set(library.flatMap(g=>g.collections||[]))].map(name=>{
  const games=library.filter(g=>g.collections?.includes(name));
  return {name,count:games.length,finished:games.filter(g=>g.progress==='finished').length,seconds:games.reduce((total,g)=>total+(byGame.get(g.id)||0),0)};
 });
 return {weekly:{count:weekly.length,games:new Set(weekly.map(s=>s.gameId)).size,seconds:sum(weekly)},yearly:{seconds:sum(yearly),games:leaders.size,count:yearly.length,top:[...leaders.values()].sort((a,b)=>b.seconds-a.seconds).slice(0,3)},finished,collections};
}
export const hours=seconds=>`${Math.floor(seconds/3600)} ч ${Math.floor(seconds%3600/60)} мин`;
function quote(value){let s=String(value??'');if(/^\s*[=+@-]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function journalCSV(sessions,library){
 const info=new Map(library.map(g=>[g.id,g]));
 return '\ufeff'+[['Дата','Игра','Секунды','Тип записи','Оценка'],...sessions.map(s=>[s.day,info.get(s.gameId)?.title||s.title,s.seconds,s.manual?'Вручную':'ByAzen',info.get(s.gameId)?.rating||''])].map(row=>row.map(quote).join(';')).join('\r\n');
}
export function suggestGames(library,sessions,minutes,collection){
 const totals=new Map();for(const s of sessions){const x=totals.get(s.gameId)||[0,0];x[0]+=s.seconds;x[1]++;totals.set(s.gameId,x);}
 return library.filter(g=>g.progress!=='finished'&&g.progress!=='shelved'&&(!collection||g.collections?.includes(collection))).map(g=>{
  const t=totals.get(g.id),usual=t?Math.ceil(t[0]/t[1]/60):null;
  return {game:g,usual};
 }).filter(row=>!row.usual||row.usual<=minutes).sort((a,b)=>Number(b.usual!==null)-Number(a.usual!==null)||Number(Boolean(b.game.favorite))-Number(Boolean(a.game.favorite))||a.game.title.localeCompare(b.game.title,'ru')).slice(0,5);
}
