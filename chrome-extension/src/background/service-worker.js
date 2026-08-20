/* service-worker.js — фоновый оркестратор:
   собирает данные из вкладки, дотягивает API аукционов, публикует пост. */
importScripts(
  "../common/util.js",
  "../common/dictionary.js",
  "../common/extract-core.js",
  "../common/settings.js",
  "../common/journal.js",
  "../common/api-client.js",
  "../common/image-dedupe.js",
  "../common/publish.js"
);

const ApexX = self.ApexX;

/* Выполняется в MAIN-мире вкладки: забирает состояние страницы, недоступное content-скрипту. */
function grabPageVars() {
  const keys = [
    "ProductDetailsVM",
    "VehicleDetailsViewModel",
    "__INITIAL_STATE__",
    "__PRELOADED_STATE__",
    "__NUXT__",
    "lotDetails",
    "vehicleDetails",
    "dataLayer"
  ];
  const out = {};
  keys.forEach((key) => {
    try {
      const value = window[key];
      if (!value) return;
      const json = JSON.stringify(value);
      if (json && json.length < 800000) out[key] = JSON.parse(json);
    } catch (e) {
      /* циклические ссылки и приватные объекты пропускаем */
    }
  });
  try {
    const hidden = document.querySelector("#ProductDetailsVM");
    if (hidden && hidden.value) out.ProductDetailsVMInput = JSON.parse(hidden.value);
  } catch (e) {}
  return out;
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(response || { ok: false, error: "Нет ответа от страницы" });
    });
  });
}

async function pageVarsFor(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: grabPageVars
    });
    return (results && results[0] && results[0].result) || null;
  } catch (e) {
    return null;
  }
}

async function collect(tabId) {
  const settings = await ApexX.settings.load();
  const pageVars = await pageVarsFor(tabId);
  const response = await sendToTab(tabId, { type: "apex:extract", pageVars });
  if (!response.ok) {
    return {
      ok: false,
      error:
        response.error && /Receiving end|Нет ответа/i.test(response.error)
          ? "Откройте страницу лота на copart.com или iaai.com и обновите её (F5)"
          : response.error
    };
  }

  const lot = response.lot;
  const apiResult = await ApexX.api.enrich(lot, settings);
  if (apiResult.source) {
    // API главнее страницы: без него VIN и часть полей видны только залогиненному
    // пользователю аукциона, а менеджеры работают без входа в Copart/IAAI.
    const merged = ApexX.core.merge([
      apiResult.source,
      { name: "page", fields: lot, extra: lot.extra, images: lot.images }
    ]);

    // Цена и статус торгов меняются в реальном времени — здесь страница точнее API.
    // Заголовок со страницы тоже приятнее: API отдаёт его капсом («X1 XDRIVE28I»).
    ["currentBid", "buyNow", "saleStatus", "saleDate", "title", "titleRaw"].forEach((key) => {
      if (lot[key] !== undefined && lot[key] !== "") merged[key] = lot[key];
    });
    merged.auction = lot.auction;
    merged.auctionLabel = lot.auctionLabel;
    merged.url = lot.url;
    merged.pageUrl = lot.pageUrl;
    merged.apiRaw = apiResult.source.raw || null;
    merged.grabbedAt = lot.grabbedAt;
    // сохраняем детальные источники страницы (copart-dom, copart-api, …), а не общее «page»
    merged.sources = (lot.sources || []).concat(apiResult.source.name || "api");
    await dropVisualDuplicates(merged);
    return { ok: true, lot: merged, apiError: "" };
  }
  await dropVisualDuplicates(lot);
  return { ok: true, lot, apiError: apiResult.error };
}

/* Один и тот же кадр аукцион иногда выкладывает несколькими файлами — сравниваем картинки. */
async function dropVisualDuplicates(lot) {
  try {
    const result = await ApexX.imageDedupe.dedupeByContent(lot.images || []);
    lot.images = result.images;
    lot.imagesDuplicates = Number(lot.imagesDuplicates || 0) + result.removed;
  } catch (e) {
    /* не смогли сравнить — оставляем галерею как есть */
  }
}

async function download(rawUrls, lot) {
  const urls = (rawUrls || []).map(ApexX.core.upscaleImage);
  const folder = `apex-lots/${(lot && lot.auction) || "lot"}-${(lot && lot.lot) || "unknown"}`;
  const ids = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const id = await chrome.downloads.download({
        url: urls[i],
        filename: `${folder}/${String(i + 1).padStart(2, "0")}.jpg`,
        conflictAction: "overwrite"
      });
      ids.push(id);
    } catch (e) {
      /* одна битая ссылка не должна ронять пачку */
    }
  }
  return { ok: true, count: ids.length };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message && message.type;

  if (type === "apex:whoami") {
    sendResponse({ ok: true, tabId: sender.tab && sender.tab.id });
    return false;
  }

  if (type === "apex:collect") {
    collect(message.tabId)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
    return true;
  }

  if (type === "apex:publish") {
    ApexX.settings
      .load()
      .then((settings) => {
        const network = message.network;
        // в соцсети уходят только крупные версии кадров: миниатюра выглядит мыльной
        const images = (message.images || []).map(ApexX.core.upscaleImage);
        if (network === "telegram")
          return ApexX.publish.telegram(settings.telegram, message.text, images, message.images || []);
        if (network === "facebook")
          return ApexX.publish.facebook(settings.facebook, message.text, images, message.link);
        if (network === "instagram") return ApexX.publish.instagram(settings.instagram, message.text, images);
        return { ok: false, error: "Неизвестная сеть: " + network };
      })
      .then(async (result) => {
        // публикация записывается в журнал: панель предупредит, если лот уже уходил в канал
        if (result && result.ok && message.lot) {
          try {
            await ApexX.journal.addPublication(message.lot, {
              network: message.network,
              lang: message.lang,
              postId: result.postId || result.messageId || ""
            });
          } catch (e) {}
        }
        sendResponse(result);
      })
      .catch((error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
    return true;
  }

  if (type === "apex:reminder") {
    setReminder(message.lot, message.whenMs, message.minutesBefore)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
    return true;
  }

  if (type === "apex:reminderCancel") {
    const key = ApexX.journal.lotKey(message.lot);
    chrome.alarms.clear(ApexX.journal.alarmName(message.lot));
    ApexX.journal.dropReminder(key).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (type === "apex:download") {
    download(message.urls || [], message.lot)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
    return true;
  }

  if (type === "apex:openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

/* ---------- напоминания о торгах ---------- */

async function setReminder(lot, whenMs, minutesBefore) {
  const when = Number(whenMs);
  if (!when || when <= Date.now() + 30000) {
    return { ok: false, error: "Время напоминания уже прошло" };
  }
  const saved = await ApexX.journal.saveReminder(lot, when, Number(minutesBefore) || 60);
  chrome.alarms.create(ApexX.journal.alarmName(lot), { when });
  return { ok: true, reminder: saved };
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("apex-sale:")) return;
  const key = alarm.name.replace("apex-sale:", "");
  const all = await ApexX.journal.listReminders();
  const item = all[key];
  if (!item) return;

  const minutes = Math.max(1, Math.round((item.saleAt - Date.now()) / 60000));
  chrome.notifications.create("apex-sale-" + key, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: `Торги через ${minutes} мин`,
    message: `${item.title || "Лот"} · ${item.auctionLabel || item.auction} ${item.lot}`,
    contextMessage: "Apex Auto",
    priority: 2,
    requireInteraction: true
  });
  await ApexX.journal.dropReminder(key);
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith("apex-sale-")) return;
  const key = notificationId.replace("apex-sale-", "");
  const all = await ApexX.journal.listReminders();
  const url = (all[key] && all[key].url) || "";
  if (url) chrome.tabs.create({ url });
  chrome.notifications.clear(notificationId);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
