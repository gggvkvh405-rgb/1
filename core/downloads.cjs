const {pipeline} = require('node:stream/promises');
const {Transform} = require('node:stream');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {request, webURL} = require('./net.cjs');

function length(value) { const n = Number(value); return /^\d+$/.test(value || '') && Number.isSafeInteger(n) ? n : null; }
function rangeInfo(status, headers, offset) {
  if (status === 200) return {append:false,total:length(headers['content-length'])};
  if (status !== 206 || !offset) throw Error(`Сервер вернул HTTP ${status}.`);
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(headers['content-range'] || '');
  const start = length(m?.[1]), end = length(m?.[2]), total = length(m?.[3]), size = length(headers['content-length']);
  if (!m || start !== offset || total === null || end === null || end !== total - 1 || start > end || (size !== null && size !== end - start + 1)) throw Error('Сервер вернул неверный диапазон файла.');
  return {append:true,total};
}
function validator(h) { const etag = h.etag; return typeof etag === 'string' && /^"[^\r\n]*"$/.test(etag) ? etag : (typeof h['last-modified'] === 'string' && Number.isFinite(Date.parse(h['last-modified'])) ? h['last-modified'] : ''); }
function nameFromURL(raw) {
  const u = webURL(raw); let base = u.pathname.split('/').pop() || 'download';
  try { base = decodeURIComponent(base); } catch {}
  base = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^[ .]+|[ .]+$/g,'').slice(0,160);
  return !base || /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(base) ? 'download' : base;
}
class DownloadQueue {
  constructor(items, persist, {fetch = request} = {}) {
    this.items = items;
    this.persist = persist;
    this.fetch = fetch;
    this.active = null;
    for (const j of items) if (['queued','running','pausing','canceling'].includes(j.status)) j.status = 'paused';
  }
  list() { return this.items.map(({url, partial, validator, ...shown}) => shown); }
  add(raw, file) {
    const url = webURL(raw).href;
    if (this.items.length >= 200) throw Error('Удалите завершённые записи: в очереди уже 200 загрузок.');
    if (this.items.some(j => j.file.toLowerCase() === file.toLowerCase() && !['done','canceled'].includes(j.status))) throw Error('Этот путь уже используется.');
    const id = randomUUID();
    this.items.unshift({id, url, file, title:path.basename(file), partial:path.join(path.dirname(file), `.byazen-${id}.part`), status:'queued', bytes:0, total:null, validator:'', error:''});
    this.persist(); this.pump();
  }
  async action(id, op) {
    const j = this.items.find(x => x.id === id);
    if (!j) throw Error('Загрузка не найдена.');
    if (this.active?.job === j) {
      if (!['pause','cancel'].includes(op) || j.status !== 'running') throw Error('Действие сейчас недоступно.');
      j.status = op === 'pause' ? 'pausing' : 'canceling';
      this.active.controller.abort();
    } else if (op === 'pause' && j.status === 'queued') j.status = 'paused';
    else if (op === 'cancel' && ['queued','paused','error'].includes(j.status)) { await fsp.rm(j.partial,{force:true}); j.status = 'canceled'; j.bytes = 0; }
    else if (op === 'resume' && ['paused','error','canceled'].includes(j.status)) { j.error = ''; j.status = 'queued'; }
    else if (op === 'remove' && ['done','canceled','error','paused'].includes(j.status)) { await fsp.rm(j.partial,{force:true}); this.items.splice(this.items.indexOf(j),1); }
    else throw Error('Действие сейчас недоступно.');
    this.persist(); this.pump();
  }
  pump() {
    if (this.active) return;
    const j = this.items.findLast(x => x.status === 'queued');
    if (!j) return;
    const controller = new AbortController();
    this.active = {job:j,controller};
    j.status = 'running'; this.persist();
    this.run(j, controller.signal).then(() => {j.status = 'done';}, async err => {
      if (j.status === 'canceling') { await fsp.rm(j.partial,{force:true}); j.status = 'canceled'; j.bytes = 0; }
      else if (j.status === 'pausing') j.status = 'paused';
      else throw err;
    }).catch(err => {j.status = 'error'; j.error = err.message;}).finally(() => {
      this.active = null; this.persist(); this.pump();
    });
  }
  async run(j, signal) {
    const stat = await fsp.lstat(j.partial).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (stat && !stat.isFile()) throw Error('Небезопасный временный путь.');
    const offset = j.validator && stat?.size && stat.size !== j.total ? stat.size : 0;
    const {res} = await this.fetch(j.url, {signal, headers:offset ? {Range:`bytes=${offset}-`, 'If-Range':j.validator} : {}});
    let info;
    try {
      signal.throwIfAborted();
      info = rangeInfo(res.statusCode,res.headers,offset);
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') throw Error('Сжатый ответ загрузки не поддерживается.');
      const nextValidator = validator(res.headers);
      if (info.append && ((nextValidator && nextValidator !== j.validator) || (j.total !== null && j.total !== info.total))) throw Error('Файл на сервере изменился.');
      j.validator = nextValidator || (info.append ? j.validator : '');
      j.total = info.total; j.bytes = info.append ? offset : 0;
      const out = await fsp.open(j.partial, (info.append ? fs.constants.O_APPEND : fs.constants.O_TRUNC) | fs.constants.O_CREAT | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
      this.persist();
      const progress = new Transform({transform(chunk, _, cb) { j.bytes += chunk.length; cb(null,chunk); }});
      await pipeline(res,progress,out.createWriteStream(),{signal});
      if (j.total !== null && j.bytes !== j.total) throw Error('Получен неполный файл.');
      signal.throwIfAborted();
      await fsp.link(j.partial,j.file).catch(async e => {
        if (e.code === 'EEXIST') throw Error('Файл назначения уже существует. Переименуйте или переместите его.');
        if (!['EPERM','ENOTSUP','EXDEV','EOPNOTSUPP','EACCES'].includes(e.code)) throw e;
        await fsp.copyFile(j.partial,j.file,fs.constants.COPYFILE_EXCL);
      });
      await fsp.rm(j.partial,{force:true});
    } catch (error) { res.destroy(); throw error; }
  }
}
module.exports = {DownloadQueue, rangeInfo, nameFromURL};
