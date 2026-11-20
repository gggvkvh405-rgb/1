const entry = (id,title,image,genre,headline,desc) => ({id,title,image,genre,headline,desc,url:`https://store.steampowered.com/app/${id}/`});
export const games = [
 entry(1091500,'Cyberpunk 2077','cyberpunk','Ролевая игра','Cyberpunk','Станьте наёмником в Найт-Сити — мегаполисе, где власть, роскошь и модификации тела меняют правила игры.'),
 entry(1174180,'Red Dead Redemption 2','rdr','Открытый мир','Red Dead Redemption 2','История Артура Моргана и банды Ван дер Линде на закате эпохи Дикого Запада.'),
 entry(1245620,'ELDEN RING','elden','Ролевая игра','Elden Ring','Путешествуйте по Междуземью, откройте его тайны и бросьте вызов полубогам.'),
 entry(1817070,'Marvel’s Spider-Man Remastered','spider','Приключения','Spider-Man Remastered','Защитите Нью-Йорк в роли опытного Человека-паука.'),
 entry(2215430,'Ghost of Tsushima DIRECTOR’S CUT','ghost','Приключения','Ghost of Tsushima','Странствуйте по Цусиме и защищайте остров в роли самурая Дзина Сакая.'),
 entry(3240220,'Grand Theft Auto V Enhanced','gta','Открытый мир','Grand Theft Auto V','Исследуйте Лос-Сантос и округ Блэйн в истории трёх преступников.'),
 entry(1888930,'The Last of Us™ Part I','last','Приключения','The Last of Us Part I','Отправьтесь в опасное путешествие вместе с Джоэлом и Элли.'),
 entry(1145360,'Hades','hades','Рогалик','Hades','Бросьте вызов богу мёртвых и попробуйте вырваться из подземного мира.')
];
export const regions = [['DE','Германия'],['US','США'],['GB','Великобритания'],['FR','Франция'],['PL','Польша'],['CA','Канада'],['UA','Украина'],['KZ','Казахстан'],['BR','Бразилия'],['JP','Япония'],['RU','Россия']];
