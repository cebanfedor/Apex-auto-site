const {test} = require("node:test");
const assert = require("node:assert");
const {lotJsonLd, fuelText} = require("../server/lot-jsonld");

test("lotJsonLd: Car с фактами + Offer (USD, InStock)", () => {
  const ld = lotJsonLd({
    title:"2020 Tesla Model 3", make:"Tesla", model:"Model 3", year:2020,
    vin:"5YJ3E1EC2LF586908", odometer:42000, fuelKind:2, drive:"AWD",
    transmission:"Automatic", images:["https://cs.copart.com/a.jpg"],
    currentBid:15000, statusId:3, location:"Phoenix, AZ (USA)", auction:"copart", lot:"61420506"
  }, {url:"https://apexauto.md/auctions/copart-61420506-x", description:"desc"});
  assert.equal(ld["@type"], "Car");
  assert.equal(ld.vehicleIdentificationNumber, "5YJ3E1EC2LF586908");
  assert.equal(ld.brand.name, "Tesla");
  assert.equal(ld.vehicleModelDate, "2020");
  assert.equal(ld.mileageFromOdometer.value, 42000);
  assert.equal(ld.mileageFromOdometer.unitCode, "SMI");
  assert.equal(ld.fuelType, "Electric");
  assert.equal(ld.offers.priceCurrency, "USD");
  assert.equal(ld.offers.price, 15000);
  assert.equal(ld.offers.availability, "https://schema.org/InStock");
  assert.equal(ld.offers.seller.name, "Apex Auto");
});

test("lotJsonLd: канадский лот → CAD", () => {
  const ld = lotJsonLd({make:"BMW", model:"X3", year:2019, buyNow:20000, statusId:3, location:"Oshawa, Ontario, Canada"}, {});
  assert.equal(ld.offers.priceCurrency, "CAD");
  assert.equal(ld.offers.price, 20000);
});

test("lotJsonLd: проданный → SoldOut, финальная цена", () => {
  const past = new Date(Date.now() - 864e5).toISOString();
  const ld = lotJsonLd({make:"Honda", model:"Civic", year:2018, finalBid:8000, statusId:6, auctionDate:past, location:"Dallas, TX"}, {});
  assert.equal(ld.offers.availability, "https://schema.org/SoldOut");
  assert.equal(ld.offers.price, 8000);
});

test("lotJsonLd: невалидный VIN отброшен; без цены — нет offers", () => {
  const ld = lotJsonLd({make:"Ford", model:"Focus", year:2015, vin:"BADVIN", location:"Ohio"}, {});
  assert.equal(ld.vehicleIdentificationNumber, undefined);
  assert.equal(ld.offers, undefined);
});

test("fuelText: коды и текст фида", () => {
  assert.equal(fuelText({fuelKind:5}), "Plug-in hybrid");
  assert.equal(fuelText({fuelKind:3}), "Hybrid electric");
  assert.equal(fuelText({fuel:"Diesel"}), "Diesel");
  assert.equal(fuelText({fuel:"Gasoline"}), "Gasoline");
  assert.equal(fuelText({}), undefined);
});

test("lotJsonLd: не проданный (8) и ждущий утверждения (4) лот с прошедшей датой — SoldOut, открытый — InStock", () => {
  const base = {title:"2019 BMW X5", make:"BMW", model:"X5", year:2019, vin:"5UXCR6C57KLL12345", odometer:40000, auction:"copart", lot:"61420506"};
  const past = new Date(Date.now() - 864e5).toISOString(), fut = new Date(Date.now() + 864e5).toISOString();
  const notSold = lotJsonLd({...base, statusId:8, auctionDate:past, finalBid:5000, currentBid:5000}, {url:"https://apexauto.md/x"});
  assert.equal(notSold.offers.availability, "https://schema.org/SoldOut");
  assert.equal(notSold.offers.price, 5000);
  const approval = lotJsonLd({...base, statusId:4, auctionDate:past, finalBid:4200}, {url:"https://apexauto.md/x"});
  assert.equal(approval.offers.availability, "https://schema.org/SoldOut");
  const open = lotJsonLd({...base, statusId:3, auctionDate:fut, currentBid:900}, {url:"https://apexauto.md/x"});
  assert.equal(open.offers.availability, "https://schema.org/InStock");
  assert.equal(open.offers.price, 900);
});
