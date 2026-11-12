/* Расчёт «под ключ» для авто из Кореи (Encar) — 12.11.2026, правила Федора.
   Работает и в браузере (window.KoreaCalc), и в Node (module.exports). Таможню берёт из calc-core.js (ApexCalc) — те же ставки 2026/2027.

   ПЕРВЫЙ ПЛАТЁЖ (вместе с машиной, USD): цена авто + комиссия дилера 350 + расходы по Корее (снятие с учёта, экспорт) 300 +
     доставка до порта 100 + осмотр 150 (по галочке) + доставка до Европы по классу (седан 2000 / кроссовер 2100 / внедорожник 2200 /
     минивэн 2600) + для электромобиля ещё 300. Для авто дороже $50 000 доставка до Европы дороже — сумма ещё не названа (HIGH_PRICE_EXTRA_USD).
   ВТОРОЙ ПЛАТЁЖ (EUR, при получении): доставка из Европы (седан 1000 / кроссовер 1100 / внедорожник 1200 / минивэн 1300) +
     комиссия Apex Auto по цене авто (до 10 тыс. — 300, 10–15 — 400, 15–20 — 500, 20–25 — 600, 25–35 — 700, 35–45 — 850, 45+ — 1000).
   ТРЕТИЙ ПЛАТЁЖ (MDL, таможня): акциз по возрасту/объёму/топливу (пикап — НДС), налог на роскошь, при оплате в леях «брокер + утиль сбор» 2000 MDL. */
(function(root, factory){
  var api = factory(function(){
    if(root && root.ApexCalc) return root.ApexCalc;
    return (typeof require === "function") ? require("./calc-core.js") : null;
  });
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.KoreaCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(core){
  "use strict";

  var CFG = {
    dealerFeeUsd: 350,            // комиссия дилера
    koreaExpensesUsd: 300,        // расходы по Корее: снятие с учёта, экспорт
    portDeliveryUsd: 100,         // доставка до порта
    inspectionUsd: 150,           // осмотр автомобиля — по желанию (галочка)
    evExtraUsd: 300,              // электромобиль: доплата к доставке до Европы
    euDeliveryUsd: {sedan:2000, crossover:2100, suv:2200, minivan:2600},
    highPriceUsd: 50000,          // дороже — доставка до Европы дороже
    highPriceExtraUsd: 0,         // ⚠️ сумма ещё не названа (Федор: «пока не знаю какая») — когда назовёт, поставить сюда
    receiveDeliveryEur: {sedan:1000, crossover:1100, suv:1200, minivan:1300},   // доставка при получении, EUR
    // Комиссия Apex Auto, EUR: [верхняя граница цены авто в USD (не включая), комиссия]. «45+ — 1000, и так далее по нарастающей»:
    // выше 45 тыс. следующие ступени Федор ещё не назвал — пока 1000.
    commissionEur: [[10000,300],[15000,400],[20000,500],[25000,600],[35000,700],[45000,850],[Infinity,1000]],
    brokerUtilMdl: 2000           // брокер + утиль сбор, только при оплате в леях
  };

  var CLASSES = ["sedan", "crossover", "suv", "minivan"];

  // ---------- Класс размера: седан / кроссовер / внедорожник / минивэн ----------
  // Принцип как у США/Канады (calc-core.bodyClassForModel): компактный SUV = кроссовер, средний/крупный = внедорожник.
  // Сначала таблица «корейских» и европейских моделей (кузов у Encar часто ошибочный: Sonata/Grandeur с типом «suv», Ioniq 5 — «хэтчбек»),
  // потом общая таблица США (calc-core), потом кузов Encar: van → минивэн, pickup → пикап (цена внедорожника), suv → внедорожник (как в США
  // для неизвестной SUV), всё остальное — седан.
  var KR_RULES = {
    hyundai: {
      sedan:["sonata","grandeur","azera","elantra","avante","accent","verna","i30","i40","ioniq6","ioniq","veloster","genesis","equus","centennial","aslan","dynasty","tiburon","excel","stellar"],
      crossover:["kona","venue","tucson","casper","nexo","ioniq5","creta","bayon","ix35","ix25"],
      suv:["santafe","palisade","maxcruz","veracruz","ix55","ioniq9","terracan","galloper"],
      minivan:["staria","grandstarex","starex","h1","trajet","santamo","h200"]
    },
    kia: {
      sedan:["morning","picanto","ray","pride","rio","k3","k5","k7","k8","k9","optima","cerato","forte","spectra","stinger","cadenza","quoris","ev4","opirus","sephia"],
      crossover:["seltos","stonic","soul","niro","sportage","ev3","ev5","ev6","sonet","xceed"],
      suv:["sorento","mohave","borrego","telluride","ev9"],
      minivan:["carnival","sedona","carens","rondo","pregio","grandcarnival"]
    },
    genesis: { sedan:["g70","g80","g90","eq900","electrifiedg80","dh"], crossover:["gv60","gv70"], suv:["gv80","gv90"] },
    ssangyong: {
      sedan:["chairman"],
      crossover:["tivoli","xlv","korando","actyon"],
      suv:["rexton","torres","kyron","stavic"],
      pickup:["rextonsports","korandosports","actyonsports","mussosports","musso"],
      minivan:["korandoturismo","rodius","istana"]
    },
    kgmobility: { crossover:["tivoli","xlv","korando","actyon"], suv:["torres","rexton"], pickup:["rextonsports","korandosports","mussosports","musso"] },
    renault: {
      sedan:["sm3","sm5","sm6","sm7","clio","zoe","twizy","megane","fluence"],
      crossover:["qm3","qm5","qm6","xm3","arkana","captur","koleos","kadjar","austral","duster"],
      suv:["grandkoleos","filante"],
      minivan:["master"]
    },
    chevrolet: {
      sedan:["spark","aveo","sonic","cruze","malibu","impala","alpheon","lacetti","bolt","camaro","corvette"],
      crossover:["trax","trailblazer","equinox","bolteuv","tracker"],
      suv:["captiva","traverse","tahoe","suburban","blazer"],
      minivan:["orlando","damas","express","venture"],
      pickup:["colorado","silverado","labo"]
    },
    daewoo: { sedan:["lanos","nubira","leganza","magnus","tosca","matiz","gentra","lacetti"], suv:["winstorm","veracruz"], minivan:["damas","labo","rezzo","tacuma"] },
    porsche: { sedan:["taycan","panamera","911","718","boxster","cayman"], crossover:["macan"], suv:["cayenne"] },
    mini: { sedan:["clubman"], crossover:["countryman","coopercountryman","paceman","aceman"] },
    maserati: { crossover:["grecale"], suv:["levante"], sedan:["ghibli","quattroporte","granturismo"] },
    bentley: { suv:["bentayga"], sedan:["continental","flyingspur","mulsanne"] },
    rollsroyce: { suv:["cullinan"], sedan:["ghost","phantom","wraith","dawn","spectre"] },
    lamborghini: { suv:["urus"] },
    alfaromeo: { crossover:["stelvio","tonale"], sedan:["giulia","giulietta"] },
    jaguar: { crossover:["fpace","epace","ipace"], sedan:["xe","xf","xj","ftype"] },
    peugeot: { crossover:["2008","3008"], suv:["5008"], sedan:["208","308","508"] },
    citroen: { crossover:["c3aircross","c5aircross","c4cactus"] },
    polestar: { sedan:["polestar2","polestar1"], crossover:["polestar4"], suv:["polestar3"] },
    lotus: { suv:["eletre"], sedan:["emira","evija","elise","exige"] },
    volvo: { sedan:["s60","s90","v60","v90","s40","v40"] },
    bmw: { sedan:["i4","i5","i7","ix1xdrive","m2","m3","m4","m5","m8","z4"], crossover:["ix1","ix2","ix3"], suv:["ix"] },
    mercedes: { sedan:["eqe","eqs","cla","cls","amggt"], crossover:["eqa","eqb","eqc"], suv:["eqssuv","eqesuv","maybachgls"], minivan:["vclass","viano","vito","vklasse"] },
    audi: { sedan:["etrongt","a1","a3","a4","a5","a6","a7","a8","tt","r8"], crossover:["q2","q4etron"], suv:["etron"] },
    toyota: { minivan:["sienna","alphard","vellfire","voxy","noah","previa","estima","hiace","granvia","sienta"] },
    honda: { minivan:["odyssey","stepwgn","elysion"] },
    nissan: { minivan:["serena","elgrand","quest"] },
    volkswagen: { crossover:["troc","tcross","id4","id5"], minivan:["multivan","caravelle","sharan","transporter","touran","caddy","t7","idbuzz"] },
    chrysler: { minivan:["pacifica","voyager","grandcaravan","town"] },
    dodge: { minivan:["grandcaravan","caravan"] },
    ford: { crossover:["mustangmache"], minivan:["galaxy","smax","transit","tourneo"], pickup:["f150","f250","ranger","maverick"] },
    lexus: { minivan:["lm"], sedan:["es","is","ls","gs","ct"] },
    tesla: { sedan:["models","model3"] },
    cadillac: { sedan:["ats","cts","ct4","ct5","ct6","xts"] },
    lincoln: { sedan:["mkz","continental","mks","town"] }
  };

  function norm(s){ return String(s == null ? "" : s).toLowerCase().replace(/[\s._\-()\/]/g, ""); }

  function krTableClass(brand, model){
    var mk = norm(brand), md = norm(model);
    if(!mk || !md) return null;
    var best = null;
    for(var key in KR_RULES){
      if(mk.indexOf(key) === -1) continue;
      var rule = KR_RULES[key];
      for(var grp in rule){
        var list = rule[grp];
        for(var i = 0; i < list.length; i++){
          var p = list[i];
          if(md.indexOf(p) === 0 && (!best || p.length > best.p.length)) best = {p:p, c:grp};
        }
      }
    }
    return best ? best.c : null;
  }

  /** Класс размера авто: {cls:"sedan|crossover|suv|minivan", pickup:bool, src:"table|us|body"}.
   *  car: {brand, model, bodyId (Encar body_type.id), title}. Пикап — по цене как внедорожник, растаможка как у пикапа в США (НДС). */
  // Название модели у части объявлений Encar пустое («model: null») — тогда берём его из названия объявления (без года и марки в начале).
  function modelOf(car){
    if(car.model && String(car.model).trim()) return car.model;
    var t = String(car.title || "").replace(/^\s*(?:19|20)\d{2}\s+/, "").trim();
    var b = String(car.brand || "").trim();
    if(b && t.toLowerCase().indexOf(b.toLowerCase()) === 0) t = t.slice(b.length).trim();
    return t;
  }
  function sizeClass(car){
    car = car || {};
    var model = modelOf(car);
    var t = krTableClass(car.brand, model);
    if(t === "pickup") return {cls:"suv", pickup:true, src:"table"};
    if(t && CLASSES.indexOf(t) !== -1) return {cls:t, pickup:false, src:"table"};
    var cc = core();
    // Общий список минивэнов (Sienna, Pacifica, Carnival, Odyssey, V-Class…) из calc-core — как в калькуляторах США/Канады
    if(cc && typeof cc.isMinivan === "function" && cc.isMinivan(car.brand, model, car.title, "")) return {cls:"minivan", pickup:false, src:"us"};
    var c = cc && cc.bodyClassForModel ? cc.bodyClassForModel(car.brand, model) : null;
    if(c === "crossover" || c === "suv") return {cls:c, pickup:false, src:"us"};
    var b = Number(car.bodyId || 0);
    if(b === 4) return {cls:"suv", pickup:true, src:"body"};          // пикап
    if(b === 7) return {cls:"minivan", pickup:false, src:"body"};     // фургон/минивэн
    if(b === 5) return {cls:"suv", pickup:false, src:"body"};         // как в США: неизвестный SUV — внедорожник
    return {cls:"sedan", pickup:false, src:"body"};
  }

  // ---------- Топливо: Encar fuel.id → тип для таможни ----------
  // 1 дизель · 2 электро · 3 гибрид · 4 бензин · 5 газ (LPG) · 6 гибкое · 7 водород · 8 этанол.
  // Гибрид у Encar — и обычный, и plug-in (по названию — isPluginHybrid, как на аукционах США), мягкий гибрид (MHEV, 48 В) = бензин, как в США.
  function fuelKind(car){
    car = car || {};
    var id = Number(car.fuelId || 0), c = core();
    if(id === 1) return "diesel";
    if(id === 2 || id === 7) return "electric";     // водород (Nexo) — электроприводом, акциз по массе
    if(id === 3){
      var text = String(car.title || "") + " " + String(car.badge || "");
      var plug = c && c.isPluginHybrid ? c.isPluginHybrid(car.brand, car.model, text, car.year) : false;
      if(plug) return "phev";
      if(/\bmhev\b|mild|48\s?v/i.test(text)) return "gasoline";
      return "hybrid";
    }
    return "gasoline";                               // бензин, газ, гибкое, этанол
  }

  // ---------- Платежи ----------
  function commissionEurFor(priceUsd){
    var p = Number(priceUsd) || 0, t = CFG.commissionEur;
    for(var i = 0; i < t.length; i++) if(p < t[i][0]) return t[i][1];
    return t[t.length - 1][1];
  }
  function r0(x){ return Math.round(Number(x) || 0); }

  /**
   * input: {priceUsd, year, brand, model, title, badge, bodyId, fuelId, engineCc, cls(ручной класс), pickup,
   *         inspection(bool), evExtra(bool, по умолчанию true у электро), payMdl(bool, по умолчанию true), rules("2026"|"2027"), curbKg,
   *         usdMdl, eurMdl}
   */
  function quote(input){
    input = input || {};
    var c = core();
    var usdMdl = Number(input.usdMdl) > 0 ? Number(input.usdMdl) : 18.32;
    var eurMdl = Number(input.eurMdl) > 0 ? Number(input.eurMdl) : 20.4;
    var price = Math.max(0, Number(input.priceUsd) || 0);
    var sc = sizeClass(input);
    var cls = CLASSES.indexOf(input.cls) !== -1 ? input.cls : sc.cls;
    var pickup = input.pickup === true || (sc.pickup && cls === sc.cls);   // пикап остаётся пикапом, пока класс не переключили вручную
    var fuel = fuelKind(input);
    var isEv = fuel === "electric";
    var evOn = isEv && input.evExtra !== false;
    var inspOn = !!input.inspection;
    var payMdl = input.payMdl !== false;
    var high = price > CFG.highPriceUsd;
    var eurUsd = eurMdl / usdMdl;            // сколько $ в одном евро (кросс-курс НБМ)

    // --- первый платёж, USD ---
    var first = {
      car: r0(price),
      dealer: CFG.dealerFeeUsd,
      korea: CFG.koreaExpensesUsd,
      port: CFG.portDeliveryUsd,
      euDelivery: CFG.euDeliveryUsd[cls] + (high ? CFG.highPriceExtraUsd : 0),
      evExtra: evOn ? CFG.evExtraUsd : 0,
      inspection: inspOn ? CFG.inspectionUsd : 0
    };
    first.subtotal = first.car + first.dealer + first.korea + first.port + first.euDelivery + first.evExtra + first.inspection;

    // --- второй платёж: EUR + MDL ---
    var deliveryEur = CFG.receiveDeliveryEur[cls];
    var commissionEur = commissionEurFor(price);

    // Растаможка. База для налога на роскошь (от 600 000 лей) — как у США «лот + сборы + море»: авто + комиссия дилера + расходы в Корее +
    // доставка до порта + доставка до Европы. Акциз от стоимости не зависит (объём/возраст/топливо), у пикапа НДС 20% — от этой же базы.
    var incomplete = [];
    var customs = null, brokerMdl = 0;
    var cc = Number(input.engineCc) || 0;
    var year = Number(input.year) || 0;
    if(!year) incomplete.push("year");
    if(!isEv && !cc) incomplete.push("engine");
    if(!c) incomplete.push("core");
    if(c && !incomplete.length){
      var baseUsd = first.car + first.dealer + first.korea + first.port + first.euDelivery + first.evExtra;
      var baseMdl = baseUsd * usdMdl;
      var ctype = pickup ? "pickup" : (cls === "suv" || cls === "minivan") ? "suv" : cls;   // тип для массы электромобиля по умолчанию
      customs = c.customsMdl(baseMdl, baseMdl, {vehicleType:ctype, fuel:fuel, engineLiters:cc / 1000, year:year, curbKg:input.curbKg, rules:input.rules});
      brokerMdl = payMdl ? CFG.brokerUtilMdl : 0;
    }
    // Акциз/НДС и налог на роскошь — отдельными суммами (на сайте налог на роскошь — отдельная строка)
    var exciseMdl = customs ? r0(customs.baseExcise) : 0;
    var luxuryMdl = customs ? r0(customs.luxury) : 0;
    var customsMdl = exciseMdl + luxuryMdl;

    // 2-й платёж (EUR): доставка из Европы в Молдову + комиссия Apex
    var second = {deliveryEur: deliveryEur, commissionEur: commissionEur};
    second.subtotalEur = deliveryEur + commissionEur;
    second.subtotalUsd = second.subtotalEur * eurUsd;
    // 3-й платёж (MDL): растаможка (акциз/НДС), налог на роскошь, брокер и утиль сбор
    var third = {exciseMdl: exciseMdl, luxuryMdl: luxuryMdl, customsMdl: customsMdl, brokerMdl: brokerMdl};
    third.subtotalMdl = customsMdl + brokerMdl;
    third.subtotalUsd = third.subtotalMdl / usdMdl;

    var totalUsd = first.subtotal + second.subtotalUsd + third.subtotalUsd;
    return {
      cls: cls, pickup: pickup, sizeSrc: sc.src, fuel: fuel, isEv: isEv, high: high, highPending: high && !CFG.highPriceExtraUsd,
      first: first, second: second, third: third, customs: customs,
      totalUsd: totalUsd, totalEur: totalUsd / eurUsd, totalMdl: totalUsd * usdMdl,
      incomplete: incomplete, usdMdl: usdMdl, eurMdl: eurMdl
    };
  }

  /** Данные машины Encar → вход для quote(). car — запись каталога, listing — объявление, priceUsd — цена в $. opts — состояние галочек. */
  function fromCar(car, listing, priceUsd, opts){
    opts = opts || {};
    car = car || {};
    var tm = listing && listing.title && typeof listing.title === "object" ? (listing.title.en || listing.title.ru || "") : "";
    var c = core();
    return {priceUsd: priceUsd, year: car.year, brand: car.brand && car.brand.name, model: car.model && car.model.name, title: tm, badge: car.badge,
      bodyId: car.body_type && car.body_type.id, fuelId: car.fuel && car.fuel.id, engineCc: car.engine_volume, cls: opts.cls || null,
      inspection: !!opts.inspection, evExtra: opts.evExtra !== false, payMdl: opts.payMdl !== false,
      rules: opts.rules || (c && c.getCustomsRules ? c.getCustomsRules() : undefined), curbKg: Number(opts.kg) > 0 ? Number(opts.kg) : undefined,
      usdMdl: opts.usdMdl || 0, eurMdl: opts.eurMdl || 0};
  }

  return {quote: quote, fromCar: fromCar, sizeClass: sizeClass, fuelKind: fuelKind, commissionEurFor: commissionEurFor, CFG: CFG, CLASSES: CLASSES, VERSION: "kr-v3"};
});
