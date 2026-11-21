const {searchCoverage}=require('../public/source-search.js');

function sourceCoverage(parsed){
 const skipped=parsed.skipped||0, accepted=parsed.games.length;
 return {total:accepted+skipped,accepted,skipped,ignoredLinks:parsed.ignoredLinks||0,...searchCoverage(parsed.games)};
}
// Examine every connected list, including disabled ones, without changing preferences,
// updating the saved cache, or requesting the game URLs listed inside a feed.
async function auditSources(sources,read){
 const snapshot=sources.map(s=>({...s})), rows=new Array(snapshot.length);
 let next=0;
 async function worker(){
  while(next<snapshot.length){
   const i=next++, source=snapshot[i];
   const cached=sourceCoverage(source);
   const base={name:source.name,enabled:source.enabled,kind:source.kind,cached};
   try{
    const parsed=await read(source);
    rows[i]={...base,status:'ok',current:sourceCoverage(parsed)};
   }catch(e){
    rows[i]={...base,status:'error',error:String(e?.message||'Не удалось прочитать источник.').slice(0,220)};
   }
  }
 }
 await Promise.all(Array.from({length:Math.min(2,snapshot.length)},worker));
 return rows;
}
module.exports={sourceCoverage,auditSources};
