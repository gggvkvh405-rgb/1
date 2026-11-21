import {icon as I} from './icons.js';
import {reveal} from './motion.js';

export function describeLink(raw){
 if(typeof raw!=='string')return {label:'Неизвестная ссылка',detail:'Формат не поддерживается',supported:false};
 try{
  const url=new URL(raw);
  if(url.protocol==='magnet:'){
   const supported=url.searchParams.getAll('xt').some(x=>/^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(x));
   return {label:'BitTorrent',detail:supported?'Magnet · нужна активная раздача':'Формат BitTorrent v2 без v1 не поддерживается',supported};
  }
  if(url.protocol==='https:'||url.protocol==='http:')return {label:'HTTP-загрузка',detail:url.hostname,supported:true};
 }catch{/* A stale or unsupported link should not become a download action. */}
 return {label:'Неизвестная ссылка',detail:'Формат не поддерживается',supported:false};
}

export function openDownloadPicker(product,{api,dialog,showDialog,esc,date,onAdded,isCurrent}){
 const art=product.image?`<img alt="" src="${esc(product.image)}">`:'';
 showDialog(esc(product.title),`<div class="download-picker"><header class="picker-banner"><span class="picker-cover">${I('game')}${art}</span><div><strong>Загрузка игры</strong><p>Выбери источник и версию. Файлы попадут в очередь ByAzen.</p></div></header><div class="picker-main" aria-busy="true"></div><footer class="picker-foot">${I('alert')}<span>Ссылки предоставлены сторонними источниками. Скачивай только то, чему доверяешь и на что у тебя есть право.</span></footer></div>`,{variant:'download',eyebrow:'ЦЕНТР ЗАГРУЗОК'});
 const view=dialog.querySelector('.download-picker'), main=view.querySelector('.picker-main');
 const alive=()=>dialog.open&&view.isConnected&&isCurrent();
 let groups=[], groupIndex=0, serial=0, busy=false;
 const stateMarkup=(glyph,title,text,actions='')=>`<div class="picker-state"><span class="picker-state-icon">${I(glyph)}</span><div><strong>${title}</strong><p>${esc(text)}</p>${actions}</div></div>`;
 async function check(){
  main.setAttribute('aria-busy','true');
  main.innerHTML=stateMarkup('search','Ищем источники…','Проверяем включённые списки загрузок.');
  try{
   const found=await api.sourceMatches(product.title);
   if(!alive())return;
   groups=found.map(group=>({...group}));
   const preferred=groups.find(g=>g.id===product.preferred?.id);
   if(preferred&&!preferred.entries.some(e=>e.index===product.preferred.index)){
    preferred.entries=[{...product.preferred,linkCount:product.preferred.links.length},...preferred.entries];
   }
   if(groups.length){
    main.setAttribute('aria-busy','false');mountSources(Math.max(0,groups.indexOf(preferred)));return;
   }
   const feeds=await api.sources();
   if(!alive())return;
   const pending=feeds.some(s=>s.presetName&&s.enabled&&(s.loading||!s.updated&&!s.syncError));
   showEmpty(pending?'Некоторые списки ещё загружаются. Проверь ещё раз чуть позже.':'В загруженных списках нет совпадений по названию. Проверь, включён ли нужный источник.');
  }catch(e){if(alive())showEmpty(e.message,'Не удалось проверить источники');}
 }
 function showEmpty(message,title='Нет источников для этой игры'){
  main.setAttribute('aria-busy','false');
  main.innerHTML=stateMarkup('search',title,message,`<div class="picker-state-actions"><button type="button" class="btn" id="picker-retry">${I('refresh')} Проверить снова</button><button type="button" class="btn" data-go="sources">${I('layers')} Источники</button></div>`);
  main.querySelector('#picker-retry').onclick=check;
  reveal(main,'.picker-state');
 }
 function mountSources(chosen){
  main.innerHTML=`<div class="picker-grid"><aside class="picker-source-panel" aria-label="Источники загрузки"><div class="picker-label">${I('layers')} Источники <span>${groups.length}</span></div><div class="picker-source-list">${groups.map((g,i)=>`<button type="button" class="picker-source" data-picker-source="${i}" aria-pressed="false">${I('layers')}<strong>${esc(g.name)}</strong><span class="picker-count" aria-label="Вариантов: ${g.count}">${g.count}</span>${I('chevron')}</button>`).join('')}</div></aside><section class="picker-release" aria-label="Версия и загрузка"></section></div>`;
  main.querySelectorAll('[data-picker-source]').forEach(button=>button.onclick=()=>selectGroup(Number(button.dataset.pickerSource)));
  selectGroup(chosen,product.preferred?.index);
  reveal(main,'.picker-source','slide',{limit:8,step:22});
 }
 function selectGroup(i,preferredIndex){
  if(busy)return;
  groupIndex=i;
  main.querySelectorAll('[data-picker-source]').forEach((b,j)=>b.setAttribute('aria-pressed',String(j===i)));
  const group=groups[i], panel=main.querySelector('.picker-release');
  const index=Math.max(0,group.entries.findIndex(entry=>entry.index===preferredIndex));
  panel.innerHTML=`<div class="picker-label">${I('file')} Версия игры</div>${group.entries.length>1?`<select class="picker-versions" aria-label="Версия игры">${group.entries.map((entry,j)=>`<option value="${j}" ${j===index?'selected':''}>${esc(entry.title)}${entry.size?' · '+esc(entry.size):''}${entry.date?' · '+esc(date(entry.date)):''}</option>`).join('')}</select>`:''}<div class="picker-entry"></div>${group.count>group.entries.length?'<p class="picker-note">Другие записи этого источника доступны в разделе «Источники».</p>':''}`;
  const select=panel.querySelector('select');
  if(select)select.onchange=()=>loadEntry(i,Number(select.value));
  void loadEntry(i,index);
 }
 async function loadEntry(i,j){
  const ticket=++serial, group=groups[i], item=group.entries[j], entry=main.querySelector('.picker-entry');
  if(!item)return;
  entry.innerHTML=`<div class="picker-release-card"><strong>${esc(item.title)}</strong><div class="picker-meta">${item.size?`<span>${I('folder')} ${esc(item.size)}</span>`:''}${item.date?`<span>${I('calendar')} ${esc(date(item.date))}</span>`:''}</div></div><div class="picker-transfer" aria-live="polite">Читаем варианты загрузки…</div>`;
  reveal(entry,'.picker-release-card','rise');
  const transfer=entry.querySelector('.picker-transfer');
  try{
   const game=await api.sourceGame(group.id,item.index,item.title);
   if(!alive()||ticket!==serial||groupIndex!==i)return;
   const links=game.links.map(describeLink);let picked=Math.max(0,links.findIndex(link=>link.supported));
   transfer.innerHTML=`${links.length>1?`<label class="picker-method-label">Способ загрузки<select class="picker-method">${links.map((link,k)=>`<option value="${k}" ${k===picked?'selected':''} ${link.supported?'':'disabled'}>${k+1}. ${esc(link.label)} · ${esc(link.detail)}</option>`).join('')}</select></label>`:''}<div class="picker-transport">${I('link')}<div><strong></strong><small></small></div></div><p class="picker-feedback" role="status"></p><button type="button" class="btn primary picker-download">${I('download')} Скачать в ByAzen</button>`;
   const button=transfer.querySelector('.picker-download'), status=transfer.querySelector('.picker-feedback');
   function setLink(k){
    picked=k;
    const link=links[k];
    transfer.querySelector('.picker-transport strong').textContent=link?.label||'Нет ссылки';
    transfer.querySelector('.picker-transport small').textContent=link?.detail||'Выбери другую версию или источник.';
    status.textContent='';button.disabled=!link?.supported;
   }
   const method=transfer.querySelector('select');if(method)method.onchange=()=>setLink(Number(method.value));
   setLink(picked);reveal(transfer,'.picker-transport,.picker-download','rise',{step:30});
   button.onclick=async()=>{
    if(!alive()||busy||button.disabled)return;
    busy=true;
    const controls=[...main.querySelectorAll('button,select')].filter(el=>!el.disabled);
    controls.forEach(el=>el.disabled=true);
    status.textContent='Выбери место сохранения…';
    try{
     const added=await api.openSource(game.id,game.index,picked,'download',game.links[picked]);
     if(added&&alive()){dialog.close();onAdded();}
     else if(alive())status.textContent='';
    }catch(e){if(alive())status.textContent=e.message;}
    finally{busy=false;controls.forEach(el=>el.disabled=false);if(alive())button.focus({preventScroll:true});}
   };
  }catch(e){if(alive()&&ticket===serial)transfer.textContent=e.message;}
 }
 reveal(view,'.picker-banner','rise');void check();
}
