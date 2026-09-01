/* calc-core.js — ЕДИНЫЙ модуль расчёта стоимости «под ключ».
   Один и тот же код используют: калькулятор на главной, страница аукционов,
   серверный эндпоинт /api/calc и расширение Chrome (через этот эндпоинт).
   Таблицы и формулы обязаны совпадать со script.js — при правке меняйте оба места
   или переносите сюда, чтобы источник расчёта оставался один.
   Работает и в браузере (window.ApexCalc), и в Node (module.exports). */
(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.ApexCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";
  const YEAR_NOW = new Date().getFullYear();

  const GASOLINE_RATES={"0-2":[9.56,12.23,18.90,31.14,55.60],"3-4":[10,12.67,19.34,31.68,56.04],"5-6":[10.23,12.90,19.57,31.81,56.27],"7":[11.25,14.19,21.53,34.99,61.90],"8":[12.38,15.61,23.68,38.49,68.09],"9":[13.62,17.17,26.05,42.34,74.90],"10":[16.34,20.60,31.26,50.81,89.87],"11":[21.24,26.79,40.63,66.05,116.84],"12":[26.24,31.79,45.79,71.05,121.84],"13":[31.24,36.79,50.63,76.05,126.84],"14":[36.24,41.79,55.63,81.05,131.84],"15":[41.24,46.79,60.63,86.05,136.84],"16":[46.24,51.79,65.63,91.05,141.84],"17":[51.24,56.79,70.63,96.05,146.84],"18":[56.24,61.79,75.63,101.05,151.84],"19":[61.24,66.79,80.63,106.05,156.84],"20+":[66.24,71.79,85.63,111.05,161.84]};
  const DIESEL_RATES={"0-2":[12.23,31.14,55.60],"3-4":[12.67,31.58,56.04],"5-6":[12.90,31.81,56.27],"7":[14.19,34.99,61.90],"8":[15.61,38.49,68.90],"9":[17.17,42.34,74.90],"10":[20.60,50.81,89.87],"11":[26.79,66.05,116.84],"12":[31.79,71.05,121.84],"13":[36.79,76.05,126.84],"14":[41.79,81.05,131.84],"15":[46.79,86.05,136.84],"16":[51.79,91.05,141.84],"17":[56.79,96.05,146.84],"18":[61.79,101.05,151.84],"19":[66.79,106.05,156.84],"20+":[71.79,111.05,161.84]};
  const LUXURY_RATES=[{min:600000,max:700000,pct:2},{min:700001,max:800000,pct:3},{min:800001,max:900000,pct:4},{min:900001,max:1000000,pct:5},{min:1000001,max:1200000,pct:6},{min:1200001,max:1400000,pct:7},{min:1400001,max:1600000,pct:8},{min:1600001,max:1800000,pct:9},{min:1800001,max:Infinity,pct:10}];
  const AUCTION_FEE_POINTS=[[0,300],[1000,450],[3000,700],[5000,925],[10000,1100],[15000,1250],[20000,1550],[30000,2150],[50000,3300],[75000,4700],[100000,6000]];
  const SEA={nj:{label:"Elizabeth, NJ",price:2400},savannah:{label:"Savannah, GA",price:2400},houston:{label:"Houston, TX",price:2600},indianapolis:{label:"Indianapolis, IN",price:2600},la:{label:"Los Angeles, CA",price:3100}};

  const APEX_LAND_SURCHARGE = 50;   // фиксированный сбор Apex на наземной доставке
  const SUV_LAND_EXTRA = 100;       // надбавка за внедорожник
  const OFFSITE_FEE = 100;          // off-site / саблот
  const EXPORT_DOCS_FEE = 400;
  const INSURANCE_MIN = 100;        // страховка: 1%, но не меньше $100

  function interpolateFee(price){if(!Number.isFinite(price)||price<=0)return 0;for(let i=0;i<AUCTION_FEE_POINTS.length-1;i++){let [x1,y1]=AUCTION_FEE_POINTS[i],[x2,y2]=AUCTION_FEE_POINTS[i+1];if(price>=x1&&price<=x2){let fee=y1+(y2-y1)*((price-x1)/(x2-x1));return Math.ceil(fee/10)*10}}return Math.ceil(price*0.06/10)*10}

  function auctionFeeFor(price, auction){
    let total=interpolateFee(price);
    if(auction==="iaai")total+=50;
    if(auction==="manheim"){
      if(price<=5000)total=820;
      else if(price<=15000)total=1070;
      else if(price<=30000)total=1100;
      else if(price<=35000)total=1250;
      else if(price<=40000)total=1350;
      else if(price<=45000)total=1500;
      else if(price<=50000)total=1700;
      else total=2000;
    }
    return{total,detail:""};
  }

  // Классификация модели: кроссовер vs внедорожник. Влияет на доставку
  // (море: crossover +$100, suv +$300; суша: suv +$100). Возвращает
  // "crossover" | "suv" | null (не определено — решает вызывающий по кузову).
  // Принцип: компактный SUV = кроссовер, средний/крупный = внедорожник.
  // Единый источник — сайт, /api/calc, расширение. Дополнять просто: добавь
  // префикс модели в нужный список нужной марки. Модель не из таблицы → null.
  var BODY_RULES = {
    tesla:      { crossover:["modely"],                              suv:["modelx"] },
    bmw:        { crossover:["x1","x2","x3","x4"],                   suv:["x5","x6","x7"] },
    mercedes:   { crossover:["gla","glb","glc"],                    suv:["gle","gls","gclass","gwagen","amgg"] },
    audi:       { crossover:["q3","q5"],                            suv:["q7","q8"] },
    lexus:      { crossover:["ux","nx"],                            suv:["rx","gx","lx","tx"] },
    toyota:     { crossover:["rav4","chr","corollacross","venza"],  suv:["highlander","grandhighlander","4runner","sequoia","landcruiser"] },
    honda:      { crossover:["hrv","crv"],                          suv:["passport","pilot"] },
    nissan:     { crossover:["kicks","rogue"],                      suv:["murano","pathfinder","armada"] },
    infiniti:   { crossover:["qx50","qx55"],                        suv:["qx60","qx80"] },
    mazda:      { crossover:["cx3","cx30","cx5","cx50"],            suv:["cx7","cx9","cx90"] },
    hyundai:    { crossover:["venue","kona","tucson"],              suv:["santafe","santacruz","palisade"] },
    kia:        { crossover:["soul","seltos","niro","sportage"],    suv:["sorento","telluride"] },
    genesis:    { crossover:["gv70"],                               suv:["gv80"] },
    volkswagen: { crossover:["taos","tiguan"],                      suv:["atlas","touareg"] },
    subaru:     { crossover:["crosstrek","forester","outback"],     suv:["ascent"] },
    ford:       { crossover:["ecosport","escape","broncosport"],    suv:["edge","explorer","expedition","bronco"] },
    lincoln:    { crossover:["corsair"],                            suv:["nautilus","aviator","navigator"] },
    chevrolet:  { crossover:["trax","trailblazer","equinox"],       suv:["blazer","traverse","tahoe","suburban"] },
    gmc:        { crossover:["terrain"],                            suv:["acadia","yukon"] },
    buick:      { crossover:["encore","envision"],                  suv:["enclave"] },
    cadillac:   { crossover:["xt4","xt5"],                          suv:["xt6","escalade"] },
    jeep:       { crossover:["renegade","compass","cherokee"],      suv:["grandcherokee","wrangler","grandwagoneer","wagoneer","commander"] },
    dodge:      { crossover:["journey"],                            suv:["durango"] },
    acura:      { crossover:["rdx"],                                suv:["mdx"] },
    volvo:      { crossover:["xc40","xc60"],                        suv:["xc90"] },
    mitsubishi: { crossover:["outlander","eclipsecross"],           suv:["montero","pajero"] },
    landrover:  { crossover:["evoque","discoverysport"],           suv:["rangerover","discovery","defender","velar"] }
  };
  function bodyClassForModel(make, model){
    var mk = String(make || "").toLowerCase().replace(/[\s._-]/g, "");
    var md = String(model || "").toLowerCase().replace(/[\s._-]/g, ""); // "cr-v"→"crv", "grand cherokee"→"grandcherokee"
    if(!mk || !md) return null;
    for(var key in BODY_RULES){
      if(mk.indexOf(key) === -1) continue;
      var r = BODY_RULES[key];
      // Все префиксы обеих групп — самые длинные первыми, чтобы «grandcherokee»
      // проверялся раньше «cherokee», а «discoverysport» раньше «discovery».
      var all = (r.crossover || []).map(function(p){ return {p:p, c:"crossover"}; })
        .concat((r.suv || []).map(function(p){ return {p:p, c:"suv"}; }))
        .sort(function(a, b){ return b.p.length - a.p.length; });
      for(var i = 0; i < all.length; i++) if(md.indexOf(all[i].p) === 0) return all[i].c;
    }
    return null;
  }

  // Распознавание плагин-гибрида (PHEV) по названию модели/трима — когда фид
  // аукциона отдаёт просто «hybrid». Важно для таможни: у PHEV скидка акциза 0.5
  // против 0.75 у обычного гибрида (PHEV дешевле). Единый источник для сайта,
  // /api/calc и расширения.
  function isPluginHybrid(make, model, title){
    var s = (String(make || "") + " " + String(model || "") + " " + String(title || "")).toLowerCase();
    if(/plug[\s-]?in|phev|\b4xe\b|e[\s-]?hybrid|\benergi\b|\brecharge\b|iperformance/.test(s)) return true;
    if(/\bprime\b/.test(s) && /toyota|rav4|prius/.test(s)) return true;      // Toyota RAV4/Prius Prime
    // BMW/Mercedes: трим «40e», «45e», «330e», «530e», «745e», «350e», «225xe»,
    // «xDrive40e/45e» — цифры + (x) + e на конце слова.
    if(/bmw|mercedes/.test(s) && /\d{2,3}x?e\b/.test(s)) return true;
    return false;
  }

  function landMultiplier(type){
    if(type==="pickup"||type==="pickupLarge"||type==="vanLarge"||type==="pickupOversized")return 1.5;
    return 1;
  }

  /** Наземная доставка от площадки до порта. loc — запись из locations.js. */
  function landShippingFor(loc, type, offsite){
    if(!loc) return 0;
    const base = Number(loc.landPrice || loc.autoLand || 0) * landMultiplier(type);
    const suvExtra = (type==="suv"||type==="suvLarge") ? SUV_LAND_EXTRA : 0;
    return Math.ceil(base + suvExtra + APEX_LAND_SURCHARGE + (offsite ? OFFSITE_FEE : 0));
  }

  /** Морская перевозка от порта США до Европы. */
  function seaShippingFor(type, fuel, port){
    if(type==="moto") return 900;
    if(type==="atv") return 1200;
    let price = (SEA[port] && SEA[port].price) || 2400;
    if(type==="crossover") price += 100;
    else if(type==="suv"||type==="suvLarge") price += 300;
    else if(type==="pickup"||type==="pickupLarge"||type==="pickupOversized"||type==="vanLarge") price += 500;
    if(["hybrid","phev","electric"].includes(fuel)) price += 100;  // опасный груз
    return price;
  }

  function ageKey(year){let age=Math.max(0,YEAR_NOW-Number(year||YEAR_NOW));if(age<=2)return"0-2";if(age<=4)return"3-4";if(age<=6)return"5-6";if(age>=20)return"20+";return String(age)}
  function gasolineColumn(cc){if(cc<=1000)return 0;if(cc<=1500)return 1;if(cc<=2000)return 2;if(cc<=3000)return 3;return 4}
  function dieselColumn(cc){if(cc<=1500)return 0;if(cc<=2500)return 1;return 2}
  function fuelDiscount(fuel){if(fuel==="phev")return .5;if(fuel==="hybrid")return .75;return 1}
  function luxuryPct(mdl){let r=LUXURY_RATES.find(x=>mdl>=x.min&&mdl<=x.max);return r?r.pct:0}
  function insuranceFor(lotPrice, auctionFee){return Math.max(INSURANCE_MIN,(Number(lotPrice||0)+Number(auctionFee||0))*0.01)}
  function companyFeeFor(lotPrice, auctionFee){const base=Number(lotPrice||0)+Number(auctionFee||0);return base>40000?base*0.01:300}

  /* Мото, пикапы и van large — НДС 20%; электро — только налог на роскошь;
     остальные — акциз по объёму со скидкой для гибридов. */
  function customsMdl(customsBaseMdl, luxuryBaseMdl, opts){
    const type = opts.vehicleType || "sedan";
    const fuel = opts.fuel || "gasoline";
    if(type === "moto" || type === "pickup" || type === "vanLarge"){
      const vat = customsBaseMdl * 0.20;
      return {total:vat, baseExcise:vat, luxury:0, luxuryPct:0, luxuryBase:luxuryBaseMdl, vat:true};
    }
    const luxuryBase = Number(luxuryBaseMdl || 0);
    const pct = luxuryPct(luxuryBase);
    const luxury = luxuryBase >= 600000 ? luxuryBase * pct / 100 : 0;
    if(fuel === "electric"){
      return {total:luxury, baseExcise:0, luxury, luxuryPct:pct, luxuryBase};
    }
    const cc = Math.round(Number(opts.engineLiters || 2) * 1000);
    const key = ageKey(opts.year);
    const rate = fuel === "diesel" ? DIESEL_RATES[key][dieselColumn(cc)] : GASOLINE_RATES[key][gasolineColumn(cc)];
    const baseExcise = cc * rate * fuelDiscount(fuel);
    return {total:baseExcise + luxury, baseExcise, luxury, luxuryPct:pct, luxuryBase, cc, rate, discount:fuelDiscount(fuel)};
  }

  /**
   * Полный расчёт.
   * input: {lotPrice, auction, vehicleType, fuel, engineLiters, year,
   *         insurance(bool, по умолчанию true), exportDocs, offsite,
   *         location(запись locations.js) | port, usdMdl, eurMdl}
   */
  function compute(input){
    input = input || {};
    const lot = Number(input.lotPrice || 0);
    const auction = String(input.auction || "copart").toLowerCase();
    const type = input.vehicleType || "sedan";
    const fuel = input.fuel || "gasoline";
    const usdMdl = Number(input.usdMdl || 17.45);
    const eurMdl = Number(input.eurMdl || 20.28);
    const loc = input.location || null;
    const port = (loc && loc.autoPort) || input.port || "nj";

    const afd = auctionFeeFor(lot, auction);
    const auctionFee = afd.total;
    const land = landShippingFor(loc, type, input.offsite);
    const sea = seaShippingFor(type, fuel, port);
    const exportDocs = input.exportDocs ? EXPORT_DOCS_FEE : 0;
    const insuranceOn = input.insurance === undefined ? true : !!input.insurance;
    const insurance = insuranceOn ? insuranceFor(lot, auctionFee) : 0;
    const company = companyFeeFor(lot, auctionFee) + Number(input.marginUsd || 0);

    // Налог на роскошь и акциз считаются от: лот + сбор аукциона + море.
    // Суша по США и страховка в базу не входят.
    const baseMdl = (lot + auctionFee + sea) * usdMdl;
    const customs = customsMdl(baseMdl, baseMdl, {vehicleType:type, fuel, engineLiters:input.engineLiters, year:input.year});

    const totalUsdPart = lot + auctionFee + land + sea + exportDocs + insurance + company;
    const totalMdl = totalUsdPart * usdMdl + customs.total;
    const totalUsd = totalMdl / usdMdl;
    const totalEur = totalMdl / eurMdl;

    return {
      lot, auctionFee, auctionDetail:afd.detail, land, sea, exportDocs, insurance, company,
      customs, customsMdlValue:customs.total, customsUsd:customs.total / usdMdl,
      totalUsd, totalMdl, totalEur,
      usdMdl, eurMdl,
      route: loc ? (loc.displayName || "") : "",
      port: (loc && loc.portLabel) || (SEA[port] && SEA[port].label) || ""
    };
  }

  return {
    compute, auctionFeeFor, companyFeeFor, insuranceFor, customsMdl,
    landShippingFor, seaShippingFor, bodyClassForModel, isPluginHybrid, SEA, VERSION: "core-v6"
  };
});
