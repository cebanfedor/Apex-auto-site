# Apex Auto — project notes (handoff)

Multi-page static site (vanilla HTML/CSS/JS) + Vercel serverless API + Supabase + admin CRM.
Brand: **Apex Auto** — доставка авто из США/Канады в Молдову под ключ. Founder: Федор Чебан.
Public pages in Russian; multilang RU/RO/EN via `i18n.js`.

## Run locally
```
node local-server.js            # serves static + /api on http://localhost:8081 (PORT overridable)
```
No build step. Files are served as-is. (For /api + admin you need env vars — see ADMIN_README.md.)

## Structure
- `index.html` — home: hero, calculator, economy band, "Как мы работаем", "Почему мы", lead form, free-VIN check, hot lots, reviews, FAQ.
- `auctions.html` (+`auctions.css`, `auctions.js`) — Copart/IAAI catalog via auctionsapi.com; lot detail; lead modal.
- `hot.html`, `about.html`, `contacts.html` — inner pages.
- `styles.css` — **the whole design system** (see below).
- `script.js` — calculator logic (the core). `locations.js` — auction locations/ports data.
- `i18n.js` — translations + RU/RO/EN switcher (injected into `.mainNavV82`).
- `site-content.js` — pulls admin-editable content from `/api/content` and injects it.
- `api/`, `server/`, `supabase/`, `admin/` — backend (serverless functions, Supabase, admin CRM). **Do not break.**

## CSS conventions (IMPORTANT)
- `styles.css` was fully rewritten from scratch (v300): ~530 clean lines replacing the old 9.7k-line legacy.
- It reuses the legacy **class names / ids** (e.g. `heroV45`, `lotImportV118`, `glassSelectV152`, `apexHdrV201`, `apexProcessV205`, `apexFaqV205`) because JS depends on them — **keep these hooks when editing markup**.
- `auctions.css` is a separate stylesheet for the auctions page only.
- **Cache busting:** HTML links CSS as `styles.css?v=vNNN`. After editing CSS, bump the `?v=` query in all HTML (`index/auctions/hot/about/contacts/admin`) so browsers fetch the new file. Same for `auctions.css?v=`.
- Design tokens at top of `styles.css` (`--red:#ed0012`, neutral light bg, white cards, dark graphite accent cards, Manrope font).

## JS hooks not to break
- Calculator ids: `auction, location, vehicleType, fuel, lotPrice, auctionFeeView, engineLiters, year, portView, landView, insurance, exportDocs, offsite, usdMdl, eurMdl, total, subTotal, breakdown, copyBtn, tgBtn, parseLotBtn`. Duplicate display fields (`auctionFeeView`, `portView`, `landView`) are intentionally hidden via CSS `:has()`.
- `.mainNavV82` must exist (i18n injects lang switcher). `.headerBrand img`, `.heroMainV45 h1/p`, `.telegramHotChecksV88` are admin-content hooks (`site-content.js`).
- Mobile burger: CSS checkbox toggle `#navToggleV210` + `.burgerV210` (no JS).

## Deploy (Vercel)
Vercel-ready (`vercel.json`, `api/` functions, `package.json`). Set env vars in Vercel
(see ADMIN_README.md): `AUCTIONS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY`, `ADMIN_PASSWORD`, `BLOB_READ_WRITE_TOKEN`, etc.

## Done
Modern dark-accent/light design, clean header + burger, calculator polished, 3D globe removed,
"Как работаем" timeline, "Почему мы", reviews, FAQ (single block), SEO (meta/OG/sitemap/robots/schema),
hot-car photos (`assets/hot/`), lightweight SVG-ish logo, full CSS rewrite (v300).

## API (auctionsapi.com) — важно
- Подписка активна **только на LEGACY** API: хост `https://auctionsapi.com/api`,
  авторизация заголовком `x-api-key`, эндпоинты `/cars`(+фильтры), `/manufacturers`,
  `/models/{id}`, `/generations/{id}`, `/search-lot`, `/search-vin`, `/statistics`,
  `/archived-lots`, `/usa/*`. Наш ключ на платном тарифе: `/cars` отдаёт до **1000**
  записей/страницу (не 50 — то был демо-лимит).
- НОВЫЙ API (`api.auctionsapi.com`: `/search`, отчёты истории авто, инспекции,
  опции) нам НЕдоступен — ключ отвечает `"you don't have any data in your
  subscription"`. Для миграции нужен апгрейд подписки у провайдера.
- Финальные цены проданных = поле `final_bid`/`bid` фида один-в-один; расхождение
  с DreamBid/BidCars — разница источников (timed-закрытие), не наш баг.

## Perf-заметки (что сделано)
- about/contacts/hot больше НЕ грузят `locations.js`+`script.js` (там нет калькулятора).
- index: калькуляторные скрипты с `defer`. Каталог: словари фильтров грузятся лениво,
  `updateTabCounts`/`updateCardForecasts` отложены на `requestIdleCallback`.
- Hero/hot-фото в WebP (+ `.jpg`-фолбэк через `onerror`); аватар автора — `founder-avatar.webp`.
- `vercel.json`: immutable-кэш для `.js/.css` (все ссылки версионированы `?v=`), 30д для картинок.

## Рыночная оценка (comps) — как считается
- `action=comps` (`api/auctions.js`): оценка по РЕАЛЬНЫМ проданным лотам из
  `auctionsapi /cars?status=6` (live, не зависит от нашей флаки-базы). `fetchSoldComps`
  тянет ВСЕ страницы архива (пагинация до пустой), а не первые 300 — выборка десятки
  лотов, не «медиана по 4». **Поколение = кузов**: по году лота через `/generations`
  вычисляем ДИАПАЗОН ЛЕТ поколения (год есть у всех лотов, generation_id — только ~1/3)
  и сравниваем строго внутри него. Верх поколения НЕ открываем до текущего года; год за
  верхом самого свежего известного поколения → синтетический «новый кузов» [верх+1…тек]
  (Accord XI 2023+ ещё не в справочнике). Так Accord 2024 не мешается с 2021.
  ⚠️ **Только завершённые торги**: `/cars?status=6` помечает `sold` И живые/будущие
  лоты, где `final_bid`=текущая пред-ставка (не молоток) — из-за этого раньше
  вылезали «машины на ходу за $1500» и лоты с будущим `sale_date`. `fetchSoldComps`
  берёт лот, только если `sale_date` ≥12ч в прошлом.
  **Утиль исключён** (`isJunkLot`): титулы Non-Repairable / Cert of Destruction /
  Junk / Parts Only / Bill of Sale и повреждения Burn / Flood / Water / Biohazard —
  не возят, копеечные финалки занижали цену. **Структурно-тяжёлые исключены**
  (`isHeavyLot`): All Over / Rollover / Undercarriage / Frame / Strip — не «нормальная
  восстановимая» машина. Обычный Salvage/Rebuildable/Clear остаётся.
  **Поколения — свои `GEN_OVERRIDES` по model_id** (справочник API врёт: Fusion без
  2-го кузова, NX/Panamera/Camry с устаревшими границами). Зашиты верные годовые
  границы (Panamera 2024+, NX 2023+, Camry 2025+, Accord 2023+, BMW G60 2024+,
  Fusion 2013-2020). `resolveGenRange`: overrides → API → синтетика. Расширять по
  надобности (ключ = model_id).
  **Перцентиль ведущей цены — ПО СОСТОЯНИЮ лота** (`cq`): хороший экземпляр
  (заводится + лёгкое одиночное повреждение) = p90 своего года, средний = p68,
  убитый (не на ходу / тяжёлое) = p45. Клиент считает `cq` (good/mid/poor) по
  conditionInfo+повреждению и шлёт в comps. Так один и тот же Fusion 2017: good
  ≈ $4.2k, poor ≈ $1.6k. Перцентили ВЗВЕШЕННЫЕ и С ИНТЕРПОЛЯЦИЕЙ (при малой
  выборке ступенька прыгала $3k→$5.8k, интерполяция даёт плавно). Диапазон вокруг
  центра. Подпись «Средняя цена рынка». В ответе есть `trueMedian`.
  **Строго тот же год**: 2017→2017; окно года ширим только если своих <8. Число
  продаж НЕ показываем (малые выборки смущали). Блоки «Похожие текущие/архивные
  аукционы» фильтруют по ГОДУ+ТОПЛИВУ — реальные кликабельные лоты того же года.
  **Оценка по ПОХОЖЕСТИ, а не одна медиана на поколение** (`computeComps`): внутри
  кузова цена сильно зависит от года и пробега (свежий малопробежный ≈ вдвое дороже
  убитого). Берём проданные того же поколения (без утиля/тяжёлых) и ВЗВЕШИВАЕМ каждый
  по близости к оцениваемому лоту: `w = 1/(1+(Δлет/2)²+(Δмиль/40000)²)`. Медиана и
  p25–p75 — взвешенные; близкие по году+пробегу определяют цену, далёкие почти не
  влияют. Состояние заводится/нет **НЕ фильтр** (не на ходу ≠ плохая машина).
  Гейт поколения **АБСОЛЮТНЫЙ**: если своего поколения <4 продаж (новый 2026 Panamera)
  → null → клиент берёт агрегат `/statistics` (~$52k), а не разброс по чужим кузовам.
  Ведущее число — **диапазон p25–p75** (как DreamBid).
  ⚡ Сырой пул продаж кэшируется по make+model на 30 мин (`soldPoolCache`), страница
  `/cars` = 100 (200 весит ~1.5МБ и упиралась в 12с-abort fetchJson → мигал ok:false).
  `loadStats` в `auctions.js` вызывает comps на КАЖДОЙ странице лота; фолбэк на
  агрегат `/statistics`, если comps пусты. Фолбэк: сужаем по `engine.id` лота,
  средняя взвешена по числу продаж, диапазон = взвеш. p15–p85 СРЕДНИХ по годам/
  площадкам (НЕ абсолютные min/max — там одиночные не-продажи $1900 и пики).
  ⚠️ **Ограничение источника**: `/cars?status=6` — тонкий живой срез (для Lexus NX
  всего ~22 лота, гибридов 0), поэтому comps часто голодает → падает на агрегат.
  А `/statistics` НЕ содержит топлива: гибрид 350H и бензиновый 250 сидят в одном
  `engine.id=10` («2.5l 4») → среднюю гибрида ($≈30k) от бензина ($≈18k) не отделить.
  **Точная по-триму/топливу оценка возможна только из нашей базы `api_lots`** (там
  `fuel_id`, полная история) — как у DreamBid/BidCars. Пока БД висит (см. TODO) —
  оценка свежих/премиальных комплектаций занижена. Карточки каталога (dbForecastV1)
  на старом агрегате (год+двигатель).
- `action=dbstatus` — read-only диагностика БД (фаза синка, sbUp, счётчики).

## Pending / TODO
- ⚠️ **Supabase БД зависает на запросах** (09.09.2026): keyless-401 быстрый, но любой
  аутентифицированный запрос к api_lots/api_sync_state виснет >3.5с → `lotsDbReady=false`,
  каталог и все DB-фичи на live-фолбэке (медленнее), часовой синк не идёт. Проверить
  `?action=dbstatus`. Лечится рестартом проекта в дашборде Supabase (как 01.09).
- Hot-lot car photos are closest-model stock, not exact 2018/2023 trims — swap if exact needed.
- i18n-дыры в динамике: AI-советчик ставки в `script.js` (renderBidAdvisor/renderSmartLotAdvice)
  и часть `title=`-подсказок не обёрнуты в `i18nT`/`L()` — на RO/EN остаются русскими.
- a11y: подписи полей калькулятора (`index.html`) без `for=`; лид-форма/AI-поля только с `placeholder`.
- Словарь `/usa/damages` при первом открытии фильтра тянется ~4с live — можно забить статикой.
