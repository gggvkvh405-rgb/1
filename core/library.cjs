const {playPrefs}=require('../public/play-plans.js');
const path = require('node:path');
const fs = require('node:fs/promises');
const {spawn} = require('node:child_process');
const progressStates=new Set(['planned','playing','finished','shelved']);
function cleanGame(input) {
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 160) throw Error('Укажите название игры (до 160 символов).');
  const collections = [...new Set((Array.isArray(input.collections) ? input.collections : []).filter(s => typeof s === 'string').map(s => s.trim().slice(0, 50)).filter(Boolean))].slice(0, 15);
  const profiles = (Array.isArray(input.profiles) ? input.profiles : []).slice(0, 20).map(p => {
    if (typeof p?.name !== 'string' || !p.name.trim() || !Array.isArray(p.args) || p.args.length > 64 || p.args.some(a => typeof a !== 'string' || a.length > 1024 || a.includes('\0'))) throw Error('Некорректный профиль запуска.');
    return {name: p.name.trim().slice(0, 50), args: p.args};
  });
  return {playPrefs:playPrefs(input.playPrefs),title:input.title.trim(), favorite: input.favorite === true, collections, profiles,
    progress:progressStates.has(input.progress)?input.progress:'',
    rating:Number.isInteger(input.rating)&&input.rating>=1&&input.rating<=10?input.rating:0,
    notes:typeof input.notes==='string'?input.notes.trim().slice(0,4000):'' };
}
async function prepareLaunch(exe, args = [], {platform = process.platform, stat = fs.stat} = {}) {
  if (platform !== 'win32') throw Error('Запуск .exe доступен в Windows.');
  if (typeof exe !== 'string' || !/^[a-z]:\\/i.test(exe) || path.win32.extname(exe).toLowerCase() !== '.exe' || /[\x00-\x1f]/.test(exe)) throw Error('Выберите локальный файл .exe.');
  if (!Array.isArray(args) || args.length > 64 || args.some(a => typeof a !== 'string' || a.length > 1024 || a.includes('\0'))) throw Error('Некорректные аргументы.');
  if (!(await stat(exe).catch(() => null))?.isFile()) throw Error('Файл игры не найден.');
  return {exe, args, options: {cwd:path.win32.dirname(exe), shell:false, detached:true, stdio:'ignore'}};
}
async function launchGame(exe, args) {
  const spec = await prepareLaunch(exe, args);
  return new Promise((resolve,reject) => {
    const child = spawn(spec.exe,spec.args,spec.options);
    child.once('error',reject);
    child.once('spawn', () => {child.unref(); resolve(child);});
  });
}
module.exports = {cleanGame, prepareLaunch, launchGame};
