import {icon as I} from './icons.js';
import {games,regions,weeklyGames,achievements} from './games.js';
import {browser} from './browser.js';
import {genres,tags,sorts,properties,FIRST_YEAR,CLASSIC_UNTIL,LAST_YEAR,normalize,offlineResults,refinePage,catalogMeta} from './catalog.js';
const api = window.byazen || browser;
const $ = (s, container=document) => container.querySelector(s);
const content=$('#content'), dialog=$('#dialog'), dialogBody=$('#dialog-body');
const sections = {home:['Главная','home'], catalog:['Каталог','grid'],library:['Библиотека','library'],downloads:['Загрузки','download'],rankings:['Рейтинги','trophy'],sources:['Источники','layers'],settings:['Настройки','settings']};
const esc = (x='') => String(x??'').replace(/[&<>"']/g, a=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[a]));
const state = {section:'home', settings:{name:'Игрок',theme:'dark',motion:false,region:'DE'},library:[],featured:0,tab:0,filter:{term:'',page:1},libraryFilter:'all',collection:'',srcTerm:'',srcPage:1,themePage:0};
let renderId=0;
const details = (icon,title,desc,action='')=>`<div class="empty"><span class="empty-icon">${I(icon)}</span><h3>${esc(title)}</h3><p>${esc(desc)}</p>${action}</div>`;
const btn = (label,action,glyph='',classes='')=>`<button type="button" class="btn ${classes}" data-action="${action}">${glyph?I(glyph):''}${label}</button>`;
const head = (eyebrow,title,desc,actions='')=>`<div class="page-head"><div><div class="eyebrow"><i></i>${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div>${actions?`<div class="head-actions">${actions}</div>`:''}</div>`;
const pick = (name, items, selected, label) => `<select name="${esc(name)}" aria-label="${esc(label)}">${items.map(([v,t])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
const current = (n)=>n===renderId;
function toast(text,error=false){const x=document.createElement('div');x.className='toast'+(error?' bad':'');x.innerHTML=`${I(error?'alert':'check')}<span>${esc(text)}</span>`;$('#toasts').append(x);setTimeout(()=>x.remove(),4300);}
function run(fn) {return Promise.resolve().then(fn).catch(e=>toast(e.message,true));}
function showDialog(title,body){if(dialog.open)dialog.close();dialogBody.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button type="button" class="icon-btn" data-action="close" aria-label="Закрыть">${I('close')}</button></div>${body}`;dialog.showModal();}
const date = s => s ? new Date(s).toLocaleDateString('ru') : '';
function sidebar(){
 $('#nav').innerHTML=Object.entries(sections).filter(([id])=>id!=='sources').map(([id,[title,glyph]])=>`<button class="nav-link ${state.section===id?'active':''}" ${state.section===id?'aria-current="page"':''} data-go="${id}" title="${title}">${I(glyph)}<span>${title}</span></button>`).join('');
 const shortcut=$('#source-shortcut');
 if(state.section==='sources')shortcut.setAttribute('aria-current','page');else shortcut.removeAttribute('aria-current');
 $('#profile').innerHTML=`<span class="avatar">${I('user')}</span><span class="profile-text"><strong>${esc(state.settings.name)}</strong><small>ByAzen</small></span><img class="profile-brand" src="assets/logo.svg" alt="">${I('down','profile-arrow')}`;
 $('#side-games').innerHTML=state.library.length ? [...state.library].sort((a,b)=>Number(b.favorite)-Number(a.favorite)||(b.lastPlayed||'').localeCompare(a.lastPlayed||'')).slice(0,6).map(g=>`<button class="side-game" data-action="edit-game" data-id="${esc(g.id)}" title="${esc(g.title)}">${I('game')}<span>${esc(g.title)}</span></button>`).join('') : `<button class="side-game muted" data-action="new-game" title="Добавить игру">${I('plus')}<span>Добавить игру</span></button>`;
}
function go(section){if(!Object.hasOwn(sections,section))return;state.section=section;document.title=`${sections[section][0]} — ByAzen`;window.scrollTo(0,0);sidebar();run(render);}
async function render(){let n=++renderId;content.dataset.section=state.section;return ({home,catalog,library,downloads,rankings,sources,settings}[state.section])(n);}
function rangeButtons(result,prefix){const last=Math.max(1,Math.min(500,Math.ceil(result.total/result.pageSize)));return `<div class="pagination"><button class="btn" data-action="${prefix}-page" data-page="${result.page-1}" ${result.page<=1?'disabled':''}>← Назад</button><span>Страница ${result.page} из ${last}</span><button class="btn" data-action="${prefix}-page" data-page="${result.page+1}" ${result.page>=last?'disabled':''}>Далее →</button></div>`;}
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
 const f=state.filter, selected=String(f.tags||'').split(',').filter(Boolean);
 const liveFields=properties.map(([k,label,opts])=>`<label class="field"><span>${label}</span>${pick(k,opts,f[k]||'',label)}</label>`).join('');
 content.innerHTML=`<form id="catalog-form" class="catalog-layout ${catalogLocal.mobileOpen?'filters-open':''}">
 <header class="catalog-top"><div><h1 class="sr-only">Каталог</h1><div class="catalog-total" id="catalog-total">Загружаем каталог Steam…</div><p id="catalog-hint">Используйте боковую панель для уточнения поиска</p></div>
 <div class="catalog-sort"><label><span>Сортировать по</span>${pick('sort_by',sorts,f.sort_by||'','Сортировка')}</label><button type="button" class="btn catalog-mobile-toggle" data-action="catalog-toggle" aria-controls="catalog-filters" aria-expanded="${catalogLocal.mobileOpen}">${I('sliders')} Фильтры</button></div></header>
 <section id="catalog-results" class="catalog-results" aria-live="polite" aria-busy="true">${details('search','Загружаем каталог…','Получаем текущие данные магазина Steam.')}</section>
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
 let pageResult, offlineReason='', pageMatches=new Map();
 function drawPage(){
  if(!pageResult||!current(n))return;
  const r=pageResult, rows=refinePage(r.games,catalogLocal,pageMatches);
  const refined=catalogLocal.min!==FIRST_YEAR||catalogLocal.max!==LAST_YEAR||catalogLocal.sources.length>0;
  $('#catalog-total').textContent=r.offline?`Локальная подборка: ${r.total.toLocaleString('ru')}`:resultCaption(r.total);
  $('#catalog-hint').textContent=refined?`Показано на этой странице: ${rows.length} из ${r.games.length}`:'Используйте боковую панель для уточнения поиска';
  const unavailable=r.offline?`<div class="catalog-status" role="status" title="${esc(offlineReason)}">${I('alert')}<span>Steam недоступен. Показана локальная подборка без актуальных цен и наличия. Фильтры платформы, цены, скидок и региона не применяются.</span>${btn('Повторить','rerender','refresh')}</div>`:'';
  const list=rows.length?`<div class="catalog-list">${rows.map(g=>{
   const sources=pageMatches.get(g.title)||[], meta=catalogMeta(g);
   const price=g.price||'', badge=sources.length?sources.map(x=>`<span class="catalog-badge">${esc(x)}</span>`).join(''):'<span class="catalog-badge">Steam</span>';
   return `<button type="button" class="catalog-row" data-action="catalog-game" data-url="${esc(g.url)}" data-title="${esc(g.title)}" title="Открыть ${esc(g.title)}"><span class="catalog-row-art">${I('game')}${g.image?`<img src="${esc(g.image)}" alt="" loading="lazy">`:''}</span><span class="catalog-row-copy"><strong>${esc(g.title)}</strong>${meta.length?`<span class="catalog-meta">${esc(meta.join(', '))}</span>`:''}<span class="catalog-badges">${badge}</span></span>${price?`<span class="catalog-price">${g.discount?`<b class="discount">${esc(g.discount)}</b>`:''}${esc(price)}</span>`:''}</button>`;
  }).join('')}</div>`:details('search',refined?'Нет совпадений на этой странице':'Ничего не найдено',refined?'Измените фильтры года и источников или перейдите к другой странице.':'Попробуйте изменить запрос или фильтры.');
  results.setAttribute('aria-busy','false');results.innerHTML=unavailable+list+(r.total>r.pageSize&&!r.offline?rangeButtons(r,'steam'):'');
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
function rankings(){
 content.innerHTML=`${head('МАГАЗИН STEAM','Рейтинги','Смотрите оценки игр и официальные чарты магазина Steam.')}
 <div class="item-list">
 <article class="list-item"><span class="list-icon">${I('star')}</span><div class="list-copy"><h3>Лучшие по отзывам</h3><p>Каталог Steam с сортировкой по отзывам.</p></div>${btn('В каталог','review-catalog','arrow')}</article>
 <article class="list-item"><span class="list-icon">${I('trophy')}</span><div class="list-copy"><h3>Самые продаваемые</h3><p>Актуальный рейтинг на официальной странице Steam Charts.</p></div>${btn('Открыть в Steam','steam-charts','external')}</article>
 </div>`;
}
function library(){
 const collections=[...new Set(state.library.flatMap(g=>g.collections))].sort((a,b)=>a.localeCompare(b,'ru'));
 let rows=state.library.filter(g=>(state.libraryFilter==='all'||(state.libraryFilter==='fav'&&g.favorite)||(state.libraryFilter==='recent'&&g.lastPlayed))&&(!state.collection||g.collections.includes(state.collection)));
 if(state.libraryFilter==='recent')rows.sort((a,b)=>b.lastPlayed.localeCompare(a.lastPlayed));
 content.innerHTML=`${head('ВАША КОЛЛЕКЦИЯ','Библиотека','Добавляйте установленные игры и запускайте их из одного места.',btn('Добавить игру','new-game','plus','primary'))}
 <div class="toolbar"><div class="tabs">${[['all','game','Все игры'],['fav','star','Избранное'],['recent','clock','Недавние']].map(([k,g,l])=>`<button class="tab ${state.libraryFilter===k?'selected':''}" data-action="library-tab" data-tab="${k}">${I(g)}${l}</button>`).join('')}</div>${pick('collection',[['','Все коллекции'],...collections.map(c=>[c,c])],state.collection,'Коллекция')}</div>
 ${rows.length?`<div class="item-list">${rows.map(g=>`<article class="list-item"><span class="list-icon">${I('game')}</span><div class="list-copy"><h3>${esc(g.title)}</h3><p>${g.exe?esc(g.exe):'Файл .exe не выбран'}${g.lastPlayed?' · Запуск: '+date(g.lastPlayed):''}</p><div class="chips">${g.collections.map(c=>`<span class="chip">${esc(c)}</span>`).join('')}</div></div><div class="item-actions"><button class="icon-btn ${g.favorite?'starred':''}" data-action="favorite" data-id="${g.id}" aria-label="Избранное" aria-pressed="${g.favorite}" title="Избранное">${I('star')}</button><button class="icon-btn" data-action="edit-game" data-id="${g.id}" aria-label="Редактировать" title="Редактировать">${I('edit')}</button><button class="btn primary" data-action="launch-dialog" data-id="${g.id}" ${!g.exe?'disabled':''}>${I('play')} Запустить</button></div></article>`).join('')}</div>`:details('library',state.library.length?'Нет игр по этому фильтру':'Библиотека пока пуста',state.library.length?'Выберите другую коллекцию или подборку.':'Добавьте первую игру и укажите путь к её исполняемому файлу.',!state.library.length?btn('Добавить игру','new-game','plus','primary'):'' )}`;
 $('[name="collection"]').onchange=e=>{state.collection=e.target.value;run(render);};
}
let chosenExe=null;
function profileRow(p={name:'',args:[]}){return `<div class="profile-row"><input required maxlength="50" data-profile-name value="${esc(p.name)}" placeholder="Название профиля" aria-label="Название профиля"><textarea rows="2" data-profile-args placeholder="Один аргумент на строку" aria-label="Аргументы запуска">${esc(p.args.join('\n'))}</textarea><button type="button" class="icon-btn" data-action="profile-remove" aria-label="Удалить профиль">${I('close')}</button></div>`;}
function editGame(g){
 chosenExe=null;
 showDialog(g?'Редактировать игру':'Добавить игру',`<form id="game-form"><label class="field"><span>Название игры</span><input name="title" required maxlength="160" value="${esc(g?.title)}" placeholder="Например, Minecraft"></label><div class="field"><span>Исполняемый файл</span><div class="row exe-row"><span id="exe-path">${esc(g?.exe||'Файл .exe не выбран')}</span>${btn('Выбрать .exe','choose-exe','folder')}</div></div><label class="field"><span>Коллекции</span><input name="collections" maxlength="750" value="${esc(g?.collections.join(', '))}" placeholder="Через запятую: RPG, На вечер"></label><label class="toggle"><input name="favorite" type="checkbox" ${g?.favorite?'checked':''}> В избранном</label><div class="profile-head"><strong>Профили запуска</strong>${btn('Добавить профиль','profile-add','plus')}</div><p class="muted small">Каждый аргумент укажите на отдельной строке, без внешних кавычек.</p><div id="profiles">${(g?.profiles||[]).map(profileRow).join('')}</div><div class="dialog-actions">${g?`<button type="button" class="btn danger" data-action="remove-game" data-id="${g.id}">Удалить игру</button>`:''}<button class="btn primary" type="submit">${I('check')} Сохранить</button></div></form>`);
 $('#game-form').onsubmit=e=>{e.preventDefault();const form=new FormData(e.currentTarget); const profiles=[...$('#profiles').children].map(node=>({name:$('[data-profile-name]',node).value,args:$('[data-profile-args]',node).value.split(/\r?\n/).filter(x=>x.length)}));run(async()=>{await api.saveGame(g?.id||null,{title:form.get('title'),collections:form.get('collections').split(','),favorite:form.has('favorite'),profiles},chosenExe?.token||null);await refreshLibrary();dialog.close();toast('Игра сохранена.');});};
}
async function refreshLibrary(){state.library=await api.library();if(!state.library.some(g=>g.collections.includes(state.collection)))state.collection='';sidebar();if(state.section==='library')await render();}
function launchDialog(g){
 if(!g.profiles.length)return launch(g.id,-1);
 showDialog('Запуск игры',`<p class="muted">${esc(g.title)}</p><form id="launch-form"><label class="field"><span>Профиль</span>${pick('profile',[['-1','Без аргументов'],...g.profiles.map((p,i)=>[String(i),p.name])],'-1','Профиль запуска')}</label><div class="dialog-actions"><button class="btn primary">${I('play')} Запустить</button></div></form>`);
 $('#launch-form').onsubmit=e=>{e.preventDefault();const p=Number(new FormData(e.currentTarget).get('profile'));run(async()=>{await launch(g.id,p);dialog.close();});};
}
async function launch(id,p){await api.launchGame(id,p);await refreshLibrary();toast('Игра запущена.');}
const torrentPhases={metadata:'Поиск участников и метаданных',pieces:'BitTorrent · скачивается',saving:'Сохранение файлов'};
const statuses={queued:'В очереди',running:'Скачивается',paused:'На паузе',pausing:'Останавливается',canceling:'Отменяется',canceled:'Отменено',error:'Ошибка',done:'Завершено'};
const humanBytes = n=>{if(n==null)return 'Размер неизвестен';const u=['Б','КБ','МБ','ГБ','ТБ'],p=n?Math.min(Math.floor(Math.log(n)/Math.log(1024)),4):0;return (n/1024**p).toLocaleString('ru',{maximumFractionDigits:p?1:0})+' '+u[p];};
function downloads(n){
 content.innerHTML=`${head('ПЕРЕДАЧА ФАЙЛОВ','Загрузки','Управляйте HTTP(S)- и BitTorrent-загрузками в одной очереди.',btn('Добавить загрузку','new-download','plus','primary'))}<div class="notice">${I('alert')}<span>ByAzen не запускает скачанные файлы. BitTorrent обменивается частями файла с другими участниками во время загрузки.</span></div><div id="dl-list">${details('download','Читаем очередь…','')}</div>`;
 run(()=>refreshDownloads(n));
}
async function refreshDownloads(n){
 const list=await api.downloads(), target=$('#dl-list');if(!current(n)||!target)return;
 const html=list.length?`<div class="item-list">${list.map(j=>`<article class="list-item dl-item"><span class="list-icon">${I('download')}</span><div class="list-copy"><h3>${esc(j.title)} <span class="chip">${(j.kind==='torrent'&&j.status==='running'&&torrentPhases[j.phase])||statuses[j.status]||esc(j.status)}</span></h3><p>${esc(j.file)}</p><progress max="${j.total||1}" ${j.status==='running'&&j.total==null?'':`value="${j.status==='done'&&!j.total?1:j.bytes||0}"`}></progress><p>${humanBytes(j.bytes)} / ${humanBytes(j.total)}${j.error?' · '+esc(j.error):''}</p></div><div class="item-actions">${[['pause','Пауза',['queued','running']],['resume',j.status==='paused'?'Продолжить':'Повторить',['paused','error','canceled']],['cancel','Отменить',['queued','running','paused','error']],['remove','Убрать',['paused','done','error','canceled']]].filter(x=>x[2].includes(j.status)).map(([op,label])=>`<button class="btn" data-action="download-op" data-op="${op}" data-id="${esc(j.id)}">${label}</button>`).join('')}</div></article>`).join('')}</div>`:details('download','Очередь пуста',window.byazen?'Добавьте прямую или magnet-ссылку либо выберите игру из источника.':'Управление файлами и очередь доступны в настольном приложении.',btn('Добавить загрузку','new-download','plus'));
 if(target._markup!==html){
  const was=target.contains(document.activeElement)?document.activeElement.dataset:null;
  target.innerHTML=html;target._markup=html;
  if(was)Array.from(target.querySelectorAll('button')).find(b=>b.dataset.op===was.op&&b.dataset.id===was.id)?.focus({preventScroll:true});
 }
}
setInterval(()=>{if(state.section==='downloads')refreshDownloads(renderId).catch(()=>{});},1000);
async function sources(n){
 content.innerHTML=`${head('ПОЛЬЗОВАТЕЛЬСКИЕ ИСТОЧНИКИ','Источники','Импортируйте свои списки загрузок в формате Hydra JSON.',btn('Из файла','source-file','file'))}<form class="pane source-import-pane" id="source-url-form"><h2>Добавить по ссылке</h2><label class="field" for="source-url-input"><span>Ссылка на Hydra JSON</span></label><div class="row source-import-controls"><input id="source-url-input" type="url" name="url" placeholder="https://example.org/source.json" maxlength="4096" required autocomplete="off" spellcheck="false" aria-describedby="source-url-help source-url-status"><button class="btn primary" type="submit">${I('link')} Предпросмотр</button></div><p id="source-url-help" class="muted small">Нужна ссылка на сам JSON, а не на страницу со списком источников.</p><p id="source-url-status" class="source-url-status small" role="status"></p></form><div class="notice">${I('alert')}<span>По умолчанию источников нет. Вы отвечаете за доверие к источнику, безопасность файлов и право их скачивать.</span></div><div id="sources-list"></div><div class="section-heading"><div><span class="section-icon">${I('search')}</span><h2>Игры в источниках</h2></div></div><form id="source-search" class="row"><input name="term" value="${esc(state.srcTerm)}" maxlength="200" placeholder="Поиск по названию" aria-label="Поиск по импортированным играм"><button class="btn" type="submit">${I('search')} Найти</button></form><div id="source-games" aria-live="polite"></div>`;
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
 $('#source-search').onsubmit=e=>{e.preventDefault();state.srcTerm=new FormData(e.currentTarget).get('term');state.srcPage=1;run(()=>loadSourceGames(n));};
 const list=await api.sources();if(!current(n))return;
 $('#sources-list').innerHTML=list.length?`<div class="item-list">${list.map(s=>`<article class="list-item"><span class="list-icon">${I(s.kind==='url'?'link':'file')}</span><div class="list-copy"><h3>${esc(s.name)} <span class="chip ${s.enabled?'good':''}">${s.enabled?'Включён':'Отключён'}</span></h3><p>${s.count} игр · Обновлён ${date(s.updated)} · ${esc(s.url||s.file)}</p></div><div class="item-actions">${[['toggle',s.enabled?'Отключить':'Включить'],['refresh','Обновить'],['remove','Удалить']].map(([op,label])=>`<button class="btn" data-action="source-op" data-op="${op}" data-id="${esc(s.id)}">${label}</button>`).join('')}</div></article>`).join('')}</div>`:details('layers','Источники не подключены','Добавьте свой JSON-файл или ссылку на него, чтобы искать игры.');
 await loadSourceGames(n);
}
let sourceRead=0, shownSourceGames=[];
async function loadSourceGames(n){
 const task=++sourceRead;
 const result=await api.searchSources(state.srcTerm,state.srcPage);if(!current(n)||task!==sourceRead)return;
 if(state.srcPage>1 && !result.games.length){state.srcPage=1;return loadSourceGames(n);}
 shownSourceGames=result.games;
 $('#source-games').innerHTML=result.games.length?`<div class="item-list">${result.games.map((g,i)=>`<article class="list-item"><span class="list-icon">${I('game')}</span><div class="list-copy"><h3>${esc(g.title)}</h3><p>${[g.source,g.size,date(g.date)].filter(Boolean).map(esc).join(' · ')}</p></div><button class="btn" data-action="source-links" data-index="${i}">${I('link')} Ссылки (${g.links.length})</button></article>`).join('')}</div>${rangeButtons(result,'source')}`:'';
 if(!result.games.length && state.srcTerm)$('#source-games').innerHTML=details('search','Ничего не найдено','Проверьте запрос и убедитесь, что нужный источник включён.');
}
function showSourcePreview(d){if(!d)return;showDialog('Предпросмотр источника',`<p><strong>${esc(d.name)}</strong> · ${d.count} записей</p><p class="muted">Пропущено записей: ${d.skipped}. Отклонено ссылок: ${d.ignoredLinks}.</p><ul class="preview-list">${d.titles.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><div class="notice">${I('alert')}<span>Импортируйте источник, только если доверяете ему.</span></div><div class="dialog-actions"><button class="btn" data-action="close">Отмена</button><button class="btn primary" data-action="source-import" data-id="${esc(d.id)}">${I('check')} Импортировать</button></div>`);}
let gameOpenRequest=0;
async function openCatalogGame(product){
 const request=++gameOpenRequest, version=renderId;
 const groups=await api.sourceMatches(product.title);
 if(request!==gameOpenRequest||!current(version))return;
 if(!groups.length)return api.openSteam(product.url);
 if(groups.length===1&&groups[0].count===1){
  const entry=groups[0].entries[0], g=await api.sourceGame(groups[0].id,entry.index,entry.title);
  if(request===gameOpenRequest&&current(version))sourceLinkDialog(g,{steam:product.url});
 }else showGameSources(product,groups);
}
function showGameSources(product,groups){
 showDialog(esc(product.title),`<p class="muted">Выберите источник и запись с нужной версией игры.</p><div class="game-source-groups">${groups.map((group,i)=>`<details class="game-source-group" ${i===0?'open':''}><summary>${I('layers')} <strong>${esc(group.name)}</strong> <span class="chip">${group.count}</span></summary><div class="game-source-entries">${group.entries.map((g,j)=>`<button class="btn game-source-entry" type="button" data-group="${i}" data-entry="${j}"><span>${esc(g.title)}<small>${[g.size,date(g.date),`Ссылок: ${g.linkCount}`].filter(Boolean).map(esc).join(' · ')}</small></span>${I('chevron')}</button>`).join('')}${group.count>group.entries.length?'<p class="small muted">Дополнительные записи можно посмотреть в разделе «Источники».</p>':''}</div></details>`).join('')}</div><div class="dialog-actions">${steamDialogButton(product.url)}</div>`);
 const version=renderId;
 dialogBody.querySelectorAll('.game-source-entry').forEach(b=>b.onclick=()=>run(async()=>{
  const group=groups[Number(b.dataset.group)], entry=group.entries[Number(b.dataset.entry)];
  if(b.disabled)return;
  b.disabled=true;
  try{const g=await api.sourceGame(group.id,entry.index,entry.title);if(current(version)&&dialog.open&&dialogBody.contains(b))sourceLinkDialog(g,{steam:product.url,back:()=>showGameSources(product,groups)});}
  finally{b.disabled=false;}
 }));
}
const steamDialogButton = url=>`<button type="button" class="btn" data-action="steam-url" data-url="${esc(url)}">${I('steam')} Открыть в Steam</button>`;
function sourceLinkDialog(g,{steam,back}={}){
 if(!g)return;
 showDialog(esc(g.title),`<p class="muted">Источник: <strong>${esc(g.source)}</strong>. Ссылки не проверены на безопасность и доступность.</p><div class="link-list">${g.links.map((u,i)=>{const mag=u.startsWith('magnet:?');return `<div class="link-row"><div title="${esc(u)}">${esc(u)}</div><div class="row">${mag?`<button class="btn primary" data-action="open-source" data-op="download" data-link="${i}">${I('download')} Скачать в ByAzen</button>`:`<button class="btn" data-action="open-source" data-op="browser" data-link="${i}">${I('external')} В браузере</button><button class="btn primary" data-action="open-source" data-op="download" data-link="${i}">${I('download')} Скачать</button>`}</div></div>`;}).join('')}</div>${steam||back?`<div class="dialog-actions">${back?'<button class="btn" id="source-back" type="button">Другой источник</button>':''}${steam?steamDialogButton(steam):''}</div>`:''}`);
 if(back)$('#source-back').onclick=back;
 const version=renderId;
 dialogBody.querySelectorAll('[data-action="open-source"]').forEach(b=>b.onclick=()=>run(async()=>{
  if(version!==renderId)throw Error('Откройте ссылки повторно.');
  if(b.disabled)return;
  b.disabled=true;
  const link=Number(b.dataset.link);
  try {
   const added=await api.openSource(g.id,g.index,link,b.dataset.op,g.links[link]);
   if(b.dataset.op==='download'&&added){if(current(version)&&dialog.open&&dialogBody.contains(b)){dialog.close();go('downloads');}toast('Загрузка добавлена.');}
  }finally{b.disabled=false;}
 }));
}
const palettes=[['Аметист',263],['Океан',224],['Полярная ночь',193],['Мята',159],['Изумруд',138],['Лайм',80],['Янтарь',45],['Закат',23],['Рубин',355],['Орхидея',311]];
const patterns=['Свечение','Горизонт','Сетка','Орбиты','Пунктир','Волны','Диагональ','Мозаика','Искры','Туман'];
const classics=[['dark','Тёмная',263],['light','Светлая',250],['oled','OLED',277]];
function themeStyle(el,id,hue,pattern){el.style.setProperty('--hue',hue);el.dataset.pattern=pattern;el.dataset.look=id;}
function applyTheme(){
 const id=state.settings.theme;document.documentElement.dataset.theme=id;
 document.documentElement.classList.toggle('motion-off',state.settings.motion);
 const k=Number(id.split('-')[1]);
 if(Number.isInteger(k)&&k>=0&&k<100)themeStyle(document.documentElement,id,palettes[Math.floor(k/10)][1],k%10);
 else themeStyle(document.documentElement,id,263,'none');
}
function themesMarkup(){
 const all=Array.from({length:100},(_,i)=>[`theme-${i}`,`${palettes[Math.floor(i/10)][0]} · ${patterns[i%10]}`,palettes[Math.floor(i/10)][1],i%10]);
 const cards=arr=>arr.map(([id,title,hue,pattern='none'])=>`<button class="theme-card ${id===state.settings.theme?'theme-selected':''}" aria-pressed="${id===state.settings.theme}" data-action="theme" data-theme-id="${id}" data-hue="${hue}" data-pattern="${pattern}"><span class="theme-preview"><i></i><i></i><i></i></span><span>${esc(title)} ${id===state.settings.theme?I('check'):''}</span></button>`).join('');
 return `<h3>Классические</h3><div class="theme-grid classic-grid">${cards(classics)}</div><div class="section-heading"><h3>Визуальные варианты <span class="chip">100</span></h3><select id="theme-page" aria-label="Палитра темы">${palettes.map(([name],i)=>`<option value="${i}" ${i===state.themePage?'selected':''}>${name}</option>`).join('')}</select></div><div class="theme-grid">${cards(all.slice(state.themePage*10,state.themePage*10+10))}</div>`;
}
function settings(){
 content.innerHTML=`${head('ПЕРСОНАЛИЗАЦИЯ','Настройки','Настройте профиль, оформление и поведение лаунчера.')}
 <form id="settings-form" class="pane settings-pane"><h2>Основные</h2><div class="settings-fields"><label class="field"><span>Имя профиля</span><input name="name" required maxlength="32" value="${esc(state.settings.name)}"></label><label class="field"><span>Регион Steam по умолчанию</span>${pick('region',regions,state.settings.region,'Регион Steam')}</label></div><label class="toggle"><input type="checkbox" name="motion" ${state.settings.motion?'checked':''}> Уменьшить движение</label><p class="muted small">Системная настройка уменьшения движения учитывается всегда.</p><button class="btn primary" type="submit">${I('check')} Сохранить настройки</button></form>
 <div class="section-heading"><div><span class="section-icon">${I('spark')}</span><h2>Галерея тем</h2></div></div><div class="pane theme-pane" id="themes"></div>`;
 drawThemes();
 $('#settings-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{state.settings=await api.saveSettings({...state.settings,name:f.get('name').trim()||'Игрок',region:f.get('region'),motion:f.has('motion')});state.filter.cc=state.settings.region;applyTheme();sidebar();toast('Настройки сохранены.');});};
}
function drawThemes(){
 $('#themes').innerHTML=themesMarkup();
 $('#themes').querySelectorAll('.theme-card').forEach(el=>themeStyle(el,el.dataset.themeId,el.dataset.hue,el.dataset.pattern));
 $('#theme-page').onchange=e=>{state.themePage=Number(e.target.value);drawThemes();$('#theme-page').focus();};
}
function urlDialog(title,desc,callback){
 showDialog(title,`<p class="muted">${desc}</p><form id="url-form"><label class="field"><span>URL</span><input type="url" name="url" placeholder="https://…" required maxlength="4096"></label><div class="dialog-actions"><button class="btn primary" type="submit">${I('arrow')} Продолжить</button></div></form>`);
 $('#url-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,submit=$('button[type="submit"]',f), url=new FormData(f).get('url');submit.disabled=true;run(async()=>{try{await callback(url);}finally{submit.disabled=false;}});};
}
function confirmDialog(title,desc,callback){
 showDialog(title,`<p class="muted">${desc}</p><div class="dialog-actions">${btn('Отмена','close')}<button class="btn danger" id="confirm-action">Подтвердить</button></div>`);
 $('#confirm-action').onclick=()=>run(async()=>{await callback();dialog.close();});
}
function selectHero(k){state.featured=k;run(async()=>{await render();if(!state.settings.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches)$('.hero-copy')?.animate([{opacity:.75,translate:'0 3px'},{opacity:1,translate:'0 0'}],{duration:200,easing:'ease-out'});});}
function dispatch(b){
 const d=b.dataset, a=d.action, g=state.library.find(g=>g.id===d.id);
 if(d.go)return go(d.go);
 if(a?.startsWith('steam-')&&/^steam-\d+$/.test(a))return openCatalogGame(games.find(x=>x.id===Number(a.split('-')[1])));
 switch(a){
  case 'close':dialog.close();break;
  case 'home-tab':state.tab=Number(d.tab);return render();
  case 'surprise':selectHero((state.featured+1+Math.floor(Math.random()*(games.length-1)))%games.length);$('.hero')?.scrollIntoView({block:'nearest'});break;
  case 'steam-url':return api.openSteam(d.url);
  case 'catalog-game':return openCatalogGame({title:d.title,url:d.url});
  case 'steam-charts':return api.openSteamCharts();
  case 'review-catalog':state.filter={term:'',page:1,category1:'998',sort_by:'Reviews_DESC'};return go('catalog');
  case 'feedback':return showDialog('Обратная связь',`<p class="muted">Сообщите об ошибке или предложите улучшение. Откроется форма GitHub — ByAzen ничего не отправляет автоматически.</p><div class="dialog-actions">${btn('Открыть форму','feedback-open','external','primary')}</div>`);
  case 'feedback-open':return api.openProjectFeedback();
  case 'catalog-toggle':catalogLocal.mobileOpen=!catalogLocal.mobileOpen;$('#catalog-form').classList.toggle('filters-open',catalogLocal.mobileOpen);b.setAttribute('aria-expanded',String(catalogLocal.mobileOpen));break;
  case 'reset-filters':state.filter={term:'',page:1};Object.assign(catalogLocal,{min:FIRST_YEAR,max:LAST_YEAR,sources:[]});window.scrollTo(0,0);return render();
  case 'rerender':return render();
  case 'steam-page':state.filter.page=Number(d.page);window.scrollTo(0,0);return render();
  case 'source-page':state.srcPage=Number(d.page);return loadSourceGames(renderId);
  case 'library-tab':state.libraryFilter=d.tab;return render();
  case 'new-game':return editGame();
  case 'edit-game':if(g)return editGame(g);break;
  case 'choose-exe':return api.chooseExe().then(exe=>{if(exe&&$('#game-form')){chosenExe=exe;$('#exe-path').textContent=exe.path;if(!$('#game-form [name="title"]').value)$('#game-form [name="title"]').value=exe.title;}});
  case 'profile-add':if($('#profiles').children.length<20)$('#profiles').insertAdjacentHTML('beforeend',profileRow());break;
  case 'profile-remove':b.closest('.profile-row').remove();break;
  case 'favorite':return api.favorite(d.id).then(refreshLibrary);
  case 'remove-game':return confirmDialog('Удалить игру?', 'Это удалит запись из библиотеки, но не файлы игры.',async()=>{await api.removeGame(d.id);await refreshLibrary();});
  case 'launch-dialog':if(g)return launchDialog(g);break;
  case 'new-download':return urlDialog('Новая загрузка','Укажите прямую HTTP(S)-ссылку на файл или magnet-ссылку. Затем выберите место сохранения.',async url=>{const added=await api.addDownload(url);if(added){dialog.close();await refreshDownloads(renderId);toast('Загрузка добавлена.');}});
  case 'download-op':return api.downloadAction(d.id,d.op).then(()=>refreshDownloads(renderId));
  case 'source-file':return api.previewFile().then(showSourcePreview);
  case 'source-url':go('sources');queueMicrotask(()=>$('#source-url-input')?.focus());break;
  case 'source-import':return api.importSource(d.id).then(()=>{dialog.close();toast('Источник импортирован.');return render();});
  case 'source-op':if(d.op==='remove')return confirmDialog('Удалить источник?','Он исчезнет из поиска и карточек. Файлы не будут затронуты.',async()=>{await api.sourceAction(d.id,d.op);await render();});return api.sourceAction(d.id,d.op).then(()=>render());
  case 'source-links':return sourceLinkDialog(shownSourceGames[Number(d.index)]);
  case 'theme':return api.saveSettings({...state.settings,theme:d.themeId}).then(x=>{state.settings=x;applyTheme();if(state.section==='settings'){drawThemes();$(`[data-theme-id="${d.themeId}"]`)?.focus({preventScroll:true});}toast('Тема применена.');});
 }
}
document.addEventListener('click',e=>{const b=e.target.closest('button[data-action],button[data-go]');if(b&&!b.disabled)run(()=>dispatch(b));});
$('#profile').onclick=()=>go('settings');
$('#source-shortcut').innerHTML=I('layers');$('#filter-shortcut').innerHTML=I('sliders');
$('#global-search').onsubmit=e=>{e.preventDefault();state.filter={...state.filter,term:$('#global-input').value,page:1};go('catalog');};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!dialog.open){e.preventDefault();$('#global-input').focus();}});
api.onStorageError?.(text=>toast('Не удалось сохранить данные: '+text,true));
sidebar(); run(render); run(async()=>{state.settings=await api.settings();state.library=await api.library();if(state.settings.theme.startsWith('theme-'))state.themePage=Math.floor(Number(state.settings.theme.slice(6))/10);applyTheme();sidebar();if(state.section!=='home')return render();});
