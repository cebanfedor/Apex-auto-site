/* templates.js — подстановка данных лота в шаблон поста.
   Строка шаблона, в которой хотя бы одна подстановка пустая, выбрасывается целиком:
   так пост не пестрит «Пробег: —». */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});
  const U = ApexX.util;
  const D = ApexX.dict;

  /** «41,000 mi» → «41 000 миль (66 000 км)» — клиенту в Молдове важны километры */
  function odometerText(lot, lang) {
    const raw = String(lot.odometer || "");
    if (!raw) return "";
    const value = Number(lot.odometerValue || U.num(raw));
    if (!value) return raw;
    const isKm = /km/i.test(raw);
    const miles = isKm ? Math.round(value / 1.609) : value;
    const km = isKm ? value : Math.round((value * 1.609) / 100) * 100;
    const fmt = (n) => n.toLocaleString("ru-RU").replace(/ /g, " ");
    return lang === "ro" ? `${fmt(miles)} mile (${fmt(km)} km)` : `${fmt(miles)} миль (${fmt(km)} км)`;
  }

  /* ---------- дата торгов ---------- */

  const MONTHS = {
    ru: ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"],
    ro: ["ianuarie","februarie","martie","aprilie","mai","iunie","iulie","august","septembrie","octombrie","noiembrie","decembrie"]
  };
  const TODAY = { ru: "Сегодня", ro: "Astăzi" };
  const TOMORROW = { ru: "Завтра", ro: "Mâine" };

  /**
   * «26.08.2026 16:30 EEST» → {text: «26 августа, 16:30», when: today|tomorrow|later}.
   * Для сегодняшних и завтрашних торгов дата начинается со слова — так виднее срочность.
   */
  function saleDateParts(value, lang) {
    const raw = U.clean(value);
    if (!raw) return null;
    const parts = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/);
    if (!parts) return { text: raw, when: "later" };

    const code = lang === "ro" ? "ro" : "ru";
    const day = Number(parts[1]);
    const month = Number(parts[2]) - 1;
    const year = Number(parts[3]);
    const time = parts[4] ? `, ${parts[4]}:${parts[5]}` : "";
    const label = `${day} ${MONTHS[code][month] || ""}${time}`.trim();

    const today = new Date();
    const sale = new Date(year, month, day);
    const days = Math.round((sale - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5);
    if (days === 0) return { text: `${TODAY[code]}, ${label}`, when: "today" };
    if (days === 1) return { text: `${TOMORROW[code]}, ${label}`, when: "tomorrow" };
    return { text: label, when: "later" };
  }

  function saleDateText(value, lang) {
    const parts = saleDateParts(value, lang);
    return parts ? parts.text : "";
  }

  function damageText(lot, lang) {
    const parts = [D.translate("primaryDamage", lot.primaryDamage, lang), D.translate("secondaryDamage", lot.secondaryDamage, lang)];
    return U.uniq(parts.filter(Boolean)).join(" + ");
  }

  /** Двигатель без дубля с топливом: у электрички «ELECTRIC • Электро» — это одно и то же */
  function engineText(lot) {
    const engine = U.clean(lot.engine || "");
    if (!engine) return "";
    const fuel = U.clean(lot.fuel || "");
    if (fuel && U.norm(engine) === U.norm(fuel)) return "";
    if (/^(electric|gas|gasoline|diesel|hybrid)$/i.test(engine)) return "";
    // «2.0L 4» → «2.0L», «5.0L V8 Supercharged» → «5.0L V8»
    const litres = engine.match(/(\d[.,]\d)\s*L/i);
    if (litres) {
      const layout = (engine.match(/\bV\s?(6|8|10|12)\b/i) || [])[0] || "";
      return (litres[1].replace(",", ".") + "L" + (layout ? " " + layout.toUpperCase().replace(/\s/g, "") : "")).trim();
    }
    return engine;
  }

  /* «Другое» вместо типа топлива ничего не сообщает — такие значения в пост не идут */
  const EMPTY_VALUES = /^(другое|altul|не указано|nespecificat|unknown|other|n\/?a)$/i;

  /** «2.0L • Бензин • Полный (AWD) • Автомат» — одной строкой, пустые части отпадают */
  function specsText(lot, lang) {
    return U.uniq(
      [
        engineText(lot),
        D.translate("fuel", lot.fuel, lang),
        D.translate("drive", lot.drive, lang),
        D.translate("transmission", lot.transmission, lang)
      ].filter((part) => part && !EMPTY_VALUES.test(part))
    ).join(" • ");
  }


  /* ---------- хэштеги под конкретную машину ---------- */

  /* «Land Rover» → landrover, «E-Tron Sportback» → etronsportback */
  function tagSlug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24);
  }

  /**
   * Теги под конкретную машину: марка и аукцион.
   * Постоянные теги задаются в настройках, повторы отбрасываются.
   */
  function autoTags(lot, lang, existing) {
    const tags = [];
    const make = tagSlug(lot.make);
    if (make.length > 1) tags.push("#" + make);
    if (lot.auction) tags.push("#" + tagSlug(lot.auction));

    const used = new Set(String(existing || "").toLowerCase().split(/\s+/));
    return U.uniq(tags.filter((tag) => !used.has(tag.toLowerCase()))).join(" ");
  }

  /** Все доступные подстановки: {{ключ}} */
  function vars(lot, estimate, settings, lang) {
    const s = settings || {};
    const post = s.post || {};
    const money = (v) => U.money(v);
    const est = estimate || null;

    const base = {
      title: lot.title || lot.titleRaw || "",
      year: lot.year || "",
      make: lot.make || "",
      model: lot.model || "",
      trim: lot.trim || "",
      bodyStyle: lot.bodyStyle || "",
      auction: lot.auction || "",
      auctionLabel: lot.auctionLabel || (lot.auction === "iaai" ? "IAAI" : "Copart"),
      lot: lot.lot || "",
      vin: lot.vin || "",
      url: lot.url || lot.pageUrl || "",
      location: lot.location || "",
      saleDate: saleDateText(lot.saleDate, lang),
      saleStatus: lot.saleStatus || "",
      odometer: odometerText(lot, lang),
      damage: damageText(lot, lang),
      primaryDamage: D.translate("primaryDamage", lot.primaryDamage, lang),
      secondaryDamage: D.translate("secondaryDamage", lot.secondaryDamage, lang),
      lossType: D.translate("lossType", lot.lossType, lang),
      titleDoc: D.translate("titleDoc", lot.titleDoc, lang),
      titleState: lot.titleState || "",
      engine: engineText(lot),
      specs: specsText(lot, lang),
      cylinders: lot.cylinders || "",
      fuel: D.translate("fuel", lot.fuel, lang),
      transmission: D.translate("transmission", lot.transmission, lang),
      drive: D.translate("drive", lot.drive, lang),
      colorExt: lot.colorExt || "",
      colorInt: lot.colorInt || "",
      keys: D.translate("keys", lot.keys, lang),
      startCode: D.translate("startCode", lot.startCode, lang),
      airbags: D.translate("airbags", lot.airbags, lang),
      highlights: lot.highlights || "",
      seller: lot.seller || "",
      currentBid: money(lot.currentBid),
      buyNow: money(lot.buyNow),
      estRetail: money(lot.estRetail),
      estRepair: money(lot.estRepair),
      contact: post.contact || "",
      whatsapp: post.whatsapp || "",
      address: post.address || "",
      site: post.site || "",
      hashtags: post.hashtags || "",
      hashtagsRo: post.hashtagsRo || post.hashtags || ""
    };

    base.autotags = autoTags(lot, lang, lang === "ro" ? base.hashtagsRo : base.hashtags);

    if (est) {
      base.bid = money(est.input.lotPrice);
      base.totalUsd = money(Math.round(est.totalUsd));
      base.totalEur = "€" + Math.round(est.totalEur).toLocaleString("ru-RU").replace(/ /g, " ");
      base.totalMdl = U.money(Math.round(est.totalMdl), "MDL");
      base.auctionFee = money(Math.round(est.auctionFee));
      base.land = money(Math.round(est.land));
      base.sea = money(Math.round(est.sea));
      base.customs = money(Math.round(est.customsUsd));
      base.port = est.port || "";
      base.route = est.route || "";
    }
    return base;
  }

  function render(template, values) {
    const lines = String(template || "").split("\n");
    const kept = lines.filter((line) => {
      const used = line.match(/\{\{\s*([\w.]+)\s*\}\}/g);
      if (!used) return true;
      return used.every((token) => {
        const key = token.replace(/[{}\s]/g, "");
        return String(values[key] ?? "").trim() !== "";
      });
    });
    return kept
      .map((line) => line.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => String(values[key] ?? "")))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /** Итоговый текст поста для сети network: telegram | facebook | instagram */
  function build(network, lot, estimate, settings, lang) {
    const s = settings || {};
    const templates = (s.post && s.post.templates) || {};
    // для румынского берём отдельный шаблон, при его отсутствии — русский
    const key = lang === "ro" ? network + "Ro" : network;
    const template = templates[key] || templates[network] || "";
    const values = vars(lot, estimate, s, lang);
    const text = render(template, values);
    // *звёздочки* — пометка жирного: в Telegram она станет <b>, в остальных сетях просто снимается
    if (network === "telegram") return text;
    return text.replace(/<\/?(b|i|code|pre|u|s|a)[^>]*>/gi, "").replace(/\*([^*\n]+)\*/g, "$1");
  }

  ApexX.templates = { build, render, vars, damageText, odometerText, specsText, engineText, autoTags, saleDateParts, saleDateText };
})(typeof window !== "undefined" ? window : self);
