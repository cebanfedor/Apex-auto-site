/* image-dedupe.js — отсев визуальных дублей.
   Аукционы выкладывают один и тот же кадр несколькими файлами: наклейка с VIN снята
   три раза подряд, соседние кадры 360-обзора почти одинаковы. По ссылкам такие дубли
   не отличить, поэтому сравниваем сами картинки: качаем крошечные превью и считаем
   перцептивный хэш 8×8. Работает в service worker (OffscreenCanvas + createImageBitmap). */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});

  const MAX_IMAGES = 40;        // дальше не проверяем — дороже, чем польза
  const SIDE = 17;             // 16×16 разностный хэш = 256 бит
  const MAX_DIFF_BITS = 0.12;  // до 12% различий — считаем тем же кадром
  const MAX_COLOR_DIFF = 18;   // и цвет должен совпадать: разные ракурсы отличаются оттенком
  const FETCH_TIMEOUT = 4000;

  /** Ссылка на самое маленькое превью — качать полноразмерные кадры ради хэша незачем. */
  function previewUrl(url) {
    const text = String(url || "");
    if (/resizer/i.test(text) && /[?&]imageKeys=/i.test(text)) {
      return text.replace(/([?&])width=\d+/i, "$1width=160").replace(/([?&])height=\d+/i, "$1height=120");
    }
    return text.replace(/_(ful|hrs|full|lrg|large)\.(jpe?g|png|webp)/i, "_thb.$2");
  }

  async function fetchBitmap(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob || !blob.size) return null;
      return await createImageBitmap(blob);
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Отпечаток кадра: разностный хэш (структура) + средний цвет (оттенок). */
  async function fingerprint(url) {
    if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") return null;
    const bitmap = (await fetchBitmap(previewUrl(url))) || (await fetchBitmap(url));
    if (!bitmap) return null;
    try {
      const canvas = new OffscreenCanvas(SIDE, SIDE);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, SIDE, SIDE);
      const { data } = ctx.getImageData(0, 0, SIDE, SIDE);

      const gray = [];
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < data.length; i += 4) {
        gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      const pixels = data.length / 4;

      // dHash: сравниваем соседние пиксели по строке — устойчив к яркости, чувствителен к деталям
      const bits = [];
      for (let y = 0; y < SIDE; y++) {
        for (let x = 0; x < SIDE - 1; x++) {
          bits.push(gray[y * SIDE + x] > gray[y * SIDE + x + 1] ? 1 : 0);
        }
      }
      return { bits, color: [r / pixels, g / pixels, b / pixels] };
    } catch (e) {
      return null;
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  function sameImage(a, b) {
    if (!a || !b || a.bits.length !== b.bits.length) return false;
    const colorDiff = Math.max(
      Math.abs(a.color[0] - b.color[0]),
      Math.abs(a.color[1] - b.color[1]),
      Math.abs(a.color[2] - b.color[2])
    );
    if (colorDiff > MAX_COLOR_DIFF) return false;
    let diff = 0;
    for (let i = 0; i < a.bits.length; i++) if (a.bits[i] !== b.bits[i]) diff++;
    return diff / a.bits.length <= MAX_DIFF_BITS;
  }

  /**
   * Возвращает {images, removed}. Порядок кадров сохраняется, из группы одинаковых
   * остаётся первый. Если картинки не скачались — список возвращается как был.
   */
  async function dedupeByContent(urls) {
    const list = (urls || []).filter(Boolean);
    if (list.length < 2) return { images: list, removed: 0 };

    const head = list.slice(0, MAX_IMAGES);
    const tail = list.slice(MAX_IMAGES);
    const prints = await Promise.all(head.map((url) => fingerprint(url)));

    const kept = [];
    const keptPrints = [];
    head.forEach((url, i) => {
      const print = prints[i];
      if (!print) {
        kept.push(url); // не смогли сравнить — оставляем, лучше лишнее фото, чем потерянное
        return;
      }
      if (keptPrints.some((other) => sameImage(other, print))) return;
      kept.push(url);
      keptPrints.push(print);
    });

    const images = kept.concat(tail);
    return { images, removed: list.length - images.length };
  }

  ApexX.imageDedupe = { dedupeByContent, fingerprint, sameImage, previewUrl };
})(typeof window !== "undefined" ? window : self);
