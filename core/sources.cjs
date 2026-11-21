const {webURL} = require('./net.cjs');
const MAX_JSON = 4 * 1024 * 1024;
const line = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function sourceLink(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x20\x7f]/.test(value)) throw Error('Недопустимая ссылка.');
  if (value.startsWith('magnet:?')) {
    const pairs = new URL(value).searchParams.getAll('xt');
    if (!pairs.some(x => /^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$|^urn:btmh:1220[a-f0-9]{64}$/i.test(x))) throw Error('Некорректный magnet.');
    return value;
  }
  return webURL(value).href;
}
function parseSource(input, {maxBytes=MAX_JSON,maxEntries=10000}={}) {
  if (typeof input === 'string') {
    if (Buffer.byteLength(input) > maxBytes) throw Error(`Максимальный размер JSON — ${maxBytes / 1048576} МБ.`);
    try { input = JSON.parse(input.replace(/^\uFEFF/, '')); } catch { throw Error('Некорректный JSON.'); }
  }
  if (!input || !line(input.name, 100) || !Array.isArray(input.downloads)) throw Error('Ожидается Hydra JSON с полями name и downloads.');
  if (input.downloads.length > maxEntries) throw Error(`Превышен лимит записей в источнике (${maxEntries}).`);
  let skipped = 0, ignoredLinks = 0;
  const games = [];
  for (const entry of input.downloads) {
    const title = line(entry?.title, 200);
    if (!title || !Array.isArray(entry.uris) || entry.uris.length > 100) { skipped++; continue; }
    const links = new Set();
    for (const uri of entry.uris) { try { links.add(sourceLink(uri)); } catch { ignoredLinks++; } }
    if (!links.size) { skipped++; continue; }
    games.push({ title, links: [...links], size: line(entry.fileSize, 60), date: Number.isFinite(Date.parse(entry.uploadDate)) ? new Date(entry.uploadDate).toISOString() : '' });
  }
  return {name: line(input.name, 100), games, skipped, ignoredLinks};
}
module.exports = {parseSource, sourceLink, MAX_JSON};
