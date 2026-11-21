// Deterministic, network-free backgrounds: npm run themes:art
const fs=require('node:fs');
const path=require('node:path');
const {proceduralThemes}=require('../public/themes.js');
const out=path.resolve(__dirname,'../public/assets/themes');
fs.mkdirSync(out,{recursive:true});
function art(theme,index){
 let seed=(index+1)*30271;
 const r=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const n=(min,max)=>Math.round(min+r()*(max-min));
 const list=(count,fn)=>Array.from({length:count},(_,i)=>fn(i)).join('');
 const color=(h,s,l)=>`hsl(${Math.round((h+360)%360)} ${s}% ${l}%)`;
 const h=theme.hue,a=theme.alt, mode=index%10;
 const base=color(h,52,10),deep=color(h-12,57,5),mid=color(h,57,24),glow=color(h,83,66), pale=color(a,90,81),second=color(a,65,43),edge=color(a,72,61);
 const cx=n(665,1012),cy=n(160,420);
 const line=(d,stroke=glow,w=1,o=1)=>`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" opacity="${o}"/>`;
 const circle=(x,y,rad,fill,o=1)=>`<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}" opacity="${o}"/>`;
 const stars=(count,y=720)=>list(count,i=>circle(n(0,1200),n(0,y),i%12===0?2.3:n(1,2),i%3===0?glow:pale,(n(12,67)/100).toFixed(2)));
 const horizon=(y,amp)=>{let d=`M-20 ${y}`;for(let x=60;x<=1260;x+=60)d+=` L${x} ${y+n(-amp,amp)}`;return d;};
 let shapes='';
 switch(theme.group){
 case 'cosmos': {
  const radius=n(86,177),angle=n(-37,-10), rings=mode%3===1||mode===8;
  shapes=`<ellipse cx="${cx}" cy="${cy}" rx="455" ry="340" fill="url(#halo)"/>${stars(126)}<g transform="rotate(${angle} ${cx} ${cy})">${rings?list(6,i=>`<ellipse cx="${cx}" cy="${cy}" rx="${radius+38+i*13}" ry="${30+i*7}" fill="none" stroke="${i%2?pale:edge}" opacity="${.42-i*.035}"/>`):''}${circle(cx,cy,radius,'url(#orb)')}<g clip-path="url(#planet)">${list(17,i=>line(`M${cx-radius-5} ${cy-radius+i*18} Q${cx} ${cy-radius+i*18+n(-30,60)} ${cx+radius+5} ${cy-radius+i*18+n(-22,12)}`,i%2?second:pale,n(1,8),.14))}</g>${rings?line(`M${cx-radius-61} ${cy} Q${cx} ${cy+93} ${cx+radius+61} ${cy}`,edge,3,.52):''}</g>${mode%2===0?circle(cx+n(-315,-197),cy+n(-143,94),n(14,35),'url(#orb)'):line(`M${cx-410} ${cy-118} l130 -50`,pale,2,.55)}`;
  shapes=shapes.replace('<g clip-path=',`<defs><clipPath id="planet">${circle(cx,cy,radius,'white')}</clipPath></defs><g clip-path=`);
  break;
 }
 case 'summit':
  shapes=`${stars(36,325)}${circle(cx,cy-70,n(38,85),'url(#orb)',.77)}${list(6,i=>{const d=horizon(359+i*61,n(57,110));return `<path d="${d}V820H-20Z" fill="${color(h+i*4,35+i*5,36-i*5)}"/>${i<3?line(d,pale,2,.37):''}`;})}<path d="M0 708Q460 523 1200 672V800H0Z" fill="url(#wash)" opacity=".52"/>`;
  break;
 case 'arcade':{
  const top=325+n(-25,72);shapes=`${stars(47,top)}${circle(cx,top-56,n(76,112),'url(#orb)')}<path d="M0 ${top}H1200V800H0Z" fill="url(#wash)"/>${list(18,i=>line(`M${cx} ${top}L${-970+i*185} 820`,edge,1.8,.52))}${list(14,i=>line(`M0 ${top+i*i*2.8}H1200`,glow,2,.44))}${list(22,()=>{const x=n(-15,1200),w=n(12,65),height=n(17,106);return `<path d="M${x} ${top}v-${height}h${w}v${height}Z" fill="${deep}" stroke="${edge}" stroke-opacity=".52"/>`;})}${line(`M0 ${top}H1200`,pale,3,.68)}`;
  break;
 }
 case 'ocean':
  shapes=`<path d="M0 0H1200V800H0Z" fill="url(#water)"/>${list(9,i=>`<path d="M${n(-100,1000)} 0l${n(25,90)} 0 280 680z" fill="${pale}" opacity=".035"/>`)}${list(19,i=>line(`M-90 ${90+i*43} Q240 ${30+i*43} 520 ${108+i*43} T1290 ${62+i*43}`,i%3?edge:pale,i%3?2:5,.24))}${stars(79)}${list(mode%2?6:3,i=>{const x=n(490,1160),y=n(176,660),w=n(16,55);return `<path d="M${x-w} ${y}q${w} -${2*w} ${2*w} 0Z" fill="url(#orb)" opacity=".78"/>${list(5,j=>line(`M${x-w+10+j*w/3} ${y}q30 36 5 70`,pale,1,.52))}`;})}`;
  break;
 case 'forest':
  shapes=`${circle(cx,cy-25,n(60,122),'url(#orb)',.43)}${list(27,i=>{const x=n(-60,1240),y=n(645,890),tip=x+n(-210,210),height=n(175,580),col=i%3===0?glow:i%2?second:mid;return line(`M${x} ${y}Q${x+70} ${y-height*.6} ${tip} ${y-height}`,col,2,.75)+list(9,j=>{const d=(j+1)/10, px=x*(1-d)+tip*d+40*Math.sin(Math.PI*d), py=y-height*d, reach=n(25,120)*(1-d*.65)*(j%2?1:-1);return `<path d="M${px} ${py}q${reach*.65} ${-30} ${reach} ${-29}q${-reach*.20} ${29} ${-reach} ${29}Z" fill="${col}" opacity="${i%2?.45:.69}"/>`;});})}${stars(90)}`;
  break;
 case 'prism':
  shapes=`${list(18,i=>{const x=n(220,1260),y=n(-95,860),w=n(55,325),t=n(70,430);return `<path d="M${x} ${y}l${w} ${-t*.5} ${w*.34} ${t} ${-w*1.2} ${t*.27}Z" fill="url(#glass${i%2})" stroke="${i%2?edge:pale}" stroke-opacity=".4"/>`;})}${list(19,i=>line(`M${n(10,900)} 830L${n(420,1520)} -40`,edge,1,.23))}`;
  break;
 case 'deco':{
  const x=mode%2?810:750,y=n(429,650);shapes=`${list(8,i=>line(`M${x-335-i*30} 804V${y}A${335+i*30} ${274+i*24} 0 0 1 ${x+335+i*30} ${y}V804`,i%2?edge:pale,i%3?1.5:3,.49))}${list(19,i=>{const t=Math.PI+i*Math.PI/18;return line(`M${x} ${y}L${x+301*Math.cos(t)} ${y+245*Math.sin(t)}`,i%2?glow:pale,1.5,.56);})}${circle(x,y,n(34,60),'url(#orb)')}${list(13,i=>line(`M${i*95} 0V800`,edge,i%2?1:2,.19))}<path d="M0 701H1200V800H0Z" fill="url(#wash)" opacity=".6"/>`;
  break;
 }
 case 'ice':
  shapes=`${list(4,i=>line(`M260 ${235+i*16} C440 ${-30+i*29} 730 ${500+i*17} 1250 ${96+i*35}`,i%2?pale:glow,n(14,36),.16))}${stars(83)}${list(19,i=>{const x=n(-60,1280),y=n(180,850),w=n(42,160),height=n(55,240);return `<path d="M${x-w} ${y}l${w} ${-height} ${w*.52} ${height*.65} ${w*.3} ${height*.48}Z" fill="url(#glass${i%2})" stroke="${pale}" stroke-opacity=".44"/>${line(`M${x} ${y-height}l${-w*.24} ${height*.98}`,pale,1,.42)}`;})}`;
  break;
 case 'map':
  shapes=`${list(25,i=>line(`M${i*50} 0V800M0 ${i*40}H1200`,edge,1,.15))}${list(4,k=>{const x=n(120,1150),y=n(80,750),freq=n(3,6),phase=n(0,18);return list(12,i=>{let d='';const size=26+16*i;for(let j=0;j<48;j++){const t=j*Math.PI/24,R=size*(1+.18*Math.sin(t*freq+phase)+.11*Math.sin(t*2+phase));d+=`${j?'L':'M'}${Math.round(x+R*Math.cos(t)*1.25)} ${Math.round(y+R*Math.sin(t))}`;}return line(d+'Z',i%4?pale:glow,i%4?1:2,i%4?.22:.57);});})}${line(`M${cx-18} ${cy}h36m-18 -18v36`,pale,2,.8)}`;
  break;
 case 'dunes':
  shapes=`${stars(36,325)}${circle(cx,cy-56,n(64,138),'url(#orb)')}${list(7,i=>{const y=370+i*59,d=`M-50 ${y} C${n(40,260)} ${y+n(-180,-35)} ${n(350,580)} ${y+n(50,128)} 742 ${y-20} S1090 ${y-120} 1250 ${y+8}`;return `<path d="${d}V830H-50Z" fill="${color(h+i*3,58-i,37-i*4)}"/>${line(d,edge,1.7,.45)}`;})}`;
  break;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><defs><linearGradient id="bg" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="${base}"/><stop offset="1" stop-color="${deep}"/></linearGradient><radialGradient id="halo"><stop stop-color="${second}" stop-opacity=".66"/><stop offset="1" stop-color="${mid}" stop-opacity="0"/></radialGradient><radialGradient id="orb" cx=".29" cy=".24" r=".85"><stop stop-color="${pale}"/><stop offset=".46" stop-color="${second}"/><stop offset="1" stop-color="${deep}"/></radialGradient><linearGradient id="wash" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></linearGradient><linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${second}"/><stop offset=".44" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></linearGradient><linearGradient id="glass0" x2="1" y2="1"><stop stop-color="${edge}" stop-opacity=".86"/><stop offset=".53" stop-color="${mid}" stop-opacity=".75"/><stop offset="1" stop-color="${deep}" stop-opacity=".86"/></linearGradient><linearGradient id="glass1" x2="0" y2="1"><stop stop-color="${pale}" stop-opacity=".74"/><stop offset="1" stop-color="${mid}" stop-opacity=".66"/></linearGradient></defs><path d="M0 0H1200V800H0Z" fill="url(#bg)"/><ellipse cx="806" cy="287" rx="850" ry="625" fill="url(#halo)"/>${shapes}</svg>\n`;
}
proceduralThemes.forEach((t,i)=>fs.writeFileSync(path.join(out,`${i}.svg`),art(t,i).replace(/(\d+\.\d{3})\d+/g,'$1')));
