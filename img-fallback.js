// Делегированные обработчики вместо инлайн on*= — чтобы снять script-src
// 'unsafe-inline' из CSP (инлайн-обработчики нельзя покрыть хешем без
// 'unsafe-hashes'). Загружается блокирующим тегом в <head> ДО картинок, чтобы
// поймать ошибку даже у eager-hero (error не всплывает и не повторяется).
(function(){
  // 1) Фолбэк битых картинок: data-fb → подставить src; data-fb-hide → скрыть;
  //    data-fb-bg → задать фон. (замена onerror="this.src=…/style=…")
  document.addEventListener("error", function(e){
    var el = e.target;
    if(!el || el.tagName !== "IMG" || el.getAttribute("data-fb-done")) return;
    el.setAttribute("data-fb-done", "1");
    var fb = el.getAttribute("data-fb");
    if(fb){ el.src = fb; return; }
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
