const {createCrudHandler, createItemHandler} = require("../server/crud");
const {getQuery} = require("../server/http");
const supabase = require("../server/supabase");

const options = {
  table:"leads",
  select:"*,customers(name,phone,telegram),vehicles(make,model,year,lot,vin)",
  fallbackList: async params => supabase.list("leads", {...params, select:"*"}),
  order:"created_at.desc",
  searchFields:["title","message","status","source"],
  filters:["status","customer_id","vehicle_id"],
  allowedFields:[
    "customer_id",
    "vehicle_id",
    "title",
    "message",
    "status",
    "source",
    "budget",
    "next_contact_at"
  ]
};

const collectionHandler = createCrudHandler(options);
const itemHandler = createItemHandler(options);

module.exports = function handler(request, response){
  const id = getQuery(request).get("id");
  return id ? itemHandler(request, response) : collectionHandler(request, response);
};
