/* journal.js — память расширения между сессиями:
   - журнал публикаций: какой лот и когда ушёл в канал (чтобы не постить дважды);
   - черновики: правки текста переживают закрытие панели;
   - напоминания: будильник перед торгами.
   Всё лежит в chrome.storage.local, каждый раздел ограничен по размеру. */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});

  const KEYS = { log: "publishLog", drafts: "drafts", reminders: "reminders" };
  const LOG_LIMIT = 400;
  const DRAFT_LIMIT = 40;

  /* Вне расширения (демо-страница, тесты) chrome.storage нет — держим данные в памяти,
     чтобы UI можно было проверить без установки. */
  const memory = {};
  const hasStorage = () => typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

  function get(key, fallback) {
    if (!hasStorage()) return Promise.resolve(memory[key] === undefined ? fallback : memory[key]);
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (data) => resolve((data && data[key]) || fallback));
    });
  }

  function set(key, value) {
    if (!hasStorage()) {
      memory[key] = value;
      return Promise.resolve(value);
    }
    return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, () => resolve(value)));
  }

  /** Ключ лота: аукцион + номер, для лотов без номера — VIN. */
  function lotKey(lot) {
    if (!lot) return "";
    const auction = String(lot.auction || "").toLowerCase();
    const id = String(lot.lot || lot.vin || "").trim().toUpperCase();
    return id ? `${auction}:${id}` : "";
  }

  /* ---------- журнал публикаций ---------- */

  async function addPublication(lot, entry) {
    const key = lotKey(lot);
    if (!key) return null;
    const log = await get(KEYS.log, []);
    const record = {
      key,
      auction: lot.auction || "",
      lot: lot.lot || "",
      vin: lot.vin || "",
      title: lot.title || "",
      url: lot.url || lot.pageUrl || "",
      network: entry.network || "",
      lang: entry.lang || "ru",
      postId: entry.postId || entry.messageId || "",
      at: new Date().toISOString()
    };
    log.unshift(record);
    await set(KEYS.log, log.slice(0, LOG_LIMIT));
    return record;
  }

  /** Все публикации этого лота, свежие первыми. */
  async function publicationsFor(lot) {
    const key = lotKey(lot);
    if (!key) return [];
    const log = await get(KEYS.log, []);
    return log.filter((item) => item.key === key);
  }

  function recentLog(limit) {
    return get(KEYS.log, []).then((log) => log.slice(0, limit || 50));
  }

  /* ---------- черновики ---------- */

  async function saveDraft(lot, draft) {
    const key = lotKey(lot);
    if (!key) return;
    const drafts = await get(KEYS.drafts, {});
    drafts[key] = Object.assign({ at: new Date().toISOString(), title: lot.title || "" }, draft);

    // храним только свежие: storage.local не резиновый
    const keys = Object.keys(drafts).sort((a, b) => String(drafts[b].at).localeCompare(String(drafts[a].at)));
    const trimmed = {};
    keys.slice(0, DRAFT_LIMIT).forEach((k) => (trimmed[k] = drafts[k]));
    await set(KEYS.drafts, trimmed);
  }

  async function loadDraft(lot) {
    const key = lotKey(lot);
    if (!key) return null;
    const drafts = await get(KEYS.drafts, {});
    return drafts[key] || null;
  }

  async function dropDraft(lot) {
    const key = lotKey(lot);
    if (!key) return;
    const drafts = await get(KEYS.drafts, {});
    delete drafts[key];
    await set(KEYS.drafts, drafts);
  }

  /* ---------- напоминания о торгах ---------- */

  function alarmName(lot) {
    return "apex-sale:" + lotKey(lot);
  }

  async function listReminders() {
    return get(KEYS.reminders, {});
  }

  async function reminderFor(lot) {
    const key = lotKey(lot);
    if (!key) return null;
    const all = await get(KEYS.reminders, {});
    return all[key] || null;
  }

  async function saveReminder(lot, whenMs, minutesBefore) {
    const key = lotKey(lot);
    if (!key) return null;
    const all = await get(KEYS.reminders, {});
    all[key] = {
      key,
      at: whenMs,
      minutesBefore,
      saleAt: whenMs + minutesBefore * 60000,
      title: lot.title || "",
      lot: lot.lot || "",
      auction: lot.auction || "",
      auctionLabel: lot.auctionLabel || "",
      url: lot.url || lot.pageUrl || ""
    };
    await set(KEYS.reminders, all);
    return all[key];
  }

  async function dropReminder(lotOrKey) {
    const key = typeof lotOrKey === "string" ? lotOrKey : lotKey(lotOrKey);
    if (!key) return;
    const all = await get(KEYS.reminders, {});
    delete all[key];
    await set(KEYS.reminders, all);
  }

  ApexX.journal = {
    KEYS, lotKey, alarmName,
    addPublication, publicationsFor, recentLog,
    saveDraft, loadDraft, dropDraft,
    listReminders, reminderFor, saveReminder, dropReminder
  };
})(typeof window !== "undefined" ? window : self);
