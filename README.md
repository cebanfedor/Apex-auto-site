# Apex Auto — apexauto.md

Сайт компании **Apex Auto / Feduk USA** — импорт авто с аукционов США, Канады и Европы
(Copart, IAAI, Manheim) в Молдову и Румынию под ключ. Основатель — Федор Чебан.

Стек: **ванильный статический сайт** (плоские `*.html` + CSS/JS, без сборки и фреймворков)
+ **serverless-функции Vercel** (`api/*.js`) + **Supabase** (`server/*.js`) + админ-CRM (`admin/`).
Публичный контент на русском; мультиязык RU/RO/EN через `i18n.js`.

## Структура
- `index.html` — главная: hero, калькулятор стоимости, «как работаем», лид-форма, бесплатная проверка VIN, FAQ.
- `auctions.html` (+ `auctions.css`, `auctions.js`) — каталог Copart/IAAI, карточка лота, лид-модалка.
- `hot.html` (+ `hot.js`), `about.html`, `contacts.html` (+ `contacts-form.js`), `tracking.html` — внутренние страницы.
- `styles.css` — дизайн-система. `script.js` + `calc-core.js` + `locations.js` — калькулятор.
- `i18n.js` — переводы RU/RO/EN. `site-content.js` — админ-редактируемый контент из `/api/content`.
- `api/` — serverless-функции. `server/` — общий код (Supabase, auth, http). `supabase/` — SQL-миграции.

## Локальный запуск
```bash
npm install
cp .env.example .env.local   # заполнить значениями (см. ниже)
node local-server.js         # http://localhost:8081 (порт через PORT=)
```
Сборки нет — файлы отдаются как есть. Статические страницы работают без env;
для `/api` и админки нужны переменные окружения (Supabase + ключи).

> Примечание: «красивые» URL (`/auctions`, `/contacts` без `.html`) работают через
> `rewrites` в `vercel.json`. Локальный `local-server.js` обслуживает и `/api`, и статику.

## Переменные окружения
Полный список — в [`.env.example`](.env.example). Минимум для `/api`:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUCTIONS_API_KEY`, `ADMIN_PASSWORD`.
Опционально: `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (уведомления о заявках),
`BLOB_READ_WRITE_TOKEN` (загрузка фото), `OPENAI_API_KEY` (AI-советчик ставки).
Подробнее про админку — в [`ADMIN_README.md`](ADMIN_README.md).

## Кэш-бастинг
HTML ссылается на ассеты как `styles.css?v=vNNN`, `auctions.js?v=auctions-vNNN` и т.п.
**После правки CSS/JS обязательно поднимайте `?v=` во всех использующих HTML** — иначе браузеры
и immutable-кэш Vercel отдадут старый файл.

## Деплой (Vercel)
Проект Vercel-ready (`vercel.json`, `api/`, `package.json`). Пуш в `main` → авто-деплой.
Переменные окружения задаются в Vercel → Settings → Environment Variables (см. `.env.example`).
Cron `sync-lots` (в `vercel.json`) синхронизирует базу лотов в Supabase.

## Известные ограничения / техдолг
См. [`AUDIT.md`](AUDIT.md) (не публикуется — исключён в `.vercelignore`) и раздел «Pending/TODO» в `CLAUDE.md`.
Ключевое: подписка auctionsapi — только LEGACY-хост; формулы тарифов в `calc-core.js`/`script.js`
требуют калибровки под таможню (менять только по согласованию с владельцем).
