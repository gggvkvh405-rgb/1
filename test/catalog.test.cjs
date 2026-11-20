const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {steamQuery,parseResults,officialProduct}=require('../core/steam.cjs');

test('Steam popularity and multi-tag selectors map to a bounded query',()=>{
 const q=steamQuery({sort_by:'topsellers',tags:'19,21,122,599,701,1685',page:2}).u.searchParams;
 assert.equal(q.get('filter'),'topsellers');assert.equal(q.has('sort_by'),false);
 assert.equal(q.get('tags'),'19,21,122,599,701,1685');assert.equal(q.get('start'),'24');
 assert.equal(steamQuery({tags:Array(11).fill('19').join(',')}).u.searchParams.has('tags'),false);
});
test('Steam metadata keeps observed dates and numeric tag IDs, not placeholders',()=>{
 const make=(id,date,tags)=>`<a class="search_result_row" href="https://store.steampowered.com/app/${id}/" data-ds-tagids='${tags}'><span class="title">Game ${id}</span><div class="search_released">${date}</div></a>`;
 const {games}=parseResults({total_count:2,results_html:make(1,'15 апр. 2024','[19,21,19,"bad",-1]')+make(2,'Скоро','oops')},1);
 assert.equal(games[0].year,2024);assert.deepEqual(games[0].tags,['19','21']);
 assert.equal(games[1].year,null);assert.deepEqual(games[1].tags,[]);
});
test('year and source filters refine only the provided page and do not treat unknown years as valid',async()=>{
 const {refinePage,FIRST_YEAR,LAST_YEAR}=await import('../public/catalog.js');
 const rows=[{title:'A',year:2012},{title:'B',year:2023},{title:'C',year:null}];
 const hits=new Map([['B',['A source']],['C',['A source']]]);
 assert.deepEqual(refinePage(rows,{min:FIRST_YEAR,max:LAST_YEAR,sources:[]},hits),rows);
 assert.deepEqual(refinePage(rows,{min:2015,max:2026,sources:['A source']},hits),[rows[1]]);
 assert.deepEqual(refinePage(rows,{sources:['missing']},hits),[]);
});
test('offline catalog contains only real product links and local art without current prices or stock claims',async()=>{
 const {offlineGames,offlineResults}=await import('../public/catalog.js');
 assert.equal(offlineGames.length,12);
 for(const g of offlineGames){
  assert.equal(officialProduct(g.url),g.url);
  assert.ok(fs.existsSync(path.join(__dirname,'../public',g.image)));
  assert.ok(!Object.hasOwn(g,'price')&&!Object.hasOwn(g,'available'));
 }
 const result=offlineResults({term:'  OPERATION: TANGO ',tags:'21,1685'});
 assert.equal(result.offline,true);assert.equal(result.total,1);assert.equal(result.games[0].title,'Operation: Tango');
 assert.equal(offlineResults({category1:'10'}).games[0].title,'DSX');
});
