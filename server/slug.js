// Человекочитаемые ссылки: /auctions/iaai-45987487-2021-chevrolet-malibu-fwd-lt-1g1zd5st3mf072564
// и /in-transit/3-2019-lincoln-mkz-rezerve-ii-3ln6l5mu7kr624453. Тот же алгоритм — в auctions.js и transit.js (клиент).
function words(s, max){
  return String(s || "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
}
function vinPart(vin){ const v = String(vin || "").trim(); return /^[A-HJ-NPR-Z0-9]{17}$/i.test(v) ? v.toLowerCase() : ""; }
function lotSlug(lot){
  const title = words(lot.title || [lot.year, lot.make, lot.model].filter(Boolean).join(" "), 60);
  return [`${String(lot.auction || "").toLowerCase()}-${lot.lot}`, title, vinPart(lot.vin)].filter(Boolean).join("-");
}
function transitSlug(it){
  return [String(it.id), words(it.title, 60), vinPart(it.vin)].filter(Boolean).join("-");
}
// «iaai-45987487-…» → {auction, lot}; номера с буквами — по старому правилу (всё после «auction-»)
function parseLotSlug(slug){
  const s = String(slug || "");
  const m = s.match(/^(copart|iaai)-(\d{5,12})(?:-.*)?$/i) || s.match(/^(copart|iaai)-(.+)$/i);
  return m ? {auction:m[1].toLowerCase(), lot:m[2]} : null;
}
module.exports = {lotSlug, transitSlug, parseLotSlug, words};
