const fonts=new Set(['interface','system','rounded','serif']);
const bound=(value,min,max,fallback)=>Number.isInteger(value)&&value>=min&&value<=max?value:fallback;
export function cleanAppearance(raw){
 const accent=typeof raw?.accent==='string'&&/^#[a-f0-9]{6}$/i.test(raw.accent)?raw.accent.toLowerCase():'#bfa9ff';
 return {enabled:raw?.enabled===true,accent,opacity:bound(raw?.opacity,65,100,100),radius:bound(raw?.radius,0,32,16),font:fonts.has(raw?.font)?raw.font:'interface',effects:bound(raw?.effects,0,100,100)};
}
export function onAccent(color){
 const values=color.match(/[a-f0-9]{2}/gi).map(pair=>parseInt(pair,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return values[0]*.2126+values[1]*.7152+values[2]*.0722>.179?'#000000':'#ffffff';
}
export function applyAppearance(el,raw){
 const style=cleanAppearance(raw);
 el.dataset.customize=String(style.enabled);
 el.dataset.appearanceFont=style.font;
 el.dataset.effects=style.effects===0?'off':'on';
 el.style.setProperty('--personal-accent',style.accent);
 el.style.setProperty('--personal-ink',onAccent(style.accent));
 el.style.setProperty('--panel-opacity',`${style.opacity}%`);
 el.style.setProperty('--personal-radius',`${style.radius}px`);
 el.style.setProperty('--user-effects',style.effects/100);
}
