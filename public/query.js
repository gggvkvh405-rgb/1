const tokens=text=>String(text??'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').match(/[\p{L}\p{N}]+/gu)||[];
export function parseQuery(value){
 const raw=typeof value==='string'?value.trim().slice(0,200):'';
 if(!/(?:^|\s)[+-](?=[\p{L}\p{N}"])|"[^"]+"/u.test(raw))return null;
 const terms=[];
 for(const match of raw.matchAll(/(?:^|\s)([+-]?)(?:"([^"]{1,110})"|([^\s"]+))/gu)){
  const words=tokens(match[2]??match[3]);if(words.length)terms.push({exclude:match[1]==='-',words,phrase:match[2]!==undefined});
  if(terms.length>=12)break;
 }
 return terms.length?terms:null;
}
export function matchesQuery(text,conditions){
 const words=Array.isArray(text)?text:tokens(text);
 return conditions.every(({exclude,words:part,phrase})=>{
  const test=phrase?words.some((_,i)=>part.every((v,j)=>words[i+j]===v)):part.every(v=>words.some(w=>/^\d+$/.test(v)?w===v:w.startsWith(v)));
  return exclude?!test:test;
 });
}
export const steamSeed=conditions=>conditions?.find(x=>!x.exclude)?.words.join(' ')||'';
export function matchesLocal(text,raw){const conditions=parseQuery(raw),hay=tokens(text);return conditions?matchesQuery(hay,conditions):tokens(raw).every(v=>hay.some(w=>w.includes(v)));}
