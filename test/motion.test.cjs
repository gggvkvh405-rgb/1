const test=require('node:test');
const assert=require('node:assert/strict');
test('entrances stagger a bounded number of elements and cancel for either motion preference',async()=>{
 const system=new EventTarget();system.matches=false;
 let setting=false;
 global.matchMedia=query=>{assert.match(query,/prefers-reduced-motion/);return system;};
 global.document={documentElement:{classList:{contains:name=>name==='motion-off'&&setting}}};
 try {
  const {reveal,play,syncMotion,motionAllowed}=await import('../public/motion.js');
  const effects=[];
  const el={animate(frames,options){
   let reject;
   const effect={frames,options,finished:new Promise((_,fail)=>{reject=fail;}),canceled:false,cancel(){this.canceled=true;reject(Error('canceled'));}};
   effects.push(effect);return effect;
  }};
  reveal({querySelectorAll:()=>Array(100).fill(el)},'.fixture');
  assert.equal(effects.length,12);assert.equal(effects[1].options.delay,24);assert.equal(effects.at(-1).options.delay,264);
  setting=true;syncMotion();assert.ok(effects.every(e=>e.canceled));
  assert.equal(play(el,[],{}),undefined);
  setting=false;assert.equal(motionAllowed(),true);
  const last=play(el,[],{});system.matches=true;system.dispatchEvent(new Event('change'));
  assert.equal(last.canceled,true);assert.equal(motionAllowed(),false);
 } finally {delete global.matchMedia;delete global.document;}
});
