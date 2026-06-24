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
    const params = new URLSearchParams(window.location.search);
    const queryLang = normalizeLang(params.get("lang"));
    if(queryLang) return queryLang;

    const savedLang = normalizeLang(localStorage.getItem(STORAGE_KEY));
    if(savedLang) return savedLang;

    const browserLangs = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for(const item of browserLangs){
      const lang = normalizeLang(item);
      if(lang) return lang;
    }
    return DEFAULT_LANG;
  }

  const dict = {
    ro:{
      "Меня вы можете знать как":"Mă puteți cunoaște și ca",
      "Подбор и проверка лота":"Selecția și verificarea lotului",
      "Участие в торгах":"Participare la licitație",
      "Документы, доставка и сопровождение":"Acte, transport și asistență",
      "Экспортные документы":"Acte de export",
      "Страховка":"Asigurare",
      "Рассчитайте полную стоимость автомобиля до Кишинева":"Calculează costul complet al mașinii până la Chișinău",
      "Рассчитайте полную стоимость автомобиля до Кишинёва":"Calculează costul complet al mașinii până la Chișinău",
      "Контакты — Apex Auto | Telegram, WhatsApp, телефон":"Contacte — Apex Auto | Telegram, WhatsApp, telefon",
      "КОНТАКТЫ":"CONTACTE",
      "Напишите, и я помогу понять реальную стоимость автомобиля под ключ":"Scrieți-mi și vă ajut să înțelegeți costul real al mașinii la cheie",
      "Быстрее всего отвечаю в Telegram. Можно отправить ссылку на лот, VIN, номер аукциона или просто написать, какой автомобиль ищете и какой бюджет комфортен.":"Cel mai rapid răspund pe Telegram. Puteți trimite linkul lotului, VIN-ul, numărul licitației sau pur și simplu scrieți ce mașină căutați și ce buget vă convine.",
      "Apex Auto, доставка авто из США и Канады в Молдову":"Apex Auto, livrare auto din SUA și Canada în Moldova",
      "Фото и видео авто с аукционов":"Foto și video cu mașini de la licitații",
      "Короткие обзоры и сделки":"Recenzii scurte și tranzacții",
      "Новости и примеры покупок":"Noutăți și exemple de achiziții",
      "АДРЕС":"ADRESĂ",
      "Кишинёв, Bucovina 9F":"Chișinău, Bucovina 9F",
      "Приезд по предварительной договорённости — напишите в Telegram, и мы согласуем удобное время.":"Vizita are loc cu programare prealabilă — scrieți pe Telegram și stabilim o oră convenabilă.",
      "Открыть в Яндекс.Картах":"Deschide în Yandex.Maps",
      "ссылку на Copart, IAAI или Manheim;":"linkul de pe Copart, IAAI sau Manheim;",
      "VIN, номер лота или скрин автомобиля;":"VIN, numărul lotului sau o captură a mașinii;",
      "модель, год, тип топлива и желаемый бюджет;":"modelul, anul, tipul de combustibil și bugetul dorit;",
      "город, где хотите получить автомобиль.":"orașul în care doriți să primiți mașina.",
      "Горячие предложения — выгодные авто под ключ | Apex Auto":"Oferte recomandate — mașini avantajoase la cheie | Apex Auto",
      "Собрали модели, которые часто имеют хорошую разницу между стоимостью под ключ и рынком Молдовы. Цены указаны как ориентир: финальный расчет зависит от конкретного лота, документов, повреждений и даты покупки.":"Am adunat modele care au adesea o diferență bună între prețul la cheie și piața din Moldova. Prețurile sunt orientative: calculul final depinde de lotul concret, acte, avarii și data cumpărării.",
      "Публикуем интересные лоты, реальные цены покупки и ориентировочную стоимость под ключ.":"Publicăm loturi interesante, prețuri reale de achiziție și costul orientativ la cheie.",
      "Компактная BMW с гибридной установкой. Хороший вариант, если нужен приятный расход и нормальная динамика.":"BMW compact cu sistem hibrid. O variantă bună dacă vă doriți un consum plăcut și o dinamică normală.",
      "от $12,500":"de la $12,500",
      "от $16,500":"de la $16,500",
      "Комфортный бизнес-класс с умеренной таможней. Часто можно найти живой страховой лот.":"Clasă business confortabilă, cu vamă moderată. Adesea se găsește un lot de asigurare în stare bună.",
      "от $21,000":"de la $21,000",
      "от $5,000":"de la $5,000",
      "3.0 бензин":"3.0 benzină",
      "Спортивная M-серия, где особенно важна проверка истории, геометрии и качества повреждений.":"Serie M sportivă, unde verificarea istoricului, geometriei și calității avariilor este deosebit de importantă.",
      "от $55,000":"de la $55,000",
      "от $68,000":"de la $68,000",
      "от $13,000":"de la $13,000",
      "Один из самых интересных премиальных SUV. Хорошая комплектация и выгодная таможня для PHEV.":"Unul dintre cele mai interesante SUV-uri premium. Dotare bună și vamă avantajoasă pentru PHEV.",
      "от $34,000":"de la $34,000",
      "от $45,000":"de la $45,000",
      "от $11,000":"de la $11,000",
      "Свежий гибрид с надежной базой. Отлично подходит для ежедневной езды и дальнейшей продажи.":"Hibrid recent cu o bază fiabilă. Ideal pentru condusul zilnic și revânzare.",
      "Практичный кроссовер с хорошей ликвидностью. Важно выбирать лот без сложных ударов по подвеске.":"Crossover practic, cu lichiditate bună. Important e să alegeți un lot fără lovituri grave la suspensie.",
      "от $23,000":"de la $23,000",
      "от $31,000":"de la $31,000",
      "от $8,000":"de la $8,000",
      "Бюджетный гибрид с доступными запчастями. Хороший вариант для спокойной ежедневной езды.":"Hibrid accesibil, cu piese ieftine. O variantă bună pentru un condus zilnic liniștit.",
      "от $10,500":"de la $10,500",
      "от $14,500":"de la $14,500",
      "Комфортный седан на базе Fusion, но с более приятной отделкой и богатой комплектацией.":"Sedan confortabil pe baza Fusion, dar cu finisaje mai plăcute și dotare bogată.",
      "от $11,500":"de la $11,500",
      "от $4,500":"de la $4,500",
      "Один из самых надежных гибридов. Часто интересен по расходу, ликвидности и стоимости владения.":"Unul dintre cei mai fiabili hibrizi. Adesea atractiv prin consum, lichiditate și cost de utilizare.",
      "от $12,000":"de la $12,000",
      "от $17,000":"de la $17,000",
      "Популярный электрокроссовер. Обязательно проверяем батарею, историю и характер повреждений.":"Crossover electric popular. Verificăm obligatoriu bateria, istoricul și tipul avariilor.",
      "Премиальная Tesla с высокой ценой ремонта. Здесь особенно важна проверка батареи и кузова.":"Tesla premium, cu cost de reparație ridicat. Aici verificarea bateriei și a caroseriei e deosebit de importantă.",
      "от $28,000":"de la $28,000",
      "Практичный семейный SUV. Хороший вариант, если нужен свежий год и понятный ремонт.":"SUV familial practic. O variantă bună dacă vă doriți un an recent și o reparație clară.",
      "от $18,500":"de la $18,500",
      "от $6,500":"de la $6,500",
      "Перед покупкой мы проверяем VIN, историю, документы, продавца, повреждения и логистику. Так клиент заранее понимает, стоит ли бороться за конкретный автомобиль.":"Înainte de cumpărare verificăm VIN-ul, istoricul, actele, vânzătorul, avariile și logistica. Astfel clientul înțelege din timp dacă merită să liciteze pentru o anumită mașină.",
      "Моя история — Федор Чебан, основатель Apex Auto":"Povestea mea — Fedor Ceban, fondatorul Apex Auto",
      "МОЯ ИСТОРИЯ":"POVESTEA MEA",
      "Меня зовут Федор Чебан. Я создал Apex Auto, чтобы клиенты могли покупать автомобили из США и Канады спокойно, прозрачно и с пониманием каждого этапа.":"Mă numesc Fedor Ceban. Am creat Apex Auto pentru ca clienții să poată cumpăra mașini din SUA și Canada liniștit, transparent și înțelegând fiecare etapă.",
      "Автомобили стали частью моей жизни еще в 2013 году. Мне всегда было интересно не просто ездить на машинах, а понимать, как они устроены, как оцениваются повреждения, как формируется стоимость и почему одни автомобили стоят своих денег, а другие лучше обходить стороной.":"Mașinile au devenit parte din viața mea încă din 2013. Mereu m-a interesat nu doar să conduc, ci să înțeleg cum sunt construite, cum se evaluează avariile, cum se formează prețul și de ce unele mașini își merită banii, iar pe altele e mai bine să le ocolești.",
      "В 2016 году я начал работать в компании, которая занималась автомобилями и запчастями из США. Начинал менеджером, позже стал старшим менеджером и участвовал практически во всех процессах: общение с клиентами, подбор запчастей, работа с каталогами, схемами, складами, логистикой и отгрузками.":"În 2016 am început să lucrez într-o companie care se ocupa de mașini și piese din SUA. Am început ca manager, apoi am devenit manager senior și am participat la aproape toate procesele: comunicarea cu clienții, selecția pieselor, lucrul cu cataloage, scheme, depozite, logistică și expedieri.",
      "В 2017 году я заказал свой первый автомобиль из США — Volkswagen Passat. После продажи я понял, насколько интересным и выгодным может быть этот рынок. Потом был Volkswagen Tiguan, затем другие автомобили. С каждой покупкой я всё больше убеждался, что автомобили из США и Канады позволяют получить больше автомобиля за те же деньги.":"În 2017 am comandat prima mea mașină din SUA — un Volkswagen Passat. După vânzare am înțeles cât de interesantă și avantajoasă poate fi această piață. A urmat un Volkswagen Tiguan, apoi alte mașini. Cu fiecare achiziție mă convingeam tot mai mult că mașinile din SUA și Canada îți oferă mai multă mașină pentru aceiași bani.",
      "Со временем работа привела меня напрямую к аукционам. Я покупал автомобили для разборки, среди них были машины после ДТП, наводнений и штормов. Именно там появился опыт, который невозможно получить из роликов или статей в интернете.":"Cu timpul, munca m-a dus direct la licitații. Cumpăram mașini pentru dezmembrare, printre care erau mașini după accidente, inundații și furtuni. Acolo s-a format experiența care nu poate fi obținută din videoclipuri sau articole de pe internet.",
      "Через мои руки прошли десятки собственных автомобилей с разными повреждениями. Были и топляки, которые многие отправили бы только на разборку. Но благодаря опыту работы с электрикой, каталогами, проводкой и блоками мне удавалось восстанавливать такие машины до отличного состояния. Эти автомобили были успешно проданы и продолжают ездить без проблем.":"Prin mâinile mele au trecut zeci de mașini proprii cu diferite avarii. Au fost și mașini inundate, pe care mulți le-ar fi trimis doar la dezmembrare. Dar datorită experienței cu electrica, cataloagele, cablajele și calculatoarele, reușeam să le readuc într-o stare excelentă. Aceste mașini au fost vândute cu succes și circulă fără probleme.",
      "Отдельный опыт мне дали BMW M-серии последних поколений. Их ремонт стоит недешево, но благодаря работе с каталогами и поставщиками я понимаю, когда машину лучше собирать на новых оригинальных деталях, а когда разумнее использовать качественные б/у запчасти. Иногда новая оригинальная деталь оказывается доступнее, чем бывшая в употреблении, но об этом знают далеко не все.":"O experiență aparte mi-au oferit-o modelele BMW seria M din ultimele generații. Reparația lor nu e ieftină, dar datorită lucrului cu cataloage și furnizori știu când e mai bine să asamblez mașina cu piese noi originale și când e mai rezonabil să folosesc piese second-hand de calitate. Uneori o piesă nouă originală este mai accesibilă decât una uzată, dar nu toți știu asta.",
      "Я работаю не только с Copart и IAAI, но и с Manheim. Многие считают, что дилерский аукцион — это всегда безопасная покупка. На практике там тоже хватает «котов в мешке»: скрытые проблемы, некачественный ремонт, технические нюансы и автомобили, которые выглядят лучше, чем есть на самом деле. Для меня это не проблема, потому что опыт позволяет отличать хороший вариант от рискованного.":"Lucrez nu doar cu Copart și IAAI, ci și cu Manheim. Mulți cred că o licitație de dealeri înseamnă mereu o achiziție sigură. În practică, și acolo sunt destule surprize: probleme ascunse, reparații de slabă calitate, nuanțe tehnice și mașini care arată mai bine decât sunt în realitate. Pentru mine nu e o problemă, fiindcă experiența îmi permite să deosebesc o variantă bună de una riscantă.",
      "Я знаю, как работает логистика на аукционе, доставка по США, погрузка и выгрузка контейнеров, морская перевозка и выдача автомобиля клиенту. Именно этот полный путь — от выбора машины до результата в руках клиента — дает мне энергию и движет мной каждый день.":"Știu cum funcționează logistica la licitație, transportul în SUA, încărcarea și descărcarea containerelor, transportul maritim și predarea mașinii către client. Tocmai acest drum complet — de la alegerea mașinii până la rezultatul în mâinile clientului — îmi dă energie și mă motivează în fiecare zi.",
      "В 2026 году я создал Apex Auto. Для меня важно не просто купить автомобиль и закрыть сделку. Важно подобрать машину, которую я бы сам рекомендовал своим друзьям или близким. Машину, которой клиент будет доволен не только в день получения, но и спустя годы.":"În 2026 am creat Apex Auto. Pentru mine e important nu doar să cumpăr o mașină și să închei tranzacția. E important să aleg o mașină pe care aș recomanda-o prietenilor sau celor apropiați. O mașină de care clientul să fie mulțumit nu doar în ziua primirii, ci și peste ani.",
      "Потому что автомобиль мечты начинается не с аукциона. Он начинается с доверия.":"Pentru că mașina de vis nu începe de la licitație. Începe de la încredere.",
      "подбор, проверка, покупка, доставка и сопровождение":"selecție, verificare, cumpărare, transport și asistență",
      "Apex Auto — авто из США и Канады под ключ в Молдову":"Apex Auto — auto din SUA și Canada la cheie în Moldova",
      "Аукционы":"Licitații",
      "Apex Auto · в авто-бизнесе с 2016 года":"Apex Auto · în auto-business din 2016",
      "Рассчитать стоимость":"Calculează costul",
      "Бесплатный Carfax":"Carfax gratuit",
      "Расчёт до ставки":"Calcul înainte de licitație",
      "Под ключ до Кишинёва":"La cheie până la Chișinău",
      "с 2016 года":"din 2016",
      "в авто-бизнесе":"în auto-business",
      "подбор · торги · доставка · таможня":"selecție · licitație · transport · vamă",
      "аукционы США и Канады":"licitații din SUA și Canada",
      "Проверьте тип гибрида":"Verificați tipul de hibrid",
      "Обычный Hybrid и Plug-in Hybrid считаются по-разному. Если авто заряжается от розетки или в названии есть PHEV / Plug-in, выберите Plug-in.":"Hibridul obișnuit și Plug-in Hybrid se calculează diferit. Dacă mașina se încarcă de la priză sau are PHEV / Plug-in în denumire, alegeți Plug-in.",
      "Обычный гибрид":"Hibrid obișnuit",
      "Все автомобили страхуем при морской перевозке —":"Asigurăm toate mașinile pe timpul transportului maritim —",
      "1% от стоимости лота":"1% din valoarea lotului",
      ". Страховка включена в расчёт по умолчанию и защищает авто при повреждениях, воде и спорных ситуациях.":". Asigurarea este inclusă în calcul în mod implicit și protejează mașina în caz de avarii, apă și situații litigioase.",
      "Опасный груз":"Marfă periculoasă",
      "Многие автомобили из США и Канады можно привезти дешевле аналогичных предложений на рынке Молдовы даже с учетом доставки, таможенных платежей и обязательных расходов.":"Multe mașini din SUA și Canada pot fi aduse mai ieftin decât ofertele similare de pe piața din Moldova, chiar și cu transportul, taxele vamale și cheltuielile obligatorii.",
      "Именно поэтому клиенты выбирают аукционы Copart, IAAI и Manheim: там часто можно найти более свежий год, лучшую комплектацию и заметную экономию по сравнению с местным рынком.":"De aceea clienții aleg licitațiile Copart, IAAI și Manheim: acolo se găsesc adesea un an mai nou, o dotare mai bună și economii vizibile față de piața locală.",
      "Калькулятор помогает заранее оценить ориентировочную стоимость автомобиля под ключ до Кишинёва. Возможные расходы на обслуживание или восстановление рассчитываются отдельно после проверки конкретного автомобиля.":"Calculatorul ajută să estimați din timp costul orientativ al mașinii la cheie până la Chișinău. Eventualele cheltuieli de întreținere sau reparație se calculează separat, după verificarea mașinii concrete.",
      "Пример экономии":"Exemplu de economie",
      "Рынок Молдовы":"Piața din Moldova",
      "от $24 000":"de la $24 000",
      "Под ключ Apex Auto":"La cheie Apex Auto",
      "от $18 000":"de la $18 000",
      "средняя экономия на одном авто":"economie medie la o mașină",
      "Рассчитать мой вариант":"Calculează varianta mea",
      "Как мы работаем":"Cum lucrăm",
      "От заявки до ключей в Кишинёве — 6 шагов":"De la cerere până la chei la Chișinău — 6 pași",
      "Вы понимаете каждый этап заранее: что происходит, сколько стоит и в какие сроки.":"Înțelegeți fiecare etapă din timp: ce se întâmplă, cât costă și în ce termene.",
      "Заявка и консультация":"Cerere și consultație",
      "Обсуждаем бюджет, цели и подходящие модели.":"Discutăm bugetul, obiectivele și modelele potrivite.",
      "Подбор автомобиля":"Selecția mașinii",
      "Находим лоты на Copart, IAAI и Manheim под ваш запрос.":"Găsim loturi pe Copart, IAAI și Manheim conform cererii dvs.",
      "Проверка до ставки":"Verificare înainte de licitație",
      "VIN, Carfax, история, повреждения и документы — до покупки.":"VIN, Carfax, istoric, avarii și acte — înainte de cumpărare.",
      "Торги и покупка":"Licitație și cumpărare",
      "Участвуем в аукционе по согласованному лимиту.":"Participăm la licitație în limita stabilită.",
      "Доставка":"Transport",
      "США / Канада → порт → море → транзит через ЕС.":"SUA / Canada → port → mare → tranzit prin UE.",
      "Таможня и выдача":"Vamă și predare",
      "Растаможка и передача автомобиля в Кишинёве.":"Vămuire și predarea mașinii la Chișinău.",
      "Доставка морем под ключ":"Transport maritim la cheie",
      "США и Канада → порт → море → Кишинёв":"SUA și Canada → port → mare → Chișinău",
      "Берём на себя весь путь автомобиля: внутренняя перевозка к порту, морская доставка, транзит через ЕС и растаможка в Кишинёве. Вы видите статус на каждом этапе.":"Ne ocupăm de tot drumul mașinii: transportul intern până la port, livrarea maritimă, tranzitul prin UE și vămuirea la Chișinău. Vedeți statusul la fiecare etapă.",
      "6–10 недель":"6–10 săptămâni",
      "средний срок доставки":"termen mediu de livrare",
      "Страховка груза":"Asigurarea mărfii",
      "защита авто в пути":"protecția mașinii pe drum",
      "Отслеживание":"Urmărire",
      "статус на каждом этапе":"status la fiecare etapă",
      "Почему Apex Auto":"De ce Apex Auto",
      "Почему клиенты выбирают нас":"De ce ne aleg clienții",
      "Опыт с 2016 года":"Experiență din 2016",
      "Реальная ежедневная практика на аукционах США и Канады, а не теория из роликов.":"Practică reală, zilnică la licitațiile din SUA și Canada, nu teorie din videoclipuri.",
      "Бесплатная проверка Carfax":"Verificare Carfax gratuită",
      "История, пробег, аварии и документы проверяем до покупки, а не после.":"Verificăm istoricul, kilometrajul, avariile și actele înainte de cumpărare, nu după.",
      "Вы видите цену под ключ до Кишинёва заранее — без скрытых расходов.":"Vedeți din timp prețul la cheie până la Chișinău — fără costuri ascunse.",
      "Доступ к страховым и дилерским аукционам — больше выбора и выгодных лотов.":"Acces la licitațiile de asigurări și de dealeri — mai multă alegere și loturi avantajoase.",
      "Сопровождение под ключ":"Asistență la cheie",
      "От подбора и торгов до доставки, таможни и выдачи автомобиля в Кишинёве.":"De la selecție și licitație până la transport, vamă și predarea mașinii la Chișinău.",
      "Личный эксперт":"Expert personal",
      "Федор лично проверяет лот и ведёт сделку — вы общаетесь не с колл-центром.":"Fedor verifică personal lotul și conduce tranzacția — nu comunicați cu un call-center.",
      "Заявка на подбор":"Cerere de selecție",
      "Оставьте параметры автомобиля, а мы подберем реальные варианты с аукционов США и Канады с расчетом под ключ до Кишинёва.":"Lăsați parametrii mașinii, iar noi vom găsi variante reale de la licitațiile din SUA și Canada, cu calcul la cheie până la Chișinău.",
      "Канада":"Canada",
      "Нажми на аукцион и найди свой автомобиль прямо сейчас.":"Apasă pe o licitație și găsește-ți mașina chiar acum.",
      "Отправьте VIN или ссылку на аукцион. Мы бесплатно проверим историю автомобиля, повреждения, документы, риски и подскажем ориентировочную стоимость под ключ до Кишинёва.":"Trimiteți VIN-ul sau linkul licitației. Verificăm gratuit istoricul mașinii, avariile, actele, riscurile și vă spunem costul orientativ la cheie până la Chișinău.",
      "Показываем ориентировочную разницу между стоимостью под ключ и рынком Молдовы. Финальная цена зависит от конкретного автомобиля, состояния, документов и даты покупки.":"Arătăm diferența orientativă dintre prețul la cheie și piața din Moldova. Prețul final depinde de mașina concretă, stare, acte și data cumpărării.",
      "Публикуем интересные автомобили с аукционов США и Канады.":"Publicăm mașini interesante de la licitațiile din SUA și Canada.",
      "Показываем цены покупки, расчет под ключ до Молдовы и возможную экономию.":"Arătăm prețurile de achiziție, calculul la cheie până în Moldova și economia posibilă.",
      "от $16,000":"de la $16,000",
      "от $20,000":"de la $20,000",
      "от $4,000":"de la $4,000",
      "2.0 бензин":"2.0 benzină",
      "от $15,000":"de la $15,000",
      "от $19,000":"de la $19,000",
      "от $18,000":"de la $18,000",
      "от $25,000":"de la $25,000",
      "от $7,000":"de la $7,000",
      "Отзывы и сделки":"Recenzii și tranzacții",
      "Реальные истории клиентов — открыто в Telegram":"Povești reale ale clienților — deschis în Telegram",
      "Расчёты, привезённые авто и отзывы клиентов мы публикуем открыто в Telegram-канале — видно, как проходит каждая сделка от ставки на аукционе до выдачи в Кишинёве.":"Calculele, mașinile aduse și recenziile clienților le publicăm deschis în canalul de Telegram — se vede cum decurge fiecare tranzacție, de la licitație până la predarea la Chișinău.",
      "на аукционах США и Канады":"la licitațiile din SUA și Canada",
      "Открытые сделки":"Tranzacții deschise",
      "реальные лоты и расчёты в канале":"loturi și calcule reale în canal",
      "Лично Фёдор":"Personal Fedor",
      "ведёт сделку и на связи на каждом этапе":"conduce tranzacția și e disponibil la fiecare etapă",
      "Смотреть отзывы и сделки в Telegram →":"Vezi recenziile și tranzacțiile în Telegram →",
      "Частые вопросы":"Întrebări frecvente",
      "Коротко о главном":"Pe scurt despre esențial",
      "Сколько времени занимает доставка авто из США?":"Cât durează transportul mașinii din SUA?",
      "В среднем 6–10 недель: внутренняя перевозка к порту, морская доставка, транзит через ЕС и растаможка в Кишинёве. Точные сроки зависят от порта и расписания судов.":"În medie 6–10 săptămâni: transportul intern până la port, livrarea maritimă, tranzitul prin UE și vămuirea la Chișinău. Termenele exacte depind de port și de orarul navelor.",
      "Можно узнать полную стоимость до покупки?":"Se poate afla costul total înainte de cumpărare?",
      "Да. Калькулятор показывает предварительную цену под ключ — лот, сборы, доставку и таможню — ещё до ставки на аукционе.":"Da. Calculatorul arată prețul preliminar la cheie — lot, taxe, transport și vamă — încă înainte de licitație.",
      "Проверяете ли вы автомобиль перед покупкой?":"Verificați mașina înainte de cumpărare?",
      "Обязательно. Проверяем VIN, Carfax, историю, повреждения и документы, чтобы вы понимали реальное состояние и риски лота до торгов.":"Obligatoriu. Verificăm VIN, Carfax, istoricul, avariile și actele, ca să înțelegeți starea reală și riscurile lotului înainte de licitație.",
      "С какими аукционами вы работаете?":"Cu ce licitații lucrați?",
      "Copart, IAAI и Manheim — основные площадки США и Канады. Подбираем лоты под ваш бюджет и задачи.":"Copart, IAAI și Manheim — principalele platforme din SUA și Canada. Selectăm loturi în funcție de bugetul și nevoile dvs.",
      "Что входит в сопровождение под ключ?":"Ce include asistența la cheie?",
      "Подбор и проверка лота, участие в торгах, оплата и документы, организация доставки, растаможка и передача автомобиля в Кишинёве.":"Selecția și verificarea lotului, participarea la licitație, plata și actele, organizarea transportului, vămuirea și predarea mașinii la Chișinău.",
      "APEX AUTO — с 2026":"APEX AUTO — din 2026",
      "Сотни авто":"Sute de mașini",
      "Телефон: 068-832-032":"Telefon: 068-832-032",
      "Стоимость лота":"Costul lotului",
      "Аукционный сбор":"Taxă de licitație",
      "Доставка по США":"Transport în SUA",
      "Доставка в Кишинёв":"Livrare la Chișinău",
      "Таможенные платежи":"Taxe vamale",
      "выбери локацию":"alege locația",
      "отключены":"dezactivate",
      "включены":"activate",
      "Скопировано":"Copiat",
      "Доставка авто из США и Канады в Молдову":"Livrare auto din SUA și Canada în Moldova",
      "Главная":"Principală",
      "Горячие предложения":"Oferte recomandate",
      "Моя история":"Povestea mea",
      "Контакты":"Contacte",
      "Рассчитайте полную стоимость автомобиля до Кишинёва":"Calculează costul complet al mașinii până la Chișinău",
      "Цена покупки автомобиля, аукционные сборы, доставка, страховка, таможенные платежи и сопровождение сделки — в одном понятном расчете.":"Prețul mașinii, taxele de licitație, transportul, asigurarea, vama și asistența într-un singur calcul clar.",
      "Рабочий инструмент APEX AUTO":"Instrument de lucru APEX AUTO",
      "Используем этот калькулятор для расчетов клиентам перед покупкой":"Folosim acest calculator pentru estimări înainte de cumpărare",
      "Перед ставкой на аукционе вы заранее видите ориентировочную стоимость автомобиля под ключ: покупка, доставка, таможня и обязательные расходы.":"Înainte de licitație vezi din timp costul estimativ la cheie: achiziție, livrare, vamă și cheltuieli obligatorii.",
      "Ссылка на лот с аукциона":"Link către lotul de la licitație",
      "Вставьте ссылку Copart / IAAI / Manheim":"Introduceți linkul Copart / IAAI / Manheim",
      "Разобрать":"Analizează",
      "Отправить лот на проверку":"Trimite lotul la verificare",
      "Аукцион":"Licitație",
      "Локация аукциона":"Locația licitației",
      "Выбери локацию":"Alege locația",
      "Тип транспортного средства":"Tip vehicul",
      "Тип топлива":"Tip combustibil",
      "Седан":"Sedan",
      "Кроссовер":"Crossover",
      "Внедорожник":"SUV",
      "Пикап":"Pickup",
      "Мото":"Moto",
      "Квадро / ATV":"ATV",
      "Бензин":"Benzină",
      "Гибрид":"Hibrid",
      "Плагин гибрид":"Plug-in hybrid",
      "Электро":"Electric",
      "Дизель":"Diesel",
      "Стоимость лота, $":"Cost lot, $",
      "Аукционный сбор, $":"Taxă licitație, $",
      "Объем двигателя, л":"Volum motor, l",
      "Год производства":"An fabricație",
      "Порт отправки":"Port expediere",
      "Доставка по суше, $":"Transport SUA, $",
      "Страховка 1% от стоимости лота":"Asigurare 1% din costul lotului",
      "Экспортные документы +$400":"Documente export +$400",
      "Показать итог:":"Afișează totalul:",
      "Дополнительно":"Suplimentar",
      "Курс USD → MDL MAIB":"Curs USD → MDL MAIB",
      "Курс EUR → MDL MAIB":"Curs EUR → MDL MAIB",
      "Обновить расчет":"Actualizează calculul",
      "Локация не выбрана":"Locația nu este aleasă",
      "Итого":"Total",
      "Расчет предварительный.":"Calcul preliminar.",
      "Финальную сумму нужно проверить перед покупкой.":"Suma finală trebuie verificată înainte de cumpărare.",
      "Сопровождение APEX AUTO":"Asistență APEX AUTO",
      "Подбор и проверка лота, бесплатная проверка Carfax, участие в торгах, оформление документов, организация доставки и сопровождение автомобиля до выдачи.":"Selectarea și verificarea lotului, verificare Carfax gratuită, participare la licitație, acte, livrare și asistență până la predarea mașinii.",
      "Скопировать расчет":"Copiază calculul",
      "Поделиться расчетом":"Trimite calculul",
      "Оценка лота":"Evaluarea lotului",
      "Торговая рекомендация":"Recomandare de licitare",
      "Рынок Молдовы от, $":"Piața Moldovei de la, $",
      "Рынок Молдовы до, $":"Piața Moldovei până la, $",
      "Ремонт от, $":"Reparație de la, $",
      "Ремонт до, $":"Reparație până la, $",
      "Желаемая экономия, $":"Economia dorită, $",
      "AI оценить ставку":"AI estimează oferta",
      "Экономия при покупке авто":"Economie la cumpărarea mașinii",
      "Автомобили из США и Канады выгоднее на 20–35% чем на местном рынке":"Mașinile din SUA și Canada pot fi cu 20–35% mai avantajoase decât pe piața locală",
      "Получить подбор автомобилей":"Primește o selecție de mașini",
      "Имя":"Nume",
      "Телефон":"Telefon",
      "Бюджет":"Buget",
      "Какой автомобиль ищете? Например: BMW X5, Tesla Model Y, Porsche Macan":"Ce mașină căutați? De exemplu: BMW X5, Tesla Model Y, Porsche Macan",
      "Заявка откроется готовым сообщением в Telegram.":"Cererea se va deschide ca mesaj pregătit în Telegram.",
      "БЕСПЛАТНАЯ ПРОВЕРКА АВТОМОБИЛЯ":"VERIFICARE GRATUITĂ A MAȘINII",
      "Не уверены, стоит ли покупать этот автомобиль?":"Nu sunteți sigur dacă merită cumpărată această mașină?",
      "Отправить на проверку":"Trimite la verificare",
      "Ответим в Telegram в рабочее время.":"Răspundem pe Telegram în timpul programului.",
      "ГОРЯЧИЕ ПРЕДЛОЖЕНИЯ":"OFERTE RECOMANDATE",
      "Авто, которые выгодно привозить под ключ":"Mașini avantajoase pentru import la cheie",
      "Telegram-канал Apex Auto":"Canalul Telegram Apex Auto",
      "Смотреть все лоты":"Vezi toate loturile",
      "Новые лоты ежедневно":"Loturi noi zilnic",
      "Реальные цены покупки":"Prețuri reale de achiziție",
      "Расчет стоимости под ключ":"Calcul cost la cheie",
      "Смотреть примеры":"Vezi exemple",
      "Отправить заявку":"Trimite cerere",
      "Цена в Молдове":"Preț în Moldova",
      "Экономия":"Economie",
      "Под ключ":"La cheie",
      "от":"de la",
      "С 2016 года":"Din 2016",
      "в автомобильном бизнесе":"în domeniul auto",
      "новый бренд на базе накопленного опыта":"brand nou bazat pe experiență acumulată",
      "2000+ авто":"2000+ mașini",
      "привезены клиентам":"livrate clienților",
      "подбор, торги, документы и логистика":"selectare, licitații, acte și logistică",
      "Telegram канал: @fedukauto":"Canal Telegram: @fedukauto",
      "WhatsApp: 068-832-032":"WhatsApp: 068-832-032",
      "Позвонить":"Sună",
      "Написать в Telegram":"Scrie pe Telegram",
      "Прямой контакт":"Contact direct",
      "Федор Чебан":"Fedor Ceban",
      "Расчет, подбор, проверка лота":"Calcul, selecție, verificare lot",
      "Удобно для документов и фото":"Convenabil pentru acte și poze",
      "Звонок":"Apel",
      "Если вопрос срочный":"Dacă este urgent",
      "Telegram-канал":"Canal Telegram",
      "Лоты, примеры покупок и цены":"Loturi, exemple de achiziții și prețuri",
      "ЧТО МОЖНО ОТПРАВИТЬ":"CE PUTEȚI TRIMITE",
      "Для быстрого расчета достаточно 2-3 деталей":"Pentru un calcul rapid sunt suficiente 2-3 detalii",
      "Телефон или Telegram":"Telefon sau Telegram",
      "Автомобиль или ссылка на лот":"Mașină sau link către lot",
      "Коротко опишите задачу: расчет, подбор, проверка VIN, покупка под ключ":"Descrieți pe scurt: calcul, selecție, verificare VIN, cumpărare la cheie",
      "Отправить запрос":"Trimite solicitarea",
      "Откроется готовое сообщение в Telegram.":"Se va deschide un mesaj pregătit în Telegram.",
      "Автомобили, которые выгодно привозить из США и Канады":"Mașini avantajoase de importat din SUA și Canada",
      "Все авто":"Toate",
      "Гибриды":"Hibride",
      "Премиум":"Premium",
      "Ориентир под ключ":"Estimare la cheie",
      "Посмотреть примеры":"Vezi exemple",
      "ВАЖНО":"IMPORTANT",
      "Это ориентир, а не фиксированная цена":"Este o estimare, nu un preț fix",
      "Перейти к калькулятору":"Mergi la calculator",
      "За Apex Auto стоит не просто компания, а человек с реальным опытом":"În spatele Apex Auto nu este doar o companie, ci un om cu experiență reală",
      "10+ лет":"10+ ani",
      "в автомобильной сфере":"în domeniul auto",
      "7+ лет":"7+ ani",
      "ежедневной работы с аукционами США":"lucru zilnic cu licitațiile din SUA",
      "20–50 авто":"20–50 mașini",
      "ежемесячно покупаю для клиентов":"cumpărate lunar pentru clienți",
      "опыт работы со страховыми и дилерскими аукционами":"experiență cu licitații de asigurări și dealer"
    },
    en:{
      "Меня вы можете знать как":"You may also know me as",
      "Подбор и проверка лота":"Lot selection and inspection",
      "Участие в торгах":"Bidding at auction",
      "Документы, доставка и сопровождение":"Documents, shipping and support",
      "Экспортные документы":"Export documents",
      "Страховка":"Insurance",
      "Рассчитайте полную стоимость автомобиля до Кишинева":"Calculate the full turnkey cost of the car to Chișinău",
      "Рассчитайте полную стоимость автомобиля до Кишинёва":"Calculate the full turnkey cost of the car to Chișinău",
      "Контакты — Apex Auto | Telegram, WhatsApp, телефон":"Contacts — Apex Auto | Telegram, WhatsApp, phone",
      "КОНТАКТЫ":"CONTACTS",
      "Напишите, и я помогу понять реальную стоимость автомобиля под ключ":"Message me and I'll help you understand the real turnkey cost of the car",
      "Быстрее всего отвечаю в Telegram. Можно отправить ссылку на лот, VIN, номер аукциона или просто написать, какой автомобиль ищете и какой бюджет комфортен.":"I reply fastest on Telegram. You can send a lot link, VIN, auction number or just write which car you're looking for and your comfortable budget.",
      "Apex Auto, доставка авто из США и Канады в Молдову":"Apex Auto, car delivery from the USA and Canada to Moldova",
      "Фото и видео авто с аукционов":"Photos and videos of cars from auctions",
      "Короткие обзоры и сделки":"Short reviews and deals",
      "Новости и примеры покупок":"News and purchase examples",
      "АДРЕС":"ADDRESS",
      "Кишинёв, Bucovina 9F":"Chișinău, Bucovina 9F",
      "Приезд по предварительной договорённости — напишите в Telegram, и мы согласуем удобное время.":"Visits are by prior arrangement — message us on Telegram and we'll agree on a convenient time.",
      "Открыть в Яндекс.Картах":"Open in Yandex.Maps",
      "ссылку на Copart, IAAI или Manheim;":"a Copart, IAAI or Manheim link;",
      "VIN, номер лота или скрин автомобиля;":"VIN, lot number or a screenshot of the car;",
      "модель, год, тип топлива и желаемый бюджет;":"model, year, fuel type and desired budget;",
      "город, где хотите получить автомобиль.":"the city where you want to receive the car.",
      "Горячие предложения — выгодные авто под ключ | Apex Auto":"Recommended lots — great-value turnkey cars | Apex Auto",
      "Собрали модели, которые часто имеют хорошую разницу между стоимостью под ключ и рынком Молдовы. Цены указаны как ориентир: финальный расчет зависит от конкретного лота, документов, повреждений и даты покупки.":"We've gathered models that often have a good gap between the turnkey price and the Moldovan market. Prices are indicative: the final estimate depends on the specific lot, documents, damage and purchase date.",
      "Публикуем интересные лоты, реальные цены покупки и ориентировочную стоимость под ключ.":"We post interesting lots, real purchase prices and the approximate turnkey cost.",
      "Компактная BMW с гибридной установкой. Хороший вариант, если нужен приятный расход и нормальная динамика.":"A compact BMW with a hybrid setup. A good option if you want pleasant fuel economy and decent performance.",
      "от $12,500":"from $12,500",
      "от $16,500":"from $16,500",
      "Комфортный бизнес-класс с умеренной таможней. Часто можно найти живой страховой лот.":"A comfortable business-class car with moderate customs. You can often find a clean insurance lot.",
      "от $21,000":"from $21,000",
      "от $5,000":"from $5,000",
      "3.0 бензин":"3.0 gasoline",
      "Спортивная M-серия, где особенно важна проверка истории, геометрии и качества повреждений.":"A sporty M-series where checking the history, geometry and damage quality is especially important.",
      "от $55,000":"from $55,000",
      "от $68,000":"from $68,000",
      "от $13,000":"from $13,000",
      "Один из самых интересных премиальных SUV. Хорошая комплектация и выгодная таможня для PHEV.":"One of the most interesting premium SUVs. Good trim and favorable customs for a PHEV.",
      "от $34,000":"from $34,000",
      "от $45,000":"from $45,000",
      "от $11,000":"from $11,000",
      "Свежий гибрид с надежной базой. Отлично подходит для ежедневной езды и дальнейшей продажи.":"A recent hybrid on a reliable platform. Great for daily driving and resale.",
      "Практичный кроссовер с хорошей ликвидностью. Важно выбирать лот без сложных ударов по подвеске.":"A practical crossover with good resale demand. It's important to pick a lot without serious suspension hits.",
      "от $23,000":"from $23,000",
      "от $31,000":"from $31,000",
      "от $8,000":"from $8,000",
      "Бюджетный гибрид с доступными запчастями. Хороший вариант для спокойной ежедневной езды.":"A budget hybrid with affordable parts. A good option for calm daily driving.",
      "от $10,500":"from $10,500",
      "от $14,500":"from $14,500",
      "Комфортный седан на базе Fusion, но с более приятной отделкой и богатой комплектацией.":"A comfortable sedan based on the Fusion, but with nicer finishes and rich equipment.",
      "от $11,500":"from $11,500",
      "от $4,500":"from $4,500",
      "Один из самых надежных гибридов. Часто интересен по расходу, ликвидности и стоимости владения.":"One of the most reliable hybrids. Often attractive for fuel economy, resale and cost of ownership.",
      "от $12,000":"from $12,000",
      "от $17,000":"from $17,000",
      "Популярный электрокроссовер. Обязательно проверяем батарею, историю и характер повреждений.":"A popular electric crossover. We always check the battery, history and type of damage.",
      "Премиальная Tesla с высокой ценой ремонта. Здесь особенно важна проверка батареи и кузова.":"A premium Tesla with high repair costs. Here checking the battery and body is especially important.",
      "от $28,000":"from $28,000",
      "Практичный семейный SUV. Хороший вариант, если нужен свежий год и понятный ремонт.":"A practical family SUV. A good option if you want a recent year and straightforward repairs.",
      "от $18,500":"from $18,500",
      "от $6,500":"from $6,500",
      "Перед покупкой мы проверяем VIN, историю, документы, продавца, повреждения и логистику. Так клиент заранее понимает, стоит ли бороться за конкретный автомобиль.":"Before buying we check the VIN, history, documents, seller, damage and logistics. This way the client knows in advance whether a specific car is worth bidding on.",
      "Моя история — Федор Чебан, основатель Apex Auto":"My story — Fedor Ceban, founder of Apex Auto",
      "МОЯ ИСТОРИЯ":"MY STORY",
      "Меня зовут Федор Чебан. Я создал Apex Auto, чтобы клиенты могли покупать автомобили из США и Канады спокойно, прозрачно и с пониманием каждого этапа.":"My name is Fedor Ceban. I created Apex Auto so that clients can buy cars from the USA and Canada calmly, transparently and with an understanding of every step.",
      "Автомобили стали частью моей жизни еще в 2013 году. Мне всегда было интересно не просто ездить на машинах, а понимать, как они устроены, как оцениваются повреждения, как формируется стоимость и почему одни автомобили стоят своих денег, а другие лучше обходить стороной.":"Cars became part of my life back in 2013. I was always interested not just in driving, but in understanding how they're built, how damage is assessed, how value is formed and why some cars are worth their money while others are best avoided.",
      "В 2016 году я начал работать в компании, которая занималась автомобилями и запчастями из США. Начинал менеджером, позже стал старшим менеджером и участвовал практически во всех процессах: общение с клиентами, подбор запчастей, работа с каталогами, схемами, складами, логистикой и отгрузками.":"In 2016 I started working at a company dealing in cars and parts from the USA. I started as a manager, later became a senior manager and took part in nearly every process: client communication, parts selection, working with catalogs, diagrams, warehouses, logistics and shipments.",
      "В 2017 году я заказал свой первый автомобиль из США — Volkswagen Passat. После продажи я понял, насколько интересным и выгодным может быть этот рынок. Потом был Volkswagen Tiguan, затем другие автомобили. С каждой покупкой я всё больше убеждался, что автомобили из США и Канады позволяют получить больше автомобиля за те же деньги.":"In 2017 I ordered my first car from the USA — a Volkswagen Passat. After selling it I realized how interesting and profitable this market can be. Then came a Volkswagen Tiguan, then other cars. With every purchase I became more convinced that cars from the USA and Canada give you more car for the same money.",
      "Со временем работа привела меня напрямую к аукционам. Я покупал автомобили для разборки, среди них были машины после ДТП, наводнений и штормов. Именно там появился опыт, который невозможно получить из роликов или статей в интернете.":"Over time the work led me straight to the auctions. I bought cars for dismantling, including cars after accidents, floods and storms. That's where I gained experience that can't be learned from videos or online articles.",
      "Через мои руки прошли десятки собственных автомобилей с разными повреждениями. Были и топляки, которые многие отправили бы только на разборку. Но благодаря опыту работы с электрикой, каталогами, проводкой и блоками мне удавалось восстанавливать такие машины до отличного состояния. Эти автомобили были успешно проданы и продолжают ездить без проблем.":"Dozens of my own cars with various damage passed through my hands. There were even flood cars that many would send straight to dismantling. But thanks to my experience with electrics, catalogs, wiring and control units, I managed to restore such cars to excellent condition. Those cars were sold successfully and are still running without issues.",
      "Отдельный опыт мне дали BMW M-серии последних поколений. Их ремонт стоит недешево, но благодаря работе с каталогами и поставщиками я понимаю, когда машину лучше собирать на новых оригинальных деталях, а когда разумнее использовать качественные б/у запчасти. Иногда новая оригинальная деталь оказывается доступнее, чем бывшая в употреблении, но об этом знают далеко не все.":"The latest-generation BMW M-series gave me a separate kind of experience. Repairing them isn't cheap, but thanks to working with catalogs and suppliers I know when it's better to build a car with new original parts and when it makes more sense to use quality used parts. Sometimes a new original part turns out cheaper than a used one, but far from everyone knows that.",
      "Я работаю не только с Copart и IAAI, но и с Manheim. Многие считают, что дилерский аукцион — это всегда безопасная покупка. На практике там тоже хватает «котов в мешке»: скрытые проблемы, некачественный ремонт, технические нюансы и автомобили, которые выглядят лучше, чем есть на самом деле. Для меня это не проблема, потому что опыт позволяет отличать хороший вариант от рискованного.":"I work not only with Copart and IAAI, but also with Manheim. Many believe a dealer auction is always a safe buy. In practice, there are plenty of surprises there too: hidden problems, poor-quality repairs, technical nuances and cars that look better than they really are. For me that's not a problem, because experience lets me tell a good option from a risky one.",
      "Я знаю, как работает логистика на аукционе, доставка по США, погрузка и выгрузка контейнеров, морская перевозка и выдача автомобиля клиенту. Именно этот полный путь — от выбора машины до результата в руках клиента — дает мне энергию и движет мной каждый день.":"I know how auction logistics work, transport across the USA, loading and unloading containers, sea shipping and handing the car over to the client. It's this complete journey — from choosing the car to the result in the client's hands — that gives me energy and drives me every day.",
      "В 2026 году я создал Apex Auto. Для меня важно не просто купить автомобиль и закрыть сделку. Важно подобрать машину, которую я бы сам рекомендовал своим друзьям или близким. Машину, которой клиент будет доволен не только в день получения, но и спустя годы.":"In 2026 I founded Apex Auto. For me it's not just about buying a car and closing the deal. It's important to choose a car I'd recommend to my own friends and family. A car the client will be happy with not only on delivery day, but years later too.",
      "Потому что автомобиль мечты начинается не с аукциона. Он начинается с доверия.":"Because a dream car doesn't start at the auction. It starts with trust.",
      "подбор, проверка, покупка, доставка и сопровождение":"selection, inspection, purchase, shipping and support",
      "Apex Auto — авто из США и Канады под ключ в Молдову":"Apex Auto — cars from the USA and Canada turnkey to Moldova",
      "Аукционы":"Auctions",
      "Apex Auto · в авто-бизнесе с 2016 года":"Apex Auto · in the car business since 2016",
      "Рассчитать стоимость":"Calculate the cost",
      "Бесплатный Carfax":"Free Carfax",
      "Расчёт до ставки":"Estimate before bidding",
      "Под ключ до Кишинёва":"Turnkey to Chișinău",
      "с 2016 года":"since 2016",
      "в авто-бизнесе":"in the car business",
      "подбор · торги · доставка · таможня":"selection · bidding · shipping · customs",
      "аукционы США и Канады":"USA and Canada auctions",
      "Проверьте тип гибрида":"Check the hybrid type",
      "Обычный Hybrid и Plug-in Hybrid считаются по-разному. Если авто заряжается от розетки или в названии есть PHEV / Plug-in, выберите Plug-in.":"Regular Hybrid and Plug-in Hybrid are calculated differently. If the car charges from an outlet or has PHEV / Plug-in in its name, choose Plug-in.",
      "Обычный гибрид":"Regular hybrid",
      "Все автомобили страхуем при морской перевозке —":"We insure every car during sea transport —",
      "1% от стоимости лота":"1% of the lot value",
      ". Страховка включена в расчёт по умолчанию и защищает авто при повреждениях, воде и спорных ситуациях.":". Insurance is included in the estimate by default and protects the car against damage, water and disputes.",
      "Опасный груз":"Hazardous cargo",
      "Многие автомобили из США и Канады можно привезти дешевле аналогичных предложений на рынке Молдовы даже с учетом доставки, таможенных платежей и обязательных расходов.":"Many cars from the USA and Canada can be brought in cheaper than similar offers on the Moldovan market, even including shipping, customs duties and mandatory costs.",
      "Именно поэтому клиенты выбирают аукционы Copart, IAAI и Manheim: там часто можно найти более свежий год, лучшую комплектацию и заметную экономию по сравнению с местным рынком.":"That's why clients choose the Copart, IAAI and Manheim auctions: there you can often find a newer year, better trim and noticeable savings compared to the local market.",
      "Калькулятор помогает заранее оценить ориентировочную стоимость автомобиля под ключ до Кишинёва. Возможные расходы на обслуживание или восстановление рассчитываются отдельно после проверки конкретного автомобиля.":"The calculator helps you estimate the approximate turnkey cost to Chișinău in advance. Possible maintenance or repair costs are calculated separately after inspecting the specific car.",
      "Пример экономии":"Savings example",
      "Рынок Молдовы":"Moldovan market",
      "от $24 000":"from $24,000",
      "Под ключ Apex Auto":"Turnkey Apex Auto",
      "от $18 000":"from $18,000",
      "средняя экономия на одном авто":"average savings per car",
      "Рассчитать мой вариант":"Calculate my option",
      "Как мы работаем":"How we work",
      "От заявки до ключей в Кишинёве — 6 шагов":"From request to keys in Chișinău — 6 steps",
      "Вы понимаете каждый этап заранее: что происходит, сколько стоит и в какие сроки.":"You understand each stage in advance: what happens, how much it costs and in what timeframe.",
      "Заявка и консультация":"Request and consultation",
      "Обсуждаем бюджет, цели и подходящие модели.":"We discuss the budget, goals and suitable models.",
      "Подбор автомобиля":"Car selection",
      "Находим лоты на Copart, IAAI и Manheim под ваш запрос.":"We find lots on Copart, IAAI and Manheim to match your request.",
      "Проверка до ставки":"Check before bidding",
      "VIN, Carfax, история, повреждения и документы — до покупки.":"VIN, Carfax, history, damage and documents — before purchase.",
      "Торги и покупка":"Bidding and purchase",
      "Участвуем в аукционе по согласованному лимиту.":"We bid at the auction within the agreed limit.",
      "Доставка":"Shipping",
      "США / Канада → порт → море → транзит через ЕС.":"USA / Canada → port → sea → transit through the EU.",
      "Таможня и выдача":"Customs and handover",
      "Растаможка и передача автомобиля в Кишинёве.":"Customs clearance and handover of the car in Chișinău.",
      "Доставка морем под ключ":"Turnkey sea shipping",
      "США и Канада → порт → море → Кишинёв":"USA and Canada → port → sea → Chișinău",
      "Берём на себя весь путь автомобиля: внутренняя перевозка к порту, морская доставка, транзит через ЕС и растаможка в Кишинёве. Вы видите статус на каждом этапе.":"We handle the car's entire journey: inland transport to the port, sea shipping, transit through the EU and customs clearance in Chișinău. You see the status at every stage.",
      "6–10 недель":"6–10 weeks",
      "средний срок доставки":"average delivery time",
      "Страховка груза":"Cargo insurance",
      "защита авто в пути":"car protection in transit",
      "Отслеживание":"Tracking",
      "статус на каждом этапе":"status at every stage",
      "Почему Apex Auto":"Why Apex Auto",
      "Почему клиенты выбирают нас":"Why clients choose us",
      "Опыт с 2016 года":"Experience since 2016",
      "Реальная ежедневная практика на аукционах США и Канады, а не теория из роликов.":"Real, daily practice at USA and Canada auctions, not theory from videos.",
      "Бесплатная проверка Carfax":"Free Carfax check",
      "История, пробег, аварии и документы проверяем до покупки, а не после.":"We check history, mileage, accidents and documents before the purchase, not after.",
      "Вы видите цену под ключ до Кишинёва заранее — без скрытых расходов.":"You see the turnkey price to Chișinău in advance — with no hidden costs.",
      "Доступ к страховым и дилерским аукционам — больше выбора и выгодных лотов.":"Access to insurance and dealer auctions — more choice and better-value lots.",
      "Сопровождение под ключ":"Turnkey support",
      "От подбора и торгов до доставки, таможни и выдачи автомобиля в Кишинёве.":"From selection and bidding to shipping, customs and car handover in Chișinău.",
      "Личный эксперт":"Personal expert",
      "Федор лично проверяет лот и ведёт сделку — вы общаетесь не с колл-центром.":"Fedor personally checks the lot and handles the deal — you're not talking to a call center.",
      "Заявка на подбор":"Selection request",
      "Оставьте параметры автомобиля, а мы подберем реальные варианты с аукционов США и Канады с расчетом под ключ до Кишинёва.":"Leave the car parameters and we'll find real options from USA and Canada auctions with a turnkey estimate to Chișinău.",
      "Канада":"Canada",
      "Нажми на аукцион и найди свой автомобиль прямо сейчас.":"Click an auction and find your car right now.",
      "Отправьте VIN или ссылку на аукцион. Мы бесплатно проверим историю автомобиля, повреждения, документы, риски и подскажем ориентировочную стоимость под ключ до Кишинёва.":"Send the VIN or auction link. We'll check the car's history, damage, documents and risks for free and tell you the approximate turnkey cost to Chișinău.",
      "Показываем ориентировочную разницу между стоимостью под ключ и рынком Молдовы. Финальная цена зависит от конкретного автомобиля, состояния, документов и даты покупки.":"We show the approximate difference between the turnkey price and the Moldovan market. The final price depends on the specific car, condition, documents and purchase date.",
      "Публикуем интересные автомобили с аукционов США и Канады.":"We post interesting cars from USA and Canada auctions.",
      "Показываем цены покупки, расчет под ключ до Молдовы и возможную экономию.":"We show purchase prices, the turnkey estimate to Moldova and possible savings.",
      "от $16,000":"from $16,000",
      "от $20,000":"from $20,000",
      "от $4,000":"from $4,000",
      "2.0 бензин":"2.0 gasoline",
      "от $15,000":"from $15,000",
      "от $19,000":"from $19,000",
      "от $18,000":"from $18,000",
      "от $25,000":"from $25,000",
      "от $7,000":"from $7,000",
      "Отзывы и сделки":"Reviews and deals",
      "Реальные истории клиентов — открыто в Telegram":"Real client stories — openly on Telegram",
      "Расчёты, привезённые авто и отзывы клиентов мы публикуем открыто в Telegram-канале — видно, как проходит каждая сделка от ставки на аукционе до выдачи в Кишинёве.":"We openly post estimates, delivered cars and client reviews in our Telegram channel — you can see how every deal goes from the auction bid to handover in Chișinău.",
      "на аукционах США и Канады":"at USA and Canada auctions",
      "Открытые сделки":"Open deals",
      "реальные лоты и расчёты в канале":"real lots and estimates in the channel",
      "Лично Фёдор":"Fedor in person",
      "ведёт сделку и на связи на каждом этапе":"handles the deal and is in touch at every stage",
      "Смотреть отзывы и сделки в Telegram →":"See reviews and deals on Telegram →",
      "Частые вопросы":"FAQ",
      "Коротко о главном":"The essentials, briefly",
      "Сколько времени занимает доставка авто из США?":"How long does shipping a car from the USA take?",
      "В среднем 6–10 недель: внутренняя перевозка к порту, морская доставка, транзит через ЕС и растаможка в Кишинёве. Точные сроки зависят от порта и расписания судов.":"On average 6–10 weeks: inland transport to the port, sea shipping, transit through the EU and customs clearance in Chișinău. Exact times depend on the port and ship schedule.",
      "Можно узнать полную стоимость до покупки?":"Can I find out the full cost before buying?",
      "Да. Калькулятор показывает предварительную цену под ключ — лот, сборы, доставку и таможню — ещё до ставки на аукционе.":"Yes. The calculator shows a preliminary turnkey price — lot, fees, shipping and customs — even before bidding.",
      "Проверяете ли вы автомобиль перед покупкой?":"Do you inspect the car before purchase?",
      "Обязательно. Проверяем VIN, Carfax, историю, повреждения и документы, чтобы вы понимали реальное состояние и риски лота до торгов.":"Always. We check the VIN, Carfax, history, damage and documents so you understand the real condition and risks of the lot before bidding.",
      "С какими аукционами вы работаете?":"Which auctions do you work with?",
      "Copart, IAAI и Manheim — основные площадки США и Канады. Подбираем лоты под ваш бюджет и задачи.":"Copart, IAAI and Manheim — the main USA and Canada platforms. We pick lots to match your budget and needs.",
      "Что входит в сопровождение под ключ?":"What's included in turnkey support?",
      "Подбор и проверка лота, участие в торгах, оплата и документы, организация доставки, растаможка и передача автомобиля в Кишинёве.":"Lot selection and inspection, bidding, payment and documents, arranging shipping, customs clearance and handing over the car in Chișinău.",
      "APEX AUTO — с 2026":"APEX AUTO — since 2026",
      "Сотни авто":"Hundreds of cars",
      "Телефон: 068-832-032":"Phone: 068-832-032",
      "Стоимость лота":"Lot price",
      "Аукционный сбор":"Auction fee",
      "Доставка по США":"Inland US shipping",
      "Доставка в Кишинёв":"Delivery to Chișinău",
      "Таможенные платежи":"Customs duties",
      "выбери локацию":"choose a location",
      "отключены":"disabled",
      "включены":"enabled",
      "Скопировано":"Copied",
      "Доставка авто из США и Канады в Молдову":"Car delivery from the USA and Canada to Moldova",
      "Главная":"Home",
      "Горячие предложения":"Recommended lots",
      "Моя история":"My story",
      "Контакты":"Contacts",
      "Рассчитайте полную стоимость автомобиля до Кишинёва":"Calculate the full cost of a car to Chisinau",
      "Цена покупки автомобиля, аукционные сборы, доставка, страховка, таможенные платежи и сопровождение сделки — в одном понятном расчете.":"Purchase price, auction fees, shipping, insurance, customs and deal support in one clear calculation.",
      "Рабочий инструмент APEX AUTO":"APEX AUTO working tool",
      "Используем этот калькулятор для расчетов клиентам перед покупкой":"We use this calculator for client estimates before purchase",
      "Перед ставкой на аукционе вы заранее видите ориентировочную стоимость автомобиля под ключ: покупка, доставка, таможня и обязательные расходы.":"Before bidding, you can see the estimated turnkey cost: purchase, shipping, customs and required expenses.",
      "Ссылка на лот с аукциона":"Auction lot link",
      "Вставьте ссылку Copart / IAAI / Manheim":"Paste a Copart / IAAI / Manheim link",
      "Разобрать":"Analyze",
      "Отправить лот на проверку":"Send lot for inspection",
      "Аукцион":"Auction",
      "Локация аукциона":"Auction location",
      "Выбери локацию":"Choose location",
      "Тип транспортного средства":"Vehicle type",
      "Тип топлива":"Fuel type",
      "Седан":"Sedan",
      "Кроссовер":"Crossover",
      "Внедорожник":"SUV",
      "Пикап":"Pickup",
      "Мото":"Motorcycle",
      "Квадро / ATV":"ATV",
      "Бензин":"Gasoline",
      "Гибрид":"Hybrid",
      "Плагин гибрид":"Plug-in hybrid",
      "Электро":"Electric",
      "Дизель":"Diesel",
      "Стоимость лота, $":"Lot price, $",
      "Аукционный сбор, $":"Auction fee, $",
      "Объем двигателя, л":"Engine size, L",
      "Год производства":"Year",
      "Порт отправки":"Shipping port",
      "Доставка по суше, $":"US inland shipping, $",
      "Страховка 1% от стоимости лота":"Insurance 1% of lot price",
      "Экспортные документы +$400":"Export documents +$400",
      "Показать итог:":"Show total:",
      "Дополнительно":"Additional",
      "Курс USD → MDL MAIB":"USD → MDL MAIB rate",
      "Курс EUR → MDL MAIB":"EUR → MDL MAIB rate",
      "Обновить расчет":"Update calculation",
      "Локация не выбрана":"Location not selected",
      "Итого":"Total",
      "Расчет предварительный.":"Preliminary calculation.",
      "Финальную сумму нужно проверить перед покупкой.":"The final amount must be checked before purchase.",
      "Сопровождение APEX AUTO":"APEX AUTO support",
      "Подбор и проверка лота, бесплатная проверка Carfax, участие в торгах, оформление документов, организация доставки и сопровождение автомобиля до выдачи.":"Lot selection and check, free Carfax check, bidding, paperwork, shipping and support until delivery.",
      "Скопировать расчет":"Copy calculation",
      "Поделиться расчетом":"Share calculation",
      "Оценка лота":"Lot assessment",
      "Торговая рекомендация":"Bidding recommendation",
      "Рынок Молдовы от, $":"Moldova market from, $",
      "Рынок Молдовы до, $":"Moldova market to, $",
      "Ремонт от, $":"Repair from, $",
      "Ремонт до, $":"Repair to, $",
      "Желаемая экономия, $":"Target savings, $",
      "AI оценить ставку":"AI estimate bid",
      "Экономия при покупке авто":"Savings when buying a car",
      "Автомобили из США и Канады выгоднее на 20–35% чем на местном рынке":"Cars from the USA and Canada can be 20–35% more cost-effective than the local market",
      "Получить подбор автомобилей":"Get car selection",
      "Имя":"Name",
      "Телефон":"Phone",
      "Бюджет":"Budget",
      "Какой автомобиль ищете? Например: BMW X5, Tesla Model Y, Porsche Macan":"What car are you looking for? Example: BMW X5, Tesla Model Y, Porsche Macan",
      "Заявка откроется готовым сообщением в Telegram.":"The request will open as a prepared Telegram message.",
      "БЕСПЛАТНАЯ ПРОВЕРКА АВТОМОБИЛЯ":"FREE CAR CHECK",
      "Не уверены, стоит ли покупать этот автомобиль?":"Not sure if this car is worth buying?",
      "Отправить на проверку":"Send for inspection",
      "Ответим в Telegram в рабочее время.":"We reply on Telegram during business hours.",
      "ГОРЯЧИЕ ПРЕДЛОЖЕНИЯ":"RECOMMENDED LOTS",
      "Авто, которые выгодно привозить под ключ":"Cars worth importing turnkey",
      "Telegram-канал Apex Auto":"Apex Auto Telegram channel",
      "Смотреть все лоты":"View all lots",
      "Новые лоты ежедневно":"New lots daily",
      "Реальные цены покупки":"Real purchase prices",
      "Расчет стоимости под ключ":"Turnkey cost estimate",
      "Смотреть примеры":"View examples",
      "Отправить заявку":"Send request",
      "Цена в Молдове":"Price in Moldova",
      "Экономия":"Savings",
      "Под ключ":"Turnkey",
      "от":"from",
      "С 2016 года":"Since 2016",
      "в автомобильном бизнесе":"in the automotive business",
      "новый бренд на базе накопленного опыта":"a new brand built on accumulated experience",
      "2000+ авто":"2000+ cars",
      "привезены клиентам":"delivered to clients",
      "подбор, торги, документы и логистика":"selection, bidding, documents and logistics",
      "Telegram канал: @fedukauto":"Telegram channel: @fedukauto",
      "WhatsApp: 068-832-032":"WhatsApp: 068-832-032",
      "Позвонить":"Call",
      "Написать в Telegram":"Message on Telegram",
      "Прямой контакт":"Direct contact",
      "Федор Чебан":"Fedor Ceban",
      "Расчет, подбор, проверка лота":"Calculation, selection, lot check",
      "Удобно для документов и фото":"Convenient for documents and photos",
      "Звонок":"Call",
      "Если вопрос срочный":"For urgent questions",
      "Telegram-канал":"Telegram channel",
      "Лоты, примеры покупок и цены":"Lots, purchase examples and prices",
      "ЧТО МОЖНО ОТПРАВИТЬ":"WHAT YOU CAN SEND",
      "Для быстрого расчета достаточно 2-3 деталей":"2-3 details are enough for a quick estimate",
      "Телефон или Telegram":"Phone or Telegram",
      "Автомобиль или ссылка на лот":"Car or lot link",
      "Коротко опишите задачу: расчет, подбор, проверка VIN, покупка под ключ":"Briefly describe the task: estimate, selection, VIN check, turnkey purchase",
      "Отправить запрос":"Send request",
      "Откроется готовое сообщение в Telegram.":"A prepared Telegram message will open.",
      "Автомобили, которые выгодно привозить из США и Канады":"Cars worth importing from the USA and Canada",
      "Все авто":"All cars",
      "Гибриды":"Hybrids",
      "Премиум":"Premium",
      "Ориентир под ключ":"Turnkey estimate",
      "Посмотреть примеры":"View examples",
      "ВАЖНО":"IMPORTANT",
      "Это ориентир, а не фиксированная цена":"This is an estimate, not a fixed price",
      "Перейти к калькулятору":"Go to calculator",
      "За Apex Auto стоит не просто компания, а человек с реальным опытом":"Behind Apex Auto is not just a company, but a person with real experience",
      "10+ лет":"10+ years",
      "в автомобильной сфере":"in the automotive field",
      "7+ лет":"7+ years",
      "ежедневной работы с аукционами США":"daily work with US auctions",
      "20–50 авто":"20–50 cars",
      "ежемесячно покупаю для клиентов":"bought monthly for clients",
      "опыт работы со страховыми и дилерскими аукционами":"experience with insurance and dealer auctions"
    }
  };

  const attrDict = {
    ro:{
      "Имя":"Nume",
      "Бюджет":"Buget",
      "Машина находится не на основной локации аукциона. Доплата +$100.":"Mașina nu se află în locația principală a licitației. Supliment +$100.",
      "Bill of Sale / Parts Only / ACQ. Документы требуют дополнительного оформления перед экспортом автомобиля. Срок получения обычно составляет 30–45 дней.":"Bill of Sale / Parts Only / ACQ. Actele necesită formalizare suplimentară înainte de exportul mașinii. Termenul de obținere este de obicei 30–45 de zile.",
      "Меню":"Meniu",
      "Позвонить 068-832-032":"Sună la 068-832-032",
      "Apex Auto — на главную":"Apex Auto — la pagina principală",
      "Доставка авто морем":"Transport auto pe mare",
      "Марки, которые мы возим":"Mărcile pe care le aducem",
      "Пример экономии при покупке авто":"Exemplu de economie la cumpărarea mașinii",
      "Вставьте ссылку Copart / IAAI / Manheim":"Introduceți linkul Copart / IAAI / Manheim",
      "Телефон":"Telefon",
      "Телефон или Telegram":"Telefon sau Telegram",
      "Какой автомобиль ищете? Например: BMW X5, Tesla Model Y, Porsche Macan":"Ce mașină căutați? De exemplu: BMW X5, Tesla Model Y, Porsche Macan",
      "VIN, номер лота или ссылка на Copart / IAAI":"VIN, număr lot sau link Copart / IAAI",
      "Автомобиль или ссылка на лот":"Mașină sau link către lot",
      "Коротко опишите задачу: расчет, подбор, проверка VIN, покупка под ключ":"Descrieți pe scurt: calcul, selecție, verificare VIN, cumpărare la cheie"
    },
    en:{
      "Имя":"Name",
      "Бюджет":"Budget",
      "Машина находится не на основной локации аукциона. Доплата +$100.":"The car is not at the auction's main location. +$100 surcharge.",
      "Bill of Sale / Parts Only / ACQ. Документы требуют дополнительного оформления перед экспортом автомобиля. Срок получения обычно составляет 30–45 дней.":"Bill of Sale / Parts Only / ACQ. The documents require extra processing before exporting the car. Issuance usually takes 30–45 days.",
      "Меню":"Menu",
      "Позвонить 068-832-032":"Call 068-832-032",
      "Apex Auto — на главную":"Apex Auto — to home",
      "Доставка авто морем":"Car shipping by sea",
      "Марки, которые мы возим":"Brands we import",
      "Пример экономии при покупке авто":"Savings example when buying a car",
      "Вставьте ссылку Copart / IAAI / Manheim":"Paste a Copart / IAAI / Manheim link",
      "Телефон":"Phone",
      "Телефон или Telegram":"Phone or Telegram",
      "Какой автомобиль ищете? Например: BMW X5, Tesla Model Y, Porsche Macan":"What car are you looking for? Example: BMW X5, Tesla Model Y, Porsche Macan",
      "VIN, номер лота или ссылка на Copart / IAAI":"VIN, lot number or Copart / IAAI link",
      "Автомобиль или ссылка на лот":"Car or lot link",
      "Коротко опишите задачу: расчет, подбор, проверка VIN, покупка под ключ":"Briefly describe the task: estimate, selection, VIN check, turnkey purchase"
    }
  };

  function translateText(text, lang){
    if(lang === "ru") return text;
    const map = dict[lang] || {};
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    return map[compact] || text;
  }

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

  function translateAttrs(lang){
    const map = attrDict[lang] || {};
    document.querySelectorAll("[placeholder]").forEach(el => {
      let src = el.__i18nPh;
      if(src === undefined){ src = el.getAttribute("placeholder") || ""; el.__i18nPh = src; }
      const val = lang === "ru" ? src : (map[src] || src);
      if(el.getAttribute("placeholder") !== val) el.setAttribute("placeholder", val);
    });
    document.querySelectorAll("[aria-label]").forEach(el => {
      if(el.closest("[data-no-i18n]")) return;
      let src = el.__i18nAria;
      if(src === undefined){ src = el.getAttribute("aria-label") || ""; el.__i18nAria = src; }
      const val = lang === "ru" ? src : (map[src] || src);
      if(el.getAttribute("aria-label") !== val) el.setAttribute("aria-label", val);
    });
    const titleMap = {
      ro:{
        "APEX AUTO — просчет под ключ":"APEX AUTO — calcul la cheie",
        "Горячие предложения — Apex Auto":"Oferte recomandate — Apex Auto",
        "Моя история — Apex Auto":"Povestea mea — Apex Auto",
        "Контакты — Apex Auto":"Contacte — Apex Auto"
      },
      en:{
        "APEX AUTO — просчет под ключ":"APEX AUTO — turnkey calculator",
        "Горячие предложения — Apex Auto":"Recommended lots — Apex Auto",
        "Моя история — Apex Auto":"My story — Apex Auto",
        "Контакты — Apex Auto":"Contacts — Apex Auto"
      }
    };
    if(!window.__i18nTitleSrc) window.__i18nTitleSrc = document.title;
    const titleSrc = window.__i18nTitleSrc;
    document.title = lang === "ru" ? titleSrc : (titleMap[lang]?.[titleSrc] || titleSrc);
  }

  function injectSwitcher(lang){
    const nav = document.querySelector(".mainNavV82");
    if(!nav || document.querySelector(".langSwitcherV165")) return;
    const wrap = document.createElement("div");
    wrap.className = "langSwitcherV165";
    wrap.setAttribute("aria-label", "Language");
    wrap.setAttribute("data-no-i18n", "true");
    wrap.innerHTML = SUPPORTED.map(code => `<button type="button" data-lang="${code}" class="${code === lang ? "active" : ""}">${code.toUpperCase()}</button>`).join("");
    wrap.addEventListener("click", event => {
      const button = event.target.closest("[data-lang]");
      if(!button) return;
      switchLang(button.dataset.lang);
    });
    nav.appendChild(wrap);
  }

  function apply(lang){
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    injectSwitcher(lang);
    walkText(document.body, lang);
    translateAttrs(lang);
    document.querySelectorAll(".langSwitcherV165 button").forEach(button => {
      button.classList.toggle("active", button.dataset.lang === lang);
    });
  }

  // Switch language in place — no page reload (avoids the header/photo flicker).
  function switchLang(lang){
    if(!SUPPORTED.includes(lang) || lang === currentLang) return;
    currentLang = lang;
    window.APEX_LANG = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(null, "", url.toString());
    } catch(e){}
    apply(lang);
    // re-render the calculator so its generated rows pick up the new language
    if(typeof window.calculate === "function"){ try { window.calculate(); apply(lang); } catch(e){} }
  }

  let currentLang = getLang();
  window.APEX_LANG = currentLang;

  document.addEventListener("DOMContentLoaded", () => {
    apply(currentLang);
    let timer = 0;
    const observer = new MutationObserver(() => {
      if(currentLang === "ru") return;
      clearTimeout(timer);
      timer = setTimeout(() => apply(currentLang), 60);
    });
    observer.observe(document.body, {subtree:true, childList:true});
  });
})();
