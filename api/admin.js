const {readBody, sendJson, methodNotAllowed, getQuery} = require("../server/http");
const {
  createSessionCookie,
  clearSessionCookie,
  isAuthenticated,
  requireAdmin,
  verifyPassword
} = require("../server/auth");
const supabase = require("../server/supabase");

async function getLatestLeads(){
  const params = {
    select:"*,customers(name,phone),vehicles(make,model,year,lot)",
    order:"created_at.desc",
    limit:8
  };
  try{
    return await supabase.list("leads", params);
  }catch(error){
    return supabase.list("leads", {...params, select:"*"});
  }
}

async function login(request, response){
  if(request.method !== "POST"){
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try{
    const body = await readBody(request);
    if(!verifyPassword(body.password)){
      await new Promise(r => setTimeout(r, 1500));
      sendJson(response, 401, {ok:false,error:"Неверный пароль"});
      return;
    }
    response.setHeader("set-cookie", createSessionCookie());
    sendJson(response, 200, {ok:true});
  }catch(error){
    sendJson(response, 400, {ok:false,error:"Bad request"});
  }
}

function logout(request, response){
  if(request.method !== "POST"){
    methodNotAllowed(response, ["POST"]);
    return;
  }
  response.setHeader("set-cookie", clearSessionCookie());
  sendJson(response, 200, {ok:true});
}

function me(request, response){
  if(request.method !== "GET"){
    methodNotAllowed(response, ["GET"]);
    return;
  }
  sendJson(response, 200, {ok:true,authenticated:isAuthenticated(request)});
}

async function dashboard(request, response){
  if(!requireAdmin(request, response)) return;
  if(request.method !== "GET"){
    methodNotAllowed(response, ["GET"]);
    return;
  }

  try{
    const [customersCount, leadsCount, vehiclesCount, latestLeads] = await Promise.all([
      supabase.count("customers"),
      supabase.count("leads"),
      supabase.count("vehicles"),
      getLatestLeads()
    ]);

    sendJson(response, 200, {
      ok:true,
      stats:{
        customers:customersCount,
        leads:leadsCount,
        vehicles:vehiclesCount
      },
      latestLeads
    });
  }catch(error){
    sendJson(response, error.status || 500, {ok:false,error:error.message,details:error.details || null});
  }
}

module.exports = async function handler(request, response){
  const action = getQuery(request).get("action") || "me";
  if(action === "login") return login(request, response);
  if(action === "logout") return logout(request, response);
  if(action === "me") return me(request, response);
  if(action === "dashboard") return dashboard(request, response);
  sendJson(response, 404, {ok:false,error:"Unknown admin action"});
};
