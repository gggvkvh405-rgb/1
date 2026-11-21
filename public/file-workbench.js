export function fileTools({api,dialog,showDialog,esc,btn,run,toast,library,refresh,refreshSettings,bytes,getRuntime,setRuntime}){
 const $=(s,root=dialog)=>root.querySelector(s),alive=el=>el.isConnected&&dialog.open;
 const when=(form,go)=>{form.onsubmit=e=>{e.preventDefault();const b=$('[type=submit]',form);if(b.disabled)return;const data=new FormData(form);b.disabled=true;run(async()=>{try{await go(data);}finally{b.disabled=false;}});};};
 function pending(title,id){showDialog(title,`<div id="${id}" aria-live="polite"><p class="muted">Загрузка…</p></div>`);return $(`#${id}`);}
 function close(el){if(alive(el))dialog.close();}
 async function space(){
  const host=pending('Отчёт по месту','space-report'),r=await api.diskReport();if(!alive(host))return;if(!r){close(host);return;}
  host.innerHTML=`<p>${esc(r.folder)}</p><div class="steam-facts"><strong>Свободно на томе</strong><span>${r.free===null?'Недоступно':bytes(r.free)+' из '+bytes(r.capacity)}</span><strong>В выбранной папке</strong><span>${r.partial?'Не менее ':''}${bytes(r.total)} · ${r.count} файлов</span></div><p class="muted small">Размеры содержимого, не занятое место с учётом сжатия. Проверяется до 8 000 записей, без перехода по ссылкам. Пропусков: ${r.skipped}.</p><ul class="journal-list">${r.groups.map(x=>`<li><strong>${esc(x.name)}</strong><span>${bytes(x.bytes)}</span></li>`).join('')||'<li class="muted">Нет доступных файлов.</li>'}</ul>`;
 }
 async function clean(){
  const host=pending('Очистка временных файлов','temp-preview'),plan=await api.cleanupPreview();if(!alive(host))return;
  host.innerHTML=`<p class="muted">Только временные части HTTP-загрузок, которые уже завершены или отменены. Игры, каталоги торрентов и файлы активной очереди не удаляются.</p>${plan.items.length?`<form><ul class="journal-list">${plan.items.map(r=>`<li><label class="toggle"><input type="checkbox" name="id" value="${esc(r.id)}"> ${esc(r.title)} · ${bytes(r.bytes)}</label></li>`).join('')}</ul><div class="dialog-actions">${btn('Отмена','close')}<button class="btn danger" type="submit">Удалить отмеченные части</button></div></form>`:'<p>Нет подходящих файлов.</p>'}`;
  const form=$('form',host);if(form)when(form,async f=>{if(!f.getAll('id').length){toast('Сначала отметьте файлы.',true);return;}const result=await api.cleanupApply(plan.id,f.getAll('id'));close(host);toast(`Удалено временных файлов: ${result.removed}. Ошибок: ${result.failed}.`);});
 }
 function migrate(){
  showDialog('Переезд на другой ПК',`<div id="migration-menu"><p class="muted">Пакет переносит карточки, коллекции, заметки и настройки. Он не содержит .exe, путей к играм, профилей запуска, источников или файлов сохранений.</p><div class="row"><button class="btn primary" type="button" id="migration-save">Экспорт JSON</button><button class="btn" type="button" id="migration-load">Выбрать JSON для импорта</button></div></div>`);
  const host=$('#migration-menu');$('#migration-save',host).onclick=()=>run(async()=>{if(await api.migrationExport())toast('Пакет ByAzen сохранён.');});
  $('#migration-load',host).onclick=e=>{const b=e.currentTarget;b.disabled=true;run(async()=>{try{const r=await api.migrationPreview();if(!r||!alive(host))return;
   showDialog('Предпросмотр переноса',`<form id="migration-preview"><p>В пакете: ${r.total} карточек. Можно добавить: ${r.newCards}. Совпадающие названия не будут перезаписаны.</p><ul class="preview-list">${r.titles.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><div class="row"><label class="toggle"><input type="checkbox" name="games" ${r.newCards?'checked':'disabled'}> Карточки</label><label class="toggle"><input type="checkbox" name="settings"> Заменить настройки · тема ${esc(r.theme)}</label></div><div class="dialog-actions">${btn('Отмена','close')}<button class="btn primary" type="submit">Применить выбранное</button></div></form>`);
   const form=$('#migration-preview');when(form,async f=>{const res=await api.migrationApply(r.id,{games:f.has('games'),settings:f.has('settings')});close(form);await refreshSettings();await refresh();toast(`Добавлено карточек: ${res.added}, пропущено: ${res.skipped}.`);});
  }finally{b.disabled=false;}});};
 }
 async function required(game){
  const host=pending('Обязательные файлы игры','game-required'),names=await api.requiredFiles(game.id);if(!alive(host))return;
  host.innerHTML=`<h3>${esc(game.title)}</h3><form><p class="muted small">Выбранный .exe проверяется автоматически. Укажи дополнительные файлы относительно папки .exe, один путь на строку. Например: <code>Data/level.dat</code>.</p><label class="field"><span>Относительные пути</span><textarea name="files" rows="5" maxlength="32200">${esc(names.join('\n'))}</textarea></label><button class="btn primary" type="submit">Сохранить и проверить</button></form><ul id="required-result" class="journal-list"></ul>`;
  const result=$('#required-result',host);async function check(){try{const rows=await api.checkRequired(game.id);if(!alive(host))return;result.innerHTML=rows.map(r=>`<li><strong>${esc(r.name)}</strong><span class="chip ${r.ok?'good':''}">${r.ok?`Есть · ${bytes(r.bytes)}`:esc(r.reason)}</span></li>`).join('');}catch(e){if(alive(host))result.textContent=e.message;}}
  when($('form',host),async f=>{await api.saveRequired(game.id,String(f.get('files')).split(/\r?\n/).map(v=>v.trim()).filter(Boolean));await check();});await check();
 }
 async function sync(g){
  const host=pending('Копии в папке синхронизации','sync-copies'),folder=await api.syncFolder();if(!alive(host))return;
  host.innerHTML=`<p class="muted">ByAzen записывает отдельные резервные копии в выбранную локальную папку. Если её синхронизирует OneDrive или другой сервис, он работает отдельно. Сохранения игры не изменяются.</p><p>${esc(folder||'Папка ещё не выбрана')}</p><div class="row"><button class="btn" type="button" id="sync-folder">Выбрать папку синхронизации</button>${folder&&g?'<button class="btn primary" type="button" id="sync-create">Создать копию</button>':''}</div><div id="sync-rows"></div>`;
  const pick=$('#sync-folder',host);pick.onclick=()=>run(async()=>{pick.disabled=true;try{if(await api.pickSyncFolder()&&alive(host))await sync(g);}finally{pick.disabled=false;}});
  const create=$('#sync-create',host);if(!create)return;create.onclick=()=>run(async()=>{create.disabled=true;try{await api.makeSyncBackup(g.id);toast('Резервная копия записана.');if(alive(host))await sync(g);}finally{create.disabled=false;}});
  const rows=$('#sync-rows',host);try{const list=await api.syncBackups(g.id);if(!alive(host))return;const backups=[...list.copies,...list.brokenIds.map(id=>({id,broken:true}))];
   rows.innerHTML=`<ul class="journal-list">${backups.map((copy,i)=>`<li><span>${copy.broken?'Повреждённая копия':esc(new Date(copy.created).toLocaleString('ru'))} ${copy.broken?'':bytes(copy.bytes)}</span><button class="btn danger" type="button" data-sync-delete="${i}">Удалить копию</button></li>`).join('')||'<li class="muted">Копий пока нет.</li>'}</ul>`;
   for(const b of rows.querySelectorAll('[data-sync-delete]'))b.onclick=()=>{
    const row=backups[Number(b.dataset.syncDelete)];showDialog('Удалить копию из папки синхронизации?',`<p class="muted">Оригинальные сохранения не затрагиваются.</p><div class="dialog-actions">${btn('Отмена','close')}<button class="btn danger" type="button" id="sync-delete-confirm">Удалить</button></div>`);
    $('#sync-delete-confirm').onclick=()=>run(async()=>{await api.removeSyncBackup(g.id,row.id);await sync(g);});
   };
  }catch(e){if(alive(host))rows.textContent=e.message;}
 }
 function share(){
  const names=[...new Set(library().flatMap(g=>g.collections))].sort((a,b)=>a.localeCompare(b,'ru'));
  showDialog('Поделиться коллекцией',`<form id="share-collection"><p class="muted">Сохраняется HTML-карточка: названия игр, статусы и оценки. Без путей, заметок и ссылок.</p><label class="field"><span>Коллекция</span><select name="name"><option value="">Вся библиотека</option>${names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('')}</select></label><button class="btn primary" type="submit">Сохранить HTML</button></form>`);
  const form=$('#share-collection');when(form,async f=>{if(await api.exportCollection(f.get('name'))){close(form);toast('Карточка коллекции сохранена.');}});
 }
 async function health(){
  const host=pending('Центр состояния','health-center'),data=await api.statusCenter();if(!alive(host))return;
  const labels={ok:'Работает',error:'Ошибка',unknown:'Ещё не проверен'},time=v=>v?new Date(v).toLocaleString('ru'):'—';
  host.innerHTML=`<div class="steam-facts"><strong>Steam</strong><span>${labels[data.steam.status]} · ${esc(time(data.steam.at))}</span><strong>Хранилище настроек</strong><span>${labels[data.storage.status]} · ${esc(time(data.storage.at))}</span></div><div class="row"><button type="button" class="btn primary" id="check-health">Проверить Steam и хранилище</button>${api.auditSources?btn('Проверить источники','source-audit','refresh'):''}</div><h3>Источники</h3><ul class="journal-list">${data.sources.map(s=>`<li><strong>${esc(s.name)}</strong><span class="muted small">${!s.enabled?'Отключён':s.error?'Ошибка обновления':s.updated?'Прочитан':'Ожидает загрузки'} · ${s.count} записей</span></li>`).join('')||'<li class="muted">Списков нет.</li>'}</ul>`;
  $('#check-health',host).onclick=e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Проверяем…';run(async()=>{try{await api.statusCheck();if(alive(host))await health();}finally{b.disabled=false;}});};
 }
 async function safe(){
  const current=getRuntime(),active=!current.safe;
  setRuntime(api.safeAppearance?await api.safeAppearance(active):{...current,safe:active});toast(active?'Классическая тема до перезапуска. Сохранённые темы не изменены.':'Личное оформление восстановлено.');
 }
 return {space,clean,migrate,required,sync,share,health,safe};
}
