(function(){
  if(/^\/admin/.test(location.pathname)) return;
  var KEY='apexCookieConsent', v;
  try{ v = localStorage.getItem(KEY); }catch(e){ v = null; }
  if(v === '1' || v === '0') return;
  var lang;
  try{
    var k='apexAutoLang', q=new URLSearchParams(location.search).get('lang')||'', s=localStorage.getItem(k)||'', raw=(q||s).toLowerCase();
    lang = raw.indexOf('ro')===0||raw.indexOf('mo')===0 ? 'ro' : raw.indexOf('en')===0 ? 'en' : 'ru';
  }catch(e){ lang='ru'; }
  var DICT = {
    ru: { text:'Мы используем cookie для аналитики сайта. Необходимые cookie работают всегда; аналитические запускаются только с вашего согласия.', accept:'Принять', reject:'Отклонить', more:'Подробнее' },
    ro: { text:'Folosim cookie-uri pentru analiza site-ului. Cele necesare funcționează mereu; cele analitice pornesc doar cu acordul dvs.', accept:'Accept', reject:'Refuz', more:'Detalii' },
    en: { text:'We use cookies to analyze site traffic. Necessary cookies always work; analytics cookies run only with your consent.', accept:'Accept', reject:'Decline', more:'Learn more' }
  };
  var T = DICT[lang] || DICT.ru;

  function build(){
    if(document.querySelector('.cookieConsentV1')) return;
    var el = document.createElement('div');
    el.className = 'cookieConsentV1';
    el.setAttribute('role','dialog');
    el.setAttribute('aria-label','Cookie consent');
    el.innerHTML =
      '<div class="cookieConsentBoxV1">' +
        '<p>' + T.text + ' <a href="/privacy">' + T.more + '</a></p>' +
        '<div class="cookieConsentBtnsV1">' +
          '<button type="button" class="cookieBtnRejectV1">' + T.reject + '</button>' +
          '<button type="button" class="cookieBtnAcceptV1">' + T.accept + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('.cookieBtnAcceptV1').addEventListener('click', function(){
      try{ localStorage.setItem(KEY,'1'); }catch(e){}
      if(window.apexLoadGA) window.apexLoadGA();
      el.remove();
    });
    el.querySelector('.cookieBtnRejectV1').addEventListener('click', function(){
      try{ localStorage.setItem(KEY,'0'); }catch(e){}
      el.remove();
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
