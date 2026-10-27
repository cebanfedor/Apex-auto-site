// fetch с таймаутом (AbortController). Зависший (не упавший) апстрим иначе держит
// serverless-функцию до платформенного лимита. Возвращает Response как обычный fetch;
// по таймауту бросает AbortError — вызывающий код ловит в своём try/catch как сетевой сбой.
async function fetchT(url, opts = {}, ms = 8000){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  // 27.10.2026 (QA-аудит): раньше `opts.signal || ctrl.signal` — если вызывающий код когда-нибудь
  // передаст свой signal, таймаут этой обёртки молча перестаёт действовать (fetch слушает ТОЛЬКО
  // переданный signal, ctrl.abort() ни на что не влияет). Сейчас ни один вызов так не делает, но
  // чтобы не превратилось в тихо сломанную защиту при будущем использовании — всегда слушаем свой
  // ctrl.signal, а внешний signal (если есть) просто тоже триггерит тот же abort.
  const external = opts.signal;
  const onExternalAbort = () => ctrl.abort();
  if(external){
    if(external.aborted) ctrl.abort();
    else external.addEventListener("abort", onExternalAbort, {once:true});
  }
  try{
    return await fetch(url, {...opts, signal:ctrl.signal});
  }finally{
    clearTimeout(timer);
    if(external) external.removeEventListener("abort", onExternalAbort);
  }
}
module.exports = { fetchT };
