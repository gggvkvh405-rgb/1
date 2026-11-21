const {contextBridge,ipcRenderer,webUtils} = require('electron');
const methods = ['settings','saveSettings','steam','steamDetail','steamWishlist','steamWishSave','steamWishRemove','steamWishRefresh','localOnly','players','createPlayer','switchPlayer','officialCheck','officialVerify','openOfficialRelease','playersPlans','savePlayerPlan','removePlayerPlan','exportPlayerPlan','appearanceRuntime','safeAppearance','statusCenter','statusCheck','openSteamCharts','openProjectFeedback','sources','auditSources','retrySourceLists','connectOnlineFix','previewFile','previewURL','importSource','replaceSource','sourceAction','searchSources','availability','sourceMatches','sourceHistory','sourceConfigure','sourceWorkbench','sourceWorkbenchChange','sourceBookmark','sourceExport','sourceBulkPreview','sourceBulkImport','sourceGame','openSource','library','diskReport','cleanupPreview','cleanupApply','migrationExport','migrationPreview','migrationApply','requiredFiles','checkRequired','saveRequired','syncFolder','pickSyncFolder','syncBackups','makeSyncBackup','removeSyncBackup','exportCollection','saveBatch','previewMove','applyMove','screenshots','screenshot','journal','journalChange','notifications','clearNotifications','saveExport','scanLibrary','importInstalledGames','gameFolders','pickGameFolder','openGameFolder','setAutoSaveBackup','listSaveBackups','makeSaveBackup','previewSaveRestore','restoreSaveBackup','deleteSaveBackup','chooseExe','coverCandidates','applyCover','clearCover','gameShortcut','saveGame','favorite','removeGame','launchGame','downloads','downloadInfo','saveDownloadOptions','checkDownload','copyDownloadReport','revealDownload','addDownload','torrentFiles','setTorrentFiles','downloadAction'];
const api = Object.fromEntries(methods.map(method => [method, async (...args) => {
  const {value,error} = await ipcRenderer.invoke('byazen',method,args);
  if (error) throw Error(error);
  return value;
}]));
api.previewDropped=async files=>{
  if(!Array.isArray(files)||files.length>30)throw Error('Перетащите до 30 файлов.');
  const paths=files.map(file=>webUtils.getPathForFile(file)).filter(Boolean);
  const {value,error}=await ipcRenderer.invoke('byazen','previewDrop',[paths]);if(error)throw Error(error);return value;
};
api.onStorageError = callback => { ipcRenderer.on('storage-error',(_,message) => callback(message)); };
api.onNoticeChanged=callback=>{ipcRenderer.on('notice-changed',()=>callback());};
api.onGoSection=callback=>{ipcRenderer.on('go-section',(_,section)=>callback(section));};
api.onAppearanceRuntime=callback=>{ipcRenderer.on('appearance-runtime',(_,state)=>callback(state));};
contextBridge.exposeInMainWorld('byazen',api);
