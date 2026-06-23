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

## Pending / TODO
- `assets/founder.jpg` — founder photo for About page (slot ready, hidden until file added).
- Reviews on home (`.apexReviewsV212`) are PLACEHOLDERS — replace with real testimonials.
- Hot-lot car photos are closest-model stock, not exact 2018/2023 trims — swap if exact needed.
- Footer stat "Сотни авто" — adjust to a verified number if desired.
