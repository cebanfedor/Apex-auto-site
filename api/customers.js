const {createCrudHandler, createItemHandler} = require("../server/crud");
const {getQuery} = require("../server/http");

const options = {
  table:"customers",
  order:"created_at.desc",
  searchFields:["name","phone","telegram","whatsapp","email","source","status"],
  filters:["status","source"],
  allowedFields:[
    "name",
    "phone",
    "telegram",
    "whatsapp",
    "email",
    "source",
    "status",
    "notes"
  ]
};

const collectionHandler = createCrudHandler(options);
const itemHandler = createItemHandler(options);

module.exports = function handler(request, response){
  const id = getQuery(request).get("id");
  return id ? itemHandler(request, response) : collectionHandler(request, response);
};
