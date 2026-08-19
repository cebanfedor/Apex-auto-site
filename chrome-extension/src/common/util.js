/* util.js — общие помощники. Загружается первым и в content-скрипте, и в UI-страницах.
   Namespace: window.ApexX */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});

  const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/;

  function text(value) {
    if (value == null) return "";
    if (typeof value === "object") {
      return String(value.name || value.title || value.value || value.description || "").trim();
    }
    return String(value).trim();
  }

  /** «1,234 mi», «$12 300», « 45.5 » → число. Пустое/мусор → 0 */
  function num(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? "").replace(/[ \s,]/g, "");
    const m = raw.match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
  }

  function money(value, currency) {
    const n = Number(value || 0);
    if (!n) return "";
    const sign = currency === "MDL" ? " MDL" : "";
    const prefix = currency === "MDL" ? "" : "$";
    return prefix + Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ") + sign;
  }

  /** «rogersville, missouri» → «Rogersville, Missouri»; «nj» → «NJ» */
  function titleCase(value) {
    if (!value) return "";
    return String(value).replace(/[A-Za-z0-9]+/g, (w) => {
      if (w === w.toUpperCase()) return w;
      if (/^[a-z]{2}$/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, " ")
      .trim();
  }

  function uniq(list) {
    return Array.from(new Set((list || []).filter(Boolean)));
  }

  function clean(value) {
    return String(value ?? "")
      .replace(/ /g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVin(value) {
    const v = clean(value).toUpperCase();
    return VIN_RE.test(v) ? (v.match(VIN_RE) || [])[0] : "";
  }

  function dateText(value) {
    if (!value) return "";
    let d = value;
    const asString = String(value);

    // «08/25/2026 10:00 AM PDT» — время торгов оставляем в зоне аукциона, не сдвигая в местную
    const us = asString.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}:\d{2})\s*(AM|PM)?)?\s*([A-Z]{2,4})?/i);
    if (us) {
      const date = `${us[2].padStart(2, "0")}.${us[1].padStart(2, "0")}.${us[3]}`;
      const time = us[4] ? " " + us[4] + (us[5] ? " " + us[5].toUpperCase() : "") : "";
      const zone = us[6] ? " " + us[6].toUpperCase() : "";
      return date + time + zone;
    }

    // «Thu Aug 20, 8pm» — IAAI пишет дату торгов без года
    const short = asString.match(
      /\b([A-Z][a-z]{2})\s+(\d{1,2})\b(?:\s*,)?\s*(?:(\d{1,2})(?::(\d{2}))?\s*(am|pm))?/i
    );
    if (short && !/\d{4}/.test(asString)) {
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const month = months.indexOf(short[1].toLowerCase());
      if (month >= 0) {
        const now = new Date();
        let hours = short[3] ? Number(short[3]) % 12 : 0;
        if (short[5] && short[5].toLowerCase() === "pm") hours += 12;
        let guess = new Date(now.getFullYear(), month, Number(short[2]), hours, Number(short[4] || 0));
        // дата более чем на три месяца в прошлом — значит торги в следующем году
        if (guess.getTime() < now.getTime() - 90 * 864e5) guess = new Date(guess.setFullYear(now.getFullYear() + 1));
        const pad = (n) => String(n).padStart(2, "0");
        const date = `${pad(guess.getDate())}.${pad(guess.getMonth() + 1)}.${guess.getFullYear()}`;
        return short[3] ? `${date} ${pad(guess.getHours())}:${pad(guess.getMinutes())}` : date;
      }
    }

    const hasTime = typeof value === "number" || /\d{1,2}:\d{2}/.test(asString) || /^\d{10,13}$/.test(asString);
    if (typeof value === "number") d = new Date(value < 1e12 ? value * 1000 : value);
    else if (/^\d{10,13}$/.test(asString)) {
      const n = Number(value);
      d = new Date(n < 1e12 ? n * 1000 : n);
    } else d = new Date(value);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return clean(value);
    const options = { day: "2-digit", month: "2-digit", year: "numeric" };
    // Дату без времени не превращаем в «03:00» из-за часового пояса
    if (hasTime) {
      options.hour = "2-digit";
      options.minute = "2-digit";
    }
    return d.toLocaleString("ru-RU", options);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  /** Плоский обход JSON: {a:{b:1}} → [{path:"a.b", key:"b", value:1}] */
  function flatten(input, maxNodes) {
    const out = [];
    const limit = maxNodes || 6000;
    const seen = new Set();
    (function walk(node, path) {
      if (out.length > limit || node == null) return;
      if (typeof node !== "object") {
        out.push({ path, key: path.split(".").pop(), value: node });
        return;
      }
      if (seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        node.slice(0, 60).forEach((item, i) => walk(item, path ? path + "." + i : String(i)));
        return;
      }
      Object.keys(node).forEach((k) => walk(node[k], path ? path + "." + k : k));
    })(input, "");
    return out;
  }

  function safeJson(value) {
    if (!value || typeof value !== "string") return null;
    const s = value.trim();
    if (!s || (s[0] !== "{" && s[0] !== "[")) return null;
    try {
      return JSON.parse(s);
    } catch (e) {
      return null;
    }
  }

  ApexX.util = {
    VIN_RE, text, num, money, titleCase, norm, uniq, clean, isVin, dateText, escapeHtml, flatten, safeJson
  };
})(typeof window !== "undefined" ? window : self);
