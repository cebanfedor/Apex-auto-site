/* Иллюстрация «Карта повреждений» (26.11.2026): аккуратный вид сверху, повреждённые панели подсвечены красным/янтарным, подпись у главного удара.
   Чистый SVG без библиотек: window.apexDamageArt(zones, main, names, labels) → строка <svg>.
   zones — {F:1, FR:2, …} (уровни 1–2), main — ключ главной зоны, names — подписи зон, labels — {front, rear}. Зоны: F FL FR L R T RL B RR. */
(function(){
  "use strict";
  var CX = 200;
  // правая половина контура: от центра носа к центру кормы; левая — зеркально
  var P0 = [200, 40];
  var SEG = [
    [[232, 40], [262, 46], [274, 66]],
    [[283, 84], [287, 120], [288, 170]],
    [[289, 210], [286, 250], [286, 290]],
    [[286, 330], [290, 360], [289, 392]],
    [[287, 420], [268, 438], [238, 440]],
    [[224, 441], [212, 441], [200, 441]]
  ];
  function m(p){ return [400 - p[0], p[1]]; }
  function f(p){ return p[0].toFixed(1) + " " + p[1].toFixed(1); }
  function outline(){
    var d = "M" + f(P0), cur = P0, i;
    for(i = 0; i < SEG.length; i++){ d += " C" + f(SEG[i][0]) + "," + f(SEG[i][1]) + "," + f(SEG[i][2]); }
    for(i = SEG.length - 1; i >= 0; i--){
      var start = i === 0 ? P0 : SEG[i - 1][2];
      d += " C" + f(m(SEG[i][1])) + "," + f(m(SEG[i][0])) + "," + f(m(start));
    }
    return d + " Z";
  }
  var BODY = outline();

  // области зон (внутри контура; размываются, поэтому границы мягкие)
  var ZONES = {
    F:[152, 30, 96, 128], FL:[100, 30, 62, 128], FR:[238, 30, 62, 128],
    L:[100, 150, 52, 190], R:[248, 150, 52, 190], T:[152, 150, 96, 190],
    RL:[100, 332, 62, 118], B:[152, 332, 96, 118], RR:[238, 332, 62, 118]
  };
  var MARK = {F:[200, 92], FL:[136, 102], FR:[264, 102], L:[124, 250], R:[276, 250], T:[200, 262], RL:[136, 396], B:[200, 404], RR:[264, 396]};

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[c]; }); }

  function art(zones, main, names, labels){
    zones = zones || {}; names = names || {}; labels = labels || {};
    var blobs = "", k;
    for(k in ZONES){
      var lv = Number(zones[k]) || 0; if(!lv) continue;
      var z = ZONES[k];
      blobs += '<rect x="' + z[0] + '" y="' + z[1] + '" width="' + z[2] + '" height="' + z[3] + '" rx="26" fill="' + (lv >= 2 ? "url(#dmgR)" : "url(#dmgA)") + '"/>';
    }
    // метка у главного удара + подпись сбоку
    var mark = "";
    var mp = MARK[main];
    if(mp){
      var txt = names[main] || "", w = Math.max(70, Math.round(txt.length * 7.3 + 26));
      var right = mp[0] >= CX - 4, lx = right ? 306 : 94 - w, ly = Math.min(432, Math.max(44, mp[1])) - 13;
      var ax = right ? lx : lx + w;
      var bend = right ? mp[0] + 30 : mp[0] - 30;
      mark =
        '<polyline points="' + mp[0] + "," + mp[1] + " " + bend.toFixed(0) + "," + (ly + 13) + " " + ax + "," + (ly + 13) + '" fill="none" stroke="#14181f" stroke-width="1.4" stroke-linejoin="round" opacity=".55"/>' +
        '<circle cx="' + mp[0] + '" cy="' + mp[1] + '" r="6" fill="none" stroke="#e5162b" stroke-width="2"><animate attributeName="r" values="6;17" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".85;0" dur="2s" repeatCount="indefinite"/></circle>' +
        '<circle cx="' + mp[0] + '" cy="' + mp[1] + '" r="6.5" fill="#e5162b" stroke="#fff" stroke-width="2.4"/>' +
        (txt ? '<g><rect x="' + lx + '" y="' + ly + '" width="' + w + '" height="26" rx="9" fill="#14181f"/><text x="' + (lx + w / 2) + '" y="' + (ly + 17.4) + '" text-anchor="middle" font-family="Onest,Inter,system-ui,sans-serif" font-size="12" font-weight="800" fill="#fff">' + esc(txt) + '</text></g>' : "");
    }
    return '<svg class="dmgArtV1" viewBox="-62 0 524 480" role="img" aria-label="' + esc(labels.aria || "") + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<clipPath id="dmgArtClip"><path d="' + BODY + '"/></clipPath>' +
        '<linearGradient id="dmgBody" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#b7bfcb"/><stop offset=".2" stop-color="#e1e6ee"/><stop offset=".5" stop-color="#f6f8fb"/><stop offset=".8" stop-color="#dde2ea"/><stop offset="1" stop-color="#b3bbc7"/></linearGradient>' +
        '<linearGradient id="dmgGlass" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#18202b"/><stop offset="1" stop-color="#34414f"/></linearGradient>' +
        '<linearGradient id="dmgShine" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
        '<linearGradient id="dmgRoof" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#d3d9e2"/><stop offset=".5" stop-color="#f7f9fc"/><stop offset="1" stop-color="#cfd5df"/></linearGradient>' +
        '<radialGradient id="dmgR" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#e0101f" stop-opacity="1"/><stop offset=".65" stop-color="#e5162b" stop-opacity=".92"/><stop offset="1" stop-color="#e5162b" stop-opacity=".4"/></radialGradient>' +
        '<radialGradient id="dmgA" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#f5a524" stop-opacity=".95"/><stop offset=".6" stop-color="#f5a524" stop-opacity=".75"/><stop offset="1" stop-color="#f5a524" stop-opacity=".2"/></radialGradient>' +
        '<filter id="dmgBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>' +
        '<filter id="dmgShadow" x="-30%" y="-20%" width="160%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>' +
      '</defs>' +
      // тень на земле
      '<ellipse cx="206" cy="250" rx="108" ry="218" fill="#0f1620" opacity=".22" filter="url(#dmgShadow)"/>' +
      // колёса (выступают из-под кузова)
      '<g fill="#161b23">' +
        '<rect x="99" y="92" width="14" height="60" rx="6"/><rect x="287" y="92" width="14" height="60" rx="6"/>' +
        '<rect x="99" y="338" width="14" height="62" rx="6"/><rect x="287" y="338" width="14" height="62" rx="6"/>' +
      '</g>' +
      '<g fill="#3a4350"><rect x="102" y="104" width="5" height="36" rx="2.5"/><rect x="293" y="104" width="5" height="36" rx="2.5"/><rect x="102" y="350" width="5" height="38" rx="2.5"/><rect x="293" y="350" width="5" height="38" rx="2.5"/></g>' +
      // зеркала
      '<path d="M121 205 C112 203 104 206 102 212 C104 218 113 219 122 216 Z" fill="#cdd3dc" stroke="#9aa4b2" stroke-width="1"/>' +
      '<path d="M279 205 C288 203 296 206 298 212 C296 218 287 219 278 216 Z" fill="#cdd3dc" stroke="#9aa4b2" stroke-width="1"/>' +
      // кузов
      '<path d="' + BODY + '" fill="url(#dmgBody)"/>' +
      '<g clip-path="url(#dmgArtClip)">' +
        '<g filter="url(#dmgBlur)">' + blobs + '</g>' +
        // капот, крыша, багажник — рельеф
        '<path d="M200 48 L200 160" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><path d="M168 60 C176 100 178 130 176 158 M232 60 C224 100 222 130 224 158" fill="none" stroke="#8f99a8" stroke-opacity=".28" stroke-width="1.2"/>' +
        '<path d="M200 378 L200 436" stroke="#fff" stroke-opacity=".45" stroke-width="1.2"/>' +
        '<path d="M110 160 C150 152 250 152 290 160 M112 372 C152 380 248 380 288 372" fill="none" stroke="#7f8998" stroke-opacity=".5" stroke-width="1.3"/>' +
        // стёкла
        '<path d="M136 176 C160 162 240 162 264 176 L254 216 C232 208 168 208 146 216 Z" fill="url(#dmgGlass)"/>' +
        '<path d="M142 330 C166 338 234 338 258 330 L266 368 C240 380 160 380 134 368 Z" fill="url(#dmgGlass)" transform="translate(0,-4)"/>' +
        '<path d="M132 218 L146 218 L146 322 L136 318 C132 290 131 250 132 218 Z M268 218 L254 218 L254 322 L264 318 C268 290 269 250 268 218 Z" fill="url(#dmgGlass)"/>' +
        // крыша
        '<rect x="146" y="214" width="108" height="108" rx="26" fill="url(#dmgRoof)" stroke="#aeb7c4" stroke-width="1"/>' +
        '<rect x="150" y="218" width="100" height="100" rx="22" fill="url(#dmgShine)"/>' +
        // швы дверей
        '<path d="M104 244 L132 244 M104 290 L132 290 M268 244 L296 244 M268 290 L296 290" stroke="#7f8998" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>' +
        // фары и огни
        '<path d="M126 60 C140 52 158 52 170 58 C164 66 146 70 130 70 Z M274 60 C260 52 242 52 230 58 C236 66 254 70 270 70 Z" fill="#fff" stroke="#9aa4b2" stroke-width="1"/>' +
        '<path d="M130 428 C146 434 160 434 172 430 L170 422 C156 424 142 424 128 418 Z M270 428 C254 434 240 434 228 430 L230 422 C244 424 258 424 272 418 Z" fill="#c91d2c"/>' +
        '<path d="M184 436 L216 436" stroke="#7f8998" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/>' +
        '<ellipse cx="200" cy="300" rx="6" ry="2.6" fill="#8f99a8" opacity=".7"/>' +
      '</g>' +
      // контур и блик
      '<path d="' + BODY + '" fill="none" stroke="#8b95a4" stroke-width="1.8"/>' +
      '<path d="' + BODY + '" fill="url(#dmgShine)" opacity=".35"/>' +
      '<g font-family="Onest,Inter,system-ui,sans-serif" font-size="10" font-weight="800" letter-spacing="1.4" fill="#8b95a4" text-anchor="middle">' +
        '<text x="200" y="24">' + esc(labels.front || "ПЕРЕД") + '</text><text x="200" y="468">' + esc(labels.rear || "ЗАД") + '</text>' +
      '</g>' +
      mark +
    '</svg>';
  }
  window.apexDamageArt = art;
})();
