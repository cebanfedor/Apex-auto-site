const test = require("node:test");
const assert = require("node:assert");
const C = require("../calc-core.js");
const K = require("../korea-calc.js");

// 12.11.2026, правила Федора для авто из Кореи (Encar): первый платёж в USD вместе с машиной, второй — при получении (EUR + MDL).
const base = {priceUsd:15000, brand:"Kia", model:"Sportage", bodyId:5, fuelId:4, engineCc:2000, year:C.CUSTOMS_YEAR - 7, rules:"2027", usdMdl:18, eurMdl:20};

test("комиссия Apex в EUR по цене авто: ступени и границы", () => {
  const f = K.commissionEurFor;
  assert.strictEqual(f(5000), 300);
  assert.strictEqual(f(9999), 300);
  assert.strictEqual(f(10000), 400);
  assert.strictEqual(f(14999), 400);
  assert.strictEqual(f(15000), 500);
  assert.strictEqual(f(20000), 600);
  assert.strictEqual(f(25000), 700);
  assert.strictEqual(f(35000), 850);
  assert.strictEqual(f(45000), 1000);
  assert.strictEqual(f(80000), 1000);
});

test("кроссовер, бензин 2.0 л: первый платёж по списку, второй — доставка + комиссия + таможня + брокер", () => {
  const q = K.quote(base);
  assert.strictEqual(q.cls, "crossover");
  assert.strictEqual(q.first.car, 15000);
  assert.strictEqual(q.first.dealer, 350);
  assert.strictEqual(q.first.korea, 300);
  assert.strictEqual(q.first.port, 100);
  assert.strictEqual(q.first.euDelivery, 2100);
  assert.strictEqual(q.first.inspection, 0);
  assert.strictEqual(q.first.evExtra, 0);
  assert.strictEqual(q.first.payFee, Math.round((15000 + 350) * 0.01));   // 1% «комиссия на оплату» — вместе с брокером
  assert.strictEqual(q.first.subtotal, 15000 + 350 + 300 + 100 + 2100 + q.first.payFee);
  assert.strictEqual(q.second.deliveryEur, 1100);
  assert.strictEqual(q.second.commissionEur, 500);
  // возраст 7 лет, бензин 1.5–2.0 л → 23,68 лей/см³ (правила 2027)
  assert.strictEqual(q.third.customsMdl, Math.round(2000 * 23.68));
  assert.strictEqual(q.third.brokerMdl, 2000);
  // 2-й платёж — доставка и комиссия в EUR, 3-й — таможня и брокер в MDL; итог — сумма трёх
  assert.strictEqual(q.second.subtotalEur, 1100 + 500);
  assert.ok(Math.abs(q.second.subtotalUsd - 1600 * (20 / 18)) < 1e-6);
  assert.strictEqual(q.third.subtotalMdl, Math.round(2000 * 23.68) + 2000);
  assert.ok(Math.abs(q.third.subtotalUsd - (Math.round(2000 * 23.68) + 2000) / 18) < 1e-6);
  assert.ok(Math.abs(q.totalUsd - (q.first.subtotal + q.second.subtotalUsd + q.third.subtotalUsd)) < 1e-6);
});

test("доставка до Европы и при получении по классу: седан / кроссовер / внедорожник / минивэн", () => {
  const eu = {sedan:2000, crossover:2100, suv:2200, minivan:2600}, rc = {sedan:1000, crossover:1100, suv:1200, minivan:1300};
  for(const cls of ["sedan", "crossover", "suv", "minivan"]){
    const q = K.quote({...base, cls});
    assert.strictEqual(q.cls, cls);
    assert.strictEqual(q.first.euDelivery, eu[cls]);
    assert.strictEqual(q.second.deliveryEur, rc[cls]);
  }
});

test("осмотр +150 только по галочке; без галочки оплата в леях — без брокера", () => {
  assert.strictEqual(K.quote({...base, inspection:true}).first.inspection, 150);
  assert.strictEqual(K.quote(base).first.inspection, 0);
  const noMdl = K.quote({...base, payMdl:false});
  assert.strictEqual(noMdl.third.brokerMdl, 0);
  assert.strictEqual(K.quote(base).third.brokerMdl, 2000);
});

test("электромобиль: +300 к доставке (можно снять галочкой); engine_volume у EV не нужен", () => {
  const ev = {...base, fuelId:2, engineCc:111, brand:"Hyundai", model:"IONIQ 5", bodyId:11};
  const q = K.quote(ev);
  assert.strictEqual(q.isEv, true);
  assert.strictEqual(q.first.evExtra, 300);
  assert.strictEqual(q.cls, "crossover");
  assert.strictEqual(K.quote({...ev, evExtra:false}).first.evExtra, 0);
  assert.strictEqual(K.quote({...base, fuelId:4}).first.evExtra, 0);
  // без объёма у электро — расчёт не «неполный»
  assert.deepStrictEqual(K.quote({...ev, engineCc:0}).incomplete, []);
  // 2027: акциз по массе (лей/кг), ставка по возрасту и весу
  const y = C.CUSTOMS_YEAR - 1;
  const q27 = K.quote({...ev, year:y, curbKg:1900, rules:"2027"});
  assert.strictEqual(q27.customs.ev, true);
  assert.strictEqual(q27.third.customsMdl, Math.round(1900 * 15.59));
  // 2026: акциз на электро нулевой
  assert.strictEqual(K.quote({...ev, rules:"2026"}).third.customsMdl, 0);
});

test("дороже $50 000: доставка до Европы ×1,5, комиссия «1000 со звёздочкой»", () => {
  const q = K.quote({...base, priceUsd:60000});
  assert.strictEqual(q.high, true);
  assert.strictEqual(q.first.euDelivery, 2100 * 1.5);          // кроссовер
  assert.strictEqual(q.second.commissionEur, 1000);
  assert.strictEqual(q.second.commissionStar, true);
  const at50 = K.quote({...base, priceUsd:50000});
  assert.strictEqual(at50.high, false);                          // ровно $50 000 — ещё обычная цена
  assert.strictEqual(at50.first.euDelivery, 2100);
  assert.strictEqual(at50.second.commissionStar, false);
  assert.strictEqual(K.quote({...base, priceUsd:60000, cls:"suv"}).first.euDelivery, 3300);
});

test("1% комиссия на оплату — вместе с брокером: мин. $50, снимается той же галочкой", () => {
  assert.strictEqual(K.quote({...base, priceUsd:2000}).first.payFee, 50);                 // 1% = 23,5 → минимум
  assert.strictEqual(K.quote({...base, priceUsd:30000}).first.payFee, Math.round(30350 * 0.01));
  const off = K.quote({...base, payMdl:false});
  assert.strictEqual(off.first.payFee, 0);
  assert.strictEqual(off.third.brokerMdl, 0);
});

test("fromCar: осмотр по умолчанию включён, можно снять", () => {
  const car = {year:2022, brand:{name:"Kia"}, model:{name:"Sportage"}, body_type:{id:5}, fuel:{id:4}, engine_volume:1999, seats:5};
  assert.strictEqual(K.quote(K.fromCar(car, null, 20000, {})).first.inspection, 150);
  assert.strictEqual(K.quote(K.fromCar(car, null, 20000, {inspection:false})).first.inspection, 0);
});

test("грузовой транспорт: фургон на 1–3 места и пикап — НДС 20%, пассажирский минивэн — акциз", () => {
  const cargo = K.quote({...base, brand:"Chevrolet", model:"Damas", bodyId:7, seats:2});
  assert.strictEqual(cargo.pickup, true);
  assert.strictEqual(cargo.customs.vat, true);
  const pass = K.quote({...base, brand:"Kia", model:"Carnival", bodyId:7, seats:9});
  assert.strictEqual(pass.pickup, false);
  assert.ok(!pass.customs.vat);
  assert.strictEqual(K.quote({...base, brand:"Kia", model:"Bongo", bodyId:4}).pickup, true);
  assert.strictEqual(K.quote({...base, brand:"Hyundai", model:"Porter", bodyId:4}).customs.vat, true);
});

test("топливо Encar → тип для таможни: plug-in по названию, mild-hybrid = бензин", () => {
  const f = (o) => K.fuelKind({brand:"Kia", model:"Sorento", year:2022, ...o});
  assert.strictEqual(f({fuelId:1}), "diesel");
  assert.strictEqual(f({fuelId:2}), "electric");
  assert.strictEqual(f({fuelId:7}), "electric");
  assert.strictEqual(f({fuelId:4}), "gasoline");
  assert.strictEqual(f({fuelId:5}), "gasoline");
  assert.strictEqual(f({fuelId:3, title:"Sorento 4Th Generation Hev 1.6 2Wd Noblesse"}), "hybrid");
  assert.strictEqual(f({fuelId:3, title:"Sorento Phev 1.6 Signature"}), "phev");
  assert.strictEqual(f({fuelId:3, badge:"MHEV 48V"}), "gasoline");
});

test("пикап: цена как у внедорожника, растаможка НДС 20% (как у пикапов США), без акциза по объёму", () => {
  const q = K.quote({...base, brand:"SsangYong", model:"Rexton Sports", bodyId:4});
  assert.strictEqual(q.cls, "suv");
  assert.strictEqual(q.pickup, true);
  assert.strictEqual(q.first.euDelivery, 2200);
  assert.strictEqual(q.customs.vat, true);
  const baseMdl = (q.first.car + q.first.dealer + q.first.korea + q.first.port + q.first.euDelivery) * 18;
  assert.strictEqual(q.third.customsMdl, Math.round(baseMdl * 0.2));
});

test("нет объёма двигателя (не электро) или года — растаможку не угадываем, расчёт помечен неполным", () => {
  assert.deepStrictEqual(K.quote({...base, engineCc:0}).incomplete, ["engine"]);
  assert.strictEqual(K.quote({...base, engineCc:0}).third.customsMdl, 0);
  assert.deepStrictEqual(K.quote({...base, year:0}).incomplete, ["year"]);
});

test("размер: кузов Encar часто врёт — таблица моделей главнее", () => {
  const sc = (brand, model, bodyId, title) => K.sizeClass({brand, model, bodyId, title}).cls;
  assert.strictEqual(sc("Hyundai", "Sonata", 5), "sedan");              // у Encar бывает «suv»
  assert.strictEqual(sc("Hyundai", "Grandeur", 5), "sedan");
  assert.strictEqual(sc("Hyundai", "IONIQ 5", 11), "crossover");        // у Encar «хэтчбек»
  assert.strictEqual(sc("Kia", "EV6", 11), "crossover");
  assert.strictEqual(sc("Kia", "Carnival", 7), "minivan");
  assert.strictEqual(sc("Hyundai", "Staria", 7), "minivan");
  assert.strictEqual(sc("Hyundai", "Santa Fe", 5), "suv");
  assert.strictEqual(sc("Kia", "Sorento", 5), "suv");
  assert.strictEqual(sc("Kia", "Sportage", 5), "crossover");
  assert.strictEqual(sc("Hyundai", "Tucson", 5), "crossover");
  assert.strictEqual(sc("Genesis", "GV80", 5), "suv");
  assert.strictEqual(sc("SsangYong", "Tivoli", 5), "crossover");
  assert.strictEqual(sc("SsangYong", "Torres", 5), "suv");
  assert.strictEqual(sc("Renault Samsung", "QM6", 5), "crossover");
  assert.strictEqual(sc("Toyota", "Corolla Cross", 5), "crossover");    // не путать с седаном Corolla
  assert.strictEqual(sc("BMW", "X5", 5), "suv");                        // общая таблица США
  assert.strictEqual(sc("Mercedes-Benz", "GLC-klasse", 5), "crossover");
  assert.strictEqual(sc("Porsche", "Macan", 5), "crossover");
  assert.strictEqual(sc("Tesla", "Model Y", 5), "crossover");
  assert.strictEqual(sc("Tesla", "Model 3", 1), "sedan");
  assert.strictEqual(sc("BMW", "5er", 1), "sedan");
  // неизвестная модель: по кузову Encar (как в США: неизвестный SUV — внедорожник)
  assert.strictEqual(sc("Unknown", "Zzz", 5), "suv");
  assert.strictEqual(sc("Unknown", "Zzz", 7), "minivan");
  assert.strictEqual(sc("Unknown", "Zzz", 11), "sedan");
  // модель не заполнена — берём из названия
  assert.strictEqual(sc("Genesis", null, 1, "G80 Electrified"), "sedan");
  assert.strictEqual(sc("Mercedes-Benz", null, 5, "GLC 300 4Matic"), "crossover");
});

test("налог на роскошь — отдельной суммой, в итоге растаможки сумма акциза и налога", () => {
  const q = K.quote({...base, priceUsd:40000, engineCc:2000});
  assert.ok(q.third.luxuryMdl > 0);
  assert.strictEqual(q.third.customsMdl, q.third.exciseMdl + q.third.luxuryMdl);
  assert.strictEqual(q.third.exciseMdl, Math.round(2000 * 23.68));
  const cheap = K.quote({...base, priceUsd:10000});
  assert.strictEqual(cheap.third.luxuryMdl, 0);
});

test("Корея: растаможка всегда по правилам 2027, выбор 2026/2027 для США её не меняет", () => {
  C.setCustomsRules("2026");
  const noRules = {...base}; delete noRules.rules;
  const q = K.quote(noRules);
  assert.strictEqual(q.customs.rules, "2027");
  assert.strictEqual(q.third.customsMdl, Math.round(2000 * 23.68));
  assert.strictEqual(K.fromCar({year:2022, brand:{name:"Kia"}, model:{name:"Sportage"}, body_type:{id:5}, fuel:{id:4}, engine_volume:1999}, null, 20000, {}).rules, "2027");
  C.setCustomsRules("2027");
});
