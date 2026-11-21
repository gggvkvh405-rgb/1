export const homeWidgets=[['feature','Избранная игра'],['continue','Продолжить игру'],['discovery','Подборки'],['library','Моя библиотека'],['activity','Загрузки']];
export function cleanHome(value){
 const options=homeWidgets.map(([id])=>id),defaults=['feature','continue','discovery'];
 if(!Array.isArray(value))return defaults;
 return [...new Set(value.slice(0,10).filter(id=>options.includes(id)))];
}
export function setupHomeLayout({dialog,showDialog,btn,get,save,render,run,toast}){
 return ()=>{
  const live=cleanHome(get().homeWidgets),keys=[...live,...homeWidgets.map(([id])=>id).filter(id=>!live.includes(id))];
  const name=id=>homeWidgets.find(x=>x[0]===id)[1];
  showDialog('Настроить главную',`<form id="home-widgets"><p class="muted">Отметь разделы, которые хочешь видеть, и измени порядок кнопками со стрелками.</p><div class="personal-order">${keys.map(id=>`<div data-widget="${id}"><label class="toggle"><input type="checkbox" ${live.includes(id)?'checked':''}> ${name(id)}</label><button class="btn" type="button" data-move="up" aria-label="Выше: ${name(id)}">↑</button><button class="btn" type="button" data-move="down" aria-label="Ниже: ${name(id)}">↓</button></div>`).join('')}</div><div class="dialog-actions">${btn('Отмена','close')}<button class="btn primary" type="submit">Сохранить</button></div></form>`);
  const form=dialog.querySelector('#home-widgets');for(const b of form.querySelectorAll('[data-move]'))b.onclick=()=>{const row=b.closest('[data-widget]');if(b.dataset.move==='up')row.previousElementSibling?.before(row);else row.nextElementSibling?.after(row);b.focus();};
  form.onsubmit=e=>{e.preventDefault();const saveButton=form.querySelector('[type=submit]');if(saveButton.disabled)return;saveButton.disabled=true;run(async()=>{
   try{const selected=[...form.querySelectorAll('[data-widget]')].filter(r=>r.querySelector('input').checked).map(r=>r.dataset.widget);await save({homeWidgets:selected});if(form.isConnected&&dialog.open)dialog.close();await render();toast('Главная настроена.');}finally{saveButton.disabled=false;}
  });};
 };
}
