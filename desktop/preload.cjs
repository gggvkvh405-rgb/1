const {contextBridge,ipcRenderer} = require('electron');
const methods = ['settings','saveSettings','steam','openSteamCharts','openProjectFeedback','sources','auditSources','retrySourceLists','connectOnlineFix','previewFile','previewURL','importSource','replaceSource','sourceAction','searchSources','availability','sourceMatches','sourceGame','openSource','library','scanLibrary','importInstalledGames','gameFolders','pickGameFolder','openGameFolder','setAutoSaveBackup','listSaveBackups','makeSaveBackup','previewSaveRestore','restoreSaveBackup','deleteSaveBackup','chooseExe','saveGame','favorite','removeGame','launchGame','downloads','downloadInfo','saveDownloadOptions','checkDownload','copyDownloadReport','revealDownload','addDownload','downloadAction'];
const api = Object.fromEntries(methods.map(method => [method, async (...args) => {
  const {value,error} = await ipcRenderer.invoke('byazen',method,args);
  if (error) throw Error(error);
  return value;
}]));
api.onStorageError = callback => { ipcRenderer.on('storage-error',(_,message) => callback(message)); };
contextBridge.exposeInMainWorld('byazen',api);
