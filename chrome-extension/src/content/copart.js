/* copart.js — сбор лота на copart.com.
   Три источника, объединяются: внутренний JSON-API Copart → JSON внутри страницы → DOM. */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});
  const U = ApexX.util;
  const C = ApexX.core;

  const IMG_HOST = /(cs\.copart\.com|copart\.com\/.*(image|photo))/i;

  function lotNumberFromUrl(href) {
    const url = String(href || location.href);
    const m =
      url.match(/\/lot\/(\d{6,12})/i) ||
      url.match(/lotNumber=(\d{6,12})/i) ||
      url.match(/\/(\d{8})(?:[/?#]|$)/);
    return m ? m[1] : "";
  }

  async function fetchJson(url) {
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: { accept: "application/json, text/plain, */*" }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  /* Внутренние эндпоинты, которыми пользуется сам сайт Copart. */
  async function fromApi(lotNumber) {
    if (!lotNumber) return null;
    const details =
      (await fetchJson(`${location.origin}/public/data/lotdetails/solr/${lotNumber}`)) ||
      (await fetchJson(`${location.origin}/public/data/lotdetails/${lotNumber}`));
    if (!details) return null;

    const images =
      (await fetchJson(`${location.origin}/public/data/lotdetails/solr/lotImages/${lotNumber}/USA`)) || null;

    const mapped = C.mapJson(details);
    const imgList = U.uniq(
      C.jsonImages(images, IMG_HOST).concat(C.jsonImages(details, IMG_HOST))
    );
    return { name: "copart-api", fields: mapped.fields, extra: mapped.extra, images: imgList };
  }

  /* JSON, вшитый в саму страницу (SSR-состояние Angular/Nuxt, JSON-LD). */
  function fromInlineJson() {
    const chunks = [];
    document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]').forEach((s) => {
      const parsed = U.safeJson(s.textContent);
      if (parsed) chunks.push(parsed);
    });
    ["__INITIAL_STATE__", "__PRELOADED_STATE__", "__NUXT__", "lotDetails", "vehicleDetails"].forEach((key) => {
      const value = global[key];
      if (value && typeof value === "object") chunks.push(value);
    });
    if (!chunks.length) return null;
    const merged = chunks.length === 1 ? chunks[0] : { chunks };
    const mapped = C.mapJson(merged);
    return {
      name: "copart-inline",
      fields: mapped.fields,
      extra: mapped.extra,
      images: C.jsonImages(merged, IMG_HOST)
    };
  }

  function fromDom() {
    const mapped = C.mapPairs(C.harvestDom(document));
    const fields = mapped.fields;

    if (!fields.currentBid) {
      const bidNode = Array.from(document.querySelectorAll("span, div, strong, p")).find((el) =>
        /current bid|high bid|bid now/i.test(el.textContent || "")
      );
      if (bidNode) {
        const money = (bidNode.parentElement || bidNode).textContent.match(/\$[\d,]+/);
        if (money) fields.currentBid = money[0];
      }
    }
    if (!fields.titleRaw) {
      const h1 = document.querySelector("h1, .title-heading, [class*='lot-title' i]");
      if (h1) fields.titleRaw = U.clean(h1.textContent);
    }
    // «Has Keys Yes», «Start Code Run and Drive» — Copart рисует значение
    // после иконки и без двоеточия, обычный разбор «подпись: значение» это пропускает
    const pageText = U.clean(document.body ? document.body.innerText : "");
    if (!fields.keys) {
      const keys = pageText.match(/\b(?:has\s+)?keys?\b[^A-Za-z0-9]{0,6}(yes|no|present|missing|none)\b/i);
      if (keys) fields.keys = keys[1];
    }
    if (!fields.startCode) {
      const start = pageText.match(
        /\b(?:start\s*code|highlights?)\b[^A-Za-z0-9]{0,6}(run\s*(?:and|&)?\s*drives?|runs?\s*[/&]\s*drives?|engine start program|starts?|stationary|enhanced vehicles?)/i
      );
      if (start) fields.startCode = U.clean(start[1]);
    }
    return {
      name: "copart-dom",
      fields,
      extra: mapped.extra,
      images: C.harvestDomImages(document, IMG_HOST)
    };
  }

  async function extract(pageVars) {
    const lotNumber = lotNumberFromUrl();
    const api = await fromApi(lotNumber);
    const page = pageVars ? ApexX.core.sourceFromJson("copart-page", pageVars, IMG_HOST) : null;
    // DOM первым: то, что человек видит на экране, важнее «сжатых» ключей API
    const sources = [fromDom(), api, page, fromInlineJson()];
    const lot = C.merge(sources);
    lot.auction = "copart";
    lot.auctionLabel = "Copart";
    lot.url = lotNumber ? `https://www.copart.com/lot/${lotNumber}` : location.href;
    lot.lot = lot.lot || lotNumber;
    // На Copart крупные фото отдаются как .../ful/... — просим максимальный размер
    lot.images = U.uniq(lot.images.map((src) => src.replace(/_thb\.|_thumb\./i, "_ful.")));
    return lot;
  }

  ApexX.copart = { extract, lotNumberFromUrl, isLotPage: () => !!lotNumberFromUrl() };
})(typeof window !== "undefined" ? window : self);
