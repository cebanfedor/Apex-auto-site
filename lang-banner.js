/* Плашка «статья есть и на румынском» на длинных статьях.
   Вынесена из инлайн-скриптов (13.11.2026): раньше 6 копий с разными хешами в CSP, а пять из них читали
   несуществующий ключ localStorage «apex_lang» (сайт хранит «apexAutoLang») — выбор языка на сайте игнорировался. */
(function () {
  var B = {
    dmgLangBannerV1: ["/ro/daune-auto", "Acest articol este disponibil și în română"],
    shipmyLangBannerV1: ["/ro/transport-masina-personala", "Acest articol este disponibil și în română"],
    shipLangBannerV1: ["/ro/transport-maritim", "Acest articol este disponibil și în română"],
    teslaLangBannerV1: ["/ro/tesla-model-3", "Acest articol este disponibil și în română"],
    feesLangBannerV1: ["/ro/taxele-licitatiilor", "Acest articol este disponibil și în română"],
    vinLangBannerV1: ["/ro/verificare-vin", "Acest articol este disponibil și în română"],
    guideLangBannerV405: ["/ro/ghid-auto-sua", "Acest ghid este disponibil și în limba română"],
    customsRoBannerV1: ["/ro/vamuirea-auto", "Această pagină este disponibilă și în limba română"]
  };
  // Новые статьи блога «Запчасти и ремонт» (v2): плашка со ссылкой на румынскую или английскую версию по языку пользователя
  var T = { ro: ["Acest articol este disponibil și în română", "deschideți versiunea în română →"], en: ["This article is also available in English", "open the English version →"] };
  var lng = "";
  try { lng = localStorage.getItem("apexAutoLang") || ""; } catch (e) {}
  if (!lng) lng = (navigator.languages && navigator.languages[0]) || navigator.language || "ru";
  var l = String(lng).toLowerCase();
  var art = document.getElementById("artLangBannerV1");
  if (art) {
    var code = (l.indexOf("ro") === 0 || l.indexOf("mo") === 0) ? "ro" : (l.indexOf("en") === 0 ? "en" : "");
    var href = code && art.getAttribute("data-" + code);
    if (href) { art.style.display = "block"; art.innerHTML = T[code][0] + ': <a href="' + href + '" style="color:#c00;font-weight:700">' + T[code][1] + '</a>'; }
  }
  if (!(l.indexOf("ro") === 0 || l.indexOf("mo") === 0)) return;
  Object.keys(B).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.display = "block";
    el.innerHTML = B[id][1] + ': <a href="' + B[id][0] + '" style="color:#c00;font-weight:700">deschideți versiunea în română →</a>';
  });
})();
