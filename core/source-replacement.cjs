const {urlKey}=require('./presets.cjs');
function commitReplacement(sources,id,draft,now=Date.now){
 const index=sources.findIndex(source=>source.id===id);
 if(index<0)throw Error('Источник больше не подключён.');
 const old=sources[index];
 if(!draft||draft.replacementFor!==old||!['url','file'].includes(draft.kind))throw Error('Источник изменился. Откройте предпросмотр повторно.');
 if(!draft.games.length)throw Error('В новом списке нет записей с допустимыми ссылками. Старый список сохранён.');
 if(draft.kind==='url'&&sources.some(s=>s!==old&&s.kind==='url'&&urlKey(s.url)===urlKey(draft.url)))throw Error('Источник с такой ссылкой уже добавлен. Старый список сохранён.');
 const {replacementFor:_,...confirmed}=draft;
 const presetURL=old.presetURL||(old.presetName?old.url:undefined);
 // Replace the object, not just its fields: an old in-flight refresh must not
 // apply to the newly saved source or regenerate the old cache.
 const source={...confirmed,id:old.id,enabled:old.enabled,updated:new Date(now()).toISOString(),...(presetURL?{presetURL}:{})};
 sources[index]=source;
 return source;
}
module.exports={commitReplacement};
