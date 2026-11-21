// Used only by CI, against a throwaway portable profile and a loopback DevTools port.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const profile=path.resolve('release','ByAzen-data');
const stateFile=path.join(profile,'state.json');
async function seed(){
  const exe=path.join(process.env.SystemRoot,'System32','PING.EXE');await fs.access(exe);
  await fs.mkdir(profile,{recursive:true});
  await fs.writeFile(stateFile,JSON.stringify({appVersion:'1.0.25',settings:{startSection:'journal',theme:'scene-photo-snow',localOnly:true},library:[{id:'fixture',title:'CI session',exe,collections:[],profiles:[{name:'Fixture',args:['-n','3','127.0.0.1']}]}]}));
}
async function smoke(){
  let target;
  for(let i=0;i<20&&!target;i++){
    try{const tabs=await fetch('http://127.0.0.1:9225/json/list',{signal:AbortSignal.timeout(800)}).then(r=>r.json());target=tabs.find(x=>x.url==='byazen://app/'&&x.webSocketDebuggerUrl);}catch{}
    if(!target)await delay(500);
  }
  assert.ok(target,'Electron renderer did not appear on the test port');
  const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let id=0;
  socket.addEventListener('message',({data})=>{const message=JSON.parse(String(data));const task=pending.get(message.id);if(!task)return;pending.delete(message.id);message.error?task.reject(Error(message.error.message)):task.resolve(message.result);});
  try{
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    async function evaluate(expression){
      const i=++id,request=new Promise((resolve,reject)=>pending.set(i,{resolve,reject}));socket.send(JSON.stringify({id:i,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
      const {result,exceptionDetails}=await request;if(exceptionDetails)throw Error(result.description||exceptionDetails.text);return result.value;
    }
    const result=await evaluate(`(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      for(let i=0;i<30&&!document.querySelector('#journal-goal');i++)await wait(100);
      if(!document.querySelector('#journal-goal')||typeof require!=='undefined')throw Error('UI or isolation check failed');
      const api=window.byazen,settings=await api.settings();
      if(!settings.localOnly||!(await api.appearanceRuntime()).localOnly)throw Error('Local mode did not start');
      for(const call of [()=>api.steam({}),()=>api.officialCheck(),()=>api.addDownload('https://example.com/fixture')]){
        const blocked=await call().then(()=>false,e=>e.message.includes('локально'));if(!blocked)throw Error('A network action was not blocked');
      }
      const player=await api.createPlayer('CI second player');
      const shortcuts=[];
      try{
        for(const i of [-1,0])shortcuts.push(await api.gameShortcut('fixture',i));
      }catch(e){throw Error('Could not create Windows shortcut: '+e.message);}
      await api.saveSettings({...settings,personal:{...settings.personal,tray:true}});
      await api.saveSettings({...settings,personal:{...settings.personal,tray:false}});
      const before=await api.appearanceRuntime();if(before.safe||document.documentElement.dataset.theme!=='scene-photo-snow')throw Error('Unexpected initial appearance');
      await api.safeAppearance(true);
      if(document.documentElement.dataset.safeAppearance!=='true')await wait(100);
      if(document.documentElement.dataset.safeAppearance!=='true'||document.documentElement.dataset.theme!=='dark')throw Error('Safe appearance did not use the classic theme');
      await api.safeAppearance(false);
      await api.saveRequired('fixture',['byazen-ci-missing.dat']);
      const files=await api.checkRequired('fixture');
      if(files.length!==2||!files[0].ok||files[1].ok)throw Error('Native required-file check did not distinguish a missing file');
      const health=await api.statusCenter();if(health.storage.status!=='ok')throw Error('Profile storage status is not healthy');
      const prep=await api.cleanupPreview();if(prep.items.length)throw Error('Fixture should not have cleanup candidates');
      await api.journalChange('goal',3);
      await api.launchGame('fixture',0);
      for(let i=0;i<50;i++){
        const {sessions,goal}=await api.journal();
        const s=sessions.find(s=>s.gameId==='fixture'&&!s.manual);
        if(s)return {wall:!!document.querySelector('#theme-wall'),seconds:s.seconds,goal,shortcuts,player};
        await wait(100);
      }
      throw Error('ByAzen did not track the Windows process');
    })()`);
    assert.equal(result.wall,true);assert.ok(result.seconds>=1);assert.equal(result.goal,3);
    const state=JSON.parse(await fs.readFile(stateFile,'utf8'));assert.equal(state.settings.personal.tray,false);assert.equal(state.library[0].lastProfile,JSON.stringify({name:'Fixture',args:['-n','3','127.0.0.1']}));assert.equal(state.journal.goal,3);
    const backups=await fs.readdir(path.join(profile,'update-backups'));
    assert.equal(backups.length,1);const saved=JSON.parse(await fs.readFile(path.join(profile,'update-backups',backups[0]),'utf8'));
    assert.equal(saved.from,'1.0.25');assert.equal(saved.to,require('../package.json').version);assert.equal(saved.settings.theme,'scene-photo-snow');
    const other=JSON.parse(await fs.readFile(path.join(profile,'players',result.player.id,'state.json'),'utf8'));
    assert.equal(other.settings.name,'CI second player');assert.ok(!other.library?.length);
    assert.equal(state.shortcuts.length,2);assert.equal(state.shortcuts[0].signature,null);assert.equal(state.shortcuts[1].signature,state.library[0].lastProfile);
    assert.equal(result.shortcuts.length,2);
    console.log('Windows portable renderer, isolated preload, tray, safe appearance, required files, storage, local-only IPC, player data, pre-update backup, Windows shortcuts and EXE session verified.');
  }finally{socket.close();}
}
const watchdog=setTimeout(()=>{console.error('Windows smoke test timed out');process.exit(1);},30000);
(process.argv[2]==='--seed'?seed():smoke()).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
