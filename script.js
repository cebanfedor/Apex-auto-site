
const SEA={nj:{label:"Elizabeth, NJ",price:2400},savannah:{label:"Savannah, GA",price:2400},houston:{label:"Houston, TX",price:2600},indianapolis:{label:"Indianapolis, IN",price:2600},la:{label:"Los Angeles, CA",price:3150}};
const YEAR_NOW=new Date().getFullYear();
const GASOLINE_RATES={"0-2":[9.56,12.23,18.90,31.14,55.60],"3-4":[10,12.67,19.34,31.68,56.04],"5-6":[10.23,12.90,19.57,31.81,56.27],"7":[11.25,14.19,21.53,34.99,61.90],"8":[12.38,15.61,23.68,38.49,68.09],"9":[13.62,17.17,26.05,42.34,74.90],"10":[16.34,20.60,31.26,50.81,89.87],"11":[21.24,26.79,40.63,66.05,116.84],"12":[26.24,31.79,45.79,71.05,121.84],"13":[31.24,36.79,50.63,76.05,126.84],"14":[36.24,41.79,55.63,81.05,131.84],"15":[41.24,46.79,60.63,86.05,136.84],"16":[46.24,51.79,65.63,91.05,141.84],"17":[51.24,56.79,70.63,96.05,146.84],"18":[56.24,61.79,75.63,101.05,151.84],"19":[61.24,66.79,80.63,106.05,156.84],"20+":[66.24,71.79,85.63,111.05,161.84]};
const DIESEL_RATES={"0-2":[12.23,31.14,55.60],"3-4":[12.67,31.58,56.04],"5-6":[12.90,31.81,56.27],"7":[14.19,34.99,61.90],"8":[15.61,38.49,68.90],"9":[17.17,42.34,74.90],"10":[20.60,50.81,89.87],"11":[26.79,66.05,116.84],"12":[31.79,71.05,121.84],"13":[36.79,76.05,126.84],"14":[41.79,81.05,131.84],"15":[46.79,86.05,136.84],"16":[51.79,91.05,141.84],"17":[56.79,96.05,146.84],"18":[61.79,101.05,151.84],"19":[66.79,106.05,156.84],"20+":[71.79,111.05,161.84]};
const LUXURY_RATES=[{min:600000,max:700000,pct:2},{min:700001,max:800000,pct:3},{min:800001,max:900000,pct:4},{min:900001,max:1000000,pct:5},{min:1000001,max:1200000,pct:6},{min:1200001,max:1400000,pct:7},{min:1400001,max:1600000,pct:8},{min:1600001,max:1800000,pct:9},{min:1800001,max:Infinity,pct:10}];
const AUCTION_FEE_POINTS=[[0,300],[1000,450],[3000,700],[5000,925],[10000,1100],[15000,1250],[20000,1550],[30000,2150],[50000,3300],[75000,4700],[100000,6000]];
const $=id=>document.getElementById(id),num=id=>Number($(id)?.value||0);let currency="usd",selectedLocation=null,lastCalc=null,lastImportedLot=null,lotImportApiStatus="";
const KNOWN_LOTS_V119={
  "45617472":{
    auction:"iaai",
    lotNumber:"45617472",
    stockNumber:"45119856",
    year:2025,
    title:"2025 BMW 230I XDRIVE",
    fuel:"gasoline",
    vehicleType:"sedan",
    engineLiters:"2.0",
    branch:"Cleveland (OH)",
    damage:"Rear / Left Side",
    document:"SALVAGE (Ohio)",
    odometer:"10,798 mi",
    vin:"3MW33CM03S8******",
    priceNote:"IAAI не показывает текущую ставку без buyer/login доступа. Для точного итога укажите свою максимальную ставку в поле стоимости лота."
  }
};
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
function moneyUsd(v){return "$"+Math.round(v||0).toLocaleString("en-US")}function moneyMdl(v){return Math.round(v||0).toLocaleString("ru-RU")+" MDL"}function moneyEur(v){return "€"+Math.round(v||0).toLocaleString("en-US")}
function usdToMdl(v){return v*num("usdMdl")}function mdlToUsd(v){return v/num("usdMdl")}function mdlToEur(v){return v/num("eurMdl")}
function displayUsd(usd){if(currency==="mdl")return moneyMdl(usdToMdl(usd));if(currency==="eur")return moneyEur(usdToMdl(usd)/num("eurMdl"));return moneyUsd(usd)}
function displayMdl(mdl){if(currency==="mdl")return moneyMdl(mdl);if(currency==="eur")return moneyEur(mdlToEur(mdl));return moneyUsd(mdlToUsd(mdl))}
function interpolateFee(price){if(price<=0)return 0;for(let i=0;i<AUCTION_FEE_POINTS.length-1;i++){let [x1,y1]=AUCTION_FEE_POINTS[i],[x2,y2]=AUCTION_FEE_POINTS[i+1];if(price>=x1&&price<=x2){let fee=y1+(y2-y1)*((price-x1)/(x2-x1));return Math.ceil(fee/10)*10}}return Math.ceil(price*0.06/10)*10}
function calculateAuctionFeeFor(price, auction){
  let total=interpolateFee(price);
  if(auction==="iaai")total+=50;
  if(auction==="manheim"){
    if(price<=5000)total=820;
    else if(price<=15000)total=1070;
    else if(price<=30000)total=1570;
    else total=Math.max(1570,Math.ceil(price*.08/10)*10+370);
  }
  return{total,detail:""};
}
function calculateAuctionFee(){return calculateAuctionFeeFor(num("lotPrice"), $("auction")?.value||"copart")}
function initYears(){const y=$("year");if(!y)return;y.innerHTML="";for(let year=YEAR_NOW;year>=1980;year--){let o=document.createElement("option");o.value=year;o.textContent=year;if(year===YEAR_NOW)o.selected=true;y.appendChild(o)}refreshGlassSelect(y)}
function initLiters(){const e=$("engineLiters");if(!e)return;e.innerHTML="";for(let i=1;i<=70;i++){let v=(i/10).toFixed(1),o=document.createElement("option");o.value=v;o.textContent=`${v} л`;if(v==="2.0")o.selected=true;e.appendChild(o)}refreshGlassSelect(e)}
function normalizeAuction(v){return String(v||"").toLowerCase().replace(/\s+/g,"")}function matchesAuction(item){let a=normalizeAuction(item.auction),s=$("auction")?.value||"copart";if(s==="copart")return a.includes("copart");if(s==="iaai")return a.includes("iaai");return a.includes("manheim")||a.includes("manhei")}
function getFilteredLocations(){return (window.LOCATIONS||[]).filter(matchesAuction)}
function initLocations(){let select=$("location");if(!select)return;select.innerHTML='<option value="">Выбери локацию</option>';getFilteredLocations().forEach((item,i)=>{let o=document.createElement("option");o.value=String(i);o.textContent=item.displayName||"Локация";select.appendChild(o)});refreshGlassSelect(select)}
function updateLocation(){let locationEl=$("location");if(!locationEl)return;let idx=locationEl.value;selectedLocation=idx===""?null:getFilteredLocations()[Number(idx)];if(!selectedLocation){if($("portView"))$("portView").value="—";if($("landView"))$("landView").value="0";return}if($("portView"))$("portView").value=selectedLocation.portLabel||SEA[selectedLocation.autoPort]?.label||"—";if($("landView"))$("landView").value=getLandShipping().toFixed(0)}
function getLandMultiplier(){let t=$("vehicleType")?.value||"sedan";if(t==="suvLarge"||t==="pickupLarge")return 1.5;if(t==="vanLarge"||t==="pickupOversized")return 2;return 1}
function getLandShipping(){if(!selectedLocation)return 0;const base=Number(selectedLocation.landPrice||selectedLocation.autoLand||0)*getLandMultiplier();const apexSurcharge=100;const offsite=$("offsite")&&$("offsite").checked?100:0;return Math.ceil(base+apexSurcharge+offsite)}
function getSeaShipping(){let type=$("vehicleType")?.value||"sedan",fuel=$("fuel")?.value||"gasoline";if(type==="moto")return 900;if(type==="atv")return 1200;let port=selectedLocation?.autoPort||"nj",price=SEA[port]?.price||2400,green=["hybrid","phev","electric"].includes(fuel);if(type==="crossover")price+=green?300:200;else if(type==="suv"||type==="suvLarge")price+=300;else if(type==="pickup"||type==="pickupLarge"||type==="pickupOversized"||type==="vanLarge")price+=500;else if(green)price+=100;return price}
function ageKey(){let age=Math.max(0,YEAR_NOW-num("year"));if(age<=2)return"0-2";if(age<=4)return"3-4";if(age<=6)return"5-6";if(age>=20)return"20+";return String(age)}
function gasolineColumn(cc){if(cc<=1000)return 0;if(cc<=1500)return 1;if(cc<=2000)return 2;if(cc<=3000)return 3;return 4}function dieselColumn(cc){if(cc<=1500)return 0;if(cc<=2500)return 1;return 2}
function fuelDiscount(){let f=$("fuel")?.value||"gasoline";if(f==="phev")return .5;if(f==="hybrid")return .75;return 1}function luxuryPct(mdl){let r=LUXURY_RATES.find(x=>mdl>=x.min&&mdl<=x.max);return r?r.pct:0}
function updateHybridGuard(data){
  const box = $("hybridGuard");
  if(!box) return;
  box.hidden = true;
  box.classList.remove("isPhevV125");
}

function closeGlassSelects(except){
  document.querySelectorAll(".glassSelectV152.isOpenV152").forEach(item => {
    if(item !== except) item.classList.remove("isOpenV152");
  });
}

function refreshGlassSelect(select){
  if(!select) return;
  let wrap = select.nextElementSibling?.classList?.contains("glassSelectV152") ? select.nextElementSibling : null;
  if(!wrap){
    select.classList.add("nativeSelectV152");
    wrap = document.createElement("div");
    wrap.className = "glassSelectV152";
    wrap.innerHTML = '<button class="glassSelectButtonV152" type="button"><span></span><b></b></button><div class="glassSelectMenuV152"></div>';
    select.insertAdjacentElement("afterend", wrap);
    wrap.querySelector("button").addEventListener("click", event => {
      event.preventDefault();
      closeGlassSelects(wrap);
      wrap.classList.toggle("isOpenV152");
    });
    wrap.querySelector(".glassSelectMenuV152").addEventListener("click", event => {
      const item = event.target.closest("[data-value]");
      if(!item) return;
      event.preventDefault();
      select.value = item.dataset.value;
      select.dispatchEvent(new Event("change", {bubbles:true}));
      closeGlassSelects();
      refreshGlassSelect(select);
    });
  }

  const buttonText = wrap.querySelector(".glassSelectButtonV152 span");
  const menu = wrap.querySelector(".glassSelectMenuV152");
  const options = Array.from(select.options || []);
  const signature = options.map(option => `${option.value}:${option.textContent}`).join("|");
  const selected = options.find(option => option.selected) || options[0];
  buttonText.textContent = selected ? selected.textContent : "";

  if(wrap.dataset.signature === signature){
    menu.querySelectorAll("[data-value]").forEach(item => {
      item.classList.toggle("isSelectedV152", item.dataset.value === select.value);
    });
    return;
  }

  wrap.dataset.signature = signature;
  menu.innerHTML = options.map(option => `
    <button class="${option.value === select.value ? "isSelectedV152" : ""}" type="button" data-value="${escapeHtml(option.value)}">
      <span>${option.value === select.value ? "✓" : ""}</span>${escapeHtml(option.textContent)}
    </button>
  `).join("");

}

function refreshGlassSelects(){
  document.querySelectorAll("select").forEach(refreshGlassSelect);
}

document.addEventListener("click", event => {
  if(!event.target.closest(".glassSelectV152")) closeGlassSelects();
});

function customsMdl(customsBaseMdl, luxuryBaseMdl){
  const type = $("vehicleType")?.value || "sedan";
  const fuel = $("fuel")?.value || "gasoline";

  // Мото и пикапы:
  // НДС 20% считается от: стоимость лота + аукционный сбор + доставка морем.
  // Доставка по США, страховка и прочие расходы в базу не входят.
  // Для пикапа правило одинаковое, даже если он электрический.
  if(type === "moto" || type === "pickup"){
    const vat = customsBaseMdl * 0.20;
    return {
      total: vat,
      baseExcise: vat,
      luxury: 0,
      luxuryPct: 0,
      luxuryBase: luxuryBaseMdl,
      text: "НДС 20% от таможенной стоимости"
    };
  }

  const luxuryBase = Number(luxuryBaseMdl || 0);
  const pct = luxuryPct(luxuryBase);
  const luxury = luxuryBase >= 600000 ? luxuryBase * pct / 100 : 0;

  if(fuel === "electric"){
    return {
      total: luxury,
      baseExcise: 0,
      luxury,
      luxuryPct: pct,
      luxuryBase,
      text: luxury > 0
        ? `электро: акциз 0 · люкс ${pct}% от ${(Math.round(luxuryBase)).toLocaleString("ru-RU")} MDL`
        : `электро: акциз 0 · люкс 0%`
    };
  }

  const cc = Math.round(num("engineLiters") * 1000);
  const key = ageKey();
  const rate = fuel === "diesel"
    ? DIESEL_RATES[key][dieselColumn(cc)]
    : GASOLINE_RATES[key][gasolineColumn(cc)];

  const baseExcise = cc * rate * fuelDiscount();
  const discount = fuel === "hybrid" ? " · гибрид -25%" : fuel === "phev" ? " · plug-in -50%" : "";

  return {
    total: baseExcise + luxury,
    baseExcise,
    luxury,
    luxuryPct: pct,
    luxuryBase,
    text: luxury > 0
      ? `${cc} см³ × ${rate} MDL/см³${discount} · люкс ${pct}%`
      : `${cc} см³ × ${rate} MDL/см³${discount} · люкс 0%`
  };
}


function companyFeeFor(lotPrice, auctionFee = 0){
  const base = Number(lotPrice || 0) + Number(auctionFee || 0);
  if(base > 40000){
    return base * 0.01;
  }
  return 300;
}

function companyFee(auctionFee = 0){
  return companyFeeFor(num("lotPrice"), auctionFee);
}

function row(name,value,detail,type="usd"){
  let shown = type === "mdl" ? displayMdl(value) : displayUsd(value);
  return `<div class="row"><span>${escapeHtml(name)}${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span><b>${escapeHtml(shown)}</b></div>`;
}

function numberFromText(value){
  const number = String(value || "").replace(/[^\d.]/g, "");
  return Number(number) || 0;
}

function riskTag(text, pattern, label, points, advice){
  return pattern.test(text) ? {label, points, advice} : null;
}

function buildSmartLotAdvice(totalUsd){
  const data = lastImportedLot;
  if(!data?.original) return null;

  const text = [
    data.title,
    data.damage,
    data.document,
    data.condition,
    data.seller,
    data.fuel,
    data.vehicleType
  ].filter(Boolean).join(" ").toLowerCase();

  const odometer = numberFromText(data.odometer);
  const acv = Number(data.actualCashValue || 0);
  const currentBid = Number(data.currentBid || num("lotPrice") || 0);
  const isElectric = data.fuel === "electric" || /\belectric\b|электро|tesla|model\s+[3syx]/i.test(text);
  const isPhev = data.fuel === "phev" || /phev|plug/i.test(text);
  const isRunDrive = /run\s*&?\s*drive|run and drive|starts|завод/i.test(text);
  const hasAirbagOrPyro = /airbag|airbags|deployed|restraint|srs|pyro|пиропатрон|подуш/i.test(text);
  const hasKeyIssue = /keys?\s*(missing|not available|no)|without keys?|key missing|no key|ключ/i.test(text);
  const hasMechanical = /mechanical|engine damage|motor damage|transmission/i.test(text);
  const hasWater = /water|flood/i.test(text);
  const hasHeavyFront = /front end|front[-\s]?end|all over/i.test(text) && /frame|structural|mechanical/i.test(text);
  const exportDocsRequired = needsExportDocuments(data);
  const damageAdvice = hasHeavyFront
    ? "оценить геометрию, безопасность и стоимость ремонта"
    : "оценить стоимость кузовного ремонта по фото";
  const risks = [
    riskTag(text, /water|flood|biohazard|burn|fire|missing|stripped|rollover/i, "сильный риск по повреждениям", 35, "проверить фото, историю и стоимость восстановления до ставки"),
    exportDocsRequired ? {label:"документы требуют доп. оформления", points:18, advice:"учесть экспортные документы и срок оформления"} : null,
    riskTag(text, /front end|side|rear|left|right/i, "есть кузовные повреждения", 10, damageAdvice),
    isPhev ? {label:"Plug-in Hybrid", points:-8, advice:"растаможка выгоднее обычного гибрида"} : null,
    isElectric ? {label:"электро", points:-10, advice:"нулевая таможня по акцизу"} : null
  ].filter(Boolean);

  if(isElectric && !isRunDrive && !hasAirbagOrPyro && !hasKeyIssue){
    risks.push({label:"электро без Run & Drive", points:24, advice:"проверить батарею, зарядную часть и статус запуска"});
  }

  if(hasMechanical || hasWater || hasHeavyFront){
    risks.push({label:"риск двигателя / запуска", points:22, advice:"проверить запуск, двигатель и ходовую часть до ставки"});
  }

  if(odometer > 120000) risks.push({label:"большой пробег", points:14, advice:"проверить обслуживание и износ ходовой"});
  if(acv && totalUsd > acv * 0.92) risks.push({label:"итог близко к ACV", points:16, advice:"экономия может быть слабой после ремонта"});
  if(acv && currentBid > acv * 0.55) risks.push({label:"ставка уже высокая", points:18, advice:"дальше играть осторожно"});

  let score = 58 - risks.reduce((sum, item) => sum + item.points, 0);
  if(acv && totalUsd < acv * 0.72) score += 10;
  if(data.vin) score += 4;
  if(data.currentBid) score += 4;
  score = Math.max(5, Math.min(92, Math.round(score)));

  const seriousRisk = risks.some(item => item.points >= 30);
  const verdict = seriousRisk || score < 38
    ? "Играть только после проверки"
    : score < 58
      ? "Можно рассматривать осторожно"
      : "Хороший кандидат для проверки";

  const tone = seriousRisk || score < 38 ? "risk" : score < 58 ? "watch" : "good";
  const reasons = risks
    .sort((a,b) => b.points - a.points)
    .slice(0, 3)
    .map(item => item.advice);

  if(acv && totalUsd){
    const ratio = Math.round(totalUsd / acv * 100);
    reasons.unshift(`ориентир: текущий итог около ${ratio}% от ACV`);
  }

  return {
    verdict,
    tone,
    score,
    acv,
    currentBid,
    reasons: [...new Set(reasons)].slice(0, 4)
  };
}

function renderSmartLotAdvice(totalUsd){
  const box = $("smartLotAdvice");
  if(!box) return null;
  const advice = buildSmartLotAdvice(totalUsd);
  if(!advice){
    box.hidden = true;
    box.innerHTML = "";
    return null;
  }

  box.hidden = false;
  box.className = `smartLotAdviceV129 calcWideAdviceV146 is-${advice.tone}`;
  const bidLine = "Лимит ставки: после проверки рынка и ремонта";
  const acvLine = advice.acv ? ` · ACV: ${moneyUsd(advice.acv)}` : "";
  const currentLine = advice.currentBid ? `текущая ставка: ${moneyUsd(advice.currentBid)}` : "текущая ставка не указана";
  box.innerHTML = `
    <div class="smartHeadV129">
      <span>Оценка лота</span>
      <b>${escapeHtml(advice.score)}/100</b>
    </div>
    <strong>${escapeHtml(advice.verdict)}</strong>
    <p>${escapeHtml(`${bidLine}${acvLine} · ${currentLine}`)}</p>
    <ul>
      ${advice.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}
    </ul>
  `;
  return advice;
}

function estimateTotalUsdForBid(bid){
  const auction = $("auction")?.value || "copart";
  const afd = calculateAuctionFeeFor(Number(bid || 0), auction);
  const auctionFee = afd.total;
  const land = getLandShipping();
  const sea = getSeaShipping();
  const exportDocs = $("exportDocs")?.checked ? 400 : 0;
  const insurance = $("insurance")?.checked ? (Number(bid || 0) + auctionFee) * 0.01 : 0;
  const company = companyFeeFor(Number(bid || 0), auctionFee);
  const customsBaseMdl = usdToMdl(Number(bid || 0) + auctionFee + sea);
  const customs = customsMdl(customsBaseMdl, customsBaseMdl);
  const totalUsdPart = Number(bid || 0) + auctionFee + land + sea + exportDocs + insurance + company;
  return mdlToUsd(usdToMdl(totalUsdPart) + customs.total);
}

function bidForTargetTotal(targetTotal){
  const target = Number(targetTotal || 0);
  if(target <= 0) return 0;
  let low = 0;
  let high = 150000;
  for(let i=0;i<30;i++){
    const mid = (low + high) / 2;
    if(estimateTotalUsdForBid(mid) <= target) low = mid;
    else high = mid;
  }
  return Math.max(0, Math.floor(low / 100) * 100);
}

function renderBidAdvisor(totalUsd){
  const box = $("bidAdvisorResult");
  if(!box) return null;

  const marketMin = num("marketMin");
  const marketMax = num("marketMax");
  const repairMin = num("repairMin");
  const repairMax = num("repairMax");
  const targetSavings = num("targetSavings") || 0;
  const currentBid = num("lotPrice");

  if(!marketMin || !marketMax || !repairMin || !repairMax){
    box.className = "bidAdvisorResultV138 is-empty";
    box.innerHTML = "Заполните рынок Молдовы и ремонт, чтобы увидеть диапазон разумной ставки.";
    return null;
  }

  const conservativeTarget = marketMin - repairMax - targetSavings;
  const optimisticTarget = marketMax - repairMin - targetSavings;
  const bidLow = bidForTargetTotal(conservativeTarget);
  const bidHigh = bidForTargetTotal(optimisticTarget);
  const afterRepairLow = totalUsd + repairMin;
  const afterRepairHigh = totalUsd + repairMax;
  const savingLow = marketMin - afterRepairHigh;
  const savingHigh = marketMax - afterRepairLow;
  const isGood = currentBid <= bidHigh && savingLow >= targetSavings * .55;
  const isWeak = currentBid > bidHigh || savingHigh < targetSavings;
  const verdict = isWeak
    ? "Выгода слабая"
    : isGood
      ? "Лот имеет смысл торговать"
      : "Можно рассматривать осторожно";

  box.className = `bidAdvisorResultV138 ${isWeak ? "is-risk" : isGood ? "is-good" : "is-watch"}`;
  box.innerHTML = `
    <strong>${escapeHtml(verdict)}</strong>
    <p>Разумный диапазон ставки: <b>${escapeHtml(moneyUsd(bidLow))}–${escapeHtml(moneyUsd(Math.max(bidLow, bidHigh)))}</b></p>
    <p>Итог после ремонта при текущей ставке: ${escapeHtml(moneyUsd(afterRepairLow))}–${escapeHtml(moneyUsd(afterRepairHigh))}</p>
    <p>Потенциальная экономия к рынку: ${escapeHtml(moneyUsd(savingLow))}–${escapeHtml(moneyUsd(savingHigh))}</p>
  `;

  return {verdict, bidLow, bidHigh:Math.max(bidLow,bidHigh), afterRepairLow, afterRepairHigh, savingLow, savingHigh};
}

function renderAiBidAdvice(advice, mode){
  const box = $("bidAdvisorResult");
  if(!box || !advice) return;
  const tone = advice.confidence === "high" ? "is-good" : advice.confidence === "medium" ? "is-watch" : "is-risk";
  const normalizedVerdict = ["low","medium","high"].includes(String(advice.verdict || "").toLowerCase())
    ? (advice.confidence === "high" ? "Лот выглядит интересным" : advice.confidence === "medium" ? "Можно рассматривать осторожно" : "Нужна история похожих продаж")
    : (advice.verdict || "AI оценка");
  const bidText = advice.bidMin && advice.bidMax
    ? `<p>AI диапазон ставки: <b>${escapeHtml(moneyUsd(advice.bidMin))}–${escapeHtml(moneyUsd(advice.bidMax))}</b></p>`
    : "";
  const marketText = advice.marketMin && advice.marketMax
    ? `<p>Рынок Молдовы: ${escapeHtml(moneyUsd(advice.marketMin))}–${escapeHtml(moneyUsd(advice.marketMax))}</p>`
    : "";
  const repairText = advice.repairMin && advice.repairMax
    ? `<p>Ориентир ремонта: ${escapeHtml(moneyUsd(advice.repairMin))}–${escapeHtml(moneyUsd(advice.repairMax))}</p>`
    : "";
  const savingsText = Number.isFinite(Number(advice.savingsMin)) && Number.isFinite(Number(advice.savingsMax))
    ? `<p>Потенциальная экономия: ${escapeHtml(moneyUsd(advice.savingsMin))}–${escapeHtml(moneyUsd(advice.savingsMax))}</p>`
    : "";
  const soldCompsText = (advice.soldComps || []).length
    ? `<p>Похожие продажи: ${(advice.soldComps || []).slice(0, 3).map(comp => `${escapeHtml(comp.title || "лот")} ${escapeHtml(moneyUsd(comp.salePrice || 0))}`).join(" · ")}</p>`
    : `<p class="aiWarningsV139">Похожих проданных лотов пока недостаточно для уверенной ставки.</p>`;
  box.className = `bidAdvisorResultV138 ${tone}`;
  box.innerHTML = `
    <strong>${escapeHtml(normalizedVerdict)}</strong>
    <p>${escapeHtml(advice.summary || "")}</p>
    ${soldCompsText}
    ${marketText}
    ${bidText}
    ${repairText}
    ${savingsText}
    ${(advice.reasons || []).length ? `<ul>${advice.reasons.slice(0, 4).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    ${(advice.warnings || []).length ? `<p class="aiWarningsV139">${escapeHtml(advice.warnings.slice(0, 2).join(" · "))}</p>` : ""}
    ${(advice.sources || []).length ? `<div class="aiSourcesV139">${advice.sources.slice(0, 3).map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.title || "Источник")}</a>`).join("")}</div>` : ""}
    ${mode === "fallback" ? `<p class="aiWarningsV139">AI-режим включится после подключения OPENAI_API_KEY.</p>` : ""}
  `;
}

function collectAiBidPayload(){
  if(!lastCalc) calculate();
  const lot = lastImportedLot || {};
  return {
    lot,
    calculation:{
      totalUsd:lastCalc?.totalUsd || 0,
      lotPrice:num("lotPrice"),
      auction:$("auction")?.value || "",
      route:lastCalc?.route || "",
      rows:(lastCalc?.rows || []).map(row => ({name:row[0], value:row[1], detail:row[2], currency:row[3]}))
    },
    market:{
      marketMin:num("marketMin"),
      marketMax:num("marketMax"),
      repairMin:num("repairMin"),
      repairMax:num("repairMax"),
      targetSavings:num("targetSavings")
    },
    form:{
      fuel:$("fuel")?.value || "",
      vehicleType:$("vehicleType")?.value || "",
      engineLiters:$("engineLiters")?.value || "",
      year:$("year")?.value || "",
      exportDocs:Boolean($("exportDocs")?.checked),
      insurance:Boolean($("insurance")?.checked)
    }
  };
}

async function requestAiBidAdvice(){
  const button = $("aiBidBtn");
  const box = $("bidAdvisorResult");
  if(button) button.disabled = true;
  if(button) button.textContent = "AI считает...";
  if(box){
    box.className = "bidAdvisorResultV138 is-watch";
    box.innerHTML = "AI анализирует лот, расчет, рынок и ремонт...";
  }
  try{
    const response = await fetch("/api/bid-advice", {
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(collectAiBidPayload())
    });
    const data = await response.json();
    if(!response.ok || !data.ok) throw new Error(data.details || data.error || "AI advice failed");
    renderAiBidAdvice(data.advice, data.mode);
  }catch(error){
    if(box){
      box.className = "bidAdvisorResultV138 is-risk";
      box.innerHTML = `AI-рекомендация сейчас недоступна.${error?.message ? ` ${escapeHtml(error.message)}` : ""}`;
    }
  }finally{
    if(button) button.disabled = false;
    if(button) button.textContent = "AI оценить ставку";
  }
}

function lotImportText(value){
  return decodeURIComponent(String(value || ""))
    .replace(/https?:\/\//ig, " ")
    .replace(/[/?#=&_.+~%-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAuctionFromLink(value){
  const text = String(value || "").toLowerCase();
  if(text.includes("copart.")) return "copart";
  if(text.includes("iaai.") || text.includes("ca.iaai.")) return "iaai";
  if(text.includes("manheim.")) return "manheim";
  return "";
}

function detectLotNumber(value){
  const text = String(value || "");
  const explicit = text.match(/(?:lot(?:number|no)?|stock|item|vehicleid|vehicleid=|auctionid|id)[^\d]{0,12}(\d{6,12})/i);
  if(explicit) return explicit[1];
  const candidates = text.match(/\b\d{7,12}\b/g) || [];
  return candidates[0] || "";
}

function detectVin(value){
  const match = String(value || "").toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  return match ? match[0] : "";
}

function detectYearFromText(value){
  const current = YEAR_NOW + 1;
  const years = String(value || "").match(/\b(19[8-9]\d|20[0-3]\d)\b/g) || [];
  return years.map(Number).find(year => year >= 1980 && year <= current) || 0;
}

function detectEngineLitersFromText(value){
  const text = String(value || "").toLowerCase();
  const match = text.match(/\b([1-6](?:[.,]\d)?)\s*l\b/i);
  if(match) return match[1].replace(",", ".");
  if(/\bs\s*550\b|\bs-550\b|\bs550\b/.test(text)) return "4.7";
  if(/\bs\s*580\b|\bs-580\b|\bs580\b/.test(text)) return "4.0";
  if(/\bs\s*63\b|\bs-63\b|\bs63\b/.test(text)) return "4.0";
  if(/\bs\s*65\b|\bs-65\b|\bs65\b/.test(text)) return "6.0";
  return "";
}

function mergeLotData(base, ...sources){
  const merged = {...(base || {})};
  sources.forEach(source => {
    Object.entries(source || {}).forEach(([key, value]) => {
      const empty = value === "" || value === null || value === undefined || value === 0;
      if(!empty) merged[key] = value;
    });
  });
  return merged;
}

function detectFuelFromText(value){
  const text = String(value || "").toLowerCase();
  if(/electric|электро|ev\b|tesla|leaf|ioniq|id4|id\.4|model\s+[3syx]/i.test(text)) return "electric";
  if(/plug\s*in|plug-in|phev|prius\s+prime|плагин/i.test(text)) return "phev";
  if(/\bbmw\b/i.test(text) && /\b(225e|230e|330e|530e|545e|745e|x1\s*25e|x2\s*25e|x3\s*30e|x5\s*(40e|45e|50e))\b/i.test(text)) return "phev";
  if(/\baudi\b/i.test(text) && /\b(e-tron|tfsi\s*e|q5\s*e|q7\s*e|a6\s*e|a7\s*e|a8\s*e)\b/i.test(text)) return "phev";
  if(/\bmercedes(?:-benz)?\b/i.test(text) && /\b(350e|450e|580e|gle\s*550e|glc\s*350e|c\s*350e|s\s*580e|e\s*350e)\b/i.test(text)) return "phev";
  if(/\bvolvo\b/i.test(text) && /\b(t8|recharge)\b/i.test(text)) return "phev";
  if(/hybrid|гибрид|hev/i.test(text) && /\b(bmw|audi|mercedes|mercedes-benz|volvo)\b/i.test(text)) return "phev";
  if(/hybrid|гибрид|hev/i.test(text)) return "hybrid";
  if(/diesel|дизель|tdi|cdi|crdi/i.test(text)) return "diesel";
  return "";
}

function detectVehicleTypeFromText(value){
  const text = String(value || "").toLowerCase();
  if(/motorcycle|moto|мото|harley|yamaha|kawasaki|honda-cbr/i.test(text)) return "moto";
  if(/\batv\b|quad|квадро/i.test(text)) return "atv";
  if(/pickup|pick-up|truck|f-150|f150|silverado|ram-1500|tundra|tacoma|пикап/i.test(text)) return "pickup";
  if(/suv|x5|x6|gle|gls|q7|q8|range\s*rover|land\s*cruiser|4runner|expedition|suburban|tahoe|внедорож/i.test(text)) return "suv";
  if(/crossover|model\s*y|model-y|cr\s*v|cr-v|rav\s*4|rav4|cx\s*5|cx-5|x3|x4|q5|glc|macan|tiguan|crosstrek|кроссов/i.test(text)) return "crossover";
  return "";
}

function detectLocationFromText(value){
  const source = lotImportText(value).toLowerCase();
  const locations = getFilteredLocations();
  const normalizePlace = (value) => String(value || "")
    .toLowerCase()
    .replace(/\b\d{5}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sourceWords = new Set(source.split(" ").filter(Boolean));

  let best = null;
  let bestScore = 0;

  locations.forEach(item => {
    const city = String(item.city || "").toLowerCase();
    const state = String(item.state || "").toLowerCase();
    const zip = String(item.zip || "").toLowerCase();
    const locationName = normalizePlace(item.location);
    const displayName = normalizePlace(String(item.displayName || "").split("→")[0]);
    const cityName = normalizePlace(city);
    const stateName = normalizePlace(state);

    let score = 0;
    if(locationName && source.includes(locationName)) score += 120;
    if(displayName && source.includes(displayName)) score += 100;
    if(zip && sourceWords.has(zip)) score += 80;
    if(cityName && stateName && source.includes(`${cityName} ${stateName}`)) score += 55;
    if(locationName && stateName && locationName.split(" ").some(word => word.length > 3 && sourceWords.has(word)) && sourceWords.has(stateName)) score += 45;
    if(cityName && cityName.length > 4 && sourceWords.has(cityName)) score += 8;

    if(score > bestScore){
      best = item;
      bestScore = score;
    }
  });

  return bestScore >= 25 ? best : null;
}

function selectLocationByItem(item){
  if(!item || !$("location")) return false;
  const locations = getFilteredLocations();
  const index = locations.indexOf(item);
  if(index < 0) return false;
  $("location").value = String(index);
  updateLocation();
  return true;
}

function buildLotTitle(value){
  const text = lotImportText(value);
  const words = text
    .split(" ")
    .filter(word => !/^(www|com|copart|iaai|manheim|lot|vehicle|detail|details|en|us|ca|auction|auto|autos)$/i.test(word))
    .filter(word => !/^\d{6,12}$/.test(word));
  const yearIndex = words.findIndex(word => /^(19[8-9]\d|20[0-3]\d)$/.test(word));
  const titleWords = yearIndex >= 0 ? words.slice(yearIndex, yearIndex + 5) : words.slice(0, 5);
  return titleWords.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function analyzeAuctionLink(value){
  const plain = lotImportText(value);
  return {
    original: String(value || "").trim(),
    auction: detectAuctionFromLink(value),
    lotNumber: detectLotNumber(value),
    vin: detectVin(value),
    year: detectYearFromText(plain),
    fuel: detectFuelFromText(plain),
    vehicleType: detectVehicleTypeFromText(plain),
    engineLiters: detectEngineLitersFromText(plain),
    title: buildLotTitle(value)
  };
}

function getKnownLotData(data){
  if(!data) return null;
  const keys = [data.lotNumber, data.stockNumber].filter(Boolean);
  return keys.map(key => KNOWN_LOTS_V119[key]).find(Boolean) || null;
}

async function fetchLiveLotData(url){
  lotImportApiStatus = "";
  if(!url || !/^https?:\/\//i.test(url)) return null;
  try{
    const response = await fetch(`/api/lot?url=${encodeURIComponent(url)}`);
    if(!response.ok){
      lotImportApiStatus = "auction-protected";
      return null;
    }
    const data = await response.json();
    if(data && data.ok) return data.lot;
    lotImportApiStatus = data?.error || "auction-protected";
    return null;
  }catch(e){
    lotImportApiStatus = "api-unavailable";
    return null;
  }
}

function setLotCheckButton(data){
  const button = $("sendLotCheckBtn");
  if(!button) return;
  if(!data?.original){
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.onclick = () => {
    openTelegramMessage([
      "Проверка лота | APEX AUTO",
      "",
      "Здравствуйте! Хочу проверить и просчитать лот.",
      "",
      "Ссылка:",
      data.original,
      data.auction ? `Аукцион: ${data.auction.toUpperCase()}` : "",
      data.lotNumber ? `Лот: ${data.lotNumber}` : "",
      data.vin ? `VIN: ${data.vin}` : "",
      "",
      "Нужно проверить:",
      "• данные автомобиля",
      "• локацию и доставку",
      "• документы и повреждения",
      "• стоимость под ключ до Кишинева"
    ].filter(Boolean).join("\n"));
  };
}

function renderLotImportStatus(data, applied){
  const box = $("lotImportStatus");
  if(!box) return;
  if(!data || !data.original){
    box.hidden = true;
    box.innerHTML = "";
    setLotCheckButton(null);
    return;
  }

  setLotCheckButton(data);
  const found = [];
  const missing = [];
  if(data.auction) found.push(`Аукцион: ${data.auction.toUpperCase()}`); else missing.push("аукцион");
  if(data.lotNumber) found.push(`Лот: ${data.lotNumber}`);
  if(data.vin) found.push(`VIN: ${data.vin}`);
  if(!data.year) missing.push("год");
  if(!data.fuel) missing.push("топливо");
  if(!data.vehicleType) missing.push("тип кузова");
  if(!data.engineLiters && data.fuel !== "electric") missing.push("объем двигателя");
  if(!applied.location) missing.push("локация аукциона");
  if(data.saleDate) found.push(`Дата торгов: ${new Date(data.saleDate).toLocaleDateString("ru-RU")}`);
  if(data.damage) found.push(`Повреждения: ${data.damage}`);
  if(needsExportDocuments(data)) found.push("Экспортные документы: +$400");
  if(!data.currentBid) missing.push("текущая цена / ставка");

  box.hidden = false;
  const isSparse = found.length <= 2 && !data.year && !data.fuel && !data.vehicleType;
  const title = isSparse ? "Ссылка распознана, данные лота закрыты" : (data.title || "Лот распознан частично");
  const apiNote = lotImportApiStatus
    ? "Мы нашли ссылку на лот, но часть данных нужно уточнить вручную. Заполните ставку, год, двигатель, топливо и локацию или отправьте лот нам на проверку."
    : "";

  box.classList.toggle("isWarningV120", isSparse || Boolean(apiNote));
  box.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <div class="lotImportChipsV118">
      ${found.map(item => `<span>${escapeHtml(item)}</span>`).join("")}
    </div>
    <p>${escapeHtml(apiNote || data.priceNote || (missing.length ? `Для точного расчета проверьте: ${missing.join(", ")}.` : "Данных достаточно для предварительного расчета."))}</p>
  `;
}

function fuelLabel(value){
  const labels = {gasoline:"Бензин",hybrid:"Гибрид",phev:"Плагин гибрид",electric:"Электро",diesel:"Дизель"};
  return labels[value] || value;
}

function vehicleTypeLabel(value){
  const labels = {sedan:"Седан",crossover:"Кроссовер",suv:"Внедорожник",suvLarge:"SUV Large",pickup:"Пикап",pickupLarge:"Pickup Large",vanLarge:"Van Large",pickupOversized:"Pickup Oversized",moto:"Мото",atv:"Квадро / ATV"};
  return labels[value] || value;
}

function needsExportDocuments(data){
  const text = [data?.document, data?.title, data?.original].filter(Boolean).join(" ").toLowerCase();
  return /bill\s*of\s*sale|\bacq\b|parts\s*only/i.test(text);
}

async function applyAuctionImport(){
  const input = $("auctionUrl");
  if(!input) return;
  let data = analyzeAuctionLink(input.value);
  if(!data.original){
    renderLotImportStatus(null, {});
    return;
  }
  const liveData = await fetchLiveLotData(data.original);
  data = mergeLotData(data, liveData || (getKnownLotData(data) || {}), {original:data.original});

  if(data.auction && $("auction")){
    $("auction").value = data.auction;
    initLocations();
    if($("location")) $("location").value = "";
  }
  if(data.year && $("year")) $("year").value = String(data.year);
  if(data.fuel && $("fuel")) $("fuel").value = data.fuel;
  if(data.vehicleType && $("vehicleType")) $("vehicleType").value = data.vehicleType;
  if(data.engineLiters && $("engineLiters")) $("engineLiters").value = String(data.engineLiters);
  if(data.currentBid && $("lotPrice")) $("lotPrice").value = String(Math.round(data.currentBid));
  if($("exportDocs")) $("exportDocs").checked = needsExportDocuments(data);
  updateHybridGuard(data);

  const location = detectLocationFromText([data.original,data.branch,data.location].filter(Boolean).join(" "));
  const appliedLocation = selectLocationByItem(location);
  lastImportedLot = data;
  refreshGlassSelects();
  calculate();
  renderLotImportStatus(data, {location: appliedLocation ? location.displayName : ""});
}

function applyLotParamImport(){
  const input = $("auctionUrl");
  if(!input) return;
  const lotParam = new URLSearchParams(window.location.search).get("lot");
  if(!lotParam) return;
  input.value = lotParam;
  setTimeout(applyAuctionImport, 180);
}

function calculate(){
  if(!$("calcForm")) return;
  updateLocation();

  const lot = num("lotPrice");
  const afd = calculateAuctionFee();
  const auctionFee = afd.total;

  $("auctionFeeView").value = Math.round(auctionFee).toString();

  const land = getLandShipping();
  const sea = getSeaShipping();
  const exportDocs = $("exportDocs").checked ? 400 : 0;
  const carfax = 0;
  const insurance = $("insurance").checked ? (lot + auctionFee) * 0.01 : 0;
  const company = companyFee(auctionFee);

  // Важно:
  // базовый акциз считаем по таблице двигателя;
  // налог на роскошь считаем только от: лот + аукционный сбор + море.
  // Суша по США и страховка в luxury base не входят.
  const luxuryBaseMdl = usdToMdl(lot + auctionFee + sea);
  const customsBaseMdl = usdToMdl(lot + auctionFee + sea);
  const customs = customsMdl(customsBaseMdl, luxuryBaseMdl);

  const totalUsdPart = lot + auctionFee + land + sea + exportDocs + carfax + insurance + company;
  const totalMdl = usdToMdl(totalUsdPart) + customs.total;
  const totalUsd = mdlToUsd(totalMdl);
  const route = selectedLocation ? selectedLocation.displayName : "Локация не выбрана";

  $("total").textContent = currency === "mdl" ? moneyMdl(totalMdl) : currency === "eur" ? moneyEur(mdlToEur(totalMdl)) : moneyUsd(totalUsd);
  $("subTotal").textContent = `${moneyUsd(totalUsd)} / ${moneyMdl(totalMdl)} / ${moneyEur(mdlToEur(totalMdl))}`;
  $("chosenRoute").textContent = route;
  if($("auctionBadge")) $("auctionBadge").textContent = $("auction").value.toUpperCase();
  $("insuranceWarning").classList.toggle("hidden", $("insurance").checked);

  const rows = [
    ["Стоимость лота", lot, "", "usd"],
    ["Аукционный сбор", auctionFee, afd.detail, "usd"],
    ["Доставка по США", land, selectedLocation ? route : "выбери локацию", "usd"],
    ["Доставка в Chișinău", sea, selectedLocation ? selectedLocation.portLabel : "", "usd"],
    ["Экспортные документы", exportDocs, exportDocs ? "включены" : "отключены", "usd"],
    ["Страховка", insurance, "", "usd"],
    ["Сопровождение APEX AUTO", company, "", "usd"],
    ["Таможенные платежи", customs.baseExcise, customs.text, "mdl"]
  ];

  if(customs.luxury > 0){
    rows.push([
      "Доп. акциз люкс",
      customs.luxury,
      `считается от лот + аукцион + море: ${Math.round(customs.luxuryBase).toLocaleString("ru-RU")} MDL · ${customs.luxuryPct}%`,
      "mdl"
    ]);
  }

  $("breakdown").innerHTML = rows.map(r => row(...r)).join("");
  const smartAdvice = renderSmartLotAdvice(totalUsd);
  const bidAdvice = renderBidAdvisor(totalUsd);
  lastCalc = { route, totalUsd, totalMdl, rows, lot, auction: $("auction").value, importedLot: lastImportedLot, smartAdvice, bidAdvice };
  updateShare();
}

function textCalc(){if(!lastCalc)calculate();if(!lastCalc)return"";let lines=lastCalc.rows.filter(x=>x[1]>0||x[0].includes("Carfax")).map(x=>`• ${x[0]} — ${x[3]==="mdl"?displayMdl(x[1]):displayUsd(x[1])}`);let lotLines=lastCalc.importedLot?.original?["",`Ссылка на лот: ${lastCalc.importedLot.original}`,lastCalc.importedLot.lotNumber?`Номер лота: ${lastCalc.importedLot.lotNumber}`:"",lastCalc.importedLot.vin?`VIN: ${lastCalc.importedLot.vin}`:""].filter(Boolean):[];let adviceLines=lastCalc.smartAdvice?["",`Оценка лота: ${lastCalc.smartAdvice.verdict} (${lastCalc.smartAdvice.score}/100)`,"Лимит ставки: после проверки рынка и ремонта"].filter(Boolean):[];let bidLines=lastCalc.bidAdvice?["",`Торговая рекомендация: ${lastCalc.bidAdvice.verdict}`,`Разумная ставка: ${moneyUsd(lastCalc.bidAdvice.bidLow)}–${moneyUsd(lastCalc.bidAdvice.bidHigh)}`,`После ремонта: ${moneyUsd(lastCalc.bidAdvice.afterRepairLow)}–${moneyUsd(lastCalc.bidAdvice.afterRepairHigh)}`,`Экономия к рынку: ${moneyUsd(lastCalc.bidAdvice.savingLow)}–${moneyUsd(lastCalc.bidAdvice.savingHigh)}`].filter(Boolean):[];return["APEX AUTO | Расчет под ключ","",`Лот: ${moneyUsd(lastCalc.lot)}`,`Аукцион: ${lastCalc.auction.toUpperCase()}`,`Локация: ${lastCalc.route}`,...lotLines,...adviceLines,...bidLines,"",...lines,"",`Итого: ${moneyUsd(lastCalc.totalUsd)}`,`${moneyMdl(lastCalc.totalMdl)} | ${moneyEur(mdlToEur(lastCalc.totalMdl))}`,"","Расчет предварительный."].join("\n")}
function updateShare(){if($("tgBtn"))$("tgBtn").href=`https://t.me/share/url?url=&text=${encodeURIComponent(textCalc())}`}
async function copyCalc(){try{await navigator.clipboard.writeText(textCalc());$("copyBtn").textContent="Скопировано";setTimeout(()=>$("copyBtn").textContent="Скопировать расчет",1200)}catch(e){alert(textCalc())}}
function downloadPng(){alert("PNG добавим следующим этапом. Сейчас расчет можно скопировать или отправить в Telegram.")}
document.addEventListener("DOMContentLoaded",()=>{
  if(!$("calcForm")) return;
  initYears();initLiters();initLocations();refreshGlassSelects();calculate();
  $("calcForm").addEventListener("submit",e=>{e.preventDefault();calculate()});
  ["location","vehicleType","fuel","lotPrice","engineLiters","year","insurance","exportDocs","offsite","usdMdl","eurMdl","marketMin","marketMax","repairMin","repairMax","targetSavings"].forEach(id=>{if($(id)){$(id).addEventListener("input",()=>{if(id==="fuel")updateHybridGuard();calculate()});$(id).addEventListener("change",()=>{if(id==="fuel")updateHybridGuard();calculate()})}});
  document.querySelectorAll("[data-fuel-choice]").forEach(button=>button.addEventListener("click",()=>{if($("fuel")){$("fuel").value=button.dataset.fuelChoice;refreshGlassSelect($("fuel"))}updateHybridGuard();calculate()}));
  if($("auction"))$("auction").addEventListener("change",()=>{initLocations();$("location").value="";calculate()});
  if($("parseLotBtn"))$("parseLotBtn").addEventListener("click",applyAuctionImport);
  if($("auctionUrl")){
    $("auctionUrl").addEventListener("paste",()=>setTimeout(applyAuctionImport,80));
    $("auctionUrl").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();applyAuctionImport();}});
    applyLotParamImport();
  }
  document.querySelectorAll(".currency").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".currency").forEach(i=>i.classList.remove("active"));b.classList.add("active");currency=b.dataset.currency;calculate()}));
  if($("copyBtn"))$("copyBtn").addEventListener("click",copyCalc);
  if($("pngBtn"))$("pngBtn").addEventListener("click",downloadPng);
  if($("aiBidBtn"))$("aiBidBtn").addEventListener("click",requestAiBidAdvice);
});

window.addEventListener("load", () => {
  const status = $("lotImportStatus");
  if($("auctionUrl")?.value && (!status || status.hidden || !status.textContent.trim())){
    applyLotParamImport();
  }
});


function openTelegramMessage(text){
  const encoded = encodeURIComponent(text);
  window.open(`https://t.me/share/url?url=&text=${encoded}`, "_blank", "noopener");
}

document.addEventListener("DOMContentLoaded", () => {
  const selectionForm = document.getElementById("selectionForm");
  if(selectionForm){
    selectionForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const msg = [
        "Заявка на подбор авто | APEX AUTO",
        "",
        "Имя: " + (document.getElementById("leadName").value || "-"),
        "Телефон: " + (document.getElementById("leadPhone").value || "-"),
        "Telegram: " + (document.getElementById("leadTelegram").value || "-"),
        "Бюджет: " + (document.getElementById("leadBudget").value || "-"),
        "Авто: " + (document.getElementById("leadCar").value || "-")
      ].join("\n");
      openTelegramMessage(msg);
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const contactForm = document.getElementById("contactQuickForm");
  if(!contactForm) return;

  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = document.getElementById("contactName")?.value.trim() || "-";
    const phone = document.getElementById("contactPhone")?.value.trim() || "-";
    const car = document.getElementById("contactCar")?.value.trim() || "-";
    const comment = document.getElementById("contactMessage")?.value.trim() || "-";

    openTelegramMessage([
      "Контактный запрос | APEX AUTO",
      "",
      "Имя: " + name,
      "Телефон / Telegram: " + phone,
      "Автомобиль / ссылка: " + car,
      "",
      "Задача:",
      comment
    ].join("\n"));
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const filter = document.querySelector(".hotFilterV101");
  const cards = Array.from(document.querySelectorAll(".hotOfferCardV101"));

  if(filter && cards.length){
    const matchCard = (card, filterName) => {
      if(filterName === "Все авто") return true;
      const text = (card.textContent || "").toLowerCase();
      const checks = {
        "Гибриды": ["hybrid", "plug-in", "гибрид"],
        "Электро": ["tesla", "electric", "электро"],
        "BMW": ["bmw"],
        "SUV": ["x5", "model y", "model x", "cr-v", "tiguan", "suv"],
        "Премиум": ["bmw", "tesla", "lincoln", "m3", "x5", "model x"]
      };
      return (checks[filterName] || []).some(token => text.includes(token));
    };

    filter.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if(!button) return;

      filter.querySelectorAll("button").forEach(item => item.classList.remove("active"));
      button.classList.add("active");

      const filterName = button.textContent.trim();
      cards.forEach(card => {
        card.hidden = !matchCard(card, filterName);
      });
    });
  }

  document.querySelectorAll(".examplesBtnV101").forEach(link => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const model = link.dataset.model || link.closest("article")?.querySelector("h3")?.textContent || "автомобилю";
      openTelegramMessage([
        "Здравствуйте! Хочу посмотреть реальные примеры по модели:",
        model,
        "",
        "Пришлите, пожалуйста, варианты с расчетом под ключ до Кишинева."
      ].join("\n"));
    });
  });
});


// v57: clean VIN / lot check Telegram handler
document.addEventListener("DOMContentLoaded", () => {
  const checkForm = document.getElementById("checkForm");
  const checkInput = document.getElementById("checkLot");

  if (checkForm && checkInput && !checkForm.dataset.v57Bound) {
    checkForm.dataset.v57Bound = "true";

    checkForm.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const value = (checkInput.value || "").trim();

      if (!value) {
        checkInput.classList.add("inputErrorV57");
        checkInput.focus();
        checkInput.placeholder = "Введите VIN, номер лота или ссылку";
        return false;
      }

      checkInput.classList.remove("inputErrorV57");

      const message = [
        "Бесплатная проверка автомобиля | APEX AUTO",
        "",
        "Здравствуйте! Хочу бесплатно проверить автомобиль перед покупкой.",
        "",
        "VIN / номер лота / ссылка:",
        value,
        "",
        "Проверьте, пожалуйста:",
        "• историю автомобиля",
        "• документы",
        "• повреждения",
        "• возможные риски",
        "• ориентировочную стоимость под ключ до Кишинева"
      ].join("\n");

      openTelegramMessage(message);
      return false;
    }, true);
  }
});





// v80: VAT note fallback for moto/pickup if render uses customs.text
document.addEventListener("DOMContentLoaded", () => {
  function isMotoPickupV80(){
    const el = document.getElementById("vehicleType")
      || document.querySelector('select[name="vehicleType"], select[name="bodyType"], select[name="carType"], select[name="transportType"]');
    const value = (el && (el.value || el.options?.[el.selectedIndex]?.text) || "").toString().toLowerCase();
    return value.includes("moto") || value.includes("мото") || value.includes("pickup") || value.includes("пикап");
  }

  function applyVatNoteV80(){
    if(!isMotoPickupV80()) return;
    const rows = Array.from(document.querySelectorAll(".row, .resultRow, li, div"));
    const customsRow = rows.find(row => /Таможенные платежи/i.test(row.textContent || ""));
    if(!customsRow) return;

    let small = customsRow.querySelector("small");
    if(!small){
      small = document.createElement("small");
      customsRow.appendChild(small);
    }
    small.textContent = "НДС 20% от таможенной стоимости";
  }

  document.addEventListener("change", () => setTimeout(applyVatNoteV80, 80), true);
  const form = document.getElementById("calcForm") || document.querySelector("form");
  if(form) form.addEventListener("submit", () => setTimeout(applyVatNoteV80, 80), true);
  setTimeout(applyVatNoteV80, 300);
});
