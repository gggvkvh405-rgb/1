// Stable IDs keep themes selected by older releases valid.
const collection = (id,name,effect,colors,items) => ({id,name,effect,colors,items});
export const proceduralCollections=[
 collection('cosmos','Космос','Звёздная пыль',[258,283],[['Фиолетовая туманность',262],['Пепельная луна',223],['Малиновый пульсар',332],['Синие кольца',215],['Медная сверхновая',22],['Розовый спутник',309],['Изумрудная комета',161],['Ультрамарин',235],['Перехват сигнала',186],['Чёрная орбита',251]]),
 collection('summit','Горы','Горный туман',[213,183],[['Синие пики',221],['Фьорд на рассвете',193],['Альпийский закат',292],['Кремневый перевал',32],['Зелёный хребет',150],['Туман и мох',170],['Кровавая вершина',354],['Ледяной рассвет',205],['Сумерки в долине',264],['Над облаками',276]]),
 collection('arcade','Неон','Неоновый импульс',[293,190],[['Вектор 1986',310],['Лазерный горизонт',192],['Синтвейв',273],['Горячий пиксель',12],['Голограмма',169],['Сигнал RGB',256],['Неоновая магистраль',331],['Сумерки аркады',229],['Токийский канал',354],['Протокол 09',209]]),
 collection('ocean','Океан','Водные блики',[184,205],[['Глубокая вода',203],['Светящиеся медузы',296],['Стеклянный риф',176],['Прибой',195],['Коралловый ток',327],['Ночь над шельфом',221],['Утренние волны',160],['Голубая лагуна',186],['Малахитовая бездна',153],['Подводное небо',242]]),
 collection('forest','Лес','Пыльца',[151,94],[['Папоротники',139],['Светлячки',77],['Тропики ночью',168],['Золотые листья',42],['Ночной сад',265],['Хвойный хребет',157],['Дикий шалфей',108],['Тёмная оранжерея',187],['Красный клён',5],['Сумеречные травы',314]]),
 collection('prism','Призмы','Отражения',[274,187],[['Хроматический куб',266],['Янтарь и обсидиан',38],['Спектр',288],['Синее стекло',218],['Розовый кварц',328],['Плазменный осколок',305],['Призраки света',188],['Грань меди',20],['Лайм и бетон',85],['Чернильная грань',234]]),
 collection('deco','Ар-деко','Тёплый отблеск',[40,187],[['Золотой кинозал',39],['Бронзовый вестибюль',27],['Серебряный веер',211],['Бархат и медь',348],['Изумрудный атриум',155],['Цветная эмаль',292],['Мраморная ночь',239],['Синий собор',219],['Чёрный лак',50],['Бордовый театр',330]]),
 collection('ice','Лёд','Снежная вуаль',[189,247],[['Северное сияние',169],['Кристаллическая ночь',254],['Морозный орнамент',197],['Полярный шёпот',222],['Небо Гренландии',205],['Хрустальная пещера',282],['Замёрзший прилив',184],['Снежный замок',233],['Арктический рубин',339],['Белый проход',218]]),
 collection('map','Топография','Радарная разметка',[168,41],[['Рельеф 01',165],['Линия глубины',204],['Вулканическая карта',7],['Карта островов',187],['Кварцевая долина',286],['Моховые контуры',128],['Метроном поля',40],['Северная сетка',226],['Ониксовый атлас',269],['Точка отсчёта',320]]),
 collection('dunes','Пустыня','Песчаная дымка',[27,324],[['Пески Марса',12],['Караван',37],['Розовые дюны',340],['Оранжевая луна',22],['Глиняный каньон',7],['Пыль на горизонте',53],['Бархатные пески',312],['Ночь в пустыне',260],['Белое плато',44],['Жемчужное солнце',293]])
];
export const proceduralThemes=proceduralCollections.flatMap((group,j)=>group.items.map(([name,hue],i)=>({
 id:`theme-${j*10+i}`,name,hue,group:group.id,category:group.name,effect:group.effect,
 alt:(hue+group.colors[1]-group.colors[0]+360)%360,asset:`assets/themes/${j*10+i}.svg`
})));
export const sceneCollections=[
 {id:'anime',name:'Аниме',effect:'Мягкий свет',tags:'anime япония рисованный мультфильм',items:[
  ['anime-train','Последний поезд домой',213,338],['anime-rain','Рамен под дождём',246,323,'anime-rain','Неоновый дождь'],['anime-sky','Небесная обсерватория',257,14]
 ]},
 {id:'cinema',name:'Кино',effect:'Кинематографическая дымка',tags:'фильмы фильм cinema movie кинематограф',items:[
  ['film-observatory','Станция «Затмение»',215,177,'cinema-stars','Далёкие звёзды'],['film-noir','Нуар после полуночи',193,37,'cinema-fog','Дымка'],['film-desert','Дорога сквозь бурю',24,34,'cinema-dust','Песчаная пыль']
 ]},
 {id:'photo',name:'Фотопейзажи',effect:'Атмосферные частицы',tags:'фото фотография природа landscape photo',items:[
  ['photo-coast','Маяк на краю океана',193,170,'photo-fog','Морской туман'],['photo-snow','Домик в снегу',218,38,'photo-snow','Снег'],['photo-macro','После дождя',129,74,'photo-pollen','Светящаяся пыльца']
 ]},
 {id:'fantasy',name:'Фэнтези',effect:'Магические искры',tags:'фантастика fantasy магия',items:[
  ['fantasy-gate','Врата в другой мир',268,156]
 ]}
];
export const sceneThemes=sceneCollections.flatMap(group=>group.items.map(([slug,name,hue,alt,atmosphere=group.id,effect=group.effect])=>({
 id:`scene-${slug}`,name,hue,alt,group:group.id,category:group.name,effect,atmosphere,tags:group.tags,asset:`assets/wallpapers/${slug}.jpg`,art:'scene'
})));
export const collections=[...sceneCollections,...proceduralCollections];
export const visualThemes=[...proceduralThemes,...sceneThemes];
export const classicThemes=[['dark','Тёмная',263],['light','Светлая',250],['oled','OLED',277]].map(([id,name,hue])=>({id,name,hue,group:'classic',category:'Классика',effect:'Без фоновой анимации',alt:hue}));
const byId=new Map([...visualThemes,...classicThemes].map(theme=>[theme.id,theme]));
export const isTheme=id=>byId.has(id);
export const getTheme=id=>byId.get(id)||classicThemes[0];
const browseOrder=[...sceneThemes,...Array.from({length:proceduralThemes.length},(_,i)=>proceduralThemes[(i%10)*10+Math.floor(i/10)])];
export function findThemes(group,query){
 const text=query.trim().toLocaleLowerCase('ru').replaceAll('ё','е');
 return browseOrder.filter(theme=>(!group||theme.group===group)&&(!text||`${theme.name} ${theme.category} ${theme.effect} ${theme.tags||''}`.toLocaleLowerCase('ru').replaceAll('ё','е').includes(text)));
}
