/* settings.js — настройки расширения (chrome.storage.local) и шаблоны постов. */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});

  /* Шаблоны — чистый текст без разметки: что видно в панели, то и уйдёт в канал.
     Порядок блоков: машина и дата торгов → характеристики → цена → контакты. */
  const TELEGRAM_TEMPLATE = [
    "🚗 *{{title}}*",
    "🗓 Торги: {{saleDate}}",
    "",
    "🆔 VIN: {{vin}}",
    "🛞 Пробег: {{odometer}}",
    "💥 Повреждения: {{damage}}",
    "⚙️ {{specs}}",
    "🔧 Состояние: {{startCode}}",
    "",
    "💵 Прогнозируемая цена на аукционе: {{bid}}",
    "💰 *Итого под ключ в Кишинёве: {{totalUsd}} ({{totalEur}})*",
    "в сумму входят сборы аукциона, доставка, растаможка и наши услуги",
    "",
    "👇 *Понравился лот? Напишите нам:*",
    "😎 Telegram {{contact}}",
    "📱 WhatsApp {{whatsapp}}",
    "📍 {{address}}",
    "🌐 {{site}}",
    "{{hashtags}} {{autotags}}"
  ].join("\n");

  const FACEBOOK_TEMPLATE = [
    "🚗 *{{title}}*",
    "🗓 Торги: {{saleDate}}",
    "",
    "🆔 VIN: {{vin}}",
    "🛞 Пробег: {{odometer}}",
    "💥 Повреждения: {{damage}}",
    "⚙️ {{specs}}",
    "",
    "💵 Прогнозируемая цена на аукционе: {{bid}}",
    "💰 *Итого под ключ в Кишинёве: {{totalUsd}} ({{totalEur}})*",
    "",
    "👇 *Понравился лот? Напишите нам:*",
    "😎 Telegram {{contact}}",
    "📱 WhatsApp {{whatsapp}}",
    "📍 {{address}}",
    "🌐 {{site}}",
    "",
    "{{hashtags}} {{autotags}}"
  ].join("\n");

  const INSTAGRAM_TEMPLATE = [
    "🚗 *{{title}}*",
    "🗓 Торги: {{saleDate}}",
    "",
    "🛞 {{odometer}}",
    "💥 {{damage}}",
    "⚙️ {{specs}}",
    "",
    "💵 Прогнозируемая цена на аукционе: {{bid}}",
    "💰 *Итого под ключ в Кишинёве: {{totalUsd}} ({{totalEur}})*",
    "Привезём под заказ из США и Канады за 45–60 дней.",
    "",
    "👇 *Понравился лот? Напишите нам:*",
    "😎 Telegram {{contact}} · 📱 WhatsApp {{whatsapp}}",
    "📍 {{address}}",
    "",
    "{{hashtags}} {{autotags}}"
  ].join("\n");


  /* Румынские шаблоны — кнопка RO в панели. */
  const TELEGRAM_TEMPLATE_RO = [
    "🚗 *{{title}}*",
    "🗓 Licitație: {{saleDate}}",
    "",
    "🆔 VIN: {{vin}}",
    "🛞 Rulaj: {{odometer}}",
    "💥 Daune: {{damage}}",
    "⚙️ {{specs}}",
    "🔧 Stare: {{startCode}}",
    "",
    "💵 Preț estimat la licitație: {{bid}}",
    "💰 *Total la cheie în Chișinău: {{totalUsd}} ({{totalEur}})*",
    "în sumă intră taxele licitației, transportul, vămuirea și serviciile noastre",
    "",
    "👇 *V-a plăcut lotul? Scrieți-ne:*",
    "😎 Telegram {{contact}}",
    "📱 WhatsApp {{whatsapp}}",
    "📍 {{address}}",
    "🌐 {{site}}",
    "{{hashtagsRo}} {{autotags}}"
  ].join("\n");

  const FACEBOOK_TEMPLATE_RO = [
    "🚗 *{{title}}*",
    "🗓 Licitație: {{saleDate}}",
    "",
    "🆔 VIN: {{vin}}",
    "🛞 Rulaj: {{odometer}}",
    "💥 Daune: {{damage}}",
    "⚙️ {{specs}}",
    "",
    "💵 Preț estimat la licitație: {{bid}}",
    "💰 *Total la cheie în Chișinău: {{totalUsd}} ({{totalEur}})*",
    "",
    "👇 *V-a plăcut lotul? Scrieți-ne:*",
    "😎 Telegram {{contact}}",
    "📱 WhatsApp {{whatsapp}}",
    "📍 {{address}}",
    "🌐 {{site}}",
    "",
    "{{hashtagsRo}} {{autotags}}"
  ].join("\n");

  const INSTAGRAM_TEMPLATE_RO = [
    "🚗 *{{title}}*",
    "🗓 Licitație: {{saleDate}}",
    "",
    "🛞 {{odometer}}",
    "💥 {{damage}}",
    "⚙️ {{specs}}",
    "",
    "💵 Preț estimat la licitație: {{bid}}",
    "💰 *Total la cheie în Chișinău: {{totalUsd}} ({{totalEur}})*",
    "Aducem mașina la comandă din SUA și Canada în 45–60 de zile.",
    "",
    "👇 *V-a plăcut lotul? Scrieți-ne:*",
    "😎 Telegram {{contact}} · 📱 WhatsApp {{whatsapp}}",
    "📍 {{address}}",
    "",
    "{{hashtagsRo}} {{autotags}}"
  ].join("\n");

  const DEFAULTS = {
    telegram: { token: "", chatId: "", sendPhotos: true, maxPhotos: 10, silent: false },
    facebook: { pageId: "", token: "" },
    instagram: { igUserId: "", token: "" },
    api: {
      mode: "site", // site | direct | off
      siteEndpoint: "https://apexauto.md/api/lot",
      auctionsApiKey: ""
    },
    calc: {
      // расчёт берём у сайта: один источник формул для сайта, менеджеров и расширения
      source: "site", // site | local
      endpoint: "https://apexauto.md/api/calc",
      ratesMode: "auto", // auto — курс БНМ с сайта; manual — значения ниже
      usdMdl: 17.45,
      eurMdl: 20.28,
      insurance: true,
      exportDocs: false,
      offsite: false,
      marginUsd: 0,
      defaultPort: "nj"
    },
    post: {
      site: "https://apexauto.md",
      contact: "@fedukusa",
      whatsapp: "068-832-032",
      address: "Chisinau, Bucovinei 9F",
      hashtags: "#apexauto #apexautoimport #автоизсша #авто #молдова #кишинёв #автоподзаказ",
      hashtagsRo: "#apexauto #apexautoimport #autodinsua #masini #moldova #chisinau #autolacomanda",
      // Поднимите число, если меняете шаблоны по умолчанию — тогда они обновятся у всех
      templatesVersion: 10,
      templates: {
        telegram: TELEGRAM_TEMPLATE,
        facebook: FACEBOOK_TEMPLATE,
        instagram: INSTAGRAM_TEMPLATE,
        telegramRo: TELEGRAM_TEMPLATE_RO,
        facebookRo: FACEBOOK_TEMPLATE_RO,
        instagramRo: INSTAGRAM_TEMPLATE_RO
      }
    }
  };

  function deepMerge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(patch || {}).forEach((key) => {
      const value = patch[key];
      if (value && typeof value === "object" && !Array.isArray(value) && base && typeof base[key] === "object") {
        out[key] = deepMerge(base[key], value);
      } else if (value !== undefined) {
        out[key] = value;
      }
    });
    return out;
  }

  function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get("settings", (data) => {
        const saved = (data && data.settings) || {};
        const settings = deepMerge(DEFAULTS, saved);
        // Версию берём из сохранённых данных, а не из слитых: у старых настроек поля нет вовсе,
        // и после слияния оно подтягивалось из DEFAULTS — миграция молча не срабатывала.
        const savedVersion = saved.post && saved.post.templatesVersion;
        if (savedVersion !== DEFAULTS.post.templatesVersion) {
          settings.post.templates = Object.assign({}, DEFAULTS.post.templates);
          settings.post.templatesVersion = DEFAULTS.post.templatesVersion;
          chrome.storage.local.set({ settings });
        }
        resolve(settings);
      });
    });
  }

  function save(patch) {
    return load().then(
      (current) =>
        new Promise((resolve) => {
          const next = deepMerge(current, patch);
          chrome.storage.local.set({ settings: next }, () => resolve(next));
        })
    );
  }

  function reset() {
    return new Promise((resolve) => chrome.storage.local.set({ settings: DEFAULTS }, () => resolve(DEFAULTS)));
  }

  /** Вернуть только шаблоны постов к стандартным, не трогая токены и курсы. */
  function resetTemplates() {
    return save({
      post: {
        templates: Object.assign({}, DEFAULTS.post.templates),
        templatesVersion: DEFAULTS.post.templatesVersion
      }
    });
  }

  ApexX.settings = { DEFAULTS, load, save, reset, resetTemplates, deepMerge };
})(typeof window !== "undefined" ? window : self);
