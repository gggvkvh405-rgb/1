import {backgroundVideo,userThemeStore,prepareVideo} from './wallpaper-store.js';
import {unpackTheme} from './theme-package.js';
import {getTheme,isTheme} from './themes.js';
import {cleanAppearance} from './appearance.js';
export function backgroundTools({dialog,showDialog,esc,btn,run,toast,setVideo,getVideo,importLook}){
 const $=(s,r=dialog)=>r.querySelector(s),alive=el=>el?.isConnected&&dialog.open;
 function video(){
  const current=getVideo();
  showDialog('Видеофон',`<form id="video-background"><p class="muted">MP4/WebM до 80 МБ и 20 минут. Видео хранится только в твоём профиле, без звука. Оно останавливается, когда окно свёрнуто или когда эффекты выключены. Фоны разделов и расписание важнее видео.</p><p>${current?`Сейчас: ${esc(current.name)}`:'Видеофон не выбран.'}</p><label class="field"><span>Локальное видео</span><input name="file" type="file" accept=".mp4,.webm,video/mp4,video/webm"></label><p role="status"></p><div class="dialog-actions">${current?'<button class="btn" type="button" id="video-remove">Убрать видеофон</button>':''}${btn('Отмена','close')}<button class="btn primary" type="submit" disabled>Применить</button></div></form>`);
  const form=$('#video-background'),status=$('[role=status]',form),file=form.elements.file,apply=$('[type=submit]',form);let staged,ticket=0;
  file.onchange=async()=>{const i=++ticket;apply.disabled=true;staged=null;if(!file.files[0])return;status.textContent='Проверяем видео…';try{const record=await prepareVideo(file.files[0]);if(i!==ticket||!alive(form))return;staged=record;status.textContent=`Готово: ${record.name}`;apply.disabled=false;}catch(e){if(i===ticket&&alive(form))status.textContent=e.message;}};
  form.onsubmit=e=>{e.preventDefault();if(!staged||apply.disabled)return;apply.disabled=true;run(async()=>{try{await backgroundVideo.save(staged);setVideo(staged);if(alive(form))dialog.close();toast('Видеофон сохранён.');}finally{apply.disabled=false;}});};
  const remove=$('#video-remove',form);if(remove)remove.onclick=()=>run(async()=>{await backgroundVideo.save(null);setVideo(null);if(alive(form))dialog.close();toast('Видеофон удалён.');});
 }
 async function gallery(){
  showDialog('Пользовательские темы',`<section id="user-theme-gallery"><p class="muted">Загружаем галерею…</p></section>`);
  const host=$('#user-theme-gallery'),rows=(await userThemeStore.read()).filter(r=>isTheme(r?.theme));if(!alive(host))return;
  host.innerHTML=`<p class="muted">Добавляй пакеты ByAzen, которыми поделились другие. Проверяются только параметры темы и JPEG. Никакого кода, внешних ссылок или автоматического применения.</p><form class="work-form"><label class="field"><span>Название для галереи</span><input name="name" maxlength="48" required></label><label class="field"><span>Пакет оформления</span><input name="file" type="file" accept=".json,application/json" required></label><p role="status"></p><button class="btn primary" type="submit" ${rows.length>=12?'disabled':''}>Добавить в галерею</button></form><div class="user-theme-grid">${rows.map((r,i)=>`<article class="pane">${r.wallpaper?.blob?`<img data-user-poster="${i}" alt="">`:getTheme(r.theme).asset?`<img src="${getTheme(r.theme).asset}" alt="">`:''}<strong>${esc(r.name)}</strong><p class="muted small">${esc(getTheme(r.theme).name)}</p><div class="row"><button class="btn" data-user-apply="${i}" type="button">Применить</button><button class="btn" data-user-remove="${i}" type="button">Убрать</button></div></article>`).join('')}</div>${rows.length?'':'<p>Галерея пока пуста.</p>'}${rows.length>=12?'<p>Лимит: 12 пакетов. Убери один, чтобы добавить новый.</p>':''}`;
  for(const img of host.querySelectorAll('[data-user-poster]')){const record=rows[Number(img.dataset.userPoster)].wallpaper,blob=record?.blob;if(!(blob instanceof Blob)||blob.type!=='image/jpeg')continue;const url=URL.createObjectURL(blob),dispose=()=>URL.revokeObjectURL(url);img.onload=img.onerror=dispose;img.src=url;setTimeout(dispose,12000);}
  const form=$('form',host),button=$('[type=submit]',form);form.onsubmit=e=>{
   e.preventDefault();if(button.disabled)return;button.disabled=true;run(async()=>{const f=new FormData(form),msg=$('[role=status]',form);try{const name=String(f.get('name')).trim();if(!name)throw Error('Укажи название.');const pack=await unpackTheme(f.get('file'));if(!alive(host))return;await userThemeStore.save([...rows,{...pack,name}]);await gallery();}catch(e){if(alive(host))msg.textContent=e.message;}finally{button.disabled=false;}});
  };
  for(const b of host.querySelectorAll('[data-user-apply]'))b.onclick=()=>run(async()=>{const item=rows[Number(b.dataset.userApply)];await importLook({theme:item.theme,appearance:cleanAppearance(item.appearance),wallpaper:item.wallpaper});if(alive(host))dialog.close();toast('Тема из галереи применена.');});
  for(const b of host.querySelectorAll('[data-user-remove]'))b.onclick=()=>run(async()=>{await userThemeStore.save(rows.filter((_,i)=>i!==Number(b.dataset.userRemove)));if(alive(host))await gallery();});
 }
 return {video,gallery};
}
