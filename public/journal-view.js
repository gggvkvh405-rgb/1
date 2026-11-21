import {cleanJournal,statsFor,localDay,hours,journalCSV,suggestGames} from './journal.js';
const blank=()=>cleanJournal({});
export function makeJournalView({api,content,showDialog,dialog,esc,icon:I,head,btn,getLibrary,exportFile,run,notify,isCurrent}){
 let data=blank(),filter={minutes:60,collection:''};
 const $=(s,node=document)=>node.querySelector(s);
 const read=async()=>api.journal?cleanJournal(await api.journal()):cleanJournal(JSON.parse(localStorage.getItem('byazen-journal-v1')||'{}'));
 async function mutate(kind,value){
  if(api.journalChange)return cleanJournal(await api.journalChange(kind,value));
  const next=await read(),g=getLibrary().find(g=>g.id===value?.id);
  if(kind==='goal')next.goal=value;
  if(kind==='delete-moment')next.moments=next.moments.filter(m=>m.id!==value);
  if(kind==='session'&&g)next.sessions.push({id:crypto.randomUUID(),gameId:g.id,title:g.title,day:value.day,seconds:value.minutes*60,manual:true});
  if(kind==='moment'&&g)next.moments.push({id:crypto.randomUUID(),gameId:g.id,day:value.day,title:value.title});
  const cleaned=cleanJournal(next);localStorage.setItem('byazen-journal-v1',JSON.stringify(cleaned));return cleaned;
 }
 async function yearImage(stats){
  const c=document.createElement('canvas');c.width=960;c.height=560;const g=c.getContext('2d');
  const colors=g.createLinearGradient(0,0,960,560);colors.addColorStop(0,'#141126');colors.addColorStop(1,'#422a76');g.fillStyle=colors;g.fillRect(0,0,960,560);
  g.fillStyle='#bda9ff';g.font='bold 24px sans-serif';g.fillText(`BYAZEN / ${new Date().getFullYear()}`,45,49);
  g.fillStyle='#fff';g.font='bold 52px sans-serif';g.fillText('Мой игровой год',45,125);g.font='32px sans-serif';g.fillText(`${hours(stats.seconds)} · ${stats.games} игр · ${stats.count} сессий`,45,191);
  g.font='26px sans-serif';stats.top.forEach((row,i)=>g.fillText(`${i+1}. ${row.title.slice(0,45)} — ${hours(row.seconds)}`,45,270+i*60));
  await exportFile('year',c.toDataURL('image/png').split(',')[1]);
 }
 const gameLabel=(id,fallback='Удалённая игра')=>getLibrary().find(g=>g.id===id)?.title||fallback;
 function drawSuggestions(host,library){
  const results=suggestGames(library,data.sessions,filter.minutes,filter.collection);
  $('#journal-picks',host).innerHTML=results.length?results.map(({game,usual})=>`<li><strong>${esc(game.title)}</strong><span class="muted small">${usual?`В среднем ${usual} мин`:'Длительность не записана'}</span></li>`).join(''):'<li class="muted">Нет подходящих игр.</li>';
 }
 function draw(host){
  const lib=getLibrary(),stats=statsFor(data.sessions,lib),collections=stats.collections,name=localDay().slice(0,7);
  host.innerHTML=`<div class="journal-stats"><article class="pane"><div class="eyebrow">ПОСЛЕДНИЕ 7 ДНЕЙ</div><strong>${hours(stats.weekly.seconds)}</strong><p class="muted small">${stats.weekly.games} игр · ${stats.weekly.count} сессий</p></article><article class="pane"><div class="eyebrow">ИГРОВОЙ ГОД</div><strong>${hours(stats.yearly.seconds)}</strong><p class="muted small">${stats.yearly.games} игр · ${stats.yearly.count} сессий</p>${stats.yearly.top.length?`<ol>${stats.yearly.top.map(r=>`<li>${esc(r.title)} · ${hours(r.seconds)}</li>`).join('')}</ol>`:''}<button type="button" id="journal-year" class="btn">Сохранить карточку PNG</button></article><article class="pane"><div class="eyebrow">ЦЕЛЬ · ${name}</div><strong>${stats.finished}${data.goal?` / ${data.goal}`:''}</strong><p class="muted small">Игр отмечено пройденными в этом месяце</p><form id="journal-goal" class="row"><input aria-label="Цель на месяц" type="number" min="0" max="50" value="${data.goal}" required><button class="btn" type="submit">Сохранить</button></form></article></div>
  <div class="journal-more"><section class="pane"><h2>Что дальше?</h2><p class="muted small">Подборка непройденных игр по времени и коллекции.</p><form id="journal-suggest" class="row"><label class="field"><span>Минут есть</span><input name="minutes" type="number" min="5" max="1440" value="${filter.minutes}"></label><label class="field"><span>Коллекция</span><select name="collection"><option value="">Любая</option>${collections.map(r=>`<option ${r.name===filter.collection?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label></form><ul class="journal-list" id="journal-picks"></ul></section><section class="pane"><h2>Коллекции</h2>${collections.length?`<ul class="journal-list">${collections.slice(0,80).map(r=>`<li><strong>${esc(r.name)}</strong><span class="muted small">${r.finished}/${r.count} пройдено · ${hours(r.seconds)}</span></li>`).join('')}</ul>`:'<p class="muted">Коллекций пока нет.</p>'}</section></div>
  <div class="journal-more"><section class="pane"><h2>Игровые моменты</h2><ul class="journal-list">${data.moments.slice().sort((a,b)=>b.day.localeCompare(a.day)).slice(0,50).map(m=>`<li><div><strong>${esc(m.title)}</strong><p class="muted small">${esc(gameLabel(m.gameId))} · ${m.day}</p></div><button type="button" class="btn" data-journal-delete="${esc(m.id)}" aria-label="Удалить момент">Удалить</button></li>`).join('')||'<li class="muted">Моментов пока нет.</li>'}</ul></section><section class="pane"><h2>Последние сессии</h2><ul class="journal-list">${data.sessions.slice().reverse().slice(0,50).map(s=>`<li><strong>${esc(gameLabel(s.gameId,s.title))}</strong><span class="muted small">${s.day} · ${hours(s.seconds)} · ${s.manual?'вручную':'по процессу'}</span></li>`).join('')||'<li class="muted">Записей пока нет.</li>'}</ul><p class="muted small">Автоматически учитываются только завершённые процессы .exe, запущенные из ByAzen, пока лаунчер открыт. Для Steam есть ручная запись.</p></section></div>`;
  drawSuggestions(host,lib);
  $('#journal-suggest',host).onchange=e=>{const f=new FormData(e.currentTarget);filter={minutes:Math.max(5,Math.min(1440,Number(f.get('minutes'))||60)),collection:String(f.get('collection'))};drawSuggestions(host,lib);};
  $('#journal-goal',host).onsubmit=e=>{e.preventDefault();const n=Number($('input',e.currentTarget).value);run(async()=>{data=await mutate('goal',n);if(host.isConnected)draw(host);notify('Цель сохранена.');});};
  $('#journal-year',host).onclick=()=>run(()=>yearImage(stats.yearly));
  for(const b of host.querySelectorAll('[data-journal-delete]'))b.onclick=()=>run(async()=>{data=await mutate('delete-moment',b.dataset.journalDelete);if(host.isConnected)draw(host);});
 }
 async function render(n){
  content.innerHTML=`${head('ИГРОВОЙ ДНЕВНИК','Журнал','Статистика, цели и запомнившиеся моменты.',`${btn('Записать сессию','journal-session','clock')}${btn('Отметить момент','journal-moment','plus')}${btn('Экспорт CSV','journal-csv','download')}`)}<div id="journal-body"><p class="muted">Читаем журнал…</p></div>`;
  data=await read();const host=$('#journal-body');if(isCurrent(n)&&host)draw(host);
 }
 function entry(kind){
  const games=getLibrary(),session=kind==='session';if(!games.length){notify('Сначала добавьте игру в библиотеку.',true);return;}
  showDialog(session?'Записать игровую сессию':'Отметить игровой момент',`<form id="journal-entry"><label class="field"><span>Игра</span><select name="id">${games.map(g=>`<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('')}</select></label><label class="field"><span>Дата</span><input type="date" name="day" value="${localDay()}" max="${localDay()}" required></label>${session?'<label class="field"><span>Минут</span><input name="minutes" type="number" min="1" max="1440" required></label>':'<label class="field"><span>Что произошло?</span><input name="title" maxlength="200" required></label>'}<div class="dialog-actions">${btn('Отмена','close')}<button class="btn primary" type="submit">Сохранить</button></div></form>`);
  const form=$('#journal-entry');form.onsubmit=e=>{e.preventDefault();const f=new FormData(form);run(async()=>{data=await mutate(kind,{id:f.get('id'),day:f.get('day'),title:f.get('title'),minutes:Number(f.get('minutes'))});const host=$('#journal-body');if(host)draw(host);if(form.isConnected)dialog.close();notify('Запись добавлена.');});};
 }
 return {render,entry,csv:async()=>exportFile('csv',journalCSV((await read()).sessions,getLibrary()))};
}
