import {cleanPersonal,keyFromEvent,navIds,seasons} from './personal-options.js';
import {motionAllowed} from './motion.js';
import {visualThemes,classicThemes} from './themes.js';
const toneSets={soft:[523,660],arcade:[587,880],winter:[784,988],autumn:[329,440],spring:[659,784],summer:[440,554]};
let audio,lastAudio=0;
export async function themeTone(name,volume,kind='click'){
 const freqs=toneSets[name];if(!freqs||!volume||Date.now()-lastAudio<70)return;
 lastAudio=Date.now();try{
  audio||=new AudioContext();const t=audio.currentTime;await audio.resume();
  const moment=audio.currentTime;
  (kind==='notice'?[freqs[1],freqs[0]]:freqs).forEach((hz,i)=>{
   const o=audio.createOscillator(),g=audio.createGain(),start=Math.max(t,moment)+i*.047;
   o.type=name==='arcade'?'triangle':'sine';o.frequency.value=hz;
   g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(volume/100*.065,start+.017);g.gain.exponentialRampToValueAtTime(.0002,start+.12);
   o.connect(g).connect(audio.destination);o.start(start);o.stop(start+.13);
  });
 }catch{}
}
const soundLabels={off:'Без звука',soft:'Мягкие тоны',arcade:'Аркада',winter:'Зимний звон',spring:'Весенняя капель',summer:'Тёплая волна',autumn:'Осенний тон'};
export function setupPersonal({dialog,showDialog,esc,pick,icons:I,sections,get,save,notify,showSlides,exportTheme,importTheme}){
 const $=(s,node=dialog)=>node.querySelector(s);
 const button=(label,action,style='')=>`<button type="button" class="btn ${style}" data-personal="${action}">${label}</button>`;
 const rows=[['search','Поиск'],['library','Библиотека'],['downloads','Загрузки'],['journal','Журнал']];
 function open(){
  const initial=cleanPersonal(get().personal),active=navIds.filter(id=>initial.nav.includes(id)),nav=[...initial.nav,...navIds.filter(x=>!active.includes(x))];
  const opts=(selected,inherit=false)=>`${inherit?`<option value="">По общему оформлению</option>`:''}${[...classicThemes,...visualThemes].map(t=>`<option value="${t.id}" ${selected===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}`;
  const themeList=(name,selected,label,inherit)=>`<label class="field"><span>${label}</span><select name="${name}">${opts(selected,inherit)}</select></label>`;
  const toggle=(name,label)=>`<label class="toggle"><input type="checkbox" name="${name}" ${initial[name]?'checked':''}> ${label}</label>`;
  showDialog('Оформление и управление',`<form id="personal-form"><div class="personal-tabs">${button('Темы','themes')}${button('Управление','controls')}${button('Панель и клавиши','nav')}</div><div data-personal-page="themes"><div class="personal-tools">${button('Слайд-шоу из папки','slides')}${button('Экспорт темы','export')}${button('Импорт темы','import')}</div><div class="season-grid">${seasons.map(([id,label,theme])=>{const art=visualThemes.find(t=>t.id===theme);return `<button type="button" class="btn season-card" data-season="${id}"><img src="${art.asset}" alt=""><span>${label}</span></button>`;}).join('')}</div><p class="muted small">Сезонный пакет меняет общую тему и звук. Фоны разделов, расписание и свой фон сохраняются.</p><div class="personal-form-grid settings-fields">${themeList('day',initial.schedule.day,'Дневная тема')}${themeList('night',initial.schedule.night,'Ночная тема')}<label class="toggle"><input name="schedule" type="checkbox" ${initial.schedule.enabled?'checked':''}> Включить расписание</label><label class="field"><span>Ночь с (день с 06:00)</span><input type="time" name="time" value="${initial.schedule.time}" required></label></div><details><summary>Фоны отдельных разделов</summary><div class="personal-form-grid settings-fields">${[...navIds,'sources'].map(id=>themeList('section-'+id,initial.sectionThemes[id],sections[id][0],true)).join('')}</div></details></div><div data-personal-page="controls" hidden><div class="personal-toggles">${toggle('tv','Режим телевизора')}${toggle('gamepad','Навигация геймпадом')}${toggle('contrast','Высокий контраст')}${toggle('compact','Компактные списки')}${toggle('parallax','Параллакс фона')}${toggle('tray','Сворачивать в трей (Windows)')}</div><div class="personal-form-grid settings-fields"><label class="field"><span>Масштаб интерфейса, %</span><input type="number" name="uiScale" min="75" max="150" value="${initial.uiScale}" required></label><label class="field"><span>Размер текста, %</span><input type="number" name="textScale" min="85" max="135" value="${initial.textScale}" required></label><label class="field"><span>Звуковая тема</span>${pick('sound',Object.entries(soundLabels),initial.sound,'Звуковая тема')}</label><label class="field"><span>Громкость, %</span><input type="number" name="volume" min="0" max="100" value="${initial.volume}" required></label><label class="field"><span>Заставка запуска</span>${pick('intro',[['off','Выключена'],['fade','Мягкое появление'],['scan','Неоновый импульс']],initial.intro,'Заставка запуска')}</label></div>${button('Проверить звук','tone')}<p class="muted small">Геймпад: крестовина или левый стик — выбор, A — действие, B — закрыть. В браузерном предпросмотре системный трей недоступен.</p></div><div data-personal-page="nav" hidden><div class="personal-order">${nav.map(id=>`<div data-nav-id="${id}"><label class="toggle"><input type="checkbox" ${active.includes(id)?'checked':''} ${id==='settings'?'disabled':''}> ${sections[id][0]}</label><button type="button" class="btn" data-up aria-label="Выше: ${sections[id][0]}">↑</button><button type="button" class="btn" data-down aria-label="Ниже: ${sections[id][0]}">↓</button></div>`).join('')}</div><div class="personal-form-grid settings-fields">${rows.map(([id,label])=>`<label class="field"><span>${label}</span><input name="key-${id}" maxlength="24" value="${esc(initial.keys[id])}" placeholder="Ctrl+K" readonly aria-label="Клавиши: ${label}"></label>`).join('')}</div><p class="muted small">Нажмите сочетание Ctrl/Alt + буква или цифра; Backspace отключает привязку. Действуют только внутри ByAzen.</p></div><p class="muted small" role="status"></p><div class="dialog-actions"><button type="button" class="btn" data-action="close">Отмена</button><button type="submit" class="btn primary">${I('check')} Сохранить</button></div></form>`,{eyebrow:'ЛИЧНЫЕ НАСТРОЙКИ'});
  const form=$('#personal-form'),status=$('[role=status]',form),fields=form.elements;
  const on=(label,fn)=>{const el=$(`[data-personal="${label}"]`,form);if(el)el.onclick=fn;};
  const tabs=['themes','controls','nav'];
  function tab(label){for(const key of tabs){$(`[data-personal="${key}"]`,form).setAttribute('aria-pressed',String(key===label));$(`[data-personal-page="${key}"]`,form).hidden=key!==label;}}
  for(const label of tabs)on(label,()=>tab(label));tab('themes');
  on('slides',showSlides);on('export',exportTheme);on('import',importTheme);
  on('tone',()=>void themeTone(fields.sound.value,Number(fields.volume.value),'notice'));
  for(const item of form.querySelectorAll('[data-nav-id]')){
   $('[data-up]',item).onclick=()=>{const previous=item.previousElementSibling;if(previous)previous.before(item);};
   $('[data-down]',item).onclick=()=>{if(item.nextElementSibling)item.nextElementSibling.after(item);};
  }
  for(const [id] of rows)fields['key-'+id].onkeydown=e=>{
   const value=keyFromEvent(e);if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();e.stopPropagation();fields['key-'+id].value='';}
   else if(value){e.preventDefault();e.stopPropagation();const clean=cleanPersonal({keys:{[id]:value}}).keys[id];if(clean===value)fields['key-'+id].value=value;else status.textContent='Это сочетание зарезервировано системой или используется другой командой.';}
  };
  for(const card of form.querySelectorAll('[data-season]'))card.onclick=async()=>{
   const item=seasons.find(x=>x[0]===card.dataset.season);
   try{await save({theme:item[2],personal:{...cleanPersonal(get().personal),sound:item[3]}});if(form.isConnected&&dialog.open)dialog.close();notify(`Пакет «${item[1]}» применён.`);}
   catch(e){status.textContent=e.message;}
  };
  form.onsubmit=async e=>{
   e.preventDefault();const b=$('button[type=submit]',form);b.disabled=true;
   try{
    const values={...initial,nav:[...form.querySelectorAll('[data-nav-id]')].filter(x=>$('input',x).checked).map(x=>x.dataset.navId),keys:Object.fromEntries(rows.map(([id])=>[id,fields['key-'+id].value])),sectionThemes:Object.fromEntries([...navIds,'sources'].map(id=>[id,fields['section-'+id].value])),schedule:{enabled:fields.schedule.checked,time:fields.time.value,day:fields.day.value,night:fields.night.value}};
    for(const key of ['tv','gamepad','contrast','compact','parallax','tray'])values[key]=fields[key].checked;
    for(const key of ['uiScale','textScale','volume'])values[key]=Number(fields[key].value);
    values.sound=fields.sound.value;values.intro=fields.intro.value;
    await save({personal:cleanPersonal(values)});if(form.isConnected&&dialog.open)dialog.close();notify('Личные настройки сохранены.');
   }catch(error){status.textContent=error.message;}finally{b.disabled=false;}
  };
 }
 return {open};
}
export function setupGamepad({dialog,get,go}){
 let last=[],frame=0;
 const ready=()=>Boolean(get().personal?.gamepad)&&document.hasFocus()&&!document.hidden;
 function target(dx,dy){
  const area=dialog.open?dialog:document;
  const buttons=[...area.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)')].filter(b=>b.getClientRects().length&&b.tabIndex>=0);
  const cur=document.activeElement;if(!buttons.includes(cur)){buttons[0]?.focus();return;}
  const from=cur.getBoundingClientRect(),fx=from.x+from.width/2,fy=from.y+from.height/2;
  let minimum=Infinity,best;
  for(const el of buttons){if(el===cur)continue;const r=el.getBoundingClientRect(),x=r.x+r.width/2-fx,y=r.y+r.height/2-fy,forward=x*dx+y*dy,side=Math.abs(x*dy-y*dx);
   if(forward<5)continue;const score=forward+3*side;if(score<minimum){minimum=score;best=el;}}
  if(best){best.focus({preventScroll:true});best.scrollIntoView({block:'nearest',behavior:'instant'});}
 }
 function poll(){
  if(!ready()){last=[];return;}
  let p;try{p=[...(navigator.getGamepads?.()||[])].find(x=>x?.connected);}catch{return;}
  if(!p){last=[];return;}
  const active=[p.buttons[0]?.pressed,p.buttons[1]?.pressed,p.buttons[12]?.pressed||p.axes[1]<-.65,p.buttons[13]?.pressed||p.axes[1]>.65,p.buttons[14]?.pressed||p.axes[0]<-.65,p.buttons[15]?.pressed||p.axes[0]>.65];
  if(active[0]&&!last[0])document.activeElement?.click?.();
  if(active[1]&&!last[1]){if(dialog.open)dialog.close();else go('home');}
  for(const [i,dir] of [[2,[0,-1]],[3,[0,1]],[4,[-1,0]],[5,[1,0]]])if(active[i]&&!last[i])target(...dir);
  last=active;
 }
 return {poll,start(){if(!frame)frame=setInterval(poll,100);}};
}
export function showIntro(mode){
 if(mode==='off'||!motionAllowed())return;
 const shell=document.createElement('div');shell.className='startup-intro';shell.dataset.intro=mode;shell.setAttribute('aria-hidden','true');
 const logo=document.createElement('img');logo.src='assets/logo.svg';logo.alt='';shell.append(logo);document.body.append(shell);setTimeout(()=>shell.remove(),950);
}
