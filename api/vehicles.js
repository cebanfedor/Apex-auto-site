const {createCrudHandler, createItemHandler} = require("../server/crud");
const {getQuery} = require("../server/http");

const options = {
  table:"vehicles",
  order:"created_at.desc",
  searchFields:["vin","lot","make","model","status"],
  filters:["status"],
  allowedFields:[
    "vin",
    "lot",
    "year",
    "make",
    "model",
    "description",
    "price",
    "status",
    "photos",
    "auction",
    "auction_url",
    "mileage",
    "damage",
    "fuel",
    "engine",
    "price_includes",
    "repair_estimate",
    "eta_date"
  ]
};

const collectionHandler = createCrudHandler(options);
// Удаление авто: отвязать его лиды (vehicle_id → null) — та же причина, что у клиентов
// (api/customers.js): FK-constraint иначе блокирует DELETE.
const itemHandler = createItemHandler({...options, detach:[{table:"leads", field:"vehicle_id"}]});

module.exports = function handler(request, response){
  const id = getQuery(request).get("id");
  return id ? itemHandler(request, response) : collectionHandler(request, response);
};
