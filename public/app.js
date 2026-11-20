import {icon as I} from './icons.js';
import {games,regions,weeklyGames,achievements} from './games.js';
import {browser} from './browser.js';
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
  <button class="hero-link" data-action="steam-${f.id}" title="Открыть в Steam" aria-label="${esc(f.title)} — открыть в Steam"></button>
  <div class="hero-copy"><h1>${cyber?'<img src="assets/cyberpunk-logo.png" alt="Cyberpunk 2077">':esc(f.headline)}</h1><p>${esc(f.desc)}</p></div>
 </section>
 <div class="home-feed">
  <div class="discovery">
   <div class="tabs" aria-label="Подборки">${homeTabs.map(([glyph,name],j)=>`<button type="button" class="tab ${j===state.tab?'selected':''}" data-action="home-tab" data-tab="${j}" aria-pressed="${j===state.tab}" ${j===1?'title="Редакционная подборка, не рейтинг Steam"':''}>${I(glyph,`tab-glyph ${glyph}`)}${name}</button>`).join('')}</div>
   <button type="button" class="tab surprise" data-action="surprise">${I('spark','tab-glyph spark')}Удиви меня</button>
  </div>
  <div class="feed-title"><h2>${I(homeTabs[state.tab][0],`tab-glyph ${homeTabs[state.tab][0]}`)} ${homeTabs[state.tab][1]}</h2>${state.tab===1?'<small>Подборка редакции</small>':''}</div>
  <section class="game-grid" aria-label="${homeTabs[state.tab][1]}">${rows.map(g=>`<button class="game-card" data-action="steam-${g.id}" title="${esc(g.title)} — открыть в Steam"><span class="card-art"><img alt="" src="assets/${g.image}.jpg"></span><span class="card-copy"><strong>${I('steam')}${esc(g.title)}</strong><span class="card-tags"><span class="source-badge">Steam</span><span class="source-indicator" data-availability="${g.id}" title="Совпадения по названию в активных источниках"><span class="source-badge">Нет источников</span></span></span></span></button>`).join('')}</section>
 </div>`;
 api.availability(rows.map(g=>g.title)).then(items=>{
  if(!current(n))return;
  for(const {title,sources} of items){
   const el=$(`[data-availability="${rows.find(g=>g.title===title)?.id}"]`);
   if(el&&sources.length){el.innerHTML=sources.slice(0,3).map(name=>`<span class="source-badge">${esc(name)}</span>`).join('')+(sources.length>3?`<span class="source-badge">+${sources.length-3}</span>`:'');el.title=sources.join(', ');}
  }
 }).catch(()=>{});
}
const filters = [
 ['category1','Тип товара',[['','Все товары'],['998','Игры'],['21','DLC'],['994','Демо'],['10','Программы'],['996','Саундтреки'],['992','Видеоролики']]],
 ['tags','Жанр / метка',[['','Любой жанр'],['19','Экшен'],['21','Приключения'],['122','Ролевые игры'],['9','Стратегии'],['492','Инди'],['599','Симуляторы'],['1695','Открытый мир'],['1716','Рогалики'],['3859','Многопользовательские']]],
 ['os','Платформа',[['','Все платформы'],['win','Windows'],['mac','macOS'],['linux','Linux']]],
 ['maxprice','Цена',[['','Любая цена'],['free','Бесплатно'],...['5','10','20','30','40','60'].map(n=>[n,`До ${n} (порог Steam)`])]],
 ['sort_by','Сортировка',[['','Релевантность'],['Name_ASC','Название: А–Я'],['Name_DESC','Название: Я–А'],['Released_DESC','По новизне'],['Price_ASC','Сначала дешевле'],['Price_DESC','Сначала дороже'],['Reviews_DESC','По отзывам']]],
 ['cc','Регион Steam',regions]
];
async function catalog(n){
 const f=state.filter;
 content.innerHTML=`${head('МАГАЗИН STEAM','Каталог','Найдите игры и другие товары в официальном магазине Steam.')}
 <form id="catalog-form" class="pane filter-form"><label class="field"><span>Название</span><div class="input-icon">${I('search')}<input name="term" maxlength="100" value="${esc(f.term)}" placeholder="Введите название игры"></div></label><div class="filter-grid">${filters.map(([k,label,opts])=>`<label class="field"><span>${label}</span>${pick(k,opts,f[k]||(k==='cc'?state.settings.region:''),label)}</label>`).join('')}</div><div class="row filter-bottom"><label class="toggle"><input type="checkbox" name="specials" ${f.specials?'checked':''}> Только со скидкой</label><div class="row">${btn('Сбросить','reset-filters')}<button class="btn primary" type="submit">${I('search')} Найти</button></div></div></form><div id="catalog-results" aria-live="polite">${details('search','Загружаем каталог…','Получаем текущие данные магазина Steam.')}</div>`;
 $('#catalog-form').onsubmit=e=>{e.preventDefault();state.filter={...Object.fromEntries(new FormData(e.currentTarget)),specials:e.currentTarget.specials.checked,page:1};run(render);};
 try{
  const r=await api.steam({...f,cc:f.cc||state.settings.region});if(!current(n))return;
  $('#catalog-results').innerHTML=r.games.length?`<div class="section-heading"><div><span class="section-icon">${I('steam')}</span><h2>Результаты</h2><span class="chip">${r.total.toLocaleString('ru')}</span></div></div><div class="catalog-grid">${r.games.map(g=>`<button class="catalog-card" data-action="steam-url" data-url="${esc(g.url)}"><span class="catalog-art">${I('game')}${g.image?`<img src="${esc(g.image)}" alt="" loading="lazy">`:''}</span><span class="catalog-copy"><strong>${esc(g.title)}</strong><span>${g.discount?`<b class="discount">${esc(g.discount)}</b>`:''}${esc(g.price||'Цена не указана')}</span></span>${I('external')}</button>`).join('')}</div>${rangeButtons(r,'steam')}`:details('search','Ничего не найдено','Попробуйте изменить запрос или фильтры.')+(r.total?rangeButtons(r,'steam'):'');
 }catch(e){if(current(n))$('#catalog-results').innerHTML=details('alert','Каталог недоступен',e.message,btn('Повторить','rerender','refresh'));}
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
const statuses={queued:'В очереди',running:'Скачивается',paused:'На паузе',pausing:'Останавливается',canceling:'Отменяется',canceled:'Отменено',error:'Ошибка',done:'Завершено'};
const humanBytes = n=>{if(n==null)return 'Размер неизвестен';const u=['Б','КБ','МБ','ГБ','ТБ'],p=n?Math.min(Math.floor(Math.log(n)/Math.log(1024)),4):0;return (n/1024**p).toLocaleString('ru',{maximumFractionDigits:p?1:0})+' '+u[p];};
function downloads(n){
 content.innerHTML=`${head('ПЕРЕДАЧА ФАЙЛОВ','Загрузки','Управляйте очередью прямых HTTP(S)-загрузок.',btn('Добавить загрузку','new-download','plus','primary'))}<div class="notice">${I('alert')}<span>ByAzen не запускает скачанные файлы. Если сервер не поддерживает возобновление, загрузка начнётся заново.</span></div><div id="dl-list">${details('download','Читаем очередь…','')}</div>`;
 run(()=>refreshDownloads(n));
}
async function refreshDownloads(n){
 const list=await api.downloads(), target=$('#dl-list');if(!current(n)||!target)return;
 const html=list.length?`<div class="item-list">${list.map(j=>`<article class="list-item dl-item"><span class="list-icon">${I('download')}</span><div class="list-copy"><h3>${esc(j.title)} <span class="chip">${statuses[j.status]||esc(j.status)}</span></h3><p>${esc(j.file)}</p><progress max="${j.total||1}" ${j.status==='running'&&j.total==null?'':`value="${j.status==='done'&&!j.total?1:j.bytes||0}"`}></progress><p>${humanBytes(j.bytes)} / ${humanBytes(j.total)}${j.error?' · '+esc(j.error):''}</p></div><div class="item-actions">${[['pause','Пауза',['queued','running']],['resume',j.status==='paused'?'Продолжить':'Повторить',['paused','error','canceled']],['cancel','Отменить',['queued','running','paused','error']],['remove','Убрать',['paused','done','error','canceled']]].filter(x=>x[2].includes(j.status)).map(([op,label])=>`<button class="btn" data-action="download-op" data-op="${op}" data-id="${esc(j.id)}">${label}</button>`).join('')}</div></article>`).join('')}</div>`:details('download','Очередь пуста',window.byazen?'Добавьте прямую ссылку или выберите файл из пользовательского источника.':'Управление файлами и очередь доступны в настольном приложении.',btn('Добавить загрузку','new-download','plus'));
 if(target._markup!==html){
  const was=target.contains(document.activeElement)?document.activeElement.dataset:null;
  target.innerHTML=html;target._markup=html;
  if(was)Array.from(target.querySelectorAll('button')).find(b=>b.dataset.op===was.op&&b.dataset.id===was.id)?.focus({preventScroll:true});
 }
}
setInterval(()=>{if(state.section==='downloads')refreshDownloads(renderId).catch(()=>{});},1000);
async function sources(n){
 content.innerHTML=`${head('ПОЛЬЗОВАТЕЛЬСКИЕ ИСТОЧНИКИ','Источники','Импортируйте свои списки загрузок в формате Hydra JSON.',btn('Из файла','source-file','file')+btn('По URL','source-url','link','primary'))}<div class="notice">${I('alert')}<span>По умолчанию источников нет. Вы отвечаете за доверие к источнику, безопасность файлов и право их скачивать.</span></div><div id="sources-list"></div><div class="section-heading"><div><span class="section-icon">${I('search')}</span><h2>Игры в источниках</h2></div></div><form id="source-search" class="row"><input name="term" value="${esc(state.srcTerm)}" maxlength="200" placeholder="Поиск по названию" aria-label="Поиск по импортированным играм"><button class="btn" type="submit">${I('search')} Найти</button></form><div id="source-games" aria-live="polite"></div>`;
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
function sourceLinkDialog(g){
 showDialog(esc(g.title),`<p class="muted">Источник: ${esc(g.source)}. Ссылки не проверены на безопасность и доступность.</p><div class="link-list">${g.links.map((u,i)=>{const mag=u.startsWith('magnet:?');return `<div class="link-row"><div title="${esc(u)}">${esc(u)}</div><div class="row">${mag?`<button class="btn" data-action="open-source" data-op="client" data-link="${i}">${I('external')} Торрент-клиент</button>`:`<button class="btn" data-action="open-source" data-op="browser" data-link="${i}">${I('external')} В браузере</button><button class="btn primary" data-action="open-source" data-op="download" data-link="${i}">${I('download')} Скачать</button>`}</div></div>`;}).join('')}</div>`);
 const version=renderId;
 dialogBody.querySelectorAll('[data-action="open-source"]').forEach(b=>b.onclick=()=>run(async()=>{if(version!==renderId)throw Error('Откройте ссылки повторно.'); const r=await api.openSource(g.id,g.index,Number(b.dataset.link),b.dataset.op,g.links[Number(b.dataset.link)]);if(b.dataset.op==='download'&&r)toast('Загрузка добавлена.');}));
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
 if(a?.startsWith('steam-')&&/^steam-\d+$/.test(a))return api.openSteam(games.find(x=>x.id===Number(a.split('-')[1])).url);
 switch(a){
  case 'close':dialog.close();break;
  case 'home-tab':state.tab=Number(d.tab);return render();
  case 'surprise':selectHero((state.featured+1+Math.floor(Math.random()*(games.length-1)))%games.length);$('.hero')?.scrollIntoView({block:'nearest'});break;
  case 'steam-url':return api.openSteam(d.url);
  case 'steam-charts':return api.openSteamCharts();
  case 'review-catalog':state.filter={term:'',page:1,category1:'998',sort_by:'Reviews_DESC'};return go('catalog');
  case 'feedback':return showDialog('Обратная связь',`<p class="muted">Сообщите об ошибке или предложите улучшение. Откроется форма GitHub — ByAzen ничего не отправляет автоматически.</p><div class="dialog-actions">${btn('Открыть форму','feedback-open','external','primary')}</div>`);
  case 'feedback-open':return api.openProjectFeedback();
  case 'reset-filters':state.filter={term:'',page:1};return render();
  case 'rerender':return render();
  case 'steam-page':state.filter.page=Number(d.page);return render();
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
  case 'new-download':return urlDialog('Новая загрузка','Укажите прямую ссылку на файл. В приложении затем можно выбрать место сохранения.',async url=>{const added=await api.addDownload(url);if(added){dialog.close();await refreshDownloads(renderId);toast('Загрузка добавлена.');}});
  case 'download-op':return api.downloadAction(d.id,d.op).then(()=>refreshDownloads(renderId));
  case 'source-file':return api.previewFile().then(showSourcePreview);
  case 'source-url':return urlDialog('Импорт источника по URL','Укажите ссылку на файл Hydra JSON.',async url=>showSourcePreview(await api.previewURL(url)));
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
