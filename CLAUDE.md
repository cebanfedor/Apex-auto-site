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
- `in-transit.html` (+`transit.js`) — «Продажа авто в пути» (бывш. `hot.html`/«Горячие», `/hot` → 301). `about.html`, `contacts.html` — inner pages.
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
  **Поколения — свои `GEN_OVERRIDES` по model_id** (справочник API врёт: годы
  мировые и перекрываются — F3x 2011–2020 / G2x 2018–2022, Fusion без 2-го кузова,
  RAV4 XA50 до 2022 вместо 2025). Аудит 14.09.2026: из 375 моделей с ≥150 лотов у 213
  перекрытия/обрыв. Зашиты US-модельные годы для **275 моделей** (все модели каталога с ≥150 лотов, у которых справочник перекрывался или обрывался) (`resolveGenRange`:
  overrides → API → синтетика). ⚠️ **Справочник обрывается на 2022**: у самого
  свежего поколения `to=2022` — граница ДАННЫХ, не конец кузова → `generationsFor`
  открывает верх (`to=null`) у поколения с максимальным `from`; иначе любой 2023+
  авто получал ложный «новый кузов». Расширять по надобности (ключ = model_id).
  **Крошки/фильтр поколения — ПО ГОДУ, не по `generation_id` фида** (`attachGenRange`):
  фид относил 2018 BMW 330e к «VII (G2x)». Берём запись справочника с ближайшим
  `from` к нашему `genFrom` (±3 года, при равенстве — раньше), имя показываем
  кодом кузова как у DreamBid + US-годы («F3x · 2012–2018», «G05 · 2019–»). Нет
  записи в ±3 (U11 X1 2023, D41 Frontier 2022, RAV4 2026) → крошку поколения НЕ
  показываем — честнее, чем чужой код. Подбор «по вхождению года» — только когда
  нашего диапазона нет вовсе.
  **Диапазон поколения — универсально на ВСЕ модели**: `attachGenRange` кладёт в лот
  (detail/vin) `genFrom`/`genTo` через `resolveGenRange`. Клиент (`fetchSimilarLots`)
  фильтрует «Похожие текущие/архивные» СТРОГО по этому диапазону (тот же кузов), не
  по generation_id (в фиде пуст у свежих) и не по всем поколениям. Карточки «похожих»
  как у DreamBid: фото+цена+дата(MM/YY)+спек+состояние; цена показывается везде.
  **Топливо в «похожих» — ПРИОРИТЕТ, не жёсткий фильтр** (`fetchSimilarLots`):
  берём весь кузов (диапазон лет поколения, любое топливо), совпадающее топливо
  ставим вперёд, добираем остальными до 12. Иначе, когда своего топлива в фиде
  мало (1 активный Santa Fe Hybrid), висела одна одинокая карточка вместо десятка
  того же кузова.
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
  оценка свежих/премиальных комплектаций занижена. Карточки каталога — тоже через comps
  (`forecastForLot`, 2017+), агрегат только фолбэком.
- `action=dbstatus` — read-only диагностика БД (фаза синка, sbUp, счётчики).
- Таймед-проданные: финалку НЕ показываем (фид таймед-закрытия расходится с реальной
  ценой живого молотка → путало клиентов). Прежний `action=vinfinal` (добор финалки по
  VIN через `/search-vin`) удалён вместе с UI-кнопкой «уточнить» 11.09.2026 —
  продукт решил «просто не указывать цену» на таймед/IAAI-проданных.

## Pending / TODO
- ⚠️ **Supabase БД зависает на запросах** (09.09.2026): keyless-401 быстрый, но любой
  аутентифицированный запрос к api_lots/api_sync_state виснет >3.5с → `lotsDbReady=false`,
  каталог и все DB-фичи на live-фолбэке (медленнее), часовой синк не идёт. Проверить
  `?action=dbstatus`. Лечится рестартом проекта в дашборде Supabase (как 01.09).
- Hot-lot car photos are closest-model stock, not exact 2018/2023 trims — swap if exact needed.
- i18n: AI-советчик и aria-подписи проверены 21.09.2026 — все ключи aiT/атрибутов есть в словарях.
- a11y: подписи полей калькулятора (`index.html`) без `for=`; лид-форма/AI-поля только с `placeholder`.

## Трекинг (`api/w8-tracking.js`, `tracking.html`)
- Провайдеры по порядку: **Dealer API** (env `DEALER_API_KEY`+`DEALER_API_BASE`; база не задана → спит) →
  **AvtoShipping** (публичный `avtoshipping.com.ua/api/Data/Get/{VIN}` + `GetAttachmentsByCarId/{VIN}`,
  без ключа, ТОЛЬКО точный 17-значный VIN; эндпоинт без VIN в пути не вызывать никогда) → **W8**.
- Этапы AvtoShipping `A_*` (статусы 0..6, даты из `statusHistory`); фото title-документов (типы 5, 9) не отдаём.
- ⚠️ Инлайн-скрипт `tracking.html` под CSP-хешем в `vercel.json` — после правки пересчитать sha256.
- `?diag=1` — только булевы флаги конфигурации Dealer API.

## Поколения — таблица `server/gen-table.js` (18.09.2026, как у DreamBid)
- **431 модель**: `[from, to(0=выпускается), код кузова]`. Источник — публичный справочник моделей DreamBid
  (коды кузова, полная история, новые кузова 2025–2026), НО границы лет там, где у нас были выверенные
  US-годы (`GEN_OVERRIDES`), оставлены наши: у DreamBid F30 «с 2013» (в США MY2012), «W214 с 2021»,
  рестайлинги местами отдельным поколением. Одинаковые коды подряд склеены, перекрытия разрезаны.
- Приоритет: **таблица → GEN_OVERRIDES (модели вне таблицы) → справочник API → синтетика**.
- Для моделей из таблицы id поколения **синтетический = from*10000+to** (`20192025`, `20250000`),
  `parseSynGen`. Фильтр каталога по нему — ПО ГОДУ (БД `year.gte/lte`, live `from_year/to_year`);
  в comps/statistics такой id провайдеру не передаём. `action=generations` отдаёт таблицу (свежие первыми).
- Год в «дыре» между поколениями → ближайшее поколение (раньше падало в самое старое).
- Смена таблицы → бамп `|g2` (`GEN_CACHE_SALT`) — кэш detail/vin/generations живёт до 6ч.

## Продажа авто в пути (`/in-transit`, 20.09.2026)
- Объявления = записи админки «Автомобили» (таблица `vehicles`) со статусом **«Продаётся в пути»**
  (проданные — «Продан в пути», показываются серыми в конце). Поля: год/марка/модель, цена, описание,
  фото (первое — обложка), пробег, двигатель, топливо, повреждения, VIN. Миграций нет — статус текстовый.
- API: `/api/hot-lots?type=transit` (только публичные поля; edge-кэш 5 мин → новое объявление видно не сразу).
- **Страница объявления серверная**: `/in-transit/<id>` → `api/transit-page.js` (OG-превью с фото/ценой для мессенджеров, JSON-LD Car+Offer, список вшит в `#ssrTransitV1`; нет такого id → 404+noindex). Старый `?id=N` тоже работает.
- Клиент `transit.js`: список + карточка (pushState, ссылкой делятся), галерея со свайпом,
  «Где сейчас авто» из `/api/w8-tracking?vin=`, WhatsApp/Telegram/звонок, лид через `action=lead`
  (source «Авто в пути»). Под объявлениями остался блок гибридов/электро с аукционов (`hot.js`, часть 2).
- Шапка: пункт длинный → на 821–1290px шапка ужимается (см. конец `styles.css`), бургер по-прежнему с 820px.
- Блок на главной `#homeTransitV1` (`home-transit.js`) — виден только при активных объявлениях.
- Фото: `api/uploads.js` → Vercel Blob, а без `BLOB_READ_WRITE_TOKEN` — **Supabase Storage**, публичный бакет `site-uploads`
  (создаётся сам). Админка перед загрузкой ужимает фото до 1920px JPEG (лимит тела функции ~4.5 МБ); в форме превью
  фото: ★ обложка, ←/→ порядок, × убрать. WhatsApp-кнопка объявления — `api.whatsapp.com/send`, НЕ `wa.me`
  (`site-content.js` переписывает все wa.me-ссылки на общий контакт).

## SEO / индексация (21.09.2026)
- `/auctions/<slug>` несуществующего лота → **404 + noindex** (`api/lot-page.js`; раньше 200 с общей страницей = soft 404).
  404 ставим только когда свой API ответил 404 (лота нет), не на таймаут/502.
- SSR-данные лота — `<script type="application/json" id="ssrLotV1">` (инлайн `window.__ssrLot=` резал CSP, SSR молча не работал).
- Редиректы: `www.apexauto.md` → apex, `/index.html` → `/`, `/<page>.html` → `/<page>` (новую страницу добавить в список в `vercel.json`).
- В sitemap нет noindex-страниц (`cases` — черновик, `privacy`). Снимешь noindex с cases → верни в sitemap.
- Объявление: доп. поля `price_includes`, `repair_estimate`, `eta_date` (миграция 20260921). Пока колонок нет —
  API читает без них, админка сохраняет без них и предупреждает.
- Каталог, вкладка «Все» (21.09.2026): датированные будущие торги + живые лоты БЕЗ даты (status≠6), NULLS LAST.
  Проверка по live: ~70% недатированных в базе — реальные upcoming; ~30% проданы, синк их не донёс в архив.

## Синк базы лотов — sweep и кэш (21.09.2026)
- **Sweep** (`handleSyncLots`, `state.sweep`): раз в 7 дней ночью (UTC 0–4; самый первый — сразу) полный обход `/cars`
  по доменам (upsert обновляет `synced_at`) → стадия `purge`: DELETE неархивных лотов с `synced_at` старше старта обхода
  (−1ч запаса). Причина: инкремент видит только сутки изменений, а закрытий — десятки тысяч в день → в базе было
  ~560k «живых» против ~152k в фиде. Страховки: ≥80k лотов и оба домена до конца, 5 сбоев purge → отмена. Ход — в
  `?action=dbstatus` (`sync.v.sweep`). Закрытые лоты (`/archived-lots`) теперь до 6 страниц за прогон (была 1).
- **CDN**: `vercel.json` ПЕРЕБИВАЕТ заголовки Cache-Control, выставленные функцией, для `/api/auctions`. Каталожные actions
  (search/showcase/comps/statistics/словари) — `s-maxage=900, swr=43200`; detail/vin и прочее — `swr=300`.
  Прогрев в `.github/workflows/sync-lots.yml` бьёт РОВНО по адресам сайта (витрина per_page=30, счётчики вкладок, showcase, transit).
- Общий каталог без марки/модели/поиска: основная выборка только датированные (range-scan), недатированный «хвост» —
  вторым запросом на глубоких страницах; счётчик недатированных кэшируется 6ч в памяти (`undatedCountCache`).
- Карточка лота на телефоне: строка `.dbMobMetaV1` (дата · ставка · прогноз) + повреждение видны без «Развернуть».
