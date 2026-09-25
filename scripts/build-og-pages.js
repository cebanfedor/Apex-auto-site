// Генерация превью-картинок (1200×630) для страниц сайта: node scripts/build-og-pages.js
// Результат — assets/og/<имя>.png (коммитится). Лоты/трекинг/каталог рисуются на лету (api/og.js), это — статические страницы.
const fs = require("fs");
const path = require("path");
const {pageCard} = require("../server/og-card");
const A = p => path.join(__dirname, "../assets", p);

const PAGES = {
  index:{k:"ПОД КЛЮЧ ИЗ США И КАНАДЫ", t:"Авто из США и Канады под ключ в Молдову", s:"Расчёт полной стоимости онлайн: Copart, IAAI, Manheim", p:"apexauto.md", img:"hero-bg-v43.jpg"},
  auctions:{k:"КАТАЛОГ АУКЦИОНОВ", t:"Аукционы Copart и IAAI", s:"Поиск по VIN и лоту · фото · расчёт под ключ до Кишинёва", p:"apexauto.md/auctions", img:"hot/honda-accord.jpg"},
  hot:{k:"АВТО В ПУТИ", t:"Продажа авто в пути", s:"Уже куплены и едут в Молдову — можно забронировать", p:"apexauto.md/in-transit", img:"hot/mercedes-e300.jpg"},
  about:{k:"ОСНОВАТЕЛЬ", t:"Федор Чебан", s:"В авто-бизнесе с 2016 года · Copart · IAAI · Manheim", p:"apexauto.md/about", img:"hot/founder-auction.jpg"},
  contacts:{k:"КОНТАКТЫ", t:"Связаться с Apex Auto", s:"Telegram @fedukusa · WhatsApp · 068-832-032", p:"apexauto.md/contacts", img:"hot/founder-auction.jpg"},
  guide:{k:"РУКОВОДСТВО 2026", t:"Как привезти авто из США и Канады в Молдову", s:"Аукцион, доставка, таможня — пошагово", p:"apexauto.md/guide", img:"hot/delivery-sea.jpg"},
  customs:{k:"РАСТАМОЖКА 2026", t:"Растаможка авто в Молдове", s:"Акцизы, таблицы, льготы для EV и гибридов", p:"apexauto.md/customs"},
  tracking:{k:"ОТСЛЕЖИВАНИЕ", t:"Где ваш автомобиль", s:"Введите VIN или номер лота — покажем этапы доставки", p:"apexauto.md/tracking", img:"hot/delivery-sea.jpg"},
  "auction-fees":{k:"СБОРЫ АУКЦИОНОВ", t:"Auction Fee на Copart и IAAI", s:"Из чего состоят сборы и как их посчитать", p:"apexauto.md/auction-fees"},
  blog:{k:"БЛОГ", t:"Блог об авто из США и Канады", s:"Гайды и разборы: реальные цифры и опыт", p:"apexauto.md/blog"},
  damages:{k:"ПОВРЕЖДЕНИЯ", t:"Какие повреждения опасны, а какие нет", s:"Как читать Primary Damage и выбирать выгодные лоты", p:"apexauto.md/damages"},
  shipping:{k:"ДОСТАВКА", t:"Доставка авто из США и Канады", s:"Маршруты, порты и сроки до Кишинёва", p:"apexauto.md/shipping", img:"hot/delivery-sea.jpg"},
  "ship-my-car":{k:"ЛИЧНОЕ АВТО", t:"Отправить свою машину домой в Молдову", s:"Заберём от дома в США и доставим до Кишинёва", p:"apexauto.md/ship-my-car", img:"hot/delivery-sea.jpg"},
  "tesla-model-3":{k:"ПРИМЕР РАСЧЁТА", t:"Tesla Model 3 из США в Молдову", s:"Цена под ключ до Кишинёва", p:"apexauto.md/tesla-model-3"},
  "toyota-rav4":{k:"ПРИМЕР РАСЧЁТА", t:"Toyota RAV4 из США в Молдову", s:"Сколько стоит под ключ и льгота на гибрид", p:"apexauto.md/toyota-rav4"},
  "usa-vs-europe":{k:"СРАВНЕНИЕ", t:"Авто из США или из Европы", s:"Что выгоднее для Молдовы: цены, пробег, растаможка", p:"apexauto.md/usa-vs-europe"},
  "vin-check":{k:"ПРОВЕРКА VIN", t:"Как проверить VIN перед покупкой", s:"Carfax, AutoCheck и красные флаги в истории", p:"apexauto.md/vin-check"},
  cases:{k:"КЕЙСЫ", t:"Реальные машины под ключ", s:"Лот, все расходы и итог для клиента", p:"apexauto.md/cases"},
  privacy:{k:"ДОКУМЕНТЫ", t:"Политика конфиденциальности", s:"Как Apex Auto обрабатывает данные", p:"apexauto.md/privacy"},
  // румынские страницы
  "ro-blog":{k:"BLOG", t:"Blog despre mașini din SUA și Canada", s:"Ghiduri și analize: cifre reale și experiență", p:"apexauto.md/ro/blog"},
  "ro-daune-auto":{k:"DAUNE AUTO", t:"Ce daune sunt periculoase și care nu", s:"Cum alegi loturi avantajoase la licitație", p:"apexauto.md/ro/daune-auto"},
  "ro-ghid-auto-sua":{k:"GHID 2026", t:"Cum aduci o mașină din SUA sau Canada în Moldova", s:"Licitație, livrare, vămuire — pas cu pas", p:"apexauto.md/ro/ghid-auto-sua", img:"hot/delivery-sea.jpg"},
  "ro-taxele-licitatiilor":{k:"TAXELE LICITAȚIILOR", t:"Auction Fee pe Copart și IAAI", s:"Din ce constau taxele și cum le calculezi", p:"apexauto.md/ro/taxele-licitatiilor"},
  "ro-tesla-model-3":{k:"EXEMPLU DE CALCUL", t:"Tesla Model 3 din SUA în Moldova", s:"Prețul la cheie până la Chișinău", p:"apexauto.md/ro/tesla-model-3"},
  "ro-transport-maritim":{k:"LIVRARE", t:"Livrarea auto din SUA și Canada în Moldova", s:"Rute, porturi și termene până la Chișinău", p:"apexauto.md/ro/transport-maritim", img:"hot/delivery-sea.jpg"},
  "ro-transport-masina-personala":{k:"MAȘINA PERSONALĂ", t:"Trimitem mașina dvs. acasă în Moldova", s:"O ridicăm din SUA și o livrăm la Chișinău", p:"apexauto.md/ro/transport-masina-personala", img:"hot/delivery-sea.jpg"},
  "ro-vamuirea-auto":{k:"VĂMUIRE 2026", t:"Vămuirea auto în Moldova", s:"Accize, tabele, scutiri pentru EV și hibride", p:"apexauto.md/ro/vamuirea-auto"},
  "ro-verificare-vin":{k:"VERIFICARE VIN", t:"Cum verifici VIN-ul înainte de cumpărare", s:"Carfax, AutoCheck și semnale de alarmă", p:"apexauto.md/ro/verificare-vin"}
};
(async () => {
  const only = process.argv[2];
  for(const [name, c] of Object.entries(PAGES)){
    if(only && only !== name) continue;
    const png = await pageCard({kicker:c.k, title:c.t, sub:c.s, path:c.p, photoPath:c.img ? A(c.img) : null});
    fs.writeFileSync(path.join(__dirname, "../assets/og", name + ".png"), png);
    console.log(name, png.length);
  }
})();
