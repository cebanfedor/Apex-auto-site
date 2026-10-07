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
// Удаление клиента: отвязать его лиды (customer_id → null), иначе FK-constraint блокирует
// DELETE — лид остаётся в CRM, просто без привязанного клиента.
const itemHandler = createItemHandler({...options, detach:[{table:"leads", field:"customer_id"}]});

module.exports = function handler(request, response){
  const id = getQuery(request).get("id");
  return id ? itemHandler(request, response) : collectionHandler(request, response);
};
