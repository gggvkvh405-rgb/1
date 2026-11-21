const read = () => {try {return JSON.parse(localStorage.getItem('byazen-preview-v1')) || {};} catch {return {};}};
const store = read();
store.settings ||= {name:'Игрок',theme:'dark',motion:false,region:'DE'};
store.library ||= [];
store.sources ||= [];
const save = () => localStorage.setItem('byazen-preview-v1',JSON.stringify(store));
const desktopOnly = () => {throw Error('Это действие доступно в приложении ByAzen для Windows.');};
async function api(endpoint, data) {
 const res = await fetch('/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const json = await res.json(); if (!res.ok) throw Error(json.error || 'Сервис недоступен.'); return json;
}
const drafts = new Map();
const textSource = async (text, info) => {
 const parsed = await api('source',text);
 const id = crypto.randomUUID(); drafts.set(id,{...parsed,...info});
 if (drafts.size > 6) drafts.delete(drafts.keys().next().value);
 return {id,name:parsed.name,count:parsed.games.length,skipped:parsed.skipped,ignoredLinks:parsed.ignoredLinks,titles:parsed.games.slice(0,10).map(g=>g.title)};
};
async function fetchSource(url) {
 const u = new URL(url);
 if (!['http:','https:'].includes(u.protocol) || u.username || u.password) throw Error('Требуется URL HTTP(S) без учётных данных.');
 let res;
 try {res = await fetch(u,{signal:AbortSignal.timeout(15000),credentials:'omit'});} catch {throw Error('Сайт недоступен или блокирует запросы браузера (CORS). Импортируйте файл или используйте приложение.');}
 if (!res.ok) throw Error('Сервер вернул HTTP '+res.status);
 const reader = res.body.getReader(); let size=0, text=''; const decoder = new TextDecoder();
 while (true) {const {done,value} = await reader.read(); if(done) break; size+=value.length; if(size>4194304){await reader.cancel(); throw Error('Размер ответа превышает 4 МБ.');} text+=decoder.decode(value,{stream:true});}
 return text+decoder.decode();
}
const key = s => s.replace(/[™®©]/gu,'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const ext = url => { window.open(url,'_blank','noopener,noreferrer'); };
export const browser = {
 settings:async()=>store.settings, saveSettings:async x=>{store.settings=x; save(); return x;},
 steam:async x=>api('steam',x),
 openSteamCharts:async()=>ext('https://store.steampowered.com/charts/topselling'),
 openProjectFeedback:async()=>ext('https://github.com/gggvkvh405-rgb/1/issues/new'),
 library:async()=>store.library,
 saveGame:async(id,g)=>{if(id) Object.assign(store.library.find(g=>g.id===id),g); else store.library.push({...g,id:crypto.randomUUID(),exe:'',lastPlayed:''}); save();},
 favorite:async id=>{const g=store.library.find(g=>g.id===id); g.favorite=!g.favorite; save();},
 removeGame:async id=>{store.library=store.library.filter(g=>g.id!==id);save();},
 chooseExe:desktopOnly, launchGame:desktopOnly, downloads:async()=>[], addDownload:desktopOnly, downloadAction:desktopOnly,
 previewFile:()=>new Promise((resolve,reject)=>{const picker=document.createElement('input'); picker.type='file'; picker.accept='.json,application/json'; picker.oncancel=()=>resolve(null); picker.onchange=async()=>{try{const f=picker.files[0];if(!f)return resolve(null);if(f.size>4194304)throw Error('Максимальный размер файла — 4 МБ.');resolve(await textSource(await f.text(),{kind:'file',file:f.name}));}catch(e){reject(e);}};picker.click();}),
 previewURL:async url=>textSource(await fetchSource(url),{kind:'url',url}),
 importSource:async id=>{if(store.sources.length>=20)throw Error('Можно добавить до 20 источников.'); if(!drafts.has(id))throw Error('Откройте предпросмотр повторно.');store.sources.push({...drafts.get(id),id:crypto.randomUUID(),enabled:true,updated:new Date().toISOString()});save();drafts.delete(id);},
 sources:async()=>store.sources.map(({games,...r})=>({...r,count:games.length})),
 sourceAction:async(id,op)=>{const s=store.sources.find(x=>x.id===id);if(op==='toggle')s.enabled=!s.enabled;else if(op==='remove')store.sources=store.sources.filter(s=>s.id!==id);else if(s.kind==='url')Object.assign(s,await api('source',await fetchSource(s.url)),{updated:new Date().toISOString()});else throw Error('Для обновления файла удалите запись и импортируйте файл повторно, либо используйте настольное приложение.');save();},
 searchSources:async(q='',page=1)=>{ const games=store.sources.filter(s=>s.enabled).flatMap(s=>s.games.map((g,index)=>({...g,source:s.name,id:s.id,index}))).filter(g=>g.title.toLowerCase().includes(q.toLowerCase().trim()));return {games:games.slice((page-1)*16,page*16),total:games.length,page,pageSize:16};},
 availability:async titles=>titles.map(title=>({title,sources:store.sources.filter(s=>s.enabled&&s.games.some(g=>key(g.title)===key(title))).map(s=>s.name)})),
 sourceMatches:async title=>{
  const k=typeof title==='string'&&title.length<=200?key(title):'';
  if(!k)return [];
  return store.sources.filter(s=>s.enabled).flatMap(s=>{
   const entries=[];let count=0;
   s.games.forEach((g,index)=>{if(key(g.title)===k&&g.links.length){count++;if(entries.length<20)entries.push({index,title:g.title,size:g.size,date:g.date,linkCount:g.links.length});}});
   return count?[{id:s.id,name:s.name,entries,count}]:[];
  });
 },
 sourceGame:async(id,index,title)=>{
  const s=store.sources.find(x=>x.enabled&&x.id===id), g=Number.isSafeInteger(index)&&index>=0?s?.games[index]:null;
  if(!g||g.title!==title||!g.links.length)throw Error('Источник изменился или отключён. Откройте игру повторно.');
  return {...g,source:s.name,id:s.id,index};
 },
 openSource:async(id,index,link,action,expected)=>{const s=store.sources.find(s=>s.enabled&&s.id===id);const u=s?.games[index]?.links[link];if(u!==expected)throw Error('Источник изменился. Откройте ссылку повторно.');if(action!=='download'||!u)throw Error('Недопустимое действие.');return desktopOnly();}
};
