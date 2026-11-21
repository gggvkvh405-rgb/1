const fs = require('node:fs');
const path = require('node:path');
const {gameKey} = require('./sources.cjs');
const defaults = {name:'Игрок', theme:'dark', motion:false, region:'DE'};
function updateSettings(raw = {}) {
  return {name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0,32) : defaults.name,
    theme: typeof raw.theme === 'string' && /^(dark|light|oled|theme-(?:[0-9]|[1-9][0-9]))$/.test(raw.theme) ? raw.theme : defaults.theme,
    motion: raw.motion === true, region: ['DE','US','GB','FR','PL','CA','UA','KZ','BR','JP','RU'].includes(raw.region) ? raw.region : defaults.region};
}
function readState(file) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch(e) { if (e.code !== 'ENOENT') throw Error('Не удалось прочитать файл данных: ' + e.message); }
  return {settings:updateSettings(data.settings), library:data.library || [], sources:data.sources || [], sourcePresetRevision:data.sourcePresetRevision || 0, downloads:data.downloads || []};
}
function saveState(file,data) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file+'.tmp',JSON.stringify(data),{mode:0o600});
  fs.renameSync(file+'.tmp',file);
}
function sourcesSummary(sources) { return sources.map(({games,...source}) => ({...source, count:games.length})); }
function searchSources(sources, query = '', page = 1) {
  const key = typeof query === 'string' ? query.slice(0,200).trim().toLowerCase() : '';
  page = Number.isSafeInteger(page) && page >= 1 && page <= 10000 ? page : 1;
  const limit = 16, games = []; let total = 0;
  for (const {enabled, name, games:items, id} of sources) if (enabled) for (const [index,game] of items.entries()) {
    if (!game.title.toLowerCase().includes(key)) continue;
    if (total >= (page-1)*limit && games.length < limit) games.push({title:game.title, size:game.size, date:game.date, links:game.links, source:name, id,index});
    total++;
  }
  return {games,total,page,pageSize:limit};
}
function availability(sources, titles) {
  if (!Array.isArray(titles) || titles.length > 100) return [];
  const requested = new Map(titles.filter(x => typeof x === 'string' && x.length <= 200).map(x => [gameKey(x),{title:x,sources:[]} ]));
  for (const s of sources) if (s.enabled) {
    const matched = new Set();
    for (const g of s.games) { const key = gameKey(g.title); if (requested.has(key)) matched.add(key); }
    for (const key of matched) requested.get(key).sources.push(s.name);
  }
  return [...requested.values()];
}
const MATCHES_PER_SOURCE = 20;
function sourceMatches(sources,title) {
  if (typeof title !== 'string' || title.length>200) return [];
  const key=gameKey(title);
  if (!key) return [];
  const grouped=[];
  for (const {id,name,enabled,games} of sources) {
    if (!enabled) continue;
    const entries=[]; let count=0;
    for (const [index,game] of games.entries()) {
      if (gameKey(game.title)!==key || !game.links.length) continue;
      count++;
      if (entries.length<MATCHES_PER_SOURCE) entries.push({index,title:game.title,size:game.size,date:game.date,linkCount:game.links.length});
    }
    if (count) grouped.push({id,name,entries,count});
  }
  return grouped;
}
function readSourceGame(sources,id,index,title) {
  const src=sources.find(s=>s.enabled&&s.id===id);
  const game=Number.isSafeInteger(index)&&index>=0?src?.games[index]:null;
  if (!game || game.title!==title || !game.links.length) throw Error('Источник изменился или отключён. Откройте игру повторно.');
  return {...game,source:src.name,id:src.id,index};
}
module.exports = {defaults,updateSettings,readState,saveState,searchSources,availability,sourcesSummary,sourceMatches,readSourceGame};
