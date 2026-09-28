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
const TESLA_MAKE_ID = 187;
// Правит сырой элемент фида на месте (идемпотентно): марку, модель, название, кузов. true — что-то изменилось.
// 28.09.2026 (Федор, IAAI 40084037, VIN 5YJY…: в фиде марка была «Subaru», не только модель) — раньше функция
// сначала проверяла, что марка УЖЕ «Tesla», и только тогда чинила модель: если фид путает саму марку, проверка
// проваливалась и лот оставался «Subaru Impreza» с фото и названием Tesla. WMI-префикс VIN однозначно определяет
// Tesla независимо от того, что сейчас написано в марке — теперь именно он решает, применять ли фикс вообще.
function fixTeslaItem(item){
  try{
    if(!item || typeof item !== "object") return false;
    const m = teslaModelFromVin(item.vin || (Array.isArray(item.lots) && item.lots[0] && item.lots[0].vin));
    if(!m) return false;
    let changed = false;
    const mk = item.manufacturer && typeof item.manufacturer === "object" ? item.manufacturer.name : item.manufacturer;
    if(!/tesla/i.test(String(mk || ""))){
      item.manufacturer = {...(item.manufacturer && typeof item.manufacturer === "object" ? item.manufacturer : {}), id:TESLA_MAKE_ID, name:"Tesla"};
      changed = true;
    }
    const cur = item.model && typeof item.model === "object" ? item.model : {name:String(item.model || "")};
    if(!(Number(cur.id) === m.id && String(cur.name).toLowerCase() === m.name.toLowerCase())){
      const old = String(cur.name || "");
      item.model = {...cur, id:m.id, name:m.name};
      if(item.title && old) item.title = String(item.title).replace(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), m.name);
      else if(item.title) item.title = String(item.title).replace(/Model [3SXY]|Cybertruck/i, m.name);
      changed = true;
    }
    if(m.body){
      const curBody = item.body_type && typeof item.body_type === "object" ? item.body_type : {};
      if(!(Number(curBody.id) === m.body.id && String(curBody.name || "").toLowerCase() === m.body.name.toLowerCase())){
        item.body_type = {...curBody, id:m.body.id, name:m.body.name};
        changed = true;
      }
    }
    return changed;
  }catch(_){ return false; }
}
module.exports = {teslaModelFromVin, fixTeslaItem, MODELS, TESLA_MAKE_ID};
