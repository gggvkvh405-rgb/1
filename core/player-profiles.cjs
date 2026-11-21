const fs=require('node:fs/promises');
const sync=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {directory,withinDirectory,boundedText,samePath}=require('./installed-games.cjs');
const {saveState}=require('./state.cjs');
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const profileId=value=>value==='default'||typeof value==='string'&&UUID.test(value);
const validName=x=>typeof x==='string'?x.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,32):'';
function param(args,key){const prefix=`--${key}=`;const values=args.filter(x=>typeof x==='string'&&x.startsWith(prefix));return values.length===1?values[0].slice(prefix.length):'';}
function playerArg(args){const id=param(args,'byazen-player');return profileId(id)?id:'default';}
function shortcutArg(args){const token=param(args,'byazen-shortcut');return UUID.test(token)?token:'';}
function registry(raw){const ids=new Set();return (Array.isArray(raw)?raw:[]).slice(0,10).filter(r=>UUID.test(r?.id||'')&&validName(r.name)&&!ids.has(r.id)&&ids.add(r.id)).map(r=>({id:r.id,name:validName(r.name)}));}
function startupPlayer(base,args){
 const explicit=args.some(x=>x.startsWith('--byazen-player='));
 let id=playerArg(args);
 if(!explicit){try{const last=path.join(base,'last-player.json'),st=sync.lstatSync(last);if(st.isFile()&&!st.isSymbolicLink()&&st.size<=128){const p=JSON.parse(sync.readFileSync(last,'utf8'));if(profileId(p))id=p;}}catch{}}
 if(id==='default')return {id,path:base};
 const file=path.join(base,'players.json'),st=sync.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>16384)throw Error('Некорректный список игроков.');
 if(!registry(JSON.parse(sync.readFileSync(file,'utf8'))).some(p=>p.id===id))throw Error('Игрок не найден.');
 const root=sync.realpathSync(base),folder=path.join(root,'players',id);
 for(const target of [path.dirname(folder),folder]){const info=sync.lstatSync(target);if(!info.isDirectory()||info.isSymbolicLink()||!samePath(sync.realpathSync(target),target))throw Error('Папка игрока недоступна.');}
 return {id,path:folder};
}
async function readPlayers(base){
 try{return registry(JSON.parse(await boundedText(path.join(base,'players.json'),16*1024)));}
 catch(e){if(e.code==='ENOENT')return [];throw Error('Не удалось прочитать список игроков.');}
}
async function playerPath(base,id,{create=false}={}){
 const root=await directory(base);if(id==='default')return root;if(!profileId(id))throw Error('Игрок не найден.');
 let current=root;for(const part of ['players',id]){const next=path.join(current,part);if(create)await fs.mkdir(next).catch(e=>{if(e.code!=='EEXIST')throw e;});current=await withinDirectory(root,next);}return current;
}
async function createPlayer(base,name){
 const caption=validName(name),players=await readPlayers(base);if(!caption||players.length>=10||players.some(p=>p.name.toLowerCase()===caption.toLowerCase()))throw Error('Укажите неповторяющееся имя. Лимит — 10 дополнительных игроков.');
 const row={id:randomUUID(),name:caption};await playerPath(base,row.id,{create:true});
 saveState(path.join(base,'players.json'),[...players,row]);return row;
}
function shortcutProfile(game,record){
 if(!game||game.id!==record?.game)return null;
 if(record.signature===null)return -1;
 const i=game.profiles.findIndex(p=>JSON.stringify(p)===record.signature);return i>=0?i:null;
}
function rememberPlayer(base,id){if(!profileId(id))throw Error('Игрок не найден.');saveState(path.join(base,'last-player.json'),id);}
module.exports={rememberPlayer,UUID,profileId,playerArg,shortcutArg,readPlayers,startupPlayer,playerPath,createPlayer,shortcutProfile};
