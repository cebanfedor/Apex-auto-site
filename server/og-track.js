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
const dayRu = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${Number(m[3])} ${MONTH[Number(m[2]) - 1]}` : ""; };

function describeTrack(d){
  if(!d || d.error || (!d.vehicle && !(d.stages && d.stages.length))) return null;
  const stages = (d.stages || []).map(s => ({label:STAGE[s.title] || s.title, status:s.status, raw:s.title}));
  const active = [...stages].reverse().find(s => s.status === "current" || s.status === "completed");
  const last = stages[stages.length - 1];
  const delivered = !!(last && last.status === "completed");
  let statusLabel = "В обработке";
  if(active){
    statusLabel = active.raw === "Chisinau" ? (active.status === "completed" ? "Доставлен в Кишинёв" : "В пути до Кишинёва") : (STATUS[active.raw] || active.label);
  }
  const done = stages.filter(s => s.status === "completed" || s.status === "current").length;
  const eta = !delivered && d.etaChisinau ? `Ожидаемая выдача в Кишинёве около ${dayRu(d.etaChisinau)}` : "";
  return {vehicle:d.vehicle || "", vin:String(d.vin || "").toUpperCase(), stages, statusLabel, delivered, done, total:stages.length, eta, image:d.photos && d.photos[0]};
}
module.exports = {describeTrack};
