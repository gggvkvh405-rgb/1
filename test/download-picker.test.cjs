const test=require('node:test');
const assert=require('node:assert/strict');

test('download descriptions hide full URLs and distinguish downloadable magnet formats',async()=>{
 const media=new EventTarget();media.matches=false;
 global.matchMedia=()=>media;
 try {
  const {describeLink}=await import('../public/download-picker.js');
  assert.deepEqual(describeLink('https://example.net/files/game.zip?secret=key'),{label:'HTTP-загрузка',detail:'example.net',supported:true});
  assert.deepEqual(describeLink('magnet:?xt=urn%3Abtih%3A'+'a'.repeat(40)+'&tr='+'z'.repeat(2500)),{label:'BitTorrent',detail:'Magnet · нужна активная раздача',supported:true});
  assert.equal(describeLink('magnet:?xt=urn:btmh:1220'+'a'.repeat(64)).supported,false);
  assert.equal(describeLink('magnet:?xt=urn:btmh:1220'+'a'.repeat(64)+'&xt=urn:btih:'+'b'.repeat(40)).supported,true);
  assert.equal(describeLink('file:///example.zip').supported,false);
 }finally{delete global.matchMedia;}
});
