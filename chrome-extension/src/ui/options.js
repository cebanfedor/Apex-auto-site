/* options.js — чтение/запись настроек и быстрые проверки подключений. */
(function () {
  "use strict";
  const ApexX = window.ApexX;
  const $ = (id) => document.getElementById(id);

  const MAP = {
    tgToken: ["telegram", "token"],
    tgChat: ["telegram", "chatId"],
    tgMaxPhotos: ["telegram", "maxPhotos", "number"],
    tgSendPhotos: ["telegram", "sendPhotos", "bool"],
    tgSilent: ["telegram", "silent", "bool"],
    apiMode: ["api", "mode"],
    apiEndpoint: ["api", "siteEndpoint"],
    apiKey: ["api", "auctionsApiKey"],
    fbPage: ["facebook", "pageId"],
    fbToken: ["facebook", "token"],
    igUser: ["instagram", "igUserId"],
    igToken: ["instagram", "token"],
    calcSource: ["calc", "source"],
    calcEndpoint: ["calc", "endpoint"],
    ratesMode: ["calc", "ratesMode"],
    usdMdl: ["calc", "usdMdl", "number"],
    eurMdl: ["calc", "eurMdl", "number"],
    marginUsd: ["calc", "marginUsd", "number"],
    defaultPort: ["calc", "defaultPort"],
    calcExport: ["calc", "exportDocs", "bool"],
    calcOffsite: ["calc", "offsite", "bool"],
    postSite: ["post", "site"],
    postContact: ["post", "contact"],
    postWhatsapp: ["post", "whatsapp"],
    postAddress: ["post", "address"],
    postHashtags: ["post", "hashtags"],
    postHashtagsRo: ["post", "hashtagsRo"]
  };

  const TEMPLATES = {
    tplTelegram: "telegram", tplFacebook: "facebook", tplInstagram: "instagram",
    tplTelegramRo: "telegramRo", tplFacebookRo: "facebookRo", tplInstagramRo: "instagramRo"
  };

  function status(text, kind) {
    const node = $("status");
    node.textContent = text;
    node.className = "status" + (kind ? " " + kind : "");
    node.classList.toggle("hidden", !text);
  }

  function fill(settings) {
    Object.keys(MAP).forEach((id) => {
      const [group, key, kind] = MAP[id];
      const value = settings[group][key];
      if (kind === "bool") $(id).checked = !!value;
      else $(id).value = value == null ? "" : value;
    });
    Object.keys(TEMPLATES).forEach((id) => {
      $(id).value = settings.post.templates[TEMPLATES[id]] || "";
    });
    $("placeholders").textContent = [
      "title", "year", "make", "model", "lot", "vin", "auctionLabel", "url", "location", "saleDate",
      "odometer", "damage", "titleDoc", "specs", "engine", "fuel", "transmission", "drive", "keys", "startCode",
      "currentBid", "buyNow", "estRetail", "bid", "totalUsd", "totalEur", "totalMdl", "auctionFee",
      "land", "sea", "customs", "port", "contact", "whatsapp", "address", "site", "hashtags", "hashtagsRo", "autotags"
    ]
      .map((k) => "{{" + k + "}}")
      .join(" ");
  }

  function collect() {
    const patch = { telegram: {}, api: {}, facebook: {}, instagram: {}, calc: {}, post: { templates: {} } };
    Object.keys(MAP).forEach((id) => {
      const [group, key, kind] = MAP[id];
      const node = $(id);
      patch[group][key] = kind === "bool" ? node.checked : kind === "number" ? Number(node.value || 0) : node.value.trim();
    });
    Object.keys(TEMPLATES).forEach((id) => {
      patch.post.templates[TEMPLATES[id]] = $(id).value;
    });
    return patch;
  }

  async function testTelegram() {
    const token = $("tgToken").value.trim();
    const chat = $("tgChat").value.trim();
    if (!token) return status("Введите токен бота", "error");
    try {
      const me = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json();
      if (!me.ok) throw new Error(me.description || "getMe не прошёл");
      if (!chat) return status(`Бот @${me.result.username} на связи. Укажите канал, чтобы проверить права.`, "ok");
      const info = await (
        await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chat)}`)
      ).json();
      if (!info.ok) throw new Error(info.description || "getChat не прошёл");
      status(`Бот @${me.result.username} видит «${info.result.title || info.result.username}» ✓`, "ok");
    } catch (error) {
      status("Telegram: " + ((error && error.message) || error), "error");
    }
  }

  async function testApi() {
    const mode = $("apiMode").value;
    if (mode === "off") return status("API выключен — данные берутся только со страницы лота", "ok");
    const demoUrl = "https://www.copart.com/lot/44758603";
    try {
      if (mode === "direct") {
        const key = $("apiKey").value.trim();
        if (!key) return status("Введите ключ auctionsapi.com", "error");
        const res = await fetch("https://auctionsapi.com/api/search-lot/44758603/copart?prices_history=1", {
          headers: { "x-api-key": key, accept: "application/json" }
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error((payload && (payload.error || payload.message)) || "HTTP " + res.status);
        status("auctionsapi.com отвечает ✓ (тестовый лот 44758603)", "ok");
      } else {
        const endpoint = $("apiEndpoint").value.trim();
        const res = await fetch(`${endpoint}?url=${encodeURIComponent(demoUrl)}`);
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload || payload.ok === false) {
          throw new Error((payload && payload.error) || "HTTP " + res.status);
        }
        status("Сайт отвечает ✓ — лот получен через apexauto.md", "ok");
      }
    } catch (error) {
      status("API: " + ((error && error.message) || error), "error");
    }
  }

  async function init() {
    const settings = await ApexX.settings.load();
    fill(settings);
    $("btnSave").addEventListener("click", async () => {
      await ApexX.settings.save(collect());
      status("Настройки сохранены ✓", "ok");
    });
    $("btnReset").addEventListener("click", async () => {
      const fresh = await ApexX.settings.reset();
      fill(fresh);
      status("Настройки сброшены к значениям по умолчанию", "ok");
    });
    $("btnResetTemplates").addEventListener("click", async () => {
      const fresh = await ApexX.settings.resetTemplates();
      fill(fresh);
      status("Шаблоны постов возвращены к стандартным ✓", "ok");
    });
    $("btnTestTg").addEventListener("click", testTelegram);
    $("btnTestApi").addEventListener("click", testApi);
  }

  init();
})();
