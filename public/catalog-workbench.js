import {matchesLocal} from './query.js';
const idOf=url=>/^https:\/\/store\.steampowered\.com\/app\/([1-9]\d{0,9})\/$/.exec(String(url||''))?.[1]||'';
export const productId=idOf;
const readLocal=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const saveLocal=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const formats={windows:'Windows',mac:'macOS',linux:'Linux'};
const price=d=>d.price?.formatted||(d.free?'Бесплатно':'Цена не указана');
const modes=d=>[[2,'Одиночная'],[9,'Кооператив'],[38,'Онлайн-кооп'],[48,'Локальный кооп']].filter(([id])=>d.categories.includes(id)).map(([,label])=>label).join(', ');
export function catalogTools({api,dialog,showDialog,esc,btn,run,toast,get,go,onGame,onSource,openSetting,applyFilters,readFilters}){
 const $=(s,el=dialog)=>el.querySelector(s), alive=el=>el.isConnected&&dialog.open;
 const status=(host,text)=>{if(alive(host))host.textContent=text;};
 const compare=new Map();
 const region=()=>get().filter.cc||get().settings.region;
 const toGame=d=>({title:d.name,image:d.image,url:`https://store.steampowered.com/app/${d.id}/`});
 async function allWishes(){return api.steamWishlist?api.steamWishlist():readLocal('byazen-steam-wishes',[]);}
 async function editWish(d){
  const all=await allWishes(),existing=all.find(x=>x.id===d.id);
  const digits=d.price?new Intl.NumberFormat('en',{style:'currency',currency:d.price.currency}).resolvedOptions().maximumFractionDigits:2,multiplier=10**digits;
  const prev=existing?.currency===d.price?.currency&&existing?.cc===d.cc?existing?.threshold:null;
  showDialog('Добавить в желаемое',`<form id="wish-form"><h3>${esc(d.name)}</h3><label class="field"><span>Личная заметка</span><textarea name="notes" rows="4" maxlength="1500">${esc(existing?.notes)}</textarea></label>${d.price&&api.steamWishSave?`<label class="field"><span>Уведомить о скидке при цене не выше (Steam · ${esc(d.price.currency)})</span><input name="limit" type="number" min="0" max="${100000000/multiplier}" step="${1/multiplier}" value="${prev==null?'':prev/multiplier}" placeholder="Не отслеживать цену"></label><p class="muted small">Проверяем цену региона ${esc(d.cc)}, пока открыт ByAzen. Уведомление появится в истории.</p>`:''}<div class="dialog-actions">${btn('Отмена','close')}<button class="btn primary" type="submit">Сохранить</button></div></form>`);
  const form=$('#wish-form');form.onsubmit=e=>{e.preventDefault();const f=new FormData(form),b=$('[type=submit]',form);b.disabled=true;run(async()=>{
   try{const input=f.get('limit'),threshold=input?Math.round(Number(input)*multiplier):null,notes=String(f.get('notes')).trim();
    if(api.steamWishSave)await api.steamWishSave(d.id,d.cc,{threshold,notes});else saveLocal('byazen-steam-wishes',[{id:d.id,title:d.name,cc:d.cc,notes,threshold:null,view:{release:d.release,day:d.day,upcoming:d.upcoming,formatted:price(d),discount:d.price?.discount||0}},...all.filter(x=>x.id!==d.id)].slice(0,75));
    if(alive(form))dialog.close();toast('Список желаемого обновлён.');
   }finally{b.disabled=false;}
  });};
 }
 function toggleCompare(d){if(compare.has(d.id)){compare.delete(d.id);return false;}if(compare.size>=4){toast('Для сравнения можно выбрать до четырёх игр.',true);return false;}compare.set(d.id,d);return true;}
 async function detail(id,country=region()){
  if(!/^\d{1,10}$/.test(String(id))||!api.steamDetail)return;
  showDialog('Карточка Steam',`<div id="steam-detail"><p class="muted">Запрашиваем карточку Steam…</p></div>`);
  const root=$('#steam-detail');
  try{
   const d=await api.steamDetail(String(id),country);if(!alive(root))return;
   root.innerHTML=`<div class="steam-summary">${d.image?`<img src="${esc(d.image)}" alt="">`:''}<div><h3>${esc(d.name)}</h3><p class="muted small">Steam · ${esc(d.cc)}${d.genres?.length?' · '+esc(d.genres.join(', ')):''}</p><p>${esc(price(d))}${d.price?.discount?` <span class="chip good">−${d.price.discount}%</span>`:''}</p></div></div><p>${esc(d.description||'Steam не предоставил описание.')}</p><dl class="steam-facts"><dt>Релиз</dt><dd>${esc(d.release||'Дата не указана')}</dd><dt>Разработчики</dt><dd>${esc(d.developers.join(', ')||'Не указаны')}</dd><dt>Платформы</dt><dd>${esc(d.platforms.map(p=>formats[p]).filter(Boolean).join(', ')||'Не указаны')}</dd><dt>Режимы</dt><dd>${esc(modes(d)||'Не указаны')}</dd></dl><div class="row"><button class="btn primary" type="button" id="detail-sources">Источники загрузки</button><button class="btn" type="button" id="detail-wish">В желаемое / заметка</button><button class="btn" type="button" id="detail-compare" aria-pressed="${compare.has(d.id)}">${compare.has(d.id)?'Убрать из сравнения':'К сравнению'}</button></div>${d.screenshots.length?`<details><summary>Скриншоты (${d.screenshots.length})</summary><div class="steam-shots">${d.screenshots.map((src,i)=>`<button type="button" class="btn" data-picture="${i}" aria-label="Открыть скриншот ${i+1}"><img src="${esc(src)}" loading="lazy" alt=""></button>`).join('')}</div><img id="steam-picture" alt="Выбранный скриншот" hidden></details>`:''}${d.videos.length?`<details><summary>Трейлеры (${d.videos.length})</summary><div class="row">${d.videos.map((v,i)=>`<button type="button" class="btn" data-trailer="${i}">${esc(v.name||`Трейлер ${i+1}`)}</button>`).join('')}</div><video id="steam-video" controls playsinline preload="none" hidden></video><p class="muted small" role="status"></p></details>`:''}`;
   $('#detail-sources',root).onclick=()=>onGame(toGame(d));$('#detail-wish',root).onclick=()=>run(()=>editWish(d));
   $('#detail-compare',root).onclick=e=>{const b=e.currentTarget,on=toggleCompare(d);b.textContent=on?'Убрать из сравнения':'К сравнению';b.setAttribute('aria-pressed',String(on));};
   for(const b of root.querySelectorAll('[data-picture]'))b.onclick=()=>{const image=$('#steam-picture',root);image.src=d.screenshots[Number(b.dataset.picture)];image.hidden=false;};
   for(const b of root.querySelectorAll('[data-trailer]'))b.onclick=()=>{const v=$('#steam-video',root),msg=$('[role=status]',root);msg.textContent='';v.hidden=false;v.onerror=()=>{msg.textContent='Steam не отдал воспроизводимый ролик.';};v.src=d.videos[Number(b.dataset.trailer)].url;v.load();};
  }catch(e){status(root,e.message);}
 }
 function compareDialog(){
  const rows=[...compare.values()];const fields=[['Цена',price],['Релиз',d=>d.release],['Платформы',d=>d.platforms.map(p=>formats[p]).join(', ')],['Режимы',modes],['Жанры',d=>d.genres.join(', ')],['Разработчики',d=>d.developers.join(', ')]];
  showDialog('Сравнение игр',rows.length?`<div class="steam-compare"><table><thead><tr><th scope="col">Данные Steam</th>${rows.map(d=>`<th scope="col"><strong>${esc(d.name)}</strong> <small>${esc(d.cc)}</small><button type="button" class="btn" data-clear-compare="${d.id}" aria-label="Убрать ${esc(d.name)}">Убрать</button></th>`).join('')}</tr></thead><tbody>${fields.map(([label,value])=>`<tr><th scope="row">${label}</th>${rows.map(d=>`<td>${esc(value(d)||'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted small">Цены и данные — на момент добавления карточки.</p>`:'<p class="muted">Открой карточку Steam и нажми «К сравнению». Можно выбрать до четырёх игр.</p>');
  for(const b of dialog.querySelectorAll('[data-clear-compare]'))b.onclick=()=>{compare.delete(b.dataset.clearCompare);compareDialog();};
 }
 async function wishes(calendar=false){
  showDialog(calendar?'Календарь релизов':'Список желаемого',`<div id="steam-wishes"><p class="muted">Читаем список…</p></div>`);
  const host=$('#steam-wishes'),all=await allWishes();if(!alive(host))return;
  const dated=all.filter(x=>x.view?.upcoming&&x.view.day).sort((a,b)=>a.view.day.localeCompare(b.view.day));
  const unknown=all.filter(x=>x.view?.upcoming&&!x.view.day);
  const rows=calendar?[...dated,...unknown]:all;
  host.innerHTML=`<div class="row">${api.steamWishRefresh?'<button class="btn" type="button" id="refresh-wishes">Обновить данные Steam</button>':''}${calendar?'<button class="btn" type="button" id="steam-upcoming">Предстоящие игры Steam</button>':''}</div>${calendar?'<p class="muted small">Релизы из желаемого: точные даты отсортированы; приблизительные и неизвестные сроки показаны ниже.</p>':''}<ul class="journal-list">${rows.map((r,i)=>`<li><div><strong>${esc(r.title)}</strong><p class="muted small">${esc(calendar?r.view?.release||'Без даты':`${r.view?.formatted||'Нет цены'} · ${r.cc}${r.view?.discount?' · Скидка '+r.view.discount+'%':''}`)}</p>${!calendar&&r.notes?`<p class="wish-note">${esc(r.notes)}</p>`:''}</div><div class="row"><button class="btn" type="button" data-wish-open="${i}">Карточка</button>${calendar?'':`<button class="btn" type="button" data-wish-remove="${i}">Удалить</button>`}</div></li>`).join('')||'<li class="muted">Нет записей. Добавляйте игры из карточек Steam.</li>'}</ul>`;
  const refresh=$('#refresh-wishes',host);if(refresh)refresh.onclick=()=>run(async()=>{refresh.disabled=true;try{const v=await api.steamWishRefresh();toast(`Проверено: ${v.checked}, ошибок: ${v.failed}.`);if(alive(host))await wishes(calendar);}finally{refresh.disabled=false;}});
  const upcoming=$('#steam-upcoming',host);if(upcoming)upcoming.onclick=()=>{dialog.close();applyFilters({steam:{comingSoon:true}});};
  for(const b of host.querySelectorAll('[data-wish-open]'))b.onclick=()=>run(()=>{const row=rows[Number(b.dataset.wishOpen)];return detail(row.id,row.cc);});
  for(const b of host.querySelectorAll('[data-wish-remove]'))b.onclick=()=>run(async()=>{const row=rows[Number(b.dataset.wishRemove)];if(api.steamWishRemove)await api.steamWishRemove(row.id);else saveLocal('byazen-steam-wishes',all.filter(x=>x.id!==row.id));if(alive(host))await wishes(calendar);});
 }
 function filters(){
  const read=()=>readLocal('byazen-saved-filters',[]);
  showDialog('Сохранённые фильтры',`<form id="filter-save" class="row"><input aria-label="Название фильтра" name="name" maxlength="60" required placeholder="Имя текущего набора"><button class="btn primary" type="submit">Сохранить текущий</button></form><ul class="journal-list" id="filter-saved">${read().map((r,i)=>`<li><strong>${esc(r.name)}</strong><span class="row"><button class="btn" type="button" data-filter-apply="${i}">Применить</button><button class="btn" type="button" data-filter-delete="${i}">Удалить</button></span></li>`).join('')||'<li class="muted">Пока нет сохранённых наборов.</li>'}</ul>`);
  const form=$('#filter-save');form.onsubmit=e=>{e.preventDefault();run(()=>{const name=String(new FormData(form).get('name')).trim();if(!name)return;saveLocal('byazen-saved-filters',[{name,values:readFilters()},...read().filter(x=>x.name!==name)].slice(0,25));filters();toast('Параметры сохранены.');});};
  for(const b of dialog.querySelectorAll('[data-filter-apply]'))b.onclick=()=>{const row=read()[Number(b.dataset.filterApply)];if(row){dialog.close();applyFilters(row.values);}};
  for(const b of dialog.querySelectorAll('[data-filter-delete]'))b.onclick=()=>{saveLocal('byazen-saved-filters',read().filter((_,i)=>i!==Number(b.dataset.filterDelete)));filters();};
 }
 function global(raw){
  const q=String(raw||'').trim().slice(0,200);
  showDialog('Поиск по ByAzen',`<form id="global-work-form" class="row"><input name="q" aria-label="Искать в ByAzen" value="${esc(q)}" maxlength="200" required><button class="btn primary" type="submit">Найти</button></form><p class="muted small">Например: <code>"resident evil" -demo</code>. Кавычки — точная фраза, минус — исключение.</p><div id="global-work-results" class="global-groups"></div>`);
  const root=$('#global-work-results'),form=$('#global-work-form');form.onsubmit=e=>{e.preventDefault();global(new FormData(form).get('q'));};
  if(!q)return;
  const listed=get().library.filter(g=>matchesLocal([g.title,...g.collections,...(g.tags||[])].join(' '),q)).slice(0,8),settings=[['themes','Темы, обои и оформление'],['settings-form','Профиль, регион, стартовый раздел, движение'],['personal','Управление, геймпад, клавиши, масштаб, звук, трей'],['downloads','Очередь, скорость, расписание и лимиты загрузок']].filter(([,label])=>matchesLocal(label,q));
  const lines=(rows,kind,fmt)=>rows.map((row,i)=>`<li><button type="button" class="btn" data-find-${kind}="${i}">${esc(fmt(row))}</button></li>`).join('')||'<li class="muted">Нет совпадений.</li>';
  root.innerHTML=`<section><h3>Библиотека</h3><ul>${lines(listed,'game',g=>g.title)}</ul></section><section><h3>Настройки</h3><ul>${lines(settings,'setting',s=>s[1])}</ul></section><section><h3>Steam</h3><ul id="global-steam-list"><li class="muted">Поиск…</li></ul><button type="button" class="btn" id="find-full-steam">Открыть каталог с запросом</button></section><section><h3>Источники</h3><ul id="global-feed-list"><li class="muted">Поиск…</li></ul><button type="button" class="btn" id="find-full-sources">Все результаты источников</button></section>`;
  for(const b of root.querySelectorAll('[data-find-game]'))b.onclick=()=>{dialog.close();openSetting('library',listed[Number(b.dataset.findGame)].id);};
  for(const b of root.querySelectorAll('[data-find-setting]'))b.onclick=()=>{dialog.close();openSetting(settings[Number(b.dataset.findSetting)][0]);};
  $('#find-full-steam',root).onclick=()=>{dialog.close();applyFilters({steam:{term:q}});};$('#find-full-sources',root).onclick=()=>{dialog.close();onSource(q);};
  async function mount(selector,kind,task,format,open){const host=$(selector,root);try{const data=await task(),rows=data.games.slice(0,6);if(!alive(root))return;host.innerHTML=lines(rows,kind,format);for(const b of host.querySelectorAll('button'))b.onclick=()=>open(rows[Number(b.dataset[kind==='steam'?'findSteam':'findFeed'])]);}catch(e){if(alive(root))host.textContent=e.message;}}
  void mount('#global-steam-list','steam',()=>api.steam({term:q,cc:region(),page:1}),g=>g.title,g=>idOf(g.url)&&api.steamDetail?run(()=>detail(idOf(g.url))):onGame(g));
  void mount('#global-feed-list','feed',()=>api.searchSources(q,1),g=>`${g.title} · ${g.source}`,g=>onGame({title:g.title,preferred:g}));
 }
 return {detail,compare:compareDialog,wishes,filters,global};
}
