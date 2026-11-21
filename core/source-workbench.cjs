const {createHash,randomUUID}=require('node:crypto');
const {sourceMatches,releaseKey}=require('../public/source-search.js');
const label=(s,n)=>typeof s==='string'?s.trim().slice(0,n):'';
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,32);
const limits=[0,1,6,12,24,72,168];
const plain=s=>s&&typeof s==='object'&&!Array.isArray(s)?s:{};
const exact=g=>JSON.stringify([g.title,g.size,g.date,[...(g.links||[])].sort()]);
const fingerprint=g=>hash(exact(g));
const versionKey=g=>JSON.stringify([g.title,g.date]);
const cleanList=(x,n)=>Array.isArray(x)?x.slice(0,n):[];
function cleanWorkbench(raw){
 const work=plain(raw);
 return {aliases:cleanList(work.aliases,100).filter(x=>Array.isArray(x)&&releaseKey(label(x[0],200))&&releaseKey(label(x[1],200))).map(x=>[label(x[0],200),label(x[1],200)]),
  watch:cleanList(work.watch,30).filter(x=>label(x?.title,200)).map(x=>({id:label(x.id,80),title:label(x.title,200),present:x.present===true})),
  bookmarks:cleanList(work.bookmarks,100).filter(x=>x&&/^[a-f\d]{32}$/.test(x.sig)).map(x=>({id:label(x.id,80),sourceId:label(x.sourceId,80),source:label(x.source,100),title:label(x.title,200),date:label(x.date,32),sig:x.sig})),
  log:Object.fromEntries(Object.entries(plain(work.log)).slice(0,48).map(([id,x])=>[id,cleanList(x,20)]))};
}
function snapshotDiff(before,after){
 // Match a release by title and upload date, then compare every variant's size/links.
 function summarize(games){const map=new Map();for(const row of games){const key=versionKey(row),sig=fingerprint(row),old=map.get(key);if(old){old.sigs.push(sig);}else map.set(key,{sigs:[sig],title:row.title});}return map;}
 const a=summarize(before),b=summarize(after),out={added:0,removed:0,changed:0,sample:[]};
 function add(kind,title){out[kind]++;if(out.sample.length<80)out.sample.push({kind,title});}
 for(const [key,r] of b){const old=a.get(key);if(!old)add('added',r.title);else if(r.sigs.sort().join()!==old.sigs.sort().join())add('changed',r.title);}
 for(const [key,r] of a)if(!b.has(key))add('removed',r.title);
 return out;
}
function sortedSources(sources){return sources.slice().sort((a,b)=>(b.priority||0)-(a.priority||0));}
function matchesWithAliases(sources,title,aliases){
 const key=releaseKey(label(title,200)),alternates=aliases.filter(pair=>pair.some(x=>releaseKey(x)===key)).flat();
 const queries=[...new Set([title,...alternates])];
 const combined=new Map();for(const q of queries)for(const group of sourceMatches(sources,q)){
  const old=combined.get(group.id);if(!old){combined.set(group.id,group);continue;}
  const listed=new Set(old.entries.map(x=>x.index));const next=group.entries.filter(r=>!listed.has(r.index));
  old.entries.push(...next);old.count=Math.max(old.count,group.count,old.entries.length);old.entries=old.entries.slice(0,40);
 }
 return sources.flatMap(s=>combined.has(s.id)?[combined.get(s.id)]:[]);
}
function sourceExport(s){return JSON.stringify({name:s.name,downloads:s.games.map(g=>({title:g.title,uris:g.links,fileSize:g.size,uploadDate:g.date}))});}
function configure(s,input){
 if(!Number.isInteger(input?.priority)||input.priority<-10||input.priority>10||!limits.includes(input.hours))throw Error('Неверный приоритет или период обновления.');
 s.priority=input.priority;s.refreshHours=input.hours;
}
function createSourceWorkbench(data,notify,now=Date.now){
 const work=data.sourceWorkbench,seen=new Map(data.sources.map(s=>[s.id,{games:s.games,updated:s.updated,attempt:s.lastAttempt,error:s.syncError}]));
 const diff=new Map(),active=()=>sortedSources(data.sources);
 function observe(force=false){
  let changed=false;
  for(const s of data.sources){
   const old=seen.get(s.id);
   if(!old||s.games!==old.games||s.lastAttempt!==old.attempt||s.updated!==old.updated||s.syncError!==old.error){
    const at=new Date(now()).toISOString();
    if(s.updated||s.syncError){
     const comparison=old?.games!==s.games&&old?.updated?snapshotDiff(old.games,s.games):null;
     if(comparison){s.lastDiff={from:old.updated,to:s.updated,...comparison};diff.set(s.id,s.lastDiff);}
     const records=Object.hasOwn(work.log,s.id)?work.log[s.id]:[];work.log[s.id]=[{at,count:s.games.length,status:s.syncError?'error':'ok',detail:label(s.syncError,220)},...(records||[])].slice(0,20);
    }
    seen.set(s.id,{games:s.games,updated:s.updated,attempt:s.lastAttempt,error:s.syncError});changed=true;
   }
  }
  for(const id of seen.keys())if(!data.sources.some(s=>s.id===id)){seen.delete(id);delete work.log[id];diff.delete(id);changed=true;}
  if(changed||force){
   const sources=active();for(const w of work.watch){const match=matchesWithAliases(sources,w.title,work.aliases);const present=match.length>0;
    if(present&&!w.present)notify('Игра найдена в источниках',`${w.title} · ${match.map(s=>s.name).slice(0,3).join(', ')}`,'sources');w.present=present;
   }
  }
 }
 function watch(title){const key=releaseKey(label(title,200));if(!key||work.watch.length>=30||work.watch.some(row=>releaseKey(row.title)===key))throw Error('Укажите новое название. Лимит — 30 игр.');const name=label(title,200);work.watch.unshift({id:randomUUID(),title:name,present:matchesWithAliases(active(),name,work.aliases).length>0});}
 function alias(from,to){const a=label(from,200),b=label(to,200),ka=releaseKey(a),kb=releaseKey(b);if(!ka||!kb||ka===kb||work.aliases.length>=100||work.aliases.some(pair=>releaseKey(pair[1])===kb))throw Error('Укажите два разных названия, без повторной привязки. Лимит — 100.');work.aliases.push([a,b]);}
 function bookmark(source,row){const sig=fingerprint(row);if(work.bookmarks.some(x=>x.sourceId===source.id&&x.sig===sig))throw Error('Эта версия уже в закладках.');if(work.bookmarks.length>=100)throw Error('Можно сохранить до 100 версий.');work.bookmarks.unshift({id:randomUUID(),sig,sourceId:source.id,source:source.name,title:row.title,date:row.date});}
 function locate(id){const mark=work.bookmarks.find(x=>x.id===id),source=mark&&data.sources.find(s=>s.id===mark.sourceId&&s.enabled),index=source?.games.findIndex(g=>g.title===mark.title&&g.date===mark.date&&fingerprint(g)===mark.sig);if(!(index>=0))throw Error('Версия исчезла, изменилась или источник отключён.');return {id:source.id,index,...source.games[index]};}
 return {observe,watch,alias,bookmark,locate,history:s=>({rows:Object.hasOwn(work.log,s.id)?work.log[s.id]:[],diff:diff.get(s.id)||s.lastDiff||null})};
}
module.exports={cleanWorkbench,snapshotDiff,sortedSources,matchesWithAliases,sourceExport,configure,createSourceWorkbench};
