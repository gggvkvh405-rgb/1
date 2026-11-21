const https = require('node:https');
const http = require('node:http');
const dns = require('node:dns/promises');
const ip = require('ipaddr.js');
const {Transform,Writable} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {createGunzip,createInflate,createBrotliDecompress} = require('node:zlib');

function webURL(input) {
  if (typeof input !== 'string' || input.length > 4096 || /[\x00-\x20\x7f]/.test(input)) throw Error('Некорректный URL.');
  const u = new URL(input);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || !u.hostname) throw Error('Требуется HTTP(S) без учётных данных.');
  u.hash = '';
  return u;
}
function isPublic(address) { try { return ip.process(address).range() === 'unicast'; } catch { return false; } }
async function publicAddress(host, addressIndex = 0) {
  const addresses = await dns.lookup(host.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(x => !isPublic(x.address))) throw Error('Локальные и служебные адреса запрещены.');
  return addresses[((addressIndex % addresses.length)+addresses.length)%addresses.length];
}
async function request(input, {headers = {}, signal, validate = () => {}, redirects = 5, addressIndex = 0, connectMs = 12000, idleMs = 18000} = {}) {
  const u = webURL(input);
  validate(u);
  const pinned = await publicAddress(u.hostname,addressIndex);
  signal?.throwIfAborted();
  const res = await new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? https : http).get(u, {
      headers: { 'user-agent': 'ByAzen/1.0', 'accept-encoding': 'identity', ...headers }, signal, agent: false,
      lookup: (_, opts, cb) => opts.all ? cb(null, [pinned]) : cb(null, pinned.address, pinned.family)
    }, resolve);
    const timeout=()=>req.destroy(Object.assign(Error('Сервер не ответил вовремя.'),{code:'ETIMEDOUT'}));
    const connecting=setTimeout(timeout,connectMs); connecting.unref();
    const connected=()=>clearTimeout(connecting);
    req.once('response',connected);req.once('close',connected);
    req.once('socket',socket=>socket.once(u.protocol==='https:'?'secureConnect':'connect',connected));
    req.setTimeout(idleMs,timeout);
    req.on('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
    res.destroy();
    if (!redirects) throw Error('Слишком много перенаправлений.');
    return request(new URL(res.headers.location, u).href, {headers, signal, validate, redirects: redirects - 1,addressIndex,connectMs,idleMs});
  }
  return {res, url: u.href};
}
async function readJSON(res, max, signal) {
  if (res.statusCode !== 200) { res.destroy(); throw Object.assign(Error(`Сервер вернул HTTP ${res.statusCode}.`),{statusCode:res.statusCode,retryAfter:res.headers?.['retry-after']}); }
  const encoding = String(res.headers['content-encoding'] || 'identity').trim().toLowerCase();
  const decoder = Object.hasOwn(decode, encoding) ? decode[encoding] : null;
  if (encoding !== 'identity' && !decoder) {res.destroy(); throw Error('Сервер использовал неподдерживаемое сжатие.');}
  const sizeError = () => Error(`Размер ответа превышает лимит (${Math.round(max/1048576*10)/10} МБ).`);
  const chunks = []; let length = 0, received = 0;
  const compressed = new Transform({transform(chunk,_,cb){
    received+=chunk.length;
    if(received>max)cb(sizeError());else cb(null,chunk);
  }});
  const collect = new Writable({write(chunk,_,cb){
    length+=chunk.length;
    if(length>max)cb(sizeError());else{chunks.push(chunk);cb();}
  }});
  await pipeline(res,...(decoder?[compressed,decoder()]:[]),collect,{signal});
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw Error('Ответ не является корректным JSON. Укажите прямую ссылку на файл.'); }
}
const decode = { gzip:createGunzip, deflate:createInflate, br:createBrotliDecompress };
async function getJSON(url, {max = 4 * 1024 * 1024, signal = AbortSignal.timeout(25000), headers = {}, ...opts} = {}) {
  const {res} = await request(url,{...opts,signal,headers:{'accept-encoding':'gzip, deflate, br',...headers}});
  return readJSON(res,max,signal);
}
module.exports = {webURL, isPublic, publicAddress, request, getJSON, readJSON};
