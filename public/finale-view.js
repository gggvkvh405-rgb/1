import {localDay} from './journal.js';
import {planICS,cleanPlan,cleanPlans} from './play-plans.js';
export function finaleTools({api,dialog,showDialog,esc,btn,run,toast,library,refresh,confirmBytes,isLocal}){
 const $=(s,r=dialog)=>r.querySelector(s),alive=el=>el?.isConnected&&dialog.open;
 const pending=(title,id)=>{showDialog(title,`<div id="${id}"><p class="muted">Загружаем…</p></div>`);return $(`#${id}`);};
 const handle=(form,action)=>{form.onsubmit=e=>{e.preventDefault();const b=$('[type=submit]',form),data=new FormData(form);if(b.disabled)return;b.disabled=true;run(async()=>{try{await action(data);}finally{b.disabled=false;}});};};
 const listen=(root,id,fn)=>{const el=$(`#${id}`,root);if(el)el.onclick=()=>run(fn);};
 async function covers(g){
  const host=pending('Обложки Steam','cover-options');let result=null,error='';
  try{if(!isLocal())result=await api.coverCandidates(g.id);}catch(e){error=e.message;}
  if(!alive(host))return;
  host.innerHTML=`<h3>${esc(g.title)}</h3><p class="muted">Проверь название и изображение. ByAzen ничего не применяет автоматически.</p>${isLocal()?'<p>Поиск новых обложек выключен в локальном режиме.</p>':error?`<p>${esc(error)}</p>`:!result?.rows.length?'<p>Подходящих обложек Steam пока нет.</p>':''}${result?.rows.length?`<form><div class="covers-list">${result.rows.map((r,i)=>`<label><input type="radio" name="index" value="${i}" required><img src="${esc(r.image)}" alt="" loading="lazy"><span><strong>${esc(r.title)}</strong>${r.year?` · ${r.year}`:''}</span></label>`).join('')}</div><button class="btn primary" type="submit">Подтвердить обложку</button></form>`:''}${g.steamCover?'<button class="btn" id="clear-cover" type="button">Убрать обложку Steam</button>':''}`;
  const form=$('form',host);if(form)handle(form,async f=>{await api.applyCover(g.id,result.draft,Number(f.get('index')));await refresh();if(alive(host))dialog.close();toast('Обложка обновлена.');});
  listen(host,'clear-cover',async()=>{await api.clearCover(g.id);await refresh();if(alive(host))dialog.close();toast('Обложка удалена.');});
 }
 function shortcut(g){
  showDialog('Ярлык на рабочем столе',`<form id="game-shortcut"><h3>${esc(g.title)}</h3><label class="field"><span>Профиль запуска</span><select name="profile"><option value="-1">Без аргументов</option>${g.steamAppId?'':g.profiles.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join('')}</select></label><p class="muted small">Ярлык открывает ByAzen и запрашивает подтверждение запуска. Не перемещайте portable EXE после создания ярлыка.</p><div class="dialog-actions">${btn('Отмена','close')}<button class="btn primary" type="submit">Создать ярлык</button></div></form>`);
  const form=$('#game-shortcut');handle(form,async f=>{const name=await api.gameShortcut(g.id,Number(f.get('profile')));if(alive(form))dialog.close();toast(`Ярлык создан: ${name}`);});
 }
 async function players(){
  const host=pending('Локальные игроки','players-list'),plan=await api.players();if(!alive(host))return;
  host.innerHTML=`<p class="muted">Библиотека, настройки, сохранённые списки и журнал у каждого игрока свои. Данные остаются на этом компьютере. Для смены игрока лаунчер перезапускается; незавершённые загрузки после возврата будут на паузе.</p><form class="row"><input name="name" maxlength="32" placeholder="Имя нового игрока" aria-label="Имя нового игрока" required><button class="btn primary" type="submit">Создать профиль</button></form><ul class="journal-list">${plan.rows.map((r,i)=>`<li><strong>${esc(r.name)}</strong>${r.id===plan.active?'<span class="chip good">Активен</span>':`<button class="btn" type="button" data-player-open="${i}">Переключиться</button>`}</li>`).join('')}</ul>`;
  handle($('form',host),async f=>{await api.createPlayer(f.get('name'));toast('Новый профиль создан.');if(alive(host))await players();});
  for(const b of host.querySelectorAll('[data-player-open]'))b.onclick=()=>{
   const r=plan.rows[Number(b.dataset.playerOpen)];showDialog('Переключить игрока?',`<p>${esc(r.name)}</p><p class="muted">ByAzen перезапустится с отдельным набором данных.</p><div class="dialog-actions">${btn('Отмена','close')}<button class="btn primary" type="button" id="player-switch">Перезапустить</button></div>`);listen(dialog,'player-switch',()=>api.switchPlayer(r.id));
  };
 }
 function offline(){
  const enabled=isLocal();
  showDialog(enabled?'Вернуть доступ к сети?':'Перейти в режим «Только локально»?',`<p class="muted">${enabled?'После перезапуска Steam, обновление источников и загрузки снова доступны. Приостановленные задачи нужно возобновить вручную.':'После перезапуска ByAzen не подключается к Steam, спискам по URL, обновлениям или раздачам. Библиотека, журнал, локальные JSON, резервные копии и сохранённые списки остаются доступными. Запуск через приложение Steam выключен.'}</p><div class="dialog-actions">${btn('Отмена','close')}<button class="btn primary" type="button" id="network-restart">Перезапустить</button></div>`);listen(dialog,'network-restart',()=>api.localOnly(!enabled));
 }
 async function updates(){
  const host=pending('Проверить обновление ByAzen','official-build');let info;
  try{info=await api.officialCheck();}catch(e){if(alive(host))host.textContent=e.message;return;}if(!alive(host))return;
  host.innerHTML=`<p><strong>${info.available?'Доступна новая версия':'Более новой версии нет'}: ${esc(info.version)}</strong><br>Установлено: ${esc(info.current)} · ${confirmBytes(info.bytes)}</p><div class="field"><span>SHA-256 из официального выпуска GitHub</span><input readonly aria-label="Официальный SHA-256" value="${esc(info.sha256)}"></div><p class="muted small">ByAzen не скачивает и не запускает обновление. Перед открытием страницы выпуска будет сохранена копия настроек.</p><div class="row"><button class="btn primary" type="button" id="release-open">Сделать копию и открыть выпуск</button><button class="btn" type="button" id="release-verify">Проверить скачанный EXE</button></div><p role="status"></p>`;
  listen(host,'release-open',async()=>{const x=await api.openOfficialRelease(info.id);if(alive(host))$('[role=status]',host).textContent=`Копия сохранена в update-backups: ${x.backup}`;});
  listen(host,'release-verify',async()=>{const result=await api.officialVerify(info.id);if(result&&alive(host))$('[role=status]',host).textContent=result.match?'Размер и SHA-256 совпадают с официальной сборкой.':result.reason;});
 }
 const localRows=()=>{try{return cleanPlans(JSON.parse(localStorage.getItem('byazen-plans')||'[]'));}catch{return [];}};
 const saveLocal=rows=>localStorage.setItem('byazen-plans',JSON.stringify(rows));
 async function planEditor(existing){
  const r=existing||{},names=library().map(g=>g.title).slice(0,1500);
  showDialog(existing?'Изменить игровой вечер':'Запланировать игровой вечер',`<form id="coop-plan"><div class="steam-facts plan-fields"><label class="field"><span>Название</span><input maxlength="120" name="title" required value="${esc(r.title)}"></label><label class="field"><span>Игра</span><input maxlength="160" name="game" list="plan-games" required value="${esc(r.game)}"><datalist id="plan-games">${names.map(g=>`<option value="${esc(g)}"></option>`).join('')}</datalist></label><label class="field"><span>Дата</span><input type="date" name="day" min="${localDay()}" required value="${r.day||localDay()}"></label><label class="field"><span>Местное время</span><input type="time" name="time" required value="${r.time||'19:00'}"></label><label class="field"><span>Минут</span><input type="number" name="length" min="15" max="720" required value="${r.length||90}"></label><label class="field"><span>Участники</span><input name="people" maxlength="250" value="${esc(r.people)}"></label></div><label class="field"><span>Заметка</span><textarea name="notes" maxlength="1000" rows="3">${esc(r.notes)}</textarea></label><div class="dialog-actions">${btn('Отмена','close')}<button class="btn primary" type="submit">Сохранить план</button></div></form>`);
  const form=$('#coop-plan');handle(form,async f=>{const value=cleanPlan({...Object.fromEntries(f),length:Number(f.get('length'))});if(api.savePlayerPlan)await api.savePlayerPlan(r.id||'',value);else saveLocal([{...value,id:r.id||crypto.randomUUID()},...localRows().filter(x=>x.id!==r.id)].slice(0,100));if(alive(form))await plans();});
 }
 async function plans(){
  const host=pending('Совместные игровые вечера','coop-plans'),rows=(api.playersPlans?await api.playersPlans():localRows()).slice().sort((a,b)=>(a.day+a.time).localeCompare(b.day+b.time));
  if(!alive(host))return;
  host.innerHTML=`<p class="muted small">Список хранится локально. Чтобы поделиться событием, экспортируй .ics и отправь его участникам сам.</p><button class="btn primary" type="button" id="new-coop-plan">Запланировать вечер</button><ul class="journal-list">${rows.map((r,i)=>`<li><div><strong>${esc(r.title)}</strong><p>${esc(r.game)} · ${esc(r.day)} ${esc(r.time)} · ${r.length} мин</p>${r.people?`<p class="muted small">${esc(r.people)}</p>`:''}${r.notes?`<p class="wish-note small">${esc(r.notes)}</p>`:''}</div><div class="row"><button class="btn" type="button" data-plan-out="${i}">Экспорт .ics</button>${r.day>=localDay()?`<button class="btn" type="button" data-plan-edit="${i}">Изменить</button>`:''}<button class="btn" type="button" data-plan-delete="${i}">Удалить</button></div></li>`).join('')||'<li class="muted">Планов пока нет.</li>'}</ul>`;
  listen(host,'new-coop-plan',()=>planEditor());
  for(const b of host.querySelectorAll('[data-plan-edit]'))b.onclick=()=>planEditor(rows[Number(b.dataset.planEdit)]);
  for(const b of host.querySelectorAll('[data-plan-out]'))b.onclick=()=>run(async()=>{const row=rows[Number(b.dataset.planOut)];if(api.exportPlayerPlan){if(await api.exportPlayerPlan(row.id))toast('Файл календаря сохранён.');}else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([planICS(row)],{type:'text/calendar'}));a.download='ByAzen-evening.ics';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}});
  for(const b of host.querySelectorAll('[data-plan-delete]'))b.onclick=()=>{const row=rows[Number(b.dataset.planDelete)];showDialog('Удалить игровой вечер?',`<p>${esc(row.title)}</p><div class="dialog-actions">${btn('Отмена','close')}<button class="btn danger" type="button" id="confirm-plan-delete">Удалить</button></div>`);listen(dialog,'confirm-plan-delete',async()=>{if(api.removePlayerPlan)await api.removePlayerPlan(row.id);else saveLocal(localRows().filter(x=>x.id!==row.id));await plans();});};
 }
 async function torrent(id){
  const host=pending('Файлы в торренте','torrent-files'),selected=new Set();
  let busy=false,serial=0;
  async function page(n){
   const stamp=++serial;const r=await api.torrentFiles(id,n);if(!alive(host)||stamp!==serial)return;
   host.innerHTML=`<p class="muted small">Торрент скачивает части, поэтому могут передаться байты соседних файлов. В папку назначения попадут только выбранные файлы.</p><form><ul class="journal-list torrent-file-list">${r.rows.map(f=>`<li><label class="toggle"><input type="checkbox" name="file" value="${f.index}" ${selected.has(f.index)?'checked':''}><span>${esc(f.name)} <small class="muted">${confirmBytes(f.size)}</small></span></label></li>`).join('')}</ul><div class="row"><button class="btn" type="button" id="torrent-before" ${r.page<=1?'disabled':''}>←</button><span>Страница ${r.page} из ${r.max}</span><button class="btn" type="button" id="torrent-after" ${r.page>=r.max?'disabled':''}>→</button><button class="btn" type="button" id="torrent-page-all">Отметить страницу</button></div><p aria-live="polite" id="torrent-count"></p><div class="row"><button class="btn primary" type="submit">Скачать выбранное</button><button class="btn" type="button" id="torrent-all">Скачать все ${r.total}</button></div></form>`;
   const form=$('form',host),inputs=[...form.querySelectorAll('input')],update=()=>{$('#torrent-count',host).textContent=`Выбрано: ${selected.size} из ${r.total}`;};update();
   for(const box of inputs)box.onchange=()=>{if(box.checked)selected.add(Number(box.value));else selected.delete(Number(box.value));update();};
   listen(host,'torrent-before',()=>page(r.page-1));listen(host,'torrent-after',()=>page(r.page+1));listen(host,'torrent-page-all',()=>{for(const box of inputs){box.checked=true;selected.add(Number(box.value));}update();});
   async function submit(entries){if(busy)return;busy=true;try{await api.setTorrentFiles(id,entries);if(alive(host))dialog.close();toast('Список файлов подтверждён.');}finally{busy=false;}}
   handle(form,()=>submit([...selected]));listen(host,'torrent-all',()=>submit(null));
  }
  try{await page(1);}catch(e){if(alive(host))host.textContent=e.message;}
 }
 return {covers,shortcut,players,offline,updates,plans,torrent};
}
