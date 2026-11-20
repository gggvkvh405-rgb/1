const https = require('node:https');
const http = require('node:http');
const dns = require('node:dns/promises');
const ip = require('ipaddr.js');

function webURL(input) {
  if (typeof input !== 'string' || input.length > 4096 || /[\x00-\x20\x7f]/.test(input)) throw Error('Некорректный URL.');
  const u = new URL(input);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || !u.hostname) throw Error('Требуется HTTP(S) без учётных данных.');
  u.hash = '';
  return u;
}
function isPublic(address) { try { return ip.process(address).range() === 'unicast'; } catch { return false; } }
async function publicAddress(host) {
  const addresses = await dns.lookup(host.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(x => !isPublic(x.address))) throw Error('Локальные и служебные адреса запрещены.');
  return addresses[0];
}
async function request(input, {headers = {}, signal, validate = () => {}, redirects = 5} = {}) {
  const u = webURL(input);
  validate(u);
  const pinned = await publicAddress(u.hostname);
  signal?.throwIfAborted();
  const res = await new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? https : http).get(u, {
      headers: { 'user-agent': 'ByAzen/1.0', 'accept-encoding': 'identity', ...headers }, signal, agent: false,
      lookup: (_, opts, cb) => opts.all ? cb(null, [pinned]) : cb(null, pinned.address, pinned.family)
    }, resolve);
    req.setTimeout(18000, () => req.destroy(Error('Сервер не ответил вовремя.')));
    req.on('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
    res.destroy();
    if (!redirects) throw Error('Слишком много перенаправлений.');
    return request(new URL(res.headers.location, u).href, {headers, signal, validate, redirects: redirects - 1});
  }
  return {res, url: u.href};
}
async function getJSON(url, {max = 4 * 1024 * 1024, ...opts} = {}) {
  const {res} = await request(url, {...opts, signal: opts.signal || AbortSignal.timeout(25000)});
  if (res.statusCode !== 200) { res.destroy(); throw Error(`Сервер вернул HTTP ${res.statusCode}.`); }
  const chunks = []; let length = 0;
  for await (const chunk of res) {
    length += chunk.length;
    if (length > max) { res.destroy(); throw Error('Размер ответа превышает лимит.'); }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw Error('Ответ не является корректным JSON.'); }
}
module.exports = {webURL, isPublic, request, getJSON};
