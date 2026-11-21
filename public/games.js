const entry = (id,title,image,headline,desc) => ({id,title,image,headline,desc,url:`https://store.steampowered.com/app/${id}/`});
export const games = [
 entry(1091500,'Cyberpunk 2077','cyberpunk','Cyberpunk 2077','Cyberpunk 2077 — приключенческая ролевая игра с открытым миром, действие которой происходит в футуристическом мегаполисе Найт-Сити, где выше всего ценятся власть, роскошь и модификации тела.'),
 entry(1174180,'Red Dead Redemption 2','rdr','Red Dead Redemption 2','История Артура Моргана и банды Ван дер Линде на закате эпохи Дикого Запада.'),
 entry(1245620,'ELDEN RING','elden','Elden Ring','Путешествуйте по Междуземью, откройте его тайны и бросьте вызов полубогам.'),
 entry(1817070,'Marvel’s Spider-Man Remastered','spider','Spider-Man Remastered','Защитите Нью-Йорк в роли опытного Человека-паука.'),
 entry(2638890,'Onimusha: Way of the Sword','onimusha','Onimusha: Way of the Sword','Путешествие самурая по Киото, населённому демонами Гэнма.'),
 entry(993090,'Lossless Scaling','lossless','Lossless Scaling','Утилита масштабирования изображения и генерации кадров.'),
 entry(2215430,'Ghost of Tsushima DIRECTOR’S CUT','ghost','Ghost of Tsushima','Странствуйте по Цусиме и защищайте остров в роли самурая Дзина Сакая.'),
 entry(271590,'Grand Theft Auto V','gta','Grand Theft Auto V','Исследуйте Лос-Сантос и округ Блэйн в истории трёх преступников.'),
 entry(1888930,'The Last of Us™ Part I','last','The Last of Us Part I','Отправьтесь в опасное путешествие вместе с Джоэлом и Элли.'),
 entry(3764200,'Resident Evil Requiem','re9','Resident Evil Requiem','История Грейс Эшкрофт и Леона Кеннеди о возвращении к тайнам Раккун-Сити.'),
 entry(322170,'Geometry Dash','geometry','Geometry Dash','Перепрыгивайте препятствия в ритм музыки.'),
 entry(3164500,'Schedule I','schedule','Schedule I','Градостроительный криминальный симулятор в Хайленд-Пойнт.')
];
// Editorial rotation, not a Steam sales or player ranking. Monday UTC starts the week.
export function weeklyGames(now=Date.now()) {
 const week = Math.floor((now - Date.UTC(1970,0,5)) / 604800000);
 const pool = games.filter(g=>g.id!==993090), start = ((week * 3) % pool.length + pool.length) % pool.length;
 return pool.slice(start).concat(pool.slice(0,start)).slice(0,8);
}
export const achievements = new Set([1091500,1174180,1245620,1817070,2215430,271590,1888930,322170]);
export const regions = [['DE','Германия'],['US','США'],['GB','Великобритания'],['FR','Франция'],['PL','Польша'],['CA','Канада'],['UA','Украина'],['KZ','Казахстан'],['BR','Бразилия'],['JP','Япония'],['RU','Россия']];
