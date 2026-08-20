/* extract-core.js — универсальный сбор данных: подписи→значения из DOM, ключи→значения из JSON.
   Работает одинаково для Copart и IAAI: сайты меняют вёрстку, но подписи полей стабильны. */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});
  const U = ApexX.util;
  const D = ApexX.dict;

  const MONEY_KEYS = ["currentBid", "buyNow", "estRetail", "estRepair"];

  /* ---------- подписи ---------- */

  /* Каждой подписи — поле и ранг (позиция в списке алиасов). Ранг решает конфликты:
     «Vehicle Location» перебивает «Location», даже если встретилась ниже по странице. */
  const ALIAS_INDEX = (() => {
    const index = new Map();
    Object.keys(D.LABEL_ALIASES).forEach((field) => {
      D.LABEL_ALIASES[field].forEach((alias, rank) => {
        const key = U.norm(alias);
        if (!index.has(key)) index.set(key, { field, rank });
      });
    });
    return index;
  })();

  function matchLabel(label) {
    const key = U.norm(label);
    if (!key) return null;
    if (ALIAS_INDEX.has(key)) return ALIAS_INDEX.get(key);
    // «Primary Damage Description» → «primary damage»
    for (const [alias, hit] of ALIAS_INDEX) {
      if (alias.length >= 4 && (key.startsWith(alias + " ") || key.endsWith(" " + alias))) {
        return { field: hit.field, rank: hit.rank + 10 };
      }
    }
    return null;
  }

  function fieldForLabel(label) {
    const hit = matchLabel(label);
    return hit ? hit.field : "";
  }

  /* ---------- DOM ---------- */

  /* Значения-заглушки из форм и выпадающих списков: «Select Address Type», «-- Choose --». */
  const PLACEHOLDER_VALUE =
    /^(--|—|-)?\s*(select|choose|please\s+select|pick|enter|type)\b|^(n\/?a|none|null|undefined|—|-{1,3})$/i;

  function harvestDom(root) {
    const scope = root || document;
    const pairs = [];
    const seen = new Set();

    function push(label, value) {
      let l = U.clean(label).replace(/[:：*]\s*$/, "");
      let v = U.clean(value);
      if (!l || !v || l === v) return;
      if (l.length > 48 || v.length > 400) return;
      if (/^\s*$/.test(v)) return;
      if (PLACEHOLDER_VALUE.test(v)) return;
      const key = U.norm(l) + "|" + U.norm(v);
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push({ label: l, value: v });
    }

    scope.querySelectorAll("dl").forEach((dl) => {
      const kids = Array.from(dl.children);
      kids.forEach((node, i) => {
        if (node.tagName === "DT" && kids[i + 1] && kids[i + 1].tagName === "DD") {
          push(node.innerText, kids[i + 1].innerText);
        }
      });
    });

    scope.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.children);
      if (cells.length === 2) push(cells[0].innerText, cells[1].innerText);
    });

    const nodes = scope.querySelectorAll(
      "li, p, span, div, td, dd, h4, h5, label, strong, b, th, [class*='label' i], [class*='title' i], [class*='data' i]"
    );
    let scanned = 0;
    nodes.forEach((el) => {
      if (scanned > 6000) return;
      scanned++;
      if (el.children.length > 4) return;
      // выпадающие списки и меню — источник мусора вроде «Make: Select Make»
      if (el.closest("select, option, nav, header, footer, [role='dialog'], [role='navigation']")) return;
      if (el.querySelector("select, input, textarea")) return;
      const t = U.clean(el.innerText || el.textContent || "");
      if (!t || t.length > 320) return;

      // Подпись, оканчивающаяся цифрой, — это почти всегда разрезанное время («10:00 AM»)
      const inline = t.match(/^([^:\n]{2,48}):\s*([\s\S]{1,300})$/);
      if (inline && !/\d$/.test(inline[1].trim())) push(inline[1], inline[2]);

      if (/[:：]\s*$/.test(t) || (t.length <= 40 && fieldForLabel(t))) {
        const sib = el.nextElementSibling;
        if (sib) push(t, sib.innerText || sib.textContent);
        else if (el.parentElement && el.parentElement.children.length === 2) {
          const other = Array.from(el.parentElement.children).find((c) => c !== el);
          if (other) push(t, other.innerText || other.textContent);
        }
      }
    });

    return pairs;
  }

  function harvestDomImages(root, hostPattern) {
    const scope = root || document;
    const urls = [];
    scope.querySelectorAll("img, source, [data-src], [data-original], [style*='background-image']").forEach((el) => {
      const raw = [
        el.getAttribute && el.getAttribute("src"),
        el.getAttribute && el.getAttribute("data-src"),
        el.getAttribute && el.getAttribute("data-original"),
        el.getAttribute && el.getAttribute("data-lazy"),
        (el.getAttribute && el.getAttribute("srcset") || "").split(",").pop(),
        ((el.getAttribute && el.getAttribute("style")) || "").match(/url\(["']?([^"')]+)/)?.[1]
      ];
      raw.filter(Boolean).forEach((src) => {
        const url = String(src).trim().split(" ")[0];
        if (!/^https?:/i.test(url)) return;
        if (hostPattern && !hostPattern.test(url)) return;
        if (/\.svg(\?|$)|sprite|logo|icon|placeholder|no-?image/i.test(url)) return;
        urls.push(url);
      });
    });
    return U.uniq(urls);
  }

  /* ---------- JSON ---------- */

  /* Ключи JSON (в т.ч. «сжатые» ключи Copart solr) → канонические поля. */
  const JSON_ALIASES = {
    lot: [/^lot$/i, /^lotnumber(str)?$/i, /^ln$/i, /^lotnum$/i, /^stocknumber$/i, /^stock_?no$/i, /^itemnumber$/i, /^external_?id$/i],
    vin: [/^vin$/i, /^fv$/i, /^fullvin$/i, /^vehicleidentificationnumber$/i],
    year: [/^year$/i, /^modelyear$/i, /^vehicleyear$/i, /^lcyr$/i],
    make: [/^make$/i, /^mkn$/i, /^manufacturer$/i, /^makename$/i, /^brand$/i],
    model: [/^model$/i, /^modelname$/i, /^modelgroup$/i, /^lmg$/i],
    trim: [/^trim$/i, /^series$/i, /^modeldetail$/i],
    bodyStyle: [/^body_?style$/i, /^body_?type$/i, /^vehicle_?type$/i],
    odometer: [/^odometer$/i, /^orr$/i, /^mileage$/i, /^miles$/i, /^odometer(reading|value)$/i, /odometer\.mi$/i],
    odometerBrand: [/^ord$/i, /^odometer_?brand$/i, /^odometerstatus$/i],
    primaryDamage: [/^primary_?damage$/i, /^lcd$/i, /^damage$/i, /^main$/i, /^damage_?main$/i, /^damagetypedescription$/i, /damage\.main(\.\w+)?$/i],
    secondaryDamage: [/^secondary_?damage$/i, /^sdd$/i, /^second$/i, /^damage_?second$/i, /damage\.second(\.\w+)?$/i],
    lossType: [/^loss(type)?$/i, /^saletype$/i, /^lossdescription$/i],
    titleDoc: [/^td$/i, /^title_?code$/i, /^titledescription$/i, /^detailed_?title$/i, /^document(type)?$/i, /^saledocument$/i, /^titletype$/i, /lots?\.\d+\.title(\.name)?$/i],
    titleState: [/^title_?state$/i, /^tsta$/i],
    location: [/^location$/i, /^branch$/i, /^selling_?branch$/i, /^yardname$/i, /^yn$/i, /^sale_?location$/i, /location\.name$/i],
    city: [/^city$/i, /^yardcity$/i, /location\.city$/i],
    state: [/^state$/i, /^lstg$/i, /^yardstate$/i, /location\.state$/i],
    zip: [/^zip$/i, /^postal_?code$/i, /^lzip$/i],
    saleDate: [/^sale_?date$/i, /^auction_?date$/i, /^saledatestr$/i, /^auctiondatetime$/i],
    saleStatus: [/^sale_?status$/i, /^status$/i, /^lot_?status$/i, /^auctiontype$/i],
    currentBid: [/^bid$/i, /^current_?bid$/i, /^high_?bid$/i, /^hb$/i, /^prebid$/i, /^currentbidamount$/i, /^final_?bid$/i],
    buyNow: [/^buy_?now$/i, /^buyitnow(price)?$/i, /^bnp$/i, /^bnup$/i],
    estRetail: [/^actual_?cash_?value$/i, /^acv$/i, /^est(imated)?_?retail_?value$/i, /^retail(value)?$/i, /^pre_?accident_?price$/i],
    estRepair: [/^est(imated)?_?repair_?cost$/i, /^repaircost$/i, /^estimate_?repair_?price$/i],
    engine: [/^engine$/i, /^egn$/i, /^enginetype$/i, /^displacement$/i, /^engine_?size$/i, /engine\.name$/i],
    cylinders: [/^cylinders?$/i, /^cy$/i, /^cylindercount$/i],
    fuel: [/^fuel$/i, /^ft$/i, /^fuel_?type$/i, /^ftd$/i, /fuel\.name$/i],
    transmission: [/^transmission$/i, /^tmtp$/i, /^transmissiontype$/i],
    drive: [/^drive$/i, /^drv$/i, /^drivetrain$/i, /^drive_?line_?type$/i, /^driveline$/i, /^drive_?wheel$/i],
    colorExt: [/^color$/i, /^clr$/i, /^exterior_?color$/i, /^extcolor$/i, /^colorext$/i],
    colorInt: [/^interior_?color$/i, /^intcolor$/i, /^colorint$/i],
    keys: [/^keys?$/i, /^hk$/i, /^haskeys$/i, /^keystatus$/i, /^keys_?available$/i],
    startCode: [/^start_?code$/i, /^condition$/i, /^runsanddrives?$/i, /^runanddrive$/i, /^enginestartcode$/i],
    airbags: [/^airbags?$/i, /^airbagstatus$/i],
    highlights: [/^highlights?$/i, /^specialnote$/i, /^lotdescription$/i],
    seller: [/^seller$/i, /^sellername$/i, /^syn$/i, /seller\.name$/i],
    notes: [/^notes?$/i, /^comments?$/i, /^sellercomments$/i],
    /* «Сырой» заголовок лота: 2021 MERCEDES-BENZ E 350 4MATIC */
    titleRaw: [/^title$/i, /^ld$/i, /^lotdescription$/i, /^vehicledescription$/i]
  };

  const SKIP_JSON_VALUE = /^(null|undefined|n\/a|na|none|-|0)$/i;

  function mapJson(payload) {
    const fields = {};
    const extra = {};
    if (!payload || typeof payload !== "object") return { fields, extra };

    const flat = U.flatten(payload);
    flat.forEach(({ path, key, value }) => {
      if (value == null || typeof value === "object") return;
      const str = U.clean(String(value));
      if (!str || SKIP_JSON_VALUE.test(str)) return;
      if (str.length > 400) return;

      // API часто оборачивает значения: {damage:{main:{name:"Rear End"}}} — ключ «name» ни о чём
      // не говорит, смысл несёт родительский сегмент пути.
      const segments = path.split(".");
      const parent = /^(name|title|value|description|code|text|mi|km|usd)$/i.test(key)
        ? segments.filter((s) => !/^\d+$/.test(s)).slice(-2)[0] || key
        : key;

      let matched = "";
      for (const field of Object.keys(JSON_ALIASES)) {
        if (JSON_ALIASES[field].some((re) => re.test(key) || re.test(parent) || re.test(path))) {
          matched = field;
          break;
        }
      }
      const target = matched ? retarget(matched, str) : "";
      if (target) {
        if (!fields[target]) fields[target] = str;
      } else if (Object.keys(extra).length < 200 && !/^https?:\/\/\S+\.(jpe?g|png|webp)/i.test(str)) {
        extra[path] = str;
      }
    });

    // VIN по формату — если ключ не совпал.
    if (!fields.vin) {
      const hit = flat.find((f) => typeof f.value === "string" && U.isVin(f.value));
      if (hit) fields.vin = U.isVin(hit.value);
    }
    return { fields, extra };
  }

  function jsonImages(payload, hostPattern) {
    const out = [];
    U.flatten(payload, 12000).forEach(({ value }) => {
      if (typeof value !== "string") return;
      if (!/^https?:\/\//i.test(value)) return;
      if (!/\.(jpe?g|png|webp)(\?|$)|resizer|imagekeys|image/i.test(value)) return;
      if (hostPattern && !hostPattern.test(value)) return;
      if (/logo|sprite|icon|placeholder/i.test(value)) return;
      // в ответе API рядом с фото лота лежит логотип продавца
      if (/\/sellers?[./]|seller_logo/i.test(value)) return;
      out.push(value);
    });
    return U.uniq(out);
  }

  /* ---------- сборка ---------- */

  /* Аукционы пишут в поле локации служебные статусы вместо адреса. */
  const LOCATION_JUNK = /^(at the branch|buyer location|online|tbd|see (branch|seller)|n\/?a)$/i;
  const LOOKS_LIKE_PLACE = /,\s*[A-Za-z]{2}\b|\b\d{5}\b|\(\s*[A-Za-z]{2}\s*\)/;

  /* Значение не похоже на нормальное для этого поля → пусть уступит любому другому кандидату. */
  function valuePenalty(field, value) {
    // «true/false» из JSON — крайний вариант: живое значение со страницы точнее
    if (/^(true|false|0|1)$/i.test(U.clean(value)) && /^(keys|startCode|airbags)$/.test(field)) return 30;
    if (field !== "location") return 0;
    if (LOCATION_JUNK.test(U.clean(value))) return 100;
    return LOOKS_LIKE_PLACE.test(value) ? 0 : 20;
  }

  /* «Run and Drive» — это состояние машины, а не повреждение: на страницах аукционов
     эти значения регулярно попадают под соседнюю подпись. */
  const CONDITION_VALUE =
    /^\s*(run\s*(and|&)?\s*drives?|runs?\s*[/&]\s*drives?|starts?|stationary|engine start program|does not start|non[- ]?runner)\s*$/i;
  /* А это вообще не состояние — служебные пометки Copart. */
  const NOT_CONDITION = /^\s*(mechanical inspection|inspection|wholesale( vehicle)?|red light|green light|as[- ]is)\s*$/i;

  /* В поле состояния должно стоять состояние, а не VIN и не служебная пометка. */
  const CONDITION_WORDS = /\b(run|runs|drive|drives|start|starts|started|stationary|enhanced|inop|non[- ]?runner|does not)\b/i;
  const LOOKS_LIKE_VIN = /\bvin\b|^[A-HJ-NPR-Z0-9*]{11,}$/i;

  /** Куда на самом деле относится значение. Пустая строка — выбросить в «прочие поля». */
  function retarget(field, value) {
    const text = U.clean(value);
    // Copart пишет состояние в «Highlights», IAAI — в «Start Code»; значение решает, а не подпись
    if (
      (field === "primaryDamage" || field === "secondaryDamage" || field === "lossType" ||
        field === "highlights" || field === "notes" || field === "saleStatus") &&
      CONDITION_VALUE.test(text)
    ) {
      return "startCode";
    }
    if (field === "startCode") {
      if (NOT_CONDITION.test(text)) return "";
      if (LOOKS_LIKE_VIN.test(text)) return "";
      if (!CONDITION_WORDS.test(text)) return "";
    }
    return field;
  }

  function mapPairs(pairs) {
    const fields = {};
    const ranks = {};
    const extra = {};
    (pairs || []).forEach(({ label, value }) => {
      const matched = matchLabel(label);
      const target = matched ? retarget(matched.field, value) : "";
      const hit0 = matched && target ? { field: target, rank: matched.rank } : null;
      const penalty = hit0 ? valuePenalty(hit0.field, value) : 0;
      // мусорное значение вообще не занимает поле — уходит в «все поля»
      const hit = hit0 && penalty < 100 ? { field: hit0.field, rank: hit0.rank + penalty } : null;
      if (hit) {
        const better = !(hit.field in fields) || hit.rank < ranks[hit.field];
        if (better) {
          fields[hit.field] = value;
          ranks[hit.field] = hit.rank;
        }
      } else if (Object.keys(extra).length < 120) {
        if (!extra[label]) extra[label] = value;
      }
    });
    return { fields, extra };
  }

  /* ---------- фотографии ---------- */

  /* Один и тот же кадр приходит несколькими ссылками: миниатюра, «полный», HD, разные
     контейнеры CDN. Сигнатура — имя кадра без размерных суффиксов, по ней и склеиваем. */
  function imageSignature(url) {
    try {
      const u = new URL(url);
      const keys = u.searchParams.get("imageKeys") || u.searchParams.get("imageKey");
      if (keys) return "key:" + keys.toLowerCase();
      const name = (u.pathname.split("/").pop() || u.pathname).toLowerCase();
      const bare = name
        .replace(/\.(jpe?g|png|webp)$/i, "")
        .replace(/[-_](thb|thumb|tmb|ful|full|hrs|hd|lrg|large|sml|small|med|xl)\b/g, "")
        .replace(/[-_]\d{2,4}x\d{2,4}\b/g, "");
      return bare || u.pathname.toLowerCase();
    } catch (e) {
      return String(url);
    }
  }

  /* Из дублей оставляем самый крупный вариант. */
  function imageQuality(url) {
    const s = String(url).toLowerCase();
    if (/_hrs|hi-?res|highres|_hd\b/.test(s)) return 4;
    if (/_ful|_full|_lrg|_large/.test(s)) return 3;
    const width = Number((s.match(/[?&](?:width|w)=(\d+)/) || [])[1] || 0);
    if (width) return 1 + Math.min(width / 4000, 0.99);
    if (/_thb|_thumb|_tmb|_sml|_small/.test(s)) return 0;
    return 1;
  }

  /* Аукционы отдают один и тот же кадр в разных размерах, и в наборе легко оказываются
     миниатюры 180px — в Telegram такие фото уходят мыльными. Поднимаем ссылку до крупной. */
  function upscaleImage(url) {
    let out = String(url || "");
    if (!out) return out;

    // IAAI: vis.iaai.com/resizer?imageKeys=...&width=180&height=135
    if (/resizer/i.test(out) && /[?&]imageKeys=/i.test(out)) {
      out = out.replace(/([?&])width=\d+/i, "$1width=1600").replace(/([?&])height=\d+/i, "$1height=1200");
      if (!/[?&]width=/i.test(out)) out += (out.includes("?") ? "&" : "?") + "width=1600&height=1200";
      return out;
    }
    // Copart: 12345678_1_thb.jpg → 12345678_1_ful.jpg
    out = out.replace(/_(thb|tmb|thumb|sml|small|lrs)\.(jpe?g|png|webp)/i, "_ful.$2");
    // общий случай: маленькие размеры в параметрах ссылки
    if (/[?&](w|width)=\d{2,3}(&|$)/i.test(out)) {
      out = out.replace(/([?&])(w|width)=\d+/gi, "$1$2=1600").replace(/([?&])(h|height)=\d+/gi, "$1$2=1200");
    }
    return out;
  }

  function dedupeImages(urls) {
    const best = new Map();
    (urls || []).filter(Boolean).forEach((url) => {
      const signature = imageSignature(url);
      const quality = imageQuality(url);
      const current = best.get(signature);
      if (!current) best.set(signature, { url, quality, order: best.size });
      else if (quality > current.quality) best.set(signature, { url, quality, order: current.order });
    });
    return Array.from(best.values())
      .sort((a, b) => a.order - b.order)
      .map((item) => item.url);
  }

  /* Марки из двух слов — иначе «LAND ROVER RANGE ROVER» разберётся как марка «Land». */
  const TWO_WORD_MAKES = [
    "land rover", "alfa romeo", "aston martin", "rolls royce", "great wall",
    "harley davidson", "mercedes benz", "general motors"
  ];

  /* Аббревиатуры комплектаций, которые нельзя писать как «Phev» или «Amg». */
  const KEEP_UPPER = /^(phev|hev|bev|awd|rwd|fwd|amg|gti|gtr|srt|trd|xle|xse|ltz|denali|tdi|tfsi|quattro|4matic|xdrive|sline)$/i;

  /* «LAND ROVER» → «Land Rover», но BMW/GMC/RAM и индексы вроде ES300H не трогаем. */
  function properCase(value) {
    return String(value || "")
      .split(/\s+/)
      .map((word) => {
        if (word.length <= 3 || /\d/.test(word)) return word.toUpperCase();
        if (KEEP_UPPER.test(word)) return /^(quattro|4matic|xdrive|sline|denali)$/i.test(word)
          ? U.titleCase(word.toLowerCase())
          : word.toUpperCase();
        return U.titleCase(word.toLowerCase());
      })
      .join(" ")
      .trim();
  }

  /** Готовый источник из произвольного JSON (ответ API, состояние страницы). */
  function sourceFromJson(name, payload, hostPattern) {
    if (!payload || typeof payload !== "object") return null;
    const mapped = mapJson(payload);
    return { name, fields: mapped.fields, extra: mapped.extra, images: jsonImages(payload, hostPattern) };
  }

  /** Слияние источников по приоритету: первый непустой выигрывает. */
  function merge(sources) {
    const lot = { extra: {}, images: [], sources: [] };
    const vinCandidates = [];
    (sources || []).filter(Boolean).forEach((src) => {
      if (src.name) lot.sources.push(src.name);
      Object.keys(src.fields || {}).forEach((k) => {
        const v = U.clean(src.fields[k]);
        if (!v) return;
        // VIN собираем со всех источников: аукционы маскируют его звёздочками,
        // полные 17 знаков обычно приходят только из API
        if (k === "vin") {
          vinCandidates.push(v);
          return;
        }
        if (!lot[k]) lot[k] = v;
      });
      Object.keys(src.extra || {}).forEach((k) => {
        if (!lot.extra[k]) lot.extra[k] = src.extra[k];
      });
      // Наборы фото не склеиваем: разные источники отдают одни и те же кадры под разными
      // ссылками, и после склейки галерея двоится. Берём самый полный набор целиком.
      if (Array.isArray(src.images) && src.images.length) {
        const candidate = dedupeImages(src.images);
        if (candidate.length > lot.images.length) lot.images = candidate;
      }
    });

    MONEY_KEYS.forEach((k) => {
      if (lot[k] != null) {
        const n = U.num(lot[k]);
        lot[k] = n || "";
      }
    });
    if (lot.odometer) {
      const n = U.num(lot.odometer);
      const km = /km\b/i.test(String(lot.odometer));
      lot.odometerValue = n;
      lot.odometer = n ? n.toLocaleString("en-US") + (km ? " km" : " mi") : U.clean(lot.odometer);
    }
    if (lot.year) lot.year = String(U.num(lot.year) || "").replace(/^0$/, "");
    // «46269176 Lane/Item: -/-» — на странице номер лота часто слипается с соседним блоком
    if (lot.lot) {
      const digits = String(lot.lot).match(/\d{6,12}/);
      lot.lot = digits ? digits[0] : U.clean(lot.lot);
    }
    // «Exterior/Interior: Black / Gray» — одна подпись на два поля
    if (lot.colorExt && !lot.colorInt && /\s\/\s/.test(lot.colorExt)) {
      const parts = lot.colorExt.split(/\s\/\s/);
      lot.colorExt = U.clean(parts[0]);
      lot.colorInt = U.clean(parts[1]);
    }
    const imagesBefore = lot.images.length;
    lot.images = dedupeImages(lot.images).map(upscaleImage);
    lot.imagesDuplicates = imagesBefore - lot.images.length;

    // Выбираем лучший VIN: полные 17 знаков важнее того, что первым попалось на странице.
    // «WA13ABGE5MB****** (OK)» — статус отбрасываем, маска остаётся только как запасной вариант.
    if (vinCandidates.length) {
      const cleaned = U.uniq(
        vinCandidates.map((v) => U.clean(v).replace(/\s*\([^)]*\)\s*$/, "").toUpperCase())
      );
      lot.vin = cleaned.map((v) => U.isVin(v)).find(Boolean) || cleaned[0];
      lot.vinMasked = /\*/.test(lot.vin || "");
    }
    // «Thu Aug 20, 8pm (EEDT / EEST)» — скобка с зонами браузера только мешает
    if (lot.saleDate) lot.saleDate = U.dateText(String(lot.saleDate).replace(/\s*\([^)]*\/[^)]*\)\s*$/, ""));

    // «Fuel Type: Other» у BMW X5 PHEV — тип топлива берём из названия модели
    if (!lot.fuel || /^(other|unknown|not applicable|n\/?a)$/i.test(U.clean(lot.fuel))) {
      const name = [lot.titleRaw, lot.model, lot.trim, lot.engine].filter(Boolean).join(" ");
      if (/\bphev\b|plug[- ]?in/i.test(name)) lot.fuel = "Plug-In Hybrid";
      else if (/\bhybrid\b|\bhev\b/i.test(name)) lot.fuel = "Hybrid";
      else if (/\belectric\b|\bev\b|\bbev\b/i.test(name)) lot.fuel = "Electric";
      else if (/\bdiesel\b|\btdi\b|duramax|powerstroke|cummins/i.test(name)) lot.fuel = "Diesel";
    }

    // то же для локации из JSON-источников, где ранжирования нет
    if (lot.location && LOCATION_JUNK.test(U.clean(lot.location))) delete lot.location;

    // JSON-поля вида runAndDrive: false превращаются в «Запуск: False» — такое не показываем
    ["startCode", "airbags", "highlights", "saleStatus"].forEach((k) => {
      if (/^(true|false)$/i.test(String(lot[k] || ""))) delete lot[k];
    });
    if (/^(true|false)$/i.test(String(lot.keys || ""))) {
      lot.keys = String(lot.keys).toLowerCase() === "true" ? "Yes" : "No";
    }
    ["make", "model", "trim", "location", "city", "seller", "colorExt", "colorInt", "bodyStyle"].forEach((k) => {
      if (lot[k]) lot[k] = U.titleCase(lot[k]);
    });

    // Заголовок лота — самый надёжный источник имени машины. Если «марка» из полей страницы
    // в заголовке не встречается, это мусор из формы («Select Address Type») — выбрасываем.
    if (lot.titleRaw && lot.make) {
      const haystack = U.norm(lot.titleRaw);
      const words = U.norm(lot.make).split(" ").filter(Boolean);
      const found = words.length && words.every((w) => haystack.includes(w));
      if (!found) {
        delete lot.make;
        if (lot.model && !haystack.includes(U.norm(lot.model))) delete lot.model;
      }
    }

    // «2021 MERCEDES-BENZ E 350» → год/марка/модель, если их не дал ни один источник
    if (lot.titleRaw) {
      const m = String(lot.titleRaw).match(/^\s*(19|20)(\d{2})\s+(.+)$/);
      if (m) {
        if (!lot.year) lot.year = m[1] + m[2];
        const rest = m[3].split(/\s+/);
        const twoWord = TWO_WORD_MAKES.find(
          (make) => make === `${(rest[0] || "").toLowerCase()} ${(rest[1] || "").toLowerCase()}`
        );
        const makeWords = twoWord ? 2 : 1;
        if (!lot.make) lot.make = properCase(rest.slice(0, makeWords).join(" "));
        if (!lot.model) lot.model = properCase(rest.slice(makeWords).join(" "));
      }
    }
    ["make", "model", "trim"].forEach((k) => {
      if (lot[k]) lot[k] = properCase(lot[k]);
    });

    // Название пишем целиком, как на аукционе («2022 BMW X5 PHEV XDRIVE45E»),
    // а из полей собираем, только если заголовок лота не достался.
    const rawTitle = U.clean(lot.titleRaw || "").replace(/^\s*(lot|stock)\s*#?\s*\d+\s*[-–—:]\s*/i, "");
    lot.title = /^(19|20)\d{2}\s/.test(rawTitle)
      ? properCase(rawTitle)
      : [lot.year, lot.make, lot.model, lot.trim].filter(Boolean).join(" ") || rawTitle;
    return lot;
  }

  ApexX.core = {
    harvestDom, harvestDomImages, mapPairs, mapJson, jsonImages, sourceFromJson, merge, fieldForLabel,
    dedupeImages, imageSignature, upscaleImage, MONEY_KEYS
  };
})(typeof window !== "undefined" ? window : self);
