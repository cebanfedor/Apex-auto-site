const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, 'assets/og');

const PAGES = [
  {
    slug: 'index',
    title: 'Авто из США и Канады\nпод ключ в Молдову',
    sub: 'Расчёт полной стоимости онлайн: аукционы Copart, IAAI, Manheim',
    icon: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(237,0,18,0.15)"/>
      <path d="M12 48l8-16h40l8 16" stroke="#ed0012" stroke-width="3" stroke-linecap="round"/>
      <rect x="8" y="48" width="64" height="14" rx="7" fill="#ed0012"/>
      <circle cx="22" cy="62" r="7" fill="#1a1d24" stroke="#ed0012" stroke-width="2.5"/>
      <circle cx="58" cy="62" r="7" fill="#1a1d24" stroke="#ed0012" stroke-width="2.5"/>
      <circle cx="22" cy="62" r="2.5" fill="#ed0012"/>
      <circle cx="58" cy="62" r="2.5" fill="#ed0012"/>
      <path d="M26 38h28l4 10H22l4-10z" fill="rgba(255,255,255,0.1)"/>
    </svg>`,
    tag: 'apexauto.md',
  },
  {
    slug: 'auctions',
    title: 'Аукционы Copart · IAAI\nКаталог авто из США',
    sub: 'Поиск по VIN и лоту · фото · расчёт под ключ до Кишинёва',
    icon: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(237,0,18,0.15)"/>
      <rect x="14" y="18" width="52" height="40" rx="6" stroke="#ed0012" stroke-width="2.5" fill="none"/>
      <path d="M22 30h36M22 40h24M22 50h16" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="56" cy="47" r="10" fill="#ed0012"/>
      <path d="M52 47l3 3 5-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    tag: 'apexauto.md/auctions',
  },
  {
    slug: 'hot',
    title: 'Горячие предложения\nBMW · Mercedes · Tesla',
    sub: 'Популярные авто из США под ключ — цена до участия в торгах',
    icon: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(237,0,18,0.15)"/>
      <path d="M40 14c0 0-16 14-16 28a16 16 0 0 0 32 0c0-10-6-18-6-18s-2 8-8 10c0 0 4-12-2-20z" fill="#ed0012"/>
      <path d="M34 46c0 0 4-4 6-10 2 4 0 10 0 10a8 8 0 0 0 4-8 8 8 0 0 1-10 8z" fill="rgba(255,255,255,0.4)"/>
    </svg>`,
    tag: 'apexauto.md/hot',
  },
  {
    slug: 'about',
    title: 'Федор Чебан\nОснователь Apex Auto',
    sub: 'В авто-бизнесе с 2016 года · Copart · IAAI · Manheim',
    icon: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(237,0,18,0.15)"/>
      <circle cx="40" cy="30" r="14" stroke="#ed0012" stroke-width="2.5" fill="none"/>
      <circle cx="40" cy="30" r="6" fill="#ed0012"/>
      <path d="M16 66c0-13.3 10.7-24 24-24s24 10.7 24 24" stroke="#ed0012" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    </svg>`,
    tag: 'apexauto.md/about',
  },
  {
    slug: 'contacts',
    title: 'Связаться с нами\nTelegram · WhatsApp',
    sub: '@fedukusa · @fedukauto · 068-832-032',
    icon: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(237,0,18,0.15)"/>
      <rect x="18" y="18" width="44" height="44" rx="10" stroke="#ed0012" stroke-width="2.5" fill="none"/>
      <rect x="24" y="24" width="32" height="32" rx="7" fill="#ed0012" opacity="0.2"/>
      <path d="M30 40l8 8 14-16" stroke="#ed0012" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    tag: 'apexauto.md/contacts',
  },
  {
    slug: 'guide',
    title: 'Как привезти авто\nиз США в Молдову 2026',
    sub: 'Пошаговое руководство: аукцион, доставка, таможня',
    icon: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(237,0,18,0.15)"/>
      <rect x="18" y="12" width="36" height="46" rx="5" stroke="#ed0012" stroke-width="2.5" fill="none"/>
      <path d="M26 26h20M26 34h20M26 42h12" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="56" cy="52" r="12" fill="#ed0012"/>
      <path d="M51 52h10M56 47v10" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`,
    tag: 'apexauto.md/guide',
  },
  {
    slug: 'customs',
    title: 'Растаможка авто\nв Молдове 2026',
    sub: 'Акцизы, таблицы, льготы для EV и гибридов',
    icon: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(237,0,18,0.15)"/>
      <path d="M20 58V30l20-14 20 14v28H20z" stroke="#ed0012" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
      <rect x="32" y="40" width="16" height="18" rx="3" fill="#ed0012" opacity="0.3" stroke="#ed0012" stroke-width="2"/>
      <path d="M37 49l3 3 5-5" stroke="#ed0012" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M28 30h6M46 30h6" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    tag: 'apexauto.md/customs',
  },
  {
    slug: 'tracking',
    title: 'Отслеживание груза\nВаш автомобиль в пути',
    sub: 'Введите VIN или номер лота — покажем этапы доставки',
    icon: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(237,0,18,0.15)"/>
      <circle cx="40" cy="40" r="22" stroke="#ed0012" stroke-width="2.5" fill="none"/>
      <path d="M40 20v20l12 8" stroke="#ed0012" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="40" cy="40" r="3" fill="#ed0012"/>
    </svg>`,
    tag: 'apexauto.md/tracking',
  },
];

function buildHtml(p) {
  const titleLines = p.title.split('\n');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: #0e1117;
    font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
    position: relative;
  }

  /* Background decorations */
  .bg-glow {
    position: absolute; top: -120px; right: -80px;
    width: 500px; height: 500px; border-radius: 50%;
    background: radial-gradient(circle, rgba(237,0,18,0.18) 0%, transparent 70%);
    pointer-events: none;
  }
  .bg-glow2 {
    position: absolute; bottom: -150px; left: -60px;
    width: 400px; height: 400px; border-radius: 50%;
    background: radial-gradient(circle, rgba(237,0,18,0.08) 0%, transparent 70%);
    pointer-events: none;
  }
  .grid-lines {
    position: absolute; inset: 0;
    background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  /* Red accent bar */
  .accent-bar {
    position: absolute; top: 0; left: 0; right: 0;
    height: 4px;
    background: linear-gradient(90deg, #ed0012, #ff4444, #ed0012);
  }

  /* Layout */
  .wrapper {
    position: relative; z-index: 1;
    display: flex; flex-direction: column;
    height: 630px; padding: 52px 72px 48px;
  }

  /* Brand */
  .brand {
    display: flex; align-items: center; gap: 14px; margin-bottom: auto;
  }
  .brand-logo {
    width: 44px; height: 44px; border-radius: 10px;
    background: #ed0012;
    display: flex; align-items: center; justify-content: center;
  }
  .brand-logo svg { display: block; }
  .brand-name {
    font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.3px;
  }
  .brand-sub {
    font-size: 13px; color: rgba(255,255,255,0.45); font-weight: 400; margin-top: 1px;
  }

  /* Main content */
  .content {
    display: flex; align-items: flex-end; gap: 48px; flex: 1; padding-top: 32px;
  }
  .text-block { flex: 1; }

  .tag {
    display: inline-block;
    font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    color: #ed0012; margin-bottom: 20px;
    border: 1px solid rgba(237,0,18,0.35); border-radius: 6px;
    padding: 4px 10px;
    background: rgba(237,0,18,0.08);
  }

  .title {
    font-size: ${titleLines[0].length > 20 ? 52 : 58}px;
    font-weight: 800; letter-spacing: -1.5px; line-height: 1.1;
    color: #fff; margin-bottom: 20px;
  }
  .title span { display: block; }
  .title span:last-child { color: rgba(255,255,255,0.85); }

  .subtitle {
    font-size: 20px; font-weight: 400; color: rgba(255,255,255,0.5);
    line-height: 1.4; max-width: 560px;
  }

  /* Icon box */
  .icon-box {
    flex-shrink: 0; width: 200px; height: 200px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 28px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 4px;
  }
  .icon-box svg { width: 120px; height: 120px; }
  .icon-box svg rect[rx="20"] { rx: 30; }

  /* Bottom row */
  .bottom {
    display: flex; align-items: center; gap: 12px; margin-top: 36px;
    padding-top: 24px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #ed0012; }
  .url { font-size: 16px; color: rgba(255,255,255,0.35); font-weight: 500; }
  .pill {
    margin-left: auto;
    background: rgba(237,0,18,0.12); border: 1px solid rgba(237,0,18,0.3);
    border-radius: 999px; padding: 6px 16px;
    font-size: 14px; font-weight: 700; color: #ed0012;
  }
</style>
</head>
<body>
  <div class="accent-bar"></div>
  <div class="grid-lines"></div>
  <div class="bg-glow"></div>
  <div class="bg-glow2"></div>

  <div class="wrapper">
    <div class="brand">
      <div class="brand-logo">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <path d="M4 19l5-12h8l5 12" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 19h22" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="8" cy="22" r="2.2" fill="white"/>
          <circle cx="18" cy="22" r="2.2" fill="white"/>
        </svg>
      </div>
      <div>
        <div class="brand-name">Apex Auto</div>
        <div class="brand-sub">Доставка авто из США и Канады в Молдову</div>
      </div>
    </div>

    <div class="content">
      <div class="text-block">
        <div class="tag">${p.tag}</div>
        <div class="title">
          ${titleLines.map((l, i) => `<span${i > 0 ? '' : ''}>${l}</span>`).join('')}
        </div>
        <div class="subtitle">${p.sub}</div>
      </div>
      <div class="icon-box">
        ${p.icon.replace('width="80" height="80" viewBox="0 0 80 80"', 'width="120" height="120" viewBox="0 0 80 80"')}
      </div>
    </div>

    <div class="bottom">
      <div class="dot"></div>
      <div class="url">${p.tag}</div>
      <div class="pill">Apex Auto</div>
    </div>
  </div>
</body>
</html>`;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  for (const p of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
    await page.setContent(buildHtml(p), { waitUntil: 'networkidle0' });
    const outPath = path.join(OUT, `${p.slug}.png`);
    await page.screenshot({ path: outPath, type: 'png' });
    await page.close();
    console.log(`✓ ${p.slug}.png`);
  }

  await browser.close();
  console.log('Done. Files in assets/og/');
})();
