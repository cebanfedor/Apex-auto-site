// Модель Tesla по VIN. Фид Copart/IAAI иногда путает модель (VIN 5YJ3… — Model 3 — пришёл как «Model X»), а у Tesla модель
// однозначно задаёт 4-й знак VIN: 5YJ S/3/X/Y, 7SA X/Y, LRW 3/Y, XP7 Y, 7G2 C (Cybertruck).
// id — model_id справочника auctionsapi (производитель 187), body — id кузова там же (1 седан, 5 внедорожник).
const MODELS = {
  "3": {id:2741, name:"Model 3", body:{id:1, name:"sedan"}},
  "S": {id:1772, name:"Model S", body:null},
  "X": {id:2497, name:"Model X", body:{id:5, name:"suv"}},
  "Y": {id:3119, name:"Model Y", body:{id:5, name:"suv"}},
  "C": {id:3120, name:"Cybertruck", body:null}
};
const WMI = /^(5YJ|7SA|LRW|XP7|7G2|SFZ)/;
function teslaModelFromVin(vin){
  const v = String(vin || "").toUpperCase();
  if(v.length !== 17 || !WMI.test(v)) return null;
  const m = MODELS[v[3]];
  return m ? m : null;
}
// Правит сырой элемент фида на месте (идемпотентно): модель, название, кузов. true — что-то изменилось.
function fixTeslaItem(item){
  try{
    if(!item || typeof item !== "object") return false;
    const mk = item.manufacturer && typeof item.manufacturer === "object" ? item.manufacturer.name : item.manufacturer;
    if(!/tesla/i.test(String(mk || ""))) return false;
    const m = teslaModelFromVin(item.vin || (Array.isArray(item.lots) && item.lots[0] && item.lots[0].vin));
    if(!m) return false;
    const cur = item.model && typeof item.model === "object" ? item.model : {name:String(item.model || "")};
    if(Number(cur.id) === m.id && String(cur.name).toLowerCase() === m.name.toLowerCase()) return false;
    const old = String(cur.name || "");
    item.model = {...cur, id:m.id, name:m.name};
    if(item.title && old) item.title = String(item.title).replace(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), m.name);
    else if(item.title) item.title = String(item.title).replace(/Model [3SXY]|Cybertruck/i, m.name);
    if(m.body) item.body_type = {...(item.body_type && typeof item.body_type === "object" ? item.body_type : {}), id:m.body.id, name:m.body.name};
    return true;
  }catch(_){ return false; }
}
module.exports = {teslaModelFromVin, fixTeslaItem, MODELS};
