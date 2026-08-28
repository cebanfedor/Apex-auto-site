/* iaai.js — сбор лота на iaai.com.
   Источники: скрытый JSON страницы (#ProductDetailsVM), эндпоинт фотографий, DOM. */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});
  const U = ApexX.util;
  const C = ApexX.core;

  const IMG_HOST = /(vis\.iaai\.com|iaai\.com\/.*(image|photo|resizer))/i;

  function stockFromUrl(href) {
    const url = String(href || location.href);
    const m =
      url.match(/VehicleDetail\/([0-9]{6,12})/i) ||
      url.match(/itemid=([0-9]{6,12})/i) ||
      url.match(/stockNumber=([0-9]{6,12})/i);
    return m ? String(m[1]).replace(/~.*/, "") : "";
  }

  async function fetchJson(url) {
    try {
      const res = await fetch(url, { credentials: "include", headers: { accept: "application/json, */*" } });
      if (!res.ok) return null;
      const text = await res.text();
      return U.safeJson(text);
    } catch (e) {
      return null;
    }
  }

  /* IAAI кладёт всю карточку в hidden input / data-атрибут. */
  function inlinePayload() {
    const chunks = [];
    const holders = document.querySelectorAll(
      "#ProductDetailsVM, [id*='ProductDetails' i], [data-vehicle], [data-product], script[type='application/json'], script[type='application/ld+json']"
    );
    holders.forEach((el) => {
      const raw =
        el.value ||
        el.getAttribute("data-vehicle") ||
        el.getAttribute("data-product") ||
        el.textContent ||
        "";
      const parsed = U.safeJson(raw);
      if (parsed) chunks.push(parsed);
    });
    ["ProductDetailsVM", "VehicleDetailsViewModel", "__INITIAL_STATE__"].forEach((key) => {
      const value = global[key];
      if (value && typeof value === "object") chunks.push(value);
    });
    if (!chunks.length) return null;
    return chunks.length === 1 ? chunks[0] : { chunks };
  }

  async function fetchImages(stock) {
    if (!stock) return [];
    const payload = await fetchJson(
      `${location.origin}/Images/GetJsonImageDimensions?json=${encodeURIComponent(JSON.stringify({ stockNumber: stock }))}`
    );
    if (!payload) return [];
    const direct = C.jsonImages(payload, IMG_HOST);
    if (direct.length) return direct;
    // Ответ содержит только ключи изображений — собираем ссылки resizer вручную
    const keys = [];
    U.flatten(payload, 8000).forEach(({ key, value }) => {
      if (/^k$/i.test(key) && typeof value === "string" && value.length > 8) keys.push(value);
    });
    return U.uniq(keys).map(
      (k) => `https://vis.iaai.com/resizer?imageKeys=${encodeURIComponent(k)}&width=1280&height=960`
    );
  }

  /* IAAI рисует ключ и запуск как «Key 🔑 Present» — без двоеточия и вперемешку с иконками,
     обычный разбор «подпись: значение» такое не ловит. Ищем прямо по тексту страницы. */
  function fromPageText(fields) {
    const text = U.clean(document.body ? document.body.innerText : "");
    if (!text) return;
    if (!fields.keys) {
      const keys = text.match(/\bkeys?\b[^A-Za-z0-9]{0,6}(present|missing|available|yes|no|none)\b/i);
      if (keys) fields.keys = keys[1];
    }
    if (!fields.startCode) {
      const start = text.match(/\bstart\s*code\b[^A-Za-z0-9]{0,6}([^\n|]{3,40})/i);
      if (start) fields.startCode = U.clean(start[1]);
    }
  }

  function fromDom() {
    const mapped = C.mapPairs(C.harvestDom(document));
    const fields = mapped.fields;
    fromPageText(fields);
    if (!fields.titleRaw) {
      const h1 = document.querySelector("h1, .heading-2, [class*='vehicle-title' i]");
      if (h1) fields.titleRaw = U.clean(h1.textContent);
    }
    if (!fields.currentBid) {
      const bid = Array.from(document.querySelectorAll("span, div, strong")).find((el) =>
        /current bid|pre-?bid|high bid/i.test(el.textContent || "")
      );
      if (bid) {
        const money = (bid.parentElement || bid).textContent.match(/\$[\d,]+/);
        if (money) fields.currentBid = money[0];
      }
    }
    return { name: "iaai-dom", fields, extra: mapped.extra, images: C.harvestDomImages(document, IMG_HOST) };
  }

  async function extract(pageVars) {
    const stock = stockFromUrl();
    const payload = inlinePayload();
    const page = pageVars ? C.sourceFromJson("iaai-page", pageVars, IMG_HOST) : null;
    const inline = payload
      ? (() => {
          const mapped = C.mapJson(payload);
          return {
            name: "iaai-inline",
            fields: mapped.fields,
            extra: mapped.extra,
            images: C.jsonImages(payload, IMG_HOST)
          };
        })()
      : null;

    const images = await fetchImages(stock);
    const lot = C.merge([fromDom(), inline, page, { name: "iaai-images", fields: {}, extra: {}, images }]);
    // Фото строго ЭТОГО лота: в imageKey vis.iaai.com зашит сток-номер —
    // чужие фото из каруселей «похожие машины» на странице отбрасываем.
    if (stock) {
      const own = (lot.images || []).filter((u) => String(u).includes(stock));
      if (own.length) lot.images = own;
      // API-набор по стоку — самый полный и точный, при наличии он главный
      const ownApi = images.filter((u) => String(u).includes(stock));
      if (ownApi.length >= 3) lot.images = ownApi;
    }
    lot.auction = "iaai";
    lot.auctionLabel = "IAAI";
    lot.lot = lot.lot || stock;
    lot.url = stock ? `https://www.iaai.com/VehicleDetail/${stock}~US` : location.href;
    return lot;
  }

  ApexX.iaai = { extract, stockFromUrl, isLotPage: () => !!stockFromUrl() };
})(typeof window !== "undefined" ? window : self);
