const fs = require('node:fs');
const path = require('node:path');
const {searchSources,availability,sourceMatches} = require('../public/source-search.js');
const {isTheme}=require('../public/themes.js');
const defaults = {name:'Игрок', theme:'dark', motion:false, region:'DE'};
function updateSettings(raw = {}) {
  return {name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0,32) : defaults.name,
    theme: isTheme(raw.theme) ? raw.theme : defaults.theme,
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
function readSourceGame(sources,id,index,title) {
  const src=sources.find(s=>s.enabled&&s.id===id);
  const game=Number.isSafeInteger(index)&&index>=0?src?.games[index]:null;
  if (!game || game.title!==title || !game.links.length) throw Error('Источник изменился или отключён. Откройте игру повторно.');
  return {...game,source:src.name,id:src.id,index};
}
module.exports = {defaults,updateSettings,readState,saveState,searchSources,availability,sourcesSummary,sourceMatches,readSourceGame};
