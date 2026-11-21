// Exact game lookup tolerates recognized release metadata, not arbitrary title prefixes.
const normalize = text => text.replace(/[™®©]/gu,'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').trim();
const words = text => normalize(text).match(/[\p{L}\p{N}]+/gu)||[];
const compact = text => words(text).join('');
const romans = new Map(Object.entries({ii:'2',iii:'3',iv:'4',v:'5',vi:'6',vii:'7',viii:'8',ix:'9'}));
function sequelKey(text){
 const parts=words(text);
 if(parts.length>1&&romans.has(parts.at(-1)))parts[parts.length-1]=romans.get(parts.at(-1));
 return parts.join('');
}
const edition = String.raw`(?:game of the year|goty|ultimate|deluxe|digital deluxe|complete|gold|standard|definitive|premium|enhanced|collector['’]?s|anniversary|special|platinum|полное|золотое|делюкс|коллекционное)\s+(?:edition|издание)`;
const trailingEdition = new RegExp(String.raw`(?:^|\s|\s*[:–—]\s*)${edition}\s*$`,'iu');
const trailingTag = /(?:\s+|\s*[-–—,:]\s*)(?:(?:v(?:er(?:sion)?)?\.?|версия)\s*\d+(?:\.\d+)*[a-z0-9.-]*|(?:build|сборка)\s*#?\s*\d+[a-z0-9.-]*|repack(?:\s+by\s+[\p{L}\p{N}_.-]+(?:\s+[\p{L}\p{N}_.-]+){0,4})?|gog|steamrip|portable|early\s+access|fitgirl(?:\s+repacks?)?|dodi(?:\s+repacks?)?|multi\s*\d+|x64)(?:\s*(?:\+|,)\s*[\p{L}\p{N}][\p{L}\p{N} .#-]*)?$/iu;
const taggedDlc = /\s*\+\s*(?:(?:all|\d+|все)\s*)?(?:dlcs?|дополнения)(?:\s*\+\s*(?:bonus(?:es)?|soundtrack|бонусы))*\s*$/iu;
const releaseMetadata = /^(?:(?:v(?:er(?:sion)?)?\.?|версия)\s*\d|(?:build|сборка)\s*#?\s*\d|\d+\.\d+(?:\.\d+)*\b|(?:repack|репак|rip|portable|early access|scene|gog|steamrip|fitgirl|dodi|xatab|linux|windows|multilingual|multi\s*\d+|x64|x86|rus|eng|русский|английский)\b|(?:19|20)\d{2}\b(?=$|\s*[,|/])|(?:all\s+|\d+\s+)?dlcs?\b(?=$|\s*[,|/+]))/iu;
const editionOnly=new RegExp(`^${edition}$`,'iu');
const blockedRelease = /\b(?:demo|trial|playtest|benchmark|soundtrack|artbook|expansion only|dlc only)\b|(?:демо(?:-версия)?|только (?:dlc|дополнение))/iu;
const asTag = value => {
 const tag=value.trim();
 return releaseMetadata.test(tag)||editionOnly.test(tag)||/^(?:p|l|пиратка|лицензия)$/iu.test(tag);
};
function stripRelease(text){
 let value=normalize(text);
 for(let i=0;i<10;i++){
  const bracket=value.match(/\s*(?:\(([^()]*)\)|\[([^\[\]]*)\]|\{([^{}]*)\})\s*$/u);
  if(bracket&&asTag(bracket[1]??bracket[2]??bracket[3])&&!blockedRelease.test(bracket[0]))value=value.slice(0,bracket.index);
  else {
   const without=value.replace(taggedDlc,'').replace(trailingTag,'').replace(trailingEdition,'');
   if(without===value)break;
   value=without;
  }
  value=value.replace(/[\s,|:–—/+\-]+$/u,'');
 }
 return value;
}
function bilingual(text){
 const parts=text.split(/\s*\/\s*|\s+\|\s+/u);
 const latin=p=>/\p{Script=Latin}/u.test(p)&&!/\p{Script=Cyrillic}/u.test(p);
 const cyr=p=>/\p{Script=Cyrillic}/u.test(p)&&!/\p{Script=Latin}/u.test(p);
 if(parts.length===2&&((latin(parts[0])&&cyr(parts[1]))||(cyr(parts[0])&&latin(parts[1]))))return parts;
 const paired=text.match(/^(.*?)\s*[([]([^()[\]]+)[)\]]$/u);
 if(paired&&((latin(paired[1])&&cyr(paired[2]))||(cyr(paired[1])&&latin(paired[2]))))return paired.slice(1);
 return [];
}
function titleInfo(text){
 const exact=compact(text), base=stripRelease(text);
 const aliases=[...new Set([base,...bilingual(base)].map(sequelKey).filter(Boolean))];
 return {exact,aliases,terms:words(text)};
}
const cache=new WeakMap();
function indexFor(games){
 let index=cache.get(games);
 if(index)return index;
 const docs=[], byKey=new Map();
 games.forEach((game,i)=>{
  if(!game.links?.length||typeof game.title!=='string')return;
  const info=titleInfo(game.title);
  docs.push({i,...info});
  for(const key of new Set([info.exact,...info.aliases]))if(key){
   const items=byKey.get(key);
   if(items)items.push(i);else byKey.set(key,[i]);
  }
 });
 index={docs,byKey};cache.set(games,index);return index;
}
function validTitle(title){return typeof title==='string'&&title.length<=200&&compact(title);}
function exactAndRelated(games,query){
 const {byKey}=indexFor(games), exact=byKey.get(query.exact)||[];
 const found=new Set(exact);
 for(const alias of query.aliases)for(const i of byKey.get(alias)||[])found.add(i);
 // A literal title is always ranked above variants even when the feed lists it last.
 return [...found].map(i=>({i,score:compact(games[i].title)===query.exact?0:1})).sort((a,b)=>a.score-b.score||a.i-b.i);
}
export function sourceMatches(sources,title){
 if(!validTitle(title))return [];
 const query=titleInfo(title);
 return sources.flatMap(({id,name,enabled,games})=>{
  if(!enabled)return [];
  const matched=exactAndRelated(games,query);
  return matched.length?[{id,name,count:matched.length,entries:matched.slice(0,20).map(({i})=>{
   const {title,size,date,links}=games[i];return {index:i,title,size,date,linkCount:links.length};
  })}]:[];
 });
}
export function availability(sources,titles){
 if(!Array.isArray(titles)||titles.length>100)return [];
 const active=sources.filter(s=>s.enabled);
 return [...new Set(titles.filter(validTitle))].map(title=>{
  const {exact,aliases}=titleInfo(title);
  return {title,sources:[...new Set(active.filter(s=>{
   const {byKey}=indexFor(s.games);return byKey.has(exact)||aliases.some(key=>byKey.has(key));
  }).map(s=>s.name))]};
 });
}
function searchScore(doc,query){
 if(!query.terms.length)return 0;
 if(doc.exact===query.exact)return 0;
 if(doc.aliases.some(k=>query.aliases.includes(k)||query.exact===k))return 1;
 const allTerms=query.terms.every(t=>doc.terms.some(w=>/^\d+$/.test(t)?w===t:w.startsWith(t)));
 const joined=doc.exact.includes(query.exact)&&query.exact.length>=3&&!/\d$/.test(query.exact);
 return allTerms||joined?2:-1;
}
export function searchSources(sources,query='',page=1){
 query=titleInfo(typeof query==='string'?query.slice(0,200):'');
 page=Number.isSafeInteger(page)&&page>=1&&page<=10000?page:1;
 const limit=16, offset=(page-1)*limit, buckets=[[],[],[]], counts=[0,0,0];
 for(const s of sources)if(s.enabled)for(const doc of indexFor(s.games).docs){
  const rank=searchScore(doc,query);
  if(rank<0)continue;
  if(counts[rank]++<offset+limit)buckets[rank].push([s,doc.i]);
 }
 const games=[];
 let skip=offset;
 for(let rank=0;rank<buckets.length&&games.length<limit;rank++){
  if(skip>=counts[rank]){skip-=counts[rank];continue;}
  for(const [s,index] of buckets[rank].slice(skip,skip+limit-games.length)){
   const {title,size,date,links}=s.games[index];games.push({title,size,date,links,source:s.name,id:s.id,index});
  }
  skip=0;
 }
 return {games,total:counts.reduce((a,b)=>a+b,0),page,pageSize:limit};
}
