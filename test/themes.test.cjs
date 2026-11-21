const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const {collections,proceduralCollections,proceduralThemes,sceneCollections,sceneThemes,visualThemes,classicThemes,getTheme,findThemes}=require('../public/themes.js');
const {updateSettings}=require('../core/state.cjs');

test('every stable theme ID maps to its own distinct, locally shipped wallpaper',()=>{
 assert.equal(proceduralThemes.length,100);
 assert.equal(visualThemes.length,110);
 assert.equal(new Set(visualThemes.map(t=>t.name)).size,110);
 const hashes=new Set();
 proceduralThemes.forEach((theme,i)=>{
  assert.equal(theme.id,`theme-${i}`);
  assert.equal(updateSettings({theme:theme.id}).theme,theme.id);
  assert.equal(getTheme(theme.id),theme);
  const svg=readFileSync(join(__dirname,'../public/',theme.asset),'utf8');
  assert.match(svg,/viewBox="0 0 1200 800"/);
  assert.doesNotMatch(svg,/<script\b|\bhref=|foreignObject/i);
  hashes.add(createHash('sha256').update(svg).digest('hex'));
 });
 assert.equal(hashes.size,100);
 assert.equal(getTheme('theme-100').id,'dark');
 assert.equal(classicThemes.length,3);
 assert.ok(classicThemes.every(t=>!t.asset));
});
test('each collection has ten browseable themes and a corresponding atmospheric treatment',()=>{
 const css=readFileSync(join(__dirname,'../public/themes.css'),'utf8');
 assert.equal(collections.length,14);
 assert.equal(new Set(proceduralCollections.map(c=>c.effect)).size,10);
 for(const collection of proceduralCollections){
  const results=findThemes(collection.id,'');
  assert.equal(results.length,10);assert.ok(results.every(t=>t.effect===collection.effect));
  assert.ok(css.includes(`[data-theme-group="${collection.id}"]`));
 }
 assert.deepEqual(findThemes('','  СЕВЕРНОЕ СИЯНИЕ  ').map(t=>t.id),['theme-70']);
 assert.equal(findThemes('ice','замерзший').length,1);
 assert.deepEqual(findThemes('prism','северное сияние'),[]);
 assert.match(css,/prefers-reduced-motion:no-preference/);
 assert.match(css,/html:not\(\.motion-off\) .theme-wall/);
});

test('scene collections retain stable settings IDs and filter anime, cinema, photos and fantasy',()=>{
 const css=readFileSync(join(__dirname,'../public/themes.css'),'utf8');
 const {imageDimensions}=require('../public/wallpaper-store.js');
 assert.deepEqual(sceneCollections.map(c=>findThemes(c.id,'').length),[3,3,3,1]);
 assert.deepEqual(findThemes('','Фильмы').map(t=>t.id),sceneThemes.filter(t=>t.group==='cinema').map(t=>t.id));
 assert.equal(findThemes('','anime').length,3);
 assert.equal(findThemes('','')[0].group,'anime');
 for(const t of sceneThemes){
  assert.equal(updateSettings({theme:t.id}).theme,t.id);
  assert.match(t.asset,/^assets\/wallpapers\/[a-z-]+\.jpg$/);
  assert.ok(css.includes(`[data-theme-group="${t.atmosphere}"]`));
  const dims=imageDimensions(readFileSync(join(__dirname,'../public/',t.asset)));
  assert.equal(dims.width,1376);assert.equal(dims.height,768);
 }
 assert.equal(updateSettings({theme:'scene-remote-fan-art'}).theme,'dark');
});
