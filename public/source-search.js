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
// Shisuy’s Source and similar catalogs append this text before version/build metadata.
const trailingSiteText = /\s+(?:free\s+download|скачать\s+бесплатно)\s*$/iu;
// Unlabelled OnlineFix versions have at least three dotted components. Keep
// standalone sequel numbers, two-component names and year-first dates intact.
const trailingBareVersion = /\s+\d{1,3}(?:\.\d{1,10}){2,4}\s*$/u;
const extraContent = /\s*\+\s*(?:bonus\s+content|бонусные\s+материалы)\s*$/iu;
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
   const without=value.replace(trailingSiteText,'').replace(extraContent,'').replace(taggedDlc,'').replace(trailingTag,'').replace(trailingBareVersion,'').replace(trailingEdition,'');
   if(without===value)break;
   value=without;
  }
  value=value.replace(/[\s.,|:–—/+\-]+$/u,'');
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
// Equivalent names used by storefronts and regional feeds; this is not used to infer sequels.
const equivalentNames=[
 ['Grand Theft Auto V','Grand Theft Auto 5','GTA V','GTA 5'],
 ['Red Dead Redemption 2','Red Dead Redemption II','RDR 2'],
 ['The Witcher 3: Wild Hunt','Ведьмак 3: Дикая Охота'],
 ['Hogwarts Legacy','Хогвартс: Наследие','Хогвартс Легаси'],
 ['Cyberpunk 2077','Киберпанк 2077'],
 ['Baldur’s Gate 3','Baldur’s Gate III','Врата Балдура 3'],
 ['Kingdom Come: Deliverance II','Kingdom Come: Deliverance 2','KCD 2'],
 ['The Elder Scrolls V: Skyrim','The Elder Scrolls 5: Skyrim','TES V: Skyrim','TES 5: Skyrim'],
 ['A Plague Tale: Innocence','Чумная сказка: Невинность']
];
const nameEquivalents=new Map();
for(const titles of equivalentNames){
 const keys=[...new Set(titles.map(sequelKey))];
 for(const key of keys)nameEquivalents.set(key,keys);
}
function accentKey(key){
 return /[a-z\p{Script=Latin}]/u.test(key)&&!/\p{Script=Cyrillic}/u.test(key)?key.normalize('NFD').replace(/\p{M}/gu,''):key;
}
const softKey=text=>accentKey(compact(text.replace(/^(?:the|an|a)\s+/iu,'')));
function titleInfo(text){
 const exact=compact(text), base=stripRelease(text);
 const keys=[base,...bilingual(base)].map(sequelKey).filter(Boolean);
 const aliases=[...new Set(keys.flatMap(key=>[key,accentKey(key),...(nameEquivalents.get(key)||[])]))];
 const soft=softKey(base);
 return {exact,aliases,terms:words(text),soft,numbers:soft.match(/\d+/g)?.join(',')||''};
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
const ruKeys='йцукенгшщзхъфывапролджэячсмитьбюё', enKeys="qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
function otherKeyboard(text){
 const value=normalize(text);
 if(/^[a-z\[\];'`. ,0-9-]+$/.test(value))return [...value].map(c=>ruKeys[enKeys.indexOf(c)]??c).join('');
 if(/^[а-яё .0-9-]+$/u.test(value))return [...value].map(c=>enKeys[ruKeys.indexOf(c)]??c).join('');
 return '';
}
function prepareQuery(raw){
 const query=titleInfo(raw);
 query.tokens=query.terms.map(word=>({word,numeric:/^\d+$/.test(word)}));
 query.joined=query.exact.length>=3&&!/\d$/.test(query.exact);
 return query;
}
function searchScore(doc,query){
 if(doc.exact===query.exact)return 0;
 if(doc.aliases.some(key=>query.aliases.includes(key)||query.exact===key))return 1;
 const allTerms=query.tokens.every(({word,numeric})=>doc.terms.some(token=>numeric?token===word:token.startsWith(word)));
 const joined=query.joined&&doc.exact.includes(query.exact);
 return allTerms||joined?2:-1;
}
function oneEdit(a,b){
 if(Math.abs(a.length-b.length)>1)return false;
 if(a.length>b.length)[a,b]=[b,a];
 let i=0;
 while(i<a.length&&a[i]===b[i])i++;
 if(i===a.length)return true;
 if(a.length!==b.length)return a.slice(i)===b.slice(i+1);
 return a.slice(i+1)===b.slice(i+1)||(a[i]===b[i+1]&&a[i+1]===b[i]&&a.slice(i+2)===b.slice(i+2));
}
function similarTitle(doc,query){
 return query.soft.length>=6&&doc.soft.length>=6&&doc.numbers===query.numbers&&oneEdit(doc.soft,query.soft);
}
function gameRow(source,index){
 const {title,size,date,links}=source.games[index];
 return {title,size,date,links,source:source.name,id:source.id,index};
}
export function searchSources(sources,query='',page=1,sourceId='',mode=''){
 const raw=typeof query==='string'?query.slice(0,200).trim():'';
 const requested=Number.isSafeInteger(page)&&page>=1?page:1, limit=16;
 const active=sources.filter(s=>s.enabled&&(!sourceId||s.id===sourceId));
 const main=prepareQuery(raw), keyboard=otherKeyboard(raw), alternate=keyboard?prepareQuery(keyboard):null;
 const suggestions=mode==='related';
 if(suggestions&&!main.exact)return {games:[],total:0,page:1,pageSize:limit};
 // Browsing all entries does not depend on Steam and does not build a massive array of preceding pages.
 if(!main.exact){
  const feeds=active.map(s=>[s,indexFor(s.games).docs]);
  const total=feeds.reduce((sum,[,docs])=>sum+docs.length,0);
  page=Math.min(requested,Math.max(1,Math.ceil(total/limit)));
  let offset=(page-1)*limit;const games=[];
  for(const [s,docs] of feeds){
   if(offset>=docs.length){offset-=docs.length;continue;}
   for(const {i} of docs.slice(offset,offset+limit-games.length))games.push(gameRow(s,i));
   offset=0;if(games.length===limit)break;
  }
  return {games,total,page,pageSize:limit};
 }
 const rankOf=doc=>{
  const rank=searchScore(doc,main);
  if(rank>=0)return rank;
  if(alternate?.tokens.some(t=>!t.numeric)&&searchScore(doc,alternate)>=0)return 3;
  return similarTitle(doc,main)?4:-1;
 };
 const excluded=new Map(suggestions?active.map(s=>[s,new Set(exactAndRelated(s.games,main).map(m=>m.i))]):[]);
 const counts=[0,0,0,0,0], first=counts.map(()=>[]);
 for(const s of active)for(const doc of indexFor(s.games).docs){
  if(excluded.get(s)?.has(doc.i))continue;
  const rank=rankOf(doc);
  if(rank>=0&&counts[rank]++<limit)first[rank].push([s,doc.i]);
 }
 const total=counts.reduce((a,b)=>a+b,0);
 page=Math.min(requested,Math.max(1,Math.ceil(total/limit)));
 if(page===1)return {games:first.flat().slice(0,limit).map(([s,i])=>gameRow(s,i)),total,page,pageSize:limit};
 const start=(page-1)*limit;
 let before=0;
 const bounds=counts.map(count=>{const a=Math.max(0,start-before), b=Math.min(count,start+limit-before);before+=count;return [a,b];});
 const seen=counts.map(()=>0), found=counts.map(()=>[]);let remaining=Math.min(limit,total-start);
 for(const s of active){
  for(const doc of indexFor(s.games).docs){
   if(excluded.get(s)?.has(doc.i))continue;
   const rank=rankOf(doc);if(rank<0)continue;
   const i=seen[rank]++, [a,b]=bounds[rank];
   if(i>=a&&i<b){found[rank].push(gameRow(s,doc.i));remaining--;if(!remaining)break;}
  }
  if(!remaining)break;
 }
 return {games:found.flat(),total,page,pageSize:limit};
}

// This deliberately uses the same index that manual search and browsing use.
export function searchCoverage(games){
 const {docs}=indexFor(games);
 return {browsable:docs.length,searchable:docs.reduce((n,doc)=>n+Number(Boolean(doc.exact)),0)};
}
