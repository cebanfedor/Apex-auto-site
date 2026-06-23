(function(){
  const SUPPORTED = ["ru","ro","en"];
  const DEFAULT_LANG = "ru";
  const STORAGE_KEY = "apexAutoLang";

  function normalizeLang(value){
    const lang = String(value || "").toLowerCase();
    if(lang.startsWith("ro") || lang.startsWith("mo")) return "ro";
    if(lang.startsWith("en")) return "en";
    if(lang.startsWith("ru")) return "ru";
    return "";
  }

  function getLang(){
    const params = new URLSearchParams(window.location.search);
    const queryLang = normalizeLang(params.get("lang"));
    if(queryLang) return queryLang;

    const savedLang = normalizeLang(localStorage.getItem(STORAGE_KEY));
    if(savedLang) return savedLang;

    const browserLangs = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for(const item of browserLangs){
      const lang = normalizeLang(item);
      if(lang) return lang;
    }
    return DEFAULT_LANG;
  }

  const dict = {
    ro:{
      "Доставка авто из США и Канады в Молдову":"Livrare auto din SUA și Canada în Moldova",
      "Главная":"Principală",
      "Горячие предложения":"Oferte recomandate",
      "Моя история":"Povestea mea",
      "Контакты":"Contacte",
      "Рассчитайте полную стоимость автомобиля до Кишинёва":"Calculează costul complet al mașinii până la Chișinău",
      "Цена покупки автомобиля, аукционные сборы, доставка, страховка, таможенные платежи и сопровождение сделки — в одном понятном расчете.":"Prețul mașinii, taxele de licitație, transportul, asigurarea, vama și asistența într-un singur calcul clar.",
      "Рабочий инструмент APEX AUTO":"Instrument de lucru APEX AUTO",
      "Используем этот калькулятор для расчетов клиентам перед покупкой":"Folosim acest calculator pentru estimări înainte de cumpărare",
      "Перед ставкой на аукционе вы заранее видите ориентировочную стоимость автомобиля под ключ: покупка, доставка, таможня и обязательные расходы.":"Înainte de licitație vezi din timp costul estimativ la cheie: achiziție, livrare, vamă și cheltuieli obligatorii.",
      "Ссылка на лот с аукциона":"Link către lotul de la licitație",
      "Вставьте ссылку Copart / IAAI / Manheim":"Introduceți linkul Copart / IAAI / Manheim",
      "Разобрать":"Analizează",
      "Отправить лот на проверку":"Trimite lotul la verificare",
      "Аукцион":"Licitație",
      "Локация аукциона":"Locația licitației",
      "Выбери локацию":"Alege locația",
      "Тип транспортного средства":"Tip vehicul",
      "Тип топлива":"Tip combustibil",
      "Седан":"Sedan",
      "Кроссовер":"Crossover",
      "Внедорожник":"SUV",
      "Пикап":"Pickup",
      "Мото":"Moto",
      "Квадро / ATV":"ATV",
      "Бензин":"Benzină",
      "Гибрид":"Hibrid",
      "Плагин гибрид":"Plug-in hybrid",
      "Электро":"Electric",
      "Дизель":"Diesel",
      "Стоимость лота, $":"Cost lot, $",
      "Аукционный сбор, $":"Taxă licitație, $",
      "Объем двигателя, л":"Volum motor, l",
      "Год производства":"An fabricație",
      "Порт отправки":"Port expediere",
      "Доставка по суше, $":"Transport SUA, $",
      "Страховка 1% от стоимости лота":"Asigurare 1% din costul lotului",
      "Экспортные документы +$400":"Documente export +$400",
      "Показать итог:":"Afișează totalul:",
      "Дополнительно":"Suplimentar",
      "Курс USD → MDL MAIB":"Curs USD → MDL MAIB",
      "Курс EUR → MDL MAIB":"Curs EUR → MDL MAIB",
      "Обновить расчет":"Actualizează calculul",
      "Локация не выбрана":"Locația nu este aleasă",
      "Итого":"Total",
      "Расчет предварительный.":"Calcul preliminar.",
      "Финальную сумму нужно проверить перед покупкой.":"Suma finală trebuie verificată înainte de cumpărare.",
      "Сопровождение APEX AUTO":"Asistență APEX AUTO",
      "Подбор и проверка лота, бесплатная проверка Carfax, участие в торгах, оформление документов, организация доставки и сопровождение автомобиля до выдачи.":"Selectarea și verificarea lotului, verificare Carfax gratuită, participare la licitație, acte, livrare și asistență până la predarea mașinii.",
      "Скопировать расчет":"Copiază calculul",
      "Поделиться расчетом":"Trimite calculul",
      "Оценка лота":"Evaluarea lotului",
      "Торговая рекомендация":"Recomandare de licitare",
      "Рынок Молдовы от, $":"Piața Moldovei de la, $",
      "Рынок Молдовы до, $":"Piața Moldovei până la, $",
      "Ремонт от, $":"Reparație de la, $",
      "Ремонт до, $":"Reparație până la, $",
      "Желаемая экономия, $":"Economia dorită, $",
      "AI оценить ставку":"AI estimează oferta",
      "Экономия при покупке авто":"Economie la cumpărarea mașinii",
      "Автомобили из США и Канады выгоднее на 20–35% чем на местном рынке":"Mașinile din SUA și Canada pot fi cu 20–35% mai avantajoase decât pe piața locală",
      "Получить подбор автомобилей":"Primește o selecție de mașini",
      "Имя":"Nume",
      "Телефон":"Telefon",
      "Бюджет":"Buget",
      "Какой автомобиль ищете? Например: BMW X5, Tesla Model Y, Porsche Macan":"Ce mașină căutați? De exemplu: BMW X5, Tesla Model Y, Porsche Macan",
      "Заявка откроется готовым сообщением в Telegram.":"Cererea se va deschide ca mesaj pregătit în Telegram.",
      "БЕСПЛАТНАЯ ПРОВЕРКА АВТОМОБИЛЯ":"VERIFICARE GRATUITĂ A MAȘINII",
      "Не уверены, стоит ли покупать этот автомобиль?":"Nu sunteți sigur dacă merită cumpărată această mașină?",
      "Отправить на проверку":"Trimite la verificare",
      "Ответим в Telegram в рабочее время.":"Răspundem pe Telegram în timpul programului.",
      "ГОРЯЧИЕ ПРЕДЛОЖЕНИЯ":"OFERTE RECOMANDATE",
      "Авто, которые выгодно привозить под ключ":"Mașini avantajoase pentru import la cheie",
      "Telegram-канал Apex Auto":"Canalul Telegram Apex Auto",
      "Смотреть все лоты":"Vezi toate loturile",
      "Новые лоты ежедневно":"Loturi noi zilnic",
      "Реальные цены покупки":"Prețuri reale de achiziție",
      "Расчет стоимости под ключ":"Calcul cost la cheie",
      "Смотреть примеры":"Vezi exemple",
      "Отправить заявку":"Trimite cerere",
      "Цена в Молдове":"Preț în Moldova",
      "Экономия":"Economie",
      "Под ключ":"La cheie",
      "от":"de la",
      "С 2016 года":"Din 2016",
      "в автомобильном бизнесе":"în domeniul auto",
      "новый бренд на базе накопленного опыта":"brand nou bazat pe experiență acumulată",
      "2000+ авто":"2000+ mașini",
      "привезены клиентам":"livrate clienților",
      "подбор, торги, документы и логистика":"selectare, licitații, acte și logistică",
      "Telegram канал: @fedukauto":"Canal Telegram: @fedukauto",
      "WhatsApp: 068-832-032":"WhatsApp: 068-832-032",
      "Позвонить":"Sună",
      "Написать в Telegram":"Scrie pe Telegram",
      "Прямой контакт":"Contact direct",
      "Федор Чебан":"Fedor Ceban",
      "Расчет, подбор, проверка лота":"Calcul, selecție, verificare lot",
      "Удобно для документов и фото":"Convenabil pentru acte și poze",
      "Звонок":"Apel",
      "Если вопрос срочный":"Dacă este urgent",
      "Telegram-канал":"Canal Telegram",
      "Лоты, примеры покупок и цены":"Loturi, exemple de achiziții și prețuri",
      "ЧТО МОЖНО ОТПРАВИТЬ":"CE PUTEȚI TRIMITE",
      "Для быстрого расчета достаточно 2-3 деталей":"Pentru un calcul rapid sunt suficiente 2-3 detalii",
      "Телефон или Telegram":"Telefon sau Telegram",
      "Автомобиль или ссылка на лот":"Mașină sau link către lot",
      "Коротко опишите задачу: расчет, подбор, проверка VIN, покупка под ключ":"Descrieți pe scurt: calcul, selecție, verificare VIN, cumpărare la cheie",
      "Отправить запрос":"Trimite solicitarea",
      "Откроется готовое сообщение в Telegram.":"Se va deschide un mesaj pregătit în Telegram.",
      "Автомобили, которые выгодно привозить из США и Канады":"Mașini avantajoase de importat din SUA și Canada",
      "Все авто":"Toate",
      "Гибриды":"Hibride",
      "Премиум":"Premium",
      "Ориентир под ключ":"Estimare la cheie",
      "Посмотреть примеры":"Vezi exemple",
      "ВАЖНО":"IMPORTANT",
      "Это ориентир, а не фиксированная цена":"Este o estimare, nu un preț fix",
      "Перейти к калькулятору":"Mergi la calculator",
      "За Apex Auto стоит не просто компания, а человек с реальным опытом":"În spatele Apex Auto nu este doar o companie, ci un om cu experiență reală",
      "10+ лет":"10+ ani",
      "в автомобильной сфере":"în domeniul auto",
      "7+ лет":"7+ ani",
      "ежедневной работы с аукционами США":"lucru zilnic cu licitațiile din SUA",
      "20–50 авто":"20–50 mașini",
      "ежемесячно покупаю для клиентов":"cumpărate lunar pentru clienți",
      "опыт работы со страховыми и дилерскими аукционами":"experiență cu licitații de asigurări și dealer"
    },
    en:{
      "Доставка авто из США и Канады в Молдову":"Car delivery from the USA and Canada to Moldova",
      "Главная":"Home",
      "Горячие предложения":"Recommended lots",
      "Моя история":"My story",
      "Контакты":"Contacts",
      "Рассчитайте полную стоимость автомобиля до Кишинёва":"Calculate the full cost of a car to Chisinau",
      "Цена покупки автомобиля, аукционные сборы, доставка, страховка, таможенные платежи и сопровождение сделки — в одном понятном расчете.":"Purchase price, auction fees, shipping, insurance, customs and deal support in one clear calculation.",
      "Рабочий инструмент APEX AUTO":"APEX AUTO working tool",
      "Используем этот калькулятор для расчетов клиентам перед покупкой":"We use this calculator for client estimates before purchase",
      "Перед ставкой на аукционе вы заранее видите ориентировочную стоимость автомобиля под ключ: покупка, доставка, таможня и обязательные расходы.":"Before bidding, you can see the estimated turnkey cost: purchase, shipping, customs and required expenses.",
      "Ссылка на лот с аукциона":"Auction lot link",
      "Вставьте ссылку Copart / IAAI / Manheim":"Paste a Copart / IAAI / Manheim link",
      "Разобрать":"Analyze",
      "Отправить лот на проверку":"Send lot for inspection",
      "Аукцион":"Auction",
      "Локация аукциона":"Auction location",
      "Выбери локацию":"Choose location",
      "Тип транспортного средства":"Vehicle type",
      "Тип топлива":"Fuel type",
      "Седан":"Sedan",
      "Кроссовер":"Crossover",
      "Внедорожник":"SUV",
      "Пикап":"Pickup",
      "Мото":"Motorcycle",
      "Квадро / ATV":"ATV",
      "Бензин":"Gasoline",
      "Гибрид":"Hybrid",
      "Плагин гибрид":"Plug-in hybrid",
      "Электро":"Electric",
      "Дизель":"Diesel",
      "Стоимость лота, $":"Lot price, $",
      "Аукционный сбор, $":"Auction fee, $",
      "Объем двигателя, л":"Engine size, L",
      "Год производства":"Year",
      "Порт отправки":"Shipping port",
      "Доставка по суше, $":"US inland shipping, $",
      "Страховка 1% от стоимости лота":"Insurance 1% of lot price",
      "Экспортные документы +$400":"Export documents +$400",
      "Показать итог:":"Show total:",
      "Дополнительно":"Additional",
      "Курс USD → MDL MAIB":"USD → MDL MAIB rate",
      "Курс EUR → MDL MAIB":"EUR → MDL MAIB rate",
      "Обновить расчет":"Update calculation",
      "Локация не выбрана":"Location not selected",
      "Итого":"Total",
      "Расчет предварительный.":"Preliminary calculation.",
      "Финальную сумму нужно проверить перед покупкой.":"The final amount must be checked before purchase.",
      "Сопровождение APEX AUTO":"APEX AUTO support",
      "Подбор и проверка лота, бесплатная проверка Carfax, участие в торгах, оформление документов, организация доставки и сопровождение автомобиля до выдачи.":"Lot selection and check, free Carfax check, bidding, paperwork, shipping and support until delivery.",
      "Скопировать расчет":"Copy calculation",
      "Поделиться расчетом":"Share calculation",
      "Оценка лота":"Lot assessment",
      "Торговая рекомендация":"Bidding recommendation",
      "Рынок Молдовы от, $":"Moldova market from, $",
      "Рынок Молдовы до, $":"Moldova market to, $",
      "Ремонт от, $":"Repair from, $",
      "Ремонт до, $":"Repair to, $",
      "Желаемая экономия, $":"Target savings, $",
      "AI оценить ставку":"AI estimate bid",
      "Экономия при покупке авто":"Savings when buying a car",
      "Автомобили из США и Канады выгоднее на 20–35% чем на местном рынке":"Cars from the USA and Canada can be 20–35% more cost-effective than the local market",
      "Получить подбор автомобилей":"Get car selection",
      "Имя":"Name",
      "Телефон":"Phone",
      "Бюджет":"Budget",
      "Какой автомобиль ищете? Например: BMW X5, Tesla Model Y, Porsche Macan":"What car are you looking for? Example: BMW X5, Tesla Model Y, Porsche Macan",
      "Заявка откроется готовым сообщением в Telegram.":"The request will open as a prepared Telegram message.",
      "БЕСПЛАТНАЯ ПРОВЕРКА АВТОМОБИЛЯ":"FREE CAR CHECK",
      "Не уверены, стоит ли покупать этот автомобиль?":"Not sure if this car is worth buying?",
      "Отправить на проверку":"Send for inspection",
      "Ответим в Telegram в рабочее время.":"We reply on Telegram during business hours.",
      "ГОРЯЧИЕ ПРЕДЛОЖЕНИЯ":"RECOMMENDED LOTS",
      "Авто, которые выгодно привозить под ключ":"Cars worth importing turnkey",
      "Telegram-канал Apex Auto":"Apex Auto Telegram channel",
      "Смотреть все лоты":"View all lots",
      "Новые лоты ежедневно":"New lots daily",
      "Реальные цены покупки":"Real purchase prices",
      "Расчет стоимости под ключ":"Turnkey cost estimate",
      "Смотреть примеры":"View examples",
      "Отправить заявку":"Send request",
      "Цена в Молдове":"Price in Moldova",
      "Экономия":"Savings",
      "Под ключ":"Turnkey",
      "от":"from",
      "С 2016 года":"Since 2016",
      "в автомобильном бизнесе":"in the automotive business",
      "новый бренд на базе накопленного опыта":"a new brand built on accumulated experience",
      "2000+ авто":"2000+ cars",
      "привезены клиентам":"delivered to clients",
      "подбор, торги, документы и логистика":"selection, bidding, documents and logistics",
      "Telegram канал: @fedukauto":"Telegram channel: @fedukauto",
      "WhatsApp: 068-832-032":"WhatsApp: 068-832-032",
      "Позвонить":"Call",
      "Написать в Telegram":"Message on Telegram",
      "Прямой контакт":"Direct contact",
      "Федор Чебан":"Fedor Ceban",
      "Расчет, подбор, проверка лота":"Calculation, selection, lot check",
      "Удобно для документов и фото":"Convenient for documents and photos",
      "Звонок":"Call",
      "Если вопрос срочный":"For urgent questions",
      "Telegram-канал":"Telegram channel",
      "Лоты, примеры покупок и цены":"Lots, purchase examples and prices",
      "ЧТО МОЖНО ОТПРАВИТЬ":"WHAT YOU CAN SEND",
      "Для быстрого расчета достаточно 2-3 деталей":"2-3 details are enough for a quick estimate",
      "Телефон или Telegram":"Phone or Telegram",
      "Автомобиль или ссылка на лот":"Car or lot link",
      "Коротко опишите задачу: расчет, подбор, проверка VIN, покупка под ключ":"Briefly describe the task: estimate, selection, VIN check, turnkey purchase",
      "Отправить запрос":"Send request",
      "Откроется готовое сообщение в Telegram.":"A prepared Telegram message will open.",
      "Автомобили, которые выгодно привозить из США и Канады":"Cars worth importing from the USA and Canada",
      "Все авто":"All cars",
      "Гибриды":"Hybrids",
      "Премиум":"Premium",
      "Ориентир под ключ":"Turnkey estimate",
      "Посмотреть примеры":"View examples",
      "ВАЖНО":"IMPORTANT",
      "Это ориентир, а не фиксированная цена":"This is an estimate, not a fixed price",
      "Перейти к калькулятору":"Go to calculator",
      "За Apex Auto стоит не просто компания, а человек с реальным опытом":"Behind Apex Auto is not just a company, but a person with real experience",
      "10+ лет":"10+ years",
      "в автомобильной сфере":"in the automotive field",
      "7+ лет":"7+ years",
      "ежедневной работы с аукционами США":"daily work with US auctions",
      "20–50 авто":"20–50 cars",
      "ежемесячно покупаю для клиентов":"bought monthly for clients",
      "опыт работы со страховыми и дилерскими аукционами":"experience with insurance and dealer auctions"
    }
  };

  const attrDict = {
    ro:{
      "Вставьте ссылку Copart / IAAI / Manheim":"Introduceți linkul Copart / IAAI / Manheim",
      "Телефон":"Telefon",
      "Телефон или Telegram":"Telefon sau Telegram",
      "Какой автомобиль ищете? Например: BMW X5, Tesla Model Y, Porsche Macan":"Ce mașină căutați? De exemplu: BMW X5, Tesla Model Y, Porsche Macan",
      "VIN, номер лота или ссылка на Copart / IAAI":"VIN, număr lot sau link Copart / IAAI",
      "Автомобиль или ссылка на лот":"Mașină sau link către lot",
      "Коротко опишите задачу: расчет, подбор, проверка VIN, покупка под ключ":"Descrieți pe scurt: calcul, selecție, verificare VIN, cumpărare la cheie"
    },
    en:{
      "Вставьте ссылку Copart / IAAI / Manheim":"Paste a Copart / IAAI / Manheim link",
      "Телефон":"Phone",
      "Телефон или Telegram":"Phone or Telegram",
      "Какой автомобиль ищете? Например: BMW X5, Tesla Model Y, Porsche Macan":"What car are you looking for? Example: BMW X5, Tesla Model Y, Porsche Macan",
      "VIN, номер лота или ссылка на Copart / IAAI":"VIN, lot number or Copart / IAAI link",
      "Автомобиль или ссылка на лот":"Car or lot link",
      "Коротко опишите задачу: расчет, подбор, проверка VIN, покупка под ключ":"Briefly describe the task: estimate, selection, VIN check, turnkey purchase"
    }
  };

  function translateText(text, lang){
    if(lang === "ru") return text;
    const map = dict[lang] || {};
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    return map[compact] || text;
  }

  function translateNodeText(node, lang){
    const value = node.nodeValue;
    const translated = translateText(value, lang);
    if(translated === value) return;
    const left = value.match(/^\s*/)?.[0] || "";
    const right = value.match(/\s*$/)?.[0] || "";
    node.nodeValue = `${left}${translated}${right}`;
  }

  function walkText(root, lang){
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        const parent = node.parentElement;
        if(!parent) return NodeFilter.FILTER_REJECT;
        if(["SCRIPT","STYLE","NOSCRIPT"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if(parent.closest("[data-no-i18n]")) return NodeFilter.FILTER_REJECT;
        if(!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => translateNodeText(node, lang));
  }

  function translateAttrs(lang){
    if(lang === "ru") return;
    const map = attrDict[lang] || {};
    document.querySelectorAll("[placeholder]").forEach(el => {
      const value = el.getAttribute("placeholder");
      if(map[value]) el.setAttribute("placeholder", map[value]);
    });
    const titleMap = {
      ro:{
        "APEX AUTO — просчет под ключ":"APEX AUTO — calcul la cheie",
        "Горячие предложения — Apex Auto":"Oferte recomandate — Apex Auto",
        "Моя история — Apex Auto":"Povestea mea — Apex Auto",
        "Контакты — Apex Auto":"Contacte — Apex Auto"
      },
      en:{
        "APEX AUTO — просчет под ключ":"APEX AUTO — turnkey calculator",
        "Горячие предложения — Apex Auto":"Recommended lots — Apex Auto",
        "Моя история — Apex Auto":"My story — Apex Auto",
        "Контакты — Apex Auto":"Contacts — Apex Auto"
      }
    };
    if(titleMap[lang]?.[document.title]) document.title = titleMap[lang][document.title];
  }

  function injectSwitcher(lang){
    const nav = document.querySelector(".mainNavV82");
    if(!nav || document.querySelector(".langSwitcherV165")) return;
    const wrap = document.createElement("div");
    wrap.className = "langSwitcherV165";
    wrap.setAttribute("aria-label", "Language");
    wrap.setAttribute("data-no-i18n", "true");
    wrap.innerHTML = SUPPORTED.map(code => `<button type="button" data-lang="${code}" class="${code === lang ? "active" : ""}">${code.toUpperCase()}</button>`).join("");
    wrap.addEventListener("click", event => {
      const button = event.target.closest("[data-lang]");
      if(!button) return;
      localStorage.setItem(STORAGE_KEY, button.dataset.lang);
      const url = new URL(window.location.href);
      url.searchParams.set("lang", button.dataset.lang);
      window.location.href = url.toString();
    });
    nav.appendChild(wrap);
  }

  function apply(lang){
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    injectSwitcher(lang);
    walkText(document.body, lang);
    translateAttrs(lang);
    document.querySelectorAll(".langSwitcherV165 button").forEach(button => {
      button.classList.toggle("active", button.dataset.lang === lang);
    });
  }

  const lang = getLang();
  window.APEX_LANG = lang;

  document.addEventListener("DOMContentLoaded", () => {
    apply(lang);
    let timer = 0;
    const observer = new MutationObserver(() => {
      if(lang === "ru") return;
      clearTimeout(timer);
      timer = setTimeout(() => apply(lang), 60);
    });
    observer.observe(document.body, {subtree:true, childList:true});
  });
})();
