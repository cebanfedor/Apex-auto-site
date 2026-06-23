(function(){
  function setText(selector, value){
    if(!value) return;
    const el = document.querySelector(selector);
    if(el) el.textContent = value;
  }

  function setLinks(content){
    const phone = content.phone || "068-832-032";
    const phoneHref = `tel:${phone.replace(/[^\d+]/g, "")}`;
    const whatsapp = content.whatsapp || "https://wa.me/37368832032";
    const telegram = content.telegram || "https://t.me/fedukusa";

    document.querySelectorAll('a[href^="tel:"]').forEach(link => {
      link.href = phoneHref;
      if(/^\+?\d|068/.test(link.textContent.trim())) link.textContent = phone;
    });
    document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
      link.href = whatsapp;
      if(link.textContent.includes("WhatsApp")) link.textContent = `WhatsApp: ${phone}`;
    });
    document.querySelectorAll('a[href="https://t.me/fedukusa"]').forEach(link => {
      link.href = telegram;
    });
  }

  function applyContent(content){
    if(!content || typeof content !== "object") return;
    if(content.logo_url){
      document.querySelectorAll(".headerBrand img").forEach(img => {
        img.src = content.logo_url;
      });
    }
    setLinks(content);
    setText(".heroMainV45 h1", content.hero_title);
    setText(".heroMainV45 p", content.hero_text);

    if(Array.isArray(content.benefits) && content.benefits.length){
      const checks = document.querySelector(".telegramHotChecksV88");
      if(checks){
        checks.innerHTML = content.benefits.slice(0, 4).map(item => `<span>${String(item).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}</span>`).join("");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try{
      const response = await fetch("/api/content", {credentials:"same-origin"});
      const payload = await response.json();
      if(payload.ok) applyContent(payload.content);
    }catch(error){
      // Static fallback stays visible when Supabase/env is not configured.
    }
  });
})();
