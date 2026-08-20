/* dictionary.js — канонические поля лота, русские подписи и переводы аукционных терминов. */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});

  /* Порядок = порядок отображения в панели и в посте. */
  const FIELDS = [
    { key: "year", label: "Год" },
    { key: "make", label: "Марка" },
    { key: "model", label: "Модель" },
    { key: "trim", label: "Комплектация" },
    { key: "bodyStyle", label: "Кузов" },
    { key: "lot", label: "Лот №" },
    { key: "vin", label: "VIN" },
    { key: "location", label: "Локация" },
    { key: "saleDate", label: "Дата торгов" },
    { key: "saleStatus", label: "Статус лота" },
    { key: "currentBid", label: "Текущая ставка", money: true },
    { key: "buyNow", label: "Buy Now", money: true },
    { key: "estRetail", label: "Стоил целым (ACV)", money: true },
    { key: "estRepair", label: "Оценка ремонта", money: true },
    { key: "odometer", label: "Пробег" },
    { key: "primaryDamage", label: "Основное повреждение" },
    { key: "secondaryDamage", label: "Вторичное повреждение" },
    { key: "lossType", label: "Тип ущерба" },
    { key: "titleDoc", label: "Документ" },
    { key: "titleState", label: "Штат документа" },
    { key: "engine", label: "Двигатель" },
    { key: "cylinders", label: "Цилиндры" },
    { key: "fuel", label: "Топливо" },
    { key: "transmission", label: "КПП" },
    { key: "drive", label: "Привод" },
    { key: "colorExt", label: "Цвет кузова" },
    { key: "colorInt", label: "Салон" },
    { key: "keys", label: "Ключи" },
    { key: "startCode", label: "Запуск" },
    { key: "airbags", label: "Подушки" },
    { key: "highlights", label: "Особые отметки" },
    { key: "seller", label: "Продавец" },
    { key: "notes", label: "Заметки" }
  ];

  const LABEL_BY_KEY = FIELDS.reduce((acc, f) => ((acc[f.key] = f.label), acc), {});

  /* Подписи на страницах аукционов → канонические поля.
     Ключ — «нормализованная» подпись (нижний регистр, только буквы/цифры). */
  const LABEL_ALIASES = {
    lot: ["lot", "lot number", "lot no", "stock", "stock number", "stock no", "item"],
    vin: ["vin", "vin status", "vin number", "vehicle identification number", "full vin"],
    year: ["year", "model year"],
    make: ["make", "manufacturer", "brand"],
    model: ["model", "model group"],
    trim: ["series", "trim", "trim level", "model detail"],
    bodyStyle: ["body style", "body type", "vehicle type", "body"],
    odometer: ["odometer", "mileage", "miles", "odometer reading"],
    primaryDamage: ["primary damage", "damage", "primary damage description", "loss damage"],
    secondaryDamage: ["secondary damage", "second damage"],
    lossType: ["loss", "loss type", "sale type", "damage type"],
    titleDoc: ["title", "title code", "document", "title sale doc", "sale document", "title description", "doc type"],
    titleState: ["title state", "state", "document state"],
    /* порядок = приоритет: «Vehicle Location» точнее, чем просто «Location» */
    location: ["vehicle location", "selling branch", "sale location", "branch", "location", "yard", "facility"],
    saleDate: ["sale date", "auction date", "auction date and time", "sale date and time", "date"],
    saleStatus: ["sale status", "status", "lot status", "auction type"],
    currentBid: ["current bid", "current bid amount", "high bid", "bid", "pre bid", "prebid", "current price"],
    buyNow: ["buy it now", "buy now", "buy now price", "buy it now price"],
    estRetail: ["estimated retail value", "actual cash value", "acv", "retail value", "est retail value", "market value"],
    estRepair: ["estimated repair cost", "repair cost", "est repair cost"],
    engine: ["engine", "engine type", "engine size", "displacement", "engine displacement"],
    cylinders: ["cylinders", "cylinder", "cyl"],
    fuel: ["fuel", "fuel type"],
    transmission: ["transmission", "transmission type"],
    drive: ["drive", "drive line type", "drivetrain", "drive train", "driveline"],
    colorExt: ["color", "exterior color", "exterior interior", "ext color"],
    colorInt: ["interior color", "interior", "int color"],
    keys: ["keys", "key", "has key", "has keys", "keys present"],
    startCode: ["start code", "run and drive", "runs and drives", "condition", "vehicle condition", "engine start program"],
    airbags: ["airbags", "airbag", "air bags"],
    highlights: ["highlights", "special note", "notes highlights"],
    seller: ["seller", "seller name", "sold by"],
    notes: ["notes", "comments", "seller comments", "additional info"]
  };

  /* Переводы значений аукциона на русский (для поста). */
  const DAMAGE_RU = {
    "all over": "Кузов целиком",
    "front end": "Перёд",
    "rear end": "Зад",
    rear: "Зад",
    front: "Перёд",
    side: "Бок",
    "left front": "Левый перед",
    "right front": "Правый перед",
    "left rear": "Левый зад",
    "right rear": "Правый зад",
    "left side": "Левый бок",
    "right side": "Правый бок",
    "top roof": "Крыша",
    "top/roof": "Крыша",
    roof: "Крыша",
    undercarriage: "Днище",
    mechanical: "Механика",
    electrical: "Электрика",
    "engine damage": "Двигатель",
    "engine burn": "Двигатель (огонь)",
    "burn engine": "Двигатель (огонь)",
    "burn interior": "Салон (огонь)",
    burn: "Огонь",
    fire: "Огонь",
    "frame damage": "Силовая структура",
    frame: "Силовая структура",
    hail: "Град",
    "water flood": "Вода / потоп",
    "water/flood": "Вода / потоп",
    flood: "Вода / потоп",
    vandalism: "Вандализм",
    "minor dent scratches": "Мелкие вмятины и царапины",
    "minor dents scratches": "Мелкие вмятины и царапины",
    "normal wear": "Обычный износ",
    rollover: "Опрокидывание",
    "roll over": "Опрокидывание",
    stripped: "Разукомплектован",
    "biohazard chemical": "Биохимия",
    "bio chemical": "Биохимия",
    suspension: "Подвеска",
    "partial repair": "Частичный ремонт",
    "rejected repair": "Некачественный ремонт",
    "damage history": "Есть история повреждений",
    "missing altered vin": "Проблемы с VIN",
    theft: "Угон",
    "recovered theft": "Найден после угона",
    unknown: "Не указано",
    none: "Нет"
  };

  const TITLE_RU = {
    "salvage certificate": "Salvage (тотал)",
    "salvage title": "Salvage (тотал)",
    salvage: "Salvage (тотал)",
    original: "Оригинал тайтла (чистый)",
    "original title": "Оригинал тайтла (чистый)",
    "clean title": "Чистый тайтл",
    "cert of title": "Чистый тайтл",
    "certificate of title": "Чистый тайтл",
    "clear title": "Чистый тайтл",
    clear: "Чистый тайтл",
    rebuilt: "Rebuilt (восстановлен)",
    "nonrepairable": "Non-repairable (не восстанавливать)",
    "non repairable": "Non-repairable (не восстанавливать)",
    "certificate of destruction": "Certificate of Destruction",
    "bill of sale": "Bill of Sale",
    "export only": "Только на экспорт",
    "junk title": "Junk title",
    "parts only": "Только на запчасти"
  };

  const CONDITION_RU = {
    "run and drive": "Заводится и едет",
    "runs and drives": "Заводится и едет",
    "run drive": "Заводится и едет",
    "runs drives": "Заводится и едет",
    "runs and drive": "Заводится и едет",
    "engine start program": "Заводится (Engine Start Program)",
    starts: "Заводится",
    stationary: "Не на ходу",
    "does not start": "Не заводится",
    // IAAI Enhanced Vehicles: двигатель не запускали, причина не указана —
    // часто это севший аккумулятор или отсутствие ключа, а не поломка
    "enhanced vehicles": "Запуск не проверялся — уточним по запросу",
    "enhanced vehicle": "Запуск не проверялся — уточним по запросу",
    enhanced: "Запуск не проверялся — уточним по запросу",
    yes: "Да",
    no: "Нет",
    present: "Есть",
    "not present": "Нет",
    unknown: "Не указано"
  };

  const FUEL_RU = {
    gas: "Бензин",
    gasoline: "Бензин",
    petrol: "Бензин",
    diesel: "Дизель",
    hybrid: "Гибрид",
    "hybrid engine": "Гибрид",
    "gas hybrid": "Гибрид",
    "electric and gas hybrid": "Гибрид",
    "plug in hybrid": "Plug-in гибрид",
    electric: "Электро",
    flexible: "Flex-fuel",
    "flexible fuel": "Flex-fuel",
    other: "Другое"
  };

  const DRIVE_RU = {
    fwd: "Передний",
    "front wheel drive": "Передний",
    rwd: "Задний",
    "rear wheel drive": "Задний",
    awd: "Полный (AWD)",
    "all wheel drive": "Полный (AWD)",
    "4wd": "Полный (4×4)",
    "4x4": "Полный (4×4)",
    "four wheel drive": "Полный (4×4)"
  };

  const TRANS_RU = {
    automatic: "Автомат",
    "automatic transmission": "Автомат",
    at: "Автомат",
    a: "Автомат",
    manual: "Механика",
    "manual transmission": "Механика",
    mt: "Механика",
    cvt: "Вариатор"
  };

  const KEY_RU = {
    yes: "есть", no: "нет",
    present: "есть", "key present": "есть", "keys present": "есть", "present in photos": "есть",
    "not present": "нет", missing: "нет", "no key": "нет", "key missing": "нет", none: "нет",
    "1": "есть", "0": "нет", true: "есть", false: "нет"
  };

  const STATUS_RU = {
    "minimum bid": "Минимальная ставка",
    "on minimum bid": "Минимальная ставка",
    "pure sale": "Без резерва",
    "on approval": "С одобрения продавца",
    "seller approval": "С одобрения продавца",
    "bid now": "Идут торги",
    upcoming: "Скоро торги",
    "future sale": "Скоро торги",
    sold: "Продан",
    cancelled: "Снят с торгов",
    "on hold": "Снят с торгов",
    "buy it now": "Купить сразу"
  };

  const COLOR_RU = {
    black: "Чёрный", white: "Белый", silver: "Серебристый", gray: "Серый", grey: "Серый",
    blue: "Синий", "dark blue": "Тёмно-синий", "light blue": "Голубой", red: "Красный",
    burgundy: "Бордовый", maroon: "Бордовый", green: "Зелёный", brown: "Коричневый",
    beige: "Бежевый", tan: "Бежевый", gold: "Золотистый", orange: "Оранжевый",
    yellow: "Жёлтый", purple: "Фиолетовый", charcoal: "Тёмно-серый", cream: "Кремовый",
    turquoise: "Бирюзовый", "off white": "Молочный"
  };

  const BODY_RU = {
    "sport utility vehicle": "Внедорожник",
    "sport utility": "Внедорожник",
    suv: "Внедорожник",
    sedan: "Седан",
    "sedan 4d": "Седан",
    automobile: "Легковой",
    coupe: "Купе",
    hatchback: "Хэтчбек",
    wagon: "Универсал",
    convertible: "Кабриолет",
    pickup: "Пикап",
    truck: "Пикап",
    van: "Фургон",
    minivan: "Минивэн",
    "cargo van": "Грузовой фургон",
    motorcycle: "Мотоцикл",
    atv: "Квадроцикл",
    "cross over": "Кроссовер",
    crossover: "Кроссовер"
  };


  /* ---------- румынские значения (кнопка RO в панели) ---------- */

  const DAMAGE_RO = {
    "all over": "Integral", "front end": "Față", "rear end": "Spate", rear: "Spate", front: "Față",
    side: "Lateral", "left front": "Față stânga", "right front": "Față dreapta",
    "left rear": "Spate stânga", "right rear": "Spate dreapta",
    "left side": "Lateral stânga", "right side": "Lateral dreapta",
    "top roof": "Plafon", "top/roof": "Plafon", roof: "Plafon",
    undercarriage: "Șasiu", mechanical: "Mecanic", electrical: "Electric",
    "engine damage": "Motor", "engine burn": "Motor (incendiu)", "burn engine": "Motor (incendiu)",
    "burn interior": "Interior (incendiu)", burn: "Incendiu", fire: "Incendiu",
    "frame damage": "Structură de rezistență", frame: "Structură de rezistență",
    hail: "Grindină", "water flood": "Inundație", "water/flood": "Inundație", flood: "Inundație",
    vandalism: "Vandalism",
    "minor dent scratches": "Lovituri și zgârieturi minore",
    "minor dents scratches": "Lovituri și zgârieturi minore",
    "normal wear": "Uzură normală", rollover: "Răsturnare", "roll over": "Răsturnare",
    stripped: "Dezmembrat", "biohazard chemical": "Substanțe chimice", "bio chemical": "Substanțe chimice",
    suspension: "Suspensie", "partial repair": "Reparație parțială", "rejected repair": "Reparație de proastă calitate",
    "damage history": "Istoric de daune", "missing altered vin": "Probleme cu VIN-ul",
    theft: "Furt", "recovered theft": "Recuperat după furt", unknown: "Nespecificat", none: "Fără"
  };

  const TITLE_RO = {
    "salvage certificate": "Salvage (daună totală)", "salvage title": "Salvage (daună totală)",
    salvage: "Salvage (daună totală)",
    original: "Act original (curat)", "original title": "Act original (curat)",
    "clean title": "Act curat", "cert of title": "Act curat", "certificate of title": "Act curat",
    "clear title": "Act curat", clear: "Act curat",
    rebuilt: "Rebuilt (reconstruit)", nonrepairable: "Nereparabil", "non repairable": "Nereparabil",
    "certificate of destruction": "Certificat de distrugere", "bill of sale": "Contract de vânzare",
    "export only": "Doar pentru export", "junk title": "Junk title", "parts only": "Doar piese"
  };

  const CONDITION_RO = {
    "run and drive": "Pornește și merge", "runs and drives": "Pornește și merge",
    "run drive": "Pornește și merge", "runs drives": "Pornește și merge", "runs and drive": "Pornește și merge",
    "engine start program": "Pornește (Engine Start Program)", starts: "Pornește",
    stationary: "Nu se deplasează", "does not start": "Nu pornește",
    // IAAI Enhanced Vehicles: двигатель не запускали, причина не указана —
    // часто это севший аккумулятор или отсутствие ключа, а не поломка
    "enhanced vehicles": "Pornirea nu a fost verificată",
    "enhanced vehicle": "Pornirea nu a fost verificată",
    enhanced: "Pornirea nu a fost verificată", yes: "Da", no: "Nu",
    present: "Există", "not present": "Lipsește", unknown: "Nespecificat"
  };

  const FUEL_RO = {
    gas: "Benzină", gasoline: "Benzină", petrol: "Benzină", diesel: "Diesel",
    hybrid: "Hibrid", "hybrid engine": "Hibrid", "gas hybrid": "Hibrid",
    "electric and gas hybrid": "Hibrid", "plug in hybrid": "Hibrid plug-in",
    electric: "Electric", flexible: "Flex-fuel", "flexible fuel": "Flex-fuel", other: "Altul"
  };

  const DRIVE_RO = {
    fwd: "Față", "front wheel drive": "Față", rwd: "Spate", "rear wheel drive": "Spate",
    awd: "Integral (AWD)", "all wheel drive": "Integral (AWD)",
    "4wd": "Integral (4×4)", "4x4": "Integral (4×4)", "four wheel drive": "Integral (4×4)"
  };

  const TRANS_RO = {
    automatic: "Automată", "automatic transmission": "Automată", at: "Automată", a: "Automată",
    manual: "Manuală", "manual transmission": "Manuală", mt: "Manuală", cvt: "CVT"
  };

  const KEY_RO = {
    yes: "da", no: "nu", present: "da", "key present": "da", "keys present": "da",
    "present in photos": "da", "not present": "nu", missing: "nu", "no key": "nu",
    "key missing": "nu", none: "nu", "1": "da", "0": "nu", true: "da", false: "nu"
  };

  const STATUS_RO = {
    "minimum bid": "Preț minim", "on minimum bid": "Preț minim", "pure sale": "Fără rezervă",
    "on approval": "Cu acordul vânzătorului", "seller approval": "Cu acordul vânzătorului",
    "bid now": "Licitație în curs", upcoming: "În curând", "future sale": "În curând",
    sold: "Vândut", cancelled: "Retras", "on hold": "Retras", "buy it now": "Cumpără acum"
  };

  const COLOR_RO = {
    black: "Negru", white: "Alb", silver: "Argintiu", gray: "Gri", grey: "Gri",
    blue: "Albastru", "dark blue": "Albastru închis", "light blue": "Albastru deschis",
    red: "Roșu", burgundy: "Bordo", maroon: "Bordo", green: "Verde", brown: "Maro",
    beige: "Bej", tan: "Bej", gold: "Auriu", orange: "Portocaliu", yellow: "Galben",
    purple: "Violet", charcoal: "Gri închis", cream: "Crem", turquoise: "Turcoaz", "off white": "Alb crem"
  };

  const BODY_RO = {
    "sport utility vehicle": "SUV", "sport utility": "SUV", suv: "SUV",
    sedan: "Sedan", "sedan 4d": "Sedan", automobile: "Autoturism", coupe: "Coupe",
    hatchback: "Hatchback", wagon: "Break", convertible: "Cabriolet", pickup: "Pickup",
    truck: "Pickup", van: "Van", minivan: "Minivan", "cargo van": "Van marfă",
    motorcycle: "Motocicletă", atv: "ATV", "cross over": "Crossover", crossover: "Crossover"
  };

  const RO_MAPS = {
    primaryDamage: DAMAGE_RO, secondaryDamage: DAMAGE_RO, lossType: DAMAGE_RO,
    titleDoc: TITLE_RO, startCode: CONDITION_RO, airbags: CONDITION_RO,
    fuel: FUEL_RO, drive: DRIVE_RO, transmission: TRANS_RO, keys: KEY_RO,
    saleStatus: STATUS_RO, colorExt: COLOR_RO, colorInt: COLOR_RO, bodyStyle: BODY_RO
  };

  function lookup(map, value, allowPartial) {
    const key = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9/ ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!key) return "";
    if (map[key]) return map[key];
    const alt = key.replace(/\//g, " ").replace(/\s+/g, " ").trim();
    if (map[alt]) return map[alt];
    if (!allowPartial) return "";
    // «CA - SALVAGE CERTIFICATE» → находим самый длинный известный термин внутри строки
    const hit = Object.keys(map)
      .filter((k) => k.length >= 5 && alt.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    return hit ? map[hit] : "";
  }

  /** Перевод значения по типу поля. lang: "ru" (по умолчанию) или "ro". */
  function translate(fieldKey, value, lang) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const tc = ApexX.util ? ApexX.util.titleCase : (v) => v;
    const parts = raw.split(/\s*(?:\/|,|;|\band\b)\s*/i).filter(Boolean);
    const ro = lang === "ro";
    const maps = {
      primaryDamage: DAMAGE_RU, secondaryDamage: DAMAGE_RU, lossType: DAMAGE_RU,
      titleDoc: TITLE_RU, startCode: CONDITION_RU, airbags: CONDITION_RU,
      fuel: FUEL_RU, drive: DRIVE_RU, transmission: TRANS_RU, keys: KEY_RU,
      saleStatus: STATUS_RU, colorExt: COLOR_RU, colorInt: COLOR_RU, bodyStyle: BODY_RU
    };
    const map = (ro && RO_MAPS[fieldKey]) || maps[fieldKey];
    if (!map) return raw;

    // «4x4 w/Front Wheel Drive» — полный привод главнее, чем упомянутый в строке передний
    if (fieldKey === "drive") {
      if (/\b(4x4|4wd|four wheel)\b/i.test(raw)) return map["4x4"];
      if (/\bawd|all wheel\b/i.test(raw)) return map.awd;
    }

    // Документ приходит со штатом: «CA - Salvage Certificate» или «ORIGINAL (Texas)»
    if (fieldKey === "titleDoc") {
      const state = (raw.match(/^\s*([A-Z]{2})\s*[-–•]/) || [])[1] || (raw.match(/\(([^)]{2,20})\)\s*$/) || [])[1] || "";
      const body = raw.replace(/^\s*[A-Z]{2}\s*[-–•]\s*/, "").replace(/\s*\([^)]*\)\s*$/, "");
      const doc = lookup(map, body, true) || lookup(map, raw, true);
      const label = doc || tc(body);
      return state ? `${tc(state)} • ${label}` : label;
    }

    // «Minor Dent/Scratches» — сначала пробуем строку целиком, только потом по частям
    const whole = lookup(map, raw, true);
    if (whole) return whole;
    const mapped = parts.map((p) => lookup(map, p) || tc(p));
    return Array.from(new Set(mapped)).join(" / ");
  }

  /** Совместимость: старые вызовы ru(field, value) продолжают работать. */
  function ru(fieldKey, value, lang) {
    return translate(fieldKey, value, lang);
  }

  ApexX.dict = {
    FIELDS, LABEL_BY_KEY, LABEL_ALIASES,
    DAMAGE_RU, TITLE_RU, CONDITION_RU, FUEL_RU, DRIVE_RU, TRANS_RU,
    ru, translate, lookup, RO_MAPS
  };
})(typeof window !== "undefined" ? window : self);
