/* publish.js — публикация готового поста: Telegram, Facebook Page, Instagram Business.
   Выполняется в service worker (нужны кросс-доменные запросы). */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});

  const TG = "https://api.telegram.org";
  const FB = "https://graph.facebook.com/v21.0";
  const CAPTION_LIMIT = 1024;

  /* «*строка*» в шаблоне → жирная строка в Telegram. Остальной текст экранируем,
     чтобы случайный «<» в данных лота не уронил отправку. */
  function toTelegramHtml(text) {
    const raw = String(text || "");
    const hasOwnHtml = /<\/?(b|i|u|s|code|pre|a)\b[^>]*>/i.test(raw);
    const body = hasOwnHtml
      ? raw
      : raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return body.replace(/\*([^*\n]{1,300})\*/g, "<b>$1</b>");
  }

  function parseMode(text) {
    return /<\/?(b|i|u|s|code|pre|a)\b[^>]*>/i.test(text) ? "HTML" : undefined;
  }

  function fail(message) {
    return { ok: false, error: String(message || "Неизвестная ошибка") };
  }

  async function tgCall(token, method, body, asForm) {
    const url = `${TG}/bot${token}/${method}`;
    const options = asForm
      ? { method: "POST", body }
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetch(url, options);
    const payload = await res.json().catch(() => null);
    if (!payload || !payload.ok) throw new Error((payload && payload.description) || `Telegram HTTP ${res.status}`);
    return payload.result;
  }

  /* Telegram сам скачивает фото по ссылке; если не смог — пробуем исходные ссылки,
     а в крайнем случае грузим первое фото байтами. */
  async function telegram(config, text, images, originals) {
    const token = (config.token || "").trim();
    const chatId = (config.chatId || "").trim();
    if (!token || !chatId) return fail("Не заданы токен бота и чат/канал в настройках расширения");

    text = toTelegramHtml(text);
    const photos = (images || []).slice(0, Math.max(1, Math.min(10, Number(config.maxPhotos) || 10)));
    const usePhotos = config.sendPhotos !== false && photos.length > 0;
    const silent = !!config.silent;
    const longText = text.length > CAPTION_LIMIT;

    try {
      if (!usePhotos) {
        const result = await tgCall(token, "sendMessage", {
          chat_id: chatId,
          text,
          parse_mode: parseMode(text),
          disable_notification: silent,
          link_preview_options: { is_disabled: true }
        });
        return { ok: true, messageId: result.message_id };
      }

      const caption = longText ? "" : text;
      let result;
      if (photos.length === 1) {
        result = await tgCall(token, "sendPhoto", {
          chat_id: chatId,
          photo: photos[0],
          caption,
          parse_mode: parseMode(caption),
          disable_notification: silent
        });
      } else {
        const media = photos.map((url, i) => ({
          type: "photo",
          media: url,
          caption: i === 0 ? caption : undefined,
          parse_mode: i === 0 && caption ? parseMode(caption) : undefined
        }));
        result = await tgCall(token, "sendMediaGroup", {
          chat_id: chatId,
          media,
          disable_notification: silent
        });
        result = Array.isArray(result) ? result[0] : result;
      }

      if (longText) {
        await tgCall(token, "sendMessage", {
          chat_id: chatId,
          text,
          parse_mode: parseMode(text),
          disable_notification: silent,
          link_preview_options: { is_disabled: true }
        });
      }
      return { ok: true, messageId: result && result.message_id };
    } catch (error) {
      const message = String((error && error.message) || error);
      const linkProblem = /HTTP URL|file identifier|WEBPAGE_|IMAGE_PROCESS/i.test(message);

      // Крупная версия кадра может не существовать — повторяем с теми ссылками, что дал аукцион
      const fallback = (originals || []).filter((url, i) => url && url !== images[i]);
      if (linkProblem && fallback.length) {
        try {
          return await telegram(config, text, fallback.slice(0, photos.length));
        } catch (e) {
          /* не вышло — идём дальше, к загрузке файлом */
        }
      }
      if (linkProblem && photos.length) {
        try {
          const blob = await (await fetch(photos[0])).blob();
          const form = new FormData();
          form.append("chat_id", chatId);
          form.append("caption", text.slice(0, CAPTION_LIMIT));
          if (parseMode(text)) form.append("parse_mode", "HTML");
          form.append("photo", blob, "lot.jpg");
          const result = await tgCall(token, "sendPhoto", form, true);
          return { ok: true, messageId: result.message_id, note: "Фото загружено файлом (ссылка была недоступна)" };
        } catch (retryError) {
          return fail(`${message} · повтор файлом: ${(retryError && retryError.message) || retryError}`);
        }
      }
      return fail(message);
    }
  }

  async function fbCall(path, params, method) {
    const body = new URLSearchParams(params);
    const res = await fetch(`${FB}/${path}`, {
      method: method || "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.error) {
      throw new Error((payload && payload.error && payload.error.message) || `Facebook HTTP ${res.status}`);
    }
    return payload;
  }

  async function facebook(config, text, images, link) {
    const pageId = (config.pageId || "").trim();
    const token = (config.token || "").trim();
    if (!pageId || !token) return fail("Не заданы ID страницы Facebook и токен доступа");

    const photos = (images || []).slice(0, 10);
    try {
      if (!photos.length) {
        const result = await fbCall(`${pageId}/feed`, { message: text, link: link || "", access_token: token });
        return { ok: true, postId: result.id };
      }
      if (photos.length === 1) {
        const result = await fbCall(`${pageId}/photos`, { url: photos[0], caption: text, access_token: token });
        return { ok: true, postId: result.post_id || result.id };
      }
      const uploaded = [];
      for (const url of photos) {
        const item = await fbCall(`${pageId}/photos`, { url, published: "false", access_token: token });
        uploaded.push({ media_fbid: item.id });
      }
      const result = await fbCall(`${pageId}/feed`, {
        message: text,
        attached_media: JSON.stringify(uploaded),
        access_token: token
      });
      return { ok: true, postId: result.id };
    } catch (error) {
      return fail((error && error.message) || error);
    }
  }

  async function instagram(config, text, images) {
    const userId = (config.igUserId || "").trim();
    const token = (config.token || "").trim();
    if (!userId || !token) return fail("Не заданы ID Instagram-аккаунта и токен доступа");
    const photos = (images || []).slice(0, 10);
    if (!photos.length) return fail("Instagram публикует только с фото — выберите хотя бы одно");

    try {
      let creationId;
      if (photos.length === 1) {
        const container = await fbCall(`${userId}/media`, {
          image_url: photos[0],
          caption: text,
          access_token: token
        });
        creationId = container.id;
      } else {
        const children = [];
        for (const url of photos) {
          const child = await fbCall(`${userId}/media`, {
            image_url: url,
            is_carousel_item: "true",
            access_token: token
          });
          children.push(child.id);
        }
        const carousel = await fbCall(`${userId}/media`, {
          media_type: "CAROUSEL",
          children: children.join(","),
          caption: text,
          access_token: token
        });
        creationId = carousel.id;
      }
      const published = await fbCall(`${userId}/media_publish`, { creation_id: creationId, access_token: token });
      return { ok: true, postId: published.id };
    } catch (error) {
      return fail((error && error.message) || error);
    }
  }

  ApexX.publish = { telegram, facebook, instagram };
})(typeof window !== "undefined" ? window : self);
