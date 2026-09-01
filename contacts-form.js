// Самодостаточный обработчик формы контактов (contacts.html).
// script.js на этой странице намеренно не грузится (нет калькулятора), поэтому
// логика формы вынесена сюда. Лид пишется на сервер (Supabase + Telegram-бот)
// тем же путём, что и форма аукционов; Telegram-share — дополнительный канал.
(function(){
  var form = document.getElementById("contactQuickForm");
  if(!form) return;

  function tgShare(text){
    window.open("https://t.me/share/url?url=&text=" + encodeURIComponent(text), "_blank", "noopener");
  }
  async function postLead(payload){
    try{
      var r = await fetch("/api/auctions?action=lead", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify(payload)
      });
      var data = await r.json().catch(function(){ return {}; });
      return !!(r.ok && data.ok);
    }catch(e){ return false; }
  }
  function result(ok){
    var lng = window.APEX_LANG || document.documentElement.lang || "ru";
    var title = ok
      ? (lng === "ro" ? "Cererea a fost trimisă!" : lng === "en" ? "Request sent!" : "Заявка отправлена!")
      : (lng === "ro" ? "Trimiteți prin Telegram" : lng === "en" ? "Send via Telegram" : "Отправьте через Telegram");
    var text = ok
      ? (lng === "ro" ? "Vă vom contacta în cel mai scurt timp. Am deschis și Telegram — puteți scrie direct."
        : lng === "en" ? "We'll get back to you shortly. We also opened Telegram — feel free to message us there."
        : "Мы свяжемся с вами в ближайшее время. Также открыли Telegram — можно написать напрямую.")
      : (lng === "ro" ? "Nu am putut trimite formularul. Am deschis Telegram cu mesajul — trimiteți-l, vă rugăm."
        : lng === "en" ? "We couldn't submit the form. We opened Telegram with your message — please send it."
        : "Не удалось отправить форму. Мы открыли Telegram с сообщением — отправьте его, пожалуйста.");
    form.innerHTML = '<div class="formSuccessV2"><div class="formSuccessIcon">' + (ok ? "✓" : "➤") +
      '</div><p><strong>' + title + '</strong>' + text + '</p></div>';
  }

  form.addEventListener("submit", async function(event){
    event.preventDefault();
    var g = function(id){ var el = document.getElementById(id); return el ? el.value.trim() : ""; };
    var name = g("contactName"), phone = g("contactPhone"), car = g("contactCar"), comment = g("contactMessage");
    var btn = form.querySelector("button[type=submit], button:not([type])");
    if(btn) btn.disabled = true;

    var fullComment = [car ? "Автомобиль / ссылка: " + car : "", comment].filter(Boolean).join("\n");
    var ok = await postLead({name:name, phone:phone, comment:fullComment, source:"Контакт (сайт)"});
    tgShare([
      "Контактный запрос | APEX AUTO", "",
      "Имя: " + (name || "-"),
      "Телефон / Telegram: " + (phone || "-"),
      "Автомобиль / ссылка: " + (car || "-"), "",
      "Задача:", comment || "-"
    ].join("\n"));
    result(ok);
  });
})();
