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
    "engine"
  ]
};

const collectionHandler = createCrudHandler(options);
const itemHandler = createItemHandler(options);

module.exports = function handler(request, response){
  const id = getQuery(request).get("id");
  return id ? itemHandler(request, response) : collectionHandler(request, response);
};
