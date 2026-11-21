const {contextBridge,ipcRenderer} = require('electron');
const methods = ['settings','saveSettings','steam','steamDetail','steamWishlist','steamWishSave','steamWishRemove','steamWishRefresh','appearanceRuntime','safeAppearance','statusCenter','statusCheck','openSteamCharts','openProjectFeedback','sources','auditSources','retrySourceLists','connectOnlineFix','previewFile','previewURL','importSource','replaceSource','sourceAction','searchSources','availability','sourceMatches','sourceHistory','sourceConfigure','sourceWorkbench','sourceWorkbenchChange','sourceBookmark','sourceExport','sourceBulkPreview','sourceBulkImport','sourceGame','openSource','library','diskReport','cleanupPreview','cleanupApply','migrationExport','migrationPreview','migrationApply','requiredFiles','checkRequired','saveRequired','syncFolder','pickSyncFolder','syncBackups','makeSyncBackup','removeSyncBackup','exportCollection','saveBatch','previewMove','applyMove','screenshots','screenshot','journal','journalChange','notifications','clearNotifications','saveExport','scanLibrary','importInstalledGames','gameFolders','pickGameFolder','openGameFolder','setAutoSaveBackup','listSaveBackups','makeSaveBackup','previewSaveRestore','restoreSaveBackup','deleteSaveBackup','chooseExe','saveGame','favorite','removeGame','launchGame','downloads','downloadInfo','saveDownloadOptions','checkDownload','copyDownloadReport','revealDownload','addDownload','downloadAction'];
const api = Object.fromEntries(methods.map(method => [method, async (...args) => {
  const {value,error} = await ipcRenderer.invoke('byazen',method,args);
  if (error) throw Error(error);
  return value;
}]));
api.onStorageError = callback => { ipcRenderer.on('storage-error',(_,message) => callback(message)); };
api.onNoticeChanged=callback=>{ipcRenderer.on('notice-changed',()=>callback());};
api.onGoSection=callback=>{ipcRenderer.on('go-section',(_,section)=>callback(section));};
api.onAppearanceRuntime=callback=>{ipcRenderer.on('appearance-runtime',(_,state)=>callback(state));};
contextBridge.exposeInMainWorld('byazen',api);
