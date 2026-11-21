export function makeLibraryWave({api,dialog,showDialog,esc,btn,get,refresh,run,notify}){
 const $=(s,node=dialog)=>node.querySelector(s);
 const submit=(form,fn)=>{form.onsubmit=e=>{e.preventDefault();const b=$('[type=submit]',form),values=new FormData(form);b.disabled=true;return run(async()=>{try{await fn(values);}finally{b.disabled=false;}});};};
 function batch(){
  const games=get();if(!games.length)return notify('В библиотеке пока нет игр.',true);
  const labels={cyberpunk:'Cyberpunk',elden:'Elden Ring',geometry:'Geometry Dash',ghost:'Ghost of Tsushima',gta:'GTA',last:'The Last of Us',onimusha:'Onimusha',rdr:'Red Dead Redemption',spider:'Spider-Man'};
  showDialog('Массовое редактирование',`<form id="batch-games"><label class="field"><span>Поиск по карточкам</span><input id="batch-search" type="search"></label><div class="library-scan-list">${games.map(g=>`<label class="library-scan-row" data-batch-name="${esc(g.title.toLocaleLowerCase('ru'))}"><input type="checkbox" name="game" value="${esc(g.id)}"><strong>${esc(g.title)}</strong></label>`).join('')}</div><div class="settings-fields"><label class="field"><span>Добавить коллекции через запятую</span><input name="collections" maxlength="750"></label><label class="field"><span>Добавить теги через запятую</span><input name="tags" maxlength="750"></label><label class="field"><span>Обложка</span><select name="cover"><option value="">Не менять</option><option value="clear">Убрать обложку</option>${Object.entries(labels).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label></div><div class="dialog-actions">${btn('Отмена','close')}<button type="submit" class="btn primary">Применить выбранным</button></div></form>`);
  const form=$('#batch-games');$('#batch-search',form).oninput=e=>{const q=e.target.value.toLocaleLowerCase('ru').trim();for(const row of form.querySelectorAll('[data-batch-name]'))row.hidden=!row.dataset.batchName.includes(q);};
  submit(form,async f=>{const result=await api.saveBatch(f.getAll('game'),{collections:String(f.get('collections')).split(','),tags:String(f.get('tags')).split(','),cover:String(f.get('cover'))});await refresh();if(form.isConnected)dialog.close();notify(`Обновлено карточек: ${result.updated}.`);});
 }
 function move(){
  showDialog('Исправить пути после переноса',`<form id="move-games"><p class="muted">Укажи старую корневую папку. Затем выбери новую. ByAzen проверит те же относительные пути к .exe и ничего не переместит на диске.</p><label class="field"><span>Старая корневая папка</span><input name="old" placeholder="C:\\Games" maxlength="1000" required></label><div class="dialog-actions">${btn('Отмена','close')}<button type="submit" class="btn primary">Выбрать новую папку</button></div></form>`);
  const form=$('#move-games');submit(form,async f=>{
   const result=await api.previewMove(String(f.get('old')).trim());if(!result||!form.isConnected)return;
   showDialog('Предпросмотр новых путей',`<form id="move-preview"><p>${result.moves.length} изменений · ${result.skipped} не найдены или не подходят${result.truncated?' · достигнут предел предпросмотра':''}</p><ul class="preview-list">${result.moves.map(r=>`<li><strong>${esc(r.title)}</strong><br>${esc(r.previous)} → ${esc(r.next)}</li>`).join('')}</ul><div class="dialog-actions">${btn('Отмена','close')}<button type="submit" class="btn primary" ${result.moves.length?'':'disabled'}>Исправить пути</button></div></form>`);
   const preview=$('#move-preview');submit(preview,async()=>{const updated=await api.applyMove(result.draft);await refresh();if(preview.isConnected)dialog.close();notify(`Пути обновлены: ${updated.updated}.`);});
  });
 }
 async function screenshots(g){
  const list=await api.screenshots(g.id);
  showDialog(`Скриншоты · ${esc(g.title)}`,`<div id="game-screenshots"><figure><img alt="Скриншот игры" hidden><figcaption class="muted small"></figcaption></figure><div class="row"><button class="btn" type="button" id="prev-screen">Назад</button><button class="btn" type="button" id="next-screen">Вперёд</button>${btn('Закрыть','close')}</div></div>`);
  const panel=$('#game-screenshots'),image=$('img',panel),caption=$('figcaption',panel),prev=$('#prev-screen',panel),next=$('#next-screen',panel);
  let index=0,number=0,url;
  const revoke=()=>{if(url){URL.revokeObjectURL(url);url=null;}};
  dialog.addEventListener('close',()=>{if(!dialog.open||!panel.isConnected)revoke();},{once:true});
  async function read(target){
   if(!list.items.length){caption.textContent='В выбранной папке нет подходящих изображений.';prev.disabled=next.disabled=true;return;}
   const request=++number;index=target;prev.disabled=index===0;next.disabled=index===list.items.length-1;
   caption.textContent='Читаем изображение…';
   try{
    const response=await api.screenshot(list.draft,index);
    if(request!==number||!panel.isConnected||!dialog.open)return;
    revoke();url=URL.createObjectURL(new Blob([response.data],{type:response.mime}));image.src=url;image.hidden=false;
    caption.textContent=`${index+1} из ${list.items.length} · ${list.items[index].title}`;
   }catch(e){if(request===number&&panel.isConnected){image.hidden=true;caption.textContent=e.message;}}
  }
  prev.onclick=()=>read(index-1);next.onclick=()=>read(index+1);await read(0);
 }
 return {batch,move,screenshots};
}
