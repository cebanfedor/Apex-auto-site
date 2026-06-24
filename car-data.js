/* car-data.js — makes + models reference for the auctions filter autocomplete.
   Make/model are sent to the API as search text (search_query), so this works
   with the existing AuctionsAPI integration without a manufacturers endpoint. */
(function(global){
  const MODELS = {
    "Acura": ["ILX","RDX","MDX","TLX","TSX","RL","TL","RSX","Integra","NSX","ZDX"],
    "Alfa Romeo": ["Giulia","Stelvio","4C","Giulietta","159","Tonale"],
    "Aston Martin": ["DB9","DB11","DBS","Vantage","Rapide","DBX","Vanquish"],
    "Audi": ["A3","A4","A5","A6","A7","A8","Q3","Q5","Q7","Q8","TT","R8","e-tron","S4","S5","RS5","RS7"],
    "BMW": ["1 Series","2 Series","3 Series","4 Series","5 Series","6 Series","7 Series","8 Series","X1","X2","X3","X4","X5","X6","X7","Z4","M2","M3","M4","M5","i3","i4","i8","iX"],
    "Bentley": ["Continental","Bentayga","Flying Spur","Mulsanne"],
    "Buick": ["Enclave","Encore","Envision","LaCrosse","Regal","Verano","Lacrosse"],
    "Cadillac": ["ATS","CTS","XTS","CT4","CT5","CT6","Escalade","SRX","XT4","XT5","XT6","Lyriq"],
    "Chevrolet": ["Camaro","Corvette","Cruze","Malibu","Impala","Spark","Sonic","Bolt","Volt","Trax","Trailblazer","Equinox","Blazer","Traverse","Tahoe","Suburban","Colorado","Silverado","Express"],
    "Chrysler": ["300","Pacifica","Town & Country","200","Voyager"],
    "Dodge": ["Charger","Challenger","Durango","Journey","Grand Caravan","Dart","Ram"],
    "Ferrari": ["488","458","F8","Roma","Portofino","812","SF90","California"],
    "Fiat": ["500","500L","500X","124 Spider"],
    "Ford": ["Fiesta","Focus","Fusion","Mustang","Taurus","EcoSport","Escape","Edge","Explorer","Expedition","Bronco","Bronco Sport","Ranger","F-150","F-250","F-350","Transit","Maverick","Mustang Mach-E"],
    "Genesis": ["G70","G80","G90","GV70","GV80"],
    "GMC": ["Terrain","Acadia","Yukon","Canyon","Sierra","Savana"],
    "Honda": ["Civic","Accord","Insight","Fit","HR-V","CR-V","Passport","Pilot","Odyssey","Ridgeline","Element","Clarity"],
    "Hyundai": ["Accent","Elantra","Sonata","Veloster","Ioniq","Kona","Venue","Tucson","Santa Fe","Palisade","Santa Cruz","Genesis"],
    "Infiniti": ["Q50","Q60","Q70","QX50","QX55","QX60","QX80","G35","G37","FX35"],
    "Jaguar": ["XE","XF","XJ","F-Type","E-Pace","F-Pace","I-Pace"],
    "Jeep": ["Renegade","Compass","Cherokee","Grand Cherokee","Wrangler","Gladiator","Wagoneer","Patriot"],
    "Kia": ["Rio","Forte","K5","Optima","Stinger","Soul","Seltos","Sportage","Sorento","Telluride","Carnival","Niro","EV6"],
    "Lamborghini": ["Huracan","Aventador","Urus","Gallardo"],
    "Land Rover": ["Range Rover","Range Rover Sport","Range Rover Velar","Range Rover Evoque","Discovery","Discovery Sport","Defender"],
    "Lexus": ["IS","ES","GS","LS","RC","LC","UX","NX","RX","GX","LX","CT"],
    "Lincoln": ["MKZ","Continental","Corsair","MKC","Nautilus","MKX","Aviator","Navigator"],
    "Maserati": ["Ghibli","Quattroporte","Levante","GranTurismo","MC20"],
    "Mazda": ["Mazda3","Mazda6","MX-5 Miata","CX-3","CX-30","CX-5","CX-9","CX-50"],
    "Mercedes-Benz": ["A-Class","C-Class","E-Class","S-Class","CLA","CLS","GLA","GLB","GLC","GLE","GLS","G-Class","SL","AMG GT","Sprinter","Metris"],
    "Mini": ["Cooper","Clubman","Countryman","Hardtop","Convertible"],
    "Mitsubishi": ["Mirage","Lancer","Eclipse Cross","Outlander","Outlander Sport"],
    "Nissan": ["Versa","Sentra","Altima","Maxima","370Z","GT-R","Leaf","Kicks","Rogue","Murano","Pathfinder","Armada","Frontier","Titan","NV200"],
    "Porsche": ["911","718 Cayman","718 Boxster","Panamera","Macan","Cayenne","Taycan"],
    "Ram": ["1500","2500","3500","ProMaster","ProMaster City"],
    "Rolls-Royce": ["Ghost","Phantom","Wraith","Cullinan","Dawn"],
    "Subaru": ["Impreza","WRX","Legacy","BRZ","Crosstrek","Forester","Outback","Ascent"],
    "Tesla": ["Model 3","Model S","Model X","Model Y","Roadster","Cybertruck"],
    "Toyota": ["Corolla","Camry","Avalon","Prius","Yaris","86","GR86","Supra","C-HR","Corolla Cross","RAV4","Venza","Highlander","4Runner","Sequoia","Land Cruiser","Tacoma","Tundra","Sienna"],
    "Volkswagen": ["Jetta","Passat","Golf","GTI","Arteon","Beetle","Taos","Tiguan","Atlas","Atlas Cross Sport","ID.4"],
    "Volvo": ["S60","S90","V60","V90","XC40","XC60","XC90","C40"]
  };
  const EXTRA_MAKES = ["Hummer","Isuzu","Lotus","McLaren","Mercury","Pontiac","Saab","Saturn","Scion","Smart","Suzuki","Polestar","Rivian","Lucid","Fisker"];
  const makes = Array.from(new Set([...Object.keys(MODELS), ...EXTRA_MAKES])).sort();
  // Standard Copart/IAAI primary-damage descriptions (best-effort; confirm against API docs).
  const damages = ["All Over","Front End","Rear End","Side","Left Front","Right Front","Left Rear","Right Rear","Top/Roof","Undercarriage","Mechanical","Electrical","Engine Damage","Frame Damage","Hail","Water/Flood","Fire","Vandalism","Minor Dent/Scratches","Normal Wear","Rollover","Stripped","Biohazard/Chemical","Suspension","Unknown"];
  // AuctionsAPI color ids (from /cars docs)
  const colors = [
    {id:13,name:"Белый"},{id:15,name:"Чёрный"},{id:9,name:"Серый"},{id:1,name:"Серебристый"},
    {id:11,name:"Синий"},{id:5,name:"Красный"},{id:4,name:"Зелёный"},{id:8,name:"Коричневый"},
    {id:16,name:"Жёлтый"},{id:3,name:"Оранжевый"},{id:6,name:"Золотой"},{id:7,name:"Угольный"},
    {id:12,name:"Бронзовый"},{id:14,name:"Кремовый"},{id:17,name:"Бежевый"},{id:2,name:"Фиолетовый"},
    {id:10,name:"Бирюзовый"},{id:18,name:"Розовый"}
  ];
  // US states (state_code = 2-letter)
  const states = [
    ["AL","Алабама"],["AK","Аляска"],["AZ","Аризона"],["AR","Арканзас"],["CA","Калифорния"],["CO","Колорадо"],
    ["CT","Коннектикут"],["DE","Делавэр"],["FL","Флорида"],["GA","Джорджия"],["HI","Гавайи"],["ID","Айдахо"],
    ["IL","Иллинойс"],["IN","Индиана"],["IA","Айова"],["KS","Канзас"],["KY","Кентукки"],["LA","Луизиана"],
    ["ME","Мэн"],["MD","Мэриленд"],["MA","Массачусетс"],["MI","Мичиган"],["MN","Миннесота"],["MS","Миссисипи"],
    ["MO","Миссури"],["MT","Монтана"],["NE","Небраска"],["NV","Невада"],["NH","Нью-Гэмпшир"],["NJ","Нью-Джерси"],
    ["NM","Нью-Мексико"],["NY","Нью-Йорк"],["NC","Сев. Каролина"],["ND","Сев. Дакота"],["OH","Огайо"],["OK","Оклахома"],
    ["OR","Орегон"],["PA","Пенсильвания"],["RI","Род-Айленд"],["SC","Юж. Каролина"],["SD","Юж. Дакота"],["TN","Теннесси"],
    ["TX","Техас"],["UT","Юта"],["VT","Вермонт"],["VA","Вирджиния"],["WA","Вашингтон"],["WV","Зап. Вирджиния"],
    ["WI","Висконсин"],["WY","Вайоминг"],["DC","Вашингтон, округ Колумбия"]
  ].map(s => ({id:s[0], name:`${s[1]} (${s[0]})`}));
  global.CAR_DATA = { makes, models: MODELS, damages, colors, states };
})(window);
