const folderLabels={saves:'Сохранения',screenshots:'Скриншоты',mods:'Моды'};
const copyLabels={manual:'Ручная копия',launch:'Перед запуском', 'before-restore':'Перед восстановлением'};
export function libraryTools({api,dialog,showDialog,esc,icon:I,notify,refreshLibrary,humanBytes}){
 const $=(s,root=dialog)=>root.querySelector(s);
 const button=(label,cls='')=>`<button type="button" class="btn ${cls}" data-tool="${label}">${label}</button>`;
 const close=`<button type="button" class="btn" data-action="close">Закрыть</button>`;
 const status=(text='')=>`<p class="library-tool-status muted small" role="status">${esc(text)}</p>`;
 function at(panel){return panel?.isConnected&&dialog.open;}
 function error(panel,e){const node=$('[role=status]',panel);if(at(panel)&&node){node.textContent=e.message;node.classList.add('is-error');}else notify(e.message,true);}
 async function busy(panel,fn){
  if(!at(panel)||panel.dataset.busy)return;
  panel.dataset.busy='true';
  const controls=[...panel.querySelectorAll('button,input')].filter(x=>!x.disabled&&x.dataset.action!=='close');
  controls.forEach(x=>x.disabled=true);
  try{await fn();}catch(e){error(panel,e);}
  finally{delete panel.dataset.busy;controls.forEach(x=>x.disabled=false);}
 }
 function action(panel,label,cb){const b=[...panel.querySelectorAll('[data-tool]')].find(x=>x.dataset.tool===label);if(b)b.onclick=()=>busy(panel,cb);}
 async function openScan(kind,isCurrent=()=>true){
  const scan=await api.scanLibrary(kind);if(!scan||!isCurrent())return;return showScan(scan,kind);
 }
 function showScan(scan,kind){
  const store={epic:'Epic',gog:'GOG',itch:'itch.io'}[kind];
  showDialog(kind==='steam'?'Импорт из Steam':kind==='drop'?'Перетащенные игры':store?'Импорт из '+store:'Установленные игры',`<section id="library-scan"><p class="muted">${kind==='steam'?'Найдены установленные игры в выбранной библиотеке Steam. Запуск будет происходить через Steam.':'Отметьте исполняемые файлы игр. Поиск не запускает найденные файлы; служебные программы могут встречаться в результатах.'}</p>${scan.limited?'<p class="notice">Достигнут лимит поиска. Для остальных игр выберите более узкую папку.</p>':''}${scan.items.length?`<div class="library-scan-tools">${button('Выбрать все')}${button('Снять выбор')}</div><div class="library-scan-list">${scan.items.map(item=>`<label class="library-scan-row"><input type="checkbox" value="${Number(item.index)}" ${item.present?'disabled':''}><span><strong>${esc(item.title)}</strong><small>${esc(item.path)}${item.present?' · уже в библиотеке':''}</small></span></label>`).join('')}</div>`:'<p class="notice">Подходящих установленных игр не найдено.</p>'}${status()}<div class="dialog-actions">${close}${button('Добавить выбранные','primary')}</div></section>`,{eyebrow:'ЛОКАЛЬНАЯ БИБЛИОТЕКА'});
  const pane=$('#library-scan'),items=[...pane.querySelectorAll('input[type=checkbox]:not(:disabled)')],label=$('[role=status]',pane),commit=$('[data-tool="Добавить выбранные"]',pane);
  const indices=()=>items.filter(x=>x.checked).map(x=>Number(x.value));
  const update=()=>{const count=indices().length;commit.disabled=!count;label.textContent=`Выбрано: ${count} из ${items.length}`;label.classList.remove('is-error');};
  for(const box of items)box.onchange=update;
  for(const [key,value] of [['Выбрать все',true],['Снять выбор',false]]){const b=$(`[data-tool="${key}"]`,pane);if(b)b.onclick=()=>{for(const box of items)box.checked=value;update();};}
  update();
  action(pane,'Добавить выбранные',async()=>{
   const result=await api.importInstalledGames(scan.id,indices());await refreshLibrary();
   if(at(pane))dialog.close();notify(`Добавлено: ${result.added}.${result.skipped?` Пропущено: ${result.skipped}.`:''}`);
  });
 }
 function folders(g){
  showDialog(`Папки игры · ${esc(g.title)}`,`<section id="game-folders">${status('Читаем папки…')}</section>`,{eyebrow:'ФАЙЛЫ ИГРЫ'});
  const pane=$('#game-folders');
  async function update(){
   const data=await api.gameFolders(g.id);if(!at(pane))return;
   pane.innerHTML=`<div class="game-folder-list">${Object.entries(folderLabels).map(([kind,label])=>`<div class="game-folder-row"><div><strong>${label}</strong><p class="muted small">${esc(data.folders[kind]||'Папка не выбрана')}</p></div><div>${button(`Выбрать: ${label}`)}${data.folders[kind]?button(`Открыть: ${label}`):''}</div></div>`).join('')}</div>${status()}<div class="dialog-actions">${close}${button('Копии сохранений','primary')}</div>`;
   for(const [kind,label] of Object.entries(folderLabels)){
    action(pane,`Выбрать: ${label}`,async()=>{if(await api.pickGameFolder(g.id,kind))await update();});
    action(pane,`Открыть: ${label}`,()=>api.openGameFolder(g.id,kind));
   }
   action(pane,'Копии сохранений',()=>backups(g));
  }
  return update().catch(e=>error(pane,e));
 }
 function backups(g){
  showDialog(`Копии сохранений · ${esc(g.title)}`,`<section id="save-backups">${status('Читаем сохранённые копии…')}</section>`,{eyebrow:'РЕЗЕРВНЫЕ КОПИИ'});
  const pane=$('#save-backups');
  async function update(){
   const [c,info]=await Promise.all([api.listSaveBackups(g.id),api.gameFolders(g.id)]);if(!at(pane))return;
   const folder=info.folders.saves;
   pane.innerHTML=`<p class="muted">Выбери папку, в которой игра хранит сохранения, а не всю папку установки. Перед копированием и восстановлением закрой игру.</p><div class="game-folder-row"><div><strong>Папка сохранений</strong><p class="muted small">${esc(folder||'Не выбрана')}</p></div><div>${button('Выбрать папку')}${folder?button('Открыть папку'):''}</div></div>${folder?`<label class="toggle backups-auto"><input id="backup-auto" type="checkbox" ${info.auto?'checked':''}> Создавать копию перед запуском из ByAzen</label><p class="muted small">Если копия не удастся, игра не запустится. Неизменившиеся файлы повторно не копируются.</p>`:''}<div class="section-heading"><h3>История копий</h3><span class="chip">${c.copies.length+c.damaged} / ${c.max}</span></div><div class="game-folder-list">${c.copies.map(copy=>`<div class="game-folder-row"><div><strong>${esc(copyLabels[copy.reason])}</strong><p class="muted small">${esc(new Date(copy.created).toLocaleString('ru'))} · ${copy.count} файлов · ${humanBytes(copy.bytes)}</p></div><div><button type="button" class="btn" data-restore="${esc(copy.id)}" ${!folder?'disabled':''}>Восстановить</button><button type="button" class="btn" data-delete="${esc(copy.id)}">Удалить</button></div></div>`).join('')}${(c.brokenIds||[]).map(id=>`<div class="game-folder-row"><strong>Повреждённая копия</strong><button type="button" class="btn" data-delete="${esc(id)}">Удалить</button></div>`).join('')}${!c.copies.length&&!c.damaged?'<p class="muted small">Копий пока нет.</p>':''}</div>${status()}<div class="dialog-actions">${close}${folder?button('Создать копию','primary'):''}</div>`;
   action(pane,'Выбрать папку',async()=>{if(await api.pickGameFolder(g.id,'saves'))await update();});
   action(pane,'Открыть папку',()=>api.openGameFolder(g.id,'saves'));
   action(pane,'Создать копию',async()=>{const r=$('[role=status]',pane);r.textContent='Копируем и сверяем файлы…';await api.makeSaveBackup(g.id);await update();notify('Резервная копия создана.');});
   const auto=$('#backup-auto',pane);
   if(auto)auto.onchange=()=>busy(pane,async()=>{try{await api.setAutoSaveBackup(g.id,auto.checked);}catch(e){auto.checked=info.auto;throw e;}await update();});
   for(const b of pane.querySelectorAll('[data-restore]'))b.onclick=()=>busy(pane,async()=>{
    $('[role=status]',pane).textContent='Сравниваем сохранения…';const preview=await api.previewSaveRestore(g.id,b.dataset.restore);
    if(at(pane))restore(g,preview);
   });
   for(const b of pane.querySelectorAll('[data-delete]'))b.onclick=()=>confirmDelete(g,b.dataset.delete);
  }
  return update().catch(e=>error(pane,e));
 }
 function restore(g,preview){
  const count=preview.added+preview.replaced;
  showDialog('Проверка восстановления',`<section id="restore-preview"><p class="muted">Папка: ${esc(preview.root)}</p><p><strong>${preview.added} новых · ${preview.replaced} замен · ${preview.unchanged} без изменений</strong></p>${count?`<ul class="preview-list">${preview.paths.map(file=>`<li>${esc(file.name)} — ${file.replace?'заменить':'добавить'}</li>`).join('')}</ul>${count>preview.paths.length?`<p class="muted small">Показано ${preview.paths.length} из ${count} изменений.</p>`:''}<div class="notice">${I('alert')}<span>Перед записью ByAzen создаст новую копию текущих файлов. Лишние файлы не удаляются. Закрой игру.</span></div>`:'<p>Файлы уже совпадают с резервной копией.</p>'}${status()}<div class="dialog-actions"><button type="button" class="btn" id="restore-back">Назад к копиям</button>${count?button('Подтвердить восстановление','primary'):''}</div></section>`,{eyebrow:'СОХРАНЕНИЯ'});
  const pane=$('#restore-preview');$('#restore-back',pane).onclick=()=>backups(g);
  action(pane,'Подтвердить восстановление',async()=>{
   $('[role=status]',pane).textContent='Делаем защитную копию и восстанавливаем файлы…';
   const result=await api.restoreSaveBackup(g.id,preview.draft);
   notify(`Восстановлено файлов: ${result.updated}.`);if(at(pane))await backups(g);
  });
 }
 function confirmDelete(g,id){
  showDialog('Удалить резервную копию?',`<section id="backup-delete"><p class="muted">Файлы в папке игры останутся без изменений. Удалённую копию вернуть нельзя.</p>${status()}<div class="dialog-actions"><button type="button" class="btn" id="backup-back">Назад</button>${button('Удалить копию','danger')}</div></section>`);
  const pane=$('#backup-delete');$('#backup-back',pane).onclick=()=>backups(g);
  action(pane,'Удалить копию',async()=>{await api.deleteSaveBackup(g.id,id);if(at(pane))await backups(g);notify('Резервная копия удалена.');});
 }
 return {openScan,showScan,folders,backups};
}
