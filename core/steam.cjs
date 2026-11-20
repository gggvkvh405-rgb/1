const {load} = require('cheerio');
const {getJSON} = require('./net.cjs');
const PAGE = 24;
const picks = {
  category1: ['998','21','994','10','996','992','993'],
  os: ['win','mac','linux'],
  maxprice: ['free','5','10','15','20','30','40','50','60'],
  sort_by: ['_ASC','Name_ASC','Name_DESC','Released_DESC','Price_ASC','Price_DESC','Reviews_DESC'],
  cc: ['DE','US','GB','FR','PL','CA','UA','KZ','BR','JP','RU'],
};
function steamQuery(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const page = Number.isInteger(raw.page) && raw.page >= 1 && raw.page <= 500 ? raw.page : 1;
  const u = new URL('https://store.steampowered.com/search/results/');
  const q = u.searchParams;
  for (const [key,val] of Object.entries({ query:'', start: (page - 1) * PAGE, count: PAGE, infinite: 1, l: 'russian', cc: 'DE' })) q.set(key, val);
  if (typeof raw.term === 'string' && raw.term.trim()) q.set('term', raw.term.trim().slice(0, 100));
  for (const [key, options] of Object.entries(picks)) if (options.includes(raw[key])) q.set(key, raw[key]);
  if (typeof raw.tags === 'string' && /^\d{1,8}(,\d{1,8}){0,4}$/.test(raw.tags)) q.set('tags', raw.tags);
  if (raw.specials === true) q.set('specials', '1');
  return {u, page};
}
function officialProduct(value) {
  try {
    const u = new URL(value);
    if (u.origin !== 'https://store.steampowered.com' || u.username || u.password) return null;
    const id = u.pathname.match(/^\/(app|sub|bundle)\/(\d{1,12})(?:\/|$)/);
    return id ? `${u.origin}/${id[1]}/${id[2]}/` : null;
  } catch { return null; }
}
function steamImage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && ['shared.fastly.steamstatic.com','shared.akamai.steamstatic.com','shared.cloudflare.steamstatic.com','cdn.akamai.steamstatic.com','cdn.cloudflare.steamstatic.com','cdn.fastly.steamstatic.com','store.akamai.steamstatic.com','store.cloudflare.steamstatic.com','store.fastly.steamstatic.com','steamcdn-a.akamaihd.net'].includes(u.hostname) ? u.href : ''; } catch { return ''; }
}
function parseResults(data, page) {
  if (typeof data?.results_html !== 'string' || !Number.isFinite(Number(data.total_count)) || data.total_count == null || data.success === false || data.success === 0) throw Error('Steam вернул неожиданный ответ.');
  const $ = load(data.results_html);
  const games = [];
  $('.search_result_row').each((_, el) => {
    const item = $(el), url = officialProduct(item.attr('href')), title = item.find('.title').first().text().trim();
    if (!url || !title) return;
    const price = item.find('.discount_final_price').first().text().trim() || item.find('.search_price').first().text().trim();
    games.push({url,title,image:steamImage(item.find('.search_capsule img').first().attr('src')),price, discount:item.find('.discount_pct').first().text().trim()});
  });
  return {games, total: Math.max(0, Number(data.total_count)), page, pageSize: PAGE};
}
async function searchSteam(filters) {
  const {u,page} = steamQuery(filters);
  const json = await getJSON(u.href, {max: 2_000_000, validate: x => { if (x.origin !== u.origin) throw Error('Неожиданное перенаправление Steam.'); }});
  return parseResults(json,page);
}
module.exports = {steamQuery, officialProduct, steamImage, parseResults, searchSteam};
