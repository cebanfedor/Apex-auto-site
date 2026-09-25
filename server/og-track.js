// Статус доставки для превью: одинаково в картинке (/og/track) и в тексте страницы /tracking?vin=…
const STAGE = {
  "Car won":"Куплен на аукционе", "Left auction":"Выехал с аукциона", "Delivered to loading place":"Прибыл на склад", "Loading":"Погружен в контейнер", "Arrival":"Порт Клайпеда", "Chisinau":"Кишинёв",
  D_PURCHASED:"Куплен", D_TO_ORIGIN:"В пути на склад", D_AT_ORIGIN:"На складе", D_SEA:"Морская перевозка", D_TO_DEST:"В пути по Европе", D_AT_DEST:"На складе в Европе", D_ARRIVED:"Прибыл",
  A_PURCHASED:"Оплачен", A_DISPATCHED:"В пути на склад", A_DELIVERED:"Прибыл на склад", A_LOADED:"В контейнере", A_UNLOADED:"Выгружен", A_EU_DISPATCHED:"В пути к выдаче", A_READY:"Готов к выдаче"
};
const STATUS = {
  "Car won":"Куплен на аукционе", "Left auction":"Выехал с аукциона", "Delivered to loading place":"Прибыл на склад", "Loading":"Погружен в контейнер", "Arrival":"Прибыл в порт Клайпеда",
  D_SEA:"Морская перевозка", A_LOADED:"Погружен в контейнер", A_UNLOADED:"Выгружен в Европе", A_EU_DISPATCHED:"В пути к месту выдачи", A_READY:"Готов к выдаче", A_DISPATCHED:"В пути на склад", A_DELIVERED:"Прибыл на склад", A_PURCHASED:"Куплен"
};
const MONTH = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const dayLoc = (iso, T, lang) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return ""; const mn = T.months[Number(m[2]) - 1]; return lang === "en" ? `${mn} ${Number(m[3])}` : `${Number(m[3])} ${mn}`; };
const dayRu = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${Number(m[3])} ${MONTH[Number(m[2]) - 1]}` : ""; };

const TR = {
  ro:{stage:{"Car won":"Cumpărată la licitație", "Left auction":"A plecat de la licitație", "Delivered to loading place":"Ajunsă în depozit", "Loading":"Încărcată în container", "Arrival":"Port Klaipeda", "Chisinau":"Chișinău", D_PURCHASED:"Cumpărată", D_TO_ORIGIN:"În drum spre depozit", D_AT_ORIGIN:"În depozit", D_SEA:"Transport maritim", D_TO_DEST:"În drum prin Europa", D_AT_DEST:"Depozit în Europa", D_ARRIVED:"Sosită", A_PURCHASED:"Plătită", A_DISPATCHED:"În drum spre depozit", A_DELIVERED:"Ajunsă în depozit", A_LOADED:"În container", A_UNLOADED:"Descărcată", A_EU_DISPATCHED:"În drum spre predare", A_READY:"Gata de predare"},
    status:{"Car won":"Cumpărată la licitație", "Left auction":"A plecat de la licitație", "Delivered to loading place":"Ajunsă în depozit", "Loading":"Încărcată în container", "Arrival":"Ajunsă în portul Klaipeda", D_SEA:"Transport maritim", A_LOADED:"Încărcată în container", A_UNLOADED:"Descărcată în Europa", A_EU_DISPATCHED:"În drum spre locul de predare", A_READY:"Gata de predare", A_DISPATCHED:"În drum spre depozit", A_DELIVERED:"Ajunsă în depozit", A_PURCHASED:"Cumpărată"},
    delivered:"Livrată la Chișinău", toChisinau:"În drum spre Chișinău", proc:"În procesare", eta:"Predare estimată la Chișinău în jurul datei de", label:"URMĂRIRE AUTO", fallback:"Mașina dvs.", footer:"apexauto.md/tracking?lang=ro", months:["ianuarie","februarie","martie","aprilie","mai","iunie","iulie","august","septembrie","octombrie","noiembrie","decembrie"], stageWord:"Etapa", of:"din"},
  en:{stage:{"Car won":"Won at auction", "Left auction":"Left the auction", "Delivered to loading place":"Arrived at the yard", "Loading":"Loaded into container", "Arrival":"Klaipeda port", "Chisinau":"Chisinau", D_PURCHASED:"Purchased", D_TO_ORIGIN:"On the way to the yard", D_AT_ORIGIN:"At the yard", D_SEA:"Sea freight", D_TO_DEST:"Crossing Europe", D_AT_DEST:"At the European yard", D_ARRIVED:"Arrived", A_PURCHASED:"Paid", A_DISPATCHED:"On the way to the yard", A_DELIVERED:"Arrived at the yard", A_LOADED:"In the container", A_UNLOADED:"Unloaded", A_EU_DISPATCHED:"On the way to pickup", A_READY:"Ready for pickup"},
    status:{"Car won":"Won at auction", "Left auction":"Left the auction", "Delivered to loading place":"Arrived at the yard", "Loading":"Loaded into container", "Arrival":"Arrived at Klaipeda port", D_SEA:"Sea freight", A_LOADED:"Loaded into container", A_UNLOADED:"Unloaded in Europe", A_EU_DISPATCHED:"On the way to pickup point", A_READY:"Ready for pickup", A_DISPATCHED:"On the way to the yard", A_DELIVERED:"Arrived at the yard", A_PURCHASED:"Purchased"},
    delivered:"Delivered to Chisinau", toChisinau:"On the way to Chisinau", proc:"Processing", eta:"Estimated pickup in Chisinau around", label:"CAR TRACKING", fallback:"Your car", footer:"apexauto.md/tracking?lang=en", months:["January","February","March","April","May","June","July","August","September","October","November","December"], stageWord:"Stage", of:"of"}
};

function describeTrack(d, lang){
  const T = TR[lang];
  if(!d || d.error || (!d.vehicle && !(d.stages && d.stages.length))) return null;
  const stages = (d.stages || []).map(s => ({label:(T ? T.stage[s.title] : STAGE[s.title]) || STAGE[s.title] || s.title, status:s.status, raw:s.title}));
  const active = [...stages].reverse().find(s => s.status === "current" || s.status === "completed");
  const last = stages[stages.length - 1];
  const delivered = !!(last && last.status === "completed");
  let statusLabel = T ? T.proc : "В обработке";
  if(active){
    statusLabel = active.raw === "Chisinau" ? (active.status === "completed" ? (T ? T.delivered : "Доставлен в Кишинёв") : (T ? T.toChisinau : "В пути до Кишинёва")) : ((T ? T.status[active.raw] : STATUS[active.raw]) || active.label);
  }
  const done = stages.filter(s => s.status === "completed" || s.status === "current").length;
  const eta = !delivered && d.etaChisinau ? (T ? `${T.eta} ${dayLoc(d.etaChisinau, T, lang)}` : `Ожидаемая выдача в Кишинёве около ${dayRu(d.etaChisinau)}`) : "";
  return {label:T ? T.label : "", fallback:T ? T.fallback : "", footer:T ? T.footer : "", vehicle:d.vehicle || "", vin:String(d.vin || "").toUpperCase(), stages, statusLabel, delivered, done, total:stages.length, eta, image:d.photos && d.photos[0]};
}
module.exports = {describeTrack, TR};
