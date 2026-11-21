// User-selected Hydra feeds, not endorsements or verified download links.
const {webURL} = require('./net.cjs');
const {retryable}=require('./feed-reader.cjs');
const REVISION = 1;
const CUSTOM_SOURCE_LIMIT = 20;
const PRESET_LIMITS = {maxBytes:24 * 1024 * 1024,maxEntries:50000};
const PRESETS = [
  ['onlinefix-cloud','OnlineFix · hydralinks.cloud','https://hydralinks.cloud/sources/onlinefix.json'],
  ['rutracker-linux','RuTracker Linux','https://wkeynhk.online/rutrackerlinux.json'],
  ['freetp','FreeTP','https://hydrasources.su/freetp.json'],
  ['erotorrent','EroTorrent','https://raw.githubusercontent.com/s0d4lite52spb/sodalite-hydralinks/refs/heads/main/erotorrent.ru_list.json'],
  ['tapochek','Tapochek','https://hydrasources.su/sources/tapochek.json'],
  ['gog','GOG · Hydra Sources','https://hydrasources.su/sources/gog.json'],
  ['shisuy','Shisuy’s Source','https://raw.githubusercontent.com/Shisuiicaro/source/refs/heads/main/shisuyssource.json'],
  ['kazumi','Fonte Kazumi','https://hydrasources.su/sources/fontekazumi.json'],
  ['xatab','Xatab','https://hydrasources.su/sources/xatab.json'],
  ['onlinefix-su','OnlineFix · hydrasources.su','https://hydrasources.su/sources/onlinefix.json'],
  ['kaoskrew','KaOsKrew','https://hydrasources.su/sources/kaoskrew.json'],
  ['fitgirl','FitGirl','https://hydrasources.su/sources/fitgirl.json'],
  ['dodi','DODI','https://hydrasources.su/sources/dodi.json'],
  ['rutor','RuTor','https://wkeynhk.online/rutor.json'],
  ['hydra','Hydra Sources · hydra.json','https://hydrasources.su/hydra.json'],
  ['rutracker','RuTracker · All Categories','https://raw.githubusercontent.com/KekitU/rutracker-hydra-links/main/all_categories.json'],
  ['steamrip','SteamRIP','https://hydrasources.su/sources/steamrip.json'],
  ['atop','ATOP Games','https://hydrasources.su/sources/atop-games.json']
];
const [ONLINEFIX_KEY,ONLINEFIX_NAME,ONLINEFIX_URL]=PRESETS.find(item=>item[0]==='onlinefix-su');
const isPrimaryOnlineFix=s=>s.kind==='url'&&urlKey(s.url)===ONLINEFIX_URL;
function prioritizeOnlineFix(sources){
 const index=sources.findIndex(isPrimaryOnlineFix);
 return index>0?[sources[index],...sources.slice(0,index),...sources.slice(index+1)]:sources;
}
function connectOnlineFix(sources){
 let source=sources.find(isPrimaryOnlineFix);
 if(!source){
  const base=`preset-${ONLINEFIX_KEY}`;
  let id=base, number=2;
  while(sources.some(s=>s.id===id))id=`${base}-${number++}`;
  source={id,kind:'url',url:ONLINEFIX_URL,name:ONLINEFIX_NAME,presetName:ONLINEFIX_NAME,enabled:true,games:[],updated:''};
  sources.push(source);
 }
 source.enabled=true;
 source.presetName=ONLINEFIX_NAME;
 source.name=ONLINEFIX_NAME;
 return source;
}
const XATAB_URL=PRESETS.find(item=>item[0]==='xatab')[2];
const XATAB_LIMITS={maxBytes:64 * 1024 * 1024,maxEntries:125000};
function presetLimits(url){return urlKey(url)===XATAB_URL?XATAB_LIMITS:PRESET_LIMITS;}
function urlKey(raw) {
  try {
    const url = webURL(raw);
    if (url.hostname === 'raw.githubusercontent.com') url.pathname = url.pathname.replace(/^(\/[^/]+\/[^/]+)\/refs\/heads\//,'$1/');
    return url.href;
  } catch { return ''; }
}
function installPresets(data) {
  if (data.sourcePresetRevision >= REVISION) return false;
  const byURL = new Map(data.sources.filter(s=>s.kind==='url').map(s=>[urlKey(s.url),s]));
  for (const [key,name,url] of PRESETS) {
    const existing=byURL.get(urlKey(url));
    if (existing) existing.presetName=name; // Preserve ID, enabled state and cached games.
    else data.sources.push({id:`preset-${key}`,kind:'url',name,presetName:name,url,enabled:true,games:[],updated:''});
  }
  data.sourcePresetRevision=REVISION;
  return true;
}
const managedURL=s=>s.kind!=='file'&&(s.presetName||s.presetURL);
function createPresetSync(sources,read,persist,{concurrency=2,maxAge=24*60*60*1000,now=Date.now}={}) {
  const running=new Map();
  async function refresh(source) {
    if (running.has(source)) return running.get(source);
    const task=Promise.resolve().then(async()=>{
      try {
        const {name,...parsed}=await read(source.url,presetLimits(source.presetURL||source.url));
        if(!sources.includes(source))return;
        if(!parsed.games.length)throw Error('В списке нет записей с допустимыми ссылками. Сохранённые данные не изменены.');
        Object.assign(source,parsed,{name:source.presetName||name,updated:new Date(now()).toISOString(),syncError:'',transientFailure:false});
      } catch (e) {
        if (sources.includes(source)) Object.assign(source,{syncError:String(e?.message||'Не удалось прочитать источник.').slice(0,220),transientFailure:retryable(e?.cause||e)});
        throw e;
      } finally {
        running.delete(source);
        if(sources.includes(source))persist();
      }
    });
    running.set(source,task);
    return task;
  }
  async function runBatch(pending) {
    pending=prioritizeOnlineFix(pending);
    let index=0;
    await Promise.all(Array.from({length:Math.min(concurrency,pending.length)},async()=>{
      while(index<pending.length){
        const next=pending[index++];
        if(sources.includes(next)&&next.enabled)await refresh(next).catch(()=>{});
      }
    }));
  }
  const startup=()=>runBatch(sources.filter(s=>managedURL(s)&&s.enabled&&(!s.updated||s.syncError||now()-Date.parse(s.updated)>=maxAge)));
  const retryFailed=()=>runBatch(sources.filter(s=>managedURL(s)&&s.enabled&&(!s.updated||s.syncError)));
  const retryTransient=()=>runBatch(sources.filter(s=>managedURL(s)&&s.enabled&&s.transientFailure));
  return {refresh,startup,retryFailed,retryTransient,loading:id=>running.has(sources.find(s=>s.id===id))};
}
module.exports = {PRESETS,PRESET_LIMITS,presetLimits,managedURL,CUSTOM_SOURCE_LIMIT,urlKey,installPresets,createPresetSync,isPrimaryOnlineFix,prioritizeOnlineFix,connectOnlineFix};
