// Ставится в <head> синхронно: если инфо-баннер каталога закрыт, скрываем его ДО первой отрисовки (без скачка вёрстки).
try{ if(localStorage.getItem("apexAucInfoHidden")) document.documentElement.classList.add("aucInfoOffV1"); }catch(e){}
