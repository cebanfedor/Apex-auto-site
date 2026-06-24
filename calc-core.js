/* calc-core.js — DOM-free port of the Apex Auto cost calculator (script.js).
   Used by the auctions lot page so its numbers match the main calculator 1:1.
   Tables and formulas are copied verbatim from script.js. The main calculator
   is NOT modified; this module is a parallel, pure implementation. */
(function(global){
  "use strict";
  const YEAR_NOW = new Date().getFullYear();

  const GASOLINE_RATES={"0-2":[9.56,12.23,18.90,31.14,55.60],"3-4":[10,12.67,19.34,31.68,56.04],"5-6":[10.23,12.90,19.57,31.81,56.27],"7":[11.25,14.19,21.53,34.99,61.90],"8":[12.38,15.61,23.68,38.49,68.09],"9":[13.62,17.17,26.05,42.34,74.90],"10":[16.34,20.60,31.26,50.81,89.87],"11":[21.24,26.79,40.63,66.05,116.84],"12":[26.24,31.79,45.79,71.05,121.84],"13":[31.24,36.79,50.63,76.05,126.84],"14":[36.24,41.79,55.63,81.05,131.84],"15":[41.24,46.79,60.63,86.05,136.84],"16":[46.24,51.79,65.63,91.05,141.84],"17":[51.24,56.79,70.63,96.05,146.84],"18":[56.24,61.79,75.63,101.05,151.84],"19":[61.24,66.79,80.63,106.05,156.84],"20+":[66.24,71.79,85.63,111.05,161.84]};
  const DIESEL_RATES={"0-2":[12.23,31.14,55.60],"3-4":[12.67,31.58,56.04],"5-6":[12.90,31.81,56.27],"7":[14.19,34.99,61.90],"8":[15.61,38.49,68.90],"9":[17.17,42.34,74.90],"10":[20.60,50.81,89.87],"11":[26.79,66.05,116.84],"12":[31.79,71.05,121.84],"13":[36.79,76.05,126.84],"14":[41.79,81.05,131.84],"15":[46.79,86.05,136.84],"16":[51.79,91.05,141.84],"17":[56.79,96.05,146.84],"18":[61.79,101.05,151.84],"19":[66.79,106.05,156.84],"20+":[71.79,111.05,161.84]};
  const LUXURY_RATES=[{min:600000,max:700000,pct:2},{min:700001,max:800000,pct:3},{min:800001,max:900000,pct:4},{min:900001,max:1000000,pct:5},{min:1000001,max:1200000,pct:6},{min:1200001,max:1400000,pct:7},{min:1400001,max:1600000,pct:8},{min:1600001,max:1800000,pct:9},{min:1800001,max:Infinity,pct:10}];
  const AUCTION_FEE_POINTS=[[0,300],[1000,450],[3000,700],[5000,925],[10000,1100],[15000,1250],[20000,1550],[30000,2150],[50000,3300],[75000,4700],[100000,6000]];
  const SEA={nj:{label:"Elizabeth, NJ",price:2400},savannah:{label:"Savannah, GA",price:2400},houston:{label:"Houston, TX",price:2600},indianapolis:{label:"Indianapolis, IN",price:2600},la:{label:"Los Angeles, CA",price:3150}};

  function interpolateFee(price){if(price<=0)return 0;for(let i=0;i<AUCTION_FEE_POINTS.length-1;i++){let [x1,y1]=AUCTION_FEE_POINTS[i],[x2,y2]=AUCTION_FEE_POINTS[i+1];if(price>=x1&&price<=x2){let fee=y1+(y2-y1)*((price-x1)/(x2-x1));return Math.ceil(fee/10)*10}}return Math.ceil(price*0.06/10)*10}
  function auctionFeeFor(price, auction){
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
  function landMultiplier(type){if(type==="crossover")return 1.1;if(type==="suv"||type==="suvLarge")return 1.2;if(type==="pickup"||type==="pickupLarge"||type==="vanLarge"||type==="pickupOversized")return 1.5;return 1}
  function ageKey(year){let age=Math.max(0,YEAR_NOW-Number(year||YEAR_NOW));if(age<=2)return"0-2";if(age<=4)return"3-4";if(age<=6)return"5-6";if(age>=20)return"20+";return String(age)}
  function gasolineColumn(cc){if(cc<=1000)return 0;if(cc<=1500)return 1;if(cc<=2000)return 2;if(cc<=3000)return 3;return 4}
  function dieselColumn(cc){if(cc<=1500)return 0;if(cc<=2500)return 1;return 2}
  function fuelDiscount(fuel){if(fuel==="phev")return .5;if(fuel==="hybrid")return .75;return 1}
  function luxuryPct(mdl){let r=LUXURY_RATES.find(x=>mdl>=x.min&&mdl<=x.max);return r?r.pct:0}
  function companyFeeFor(lotPrice, auctionFee){const base=Number(lotPrice||0)+Number(auctionFee||0);return base>40000?base*0.01:300}

  function customsMdl(customsBaseMdl, luxuryBaseMdl, opts){
    const type = opts.vehicleType || "sedan";
    const fuel = opts.fuel || "gasoline";
    if(type === "moto" || type === "pickup" || type === "vanLarge"){
      const vat = customsBaseMdl * 0.20;
      return {total:vat, baseExcise:vat, luxury:0, luxuryPct:0, luxuryBase:luxuryBaseMdl};
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
    return {total:baseExcise + luxury, baseExcise, luxury, luxuryPct:pct, luxuryBase, cc, rate};
  }

  // input: {lotPrice, auction, vehicleType, fuel, engineLiters, year,
  //         insurance(bool), exportDocs(bool), offsite(bool), location(obj|null), usdMdl, eurMdl}
  function compute(input){
    input = input || {};
    const lot = Number(input.lotPrice || 0);
    const auction = String(input.auction || "copart").toLowerCase();
    const type = input.vehicleType || "sedan";
    const fuel = input.fuel || "gasoline";
    const usdMdl = Number(input.usdMdl || 17.45);
    const eurMdl = Number(input.eurMdl || 20.28);
    const loc = input.location || null;

    const afd = auctionFeeFor(lot, auction);
    const auctionFee = afd.total;

    const landBase = loc ? Number(loc.landPrice || loc.autoLand || 0) : 0;
    const land = loc ? Math.ceil(landBase * landMultiplier(type) + 100 + (input.offsite ? 100 : 0)) : 0;

    let sea;
    if(type === "moto") sea = 900;
    else if(type === "atv") sea = 1200;
    else {
      const port = (loc && loc.autoPort) || "nj";
      sea = (SEA[port] && SEA[port].price) || 2400;
      if(type === "crossover") sea += 200;
      else if(type === "suv" || type === "suvLarge") sea += 300;
      else if(type === "pickup" || type === "pickupLarge" || type === "pickupOversized" || type === "vanLarge") sea += 500;
      if(["hybrid","phev","electric"].includes(fuel)) sea += 100;
    }

    const exportDocs = input.exportDocs ? 400 : 0;
    const insurance = input.insurance ? (lot + auctionFee) * 0.01 : 0;
    const company = companyFeeFor(lot, auctionFee);

    const luxuryBaseMdl = (lot + auctionFee + sea) * usdMdl;
    const customsBaseMdl = (lot + auctionFee + sea) * usdMdl;
    const customs = customsMdl(customsBaseMdl, luxuryBaseMdl, {vehicleType:type, fuel, engineLiters:input.engineLiters, year:input.year});

    const totalUsdPart = lot + auctionFee + land + sea + exportDocs + insurance + company;
    const totalMdl = totalUsdPart * usdMdl + customs.total;
    const totalUsd = totalMdl / usdMdl;
    const totalEur = totalMdl / eurMdl;

    return {
      lot, auctionFee, auctionDetail:afd.detail, land, sea, exportDocs, insurance, company,
      customs, customsMdlValue:customs.total, customsUsd:customs.total / usdMdl,
      totalUsd, totalMdl, totalEur,
      route: loc ? (loc.displayName || "") : "",
      port: loc ? (loc.portLabel || (SEA[loc.autoPort] && SEA[loc.autoPort].label) || "") : ""
    };
  }

  global.ApexCalc = {compute, auctionFeeFor, companyFeeFor, customsMdl, SEA};
})(window);
