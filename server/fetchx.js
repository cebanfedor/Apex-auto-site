// fetch с таймаутом (AbortController). Зависший (не упавший) апстрим иначе держит
// serverless-функцию до платформенного лимита. Возвращает Response как обычный fetch;
// по таймауту бросает AbortError — вызывающий код ловит в своём try/catch как сетевой сбой.
async function fetchT(url, opts = {}, ms = 8000){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try{
    return await fetch(url, {...opts, signal:opts.signal || ctrl.signal});
  }finally{ clearTimeout(timer); }
}
module.exports = { fetchT };
