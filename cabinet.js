/* Личный кабинет клиента (24.11.2026). Данные: localStorage устройства + (если подключён Telegram) сервер cab_items через cab-sync.js.
   Свои переводы RU/RO/EN внутри файла (страница рисуется скриптом, словарь сайта не нужен). Весь динамический текст экранируется. */
(function(){
  "use strict";
  var root = document.getElementById("cab");
  if(!root) return;
  var LANG = (function(){ var l = String(window.APEX_LANG || document.documentElement.lang || "ru").slice(0, 2); return l === "ro" || l === "en" ? l : "ru"; })();
  var LI = LANG === "ro" ? 1 : LANG === "en" ? 2 : 0;

  // ---------- переводы [ru, ro, en] ----------
  var TX = {
    hero_k:["ЛИЧНЫЙ КАБИНЕТ","CONTUL PERSONAL","MY ACCOUNT"],
    hero_h:["Ваши машины, торги и расчёты — в одном месте","Mașinile, licitațiile și calculele tale — într-un singur loc","Your cars, auctions and quotes — in one place"],
    hero_p:["Избранные лоты с живыми ставками, заметки, авто в пути и уведомления. Всё синхронизируется между телефоном и компьютером.","Loturi favorite cu oferte live, notițe, mașini în drum și notificări. Totul se sincronizează între telefon și calculator.","Favourite lots with live bids, notes, cars in transit and alerts. Everything syncs between your phone and computer."],
    c_off_h:["Подключите Telegram","Conectează Telegram","Connect Telegram"],
    c_off_p:["Без пароля и регистрации: одно нажатие «Start» в боте. Данные сохранятся и будут на всех ваших устройствах.","Fără parolă și înregistrare: o apăsare pe „Start” în bot. Datele se salvează și apar pe toate dispozitivele.","No password or sign-up: just tap “Start” in the bot. Your data is saved and follows you across devices."],
    c_b1:["Избранное и заметки на всех устройствах","Favorite și notițe pe toate dispozitivele","Favourites and notes on every device"],
    c_b2:["Уведомления о торгах и новых лотах","Notificări despre licitații și loturi noi","Alerts about auctions and new lots"],
    c_b3:["Статус ваших машин в пути","Starea mașinilor tale în drum","Status of your cars in transit"],
    c_btn:["Подключить Telegram","Conectează Telegram","Connect Telegram"],
    c_wait_h:["Осталось нажать Start","Mai rămâne să apeși Start","Just tap Start"],
    c_wait_p:["Откройте бота и нажмите «Start» — страница обновится сама.","Deschide botul și apasă „Start” — pagina se actualizează singură.","Open the bot and tap “Start” — this page updates by itself."],
    c_open:["Открыть Telegram","Deschide Telegram","Open Telegram"],
    c_on_h:["Telegram подключён","Telegram conectat","Telegram connected"],
    c_on_p:["Избранное, заметки и ваши машины сохраняются на сервере — войдите с другого устройства через Telegram, и всё будет на месте.","Favoritele, notițele și mașinile tale sunt salvate pe server — intră de pe alt dispozitiv prin Telegram și găsești totul.","Favourites, notes and your cars are stored on our server — sign in from another device via Telegram and everything is there."],
    c_bot:["Открыть бота","Deschide botul","Open the bot"],
    c_local:["Сейчас данные хранятся только в этом браузере.","Acum datele sunt păstrate doar în acest browser.","Right now your data lives only in this browser."],
    c_err:["Не удалось подключиться. Попробуйте ещё раз.","Conectarea a eșuat. Încearcă din nou.","Could not connect. Please try again."],
    c_notable:["Хранилище на сервере ещё настраивается — пока всё сохраняется на этом устройстве.","Stocarea pe server se configurează — deocamdată totul rămâne pe acest dispozitiv.","Server storage is being set up — for now everything stays on this device."],
    t_over:["Обзор","Prezentare","Overview"], t_fav:["Избранное","Favorite","Favourites"], t_cars:["Мои машины","Mașinile mele","My cars"],
    t_subs:["Уведомления","Notificări","Alerts"], t_recent:["Недавние","Recente","Recent"], t_set:["Настройки","Setări","Settings"],
    s_fav:["В избранном","La favorite","Favourites"], s_soon:["Торги в ближайшие 48 ч","Licitații în 48 h","Auctions in 48 h"], s_cars:["Авто в пути","Mașini în drum","Cars in transit"], s_subs:["Подписок","Abonamente","Alerts"],
    o_next:["Ближайшие торги","Următoarele licitații","Upcoming auctions"], o_next_e:["Добавьте лоты в избранное — здесь появятся даты торгов и обратный отсчёт.","Adaugă loturi la favorite — aici apar datele licitațiilor și numărătoarea inversă.","Add lots to favourites — auction dates and countdowns will show up here."],
    o_cars:["Мои машины","Mașinile mele","My cars"], o_cars_e:["Добавьте VIN вашей машины — покажем, где она сейчас и когда будет в Кишинёве.","Adaugă VIN-ul mașinii — îți arătăm unde este și când ajunge la Chișinău.","Add your car’s VIN — we’ll show where it is and when it reaches Chișinău."],
    o_quick:["Быстрые действия","Acțiuni rapide","Quick actions"], o_recent:["Недавно смотрели","Vizualizate recent","Recently viewed"],
    q_us:["Аукционы США и Канады","Licitații SUA și Canada","US & Canada auctions"], q_kr:["Целые авто из Кореи","Mașini întregi din Coreea","Intact cars from Korea"], q_calc:["Калькулятор под ключ","Calculator la cheie","Turnkey calculator"], q_vin:["Проверка VIN","Verificare VIN","VIN check"], q_msg:["Написать менеджеру","Scrie managerului","Message the manager"], q_track:["Отследить авто","Urmărește mașina","Track a car"],
    f_all:["Все","Toate","All"], f_soon:["Скоро торги","Curând","Soon"], f_sold:["Продано","Vândute","Sold"], f_nodate:["Без даты","Fără dată","No date"],
    sort_date:["По дате торгов","După data licitației","By auction date"], sort_add:["Сначала новые","Cele mai noi","Newest first"],
    fav_e_h:["В избранном пока пусто","Încă nu ai favorite","No favourites yet"], fav_e_p:["Нажмите ♡ на карточке лота — он появится здесь, со ставкой и обратным отсчётом.","Apasă ♡ pe cardul unui lot — apare aici, cu oferta și numărătoarea inversă.","Tap ♡ on a lot card — it will appear here with the live bid and countdown."], fav_go:["Открыть каталог","Deschide catalogul","Open the catalog"],
    bid:["Ставка","Ofertă","Bid"], buynow:["Выкуп","Cumpărare","Buy Now"], when:["Торги","Licitație","Auction"], odo:["Пробег","Rulaj","Mileage"], sold_for:["Продан","Vândut","Sold"], final:["Финал","Final","Final"],
    nodate:["Дата не назначена","Dată nealocată","No date yet"], live_now:["Идут торги","În desfășurare","Live now"], ended:["Торги прошли","Încheiat","Ended"], in_:["через","peste","in"], d:["д","z","d"], h:["ч","h","h"], m:["мин","min","min"],
    open_lot:["Открыть лот","Deschide lotul","Open lot"], note:["Заметка","Notiță","Note"], note_ph:["Ваша заметка к этому лоту…","Notița ta pentru acest lot…","Your note for this lot…"], saved:["Сохранено","Salvat","Saved"],
    follow:["Следить","Urmărește","Follow"], unfollow:["Не следить","Nu mai urmări","Unfollow"], remove:["Убрать","Elimină","Remove"], add_fav:["В избранное","La favorite","Add to favourites"],
    cars_h:["Мои машины","Mașinile mele","My cars"], cars_p:["Введите VIN или номер лота — подтянем статус доставки, этапы и ожидаемую дату в Кишинёве.","Introdu VIN sau numărul lotului — aducem statusul livrării, etapele și data estimată la Chișinău.","Enter a VIN or lot number — we’ll pull delivery status, stages and the expected date in Chișinău."],
    cars_ph:["VIN (17 символов) или номер лота","VIN (17 caractere) sau numărul lotului","VIN (17 characters) or lot number"], cars_add:["Добавить","Adaugă","Add"],
    cars_bad:["Укажите VIN из 17 символов или номер лота (6–9 цифр).","Introdu un VIN de 17 caractere sau un număr de lot (6–9 cifre).","Enter a 17-character VIN or a 6–9 digit lot number."], cars_nf:["Машина не найдена в трекинге. Проверьте VIN или номер лота.","Mașina nu a fost găsită. Verifică VIN-ul sau lotul.","Car not found in tracking. Check the VIN or lot number."], cars_dup:["Эта машина уже в списке.","Mașina este deja în listă.","This car is already in the list."], cars_lim:["Достигнут лимит машин.","Limita de mașini atinsă.","Car limit reached."],
    cars_e:["Пока нет машин. Добавьте VIN — и следите за доставкой отсюда.","Nu ai mașini încă. Adaugă un VIN și urmărește livrarea de aici.","No cars yet. Add a VIN and follow delivery from here."],
    eta:["Ожидаем в Кишинёве","Ajunge la Chișinău","Expected in Chișinău"], det:["Подробнее и фото","Detalii și poze","Details & photos"], loading:["Загрузка…","Se încarcă…","Loading…"], trk_fail:["Статус пока недоступен","Statusul nu este disponibil","Status unavailable"], proc:["В обработке","În procesare","Processing"], deliv:["Доставлен в Кишинёв","Livrat la Chișinău","Delivered to Chișinău"], enr:["В пути до Кишинёва","În drum spre Chișinău","On the way to Chișinău"],
    st_Car_won:["Куплен","Cumpărat","Bought"], st_Left_auction:["Выехал с аукциона","A plecat de la licitație","Left auction"], st_Delivered_to_loading_place:["На складе","La depozit","At warehouse"], st_Loading:["Погружен","Încărcat","Loaded"], st_Arrival:["Порт Клайпеда","Portul Klaipeda","Klaipeda port"], st_Chisinau:["Кишинёв","Chișinău","Chișinău"],
    subs_h:["Подписки на лоты и поиски","Abonamente la loturi și căutări","Lot & search subscriptions"], subs_e:["Подписок пока нет. Нажмите 🔔 на лоте или «Уведомлять о новых» в каталоге — сообщения придут в Telegram.","Nu ai abonamente. Apasă 🔔 pe un lot sau „Notifică” în catalog — mesajele vin în Telegram.","No subscriptions yet. Tap 🔔 on a lot or “Notify me” in the catalog — messages arrive in Telegram."],
    sub_lot:["Лот","Lot","Lot"], sub_search:["Поиск","Căutare","Search"], sub_del:["Удалить","Șterge","Delete"], subs_need:["Подключите Telegram, чтобы получать уведомления о торгах и новых лотах.","Conectează Telegram ca să primești notificări despre licitații și loturi noi.","Connect Telegram to get alerts about auctions and new lots."],
    prefs_h:["О чём сообщать","Despre ce să anunțăm","What to notify about"], p_date:["Назначена дата торгов","Data licitației stabilită","Auction date set"], p_timed:["Лот стал Timed","Lotul a devenit Timed","Lot went Timed"], p_day:["В день торгов","În ziua licitației","On auction day"], p_hour:["За час до торгов","Cu o oră înainte","One hour before"], p_buynow:["Появился Buy Now","A apărut Buy Now","Buy Now appeared"], p_play:["Торги идут, итог (продан / нет)","Licitația rulează, rezultatul","Auction live and result"],
    rec_h:["Недавно смотрели","Vizualizate recent","Recently viewed"], rec_e:["Лоты, которые вы открывали, появятся здесь.","Loturile deschise apar aici.","Lots you open will appear here."], rec_clear:["Очистить","Șterge istoricul","Clear"],
    set_h:["Настройки и вход","Setări și autentificare","Settings & sign-in"], set_dev_h:["Как войти с другого устройства","Cum intri de pe alt dispozitiv","Sign in on another device"], set_dev:["Откройте этот кабинет на новом устройстве → «Подключить Telegram» → «Start» в боте. Те же данные появятся автоматически.","Deschide acest cont pe noul dispozitiv → „Conectează Telegram” → „Start” în bot. Aceleași date apar automat.","Open this page on the new device → “Connect Telegram” → “Start” in the bot. The same data appears automatically."],
    set_out:["Выйти на этом устройстве","Ieși de pe acest dispozitiv","Sign out on this device"], set_out_d:["Данные на сервере останутся, с устройства будут убраны токен и локальные копии.","Datele de pe server rămân; de pe dispozitiv se șterg tokenul și copiile locale.","Server data stays; the token and local copies are removed from this device."],
    set_wipe:["Удалить все мои данные","Șterge toate datele mele","Delete all my data"], set_wipe_d:["Удалит избранное, заметки, список машин и историю просмотров на сервере и на этом устройстве.","Șterge favoritele, notițele, mașinile și istoricul de pe server și de pe acest dispozitiv.","Removes favourites, notes, cars and history from the server and this device."],
    confirm_out:["Выйти из кабинета на этом устройстве?","Ieși din cont pe acest dispozitiv?","Sign out on this device?"], confirm_wipe:["Удалить ВСЕ данные кабинета? Это нельзя отменить.","Ștergi TOATE datele? Nu se poate anula.","Delete ALL account data? This cannot be undone."], done:["Готово","Gata","Done"],
    mgr:["Менеджер","Manager","Manager"],
    nx_h:["Что дальше","Ce urmează","What’s next"],
    nx_Car_won:["Оплачиваем лот и организуем вывоз с площадки автовозом до порта.","Plătim lotul și organizăm transportul din parcare până în port.","We pay for the lot and arrange the truck to the port."],
    nx_Left_auction:["Машина едет на склад в порту, затем её погрузят в контейнер.","Mașina merge la depozitul din port, apoi se încarcă în container.","The car is heading to the port warehouse, then it is loaded into a container."],
    nx_Delivered_to_loading_place:["Машина на складе: ждёт формирования и погрузки контейнера.","Mașina e la depozit: așteaptă formarea și încărcarea containerului.","The car is at the warehouse waiting for the container to be loaded."],
    nx_Loading:["Контейнер отправится на судно, дальше — морской переход до Клайпеды.","Containerul pleacă pe navă, urmează traversarea mării până la Klaipeda.","The container sails next — sea crossing to Klaipeda."],
    nx_Arrival:["Машина в Клайпеде: оформляем документы и везём в Кишинёв (≈ 2 недели).","Mașina e la Klaipeda: pregătim actele și o aducem la Chișinău (≈ 2 săptămâni).","The car is in Klaipeda: paperwork, then transport to Chișinău (≈ 2 weeks)."],
    nx_Chisinau:["Растаможка и выдача: менеджер свяжется с вами о времени.","Vămuire și predare: managerul te contactează pentru oră.","Customs clearance and handover: the manager will contact you about the time."],
    exp_csv:["Скачать CSV","Descarcă CSV","Download CSV"], exp_copy:["Копировать список","Copiază lista","Copy list"], exp_ok:["Список скопирован","Lista a fost copiată","List copied"],
    p_digest:["Утренняя сводка по избранному","Rezumat de dimineață despre favorite","Morning digest of my favourites"],
    t_deals:["Мои сделки","Tranzacțiile mele","My orders"],
    dl_h:["Мои сделки","Tranzacțiile mele","My orders"],
    dl_verify_h:["Подтвердите номер телефона","Confirmă numărul de telefon","Confirm your phone number"],
    dl_verify_p:["Менеджер заводит вашу сделку по номеру телефона. Нажмите кнопку, затем в Telegram — «Поделиться номером»: Telegram передаёт только ваш собственный номер. После этого здесь появятся этапы, фото и документы по вашей машине.","Managerul creează tranzacția după numărul de telefon. Apasă butonul, apoi în Telegram — „Trimite numărul”: Telegram trimite doar propriul număr. Apoi apar aici etapele, pozele și documentele.","Your manager creates the order by phone number. Tap the button, then “Share my number” in Telegram — Telegram only shares your own number. Stages, photos and documents will then appear here."],
    dl_verify_b:["Подтвердить номер в Telegram","Confirmă numărul în Telegram","Confirm number in Telegram"],
    dl_wait:["Ждём подтверждения в Telegram…","Așteptăm confirmarea în Telegram…","Waiting for confirmation in Telegram…"],
    dl_none_h:["Сделок пока нет","Nu ai tranzacții încă","No orders yet"],
    dl_none_p:["Как только менеджер оформит вашу покупку, она появится здесь: этапы, фото, документы и платежи. Об изменениях бот напишет вам в Telegram.","De îndată ce managerul înregistrează achiziția, apare aici: etape, poze, documente și plăți. Botul te anunță în Telegram.","As soon as your manager registers your purchase it will appear here: stages, photos, documents and payments. The bot will message you in Telegram."],
    dl_need_tg:["Подключите Telegram, чтобы увидеть свои сделки.","Conectează Telegram ca să vezi tranzacțiile.","Connect Telegram to see your orders."],
    dl_stage:["Этап","Etapa","Stage"], dl_eta:["Ожидаемая выдача","Predare estimată","Expected handover"], dl_pay:["Оплата","Plată","Payment"], dl_paid:["Оплачено","Plătit","Paid"], dl_left:["Осталось","Rămas","Left to pay"], dl_total:["Сумма сделки","Total tranzacție","Order total"],
    dl_photos:["Фото","Poze","Photos"], dl_docs:["Документы","Documente","Documents"], dl_tl:["История событий","Istoric evenimente","Event history"], dl_upd:["Обновлено","Actualizat","Updated"], dl_nodb:["Сделки пока недоступны — база настраивается.","Tranzacțiile nu sunt disponibile încă — baza se configurează.","Orders are not available yet — database is being set up."],
    dl_s_bought:["Куплен","Cumpărat","Bought"], dl_s_paid:["Оплачен","Plătit","Paid"], dl_s_pickup:["Вывоз","Ridicare","Pickup"], dl_s_port:["Порт","Port","Port"], dl_s_sea:["В море","Pe mare","At sea"], dl_s_klaipeda:["Клайпеда","Klaipeda","Klaipeda"], dl_s_road:["В пути","În drum","On road"], dl_s_customs:["Таможня","Vamă","Customs"], dl_s_ready:["Готова","Gata","Ready"], dl_s_done:["Выдана","Predată","Handed over"],
    dl_f_bought:["Куплен на аукционе","Cumpărat la licitație","Bought at auction"], dl_f_paid:["Лот оплачен","Lot plătit","Lot paid"], dl_f_pickup:["Вывоз с площадки","Ridicare din parcare","Pickup from the yard"], dl_f_port:["На складе в порту","La depozitul din port","At the port warehouse"], dl_f_sea:["В море","Pe mare","At sea"], dl_f_klaipeda:["В порту Клайпеда","În portul Klaipeda","In Klaipeda port"], dl_f_road:["В пути в Кишинёв","În drum spre Chișinău","On the way to Chișinău"], dl_f_customs:["Растаможка","Vămuire","Customs clearance"], dl_f_ready:["Готова к выдаче","Gata de predare","Ready for handover"], dl_f_done:["Выдана","Predată","Handed over"],
    gd_h:["Ориентир ставки","Reper de ofertă","Bid guide"],
    gd_low:["Ставка ниже ориентира","Oferta sub reper","Bid below guide"], gd_in:["Ставка в пределах ориентира","Oferta în limita reperului","Bid within guide"], gd_high:["Ставка выше ориентира","Oferta peste reper","Bid above guide"],
    gd_note:["По продажам похожих лотов. Это ориентир, а не гарантия.","După vânzările unor loturi similare. Este un reper, nu o garanție.","Based on sales of similar lots. A guide, not a guarantee."],
    p_cars:["Этапы доставки моих машин","Etapele livrării mașinilor mele","Delivery stages of my cars"],
    hello:["Привет, ","Salut, ","Hi, "],
    feed_h:["Что нового с прошлого визита","Noutăți de la ultima vizită","What’s new since your last visit"],
    feed_bid:["ставка выросла","oferta a crescut","bid went up"], feed_sold:["лот продан","lot vândut","lot sold"], feed_date:["назначена дата торгов","data licitației stabilită","auction date set"],
    feed_moved:["торги перенесены на","licitația mutată pe","auction moved to"], feed_buy:["появился выкуп","a apărut Buy Now","Buy Now appeared"], feed_clear:["Скрыть","Ascunde","Dismiss"],
    cmp:["Сравнить","Compară","Compare"], cmp_h:["Сравнение лотов","Compararea loturilor","Lot comparison"], cmp_n:["Выбрано","Selectate","Selected"], cmp_go:["Сравнить выбранные","Compară selecția","Compare selected"], cmp_max:["Можно сравнить до 4 лотов.","Poți compara până la 4 loturi.","You can compare up to 4 lots."], cmp_min:["Выберите хотя бы 2 лота.","Alege cel puțin 2 loturi.","Pick at least 2 lots."], cmp_close:["Закрыть","Închide","Close"],
    cf_year:["Год","An","Year"], cf_odo:["Пробег","Rulaj","Mileage"], cf_bid:["Текущая ставка","Oferta curentă","Current bid"], cf_buy:["Выкуп","Cumpărare","Buy Now"], cf_acv:["Оценка аукциона (ACV)","Evaluare licitație (ACV)","Auction value (ACV)"], cf_rep:["Оценка ремонта","Estimare reparație","Repair estimate"],
    cf_dmg:["Повреждение","Daune","Damage"], cf_doc:["Документ","Document","Title"], cf_eng:["Двигатель","Motor","Engine"], cf_fuel:["Топливо","Combustibil","Fuel"], cf_drv:["Привод","Tracțiune","Drive"], cf_loc:["Локация","Locație","Location"], cf_date:["Торги","Licitație","Auction"], cf_key:["Ключи","Chei","Keys"], cf_best:["лучшее значение","cea mai bună valoare","best value"]
  };
  function t(k){ var r = TX[k]; return r ? (r[LI] || r[0]) : k; }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function $(sel, el){ return (el || root).querySelector(sel); }
  function $$(sel, el){ return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }

  // ---------- хранилище ----------
  var K = {name:"apexCabNameV1", snap:"apexCabSnapV1", feed:"apexCabFeedV1", tok:"apexAlertTokenV1", fav:"apexFavsV1", note:"apexNotesV1", rec:"apexRecentV1", cars:"apexCabCarsV1", lots:"apexAlertLotsV1"};
  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
  function jget(k, d){ try{ var v = JSON.parse(ls(k) || "null"); return v == null ? d : v; }catch(e){ return d; } }
  function token(){ return ls(K.tok) || ""; }
  function cab(){ return window.apexCab || null; }

  var S = {
    bound:false, ready:true, connecting:false, url:"", bot:"",
    name:"", band:{}, deals:null, dealsTries:0, feed:[], cmp:{}, favs:[], notes:{}, cars:[], recent:[], subs:[], prefs:{}, live:{}, track:{}, tab:"over", favFilter:"all", favSort:"date", booted:false, subsLoaded:false
  };
  function loadLocal(){
    S.name = ls(K.name) || "";
    var fm = jget(K.fav, {});
    S.favs = Object.keys(fm).reverse().map(function(id){ var o = fm[id] || {}; if(!o.id) o.id = id; return o; });
    S.notes = jget(K.note, {});
    var r = jget(K.rec, []); S.recent = Array.isArray(r) ? r : [];
    var c = jget(K.cars, []); S.cars = Array.isArray(c) ? c.filter(function(x){ return x && /^[A-HJ-NPR-Z0-9]{17}$/.test(x.vin || ""); }) : [];
  }
  function saveFavs(){
    var m = {}; S.favs.slice().reverse().forEach(function(f){ m[f.id] = f; });
    lsSet(K.fav, JSON.stringify(m));
  }
  function saveCars(){ lsSet(K.cars, JSON.stringify(S.cars)); }

  // ---------- форматирование ----------
  var LOC = LANG === "ro" ? "ro-RO" : LANG === "en" ? "en-GB" : "ru-RU";
  function money(n, ca){ n = Number(n) || 0; return n.toLocaleString("en-US").replace(/,/g, " ") + (ca ? " CAD" : " $"); }
  function isCa(l){ return /canada|,\s*(AB|BC|MB|NB|NL|NS|ON|PE|QC|SK)\b/i.test(String(l && l.location || "")); }
  function fmtDate(iso){
    var d = new Date(iso); if(isNaN(d.getTime())) return "";
    try{ return d.toLocaleString(LOC, {timeZone:"Europe/Chisinau", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}); }catch(e){ return d.toISOString().slice(0, 16).replace("T", " "); }
  }
  function fmtDay(iso){
    var d = new Date(iso); if(isNaN(d.getTime())) return "";
    try{ return d.toLocaleDateString(LOC, {timeZone:"Europe/Chisinau", day:"numeric", month:"long", year:"numeric"}); }catch(e){ return String(iso).slice(0, 10); }
  }
  function left(ms){
    if(ms <= 0) return "";
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if(d >= 1) return t("in_") + " " + d + " " + t("d") + (h % 24 ? " " + (h % 24) + " " + t("h") : "");
    if(h >= 1) return t("in_") + " " + h + " " + t("h") + " " + (m % 60) + " " + t("m");
    return t("in_") + " " + Math.max(1, m) + " " + t("m");
  }
  function lotUrl(id){ return "/auctions/" + encodeURIComponent(id); }
  function img(l){ return l.image || (l.images && l.images[0]) || ""; }
  function titleOf(l){ return l.title || [l.year, l.make, l.model].filter(Boolean).join(" ") || l.id; }
  function aucName(l){ return String(l.auction || String(l.id || "").split("-")[0] || "").toUpperCase(); }
  function ico(name){
    var P = {
      heart:'<path d="M12 21s-7-4.6-9.3-9.1C1.1 8.7 3 5.5 6.2 5.5c2 0 3.4 1.1 4.1 2.2h3.4c.7-1.1 2.1-2.2 4.1-2.2 3.2 0 5.1 3.2 3.5 6.4C19 16.4 12 21 12 21z"/>',
      bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
      car:'<path d="M5 17h14M3 13l2-6h14l2 6v4H3v-4z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
      clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      trash:'<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
      note:'<path d="M4 4h16v12l-4 4H4z"/><path d="M8 9h8M8 13h5"/>',
      out:'<path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/>',
      tg:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
      ok:'<path d="M20 6 9 17l-5-5"/>'
    };
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || "") + "</svg>";
  }

  // ---------- сеть ----------
  function api(action, body){
    var opts = body ? {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)} : {};
    var url = "/api/auctions?action=" + action + (body ? "" : "");
    return fetch(url, opts).then(function(r){ return r.json(); }).catch(function(){ return null; });
  }
  function getApi(action, qs){ return fetch("/api/auctions?action=" + action + (qs ? "&" + qs : "")).then(function(r){ return r.json(); }).catch(function(){ return null; }); }

  // ---------- подключение Telegram ----------
  var pollTimer = null;
  function stopPoll(){ if(pollTimer){ clearInterval(pollTimer); pollTimer = null; } }
  function refreshStatus(){
    if(!token()){ S.bound = false; return Promise.resolve(); }
    return getApi("alertstatus", "token=" + encodeURIComponent(token())).then(function(r){
      if(!r || !r.ok){ return; }
      if(r.exists === false){ S.bound = false; return; }
      S.bound = !!r.bound; S.url = r.url || S.url; S.prefs = r.prefs || {}; S.subs = r.subs || []; S.subsLoaded = true;
    });
  }
  function startConnect(){
    if(S.connecting) return;
    S.connecting = true; render();
    var prep = (token() ? refreshStatus() : Promise.resolve()).then(function(){
      if(S.bound || (token() && S.url)) return;
      return api("alertlink", {lang:LANG}).then(function(r){
        if(r && r.ok && r.token){ lsSet(K.tok, r.token); S.url = r.url; }
        else throw new Error("link");
      });
    });
    Promise.resolve(prep).then(function(){
      if(S.bound){ S.connecting = false; return afterBound(); }
    }).then(function(){
      render();
      var tries = 0;
      stopPoll();
      pollTimer = setInterval(function(){
        tries++;
        refreshStatus().then(function(){
          if(S.bound){ stopPoll(); S.connecting = false; afterBound(); }
          else if(tries > 100){ stopPoll(); S.connecting = false; render(); }
        });
      }, 3000);
    }).catch(function(){ S.connecting = false; toast(t("c_err")); render(); });
  }
  function afterBound(){
    var c = cab();
    var p = c ? (c.setBound(true, true), c.pull(true)) : Promise.resolve(null);
    return Promise.resolve(p).then(function(r){
      if(r && r.ready === false) S.ready = false;
      if(r && r.name){ lsSet(K.name, r.name); }
      if(r && r.items && r.items.car){
        var cars = r.items.car.map(function(it){ return {vin:it.key, label:(it.data && it.data.label) || "", addedAt:(it.data && it.data.addedAt) || it.t}; });
        if(cars.length || ls(K.cars) == null) lsSet(K.cars, JSON.stringify(cars));
      }
      loadLocal(); return refreshStatus();
    }).then(function(){ toast(t("done")); render(); refreshLive(); refreshTracks(); loadDeals(); loadBands(); });
  }

  // ---------- живые данные по избранному ----------
  function refreshLive(){
    var ids = S.favs.map(function(f){ return f.id; }).filter(function(id){ return /^(copart|iaai)-\d+$/.test(id); });
    if(!ids.length){ computeFeed(); return; }
    var pending = 0;
    for(var i = 0; i < ids.length; i += 30){
      pending++;
      (function(chunk){
        getApi("livebids", "ids=" + chunk.join(",")).then(function(r){
          if(r && r.items) Object.keys(r.items).forEach(function(id){ if(r.items[id]) S.live[id] = r.items[id]; });
          if(--pending === 0){ computeFeed(); }
          if(S.tab === "over" || S.tab === "fav") render(true);
        });
      })(ids.slice(i, i + 30));
    }
  }
  function merged(f){
    var lv = S.live[f.id], o = Object.assign({}, f);
    if(lv){
      if(lv.auctionDate !== undefined && lv.auctionDate !== "") o.auctionDate = lv.auctionDate;
      if(lv.currentBid) o.currentBid = lv.currentBid;
      if(lv.buyNow !== undefined) o.buyNow = lv.buyNow;
      if(lv.sold){ o.sold = true; o.finalBid = lv.finalBid; }
    }
    if(!o.sold && Number(o.statusId) === 6 && o.finalBid && Date.parse(o.auctionDate || "") < Date.now()){ o.sold = true; }
    return o;
  }
  function status(o){
    var now = Date.now(), ts = Date.parse(o.auctionDate || "");
    if(o.sold) return {k:"sold", label:t("sold_for") + (o.finalBid ? " " + money(o.finalBid, isCa(o)) : "")};
    if(!isFinite(ts)) return {k:"nodate", label:t("nodate")};
    if(ts > now) return {k:ts - now < 48 * 3600e3 ? "soon" : "future", label:left(ts - now), ts:ts};
    if(now - ts < 3 * 3600e3) return {k:"live", label:t("live_now"), ts:ts};
    return {k:"ended", label:t("ended"), ts:ts};
  }


  // ---------- «Что нового»: сравниваем избранное с прошлым визитом ----------
  var prevSnap = jget(K.snap, null);
  function feedLoad(){ var a = jget(K.feed, []); return Array.isArray(a) ? a.filter(function(x){ return x && Date.now() - x.t < 3 * 86400e3; }) : []; }
  function computeFeed(){
    var out = feedLoad(), seen = {};
    out.forEach(function(x){ seen[x.id + "|" + x.k + "|" + (x.b || x.a || "")] = 1; });
    if(prevSnap){
      S.favs.forEach(function(f){
        var o = merged(f), p = prevSnap[f.id]; if(!p) return;
        var bid = Number(o.currentBid) || 0, add = [];
        if(o.sold && !p.sold) add.push({k:"sold", a:o.finalBid || bid});
        else{
          if(bid > 0 && bid > (p.bid || 0) && (p.bid || 0) > 0) add.push({k:"bid", a:p.bid, b:bid});
          if(o.auctionDate && !p.date) add.push({k:"date", a:o.auctionDate});
          else if(o.auctionDate && p.date && isFinite(Date.parse(o.auctionDate)) && Math.abs(Date.parse(o.auctionDate) - Date.parse(p.date)) > 3600e3) add.push({k:"moved", a:o.auctionDate});
          if(Number(o.buyNow) > 0 && !p.buyNow) add.push({k:"buy", a:o.buyNow});
        }
        add.forEach(function(x){
          var key = f.id + "|" + x.k + "|" + (x.b || x.a || "");
          if(seen[key]) return; seen[key] = 1;
          out.unshift({id:f.id, t:Date.now(), title:titleOf(o), ca:isCa(o), k:x.k, a:x.a, b:x.b});
        });
      });
    }
    S.feed = out.slice(0, 12);
    lsSet(K.feed, JSON.stringify(S.feed));
    var m = {};
    S.favs.forEach(function(f){ var o = merged(f); m[f.id] = {bid:Number(o.currentBid) || 0, date:o.auctionDate || "", sold:!!o.sold, buyNow:Number(o.buyNow) || 0}; });
    lsSet(K.snap, JSON.stringify(m));
  }
  function feedText(x){
    var ca = x.ca;
    if(x.k === "bid") return t("feed_bid") + ": " + money(x.a, ca) + " → " + money(x.b, ca);
    if(x.k === "sold") return t("feed_sold") + (x.a ? " · " + money(x.a, ca) : "");
    if(x.k === "date") return t("feed_date") + ": " + fmtDate(x.a);
    if(x.k === "moved") return t("feed_moved") + " " + fmtDate(x.a);
    return t("feed_buy") + ": " + money(x.a, ca);
  }


  // ---------- «Мои сделки» ----------
  var DSTAGES = ["bought","paid","pickup","port","sea","klaipeda","road","customs","ready","done"];
  var dealPoll = null;
  function loadDeals(){
    if(!token() || !S.bound) return Promise.resolve();
    return getApi("cabdeals", "token=" + encodeURIComponent(token())).then(function(r){
      if(!r || !r.ok) return;
      S.deals = {verified:!!r.verified, list:r.deals || [], noTable:r.reason === "no_table"};
      if(S.deals.verified && dealPoll){ clearInterval(dealPoll); dealPoll = null; toast(t("done")); }
      if(S.tab === "deals" || S.tab === "over") render(true);
    });
  }
  function verifyUrl(){ return String(S.url || "").replace(/\?start=/, "?start=ph_"); }
  function startDealPoll(){
    if(dealPoll) return;
    var tries = 0;
    dealPoll = setInterval(function(){ if(++tries > 100){ clearInterval(dealPoll); dealPoll = null; return; } /* alertstatus заодно опрашивает Telegram (getUpdates) — без него бот отвечает только по крону раз в 3 мин */ getApi("alertstatus", "token=" + encodeURIComponent(token())).catch(function(){}).then(loadDeals); }, 3000);
  }
  function money0(n){ return Number(n || 0).toLocaleString("en-US").replace(/,/g, " ") + " $"; }
  function dealCard(d, compact){
    var idx = Math.max(0, DSTAGES.indexOf(d.stage));
    var steps = DSTAGES.map(function(k, i){
      return '<li class="' + (i < idx ? "done" : i === idx ? "current" : "todo") + '"><i></i><span>' + t("dl_s_" + k) + '</span></li>';
    }).join("");
    var pct = Math.round((idx + (d.stage === "done" ? 1 : .5)) / DSTAGES.length * 100);
    var pay = "";
    if(d.total > 0){
      var paid = Math.min(d.paid || 0, d.total), pp = Math.round(paid / d.total * 100);
      pay = '<div class="cabPayV1"><div class="cabPayHeadV1"><b>' + t("dl_pay") + '</b><span>' + money0(paid) + ' / ' + money0(d.total) + '</span></div><div class="cabBarV1"><i style="width:' + pp + '%"></i></div>' +
        '<div class="cabPayFootV1"><span>' + t("dl_paid") + ': <b>' + money0(paid) + '</b></span><span>' + t("dl_left") + ': <b>' + money0(Math.max(0, d.total - paid)) + '</b></span></div></div>';
    }
    var head = '<header class="cabDealHeadV1"><div><h3>' + esc(d.title) + '</h3>' + (d.vin ? '<small>' + esc(d.vin) + '</small>' : "") + '</div><span class="cabStatusV1' + (d.stage === "done" || d.stage === "ready" ? " isDone" : "") + '">' + t("dl_f_" + d.stage) + '</span></header>';
    var stepper = '<ol class="cabStepperV1" data-cur="' + idx + '">' + steps + '</ol>';
    var next = d.next_step ? '<div class="cabNextV1"><b>' + t("nx_h") + '</b><span>' + esc(d.next_step) + '</span></div>' : "";
    var eta = d.eta && d.stage !== "done" ? '<div class="cabEtaV1">' + t("dl_eta") + ': <b>' + esc(fmtDay(d.eta)) + '</b></div>' : "";
    if(compact) return '<article class="cabDealV1 isCompact">' + head + '<div class="cabBarV1"><i style="width:' + pct + '%"></i></div>' + next + eta + '<a class="cabLinkV1" href="#deals" data-act="tab" data-v="deals">' + t("det") + ' →</a></article>';
    var photos = d.photos && d.photos.length ? '<div class="cabDealSecV1"><h4>' + t("dl_photos") + ' <em>' + d.photos.length + '</em></h4><div class="cabPhotosV1">' +
      d.photos.map(function(p){ return '<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.url) + '" alt="' + esc(p.caption || "") + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()">' + (p.caption ? '<small>' + esc(p.caption) + '</small>' : "") + '</a>'; }).join("") + '</div></div>' : "";
    var docs = d.docs && d.docs.length ? '<div class="cabDealSecV1"><h4>' + t("dl_docs") + '</h4><div class="cabDocsV1">' +
      d.docs.map(function(x){ return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg><span>' + esc(x.name) + '</span></a>'; }).join("") + '</div></div>' : "";
    var tl = d.timeline && d.timeline.length ? '<div class="cabDealSecV1"><h4>' + t("dl_tl") + '</h4><ol class="cabTimelineV1">' +
      d.timeline.slice().sort(function(a, b){ return String(b.at || "").localeCompare(String(a.at || "")); }).map(function(x){ return '<li><i></i><div><small>' + (x.at ? esc(fmtDay(x.at)) : "") + '</small><span>' + esc(x.text) + '</span></div></li>'; }).join("") + '</ol></div>' : "";
    return '<article class="cabDealV1">' + head + stepper + next + '<div class="cabDealMetaV1">' + eta + pay + '</div>' + photos + docs + tl + '</article>';
  }
  function paneDeals(){
    if(!S.bound) return '<section class="cabBoxV1"><h2>' + t("dl_h") + '</h2><p class="cabMutedV1">' + t("dl_need_tg") + '</p><button type="button" class="cabBtnV1" data-act="connect">' + t("c_btn") + '</button></section>';
    if(!S.deals) return '<p class="cabMutedV1 cabPadV1">' + t("loading") + '</p>';
    if(S.deals.noTable) return '<section class="cabBoxV1"><p class="cabMutedV1">' + t("dl_nodb") + '</p></section>';
    if(!S.deals.verified){
      var wait = !!dealPoll;
      return '<section class="cabBoxV1 cabVerifyV1"><div class="cabVerifyIcoV1">' + ico("tg") + '</div><div><h2>' + t("dl_verify_h") + '</h2><p class="cabMutedV1">' + t("dl_verify_p") + '</p>' +
        '<a class="cabBtnV1" href="' + esc(verifyUrl()) + '" target="_blank" rel="noopener" data-act="dealverify">' + ico("tg") + ' ' + t("dl_verify_b") + '</a>' + (wait ? '<p class="cabMutedV1 cabPadV1"><span class="cabSpinV1 isDark"></span> ' + t("dl_wait") + '</p>' : "") + '</div></section>';
    }
    if(!S.deals.list.length) return empty(t("dl_none_h"), t("dl_none_p"), "", "");
    return '<div class="cabDealsV1">' + S.deals.list.map(function(d){ return dealCard(d); }).join("") + '</div>';
  }

  // ---------- трекинг машин ----------
  var STAGE_KEY = {"Car won":"st_Car_won","Left auction":"st_Left_auction","Delivered to loading place":"st_Delivered_to_loading_place","Loading":"st_Loading","Arrival":"st_Arrival","Chisinau":"st_Chisinau"};
  function trackFetch(vin){
    var ck = "apexCabTrk:" + vin, c = null;
    try{ c = JSON.parse(sessionStorage.getItem(ck) || "null"); }catch(e){}
    if(c && Date.now() - c.t < 10 * 60e3) return Promise.resolve(c.d);
    var ctl = new AbortController(), timer = setTimeout(function(){ ctl.abort(); }, 15000);
    return fetch("/api/w8-tracking?vin=" + encodeURIComponent(vin), {signal:ctl.signal}).then(function(r){ return r.json(); }).then(function(d){
      clearTimeout(timer);
      if(!d || d.error) return null;
      try{ sessionStorage.setItem(ck, JSON.stringify({t:Date.now(), d:d})); }catch(e){}
      return d;
    }).catch(function(){ clearTimeout(timer); return null; });
  }
  function refreshTracks(){
    S.cars.forEach(function(c){
      if(S.track[c.vin] !== undefined) return;
      S.track[c.vin] = "loading";
      trackFetch(c.vin).then(function(d){ S.track[c.vin] = d || false; if(S.tab === "over" || S.tab === "cars") render(true); });
    });
  }
  function trackModel(d){
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var stages = (d.stages || []).map(function(s){ return Object.assign({}, s); });
    var portDate = d.container && d.container.portArrival ? new Date(d.container.portArrival + "T00:00:00") : null;
    if(portDate && today >= portDate){ var kl = stages.filter(function(s){ return s.title === "Arrival"; })[0]; if(kl) kl.status = "completed"; }
    var chis = d.etaChisinau || null, cs = "todo";
    if(chis){ var ed = new Date(chis + "T00:00:00"); if(today >= ed) cs = "completed"; else if(portDate && today >= portDate) cs = "current"; }
    if(d.source !== "dealer" && (d.source !== "avtoshipping" || d.etaChisinau)) stages.push({title:"Chisinau", date:chis, status:cs});
    var done = stages.filter(function(s){ return s.status === "completed"; }).length;
    var cur = stages.filter(function(s){ return s.status === "current"; })[0] || stages.slice().reverse().filter(function(s){ return s.status === "completed"; })[0];
    var label = t("proc");
    if(cur){ if(cur.title === "Chisinau" && cur.status === "completed") label = t("deliv"); else if(cur.title === "Chisinau") label = t("enr"); else label = STAGE_KEY[cur.title] ? t(STAGE_KEY[cur.title]) : (/^[A-Z_]+$/.test(cur.title) ? t("proc") : cur.title); }
    var eta = d.source === "dealer" ? d.expectedDate : (d.etaChisinau || (d.container && d.container.portArrival));
    var total = Math.max(stages.length, 1);
    return {stages:stages, cur:cur ? cur.title : "", label:label, eta:eta, pct:Math.round(Math.min(100, (done + (cur && cur.status === "current" ? .5 : 0)) / total * 100)), delivered:!!(cur && cur.title === "Chisinau" && cur.status === "completed")};
  }

  // ---------- рендер ----------
  function toast(msg){
    var el = $("#cabToast"); if(!el) return;
    el.textContent = msg; el.classList.add("on"); clearTimeout(el._t); el._t = setTimeout(function(){ el.classList.remove("on"); }, 2600);
  }

  // ---------- «Ориентир ставки» в избранном ----------
  // Облегчённая копия compsParamsFor из auctions.js (кабинет не грузит auctions.js). Меняете формулу параметров там — сверьте здесь.
  function compsItem(o){
    var low = function(v){ return String(v || "").toLowerCase(); };
    var cond = low(o.condition).replace(/[_-]+/g, " ");
    var runTone = /run and drive|runs and drives|заводится и едет/.test(cond) ? "good" : /dismantl|на разбор/.test(cond) ? "bad" : "";
    var p1 = low(o.primaryDamage), p2 = low(o.secondaryDamage), dmgTxt = p1 + " " + p2 + " " + low(o.damage);
    var heavy = /all over|roll ?over|undercarriage|frame|burn|flood|water|strip|biohazard/.test(dmgTxt);
    var corner = /\bfront end\b/.test(p1) && /\b(left|right) front\b/.test(p2) || /\brear end\b/.test(p1) && /\b(left|right) rear\b/.test(p2);
    var multi = !corner && (/&|,|\band\b|\+/.test(dmgTxt) || (o.secondaryDamage && o.secondaryDamage !== "-" && !/unknown|none|normal/.test(p2)));
    var cq = runTone === "good" && !heavy && !multi ? "good" : (runTone === "bad" || heavy) ? "poor" : "mid";
    var dParts = String(o.damage || "").split(/\s+\/\s+/);
    var it = {id:o.id, manufacturer_id:o.makeId, model_id:o.modelId, year:o.year, odometer:o.odometer, cq:cq,
      fuel:o.fuel, fuel_x:o.fuelKind, generation_id:o.generationId, run:runTone === "good" ? "1" : runTone === "bad" ? "0" : undefined,
      dmg:String(o.primaryDamage || dParts[0] || "").slice(0, 60), dmg2:String(o.secondaryDamage || dParts[1] || "").replace(/^-$/, "").slice(0, 60),
      cond:o.condition, doc:o.document, make_name:o.make, model_name:o.model, title:o.title, gen:o.generationName,
      airbags:o.airbags, keys:o.keys, lot_id:o.id, auction:o.auction, state:o.stateCode, loc:o.location};
    if(Number(o.estimatedRetailValue) > 500) it.acv = Math.round(o.estimatedRetailValue);
    else if(Number(o.cleanWholesalePrice) > 500 && /copart/i.test(o.auction || "")) it.acv = Math.round(o.cleanWholesalePrice * 0.94);
    if(Number(o.repairCost) > 0) it.repair = Math.round(o.repairCost);
    Object.keys(it).forEach(function(k){ if(it[k] === undefined || it[k] === null || it[k] === "") delete it[k]; });
    return it;
  }
  function loadBands(){
    var items = S.favs.map(merged).filter(function(o){ return !o.sold && !isCa(o) && o.makeId && o.modelId && o.year && !S.band[o.id]; }).slice(0, 40).map(compsItem);
    if(!items.length) return;
    fetch("/api/auctions?action=compsbatch", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({items:items})})
      .then(function(r){ return r.json(); }).catch(function(){ return null; })
      .then(function(r){
        if(!r || !r.items) return;
        Object.keys(r.items).forEach(function(id){ var c = r.items[id]; if(c && c.p25 > 0 && c.p75 >= c.p25) S.band[id] = {lo:c.p25, hi:c.p75}; });
        if(S.tab === "fav" || S.tab === "over") render(true);
      });
  }
  function bandRow(o){
    var b = S.band[o.id];
    if(!b || o.sold) return "";
    var bid = Number(o.currentBid) || 0, k = "";
    if(bid > 0) k = bid < b.lo ? "low" : bid <= b.hi ? "in" : "high";
    return '<div class="cabGuideV1' + (k ? " is-" + k : "") + '" title="' + esc(t("gd_note")) + '"><span>' + t("gd_h") + '</span><b>' + money(b.lo) + ' – ' + money(b.hi) + '</b>' + (k ? '<em>' + t("gd_" + k) + '</em>' : "") + '</div>';
  }

  function favCard(f, opt){
    opt = opt || {};
    var o = merged(f), st = status(o), ca = isCa(o), pic = img(o), id = o.id;
    var followed = S.subs.some(function(s){ return s.kind === "lot" && s.lot_id === id; });
    var note = (S.notes[id] && S.notes[id].text) || "";
    var rows = "";
    if(!o.sold && Number(o.currentBid) > 0) rows += '<div><span>' + t("bid") + '</span><b>' + money(o.currentBid, ca) + '</b></div>';
    if(!o.sold && Number(o.buyNow) > 0) rows += '<div><span>' + t("buynow") + '</span><b>' + money(o.buyNow, ca) + '</b></div>';
    if(o.sold && o.finalBid) rows += '<div><span>' + t("final") + '</span><b>' + money(o.finalBid, ca) + '</b></div>';
    if(o.auctionDate && isFinite(Date.parse(o.auctionDate))) rows += '<div><span>' + t("when") + '</span><b>' + esc(fmtDate(o.auctionDate)) + '</b></div>';
    if(o.odometerText) rows += '<div><span>' + t("odo") + '</span><b>' + esc(o.odometerText) + '</b></div>';
    return '<article class="cabCardV1" data-id="' + esc(id) + '">' +
      '<a class="cabPicV1" href="' + lotUrl(id) + '">' + (pic ? '<img src="' + esc(pic) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "") +
      '<span class="cabAucV1">' + esc(aucName(o)) + '</span><span class="cabChipV1 is-' + st.k + '">' + esc(st.label) + '</span></a>' +
      '<div class="cabBodyV1"><a class="cabTitleV1" href="' + lotUrl(id) + '">' + esc(titleOf(o)) + '</a>' +
      (o.vin ? '<div class="cabVinV1">' + esc(o.vin) + '</div>' : "") +
      '<div class="cabRowsV1">' + rows + '</div>' + bandRow(o) +
      '<div class="cabActsV1">' +
        '<button type="button" class="cabIcoBtnV1' + (followed ? " on" : "") + '" data-act="follow" data-id="' + esc(id) + '" title="' + esc(followed ? t("unfollow") : t("follow")) + '">' + ico("bell") + '<span>' + (followed ? t("unfollow") : t("follow")) + '</span></button>' +
        '<button type="button" class="cabIcoBtnV1' + (note ? " on" : "") + '" data-act="notetoggle" data-id="' + esc(id) + '">' + ico("note") + '<span>' + t("note") + '</span></button>' +
        '<button type="button" class="cabIcoBtnV1' + (S.cmp[id] ? " on" : "") + '" data-act="cmpt" data-id="' + esc(id) + '" aria-pressed="' + (!!S.cmp[id]) + '">' + ico("ok") + '<span>' + t("cmp") + '</span></button>' +
        '<button type="button" class="cabIcoBtnV1 isDanger" data-act="unfav" data-id="' + esc(id) + '" title="' + esc(t("remove")) + '">' + ico("trash") + '</button>' +
      '</div>' +
      '<div class="cabNoteV1"' + (note ? "" : " hidden") + '><textarea data-note="' + esc(id) + '" rows="3" maxlength="2000" placeholder="' + esc(t("note_ph")) + '">' + esc(note) + '</textarea><i class="cabSavedV1">' + t("saved") + '</i></div>' +
      '</div></article>';
  }
  function miniRow(f){
    var o = merged(f), st = status(o);
    return '<a class="cabMiniV1" href="' + lotUrl(o.id) + '"><span class="cabMiniPicV1">' + (img(o) ? '<img src="' + esc(img(o)) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "") + '</span>' +
      '<span class="cabMiniTxtV1"><b>' + esc(titleOf(o)) + '</b><small>' + (o.auctionDate && isFinite(Date.parse(o.auctionDate)) ? esc(fmtDate(o.auctionDate)) : esc(t("nodate"))) + (Number(o.currentBid) > 0 && !o.sold ? " · " + money(o.currentBid, isCa(o)) : "") + '</small></span>' +
      '<span class="cabChipV1 is-' + st.k + '">' + esc(st.label) + '</span></a>';
  }
  function carCard(c, compact){
    var d = S.track[c.vin], body;
    if(d === "loading" || d === undefined) body = '<div class="cabMutedV1">' + t("loading") + '</div>';
    else if(!d) body = '<div class="cabMutedV1">' + t("trk_fail") + '</div>';
    else{
      var m = trackModel(d);
      body = '<div class="cabStatusV1' + (m.delivered ? " isDone" : "") + '">' + esc(m.label) + '</div>' +
        '<div class="cabBarV1"><i style="width:' + m.pct + '%"></i></div>' +
        (compact ? "" : '<ol class="cabStagesV1">' + m.stages.map(function(s){ return '<li class="' + esc(s.status || "todo") + '"><i></i><span>' + esc(STAGE_KEY[s.title] ? t(STAGE_KEY[s.title]) : (/^[A-Z_]+$/.test(s.title) ? "·" : s.title)) + '</span><small>' + (s.date ? esc(fmtDay(s.date)) : "—") + '</small></li>'; }).join("") + '</ol>') +
        (m.eta && !m.delivered ? '<div class="cabEtaV1">' + t("eta") + ': <b>' + esc(fmtDay(m.eta)) + '</b></div>' : "") +
        (!compact && m.cur && TX["nx_" + m.cur.replace(/ /g, "_")] ? '<div class="cabNextV1"><b>' + t("nx_h") + '</b><span>' + t("nx_" + m.cur.replace(/ /g, "_")) + '</span></div>' : "");
    }
    var name = (d && d.vehicle) || c.label || c.vin;
    return '<article class="cabCarV1"><div class="cabCarHeadV1"><div><b>' + esc(name) + '</b><small>' + esc(c.vin) + '</small></div>' +
      (compact ? "" : '<button type="button" class="cabIcoBtnV1 isDanger" data-act="delcar" data-vin="' + esc(c.vin) + '" title="' + esc(t("remove")) + '">' + ico("trash") + '</button>') + '</div>' +
      body + '<a class="cabLinkV1" href="/tracking?vin=' + encodeURIComponent(c.vin) + '">' + t("det") + ' →</a></article>';
  }
  function empty(h, p, cta, href){
    return '<div class="cabEmptyV1"><div class="cabEmptyIcoV1">' + ico("heart") + '</div><h3>' + h + '</h3><p>' + p + '</p>' + (cta ? '<a class="cabBtnV1" href="' + href + '">' + cta + '</a>' : "") + '</div>';
  }

  function feedBox(){
    if(!S.feed.length) return "";
    var rows = S.feed.slice(0, 6).map(function(x){
      return '<a class="cabFeedRowV1 is-' + esc(x.k) + '" href="' + lotUrl(x.id) + '"><i></i><span><b>' + esc(x.title) + '</b><small>' + esc(feedText(x)) + '</small></span></a>';
    }).join("");
    return '<section class="cabBoxV1 cabFeedV1"><div class="cabFeedHeadV1"><h2>' + ico("bell") + t("feed_h") + '</h2><button type="button" class="cabGhostV1" data-act="feedclear">' + t("feed_clear") + '</button></div>' + rows + '</section>';
  }
  function paneOver(){
    var favs = S.favs.map(merged);
    var upcoming = favs.map(function(o){ return {o:o, s:status(o)}; }).filter(function(x){ return x.s.k === "soon" || x.s.k === "future" || x.s.k === "live"; }).sort(function(a, b){ return (a.s.ts || 0) - (b.s.ts || 0); }).slice(0, 5);
    var nextHtml = upcoming.length ? upcoming.map(function(x){ return miniRow(x.o); }).join("") : '<p class="cabMutedV1">' + t("o_next_e") + '</p>';
    var carsHtml = S.cars.length ? S.cars.slice(0, 3).map(function(c){ return carCard(c, true); }).join("") : '<p class="cabMutedV1">' + t("o_cars_e") + '</p>';
    var quick = [["/auctions", "q_us"], ["/korea", "q_kr"], ["/#calculator", "q_calc"], ["/vin-check", "q_vin"], ["/tracking", "q_track"], ["https://t.me/fedukusa", "q_msg"]].map(function(q){ return '<a href="' + q[0] + '"' + (/^https/.test(q[0]) ? ' target="_blank" rel="noopener"' : "") + '>' + t(q[1]) + '</a>'; }).join("");
    var rec = S.recent.slice(0, 6).map(function(r){ return miniRow(r); }).join("");
    var dealTop = S.deals && S.deals.verified && S.deals.list.length ? '<section class="cabBoxV1 cabDealTopV1"><h2>' + ico("car") + t("dl_h") + '</h2>' + S.deals.list.slice(0, 2).map(function(d){ return dealCard(d, true); }).join("") + '</section>' : "";
    return dealTop + feedBox() + '<div class="cabGridV1"><div class="cabColV1"><section class="cabBoxV1"><h2>' + ico("clock") + t("o_next") + '</h2>' + nextHtml + '</section>' +
      (rec ? '<section class="cabBoxV1"><h2>' + t("o_recent") + '</h2>' + rec + '</section>' : "") + '</div>' +
      '<div class="cabColV1"><section class="cabBoxV1"><h2>' + ico("car") + t("o_cars") + '</h2>' + carsHtml + '</section>' +
      '<section class="cabBoxV1"><h2>' + t("o_quick") + '</h2><div class="cabQuickV1">' + quick + '</div></section></div></div>';
  }
  function paneFav(){
    if(!S.favs.length) return empty(t("fav_e_h"), t("fav_e_p"), t("fav_go"), "/auctions");
    var items = S.favs.map(function(f){ var o = merged(f); return {f:f, o:o, s:status(o)}; });
    var filters = [["all", "f_all"], ["soon", "f_soon"], ["sold", "f_sold"], ["nodate", "f_nodate"]];
    var shown = items.filter(function(x){
      if(S.favFilter === "soon") return x.s.k === "soon" || x.s.k === "future" || x.s.k === "live";
      if(S.favFilter === "sold") return x.s.k === "sold";
      if(S.favFilter === "nodate") return x.s.k === "nodate";
      return true;
    });
    if(S.favSort === "date") shown.sort(function(a, b){
      var A = a.s.ts && a.s.k !== "ended" && a.s.k !== "sold" ? a.s.ts : 9e15, B = b.s.ts && b.s.k !== "ended" && b.s.k !== "sold" ? b.s.ts : 9e15;
      return A - B;
    });
    return '<div class="cabToolbarV1"><div class="cabPillsV1">' + filters.map(function(f){ return '<button type="button" class="' + (S.favFilter === f[0] ? "on" : "") + '" data-act="ffilter" data-v="' + f[0] + '">' + t(f[1]) + '</button>'; }).join("") + '</div>' +
      '<div class="cabExpV1"><button type="button" class="cabGhostV1" data-act="expcopy">' + t("exp_copy") + '</button><button type="button" class="cabGhostV1" data-act="expcsv">' + t("exp_csv") + '</button></div>' +
      '<select data-act="fsort" aria-label="sort"><option value="date"' + (S.favSort === "date" ? " selected" : "") + '>' + t("sort_date") + '</option><option value="add"' + (S.favSort === "add" ? " selected" : "") + '>' + t("sort_add") + '</option></select></div>' +
      '<div class="cabCardsV1">' + shown.map(function(x){ return favCard(x.f); }).join("") + '</div>';
  }
  function paneCars(){
    var form = '<form class="cabAddV1" data-form="car"><input type="text" name="v" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="30" placeholder="' + esc(t("cars_ph")) + '" aria-label="' + esc(t("cars_ph")) + '"><button class="cabBtnV1" type="submit">' + t("cars_add") + '</button></form><p class="cabErrV1" id="cabCarErr" hidden></p>';
    return '<section class="cabBoxV1"><h2>' + ico("car") + t("cars_h") + '</h2><p class="cabMutedV1">' + t("cars_p") + '</p>' + form + '</section>' +
      (S.cars.length ? '<div class="cabCarsV1">' + S.cars.map(function(c){ return carCard(c); }).join("") + '</div>' : '<p class="cabMutedV1 cabPadV1">' + t("cars_e") + '</p>');
  }
  function paneSubs(){
    if(!S.bound) return '<section class="cabBoxV1"><h2>' + ico("bell") + t("subs_h") + '</h2><p class="cabMutedV1">' + t("subs_need") + '</p><button type="button" class="cabBtnV1" data-act="connect">' + t("c_btn") + '</button></section>';
    var rows = S.subs.length ? S.subs.map(function(s){
      var isLot = s.kind === "lot";
      var href = isLot ? lotUrl(s.lot_id) : "/auctions?" + (s.qs || "");
      return '<div class="cabSubV1"><span class="cabSubKindV1">' + (isLot ? t("sub_lot") : t("sub_search")) + '</span><a href="' + esc(href) + '">' + esc(s.name || s.lot_title || s.lot_id || "") + '</a>' +
        '<button type="button" class="cabIcoBtnV1 isDanger" data-act="delsub" data-id="' + esc(s.id) + '" title="' + esc(t("sub_del")) + '">' + ico("trash") + '</button></div>';
    }).join("") : '<p class="cabMutedV1">' + t("subs_e") + '</p>';
    var keys = ["date", "timed", "day", "hour", "buynow", "play", "cars", "digest"];
    var prefs = keys.map(function(k){ var on = S.prefs[k] !== false; return '<label class="cabSwitchV1"><input type="checkbox" data-pref="' + k + '"' + (on ? " checked" : "") + '><i></i><span>' + t("p_" + k) + '</span></label>'; }).join("");
    return '<div class="cabGridV1"><div class="cabColV1"><section class="cabBoxV1"><h2>' + ico("bell") + t("subs_h") + '</h2>' + rows + '</section></div>' +
      '<div class="cabColV1"><section class="cabBoxV1"><h2>' + t("prefs_h") + '</h2><div class="cabPrefsV1">' + prefs + '</div></section></div></div>';
  }
  function paneRecent(){
    if(!S.recent.length) return empty(t("rec_h"), t("rec_e"), t("fav_go"), "/auctions");
    var favIds = {}; S.favs.forEach(function(f){ favIds[f.id] = 1; });
    return '<div class="cabToolbarV1"><h2 class="cabH2V1">' + t("rec_h") + '</h2><button type="button" class="cabGhostV1" data-act="clearrecent">' + t("rec_clear") + '</button></div><div class="cabCardsV1">' +
      S.recent.map(function(r){
        var st = status(merged(r));
        return '<article class="cabCardV1"><a class="cabPicV1" href="' + lotUrl(r.id) + '">' + (img(r) ? '<img src="' + esc(img(r)) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "") + '<span class="cabAucV1">' + esc(aucName(r)) + '</span></a>' +
          '<div class="cabBodyV1"><a class="cabTitleV1" href="' + lotUrl(r.id) + '">' + esc(titleOf(r)) + '</a><div class="cabVinV1">' + esc(r.vin || "") + '</div>' +
          '<div class="cabRowsV1"><div><span>' + t("when") + '</span><b>' + (r.auctionDate && isFinite(Date.parse(r.auctionDate)) ? esc(fmtDate(r.auctionDate)) : esc(t("nodate"))) + '</b></div></div>' +
          '<div class="cabActsV1"><button type="button" class="cabIcoBtnV1' + (favIds[r.id] ? " on" : "") + '" data-act="addfav" data-id="' + esc(r.id) + '">' + ico("heart") + '<span>' + t("add_fav") + '</span></button></div></div></article>';
      }).join("") + '</div>';
  }
  function paneSet(){
    return '<div class="cabGridV1"><div class="cabColV1"><section class="cabBoxV1"><h2>' + ico("tg") + t("set_dev_h") + '</h2><p class="cabMutedV1">' + t("set_dev") + '</p></section></div>' +
      '<div class="cabColV1"><section class="cabBoxV1"><h2>' + t("set_h") + '</h2>' +
      '<div class="cabSetRowV1"><div><b>' + t("set_out") + '</b><small>' + t("set_out_d") + '</small></div><button type="button" class="cabGhostV1" data-act="logout">' + ico("out") + '</button></div>' +
      '<div class="cabSetRowV1"><div><b>' + t("set_wipe") + '</b><small>' + t("set_wipe_d") + '</small></div><button type="button" class="cabGhostV1 isDanger" data-act="wipe">' + ico("trash") + '</button></div></section></div></div>';
  }

  function connectCard(){
    if(S.bound){
      var note = !S.ready ? '<p class="cabWarnV1">' + t("c_notable") + '</p>' : "";
      return '<div class="cabConnV1 isOn"><div class="cabConnHeadV1"><span class="cabDotV1"></span><b>' + t("c_on_h") + '</b></div><p>' + t("c_on_p") + '</p>' + note +
        (S.url ? '<a class="cabBtnV1 isLight" href="' + esc(S.url) + '" target="_blank" rel="noopener">' + t("c_bot") + '</a>' : "") + '</div>';
    }
    if(S.connecting){
      return '<div class="cabConnV1"><div class="cabConnHeadV1"><span class="cabSpinV1"></span><b>' + t("c_wait_h") + '</b></div><p>' + t("c_wait_p") + '</p>' +
        (S.url ? '<a class="cabBtnV1" href="' + esc(S.url) + '" target="_blank" rel="noopener">' + ico("tg") + ' ' + t("c_open") + '</a>' : "") + '</div>';
    }
    return '<div class="cabConnV1"><div class="cabConnHeadV1">' + ico("tg") + '<b>' + t("c_off_h") + '</b></div><p>' + t("c_off_p") + '</p>' +
      '<ul><li>' + t("c_b1") + '</li><li>' + t("c_b2") + '</li><li>' + t("c_b3") + '</li></ul>' +
      '<button type="button" class="cabBtnV1" data-act="connect">' + t("c_btn") + '</button><small>' + t("c_local") + '</small></div>';
  }

  function render(soft){
    // мягкое обновление не трогает поля ввода в фокусе (заметки, VIN)
    var ae = document.activeElement;
    if(soft && ae && root.contains(ae) && /^(TEXTAREA|INPUT|SELECT)$/.test(ae.tagName)) return;
    var favs = S.favs.map(merged);
    var soonN = favs.filter(function(o){ var s = status(o); return s.k === "soon" || s.k === "live"; }).length;
    var stats = [[ico("heart"), S.favs.length, "s_fav", "fav"], [ico("clock"), soonN, "s_soon", "fav"], [ico("car"), S.cars.length, "s_cars", "cars"], [ico("bell"), S.subs.length, "s_subs", "subs"]];
    var tabs = [["over", "t_over", ""], ["deals", "t_deals", S.deals && S.deals.list.length ? S.deals.list.length : ""], ["fav", "t_fav", S.favs.length], ["cars", "t_cars", S.cars.length], ["subs", "t_subs", S.subs.length || ""], ["recent", "t_recent", S.recent.length || ""], ["set", "t_set", ""]];
    var pane = S.tab === "deals" ? paneDeals() : S.tab === "fav" ? paneFav() : S.tab === "cars" ? paneCars() : S.tab === "subs" ? paneSubs() : S.tab === "recent" ? paneRecent() : S.tab === "set" ? paneSet() : paneOver();
    root.innerHTML =
      '<section class="cabHeroV1"><div class="cabHeroTxtV1"><span class="cabKickerV1">' + t("hero_k") + '</span><h1>' + (S.bound && S.name ? esc(t("hello") + S.name) + "! " : "") + t("hero_h") + '</h1><p>' + t("hero_p") + '</p></div>' + connectCard() + '</section>' +
      '<div class="cabStatsV1">' + stats.map(function(s){ return '<button type="button" class="cabStatV1" data-act="tab" data-v="' + s[3] + '"><span class="cabStatIcoV1">' + s[0] + '</span><b>' + s[1] + '</b><small>' + t(s[2]) + '</small></button>'; }).join("") + '</div>' +
      '<nav class="cabTabsV1" role="tablist">' + tabs.map(function(x){ return '<button type="button" role="tab" aria-selected="' + (S.tab === x[0]) + '" class="' + (S.tab === x[0] ? "on" : "") + '" data-act="tab" data-v="' + x[0] + '">' + t(x[1]) + (x[2] !== "" && x[2] !== 0 ? ' <em>' + x[2] + '</em>' : "") + '</button>'; }).join("") + '</nav>' +
      '<div class="cabPaneV1" role="tabpanel">' + pane + '</div>' + (S.tab === "fav" ? cmpBar() : "") + (S.cmpOpen ? cmpModal() : "") + '<div class="cabToastV1" id="cabToast" role="status" aria-live="polite"></div>';
    scrollSteppers();
  }



  // ---------- экспорт избранного ----------
  function favRows(){ return S.favs.map(function(f){ var o = merged(f), ca = isCa(o); return {
    id:o.id, title:titleOf(o), vin:o.vin || "", auction:aucName(o), date:o.auctionDate || "", bid:Number(o.currentBid) || "", buy:Number(o.buyNow) || "",
    odo:o.odometerText || "", dmg:o.primaryDamage || "", cur:ca ? "CAD" : "USD", url:location.origin + lotUrl(o.id), note:(S.notes[o.id] && S.notes[o.id].text) || ""
  }; }); }
  function expCsv(){
    var rows = favRows(), cols = ["id","title","vin","auction","date","bid","buy","cur","odo","dmg","note","url"];
    var q = function(v){ v = String(v == null ? "" : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = "\ufeff" + cols.join(",") + "\n" + rows.map(function(r){ return cols.map(function(c){ return q(r[c]); }).join(","); }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"})); a.download = "apex-auto-favourites.csv";
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function expCopy(){
    var txt = favRows().map(function(r, i){ return (i + 1) + ". " + r.title + (r.vin ? " · " + r.vin : "") + (r.bid ? " · " + money(r.bid, r.cur === "CAD") : "") + (r.date ? " · " + fmtDate(r.date) : "") + "\n" + r.url; }).join("\n\n");
    var done = function(){ toast(t("exp_ok")); };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done); else done();
  }

  // ---------- сравнение лотов ----------
  function cmpIds(){ return Object.keys(S.cmp).filter(function(k){ return S.cmp[k]; }); }
  function cmpBar(){
    var n = cmpIds().length; if(!n) return "";
    return '<div class="cabCmpBarV1"><span>' + t("cmp_n") + ': <b>' + n + '</b></span><button type="button" class="cabBtnV1" data-act="cmpopen">' + t("cmp_go") + '</button><button type="button" class="cabGhostV1" data-act="cmpclear">' + t("cmp_close") + '</button></div>';
  }
  function num(v){ var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.]/g, "")); return isFinite(n) ? n : null; }
  function cmpModal(){
    var ids = cmpIds(), lots = ids.map(function(id){ return merged(findFav(id) || {id:id}); });
    var rowsDef = [
      ["cf_year", function(o){ return o.year || ""; }, "min-year"],
      ["cf_odo", function(o){ return o.odometerText || ""; }, "min", function(o){ return num(o.odometerText); }],
      ["cf_bid", function(o){ return Number(o.currentBid) > 0 ? money(o.currentBid, isCa(o)) : ""; }, "min", function(o){ return Number(o.currentBid) > 0 ? Number(o.currentBid) : null; }],
      ["cf_buy", function(o){ return Number(o.buyNow) > 0 ? money(o.buyNow, isCa(o)) : ""; }, "min", function(o){ return Number(o.buyNow) > 0 ? Number(o.buyNow) : null; }],
      ["cf_acv", function(o){ return Number(o.estimatedRetailValue) > 0 ? money(o.estimatedRetailValue, isCa(o)) : ""; }, "max", function(o){ return Number(o.estimatedRetailValue) || null; }],
      ["cf_rep", function(o){ return Number(o.repairCost) > 0 ? money(o.repairCost, isCa(o)) : ""; }, "min", function(o){ return Number(o.repairCost) > 0 ? Number(o.repairCost) : null; }],
      ["cf_dmg", function(o){ return [o.primaryDamage, o.secondaryDamage].filter(Boolean).join(" / "); }],
      ["cf_doc", function(o){ return o.document || ""; }],
      ["cf_eng", function(o){ return o.engine || ""; }],
      ["cf_fuel", function(o){ return o.fuel || ""; }],
      ["cf_drv", function(o){ return o.drive || ""; }],
      ["cf_key", function(o){ return o.keys || ""; }],
      ["cf_loc", function(o){ return o.location || ""; }],
      ["cf_date", function(o){ return o.auctionDate && isFinite(Date.parse(o.auctionDate)) ? fmtDate(o.auctionDate) : t("nodate"); }]
    ];
    var head = '<tr><th></th>' + lots.map(function(o){
      return '<th><a href="' + lotUrl(o.id) + '">' + (img(o) ? '<img src="' + esc(img(o)) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : "") + '<b>' + esc(titleOf(o)) + '</b></a></th>';
    }).join("") + '</tr>';
    var body = rowsDef.map(function(r){
      var vals = lots.map(r[1]);
      if(!vals.some(function(v){ return v !== "" && v != null; })) return "";
      var best = -1;
      if(r[3] && lots.length > 1){
        var nums = lots.map(r[3]), pick = null;
        nums.forEach(function(n, i){ if(n == null) return; if(pick == null || (r[2] === "max" ? n > nums[pick] : n < nums[pick])) pick = i; });
        if(pick != null && nums.filter(function(n){ return n != null; }).length > 1) best = pick;
      }
      return '<tr><td>' + t(r[0]) + '</td>' + vals.map(function(v, i){ return '<td' + (i === best ? ' class="best" title="' + esc(t("cf_best")) + '"' : "") + '>' + (v === "" || v == null ? "—" : esc(v)) + '</td>'; }).join("") + '</tr>';
    }).join("");
    return '<div class="cabModalV1" data-act="cmpclose"><div class="cabModalCardV1" role="dialog" aria-modal="true" aria-label="' + esc(t("cmp_h")) + '"><div class="cabModalHeadV1"><h2>' + t("cmp_h") + '</h2><button type="button" class="cabGhostV1" data-act="cmpclose">' + t("cmp_close") + ' ✕</button></div><div class="cabModalScrollV1"><table class="cabCmpTblV1">' + head + body + '</table></div></div></div>';
  }

  function scrollSteppers(){ $$(".cabStepperV1").forEach(function(el){ var c = el.querySelector("li.current"); if(c) el.scrollLeft = Math.max(0, c.offsetLeft - el.clientWidth / 2 + c.clientWidth / 2); }); }

  // ---------- действия ----------
  function setTab(v){
    if(["over", "deals", "fav", "cars", "subs", "recent", "set"].indexOf(v) < 0) v = "over";
    S.tab = v;
    try{ history.replaceState(null, "", "#" + v); }catch(e){}
    render();
    if(v === "cars") refreshTracks();
    if(v === "deals") loadDeals();
    if(v === "fav") refreshLive();
  }
  function findFav(id){ return S.favs.filter(function(f){ return f.id === id; })[0]; }
  function unfav(id){
    S.favs = S.favs.filter(function(f){ return f.id !== id; }); saveFavs();
    if(cab()) cab().del("fav", id);
    render();
  }
  function addFav(id){
    var r = S.recent.filter(function(x){ return x.id === id; })[0]; if(!r || findFav(id)) return;
    var o = Object.assign({}, r); delete o.viewedAt;
    S.favs.unshift(o); saveFavs();
    if(cab()) cab().put("fav", id, o);
    toast(t("done")); render();
  }
  var noteTimers = {};
  function saveNote(id, text){
    clearTimeout(noteTimers[id]);
    noteTimers[id] = setTimeout(function(){
      text = String(text || "").trim();
      var m = jget(K.note, {});
      if(text){ m[id] = {text:text.slice(0, 2000), updatedAt:Date.now()}; if(cab()) cab().put("note", id, m[id]); }
      else{ delete m[id]; if(cab()) cab().del("note", id); }
      lsSet(K.note, JSON.stringify(m)); S.notes = m;
      var card = root.querySelector('[data-id="' + id + '"] .cabSavedV1'); if(card){ card.classList.add("on"); setTimeout(function(){ card.classList.remove("on"); }, 1400); }
    }, 600);
  }
  function followLot(id){
    if(!S.bound){ toast(t("subs_need")); return; }
    var f = findFav(id) || {}, followed = S.subs.some(function(s){ return s.kind === "lot" && s.lot_id === id; });
    var p = followed ? api("alertdellot", {token:token(), lot_id:id}) : api("alertsub", {token:token(), kind:"lot", lots:[{id:id, title:titleOf(f), vin:f.vin || "", saleDate:f.auctionDate || ""}]});
    p.then(function(r){ if(r && r.ok === false && r.error === "limit") toast("Limit"); return refreshStatus(); }).then(function(){ render(); });
  }
  function addCar(raw){
    var err = $("#cabCarErr"); function fail(m){ if(err){ err.textContent = m; err.hidden = false; } }
    if(err) err.hidden = true;
    var v = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
    var isVin = /^[A-HJ-NPR-Z0-9]{17}$/.test(v), isLot = /^\d{6,9}$/.test(v);
    if(!isVin && !isLot) return fail(t("cars_bad"));
    var btn = $('[data-form="car"] button'); if(btn) btn.disabled = true;
    var req = isVin ? trackFetch(v) : fetch("/api/w8-tracking?lot=" + encodeURIComponent(v)).then(function(r){ return r.json(); }).catch(function(){ return null; });
    Promise.resolve(req).then(function(d){
      if(btn) btn.disabled = false;
      if(!d || d.error) return fail(t("cars_nf"));
      var vin = isVin ? v : String(d.vin || "").toUpperCase();
      if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return fail(t("cars_nf"));
      if(S.cars.some(function(c){ return c.vin === vin; })) return fail(t("cars_dup"));
      var car = {vin:vin, label:String(d.vehicle || "").slice(0, 80), addedAt:Date.now()};
      var done = function(){ S.cars.unshift(car); saveCars(); S.track[vin] = d; if(cab()) cab().put("car", vin, {label:car.label, addedAt:car.addedAt}); render(); };
      done();
    });
  }
  function delCar(vin){
    S.cars = S.cars.filter(function(c){ return c.vin !== vin; }); saveCars();
    if(cab()) cab().del("car", vin);
    render();
  }

  document.addEventListener("apex-cab-pulled", function(){ setTimeout(function(){ loadLocal(); loadBands(); }, 50); });
  root.addEventListener("click", function(e){
    var b = e.target.closest("[data-act]"); if(!b || !root.contains(b)) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
    if(act === "tab"){ e.preventDefault(); return setTab(b.getAttribute("data-v")); }
    if(act === "connect") return startConnect();
    if(act === "dealverify"){ startDealPoll(); setTimeout(function(){ render(true); }, 50); return; }
    if(act === "cmpt"){
      if(S.cmp[id]) delete S.cmp[id];
      else if(cmpIds().length >= 4){ toast(t("cmp_max")); return; }
      else S.cmp[id] = 1;
      return render();
    }
    if(act === "cmpopen"){ if(cmpIds().length < 2){ toast(t("cmp_min")); return; } S.cmpOpen = true; document.body.style.overflow = "hidden"; return render(); }
    if(act === "cmpclose"){ if(e.target.closest(".cabModalCardV1") && !b.matches("button")) return; S.cmpOpen = false; document.body.style.overflow = ""; return render(); }
    if(act === "expcsv") return expCsv();
    if(act === "expcopy") return expCopy();
    if(act === "cmpclear"){ S.cmp = {}; return render(); }
    if(act === "feedclear"){ S.feed = []; lsSet(K.feed, "[]"); return render(); }
    if(act === "ffilter"){ S.favFilter = b.getAttribute("data-v"); return render(); }
    if(act === "unfav") return unfav(id);
    if(act === "addfav") return addFav(id);
    if(act === "follow") return followLot(id);
    if(act === "notetoggle"){ var n = root.querySelector('[data-id="' + id + '"] .cabNoteV1'); if(n){ n.hidden = !n.hidden; var ta = n.querySelector("textarea"); if(!n.hidden && ta) ta.focus(); } return; }
    if(act === "delcar") return delCar(b.getAttribute("data-vin"));
    if(act === "delsub"){ api("alertdel", {token:token(), id:Number(id)}).then(refreshStatus).then(function(){ render(); }); return; }
    if(act === "clearrecent"){
      var ids = S.recent.map(function(r){ return r.id; }); S.recent = []; lsSet(K.rec, "[]");
      if(cab()) ids.slice(0, 60).forEach(function(i){ cab().del("view", i); });
      return render();
    }
    if(act === "logout"){ if(!confirm(t("confirm_out"))) return; if(cab()) cab().logout(); ["apexFavsV1", "apexNotesV1", "apexRecentV1"].forEach(function(k){ try{ localStorage.removeItem(k); }catch(e){} }); location.reload(); return; }
    if(act === "wipe"){
      if(!confirm(t("confirm_wipe"))) return;
      var tk = token(), p = tk ? api("cabwipe", {token:tk}) : Promise.resolve();
      Promise.resolve(p).then(function(){ if(cab()) cab().logout(); ["apexFavsV1", "apexNotesV1", "apexRecentV1"].forEach(function(k){ try{ localStorage.removeItem(k); }catch(e){} }); location.reload(); });
    }
  });
  root.addEventListener("change", function(e){
    var el = e.target;
    if(el.matches('[data-act="fsort"]')){ S.favSort = el.value; return render(); }
    if(el.matches("[data-pref]")){
      var prefs = {}; $$("[data-pref]").forEach(function(c){ prefs[c.getAttribute("data-pref")] = c.checked; });
      S.prefs = prefs; api("alertprefs", {token:token(), prefs:prefs}).then(function(){ toast(t("saved")); });
    }
  });
  root.addEventListener("input", function(e){ var el = e.target; if(el.matches("textarea[data-note]")) saveNote(el.getAttribute("data-note"), el.value); });
  root.addEventListener("submit", function(e){
    var f = e.target.closest("[data-form]"); if(!f) return;
    e.preventDefault();
    if(f.getAttribute("data-form") === "car") addCar(f.elements.v.value);
  });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape" && S.cmpOpen){ S.cmpOpen = false; document.body.style.overflow = ""; render(); } });
  window.addEventListener("hashchange", function(){ var h = location.hash.replace("#", ""); if(h && h !== S.tab) setTab(h); });
  document.addEventListener("visibilitychange", function(){ if(!document.hidden && S.booted){ refreshLive(); } });

  // ---------- старт ----------
  function boot(){
    var h = location.hash.replace("#", ""); if(["over", "deals", "fav", "cars", "subs", "recent", "set"].indexOf(h) >= 0) S.tab = h;
    loadLocal(); render();
    var c = cab(), p = Promise.resolve();
    if(token()){
      p = refreshStatus().then(function(){
        if(S.bound && c) return c.pull(true).then(function(r){
          if(r && r.ready === false) S.ready = false;
          if(r && r.name){ lsSet(K.name, r.name); }
          if(r && r.items && r.items.car){
            var cars = r.items.car.map(function(it){ return {vin:it.key, label:(it.data && it.data.label) || "", addedAt:(it.data && it.data.addedAt) || it.t}; });
            lsSet(K.cars, JSON.stringify(cars));
          }
        });
      });
    }
    p.then(function(){ loadLocal(); S.booted = true; render(); refreshLive(); refreshTracks(); loadDeals(); loadBands(); });
  }
  boot();
})();
