// Генерация превью-картинок (1200×630) для страниц сайта: node scripts/build-og-pages.js
// Результат — assets/og/<имя>.png (коммитится). Лоты/трекинг/каталог рисуются на лету (api/og.js), это — статические страницы.
const fs = require("fs");
const path = require("path");
const {pageCard} = require("../server/og-card");
const A = p => path.join(__dirname, "../assets", p);

const PAGES = {
  // отдельные румынские страницы (RU/RO/EN варианты остальных — в server/og-pages.js)
  "ro-blog":{k:"BLOG", t:"Blog despre mașini din SUA și Canada", s:"Ghiduri și analize: cifre reale și experiență", p:"apexauto.md/ro/blog"},
  "ro-daune-auto":{k:"DAUNE AUTO", t:"Ce daune sunt periculoase și care nu", s:"Cum alegi loturi avantajoase la licitație", p:"apexauto.md/ro/daune-auto"},
  "ro-ghid-auto-sua":{k:"GHID 2026", t:"Cum aduci o mașină din SUA sau Canada în Moldova", s:"Licitație, livrare, vămuire — pas cu pas", p:"apexauto.md/ro/ghid-auto-sua", img:"hot/delivery-sea.jpg"},
  "ro-taxele-licitatiilor":{k:"TAXELE LICITAȚIILOR", t:"Auction Fee pe Copart și IAAI", s:"Din ce constau taxele și cum le calculezi", p:"apexauto.md/ro/taxele-licitatiilor"},
  "ro-tesla-model-3":{k:"EXEMPLU DE CALCUL", t:"Tesla Model 3 din SUA în Moldova", s:"Prețul la cheie până la Chișinău", p:"apexauto.md/ro/tesla-model-3"},
  "ro-transport-maritim":{k:"LIVRARE", t:"Livrarea auto din SUA și Canada în Moldova", s:"Rute, porturi și termene până la Chișinău", p:"apexauto.md/ro/transport-maritim", img:"hot/delivery-sea.jpg"},
  "ro-transport-masina-personala":{k:"MAȘINA PERSONALĂ", t:"Trimitem mașina dvs. acasă în Moldova", s:"O ridicăm din SUA și o livrăm la Chișinău", p:"apexauto.md/ro/transport-masina-personala", img:"hot/delivery-sea.jpg"},
  "ro-vamuirea-auto":{k:"VĂMUIRE 2026", t:"Vămuirea auto în Moldova", s:"Accize, tabele, scutiri pentru EV și hibride", p:"apexauto.md/ro/vamuirea-auto"},
  "ro-verificare-vin":{k:"VERIFICARE VIN", t:"Cum verifici VIN-ul înainte de cumpărare", s:"Carfax, AutoCheck și semnale de alarmă", p:"apexauto.md/ro/verificare-vin"}
};
(async () => {
  const only = process.argv[2];
  const {PAGES: SITE} = require("../server/og-pages");
  for(const [name, c] of Object.entries(SITE)){
    for(const lang of ["ru", "ro", "en"]){
      const file = lang === "ru" ? name : `${name}-${lang}`;
      if(only && only !== file && only !== name) continue;
      const x = c[lang];
      const png = await pageCard({kicker:x.k, title:x.h, sub:x.s, path:"apexauto.md" + (c.path ? "/" + c.path : "") + (lang === "ru" ? "" : `?lang=${lang}`), photoPath:c.img ? A(c.img) : null});
      fs.writeFileSync(path.join(__dirname, "../assets/og", file + ".png"), png);
      console.log(file, png.length);
    }
  }
  for(const [name, c] of Object.entries(PAGES)){
    if(only && only !== name) continue;
    const png = await pageCard({kicker:c.k, title:c.t, sub:c.s, path:c.p, photoPath:c.img ? A(c.img) : null});
    fs.writeFileSync(path.join(__dirname, "../assets/og", name + ".png"), png);
    console.log(name, png.length);
  }
})();
