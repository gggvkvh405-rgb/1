export const transferStages={connecting:'Подключение',metadata:'Поиск участников','waiting-metadata':'Ожидаем метаданные',pieces:'BitTorrent · обмен данными',transfer:'Передача файла',saving:'Сохранение',verifying:'Проверка SHA-256'};
export const transferStatuses={queued:'В очереди',running:'Скачивается',paused:'На паузе',pausing:'Останавливается',canceling:'Отменяется',canceled:'Отменено',scheduling:'Пауза по расписанию',removing:'Удаляется',error:'Ошибка',done:'Завершено'};
export function humanBytes(n){if(n==null)return 'Размер неизвестен';const units=['Б','КБ','МБ','ГБ','ТБ'],p=n>0?Math.max(0,Math.min(4,Math.floor(Math.log(n)/Math.log(1024)))):0;return (n/1024**p).toLocaleString('ru',{maximumFractionDigits:p?1:0})+' '+units[p];}
export function humanEta(seconds){
 if(!Number.isSafeInteger(seconds)||seconds<1)return '';
 if(seconds<60)return `${seconds} сек`;
 if(seconds<3600)return `${Math.ceil(seconds/60)} мин`;
 if(seconds<86400)return `${Math.floor(seconds/3600)} ч ${Math.floor(seconds%3600/60)} мин`;
 return `${Math.ceil(seconds/86400)} дн`;
}
export const isHistory=item=>item.status==='done'||item.status==='canceled';
export function transferLabel(item,allowed){
 if(item.status==='queued'){if(!allowed)return 'Ждёт времени загрузки';return item.position?`В очереди · №${item.position}`:'В очереди';}
 return item.status==='running'&&transferStages[item.phase]||transferStatuses[item.status]||item.status;
}
export function rateLabel({telemetry,status,phase}){
 if(status!=='running'||!telemetry||!['pieces','transfer'].includes(phase))return '';
 const eta=humanEta(telemetry.eta);
 return `${humanBytes(telemetry.speed)}/с${eta?' · осталось ≈ '+eta:''}`;
}
export function discoveryLabel({diagnostic,status}){
 if(!diagnostic||!['running','error','paused'].includes(status))return '';
 const {peers,peakPeers,trackers,trackerReplies,dht}=diagnostic;
 return `Участники: ${peers}${peakPeers>peers&&status!=='running'?` (было до ${peakPeers})`:''} · ${trackers?`Трекеры: ${trackers}, ответов: ${trackerReplies}`:'Нет поддерживаемых трекеров в ссылке'} · DHT: ${dht?'есть отклик':'нет отклика'}`;
}
