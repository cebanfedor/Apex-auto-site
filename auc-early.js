// Ставится в <head> синхронно: если инфо-баннер каталога закрыт, скрываем его ДО первой отрисовки (без скачка вёрстки).
try{ if(localStorage.getItem("apexAucInfoHidden")) document.documentElement.classList.add("aucInfoOffV1"); }catch(e){}
// Страница лота (/auctions/<slug>): шаблон тот же, что у каталога — без этого до запуска JS мелькал каталог (скелетон, фильтры). Класс снимает showCatalogAgain (возврат из лота в каталог без перезагрузки).
try{ if(/^\/auctions\/[^\/]+/.test(location.pathname)) document.documentElement.classList.add("aucLotPageV1"); }catch(e){}
