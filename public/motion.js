// Keep entrance effects finite, bounded and separate from layout and data updates.
const system = matchMedia('(prefers-reduced-motion: reduce)');
const active = new Set();
const ease = 'cubic-bezier(.2,.75,.24,1)';
const profiles = {
 rise: {from:{opacity:.28,translate:'0 10px'},to:{opacity:1,translate:'0 0'},duration:340},
 slide: {from:{opacity:.38,translate:'-8px 0'},to:{opacity:1,translate:'0 0'},duration:310},
 pop: {from:{opacity:.55,scale:.94},to:{opacity:1,scale:1},duration:300},
 hero: {from:{opacity:.35,scale:1.07},to:{opacity:1,scale:1},duration:680},
 title: {from:{opacity:.35,translate:'-12px 0'},to:{opacity:1,translate:'0 0'},duration:480},
};
export const motionAllowed = () => !system.matches && !document.documentElement.classList.contains('motion-off');
export function syncMotion() {
 if(!motionAllowed())for (const effect of active) effect.cancel();
}
system.addEventListener('change',syncMotion);
export function play(el,frames,timing) {
 if(!motionAllowed()||!el?.animate)return;
 const effect=el.animate(frames,{easing:ease,...timing});
 active.add(effect);
 const clean=()=>active.delete(effect);
 effect.finished.then(clean,clean);
 return effect;
}
export function reveal(root,selector,kind='rise',{limit=12,step=24}={}) {
 if(!root||!motionAllowed())return;
 const {from,to,duration}=profiles[kind];
 // Stagger only the first few visible candidates; very long lists are never all animated.
 [...root.querySelectorAll(selector)].slice(0,limit).forEach((el,i)=>{
  play(el,[from,to],{duration,delay:i*step,fill:'backwards'});
 });
}
export function revealSection(root,section,reason) {
 if(section==='home'){
  if(reason!=='home-tab'){
   reveal(root,'.hero-image','hero');
   reveal(root,'.hero h1,.hero p','title',{step:85});
  }
  if(reason!=='hero'){
   reveal(root,'.tab.selected,.feed-title','slide');
   reveal(root,'.game-grid > .game-card');
  }
  return;
 }
 reveal(root,'.page-head > *, .catalog-top > *','slide',{step:35});
 reveal(root,'.pane,.section-heading,.notice,.empty,.catalog-filters,.pagination','rise',{limit:6,step:35});
 if(section!=='downloads'&&section!=='sources')reveal(root,'.item-list > .list-item','slide');
 if(section==='settings')reveal(root,'.theme-card','pop');
}
