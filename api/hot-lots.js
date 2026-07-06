const {sendJson, methodNotAllowed} = require("../server/http");
const supabase = require("../server/supabase");

const BASE = "https://auctionsapi.com/api";
const CACHE = new Map();
const TTL = 10 * 60 * 1000;

function safeName(v){ return v && typeof v === "object" ? v.name || v.title || "" : String(v || ""); }
function safeNum(v){
  if(v && typeof v === "object") return safeNum(v.value || v.amount || v.usd || v.bid || 0);
  const n = Number(String(v || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function imageList(src){
  const sources = [src?.images?.normal, src?.images?.big, src?.images, src?.photos, src?.photo, src?.image];
  const out = [];
  for(const s of sources){
    if(Array.isArray(s)) out.push(...s);
    else if(s) out.push(s);
  }
  return [...new Set(out.map(x => typeof x === "string" ? x : x?.url || x?.src || "").filter(Boolean))];
}

function parseLot(payload, fallbackAuction){
  const item = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  const lots = Array.isArray(item?.lots) ? item.lots : [];
  const lot = lots[0] || item?.lot || item;
  const aText = String(item?.auction || lot?.auction || item?.domain || fallbackAuction || "").toLowerCase();
  const auction = aText.includes("iaai") ? "iaai" : "copart";
  const lotNum = String(lot?.lot || lot?.external_id || item?.lot || "").replace(/~.*/, "");
  const make = safeName(item?.manufacturer || item?.make);
  const model = safeName(item?.model);
  const year = safeNum(item?.year);
  const images = imageList(lot).length ? imageList(lot) : imageList(item);
  const primaryDamage = safeName(lot?.damage?.main || lot?.primary_damage || item?.primary_damage || item?.damage);
  const odometer = safeNum(lot?.odometer?.mi || lot?.odometer || item?.odometer);
  const currentBid = safeNum(lot?.bid || lot?.current_bid || item?.current_bid || item?.bid);
  const buyNow = safeNum(lot?.buy_now || item?.buy_now);
  const url = auction === "iaai"
    ? `https://www.iaai.com/VehicleDetail/${lotNum}~US`
    : `https://www.copart.com/lot/${lotNum}`;
  return {
    auction, lot:lotNum, url,
    title: item?.title || [year, make, model].filter(Boolean).join(" ") || "Автомобиль",
    year, make, model,
    images: images.slice(0, 6),
    image: images[0] || "",
    currentBid, buyNow,
    odometer,
    odometerText: odometer ? `${odometer.toLocaleString("en-US")} mi` : "",
    damage: primaryDamage,
    fuel: safeName(item?.fuel),
    location: safeName(lot?.location?.city || lot?.branch),
    auctionDate: lot?.sale_date || lot?.auction_date || "",
  };
}

async function fetchLot(lot, auction){
  const key = `${auction}:${lot}`;
  const hit = CACHE.get(key);
  if(hit && hit.exp > Date.now()) return hit.data;

  const domain = auction === "iaai" ? "iaai_com" : "copart_com";
  const apiKey = process.env.AUCTIONS_API_KEY;
  if(!apiKey) return null;

  const res = await fetch(`${BASE}/search-lot/${encodeURIComponent(lot)}/${domain}`, {
    headers:{"x-api-key": apiKey, "accept": "application/json"},
  });
  if(!res.ok) return null;
  const payload = await res.json();
  const data = parseLot(payload, auction);
  CACHE.set(key, {data, exp: Date.now() + TTL});
  return data;
}

module.exports = async function handler(req, res){
  if(req.method !== "GET") return methodNotAllowed(res);

  let vehicles;
  try {
    vehicles = await supabase.list("vehicles", {
      select: "id,lot,auction,auction_url,year,make,model,price,photos,description,fuel,damage,mileage",
      status: "eq.Горячий лот",
      order: "created_at.desc",
      limit: "24",
    });
  } catch(e) {
    return sendJson(res, e.status || 500, {ok: false, error: e.message});
  }
  if(!vehicles?.length) return sendJson(res, 200, {items: []});

  const items = await Promise.all(vehicles.map(async v => {
    const auctionNorm = String(v.auction || "").toLowerCase().includes("iaai") ? "iaai" : "copart";
    let live = null;
    if(v.lot && auctionNorm){
      try { live = await fetchLot(v.lot, auctionNorm); } catch(_){}
    }
    const storedPhotos = Array.isArray(v.photos) ? v.photos
      : typeof v.photos === "string" ? v.photos.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
      : [];
    const lotUrl = v.auction_url || live?.url || (auctionNorm === "iaai"
      ? `https://www.iaai.com/VehicleDetail/${v.lot}~US`
      : `https://www.copart.com/lot/${v.lot}`);
    return {
      id: v.id,
      lot: v.lot,
      auction: live?.auction || auctionNorm,
      detailPath: v.lot ? `/auctions/${auctionNorm}-${v.lot}` : null,
      lotUrl,
      title: live?.title || [v.year, v.make, v.model].filter(Boolean).join(" ") || "Лот",
      year: live?.year || v.year || 0,
      make: live?.make || v.make || "",
      model: live?.model || v.model || "",
      currentBid: live?.currentBid || v.price || 0,
      buyNow: live?.buyNow || 0,
      image: live?.image || storedPhotos[0] || "",
      images: live?.images?.length ? live.images : storedPhotos,
      odometer: live?.odometer || v.mileage || 0,
      odometerText: live?.odometerText || (v.mileage ? `${Number(v.mileage).toLocaleString("en-US")} mi` : ""),
      damage: live?.damage || v.damage || "",
      fuel: live?.fuel || v.fuel || "",
      description: v.description || "",
      auctionDate: live?.auctionDate || "",
      live: !!live,
    };
  }));

  return sendJson(res, 200, {items: items.filter(Boolean)});
};
