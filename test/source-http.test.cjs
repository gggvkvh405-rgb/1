const test=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {gzipSync,brotliCompressSync,deflateSync}=require('node:zlib');
const {readJSON}=require('../core/net.cjs');
const {parseSource}=require('../core/sources.cjs');
const response=(bytes,encoding='identity',statusCode=200)=>Object.assign(Readable.from([bytes]),{statusCode,headers:{'content-encoding':encoding}});
const fixture={name:'Test source',downloads:[{title:'Example game',uris:['https://example.org/download.zip','magnet:?xt=urn:btih:'+'a'.repeat(40)]}]};
const bytes=Buffer.from('\uFEFF'+JSON.stringify(fixture));
test('source JSON can be served uncompressed, gzip, Brotli or deflate without changing its records',async()=>{
 for(const [encoding,body] of [['identity',bytes],['gzip',gzipSync(bytes)],['br',brotliCompressSync(bytes)],['deflate',deflateSync(bytes)]]){
  const parsed=parseSource(await readJSON(response(body,encoding),4096));
  assert.equal(parsed.name,'Test source');assert.deepEqual(parsed.games[0].links,fixture.downloads[0].uris);
 }
});
test('source HTTP errors, HTML and oversized responses are rejected before import',async()=>{
 await assert.rejects(readJSON(response(Buffer.from('<html>denied</html>')),4096),/JSON/);
 await assert.rejects(readJSON(response(bytes,'identity',403),4096),/403/);
 await assert.rejects(readJSON(response(bytes,'unknown'),4096),/сжатие/);
 const bomb=gzipSync(Buffer.from(JSON.stringify({name:'a'.repeat(20000),downloads:[]})));
 assert.ok(bomb.length<1024);
 await assert.rejects(readJSON(response(bomb,'gzip'),1024),/лимит/);
 await assert.rejects(readJSON(response(bytes),32),/лимит/);
});

test('a compressed source above the old cap fits the source-specific cap, but not the default',async()=>{
 const {PRESETS,presetLimits,PRESET_LIMITS}=require('../core/presets.cjs');
 const url=PRESETS.find(x=>x[0]==='xatab')[2];
 const payload=gzipSync(Buffer.from(JSON.stringify({...fixture,padding:'x'.repeat(25*1048576)})));
 await assert.rejects(readJSON(response(payload,'gzip'),PRESET_LIMITS.maxBytes),/лимит/);
 const limit=presetLimits(url);
 assert.equal(parseSource(await readJSON(response(payload,'gzip'),limit.maxBytes),limit).games.length,1);
});
