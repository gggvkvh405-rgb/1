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
