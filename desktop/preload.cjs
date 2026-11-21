const {contextBridge,ipcRenderer} = require('electron');
const methods = ['settings','saveSettings','steam','openSteamCharts','openProjectFeedback','sources','auditSources','retrySourceLists','previewFile','previewURL','importSource','replaceSource','sourceAction','searchSources','availability','sourceMatches','sourceGame','openSource','library','chooseExe','saveGame','favorite','removeGame','launchGame','downloads','addDownload','downloadAction'];
const api = Object.fromEntries(methods.map(method => [method, async (...args) => {
  const {value,error} = await ipcRenderer.invoke('byazen',method,args);
  if (error) throw Error(error);
  return value;
}]));
api.onStorageError = callback => { ipcRenderer.on('storage-error',(_,message) => callback(message)); };
contextBridge.exposeInMainWorld('byazen',api);
