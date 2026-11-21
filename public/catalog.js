import {parseQuery,matchesQuery} from './query.js';
// Steam search accepts both these groups as store tag IDs.
export const genres = [
 ['19','Экшен'],['21','Приключения'],['122','Ролевые игры'],['9','Стратегии'],['492','Инди'],
 ['599','Симуляторы'],['597','Казуальные игры'],['701','Спорт'],['699','Гонки'],['1667','Хоррор'],
 ['1664','Головоломки'],['11014','Интерактивная литература'],['1716','Рогалики'],['493','Ранний доступ']
];
export const tags = [
 ['3871','2D'],['4191','3D'],['1625','Платформер'],['3964','Пиксельная графика'],['1695','Открытый мир'],
 ['3859','Многопользовательские'],['1685','Кооператив'],['4182','Для одного игрока'],['1774','Шутер'],
 ['1742','Сюжетная игра'],['3834','Исследование'],['1693','Классика'],['1721','Психологический хоррор'],
 ['1670','4X'],['1741','Пошаговая стратегия'],['4166','Атмосферная'],['49213','Сурвайвал-крафт в открытом мире']
];
export const sorts = [['','По релевантности'],['topsellers','По популярности (лидеры продаж)'],['Released_DESC','Сначала новые'],['Reviews_DESC','По отзывам'],['Name_ASC','Название: А–Я'],['Name_DESC','Название: Я–А'],['Price_ASC','Сначала дешевле'],['Price_DESC','Сначала дороже']];
export const properties = [
 ['category1','Тип товара',[['','Все товары'],['998','Игры'],['21','DLC'],['994','Демо'],['10','Программы'],['996','Саундтреки'],['992','Видеоролики']]],
 ['os','Платформа',[['','Все платформы'],['win','Windows'],['mac','macOS'],['linux','Linux']]],
 ['maxprice','Цена',[['','Любая цена'],['free','Бесплатно'],...['5','10','20','30','40','60'].map(n=>[n,`До ${n} (порог Steam)`])]]
];
export const FIRST_YEAR = 1970;
export const CLASSIC_UNTIL = 2014;
export const LAST_YEAR = Math.max(2026,new Date().getFullYear());
export const normalize = value => String(value??'').normalize('NFKC').toLocaleLowerCase('ru').trim();

const seed = (id,title,art,year,marks,type='998') => ({
 url:`https://store.steampowered.com/app/${id}/`, title, image:`assets/catalog/${art}.jpg`, year, tags:marks.split(' '), type
});
// Editorial list shown only when the live catalog is unavailable. No prices or sale data.
export const offlineGames = [
 seed(1335790,'Operation: Tango','tango',2021,'21 597 1685 1664'),
 seed(2788040,'Another Try 2','another',null,'19 21 492 3859 493'),
 seed(209100,'Resident Evil: Operation Raccoon City','raccoon',2012,'19 1774 1667'),
 seed(385760,'NBA 2K17','nba',2016,'701 599'),
 seed(24880,'The Saboteur™','saboteur',2024,'19 21 1695 4182'),
 seed(256370,'MXGP - The Official Motocross Videogame','mxgp',2014,'699 599 701'),
 seed(2683150,'Ale & Tale Tavern','tavern',2024,'19 21 597 492 599 1685'),
 seed(297130,'Titan Souls','titan',2015,'19 21 492 3871 3964'),
 seed(1812620,'DSX','dsx',2022,'','10'),
 seed(2193490,'First Cut: Samurai Duel','firstcut',2024,'19 492 3871 3964'),
 seed(1029780,'Going Medieval','medieval',null,'492 122 599 9'),
 seed(1151340,'Fallout 76','fallout',2020,'19 122 1695 3859')
];
export function offlineResults(filters) {
 const term=normalize(filters.term),conditions=parseQuery(filters.term), chosen=String(filters.tags||'').split(',').filter(Boolean);
 const found=offlineGames.filter(g=>(conditions?matchesQuery(g.title,conditions):normalize(g.title).includes(term))&&(!(filters.hideAddons||filters.category1)||g.type===(filters.hideAddons?'998':filters.category1))&&(!filters.coop||filters.coop==='9'&&g.tags.includes('1685'))&&!filters.comingSoon&&chosen.every(id=>g.tags.includes(id)));
 if(filters.sort_by==='Name_ASC'||filters.sort_by==='Name_DESC') found.sort((a,b)=>a.title.localeCompare(b.title,'ru')*(filters.sort_by==='Name_ASC'?1:-1));
 if(filters.sort_by==='Released_DESC') found.sort((a,b)=>(b.year||0)-(a.year||0));
 return {games:found,total:found.length,page:1,pageSize:24,offline:true};
}
export function refinePage(rows, local = {}, matches = new Map()) {
 const min=local.min??FIRST_YEAR, max=local.max??LAST_YEAR, wanted=local.sources||[];
 const useYears=min!==FIRST_YEAR||max!==LAST_YEAR;
 return rows.filter(g=>(!useYears||(Number.isInteger(g.year)&&g.year>=min&&g.year<=max))&&
  (!wanted.length||matches.get(g.title)?.some(x=>wanted.includes(x))));
}
export function catalogMeta(game) {
 const selected=new Set(game.tags||[]);
 const list=genres.filter(([id])=>selected.has(id)).map(([,name])=>name);
 if(!list.length) list.push(...tags.filter(([id])=>selected.has(id)).slice(0,4).map(([,name])=>name));
 if(game.type==='10') list.push('Утилиты');
 if(game.year) list.push(String(game.year));
 return list;
}
