const test=require('node:test');
const assert=require('node:assert/strict');
const {sourceMatches,readSourceGame}=require('../core/state.cjs');
const game=(title,size='')=>({title,size,date:'',links:['https://example.org/test.zip']});
const group=(id,name,enabled,games)=>({id,name,enabled,games});

test('catalog matches the same normalized title in all enabled sources, with no fuzzy alternatives',()=>{
 const data=[group('a','Первый',true,[game('Unrelated'),game('Test™: Game','1 GB'),game('Test: Game 2')]),group('b','Второй',true,[game('Test Game','2 GB')]),group('c','Отключён',false,[game('Test Game')])];
 const match=sourceMatches(data,'Test Game');
 assert.deepEqual(match.map(x=>[x.id,x.name,x.count]),[['a','Первый',1],['b','Второй',1]]);
 assert.deepEqual(match[0].entries,[{index:1,title:'Test™: Game',size:'1 GB',date:'',linkCount:1}]);
 assert.deepEqual(readSourceGame(data,'a',1,'Test™: Game'),{...data[0].games[1],source:'Первый',id:'a',index:1});
 assert.equal(sourceMatches(data,'Test').length,0);
 assert.throws(()=>readSourceGame(data,'c',0,'Test Game'),/отключён/);
 assert.throws(()=>readSourceGame(data,'a',1,'Unrelated'),/изменился/);
});

test('download chooser bounds variants per source and fetches URLs only after a selection',()=>{
 const many=Array.from({length:28},(_,i)=>game('Test Game',`${i} GB`));
 const results=sourceMatches([group('a','Первый',true,many)],'Test Game');
 assert.equal(results[0].count,28);assert.equal(results[0].entries.length,20);
 assert.ok(results[0].entries.every(x=>!Object.hasOwn(x,'links')));
 assert.deepEqual(sourceMatches([],null),[]);
 assert.throws(()=>readSourceGame([group('a','Первый',true,many)],'a',-1,'Test Game'));
});

test('catalog accepts release annotations, translated names and Roman sequels with exact variants first',()=>{
 const {availability}=require('../core/state.cjs');
 const sources=[group('a','Первый',true,[game('Cyberpunk 2077: Ultimate Edition (v2.31 + DLC) [Repack by Example]'),game('Cyberpunk 2077™'),game('Cyberpunk 2077: Phantom Liberty'),game('Cyberpunk 2077 [Demo]')]),
  group('b','Второй',true,[game('Cyberpunk 2077 / Киберпанк 2077 [RUS/ENG] (2020)'),game('Red Dead Redemption II - Build 12345'),game('Red Dead Redemption III [v1.0]')])];
 const cyber=sourceMatches(sources,'Cyberpunk 2077');
 assert.deepEqual(cyber.map(s=>s.entries.map(e=>e.index)),[[1,0],[0]]);
 assert.deepEqual(sourceMatches(sources,'Киберпанк 2077').map(s=>s.id),['b']);
 assert.deepEqual(sourceMatches(sources,'Red Dead Redemption 2').map(s=>s.entries[0].index),[1]);
 assert.equal(sourceMatches(sources,'Red Dead Redemption').length,0);
 assert.deepEqual(availability(sources,['Cyberpunk 2077','Red Dead Redemption 2','Red Dead Redemption','Киберпанк 2077']),[
  {title:'Cyberpunk 2077',sources:['Первый','Второй']},{title:'Red Dead Redemption 2',sources:['Второй']},{title:'Red Dead Redemption',sources:[]},{title:'Киберпанк 2077',sources:['Второй']}
 ]);
});

test('metadata stripping does not match stand-alone DLC or different named games',()=>{
 const data=[group('a','Source',true,[game('Game 2: Official Soundtrack'),game('Game 2 [v1.1 + DLC Only]'),game('Game 2 [Demo]'),game('Game 2 Remastered'),game('Game 20 [v1.0]'),game('Game 2 - The Sequel')])];
 assert.deepEqual(sourceMatches(data,'Game 2'),[]);
});

test('manual source search ranks across feeds and paginates without losing matching source indexes',()=>{
 const {searchSources}=require('../core/state.cjs');
 const rows=[game('Portal 20'),game('Portal 2 Extra Maps'),...Array.from({length:16},()=>game('Portal 2 [Build 1234]')),game('Portal 2')];
 const s=group('a','Источник',true,rows), data=[s,group('b','Отключён',false,[game('Portal 2')])];
 const first=searchSources(data,'portal: 2',1), second=searchSources(data,'PORTAL 2',2);
 assert.equal(first.total,18);assert.equal(first.games[0].index,18);assert.deepEqual(second.games.map(g=>g.index),[17,1]);
 assert.equal(searchSources(data,'portal maps').games[0].title,'Portal 2 Extra Maps');
 s.games=[game('Different game')];assert.equal(searchSources(data,'portal').total,0);
});
