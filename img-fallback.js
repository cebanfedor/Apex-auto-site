// Делегированные обработчики вместо инлайн on*= — чтобы снять script-src
// 'unsafe-inline' из CSP (инлайн-обработчики нельзя покрыть хешем без
// 'unsafe-hashes'). Загружается блокирующим тегом в <head> ДО картинок, чтобы
// поймать ошибку даже у eager-hero (error не всплывает и не повторяется).
(function(){
  // 0) Страховка стилей: если styles.css не загрузился (обрыв сети, сбой в момент деплоя,
  //    расширение браузера) — страница показывалась «голой». Пробуем один раз перезагрузить
  //    таблицу с другим адресом (в обход закэшированной ошибки). Этот скрипт выполняется ПОСЛЕ
  //    попытки загрузки CSS, поэтому проверяем и уже случившийся сбой (link.sheet === null),
  //    и будущие — через событие error.
  function retryCss(link){
    if(!link || link.getAttribute("data-css-retry")) return;
    var href = link.getAttribute("href") || "";
    if(!href || /fonts\.googleapis/.test(href)) return;
    var fresh = document.createElement("link");
    fresh.rel = "stylesheet";
    fresh.setAttribute("data-css-retry", "1");
    fresh.href = href + (href.indexOf("?") < 0 ? "?" : "&") + "r=" + Date.now();
    link.setAttribute("data-css-retry", "1");
    link.parentNode.insertBefore(fresh, link.nextSibling);
  }
  try{
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for(var i = 0; i < links.length; i++){ if(!links[i].sheet) retryCss(links[i]); }
  }catch(e){}
  document.addEventListener("error", function(e){
    var el = e.target;
    if(el && el.tagName === "LINK" && /stylesheet/i.test(el.rel || "")) retryCss(el);
  }, true);

  // 1) Фолбэк битых картинок: data-fb → подставить src; data-fb-hide → скрыть;
  //    data-fb-bg → задать фон. (замена onerror="this.src=…/style=…")
  document.addEventListener("error", function(e){
    var el = e.target;
    if(!el || el.tagName !== "IMG" || el.getAttribute("data-fb-done")) return;
    el.setAttribute("data-fb-done", "1");
    var fb = el.getAttribute("data-fb");
    if(fb){ el.removeAttribute("srcset"); el.removeAttribute("sizes"); el.src = fb; return; }   // srcset перебивал бы src
    if(el.hasAttribute("data-fb-hide")){ el.style.display = "none"; return; }
    var bg = el.getAttribute("data-fb-bg");
    if(bg){ el.style.background = bg; }
  }, true);

  // 2) Закрытие exit-popup: data-exit-close вместо onclick="exitPopupClose()".
  document.addEventListener("click", function(e){
    var t = e.target.closest ? e.target.closest("[data-exit-close]") : null;
    if(t && typeof window.exitPopupClose === "function"){ window.exitPopupClose(); }
  });
})();
