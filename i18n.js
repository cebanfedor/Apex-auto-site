(function(){
  const SUPPORTED = ["ru","ro","en"];
  const DEFAULT_LANG = "ru";
  const STORAGE_KEY = "apexAutoLang";

  function normalizeLang(value){
    const lang = String(value || "").toLowerCase();
    if(lang.startsWith("ro") || lang.startsWith("mo")) return "ro";
    if(lang.startsWith("en")) return "en";
    if(lang.startsWith("ru")) return "ru";
    return "";
  }

  function getLang(){
    // ВАЖНО (27.09.2026): без auto-detect по navigator.language — сайт RU-первый (каноникал/<html lang>/OG
    // всегда RU для "/"), а у Googlebot/Lighthouse/большинства ботов navigator.language по умолчанию en-US.
    // Автопереключение на английский по языку браузера у первого визита без explicit ?lang= отдавало
    // ботам и части реальных не-RU пользователей английский текст под русским каноникалом (мисматч для
    // индексации) и давало вспышку RU→EN после отрисовки (несовпадение с pre-paint проверкой в <head>,
    // которая тоже смотрит только query+localStorage). Язык меняется ТОЛЬКО явным выбором (?lang= или свитчер).
    const params = new URLSearchParams(window.location.search);
    const queryLang = normalizeLang(params.get("lang"));
    if(queryLang) return queryLang;

    const savedLang = normalizeLang(localStorage.getItem(STORAGE_KEY));
    if(savedLang) return savedLang;

    return DEFAULT_LANG;
  }

  // Словари переводов (RO/EN, ~250 КБ) лежат в i18n-dict.js и грузятся только когда язык не русский (для RU они не нужны).
  let dict = {ro:{}, en:{}}, attrDict = {ro:{}, en:{}};
  const SELF_SRC = (document.currentScript && document.currentScript.src) || "";
  let dictState = 0, dictWaiters = [];
  function ensureDict(cb){
    if(window.__APEX_DICT){ dict = window.__APEX_DICT.dict; attrDict = window.__APEX_DICT.attrDict; dictState = 2; if(cb) cb(); return; }
    if(cb) dictWaiters.push(cb);
    if(dictState === 1) return;
    dictState = 1;
    const s = document.createElement("script");
    s.src = SELF_SRC ? SELF_SRC.replace(/i18n\.js/, "i18n-dict.js") : "/i18n-dict.js";
    s.onload = () => { dict = window.__APEX_DICT.dict; attrDict = window.__APEX_DICT.attrDict; dictState = 2; const w = dictWaiters; dictWaiters = []; w.forEach(f => { try{ f(); }catch(e){} }); try{ document.dispatchEvent(new Event("apex-dict-ready")); }catch(e){} };
    s.onerror = () => { dictState = 0; const w = dictWaiters; dictWaiters = []; w.forEach(f => { try{ f(); }catch(e){} }); };
    document.head.appendChild(s);
  }

  function translateText(text, lang){
    if(lang === "ru") return text;
    const map = dict[lang] || {};
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    if(map[compact]) return map[compact];
    // Ключи, которые лежат только в attrDict (placeholder/aria), тоже годятся для текста — частый источник «русских островков»
    const am = attrDict[lang];
    if(am && am[compact]) return am[compact];
    // Динамические фразы с числами/названиями (их нельзя занести в словарь целиком)
    for(let i = 0; i < PATTERNS.length; i++){
      const m = compact.match(PATTERNS[i][0]);
      if(m && PATTERNS[i][1][lang]) return PATTERNS[i][1][lang](m);
    }
    // «Слово (N)» — счётчик в скобках у строки из словаря («Выставлялась ранее (2)»)
    { const m = compact.match(/^(.+?)\s*\((\d+)\)$/); if(m){ const t = map[m[1]] || (am && am[m[1]]); if(t) return `${t} (${m[2]})`; } }
    // Составные строки «A: B», «A · B», «A — B», «A / B», «N миль ≈ M км»: переводим по частям (собираются в JS до загрузки словаря).
    // Фраза из нескольких частей, лежащая в словаре целиком («Днище / подвеска»), берётся целиком — идём от самой длинной.
    if(compact.length < 160){
      const parts = compact.split(/(\s[·—–|•≈\/]\s|:\s)/);
      if(parts.length > 1){
        let changed = false;
        const one = p => {
          let t = map[p] || (am && am[p]);
          if(!t){
            for(let k = 0; k < PATTERNS.length; k++){
              const m = p.match(PATTERNS[k][0]);
              if(m && PATTERNS[k][1][lang]){ t = PATTERNS[k][1][lang](m); break; }
            }
          }
          return t;
        };
        const out = [];
        for(let i = 0; i < parts.length; i += 2){
          let done = false;
          for(let j = parts.length - 1; j >= i; j -= 2){
            const cand = parts.slice(i, j + 1).join("");
            const t = (j > i) ? (map[cand] || (am && am[cand])) : one(cand);
            if(t){ out.push(t); if(j + 1 < parts.length) out.push(parts[j + 1]); i = j; changed = true; done = true; break; }
          }
          if(!done){ out.push(parts[i]); if(i + 1 < parts.length) out.push(parts[i + 1]); }
        }
        if(changed) return out.join("");
      }
    }
    return text;
  }
  const PATTERNS = [
    [/^Открыть лот (\d+) на (\S+)$/, {en: m => `Open lot ${m[1]} on ${m[2]}`, ro: m => `Deschide lotul ${m[1]} pe ${m[2]}`}],
    [/^([\d\s.,]+?)\s*км$/, {en: m => `${m[1]} km`, ro: m => `${m[1]} km`}],
    [/^([\d\s.,]+?)\s*миль$/, {en: m => `${m[1]} mi`, ro: m => `${m[1]} mile`}],
    [/^(\d+)\s+фото$/, {en: m => `${m[1]} photos`, ro: m => `${m[1]} foto`}],
    [/^(\d+)\s+мин\.\s+назад$/, {en: m => `${m[1]} min ago`, ro: m => `${m[1]} min. în urmă`}],
    [/^(\d+)\s+ч\.\s+назад$/, {en: m => `${m[1]} h ago`, ro: m => `${m[1]} ore în urmă`}],
    [/^(\d+)\s+дн\.\s+назад$/, {en: m => `${m[1]} d ago`, ro: m => `${m[1]} zile în urmă`}],
    [/^машин (\d{4})\+ года$/, {en: m => `${m[1]}+ model-year cars`, ro: m => `mașini din ${m[1]}+`}]
  ];

  function translateNodeText(node, lang){
    // Remember the original (Russian) text once, so we can switch languages
    // in place without reloading the page.
    let src = node.__i18nSrc;
    if(src === undefined){ src = node.nodeValue; node.__i18nSrc = src; }
    const translated = translateText(src, lang);
    let newVal;
    if(translated === src){
      newVal = src;
    } else {
      const left = src.match(/^\s*/)?.[0] || "";
      const right = src.match(/\s*$/)?.[0] || "";
      newVal = `${left}${translated}${right}`;
    }
    if(node.nodeValue !== newVal) node.nodeValue = newVal;
  }

  function walkText(root, lang){
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        const parent = node.parentElement;
        if(!parent) return NodeFilter.FILTER_REJECT;
        if(["SCRIPT","STYLE","NOSCRIPT"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if(parent.closest("[data-no-i18n]")) return NodeFilter.FILTER_REJECT;
        if(!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => translateNodeText(node, lang));
  }

  function translateAttrs(lang, root){
    const scope = root || document;
    const qa = sel => { const l = Array.from(scope.querySelectorAll(sel)); if(root && root.matches && root.matches(sel)) l.unshift(root); return l; };
    // Атрибуты ищем сначала в attrDict, затем в основном словаре —
    // placeholder'ы вроде «Поиск: VIN…» лежат именно там
    const map = attrDict[lang] || {};
    const main = dict[lang] || {};
    qa("[placeholder]").forEach(el => {
      let src = el.__i18nPh;
      if(src === undefined){ src = el.getAttribute("placeholder") || ""; el.__i18nPh = src; }
      const val = lang === "ru" ? src : (map[src] || main[src] || translateText(src, lang));
      if(el.getAttribute("placeholder") !== val) el.setAttribute("placeholder", val);
    });
    qa("[aria-label]").forEach(el => {
      if(el.closest("[data-no-i18n]")) return;
      let src = el.__i18nAria;
      if(src === undefined){ src = el.getAttribute("aria-label") || ""; el.__i18nAria = src; }
      const val = lang === "ru" ? src : (map[src] || main[src] || translateText(src, lang));
      if(el.getAttribute("aria-label") !== val) el.setAttribute("aria-label", val);
    });
    qa("img[alt]").forEach(el => {
      if(el.closest("[data-no-i18n]")) return;
      let src = el.__i18nAlt;
      if(src === undefined){ src = el.getAttribute("alt") || ""; el.__i18nAlt = src; }
      if(!/[А-Яа-яЁё]/.test(src)) return;
      const val = lang === "ru" ? src : translateText(src, lang);
      if(el.getAttribute("alt") !== val) el.setAttribute("alt", val);
    });
    qa("[title]").forEach(el => {
      if(el.closest("[data-no-i18n]") || el.tagName === "TITLE") return;
      let src = el.__i18nTitle;
      if(src === undefined){ src = el.getAttribute("title") || ""; el.__i18nTitle = src; }
      if(!/[А-Яа-яЁё]/.test(src)) return;
      let val = lang === "ru" ? src : (map[src] || main[src]);
      if(!val) val = lang === "ru" ? src : translateText(src, lang);
      if(el.getAttribute("title") !== val) el.setAttribute("title", val);
    });
    if(root) return;   // заголовок вкладки и переключатель — только при полном проходе
    const titleMap = {
      ro:{
        "APEX AUTO — просчет под ключ":"APEX AUTO — calcul la cheie",
        "Горячие предложения — Apex Auto":"Oferte recomandate — Apex Auto",
        "Моя история — Apex Auto":"Povestea mea — Apex Auto",
        "Контакты — Apex Auto":"Contacte — Apex Auto",
        "Отслеживание груза — Apex Auto":"Urmărire marfă — Apex Auto"
      },
      en:{
        "APEX AUTO — просчет под ключ":"APEX AUTO — turnkey calculator",
        "Горячие предложения — Apex Auto":"Recommended lots — Apex Auto",
        "Моя история — Apex Auto":"My story — Apex Auto",
        "Контакты — Apex Auto":"Contacts — Apex Auto",
        "Отслеживание груза — Apex Auto":"Cargo tracking — Apex Auto"
      }
    };
    if(!window.__i18nTitleSrc) window.__i18nTitleSrc = document.title;
    const titleSrc = window.__i18nTitleSrc;
    document.title = lang === "ru" ? titleSrc : (titleMap[lang]?.[titleSrc] || (dict[lang] || {})[titleSrc] || titleSrc);
  }

  function injectSwitcher(lang){
    const nav = document.querySelector(".mainNavV82");
    if(!nav) return;
    let wrap = document.querySelector(".langSwitcherV165");
    if(!wrap){
      wrap = document.createElement("div");
      wrap.className = "langSwitcherV165";
      wrap.setAttribute("aria-label", "Language");
      wrap.setAttribute("data-no-i18n", "true");
      wrap.innerHTML = SUPPORTED.map(code => `<button type="button" data-lang="${code}" class="${code === lang ? "active" : ""}">${code.toUpperCase()}</button>`).join("");
      nav.appendChild(wrap);
    }
    // Bind click — replace any prior listener by cloning the node
    const fresh = wrap.cloneNode(true);
    wrap.parentNode.replaceChild(fresh, wrap);
    fresh.addEventListener("click", event => {
      const button = event.target.closest("[data-lang]");
      if(!button) return;
      switchLang(button.dataset.lang);
    });
  }

  function applyTranslations(lang){
    walkText(document.body, lang);
    translateAttrs(lang);
    document.querySelectorAll(".langSwitcherV165 button").forEach(button => {
      button.classList.toggle("active", button.dataset.lang === lang);
    });
  }

  function apply(lang){
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    injectSwitcher(lang);
    applyTranslations(lang);
  }

  // Switch language in place — no page reload (avoids the header/photo flicker).
  function switchLang(lang){
    if(!SUPPORTED.includes(lang) || lang === currentLang) return;
    if(lang !== "ru" && dictState !== 2){ ensureDict(() => doSwitch(lang)); return; }   // словарь ещё не загружен
    doSwitch(lang);
  }
  function doSwitch(lang){
    if(lang === currentLang) return;
    currentLang = lang;
    window.APEX_LANG = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(null, "", url.toString());
    } catch(e){}
    apply(lang);
    try{ document.dispatchEvent(new Event("apex-dict-ready")); }catch(e){}
    // re-render the calculator so its generated rows pick up the new language
    if(typeof window.calculate === "function"){ try { window.calculate(); apply(lang); } catch(e){} }
    // re-render tracking results so dates and dynamic labels update
    if(typeof window._trackRerender === "function"){ try { window._trackRerender(); apply(lang); } catch(e){} }
    // re-render /catalog breadcrumbs + dynamic H1 (brand/model name composed in JS, not a DOM-text match)
    if(typeof window._catalogRerenderHeading === "function"){ try { window._catalogRerenderHeading(); apply(lang); } catch(e){} }
    // живые факты с аукционов (карточка в шапке /korea, /canada) — тексты собираются в JS
    if(typeof window._factsRerender === "function"){ try { window._factsRerender(); } catch(e){} }
  }

  let currentLang = getLang();
  window.APEX_LANG = currentLang;
  // Язык — в адресе: скопированная/отправленная ссылка откроется и получит превью (Telegram, WhatsApp) на том же языке
  try{ if(currentLang !== "ru"){ var _u = new URL(location.href); if(_u.searchParams.get("lang") !== currentLang){ _u.searchParams.set("lang", currentLang); history.replaceState(history.state, "", _u.toString()); } } }catch(e){}
  if(currentLang !== "ru") ensureDict();   // грузим словарь параллельно с разбором страницы
  // Синхронный перевод строки в текущий язык — для динамического контента
  // (калькулятор лота, карточки), который строится в JS уже после apply().
  // Без него такой текст переводится только асинхронным наблюдателем — отсюда
  // мигание русского текста на доли секунды при каждом ререндере.
  // 14.10.2026 (пост в Telegram-канал на RO): второй необязательный параметр lang — перевод строки
  // в ЯЗЫК ПО ВЫБОРУ, независимо от текущего языка сайта (админ работает на RU-версии, а текст поста
  // должен уйти на RO). Без аргумента — поведение не меняется (текущий язык сайта, как раньше).
  window.i18nT = function(text, lang){ try { return translateText(text, lang || currentLang); } catch(e){ return text; } };
  // 28.09.2026: составные строки (Продавец/Пробег/Двигатель/Локация — собираются join(" · ") из
  // нескольких L()-переведённых кусков ДО вставки в DOM) на самом быстром пути (SSR-лот рендерится
  // синхронно из #ssrLotV1, без ожидания сети) успевают отрисоваться РАНЬШЕ, чем догрузится словарь
  // (250 КБ). Общий MutationObserver-сборщик ниже чинит потом только ОДИНОЧНЫЕ узлы текста, совпадающие
  // с ключом словаря целиком — склеенную через " · " фразу под него не найти, она остаётся русской
  // навсегда. auctions.js зовёт это после первого рендера лота, чтобы перерисовать теми же данными,
  // когда словарь точно готов (для ru или уже загруженного словаря коллбек летит сразу же).
  window.__apexEnsureDict = ensureDict;

  document.addEventListener("DOMContentLoaded", () => {
    const boot = () => { apply(currentLang); document.documentElement.classList.remove("i18n-pending"); };
    if(currentLang === "ru") boot(); else ensureDict(boot);
    let timer = 0;
    // Новые узлы переводим СИНХРОННО в колбэке наблюдателя: он выполняется микрозадачей до отрисовки кадра,
    // поэтому русский текст динамических блоков (карточки, счётчики, факты) не мелькает на RO/EN.
    // Раньше был дебаунс 60 мс — русская строка успевала нарисоваться (и мигала при каждом ререндере).
    // Полный проход (атрибуты, всё остальное) остаётся запасным, с задержкой.
    const observer = new MutationObserver(records => {
      if(currentLang === "ru") return;
      if(dictState === 2){
        try{
          records.forEach(rec => {
            rec.addedNodes.forEach(n => {
              if(n.nodeType === 3){
                const par = n.parentElement;
                if(par && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(par.tagName) && n.nodeValue && n.nodeValue.trim() && !par.closest("[data-no-i18n]")) translateNodeText(n, currentLang);
              } else if(n.nodeType === 1 && !n.closest("[data-no-i18n]")){
                walkText(n, currentLang);
                translateAttrs(currentLang, n);
              }
            });
          });
        }catch(e){}
      }
      clearTimeout(timer);
      timer = setTimeout(() => applyTranslations(currentLang), 60);
    });
    observer.observe(document.body, {subtree:true, childList:true});
  });
})();

// Nav dropdown toggle
(function(){
  function isMobile(){ return window.matchMedia("(max-width: 820px)").matches; }
  function initDropdowns(){
    document.querySelectorAll(".navDropV420").forEach(function(drop){
      var btn = drop.querySelector(".navDropBtnV420");
      if(!btn || btn._dropInit) return;
      btn._dropInit = true;
      // hover — desktop
      var closeTimer;
      drop.addEventListener("mouseenter", function(){
        clearTimeout(closeTimer);
        if(!isMobile()) drop.classList.add("open");
      });
      drop.addEventListener("mouseleave", function(){
        if(!isMobile()) closeTimer = setTimeout(function(){ drop.classList.remove("open"); }, 150);
      });
      // click — mobile
      btn.addEventListener("click", function(e){
        e.stopPropagation();
        if(isMobile()) drop.classList.toggle("open");
      });
    });
  }
  document.addEventListener("click", function(){
    document.querySelectorAll(".navDropV420.open").forEach(function(d){ d.classList.remove("open"); });
  });
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initDropdowns);
  } else {
    initDropdowns();
  }
})();
