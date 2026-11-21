// User-selected Hydra feeds, not endorsements or verified download links.
const {webURL} = require('./net.cjs');
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
function createPresetSync(sources,read,persist,{concurrency=2,maxAge=24*60*60*1000,now=Date.now}={}) {
  const running=new Map();
  async function refresh(source) {
    if (running.has(source.id)) return running.get(source.id);
    const task=Promise.resolve().then(async()=>{
      try {
        const {name,...parsed}=await read(source.url,PRESET_LIMITS);
        if (sources.includes(source)) Object.assign(source,parsed,{name:source.presetName,updated:new Date(now()).toISOString(),syncError:''});
      } catch (e) {
        if (sources.includes(source)) source.syncError=String(e?.message||'Не удалось прочитать источник.').slice(0,220);
        throw e;
      } finally {
        running.delete(source.id);
        if(sources.includes(source))persist();
      }
    });
    running.set(source.id,task);
    return task;
  }
  async function startup() {
    const pending=sources.filter(s=>s.presetName&&s.enabled&&(!s.updated||now()-Date.parse(s.updated)>=maxAge));
    let index=0;
    await Promise.all(Array.from({length:Math.min(concurrency,pending.length)},async()=>{
      while(index<pending.length){
        const next=pending[index++];
        if(sources.includes(next)&&next.enabled)await refresh(next).catch(()=>{});
      }
    }));
  }
  return {refresh,startup,loading:id=>running.has(id)};
}
module.exports = {PRESETS,PRESET_LIMITS,CUSTOM_SOURCE_LIMIT,urlKey,installPresets,createPresetSync};
