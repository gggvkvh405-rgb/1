import {cleanAppearance,applyAppearance} from './appearance.js';
import {libraryTools} from './library-tools.js';
import {humanBytes,isHistory,transferLabel,rateLabel,discoveryLabel} from './download-view.js';
import {prepareWallpaper,readWallpaper,saveWallpaper} from './wallpaper-store.js';
import {collections,sceneCollections,sceneThemes,visualThemes,classicThemes,getTheme,findThemes} from './themes.js';
import {openDownloadPicker} from './download-picker.js';
import {motionAllowed,syncMotion,play,reveal,revealSection} from './motion.js';
import {icon as I} from './icons.js';
import {games,regions,weeklyGames,achievements} from './games.js';
import {browser} from './browser.js';
import {genres,tags,sorts,properties,FIRST_YEAR,CLASSIC_UNTIL,LAST_YEAR,normalize,offlineResults,refinePage,catalogMeta} from './catalog.js';
const api = window.byazen || browser;
const $ = (s, container=document) => container.querySelector(s);
const content=$('#content'), dialog=$('#dialog'), dialogBody=$('#dialog-body');
const sections = {home:['Главная','home'], catalog:['Каталог','grid'],library:['Библиотека','library'],downloads:['Загрузки','download'],rankings:['Рейтинги','trophy'],sources:['Источники','layers'],settings:['Настройки','settings']};
const esc = (x='') => String(x??'').replace(/[&<>"']/g, a=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[a]));
const state = {section:'home', settings:{name:'Игрок',theme:'dark',motion:false,region:'DE'},library:[],featured:0,tab:0,filter:{term:'',page:1},libraryFilter:'all',libraryProgress:'',collection:'',srcTerm:'',srcPage:1,srcId:'',themeGroup:'',themeQuery:'',wallpaper:null,downloadTab:'active'};
let renderId=0,customURL,disposeWallpaperPreview;
const details = (icon,title,desc,action='')=>`<div class="empty"><span class="empty-icon">${I(icon)}</span><h3>${esc(title)}</h3><p>${esc(desc)}</p>${action}</div>`;
const btn = (label,action,glyph='',classes='')=>`<button type="button" class="btn ${classes}" data-action="${action}">${glyph?I(glyph):''}${label}</button>`;
const head = (eyebrow,title,desc,actions='')=>`<div class="page-head"><div><div class="eyebrow"><i></i>${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div>${actions?`<div class="head-actions">${actions}</div>`:''}</div>`;
const pick = (name, items, selected, label) => `<select name="${esc(name)}" aria-label="${esc(label)}">${items.map(([v,t])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
const current = (n)=>n===renderId;
function toast(text,error=false){const x=document.createElement('div');x.className='toast'+(error?' bad':'');x.innerHTML=`${I(error?'alert':'check')}<span>${esc(text)}</span>`;$('#toasts').append(x);setTimeout(()=>{if(!motionAllowed())return x.remove();x.classList.add('is-leaving');setTimeout(()=>x.remove(),200);},4100);}
function run(fn) {return Promise.resolve().then(fn).catch(e=>toast(e.message,true));}
function showDialog(title,body,{variant='',eyebrow=''}={}){const replacing=dialog.open;if(replacing){disposeWallpaperPreview?.();dialog.close();}dialog.dataset.variant=variant;dialogBody.innerHTML=`<div class="dialog-head"><div>${eyebrow?`<div class="dialog-kicker">${eyebrow}</div>`:''}<h2 id="dialog-title">${title}</h2></div><button type="button" class="icon-btn" data-action="close" aria-label="Закрыть">${I('close')}</button></div>${body}`;dialog.showModal();reveal(dialogBody,'.dialog-head, .dialog-head + p, .dialog-actions','slide',{step:35});}
const date = s => s ? new Date(s).toLocaleDateString('ru') : '';
function sidebar(){
 $('#nav').innerHTML=Object.entries(sections).filter(([id])=>id!=='sources').map(([id,[title,glyph]])=>`<button class="nav-link ${state.section===id?'active':''}" ${state.section===id?'aria-current="page"':''} data-go="${id}" title="${title}">${I(glyph)}<span>${title}</span></button>`).join('');
 const shortcut=$('#source-shortcut');
 if(state.section==='sources')shortcut.setAttribute('aria-current','page');else shortcut.removeAttribute('aria-current');
 $('#profile').innerHTML=`<span class="avatar">${I('user')}</span><span class="profile-text"><strong>${esc(state.settings.name)}</strong><small>ByAzen</small></span><img class="profile-brand" src="assets/logo.svg" alt="">${I('down','profile-arrow')}`;
 $('#side-games').innerHTML=state.library.length ? [...state.library].sort((a,b)=>Number(b.favorite)-Number(a.favorite)||(b.lastPlayed||'').localeCompare(a.lastPlayed||'')).slice(0,6).map(g=>`<button class="side-game" data-action="edit-game" data-id="${esc(g.id)}" title="${esc(g.title)}">${I('game')}<span>${esc(g.title)}</span></button>`).join('') : `<button class="side-game muted" data-action="new-game" title="Добавить игру">${I('plus')}<span>Добавить игру</span></button>`;
}
function go(section){if(!Object.hasOwn(sections,section))return;const changed=section!==state.section;state.section=section;document.title=`${sections[section][0]} — ByAzen`;window.scrollTo(0,0);sidebar();if(changed)reveal($('.sidebar'),'[aria-current=page] svg','pop');run(render);}
async function render(reason){const n=++renderId, section=state.section;content.dataset.section=section;const result=({home,catalog,library,downloads,rankings,sources,settings}[section])(n);revealSection(content,section,reason);return result;}
function rangeButtons(result,prefix){
 const rawLast=Math.ceil(result.total/result.pageSize);
 const last=Math.max(1,prefix==='steam'?Math.min(500,rawLast):rawLast);
 return `<div class="pagination"><button class="btn" data-action="${prefix}-page" data-page="${result.page-1}" ${result.page<=1?'disabled':''}>← Назад</button><span>Страница ${result.page.toLocaleString('ru')} из ${last.toLocaleString('ru')}</span><button class="btn" data-action="${prefix}-page" data-page="${result.page+1}" ${result.page>=last?'disabled':''}>Далее →</button></div>`;
}

const homeTabs=[['flame','Сейчас популярно'],['calendar','Лучшие игры недели'],['trophy','Игры с достижениями']];
function home(n){
 const f=games[state.featured], cyber=state.featured===0;
 const rows=state.tab===1?weeklyGames():state.tab===2?games.filter(g=>achievements.has(g.id)):games;
 content.innerHTML=`<section class="hero ${cyber?'cyber-hero':'alt-hero'}" aria-label="Избранная игра">
  <img class="hero-image" src="assets/${cyber?'hero':f.image}.jpg" alt="">
  <button class="hero-link" data-action="steam-${f.id}" title="Открыть игру" aria-label="Открыть ${esc(f.title)}"></button>
  <div class="hero-copy"><h1>${cyber?'<img src="assets/cyberpunk-logo.png" alt="Cyberpunk 2077">':esc(f.headline)}</h1><p>${esc(f.desc)}</p></div>
 </section>
 <div class="home-feed">
  <div class="discovery">
   <div class="tabs" aria-label="Подборки">${homeTabs.map(([glyph,name],j)=>`<button type="button" class="tab ${j===state.tab?'selected':''}" data-action="home-tab" data-tab="${j}" aria-pressed="${j===state.tab}" ${j===1?'title="Редакционная подборка, не рейтинг Steam"':''}>${I(glyph,`tab-glyph ${glyph}`)}${name}</button>`).join('')}</div>
   <button type="button" class="tab surprise" data-action="surprise">${I('spark','tab-glyph spark')}Удиви меня</button>
  </div>
  <div class="feed-title"><h2>${I(homeTabs[state.tab][0],`tab-glyph ${homeTabs[state.tab][0]}`)} ${homeTabs[state.tab][1]}</h2>${state.tab===1?'<small>Подборка редакции</small>':''}</div>
  <section class="game-grid" aria-label="${homeTabs[state.tab][1]}">${rows.map(g=>`<button class="game-card" data-action="steam-${g.id}" title="Открыть ${esc(g.title)}"><span class="card-art"><img alt="" src="assets/${g.image}.jpg"></span><span class="card-copy"><strong>${I('steam')}${esc(g.title)}</strong><span class="card-tags"><span class="source-badge">Steam</span><span class="source-indicator" data-availability="${g.id}" title="Совпадения по названию в активных источниках"><span class="source-badge">Нет источников</span></span></span></span></button>`).join('')}</section>
 </div>`;
 api.availability(rows.map(g=>g.title)).then(items=>{
  if(!current(n))return;
  for(const {title,sources} of items){
   const el=$(`[data-availability="${rows.find(g=>g.title===title)?.id}"]`);
   if(el&&sources.length){el.innerHTML=sources.slice(0,3).map(name=>`<span class="source-badge">${esc(name)}</span>`).join('')+(sources.length>3?`<span class="source-badge">+${sources.length-3}</span>`:'');el.title=sources.join(', ');}
  }
 }).catch(()=>{});
}
const catalogLocal = {min:FIRST_YEAR,max:LAST_YEAR,sources:[],mobileOpen:false};
const catalogPanels = new Map();
const yearBox = (name,min,max,value,label) => `<input type="range" name="${name}" min="${min}" max="${max}" value="${value}" aria-label="${label}">`;
const facet = (key, title, body, opened=true, count) => `<details class="catalog-facet ${key}" data-panel="${key}" ${(catalogPanels.get(key)??opened)?'open':''}><summary>${I('down')}<i></i><span>${title}</span>${count!=null?`<small>${count}</small>`:''}</summary><div class="catalog-facet-body">${body}</div></details>`;
const resultCaption = n => `${n.toLocaleString('ru')} ${ {one:'результат',few:'результата',many:'результатов'}[new Intl.PluralRules('ru').select(n)] || 'результатов' }`;
function checklist(items, selected, name, label){
 return `<div class="catalog-check-group"><input class="facet-search" type="search" placeholder="Фильтр…" aria-label="${label}" autocomplete="off"><div class="catalog-options">${items.map(([id,text])=>`<label class="toggle"><input type="checkbox" name="${name}" value="${esc(id)}" ${selected.includes(id)?'checked':''}><span>${esc(text)}</span></label>`).join('')}</div><p class="facet-no-match muted" hidden>Нет совпадений</p></div>`;
}
async function catalog(n){
 const f=state.filter, term=f.term?.trim()||'', selected=String(f.tags||'').split(',').filter(Boolean);
 const liveFields=properties.map(([k,label,opts])=>`<label class="field"><span>${label}</span>${pick(k,opts,f[k]||'',label)}</label>`).join('');
 content.innerHTML=`<form id="catalog-form" class="catalog-layout ${catalogLocal.mobileOpen?'filters-open':''}">
 <header class="catalog-top"><div><h1 class="sr-only">Каталог</h1><div class="catalog-total" id="catalog-total">Загружаем каталог Steam…</div><p id="catalog-hint">Используйте боковую панель для уточнения поиска</p>${!term?btn('Все игры из источников','browse-sources','layers','catalog-browse-sources'):''}</div>
 <div class="catalog-sort"><label><span>Сортировать по</span>${pick('sort_by',sorts,f.sort_by||'','Сортировка')}</label><button type="button" class="btn catalog-mobile-toggle" data-action="catalog-toggle" aria-controls="catalog-filters" aria-expanded="${catalogLocal.mobileOpen}">${I('sliders')} Фильтры</button></div></header>
 <div class="catalog-result-stack">${term?`<section id="catalog-feed-results" class="catalog-feed-results" aria-labelledby="catalog-feed-title"><div class="catalog-feed-header"><h2 id="catalog-feed-title">${I('layers')} В подключённых источниках</h2>${btn('Искать в источниках','search-sources','arrow')}</div><div class="catalog-feed-summary" role="status">Ищем по загруженным спискам…</div><div class="catalog-feed-items"></div></section>`:''}${term?`<h2 class="catalog-steam-title">${I('steam')} Результаты Steam</h2>`:''}<section id="catalog-results" class="catalog-results" aria-live="polite" aria-busy="true">${details('search','Загружаем каталог…','Получаем текущие данные магазина Steam.')}</section></div>
 <aside id="catalog-filters" class="catalog-filters" aria-label="Фильтры каталога"><div class="catalog-filter-scroll">
 <div class="catalog-era" aria-label="Фильтр по эпохе"><button type="button" data-era="modern">${I('grid')}Современные игры</button><button type="button" data-era="classic">${I('game')}Классика</button></div>
 ${facet('year','Год выпуска',`<p class="facet-help">Год выпуска на этой странице</p><div class="year-labels"><output id="year-low"></output><output id="year-high"></output></div><div class="year-track"><div></div>${yearBox('minYear',FIRST_YEAR,LAST_YEAR,catalogLocal.min,'Минимальный год выпуска')}${yearBox('maxYear',FIRST_YEAR,LAST_YEAR,catalogLocal.max,'Максимальный год выпуска')}</div>`)}
 ${facet('genres','Жанры',`<p class="facet-help">${genres.length} вариантов</p>${checklist(genres,selected,'steamTag','Поиск жанров')}`,true,genres.length)}
 ${facet('tags','Теги',`<p class="facet-help">${tags.length} вариантов</p>${checklist(tags,selected,'steamTag','Поиск тегов')}`,true,tags.length)}
 ${facet('source-facet','Источники загрузки','<div id="catalog-source-options"><p class="muted">Загружаем источники…</p></div>')}
 ${facet('properties','Параметры Steam',`<label class="field"><span>Название</span><input name="term" value="${esc(f.term)}" maxlength="100" placeholder="Введите название игры"></label>${liveFields}<label class="field"><span>Регион Steam</span>${pick('cc',regions,f.cc||state.settings.region,'Регион Steam')}</label><label class="toggle"><input name="specials" type="checkbox" ${f.specials?'checked':''}> Только со скидкой</label>`,false)}
 </div><div class="catalog-apply">${btn('Сбросить','reset-filters')}<button type="submit" class="btn primary">${I('search')} Применить</button></div>
 </aside></form>`;
 const form=$('#catalog-form'), results=$('#catalog-results'), sourceBox=$('#catalog-source-options');
 if(term)void loadCatalogFeeds(n,term);
 let pageResult, offlineReason='', pageMatches=new Map(), shownKeys=null;
 function drawPage(){
  if(!pageResult||!current(n))return;
  const r=pageResult, rows=refinePage(r.games,catalogLocal,pageMatches);
  const refined=catalogLocal.min!==FIRST_YEAR||catalogLocal.max!==LAST_YEAR||catalogLocal.sources.length>0;
  $('#catalog-total').textContent=r.offline?`Локальная подборка: ${r.total.toLocaleString('ru')}`:resultCaption(r.total);
  $('#catalog-hint').textContent=refined?`Показано на этой странице: ${rows.length} из ${r.games.length}`:'Используйте боковую панель для уточнения поиска';
  const keys=JSON.stringify(rows.map(g=>g.url));
  const badgesFor=g=>{const names=pageMatches.get(g.title)||[];return names.length?names.map(x=>`<span class="catalog-badge">${esc(x)}</span>`).join(''):'<span class="catalog-badge">Steam</span>';};
  if(rows.length&&keys===shownKeys){
   results.querySelectorAll('.catalog-badges').forEach((el,i)=>{const html=badgesFor(rows[i]);if(el.innerHTML!==html)el.innerHTML=html;});
   return;
  }
  const unavailable=r.offline?`<div class="catalog-status" role="status" title="${esc(offlineReason)}">${I('alert')}<span>Steam недоступен. Показана локальная подборка без актуальных цен и наличия. Фильтры платформы, цены, скидок и региона не применяются.</span>${btn('Повторить','rerender','refresh')}</div>`:'';
  const list=rows.length?`<div class="catalog-list">${rows.map(g=>{
   const meta=catalogMeta(g), price=g.price||'', badge=badgesFor(g);
   return `<button type="button" class="catalog-row" data-action="catalog-game" data-image="${esc(g.image||'')}" data-title="${esc(g.title)}" title="Открыть ${esc(g.title)}"><span class="catalog-row-art">${I('game')}${g.image?`<img src="${esc(g.image)}" alt="" loading="lazy">`:''}</span><span class="catalog-row-copy"><strong>${esc(g.title)}</strong>${meta.length?`<span class="catalog-meta">${esc(meta.join(', '))}</span>`:''}<span class="catalog-badges">${badge}</span></span>${price?`<span class="catalog-price">${g.discount?`<b class="discount">${esc(g.discount)}</b>`:''}${esc(price)}</span>`:''}</button>`;
  }).join('')}</div>`:details('search',refined?'Нет совпадений на этой странице':'Ничего не найдено',refined?'Измените фильтры года и источников или перейдите к другой странице.':'Попробуйте изменить запрос или фильтры.');
  results.setAttribute('aria-busy','false');results.innerHTML=unavailable+list+(r.total>r.pageSize&&!r.offline?rangeButtons(r,'steam'):'');
  if(keys!==shownKeys)reveal(results,'.catalog-row,.empty','rise',{limit:9,step:22});
  shownKeys=keys;
 }
 function showYears(){
  const lo=$('[name=minYear]',form), hi=$('[name=maxYear]',form), {min,max}=catalogLocal;
  lo.value=min;hi.value=max;$('#year-low').value=String(min);$('#year-high').value=String(max);
  const p=x=>(x-FIRST_YEAR)/(LAST_YEAR-FIRST_YEAR)*100+'%';
  $('.year-track',form).style.setProperty('--low',p(min));$('.year-track',form).style.setProperty('--high',p(max));
  form.querySelectorAll('[data-era]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.era==='modern'?min===CLASSIC_UNTIL+1&&max===LAST_YEAR:min===FIRST_YEAR&&max===CLASSIC_UNTIL)));
 }
 function searchOptions(input){
  const group=input.closest('.catalog-check-group'), query=normalize(input.value);let count=0;
  group.querySelectorAll('label.toggle').forEach(el=>{el.hidden=!normalize(el.textContent).includes(query);if(!el.hidden)count++;});
  $('.facet-no-match',group).hidden=count!==0;
 }
 form.querySelectorAll('.catalog-facet').forEach(p=>p.ontoggle=()=>catalogPanels.set(p.dataset.panel,p.open));
 form.onkeydown=e=>{if(e.key==='Enter'&&e.target.matches('.facet-search'))e.preventDefault();};
 form.oninput=e=>{
  const t=e.target;
  if(t.matches('.facet-search'))searchOptions(t);
  if(t.name==='minYear'||t.name==='maxYear'){
   if(t.name==='minYear')catalogLocal.min=Math.min(Number(t.value),catalogLocal.max);
   else catalogLocal.max=Math.max(Number(t.value),catalogLocal.min);
   showYears();drawPage();
  }
 };
 form.onchange=e=>{
  if(e.target.name==='sort_by')form.requestSubmit();
  if(e.target.name==='catalogSource'){catalogLocal.sources=[...form.querySelectorAll('[name=catalogSource]:checked')].map(x=>x.value);drawPage();}
 };
 form.onsubmit=e=>{
  e.preventDefault();const d=new FormData(form), checked=d.getAll('steamTag');
  if(checked.length>10){toast('Выберите не больше 10 жанров и тегов.',true);return;}
  state.filter={...Object.fromEntries(['term','category1','os','maxprice','sort_by','cc'].map(k=>[k,d.get(k)])),tags:checked.join(','),specials:d.has('specials'),page:1};
  window.scrollTo(0,0);run(render);
 };
 form.querySelectorAll('[data-era]').forEach(b=>b.onclick=()=>{
  const chosen=b.getAttribute('aria-pressed')==='true';
  catalogLocal.min=chosen||b.dataset.era==='classic'?FIRST_YEAR:CLASSIC_UNTIL+1;
  catalogLocal.max=chosen||b.dataset.era==='modern'?LAST_YEAR:CLASSIC_UNTIL;
  showYears();drawPage();
 });
 showYears();
 api.sources().then(all=>{
  if(!current(n))return;
  const active=[...new Set(all.filter(x=>x.enabled).map(x=>x.name))];
  catalogLocal.sources=catalogLocal.sources.filter(x=>active.includes(x));
  sourceBox.innerHTML=(active.length?`<p class="facet-help">Активные источники на этой странице</p>${checklist(active.map(x=>[x,x]),catalogLocal.sources,'catalogSource','Поиск источников')}`:'<p class="muted">Нет подключённых источников.</p>')+
   `<button type="button" class="text-btn" data-action="source-url">${I('plus')} Добавить по ссылке</button><button type="button" class="text-btn" data-go="sources">Управлять источниками ${I('arrow')}</button>`;
  drawPage();
 }).catch(()=>{if(current(n))sourceBox.textContent='Не удалось загрузить источники.';});
 try{pageResult=await api.steam({...f,cc:f.cc||state.settings.region});}
 catch(e){offlineReason=e.message;pageResult=offlineResults(f);}
 if(!current(n))return;
 drawPage();
 try{
  const availability=await api.availability(pageResult.games.map(g=>g.title));
  if(!current(n))return;
  pageMatches=new Map(availability.map(x=>[x.title,x.sources]));drawPage();
 }catch{/* Missing source information must not block Steam results. */}
}
let catalogFeedGames=[];
async function loadCatalogFeeds(n,term){
 const root=$('#catalog-feed-results');
 if(!root||!current(n))return;
 const summary=$('.catalog-feed-summary',root), items=$('.catalog-feed-items',root);
 try{
  const [result, feeds]=await Promise.all([api.searchSources(term,1),api.sources()]);
  if(!current(n))return;
  const active=feeds.filter(feed=>feed.enabled);
  const pending=active.filter(f=>f.loading||f.presetName&&!f.updated&&!f.syncError).length;
  const failed=active.filter(f=>f.syncError).length;
  const text=result.total?`Найдено записей: ${result.total.toLocaleString('ru')}.`:active.length?'В загруженных списках совпадений пока нет.':'Нет включённых списков для поиска.';
  summary.textContent=[text,pending?`Списки ещё загружаются: ${pending}.`:'',failed?`Ошибки обновления: ${failed}.`:''].filter(Boolean).join(' ');
  catalogFeedGames=result.games.slice(0,6);
  const html=catalogFeedGames.map((game,i)=>`<button class="catalog-feed-game" type="button" data-action="catalog-feed-game" data-index="${i}"><span class="catalog-feed-art">${I('game')}</span><span><strong>${esc(game.title)}</strong><small>${[game.source,game.size].filter(Boolean).map(esc).join(' · ')}</small></span>${I('chevron')}</button>`).join('');
  if(items._markup!==html){items.innerHTML=html;items._markup=html;reveal(items,'.catalog-feed-game','rise');}
  if(pending)setTimeout(()=>loadCatalogFeeds(n,term),2000);
 }catch(e){if(current(n))summary.textContent=`Не удалось выполнить поиск: ${e.message}`;}
}
function rankings(){
 content.innerHTML=`${head('МАГАЗИН STEAM','Рейтинги','Смотрите оценки игр и официальные чарты магазина Steam.')}
 <div class="item-list">
 <article class="list-item"><span class="list-icon">${I('star')}</span><div class="list-copy"><h3>Лучшие по отзывам</h3><p>Каталог Steam с сортировкой по отзывам.</p></div>${btn('В каталог','review-catalog','arrow')}</article>
 <article class="list-item"><span class="list-icon">${I('trophy')}</span><div class="list-copy"><h3>Самые продаваемые</h3><p>Актуальный рейтинг на официальной странице Steam Charts.</p></div>${btn('Открыть в Steam','steam-charts','external')}</article>
 </div>`;
}
const gameProgress=[['planned','Хочу пройти'],['playing','Играю'],['finished','Пройдено'],['shelved','Отложено']];
const gameProgressLabel=Object.fromEntries(gameProgress);
const gamesTools=libraryTools({api,dialog,showDialog,esc,icon:I,notify:toast,refreshLibrary,humanBytes});
function library(){
 const collections=[...new Set(state.library.flatMap(g=>g.collections))].sort((a,b)=>a.localeCompare(b,'ru'));
 let rows=state.library.filter(g=>(state.libraryFilter==='all'||(state.libraryFilter==='fav'&&g.favorite)||(state.libraryFilter==='recent'&&g.lastPlayed))&&(!state.collection||g.collections.includes(state.collection))&&(!state.libraryProgress||g.progress===state.libraryProgress));
 if(state.libraryFilter==='recent')rows.sort((a,b)=>b.lastPlayed.localeCompare(a.lastPlayed));
 content.innerHTML=`${head('ВАША КОЛЛЕКЦИЯ','Библиотека','Добавляйте установленные игры и запускайте их из одного места.',`${api.scanLibrary?btn('Найти установленные','library-scan-local','search')+btn('Импорт Steam','library-scan-steam','steam'):''}${btn('Добавить игру','new-game','plus','primary')}`)}
 <div class="toolbar"><div class="tabs">${[['all','game','Все игры'],['fav','star','Избранное'],['recent','clock','Недавние']].map(([k,g,l])=>`<button class="tab ${state.libraryFilter===k?'selected':''}" data-action="library-tab" data-tab="${k}">${I(g)}${l}</button>`).join('')}</div><div class="row">${pick('collection',[['','Все коллекции'],...collections.map(c=>[c,c])],state.collection,'Коллекция')}${pick('library-progress',[['','Любой статус'],...gameProgress],state.libraryProgress,'Статус прохождения')}</div></div>
 ${rows.length?`<div class="item-list">${rows.map(g=>`<article class="list-item"><span class="list-icon">${I('game')}</span><div class="list-copy"><h3>${esc(g.title)}</h3><p>${g.steamAppId?'Запуск через Steam':g.exe?esc(g.exe):'Файл .exe не выбран'}${g.lastPlayed?' · Запуск: '+date(g.lastPlayed):''}</p><div class="chips">${gameProgressLabel[g.progress]?`<span class="chip ${g.progress==='finished'?'good':''}">${esc(gameProgressLabel[g.progress])}</span>`:''}${g.rating?`<span class="chip" title="Моя оценка">★ ${esc(g.rating)}/10</span>`:''}${g.collections.map(c=>`<span class="chip">${esc(c)}</span>`).join('')}</div>${g.notes?`<details class="game-notes"><summary>Заметки</summary><p>${esc(g.notes)}</p></details>`:''}</div><div class="item-actions">${api.gameFolders?`<button class="btn" data-action="game-folders" data-id="${g.id}">${I('folder')} Папки</button><button class="btn" data-action="game-backups" data-id="${g.id}">Копии</button>`:''}<button class="icon-btn ${g.favorite?'starred':''}" data-action="favorite" data-id="${g.id}" aria-label="Избранное" aria-pressed="${g.favorite}" title="Избранное">${I('star')}</button><button class="icon-btn" data-action="edit-game" data-id="${g.id}" aria-label="Редактировать" title="Редактировать">${I('edit')}</button><button class="btn primary" data-action="launch-dialog" data-id="${g.id}" ${!g.exe&&!g.steamAppId?'disabled':''}>${I('play')} Запустить</button></div></article>`).join('')}</div>`:details('library',state.library.length?'Нет игр по этому фильтру':'Библиотека пока пуста',state.library.length?'Выберите другую коллекцию или подборку.':'Добавьте первую игру и укажите путь к её исполняемому файлу.',!state.library.length?btn('Добавить игру','new-game','plus','primary'):'' )}`;
 $('[name="collection"]').onchange=e=>{state.collection=e.target.value;run(render);};
 $('[name="library-progress"]').onchange=e=>{state.libraryProgress=e.target.value;run(render);};
}
let chosenExe=null;
function profileRow(p={name:'',args:[]}){return `<div class="profile-row"><input required maxlength="50" data-profile-name value="${esc(p.name)}" placeholder="Название профиля" aria-label="Название профиля"><textarea rows="2" data-profile-args placeholder="Один аргумент на строку" aria-label="Аргументы запуска">${esc(p.args.join('\n'))}</textarea><button type="button" class="icon-btn" data-action="profile-remove" aria-label="Удалить профиль">${I('close')}</button></div>`;}
function editGame(g){
 chosenExe=null;
 showDialog(g?'Редактировать игру':'Добавить игру',`<form id="game-form"><label class="field"><span>Название игры</span><input name="title" required maxlength="160" value="${esc(g?.title)}" placeholder="Например, Minecraft"></label><div class="field"><span>Исполняемый файл</span><div class="row exe-row"><span id="exe-path">${esc(g?.steamAppId?'Запускается через Steam':g?.exe||'Файл .exe не выбран')}</span>${btn('Выбрать .exe','choose-exe','folder')}</div></div><label class="field"><span>Коллекции</span><input name="collections" maxlength="750" value="${esc(g?.collections.join(', '))}" placeholder="Через запятую: RPG, На вечер"></label><div class="settings-fields"><label class="field"><span>Статус прохождения</span>${pick('progress',[['','Не задан'],...gameProgress],g?.progress||'','Статус прохождения')}</label><label class="field"><span>Моя оценка</span>${pick('rating',[['0','Без оценки'],...Array.from({length:10},(_,i)=>[String(i+1),`${i+1}/10`])],String(g?.rating||0),'Моя оценка')}</label></div><label class="field"><span>Заметки к игре</span><textarea name="notes" rows="3" maxlength="4000" placeholder="Где остановился, билд или планы…">${esc(g?.notes)}</textarea></label><label class="toggle"><input name="favorite" type="checkbox" ${g?.favorite?'checked':''}> В избранном</label><div class="profile-head"><strong>Профили запуска</strong>${btn('Добавить профиль','profile-add','plus')}</div><p class="muted small">${g?.steamAppId?'Для запуска через Steam эти аргументы не используются. ':''}Каждый аргумент укажите на отдельной строке, без внешних кавычек.</p><div id="profiles">${(g?.profiles||[]).map(profileRow).join('')}</div><div class="dialog-actions">${g?`<button type="button" class="btn danger" data-action="remove-game" data-id="${g.id}">Удалить игру</button>`:''}<button class="btn primary" type="submit">${I('check')} Сохранить</button></div></form>`);
 $('#game-form').onsubmit=e=>{e.preventDefault();const form=new FormData(e.currentTarget); const profiles=[...$('#profiles').children].map(node=>({name:$('[data-profile-name]',node).value,args:$('[data-profile-args]',node).value.split(/\r?\n/).filter(x=>x.length)}));run(async()=>{await api.saveGame(g?.id||null,{title:form.get('title'),collections:form.get('collections').split(','),favorite:form.has('favorite'),profiles,progress:form.get('progress'),rating:Number(form.get('rating')),notes:form.get('notes')},chosenExe?.token||null);await refreshLibrary();dialog.close();toast('Игра сохранена.');});};
}
async function refreshLibrary(){state.library=await api.library();if(!state.library.some(g=>g.collections.includes(state.collection)))state.collection='';sidebar();if(state.section==='library')await render();}
function launchDialog(g){
 if(g.steamAppId||!g.profiles.length)return launch(g.id,-1);
 showDialog('Запуск игры',`<p class="muted">${esc(g.title)}</p><form id="launch-form"><label class="field"><span>Профиль</span>${pick('profile',[['-1','Без аргументов'],...g.profiles.map((p,i)=>[String(i),p.name])],'-1','Профиль запуска')}</label><div class="dialog-actions"><button class="btn primary">${I('play')} Запустить</button></div></form>`);
 $('#launch-form').onsubmit=e=>{e.preventDefault();const p=Number(new FormData(e.currentTarget).get('profile'));run(async()=>{await launch(g.id,p);dialog.close();});};
}
async function launch(id,p){await api.launchGame(id,p);await refreshLibrary();toast('Игра запущена.');}
function downloads(n){
 const tools=`${api.checkDownload?btn('Проверить скачивание','download-check','check'):''}${api.saveDownloadOptions?btn('Настройки очереди','download-options','sliders'):''}${btn('Добавить загрузку','new-download','plus','primary')}`;
 content.innerHTML=`${head('ПЕРЕДАЧА ФАЙЛОВ','Загрузки','Управляйте HTTP(S)- и BitTorrent-загрузками.',tools)}<div class="notice">${I('alert')}<span>ByAzen не запускает скачанные файлы. BitTorrent обменивается частями файла с другими участниками во время загрузки.</span></div><div class="download-overview" id="dl-overview"></div><div class="tabs download-tabs" aria-label="Вкладки загрузок">${[['active','Очередь'],['history','История']].map(([id,label])=>`<button type="button" class="tab ${state.downloadTab===id?'selected':''}" aria-pressed="${state.downloadTab===id}" data-action="download-tab" data-tab="${id}">${I(id==='active'?'download':'clock')} ${label}</button>`).join('')}</div><div id="dl-list">${details('download','Читаем очередь…','')}</div>`;
 run(()=>refreshDownloads(n));
}
let downloadRead=0;
async function downloadSnapshot(){return api.downloadInfo?api.downloadInfo():{items:await api.downloads(),allowed:true,options:{parallel:1}};}
function downloadActions(j){
 const locked=j.status==='running'&&j.phase==='saving';
 const buttons=[
  ['first','В начало',['queued']],['normal','Снять приоритет',j.priority?['queued']:[]],
  ['pause','Пауза',locked?[]:['queued','running']],['resume',j.status==='paused'?'Продолжить':'Повторить',['paused','error','canceled']],
  ['cancel','Отменить',locked?[]:['queued','running','paused','error']],['remove','Убрать',['paused','done','error','canceled']]
 ].filter(([op,,states])=>states.includes(j.status)&&(op!=='first'||j.position!==1));
 if(api.revealDownload&&['done','error'].includes(j.status))buttons.push(['folder','Папка']);
 if(api.copyDownloadReport&&j.status==='error')buttons.push(['report','Копировать отчёт']);
 return buttons.map(([op,label])=>`<button class="btn" data-action="download-op" data-op="${op}" data-id="${esc(j.id)}">${label}</button>`).join('');
}
function downloadCard(j,allowed){
 const label=transferLabel(j,allowed),completed=j.completedAt&&isHistory(j)?` · ${esc(date(j.completedAt))}`:'';
 return `<article class="list-item dl-item" data-state="${esc(j.status)}"><span class="list-icon">${I(j.status==='error'?'alert':j.status==='done'?'check':'download')}</span><div class="list-copy"><h3>${esc(j.title)} <span class="chip ${j.status==='done'?'good':''}">${esc(label)}</span>${j.verified&&j.status==='done'?' <span class="chip good">SHA-256 проверен</span>':''}</h3><p>${esc(j.origin|| (j.kind==='torrent'?'BitTorrent':'HTTP(S)'))}${completed}</p><p title="${esc(j.file)}">${esc(j.file)}</p><progress class="sr-only" aria-label="Прогресс загрузки"></progress><div class="motion-meter" aria-hidden="true"><span></span></div><p class="dl-stats"></p><div class="dl-live" hidden><span></span><span class="dl-chart" aria-hidden="true">${'<i></i>'.repeat(12)}</span></div><p class="dl-discovery" hidden></p><p class="dl-error" hidden></p></div><div class="item-actions">${downloadActions(j)}</div></article>`;
}
async function refreshDownloads(n){
 const request=++downloadRead,{items,options,allowed}=await downloadSnapshot(),target=$('#dl-list');
 if(!current(n)||request!==downloadRead||!target)return;
 const history=state.downloadTab==='history',list=items.filter(j=>isHistory(j)===history);
 const scheduled=options?.schedule&&options.from!==options.until,active=items.filter(item=>item.status==='running').length;
 const overview=$('#dl-overview'),banner=`<span>${I('download')} Активно: <strong>${active} / ${options?.parallel||1}</strong></span><span>${I('clock')} ${scheduled?`По расписанию: <strong>${esc(options.from)}–${esc(options.until)}</strong>${allowed?'':' · ожидаем начала'}`:'Без расписания'}</span><span>${I('check')} В истории: <strong>${items.filter(isHistory).length}</strong></span>`;
 if(overview.innerHTML!==banner)overview.innerHTML=banner;
 const html=list.length?`<div class="item-list">${list.map(j=>downloadCard(j,allowed)).join('')}</div>`:history?details('clock','История пуста','Здесь появятся завершённые и отменённые загрузки.'):details('download','Очередь пуста',window.byazen?'Добавьте прямую или magnet-ссылку либо выберите игру из источника.':'Управление файлами и очередь доступны в настольном приложении.',btn('Добавить загрузку','new-download','plus'));
 if(target._markup!==html){
  const focused=target.contains(document.activeElement)?document.activeElement.dataset:null, entering=target._markup===undefined;
  target.innerHTML=html;target._markup=html;
  if(entering)reveal(target,'.dl-item,.empty','slide');
  if(focused)Array.from(target.querySelectorAll('button')).find(b=>b.dataset.op===focused.op&&b.dataset.id===focused.id)?.focus({preventScroll:true});
 }
 target.querySelectorAll('.dl-item').forEach((row,i)=>{
  const j=list[i], progress=$('progress',row), meter=$('.motion-meter',row);
  const total=j.total||1,value=j.status==='done'&&!j.total?1:j.bytes||0,pending=j.status==='running'&&j.total==null;
  progress.max=total;
  if(pending)progress.removeAttribute('value');else progress.value=value;
  meter.classList.toggle('is-indeterminate',pending);
  meter.style.setProperty('--fraction',Math.max(0,Math.min(1,value/total)));
  function line(selector,text){const node=$(selector,row);if(node.textContent!==text)node.textContent=text;if(node.className!=='dl-stats')node.hidden=!text;}
  line('.dl-stats',`${humanBytes(j.bytes)} / ${humanBytes(j.total)}`);
  line('.dl-discovery',discoveryLabel(j));
  line('.dl-error',j.status==='error'?j.error||'Не удалось завершить загрузку.':'');
  const live=$('.dl-live',row),rate=rateLabel(j);live.hidden=!rate;
  if(rate){
   if(live.firstElementChild.textContent!==rate)live.firstElementChild.textContent=rate;
   const trend=j.telemetry?.trend||[],max=Math.max(1,...trend);
   $('.dl-chart',live).querySelectorAll('i').forEach((bar,k)=>bar.style.setProperty('--rate',Math.max(.06,(trend[k-(12-trend.length)]||0)/max)));
  }
 });
}
setInterval(()=>{if(state.section==='downloads')refreshDownloads(renderId).catch(()=>{});},1000);
function downloadOptionsDialog(options){
 const el=(name,label,value,min,max,description)=>`<label class="field"><span>${label}</span><input type="number" name="${name}" min="${min}" max="${max}" value="${value}" required><small class="muted small">${description}</small></label>`;
 showDialog('Настройки очереди',`<form id="download-settings"><div class="download-option-fields">${el('parallel','Одновременных загрузок',options.parallel,1,4,'От 1 до 4 задач.')}${el('receive','Скачивание, КиБ/с',options.receiveKiB,0,102400,'Лимит на задачу. 0 — без ограничения.')}${el('send','Отдача BitTorrent, КиБ/с',options.sendKiB,16,10240,'Лимит на одну раздачу.')}</div><p class="muted small">Лимиты скорости применяются при следующем старте задачи.</p><label class="toggle"><input type="checkbox" name="schedule" ${options.schedule?'checked':''}> Загружать по расписанию</label><div class="download-option-fields schedule-fields"><label class="field"><span>Начало</span><input type="time" name="from" value="${esc(options.from)}" required></label><label class="field"><span>Конец</span><input type="time" name="until" value="${esc(options.until)}" required></label></div><p class="muted small">Местное время. Можно выбрать интервал через полночь. Одинаковое время означает весь день. Лаунчер должен быть открыт.</p><div class="dialog-actions">${btn('Отмена','close')}<button class="btn primary" type="submit">${I('check')} Сохранить</button></div></form>`,{eyebrow:'ЗАГРУЗКИ'});
 const form=$('#download-settings');
 form.onsubmit=e=>{e.preventDefault();const button=$('button[type=submit]',form),f=new FormData(form);button.disabled=true;
  run(async()=>{try{await api.saveDownloadOptions({parallel:Number(f.get('parallel')),receiveKiB:Number(f.get('receive')),sendKiB:Number(f.get('send')),schedule:f.has('schedule'),from:f.get('from'),until:f.get('until')});if(form.isConnected&&dialog.open)dialog.close();await refreshDownloads(renderId);toast('Настройки очереди сохранены.');}finally{button.disabled=false;}});
 };
}
function addDownloadDialog(){
 showDialog('Новая загрузка',`<form id="new-download-form"><label class="field"><span>Прямая ссылка HTTP(S) или magnet</span><input name="url" required maxlength="4096" placeholder="https://… или magnet:?…" spellcheck="false"></label><label class="field"><span>SHA-256 (необязательно, только для HTTP/S)</span><input name="sha256" maxlength="64" pattern="[A-Fa-f0-9]{64}" spellcheck="false" placeholder="Контрольная сумма от издателя"></label><div class="dialog-actions">${btn('Отмена','close')}<button type="submit" class="btn primary">${I('folder')} Выбрать место</button></div></form>`);
 const form=$('#new-download-form');
 form.onsubmit=e=>{e.preventDefault();const values=new FormData(form),b=$('button[type=submit]',form);b.disabled=true;run(async()=>{
  try{if(await api.addDownload(String(values.get('url')).trim(),String(values.get('sha256')).trim())){if(form.isConnected&&dialog.open)dialog.close();state.downloadTab='active';await render();toast('Загрузка добавлена.');}}
  finally{b.disabled=false;}
 });};
}
async function sources(n){
 content.innerHTML=`${head('HYDRA JSON','Источники','Управляйте источниками загрузок или импортируйте свои списки.',`${api.connectOnlineFix?btn('Подключить OnlineFix','source-onlinefix','link'): ''}${api.auditSources?btn('Проверить все источники','source-audit','refresh','primary'):''}${btn('Из файла','source-file','file')}`)}<form class="pane source-import-pane" id="source-url-form"><h2>Добавить по ссылке</h2><label class="field" for="source-url-input"><span>Ссылка на Hydra JSON</span></label><div class="row source-import-controls"><input id="source-url-input" type="url" name="url" placeholder="https://example.org/source.json" maxlength="4096" required autocomplete="off" spellcheck="false" aria-describedby="source-url-help source-url-status"><button class="btn primary" type="submit">${I('link')} Предпросмотр</button></div><p id="source-url-help" class="muted small">Нужна ссылка на сам JSON, а не на страницу со списком источников.</p><p id="source-url-status" class="source-url-status small" role="status"></p></form><div class="notice">${I('alert')}<span>Источники предоставлены пользователем и не проверены ByAzen. Используйте только те, которым доверяете, и скачивайте только то, на что у вас есть право.</span></div><div class="section-heading" id="source-search-heading"><div><span class="section-icon">${I('search')}</span><h2>Игры в источниках</h2></div></div><form id="source-search" class="row"><input name="term" value="${esc(state.srcTerm)}" maxlength="200" placeholder="Поиск по названию" aria-label="Поиск по импортированным играм"><select name="sourceId" aria-label="Источник игр"><option value="">Все включённые источники</option></select><button class="btn" type="submit">${I('search')} Найти</button>${btn('Показать все','browse-sources','layers')}</form><div id="source-games" aria-live="polite"></div><div class="section-heading"><div><span class="section-icon">${I('layers')}</span><h2>Подключённые списки</h2></div>${api.retrySourceLists?btn('Повторить загрузку списков','source-retry','refresh'):''}</div><div id="sources-list"></div>`;
 const form=$('#source-url-form'), input=$('#source-url-input'), status=$('#source-url-status');
 form.onsubmit=async e=>{
  e.preventDefault();
  const submit=$('button[type="submit"]',form), value=input.value.trim();
  if(submit.disabled)return;
  submit.disabled=true; status.classList.remove('is-error');status.textContent='Читаем JSON…';
  try {const preview=await api.previewURL(value);if(current(n)){status.textContent='';showSourcePreview(preview);}}
  catch(e){if(current(n)){status.classList.add('is-error'); status.textContent=e.message;}}
  finally{submit.disabled=false;}
 };
 const search=$('#source-search');
 search.onsubmit=e=>{e.preventDefault();const data=new FormData(search);state.srcTerm=String(data.get('term')||'').trim();state.srcId=String(data.get('sourceId')||'');state.srcPage=1;run(()=>loadSourceGames(n));};
 $('[name=sourceId]',search).onchange=()=>search.requestSubmit();
 await refreshSourceList(n);
 await loadSourceGames(n);
}
let sourceListRequest=0;
function sourceStatus(s){
 if(s.loading)return s.updated?'Обновляем список…':'Загружаем список…';
 if(s.syncError)return `${s.updated?'Показан сохранённый список. ':''}Ошибка: ${s.syncError}`;
 if(s.updated)return `${s.count} игр · Обновлён ${date(s.updated)}`;
 return s.enabled?'Ожидает загрузки списка':'Список ещё не загружен';
}
async function refreshSourceList(n){
 const request=++sourceListRequest;
 const list=await api.sources();if(!current(n)||request!==sourceListRequest)return false;
 const target=$('#sources-list');if(!target)return false;
 const select=$('#source-search [name=sourceId]');
 const opts='<option value="">Все включённые источники</option>'+list.filter(s=>s.enabled).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
 if(select&&select._markup!==opts){select.innerHTML=opts;select._markup=opts;select.value=state.srcId;if(select.value!==state.srcId){state.srcId='';select.value='';state.srcPage=1;}}
 const html=list.length?`<div class="item-list">${list.map(s=>`<article class="list-item"><span class="list-icon">${I(s.kind==='url'?'link':'file')}</span><div class="list-copy"><h3>${esc(s.name)} <span class="chip ${s.enabled?'good':''}">${s.enabled?'Включён':'Отключён'}</span>${s.primaryOnlineFix?' <span class="chip">Основной OnlineFix</span>':''}${s.presetName?' <span class="chip">Предустановлен</span>':''}</h3><p>${esc(sourceStatus(s))}</p><p>${esc(s.url||s.file)}</p></div><div class="item-actions">${[['toggle',s.enabled?'Отключить':'Включить'],['refresh','Обновить'],...(api.replaceSource?[['replace','Заменить список']]:[]),['remove','Удалить']].map(([op,label])=>`<button class="btn" data-action="source-op" data-op="${op}" data-id="${esc(s.id)}" ${op==='refresh'&&s.loading?'disabled':''}>${label}</button>`).join('')}</div></article>`).join('')}</div>`:details('layers','Источники не подключены','Добавьте свой JSON-файл или ссылку на него, чтобы искать игры.');
 if(target._markup===html)return false;
 const focus=target.contains(document.activeElement)?document.activeElement.dataset:null;
 const entering=target._markup===undefined;
 target.innerHTML=html;target._markup=html;
 if(entering)reveal(target,'.item-list > .list-item,.empty','slide');
 if(focus)[...target.querySelectorAll('button')].find(b=>b.dataset.id===focus.id&&b.dataset.op===focus.op)?.focus({preventScroll:true});
 return true;
}
setInterval(()=>{if(window.byazen&&state.section==='sources'){const n=renderId;refreshSourceList(n).then(changed=>{if(changed&&current(n))return loadSourceGames(n);}).catch(()=>{});}},1500);
let sourceRead=0, shownSourceGames=[];
async function loadSourceGames(n){
 const task=++sourceRead;
 const result=await api.searchSources(state.srcTerm,state.srcPage,state.srcId);if(!current(n)||task!==sourceRead)return;
 state.srcPage=result.page;
 shownSourceGames=result.games;
 const last=Math.max(1,Math.ceil(result.total/result.pageSize));
 const pager=last>1?`<form class="source-jump" aria-label="Переход к странице"><label>Страница <input type="number" name="page" min="1" max="${last}" value="${result.page}" required></label><button class="btn" type="submit">Перейти</button></form>`:'';
 let html=result.games.length?`<div class="source-results-overview"><p>Доступно записей: ${result.total.toLocaleString('ru')}</p>${pager}</div><div class="item-list">${result.games.map((g,i)=>`<article class="list-item"><span class="list-icon">${I('game')}</span><div class="list-copy"><h3>${esc(g.title)}</h3><p>${[g.source,g.size,date(g.date)].filter(Boolean).map(esc).join(' · ')}</p></div><button class="btn" data-action="source-links" data-index="${i}">${I('link')} Ссылки (${g.links.length})</button></article>`).join('')}</div>${rangeButtons(result,'source')}`:'';
 if(!result.games.length)html=state.srcTerm?details('search','Ничего не найдено','Попробуйте часть названия или оригинальное название. Проверьте, что нужный источник включён и его список загрузился.',btn('Показать все игры','browse-sources','layers')):details('layers','Пока нет загруженных записей','Статус загрузки каждого списка указан ниже.');
 const target=$('#source-games');
 if(target._markup!==html){target.innerHTML=html;target._markup=html;reveal(target,'.item-list > .list-item,.empty','rise');}
 const jump=$('.source-jump',target);if(jump)jump.onsubmit=e=>{e.preventDefault();run(()=>switchSourcePage(Number(new FormData(jump).get('page'))));};
}
async function switchSourcePage(page){
 const n=renderId;state.srcPage=page;await loadSourceGames(n);
 if(current(n))$('#source-search-heading')?.scrollIntoView({block:'start'});
}
async function showSourceAudit(){
 if(!api.auditSources)return;
 showDialog('Проверка всех источников',`<div id="source-audit-report" aria-busy="true"><p class="muted">Считываем все подключённые списки и проверяем их записи. Файлы игр не скачиваются.</p></div>`);
 const target=$('#source-audit-report');
 try{
  const rows=await api.auditSources();
  if(!dialog.open||!target.isConnected)return;
  const ok=rows.filter(row=>row.status==='ok'), count=ok.reduce((n,row)=>n+row.current.total,0);
  const visible=row=>row.enabled?`${row.cached.searchable} в текущем поиске`:'выключен, в поиске не участвует';
  const line=row=>row.status==='ok'?`Записей: ${row.current.total}; доступны в списке: ${row.current.browsable}; по названию: ${row.current.searchable}; пропущено: ${row.current.skipped}; отклонено ссылок: ${row.current.ignoredLinks}.`:`Ошибка: ${row.error}.`;
  const summary=`Проверено списков: ${rows.length}. Прочитано: ${ok.length}; с ошибками: ${rows.length-ok.length}. Записей в прочитанных списках: ${count}.`;
  const report=[summary,...rows.map(row=>`${row.name}: ${line(row)} ${visible(row)}.`)].join('\n');
  target.innerHTML=`<p>${esc(summary)}</p><p class="muted small">Повторы считаются отдельными записями. Проверяется JSON и поиск по названию записи, а не доступность файлов игры или совпадение с карточкой Steam. Сохранённые списки не меняются.</p><ul class="source-audit-list">${rows.map(row=>`<li><strong>${esc(row.name)}</strong><p>${esc(line(row))}</p><small>${esc(visible(row))}</small></li>`).join('')}</ul><details><summary>Отчёт для копирования</summary><textarea rows="7" readonly aria-label="Текст отчёта">${esc(report)}</textarea></details>`;
 }catch(e){if(dialog.open&&target.isConnected)target.textContent=e.message;}
 finally{target.setAttribute('aria-busy','false');}
}
function showSourcePreview(d,replacementId=''){
 if(!d)return;
 const changing=Boolean(replacementId);
 showDialog(changing?'Проверка нового списка':'Предпросмотр источника',`<p><strong>${esc(d.name)}</strong> · ${d.count} записей</p><p class="muted">Пропущено записей: ${d.skipped}. Отклонено ссылок: ${d.ignoredLinks}.</p><ul class="preview-list">${d.titles.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><div class="notice">${I('alert')}<span>${changing?'После подтверждения новый список заменит старый. Состояние «Включён» или «Отключён» сохранится.':'Импортируйте источник, только если доверяете ему.'}</span></div><div class="dialog-actions"><button class="btn" data-action="close">Отмена</button><button class="btn primary" data-action="${changing?'source-replace-commit':'source-import'}" data-id="${esc(d.id)}" data-source-id="${esc(replacementId)}" ${changing&&!d.count?'disabled':''}>${I('check')} ${changing?'Подтвердить замену':'Импортировать'}</button></div>`);
}
function replaceSourceDialog(id){
 showDialog('Заменить список источника',`<p class="muted">Укажи рабочую прямую ссылку на Hydra JSON или выбери сохранённый файл. До подтверждения текущий список не меняется.</p><form id="source-replacement-form"><label class="field"><span>Новая ссылка на Hydra JSON</span><input type="url" name="url" placeholder="https://example.org/source.json" required maxlength="4096"></label><p class="source-url-status small" role="status"></p><div class="dialog-actions"><button type="button" class="btn" id="replacement-file">${I('file')} Выбрать JSON-файл</button><button type="submit" class="btn primary">${I('link')} Проверить ссылку</button></div></form>`);
 const form=$('#source-replacement-form'), file=$('#replacement-file',form), submit=$('[type=submit]',form), status=$('[role=status]',form);
 async function verify(read){
  if(submit.disabled)return;
  submit.disabled=file.disabled=true;status.classList.remove('is-error');status.textContent='Читаем список…';
  try{const preview=await read();if(dialog.open&&form.isConnected){status.textContent='';if(preview)showSourcePreview(preview,id);}}
  catch(e){if(dialog.open&&form.isConnected){status.classList.add('is-error');status.textContent=e.message;}}
  finally{submit.disabled=file.disabled=false;}
 }
 form.onsubmit=e=>{e.preventDefault();return verify(()=>api.previewURL(String(new FormData(form).get('url')).trim(),id));};
 file.onclick=()=>verify(()=>api.previewFile(id));
}
function searchInSources(term){
 state.srcTerm=String(term??'').trim().slice(0,200);state.srcPage=1;state.srcId='';
 go('sources');
 queueMicrotask(()=>{const input=$('#source-search input');input?.focus({preventScroll:true});$('#source-search-heading')?.scrollIntoView({block:'start'});});
}
function openCatalogGame(product){
 if(!product)return;
 const version=renderId;
 openDownloadPicker(product,{api,dialog,showDialog,esc,date,isCurrent:()=>current(version),onSearch:()=>searchInSources(product.title),onPick:game=>openCatalogGame({title:game.title,preferred:game}),onAdded:()=>{state.downloadTab='active';go('downloads');toast('Загрузка добавлена.');}});
}
function setWallpaper(record){
 if(state.wallpaper?.blob!==record?.blob){
  if(customURL)URL.revokeObjectURL(customURL);
  customURL=record?URL.createObjectURL(record.blob):undefined;
 }
 state.wallpaper=record;
}
function applyTheme(){
 const theme=getTheme(state.settings.theme),root=document.documentElement;
 const custom=state.wallpaper?.enabled&&customURL;
 root.dataset.theme=theme.id;
 root.dataset.themeGroup=custom?'custom':(theme.atmosphere||theme.group);
 root.style.setProperty('--hue',theme.hue);
 root.style.setProperty('--second-hue',theme.alt);
 applyAppearance(root,state.settings.appearance);
 root.classList.toggle('motion-off',state.settings.motion);syncMotion();
 const wall=$('#theme-wall'),image=$('#theme-wall-image'),src=custom||theme.asset;
 wall.dataset.art=custom?'custom':(theme.art||'vector');
 wall.dataset.fit=custom?state.wallpaper.fit:'cover';
 wall.hidden=!src;
 if(src&&image.getAttribute('src')!==src)image.src=src;
 if(!src)image.removeAttribute('src');
}
function miniature(theme,lazy=true){
 return `<span class="theme-preview" aria-hidden="true">${theme.asset?`<img src="${theme.asset}" alt="" ${lazy?'loading="lazy"':''} decoding="async">`:''}<span class="mini-shell"><i></i><i></i><i></i></span></span>`;
}
function themeCard(theme){
 const active=state.settings.theme===theme.id;
 return `<button type="button" class="theme-card ${active?'theme-selected':''}" data-action="theme-preview" data-theme-id="${theme.id}" data-art="${theme.art||'vector'}" aria-haspopup="dialog" aria-label="Предпросмотр: ${esc(theme.name)}${active?' (активна)':''}">${miniature(theme)}<span class="theme-caption"><span><strong>${esc(theme.name)}</strong><small>${esc(theme.category)}</small></span>${I(active?'check':'chevron')}</span></button>`;
}
function applyThemeCardStyle(parent){
 parent.querySelectorAll('.theme-card, .theme-demo').forEach(node=>{
  const theme=getTheme(node.dataset.themeId);
  node.style.setProperty('--sample',theme.hue);
  node.style.setProperty('--sample-alt',theme.alt);
  node.dataset.look=theme.id;
 });
}
function themeGallery(){
 const active=getTheme(state.settings.theme),custom=state.wallpaper?.enabled&&customURL,cover=custom||active.asset||sceneThemes[0].asset;
 return `<header class="theme-showcase"><img src="${cover}" alt="" decoding="async"><div class="theme-showcase-copy"><div class="eyebrow"><i></i> BYAZEN / ОФОРМЛЕНИЕ</div><h2>Галерея фонов</h2><p>${visualThemes.length} фонов в ${collections.length} коллекциях — от аниме и кино до неона и космоса. Или загрузи своё изображение.</p><div class="theme-showcase-actions"><button class="btn primary" data-action="theme-custom">${I('plus')} Свой фон</button><button class="btn theme-classic-shortcut" data-action="theme-random">${I('shuffle')} Случайная тема</button><button class="btn theme-classic-shortcut" data-action="theme-editor">${I('sliders')} Редактор темы</button><button class="btn theme-classic-shortcut" data-action="settings-jump" data-target="theme-classics">Классические</button><span class="chip">${custom?'Свой фон включён':`Активна: ${esc(active.name)}`}</span></div></div></header>
 ${custom?`<div class="wallpaper-active"><span>${I('check')} Используется своё изображение</span><button class="btn" data-action="theme-custom-disable">Вернуть фон темы</button></div>`:''}
 <div class="theme-quick" role="group" aria-label="Популярные коллекции">${[['','Все фоны'],['favorites','Избранные темы'],...sceneCollections.map(c=>[c.id,c.name])].map(([id,name])=>`<button type="button" class="btn" data-theme-collection="${id}" aria-pressed="${id===state.themeGroup}">${esc(name)}</button>`).join('')}</div>
 <div class="theme-tools"><label class="theme-filter"><span>Коллекция</span><select id="theme-group" aria-label="Коллекция тем"><option value="">Все коллекции</option><option value="favorites" ${state.themeGroup==='favorites'?'selected':''}>Избранные темы</option>${collections.map(c=>`<option value="${c.id}" ${c.id===state.themeGroup?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label class="theme-filter theme-search"><span>Поиск темы</span><span class="input-icon">${I('search')}<input id="theme-search" type="search" placeholder="Например, северное сияние" maxlength="60" value="${esc(state.themeQuery)}"></span></label></div>
 <p class="theme-count muted small" id="theme-count" aria-live="polite"></p><div id="theme-results" class="theme-grid theme-results"></div>
 <div class="theme-classics" id="theme-classics" tabindex="-1"><div class="section-heading"><h3>Классические темы</h3><span class="muted small">Без фоновых эффектов</span></div><div class="theme-grid classic-grid">${classicThemes.map(themeCard).join('')}</div></div>`;
}
function filteredThemes(){
 const favorites=state.themeGroup==='favorites';
 return findThemes(favorites?'':state.themeGroup,state.themeQuery).filter(t=>!favorites||state.settings.favoriteThemes?.includes(t.id));
}
function drawThemeResults(){
 const results=$('#theme-results'),found=filteredThemes();
 results.innerHTML=found.length?found.map(themeCard).join(''):(state.themeGroup==='favorites'&&!state.themeQuery?details('star','Избранных тем пока нет','Открой предпросмотр любой темы и нажми «В избранное».'):details('search','Темы не найдены','Введи другое название или выбери другую коллекцию.'));
 $('#theme-count').textContent=`Показано: ${found.length} из ${visualThemes.length}`;
 applyThemeCardStyle(results);
}
function drawThemes(){
 const host=$('#themes');host.innerHTML=themeGallery();
 applyThemeCardStyle(host);drawThemeResults();
 function selectGroup(id){
  state.themeGroup=id;$('#theme-group').value=id;
  for(const chip of host.querySelectorAll('[data-theme-collection]'))chip.setAttribute('aria-pressed',String(chip.dataset.themeCollection===id));
  drawThemeResults();
 }
 $('#theme-group').onchange=e=>selectGroup(e.target.value);
 for(const chip of host.querySelectorAll('[data-theme-collection]'))chip.onclick=()=>selectGroup(chip.dataset.themeCollection);
 $('#theme-search').oninput=e=>{state.themeQuery=e.target.value;drawThemeResults();};
}
function previewTheme(id){
 const theme=getTheme(id),active=theme.id===state.settings.theme,marked=state.settings.favoriteThemes?.includes(theme.id);
 showDialog(esc(theme.name),`<div class="theme-demo" data-theme-id="${theme.id}" data-demo-group="${theme.atmosphere||theme.group}">${miniature(theme,false)}<span class="theme-demo-shade" aria-hidden="true"></span><span class="theme-atmosphere" aria-hidden="true"></span><div class="theme-demo-ui" aria-hidden="true"><span class="theme-demo-logo">B</span><strong>ByAzen</strong><span>Каталог</span><span>Библиотека</span></div><div class="theme-demo-detail" aria-hidden="true"><strong>${esc(theme.category)}</strong><span>${esc(theme.effect)}</span></div></div><p class="theme-preview-summary muted small">${theme.asset?`Эффект: ${esc(theme.effect)}. ${state.wallpaper?.enabled?'Чтобы увидеть этот фон в лаунчере, нажми «Вернуть фон темы».':'Фон используется во всех разделах лаунчера.'}`:'Однотонный фон без анимации.'}</p><div class="dialog-actions">${theme.asset?`<button type="button" class="btn theme-bookmark" aria-pressed="${Boolean(marked)}" data-action="theme-favorite" data-theme-id="${theme.id}">${I('star')} <span>${marked?'В избранном':'В избранное'}</span></button>`:''}<button type="button" class="btn" data-action="close">${active?'Закрыть':'Отмена'}</button>${active?'':`<button type="button" class="btn primary" data-action="theme" data-theme-id="${theme.id}">${I('check')} Применить тему</button>`}</div>`,{variant:'theme',eyebrow:'ПРЕДПРОСМОТР ТЕМЫ'});
 applyThemeCardStyle(dialog);
}
function themeEditor(){
 const initial=cleanAppearance(state.settings.appearance);
 const range=(name,label,min,max)=>`<label class="field"><span>${label} · <output id="appearance-${name}"></output></span><input type="range" name="${name}" min="${min}" max="${max}" aria-label="${label}"></label>`;
 showDialog('Редактор темы',`<form id="appearance-form"><div class="appearance-demo" aria-hidden="true"><span class="theme-atmosphere"></span><div class="appearance-demo-card"><strong>ByAzen</strong><span>Панель библиотеки</span><span class="appearance-demo-pill">Акцент</span></div></div><div class="appearance-fields"><label class="field"><span>Цвет акцента</span><input type="color" name="accent"></label><label class="field"><span>Шрифт интерфейса</span>${pick('font',[['interface','Inter'],['system','Системный'],['rounded','Trebuchet'],['serif','С засечками']],initial.font,'Шрифт интерфейса')}</label>${range('opacity','Непрозрачность панелей',65,100)}${range('radius','Скругление',0,32)}${range('effects','Интенсивность фона',0,100)}</div><label class="toggle"><input type="checkbox" name="enabled"> Применять мои цвета, панели и шрифт</label><p class="muted small">Интенсивность действует отдельно: 0 отключает атмосферный слой, но не убирает фон. Системное уменьшение движения имеет приоритет.</p><div class="dialog-actions appearance-actions"><button type="button" class="btn" id="appearance-reset">Сбросить</button><div class="row">${btn('Отмена','close')}<button class="btn primary" type="submit">${I('check')} Сохранить</button></div></div></form>`,{eyebrow:'СВОЁ ОФОРМЛЕНИЕ'});
 const form=$('#appearance-form'),demo=$('.appearance-demo',form),fields=form.elements;
 function fromFields(){return cleanAppearance({enabled:fields.enabled.checked,accent:fields.accent.value,font:fields.font.value,opacity:Number(fields.opacity.value),radius:Number(fields.radius.value),effects:Number(fields.effects.value)});}
 function preview(){const draft=fromFields();applyAppearance(demo,{...draft,enabled:true});for(const [name,unit] of [['opacity','%'],['radius',' px'],['effects','%']])$(`#appearance-${name}`,form).textContent=draft[name]+unit;}
 function fill(style){for(const name of ['accent','font','opacity','radius','effects'])fields[name].value=style[name];fields.enabled.checked=style.enabled;preview();}
 fill(initial);
 form.oninput=event=>{if(['accent','font','opacity','radius'].includes(event.target.name))fields.enabled.checked=true;preview();};
 $('#appearance-reset',form).onclick=()=>fill(cleanAppearance(null));
 form.onsubmit=e=>{e.preventDefault();const b=$('button[type=submit]',form);b.disabled=true;run(async()=>{
  try{state.settings=await api.saveSettings({...state.settings,appearance:fromFields()});applyTheme();if(form.isConnected&&dialog.open)dialog.close();toast('Оформление сохранено.');}
  finally{b.disabled=false;}
 });};
}
function customWallpaperDialog(){
 showDialog('Свой фон',`<div id="wallpaper-picker"><div class="wallpaper-draft"><img alt="Предпросмотр своего фона" hidden><div class="wallpaper-placeholder">${I('plus')}<strong>Твоё изображение</strong><span>JPG, PNG или WebP до 16 МБ</span></div></div><div class="wallpaper-controls"><input id="wallpaper-file" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden><button type="button" class="btn" id="wallpaper-choose">${I('folder')} Выбрать изображение</button><label class="theme-filter"><span>Размещение</span><select id="wallpaper-fit"><option value="cover">Заполнить</option><option value="contain">Вписать</option></select></label></div><p id="wallpaper-status" class="muted small" role="status"></p><div class="dialog-actions">${state.wallpaper?'<button class="btn danger" type="button" id="wallpaper-clear">Удалить свой фон</button>':''}<button class="btn" type="button" data-action="close">Отмена</button><button class="btn primary" type="button" id="wallpaper-apply">${I('check')} Установить фон</button></div></div>`,{variant:'theme',eyebrow:'ЛОКАЛЬНОЕ ИЗОБРАЖЕНИЕ'});
 const panel=$('#wallpaper-picker'),file=$('#wallpaper-file',panel),select=$('#wallpaper-fit',panel),status=$('#wallpaper-status',panel);
 const choose=$('#wallpaper-choose',panel),apply=$('#wallpaper-apply',panel),clear=$('#wallpaper-clear',panel);
 const preview=$('.wallpaper-draft img',panel),placeholder=$('.wallpaper-placeholder',panel);
 let draft=state.wallpaper,draftURL,busy=false;
 const stillOpen=()=>panel.isConnected&&dialog.open;
 disposeWallpaperPreview=()=>{if(draftURL)URL.revokeObjectURL(draftURL);disposeWallpaperPreview=undefined;};
 function refresh(){
  if(draftURL)URL.revokeObjectURL(draftURL);
  draftURL=draft?URL.createObjectURL(draft.blob):undefined;
  preview.hidden=!draftURL;placeholder.hidden=Boolean(draftURL);
  if(draftURL)preview.src=draftURL;else preview.removeAttribute('src');
  select.value=draft?.fit||'cover';preview.dataset.fit=select.value;
  status.textContent=draft?.name||'Файл остаётся на этом устройстве.';
  status.classList.remove('is-error');
 }
 function controls(on){
  busy=on;choose.disabled=on;select.disabled=on||!draft;apply.disabled=on||!draft;if(clear)clear.disabled=on;
 }
 refresh();controls(false);
 choose.onclick=()=>file.click();
 select.onchange=()=>{preview.dataset.fit=select.value;draft={...draft,fit:select.value};};
 file.onchange=async()=>{
  const chosen=file.files[0];file.value='';if(!chosen||busy)return;
  controls(true);status.textContent='Подготавливаем изображение…';
  try{const next=await prepareWallpaper(chosen);if(stillOpen()){draft=next;refresh();}}
  catch(e){if(stillOpen()){status.textContent=e.message;status.classList.add('is-error');}}
  finally{controls(false);}
 };
 async function update(record,message){
  controls(true);
  try{
   await saveWallpaper(record);setWallpaper(record);applyTheme();
   if(stillOpen())dialog.close();
   if(state.section==='settings'){drawThemes();$('[data-action=theme-custom]')?.focus({preventScroll:true});}
   toast(message);
  }catch(e){if(stillOpen()){status.textContent=e.message;status.classList.add('is-error');}else toast(e.message,true);}
  finally{controls(false);}
 }
 apply.onclick=()=>update({...draft,enabled:true},'Свой фон установлен.');
 if(clear)clear.onclick=()=>update(null,'Свой фон удалён.');
}
dialog.addEventListener('close',()=>{if(!dialog.open)disposeWallpaperPreview?.();});
function settings(){
 content.innerHTML=`${head('ПЕРСОНАЛИЗАЦИЯ','Настройки','Настройте профиль, оформление и поведение лаунчера.')}
 <div class="settings-tabs" aria-label="Разделы настроек"><button class="btn" data-action="settings-jump" data-target="themes">${I('spark')} Темы</button><button class="btn" data-action="settings-jump" data-target="settings-form">${I('settings')} Профиль и движение</button>${btn('Что нового','release-notes','spark')}</div>
 <section class="theme-pane" id="themes" aria-label="Галерея тем" tabindex="-1"></section>
 <form id="settings-form" class="pane settings-pane" tabindex="-1"><h2>Профиль и движение</h2><div class="settings-fields"><label class="field"><span>Имя профиля</span><input name="name" required maxlength="32" value="${esc(state.settings.name)}"></label><label class="field"><span>Регион Steam по умолчанию</span>${pick('region',regions,state.settings.region,'Регион Steam')}</label><label class="field"><span>Открывать при запуске</span>${pick('startSection',[['home','Главная'],['library','Библиотека'],['catalog','Каталог'],['downloads','Загрузки'],['sources','Источники'],['rankings','Рейтинги']],state.settings.startSection||'home','Открывать при запуске')}</label></div><label class="toggle"><input type="checkbox" name="motion" ${state.settings.motion?'checked':''}> Уменьшить движение</label><p class="muted small">Отключает анимацию фона и интерфейса. Системная настройка уменьшения движения учитывается всегда.</p><button class="btn primary" type="submit">${I('check')} Сохранить настройки</button></form>`;
 drawThemes();
 $('#settings-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{state.settings=await api.saveSettings({...state.settings,name:f.get('name').trim()||'Игрок',region:f.get('region'),startSection:f.get('startSection'),motion:f.has('motion')});state.filter.cc=state.settings.region;applyTheme();sidebar();toast('Настройки сохранены.');});};
}
function confirmDialog(title,desc,callback){
 showDialog(title,`<p class="muted">${desc}</p><div class="dialog-actions">${btn('Отмена','close')}<button class="btn danger" id="confirm-action">Подтвердить</button></div>`);
 $('#confirm-action').onclick=()=>run(async()=>{await callback();dialog.close();});
}
function selectHero(k){state.featured=k;run(()=>render('hero'));}
async function dispatch(b){
 const d=b.dataset, a=d.action, g=state.library.find(g=>g.id===d.id);
 if(d.go){if(dialog.open&&dialog.contains(b))dialog.close();return go(d.go);}
 if(a?.startsWith('steam-')&&/^steam-\d+$/.test(a)){const game=games.find(x=>x.id===Number(a.split('-')[1]));if(game)return openCatalogGame({...game,image:'assets/'+game.image+'.jpg'});}
 switch(a){
  case 'close':dialog.close();break;
  case 'home-tab':state.tab=Number(d.tab);return render('home-tab');
  case 'surprise':selectHero((state.featured+1+Math.floor(Math.random()*(games.length-1)))%games.length);$('.hero')?.scrollIntoView({block:'nearest'});break;
  case 'catalog-game':return openCatalogGame({title:d.title,image:d.image});
  case 'steam-charts':return api.openSteamCharts();
  case 'review-catalog':state.filter={term:'',page:1,category1:'998',sort_by:'Reviews_DESC'};return go('catalog');
  case 'feedback':return showDialog('Обратная связь',`<p class="muted">Сообщите об ошибке или предложите улучшение. Откроется форма GitHub — ByAzen ничего не отправляет автоматически.</p><div class="dialog-actions">${btn('Открыть форму','feedback-open','external','primary')}</div>`);
  case 'feedback-open':return api.openProjectFeedback();
  case 'catalog-toggle':catalogLocal.mobileOpen=!catalogLocal.mobileOpen;$('#catalog-form').classList.toggle('filters-open',catalogLocal.mobileOpen);b.setAttribute('aria-expanded',String(catalogLocal.mobileOpen));if(catalogLocal.mobileOpen)reveal(content,'.catalog-filters','slide');break;
  case 'reset-filters':state.filter={term:'',page:1};Object.assign(catalogLocal,{min:FIRST_YEAR,max:LAST_YEAR,sources:[]});window.scrollTo(0,0);return render();
  case 'rerender':return render();
  case 'steam-page':state.filter.page=Number(d.page);window.scrollTo(0,0);return render();
  case 'search-sources':return searchInSources(state.filter.term);
  case 'catalog-feed-game':{const game=catalogFeedGames[Number(d.index)];if(game)return openCatalogGame({title:game.title,preferred:game});break;}
  case 'browse-sources':return searchInSources('');
  case 'source-page':return switchSourcePage(Number(d.page));
  case 'library-tab':state.libraryFilter=d.tab;return render();
  case 'new-game':return editGame();
  case 'library-scan-local':case 'library-scan-steam':{const n=renderId;b.disabled=true;try{return await gamesTools.openScan(a==='library-scan-steam'?'steam':'local',()=>current(n));}finally{b.disabled=false;}}
  case 'game-folders':if(g)return gamesTools.folders(g);break;
  case 'game-backups':if(g)return gamesTools.backups(g);break;
  case 'edit-game':if(g)return editGame(g);break;
  case 'choose-exe':return api.chooseExe().then(exe=>{if(exe&&$('#game-form')){chosenExe=exe;$('#exe-path').textContent=exe.path;if(!$('#game-form [name="title"]').value)$('#game-form [name="title"]').value=exe.title;}});
  case 'profile-add':if($('#profiles').children.length<20)$('#profiles').insertAdjacentHTML('beforeend',profileRow());break;
  case 'profile-remove':b.closest('.profile-row').remove();break;
  case 'favorite':return api.favorite(d.id).then(refreshLibrary);
  case 'remove-game':return confirmDialog('Удалить игру?', 'Это удалит запись из библиотеки, но не файлы игры и не резервные копии.',async()=>{await api.removeGame(d.id);await refreshLibrary();});
  case 'launch-dialog':if(g)return launchDialog(g);break;
  case 'new-download':return addDownloadDialog();
  case 'download-tab':state.downloadTab=d.tab==='history'?'history':'active';return render();
  case 'download-options':return downloadOptionsDialog((await downloadSnapshot()).options);
  case 'download-check':{
   b.disabled=true;
   try{
    const result=await api.checkDownload();if(!result)return;
    const stages={disk:'Запись на диск',network:'Сетевое соединение',integrity:'Проверка файла'};
    showDialog(result.ok?'Проверка прошла':'Проверка не прошла',`<div class="notice">${I(result.ok?'check':'alert')}<span>${result.ok?`HTTPS и запись на диск работают. Сохранено ${humanBytes(result.received)}, SHA-256 совпал.`:`${esc(stages[result.stage]||'Загрузка')}: ${esc(result.message)}`}</span></div><p class="muted small">Тест использует небольшой публичный HTTPS-файл и не проверяет наличие участников конкретной раздачи.</p><div class="dialog-actions">${btn('Закрыть','close','','primary')}</div>`,{eyebrow:'ДИАГНОСТИКА'});
   }finally{b.disabled=false;}
   return;
  }
  case 'download-op':{
   if(d.op==='folder')return api.revealDownload(d.id);
   if(d.op==='report'){await api.copyDownloadReport(d.id);toast('Отчёт без пути, названия и ссылки скопирован.');return;}
   await api.downloadAction(d.id,d.op);return refreshDownloads(renderId);
  }
  case 'source-audit':return showSourceAudit();
  case 'source-retry':{
   if(!api.retrySourceLists)return;
   const version=renderId;b.disabled=true;toast('Повторяем загрузку списков с ошибками.');
   try{await api.retrySourceLists();if(current(version)){await refreshSourceList(version);await loadSourceGames(version);}toast('Проверка завершена. Статус каждого списка показан в «Источниках».');}
   finally{b.disabled=false;}
   break;
  }
  case 'source-file':return api.previewFile().then(showSourcePreview);
  case 'source-url':go('sources');queueMicrotask(()=>$('#source-url-input')?.focus());break;
  case 'source-import':return api.importSource(d.id).then(()=>{dialog.close();toast('Источник импортирован.');return render();});
  case 'source-onlinefix':{
   b.disabled=true;
   try{const {count}=await api.connectOnlineFix();toast(`OnlineFix подключён: ${count} записей.`);}
   catch(e){toast(`OnlineFix: ${e.message}`);}
   finally{b.disabled=false;}
   if(state.section==='sources')return render();
   break;
  }
  case 'source-replace-commit':{b.disabled=true;try{await api.replaceSource(d.sourceId,d.id);dialog.close();toast('Список источника заменён.');return render();}finally{b.disabled=false;}}
  case 'source-op':if(d.op==='replace')return replaceSourceDialog(d.id);if(d.op==='remove')return confirmDialog('Удалить источник?','Он исчезнет из поиска и карточек. Файлы не будут затронуты.',async()=>{await api.sourceAction(d.id,d.op);await render();});return api.sourceAction(d.id,d.op).then(()=>render());
  case 'source-links':{const game=shownSourceGames[Number(d.index)];if(game)return openCatalogGame({title:game.title,preferred:game});break;}
  case 'release-notes':return showDialog('Что нового в ByAzen 1.0.23',`<ul class="release-list"><li><strong>Библиотека:</strong> поиск EXE и импорт установленных игр Steam.</li><li><strong>Сохранения:</strong> папки игры, копирование перед запуском и восстановление с предпросмотром.</li><li><strong>Оформление:</strong> живой редактор палитры, скруглений и шрифта; интенсивность эффектов.</li></ul><h3>В версии 1.0.22</h3><ul class="release-list"><li><strong>Загрузки:</strong> отдельная история, скорость, время до завершения и диагностика BitTorrent.</li><li><strong>Очередь:</strong> расписание, лимиты, приоритет и до четырёх задач одновременно.</li><li><strong>Проверки:</strong> тест HTTPS, свободное место, SHA-256 и обезличенные отчёты.</li><li><strong>Библиотека и темы:</strong> заметки, статусы игр, личные оценки и закладки на темы.</li></ul><div class="dialog-actions">${btn('Закрыть','close','','primary')}</div>`,{eyebrow:'ЖУРНАЛ ОБНОВЛЕНИЯ'});
  case 'settings-jump':{const target=document.getElementById(d.target);target?.focus({preventScroll:true});target?.scrollIntoView({behavior:motionAllowed()?'smooth':'instant'});return;}
  case 'theme-editor':return themeEditor();
  case 'theme-preview':return previewTheme(d.themeId);
  case 'theme-favorite':{
   const theme=getTheme(d.themeId);if(!theme.asset)return;
   const favorites=new Set(state.settings.favoriteThemes||[]),was=favorites.delete(theme.id);
   if(!was)favorites.add(theme.id);
   b.disabled=true;
   try{
    state.settings=await api.saveSettings({...state.settings,favoriteThemes:[...favorites]});
    b.setAttribute('aria-pressed',String(!was));$('span',b).textContent=was?'В избранное':'В избранном';
    if($('#themes'))drawThemeResults();
   }finally{b.disabled=false;}
   return;
  }
  case 'theme-custom':return customWallpaperDialog();
  case 'theme-custom-disable':{
   if(!state.wallpaper?.enabled)return;
   b.disabled=true;
   try{
    const record={...state.wallpaper,enabled:false};await saveWallpaper(record);
    setWallpaper(record);applyTheme();if(state.section==='settings'){drawThemes();$('[data-action=theme-custom]')?.focus({preventScroll:true});}
    toast('Возвращён фон темы.');
   }finally{b.disabled=false;}
   return;
  }
  case 'theme-random':{
   const candidates=filteredThemes().filter(t=>t.id!==state.settings.theme);
   const pool=candidates.length?candidates:visualThemes.filter(t=>t.id!==state.settings.theme);
   return previewTheme(pool[Math.floor(Math.random()*pool.length)].id);
  }
  case 'theme':{
   b.disabled=true;
   try{
    state.settings=await api.saveSettings({...state.settings,theme:getTheme(d.themeId).id});applyTheme();
    if(b.isConnected&&dialog.open)dialog.close();
    if(state.section==='settings'){drawThemes();const selected=$('.theme-selected');(selected||$('[data-action=theme-random]'))?.focus({preventScroll:true});play(selected,[{scale:'.96'},{scale:'1.023',offset:.58},{scale:'1'}],{duration:360});}
    toast('Тема применена.');
   }finally{b.disabled=false;}
   return;
  }
 }
}
document.addEventListener('click',e=>{const b=e.target.closest('button[data-action],button[data-go]');if(b&&!b.disabled)run(()=>dispatch(b));});
$('#profile').onclick=()=>go('settings');
$('#source-shortcut').innerHTML=I('layers');$('#filter-shortcut').innerHTML=I('sliders');
$('#global-search').onsubmit=e=>{e.preventDefault();state.filter={...state.filter,term:$('#global-input').value,page:1};go('catalog');};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!dialog.open){e.preventDefault();$('#global-input').focus();}});
api.onStorageError?.(text=>toast('Не удалось сохранить данные: '+text,true));
run(async()=>{try{state.settings=await api.settings();setWallpaper(await readWallpaper().catch(()=>null));applyTheme();state.library=await api.library();}finally{const start=state.settings.startSection;if(start&&start!=='home'&&Object.hasOwn(sections,start))go(start);else{sidebar();await render();}}});
