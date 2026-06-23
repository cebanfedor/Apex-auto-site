const supabase = require("./supabase");
const {sendJson, methodNotAllowed, readBody, getQuery} = require("./http");
const {requireAdmin} = require("./auth");

function cleanPayload(body, allowedFields){
  const payload = {};
  for(const field of allowedFields){
    if(Object.prototype.hasOwnProperty.call(body, field)){
      payload[field] = body[field] === "" ? null : body[field];
    }
  }
  return payload;
}

function listParams(request, options = {}){
  const query = getQuery(request);
  const limit = Math.min(Number(query.get("limit") || options.limit || 50), 200);
  const offset = Math.max(Number(query.get("offset") || 0), 0);
  const params = {
    select:options.select || "*",
    order:query.get("order") || options.order || "created_at.desc",
    limit,
    offset
  };

  if(options.searchFields?.length && query.get("q")){
    const term = query.get("q").replace(/[(),]/g, " ").trim();
    if(term){
      params.or = options.searchFields
        .map(field => `${field}.ilike.*${term}*`)
        .join(",");
    }
  }

  for(const filter of options.filters || []){
    const value = query.get(filter);
    if(value) params[filter] = `eq.${value}`;
  }

  return params;
}

function createCrudHandler({table, allowedFields, select = "*", order = "created_at.desc", searchFields = [], filters = [], fallbackList = null}){
  return async function handler(request, response){
    if(!requireAdmin(request, response)) return;

    try{
      if(request.method === "GET"){
        const params = listParams(request, {select, order, searchFields, filters});
        let items;
        try{
          items = await supabase.list(table, params);
        }catch(error){
          if(!fallbackList) throw error;
          items = await fallbackList(params);
        }
        sendJson(response, 200, {ok:true,items});
        return;
      }

      if(request.method === "POST"){
        const body = await readBody(request);
        const item = await supabase.create(table, cleanPayload(body, allowedFields));
        sendJson(response, 200, {ok:true,item});
        return;
      }

      methodNotAllowed(response, ["GET","POST"]);
    }catch(error){
      sendJson(response, error.status || 500, {ok:false,error:error.message,details:error.details || null});
    }
  };
}

function createItemHandler({table, allowedFields}){
  return async function handler(request, response){
    if(!requireAdmin(request, response)) return;
    const id = getQuery(request).get("id");
    if(!id){
      sendJson(response, 400, {ok:false,error:"Missing id"});
      return;
    }

    try{
      if(request.method === "PATCH" || request.method === "PUT"){
        const body = await readBody(request);
        const item = await supabase.update(table, id, cleanPayload(body, allowedFields));
        sendJson(response, 200, {ok:true,item});
        return;
      }

      if(request.method === "DELETE"){
        await supabase.remove(table, id);
        sendJson(response, 200, {ok:true});
        return;
      }

      methodNotAllowed(response, ["PATCH","PUT","DELETE"]);
    }catch(error){
      sendJson(response, error.status || 500, {ok:false,error:error.message,details:error.details || null});
    }
  };
}

module.exports = {
  createCrudHandler,
  createItemHandler,
  cleanPayload
};
