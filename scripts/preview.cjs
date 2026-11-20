const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const {pipeline} = require('node:stream/promises');
const {searchSteam} = require('../core/steam.cjs');
const {parseSource, MAX_JSON} = require('../core/sources.cjs');
const root = path.resolve(__dirname,'../public');
const mime = {'.html':'text/html; charset=UTF-8','.css':'text/css; charset=UTF-8','.js':'text/javascript; charset=UTF-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
let activeSteam = 0;
http.createServer(async (req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 const url = new URL(req.url,'http://preview');
 if (req.method === 'POST' && ['/api/steam','/api/source'].includes(url.pathname)) {
   res.setHeader('Content-Type','application/json; charset=UTF-8');
   try {
     if (req.headers['sec-fetch-site'] === 'cross-site') throw Error('Запрос с другого сайта запрещён.');
     const steam = url.pathname === '/api/steam', limit = steam ? 4096 : 6*MAX_JSON+2;
     let size=0; const body=[];
     for await (const chunk of req){size+=chunk.length;if(size>limit)throw Error('Слишком большой запрос.');body.push(chunk);}
     const data=JSON.parse(Buffer.concat(body).toString());
     let result;
     if (steam) {if(activeSteam>=4)throw Error('Слишком много запросов к Steam.');activeSteam++;try{result=await searchSteam(data);}catch{throw Error('Steam пока недоступен из среды предпросмотра. Попробуйте позже или откройте настольное приложение.');}finally{activeSteam--;}}
     else {if(typeof data!=='string')throw Error('Ожидается текст Hydra JSON.');result=parseSource(data);}
     res.end(JSON.stringify(result));
   } catch(e) {res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
   return;
 }
 if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405).end();return;}
 try {
   const file=path.resolve(root,url.pathname==='/'?'index.html':'.'+decodeURIComponent(url.pathname));
   if(!file.startsWith(root+path.sep)||!mime[path.extname(file)]||!fs.statSync(file).isFile())throw Error();
   res.setHeader('Content-Type',mime[path.extname(file)]);
   if(req.method==='HEAD')res.end();
   else if(path.extname(file)==='.html')res.end(fs.readFileSync(file,'utf8').replace("connect-src 'self';","connect-src 'self' https: http:;"));
   else await pipeline(fs.createReadStream(file),res);
 } catch {if(!res.headersSent)res.writeHead(404).end('Not found');}
}).listen(Number(process.env.PORT)||4173,'0.0.0.0',()=>console.log('ByAzen preview listening'));
