const AUCTIONS_API_BASE = "https://auctionsapi.com/api";

function auctionFromUrl(value){
  const text = String(value || "").toLowerCase();
  if(text.includes("iaai.com")) return "iaai";
  if(text.includes("copart.com")) return "copart";
  if(text.includes("manheim.com")) return "manheim";
  return "";
}

function lotFromUrl(value){
  const text = String(value || "");
  const iaai = text.match(/VehicleDetail\/([^/?#]+)/i);
  if(iaai) return { lot:String(iaai[1]).replace(/~.*/, ""), searchById:true };

  const copart = text.match(/(?:lot|lotNumber|lot-number)[^\d]{0,12}(\d{6,12})/i);
  if(copart) return { lot:copart[1], searchById:false };

  const candidates = text.match(/\b\d{6,12}\b/g) || [];
  return { lot:candidates[0] || "", searchById:false };
}

function safeName(value){
  return value && typeof value === "object" ? value.name || "" : String(value || "");
}

function moneyText(value){
  const number = Number(value || 0);
  return number ? `$${Math.round(number).toLocaleString("en-US")}` : "";
}

function engineLiters(value){
  const text = String(value || "");
  const match = text.match(/\b([1-6](?:\.\d)?)\s*l\b/i);
  return match ? match[1] : "";
}

function engineLitersFromCar(car){
  const text = [
    safeName(car?.engine),
    car?.title,
    safeName(car?.manufacturer),
    safeName(car?.model)
  ].filter(Boolean).join(" ").toLowerCase();
  const detected = engineLiters(text);
  if(detected) return detected;
  if(/\bs\s*550\b|\bs-550\b|\bs550\b/.test(text)) return "4.7";
  if(/\bs\s*580\b|\bs-580\b|\bs580\b/.test(text)) return "4.0";
  if(/\bs\s*63\b|\bs-63\b|\bs63\b/.test(text)) return "4.0";
  if(/\bs\s*65\b|\bs-65\b|\bs65\b/.test(text)) return "6.0";
  return "";
}

function fuelCode(value){
  const text = safeName(value).toLowerCase();
  if(text.includes("electric")) return "electric";
  if(text.includes("plug")) return "phev";
  if(text.includes("hybrid")) return "hybrid";
  if(text.includes("diesel")) return "diesel";
  if(text.includes("gasoline") || text.includes("petrol")) return "gasoline";
  return "";
}

function looksLikePremiumPhev(car){
  const brand = safeName(car?.manufacturer).toLowerCase();
  const title = String(car?.title || "").toLowerCase();
  const model = safeName(car?.model).toLowerCase();
  const text = `${brand} ${model} ${title}`;

  if(/\b(bmw|audi|mercedes|mercedes-benz|volvo)\b/.test(text) && /\bhybrid\b/.test(text)) return true;
  if(/\bbmw\b/.test(text) && /\b(225e|230e|330e|530e|545e|745e|x1\s*25e|x2\s*25e|x3\s*30e|x5\s*(40e|45e|50e))\b/.test(text)) return true;
  if(/\baudi\b/.test(text) && /\b(e-tron|tfsi\s*e|q5\s*e|q7\s*e|a6\s*e|a7\s*e|a8\s*e)\b/.test(text)) return true;
  if(/\bmercedes(?:-benz)?\b/.test(text) && /\b(350e|450e|580e|gle\s*550e|glc\s*350e|c\s*350e|s\s*580e|e\s*350e)\b/.test(text)) return true;
  if(/\bvolvo\b/.test(text) && /\b(t8|recharge)\b/.test(text)) return true;
  return false;
}

function normalizeFuelForBrand(fuel, car){
  if(looksLikePremiumPhev(car)) return "phev";
  return fuel;
}

function vehicleTypeCode(car, lot){
  const text = [
    safeName(car?.vehicle_type),
    safeName(car?.body_type),
    car?.title,
    safeName(lot?.title),
  ].join(" ").toLowerCase();

  if(text.includes("motorcycle")) return "moto";
  if(text.includes("atv")) return "atv";
  if(text.includes("pickup")) return "pickup";
  if(text.includes("suv")) return "suv";
  if(text.includes("coupe") || text.includes("sedan") || text.includes("automobile")) return "sedan";
  if(text.includes("wagon") || text.includes("hatchback")) return "sedan";
  return "";
}

function moneyValue(...values){
  return values.find(value => Number(value) > 0) || null;
}

function displayLotNumber(lot, auction){
  if(auction === "iaai" && lot?.external_id) return String(lot.external_id).replace(/~.*/, "");
  return lot?.lot || lot?.external_id || "";
}

function normalizeAuctionApiCar(payload, sourceUrl, auction){
  const car = payload?.data || payload;
  const lots = Array.isArray(car?.lots) ? car.lots : [];
  const lot = lots[0] || {};
  const bid = moneyValue(lot.bid, lot.buy_now, lot.final_bid);
  const visibleLot = displayLotNumber(lot, auction);

  return {
    auction,
    original:sourceUrl,
    title:car?.title || [car?.year, safeName(car?.manufacturer), safeName(car?.model)].filter(Boolean).join(" "),
    lotNumber:visibleLot,
    stockNumber:visibleLot,
    externalId:lot.external_id || "",
    year:Number(car?.year) || 0,
    vin:car?.vin || "",
    branch:lot.location?.name || lot.branch?.name || lot.selling_branch?.name || "",
    damage:[safeName(lot.damage?.main), safeName(lot.damage?.second)].filter(Boolean).join(" / "),
    document:safeName(lot.detailed_title) || safeName(lot.title),
    odometer:lot.odometer?.mi ? `${Number(lot.odometer.mi).toLocaleString("en-US")} mi` : "",
    fuel:normalizeFuelForBrand(fuelCode(car?.fuel), car),
    vehicleType:vehicleTypeCode(car, lot),
    engineLiters:engineLitersFromCar(car),
    currentBid:bid,
    actualCashValue:lot.actual_cash_value || null,
    saleDate:lot.sale_date || "",
    seller:safeName(lot.seller),
    condition:safeName(lot.condition),
    image:Array.isArray(lot.images?.normal) ? lot.images.normal[0] || "" : "",
    priceNote:bid
      ? `Текущая цена лота: ${moneyText(bid)}. Проверьте ставку перед участием в торгах.`
      : "Мы нашли данные лота, но текущая ставка не указана. Для точного итога введите свою максимальную ставку в поле стоимости лота."
  };
}

async function fetchAuctionApiLot(lotUrl){
  const key = process.env.AUCTIONS_API_KEY;
  if(!key) return null;

  const auction = auctionFromUrl(lotUrl);
  const parsed = lotFromUrl(lotUrl);
  if(!auction || !parsed.lot || auction === "manheim") return null;

  const params = new URLSearchParams();
  params.set("prices_history", "1");
  if(auction === "iaai" && parsed.searchById) params.set("search_by_id", "1");

  const endpoint = `${AUCTIONS_API_BASE}/search-lot/${encodeURIComponent(parsed.lot)}/${auction}?${params.toString()}`;
  const upstream = await fetch(endpoint, {
    headers:{
      "x-api-key":key,
      "accept":"application/json"
    }
  });
  const payload = await upstream.json().catch(() => null);
  if(!upstream.ok || payload?.error) return null;
  return normalizeAuctionApiCar(payload, lotUrl, auction);
}

module.exports = async function handler(request, response){
  const url = new URL(request.url, "http://localhost");
  const lotUrl = url.searchParams.get("url") || "";

  if(!/^https:\/\/(www\.)?(iaai|copart|manheim)\.com\//i.test(lotUrl)){
    response.status(400).json({ok:false,error:"Unsupported auction URL"});
    return;
  }

  try{
    const lot = await fetchAuctionApiLot(lotUrl);
    if(!lot){
      response.status(502).json({
        ok:false,
        error:"Auction data API is not configured or did not return this lot."
      });
      return;
    }
    response.status(200).json({ok:true,lot});
  }catch(error){
    response.status(500).json({ok:false,error:"Lot import failed"});
  }
};
