function sendJson(response, status, payload, extraHeaders = {}){
  response.status(status).setHeader?.("content-type", "application/json; charset=utf-8");
  for(const [key, value] of Object.entries(extraHeaders)){
    response.setHeader?.(key, value);
  }
  response.json(payload);
}

function methodNotAllowed(response, methods = ["GET"]){
  response.setHeader?.("allow", methods.join(", "));
  sendJson(response, 405, {ok:false,error:"Method not allowed"});
}

async function readBody(request){
  if(request.body && typeof request.body === "object") return request.body;
  if(typeof request.body === "string" && request.body.trim()){
    return JSON.parse(request.body);
  }

  return new Promise((resolve, reject) => {
    let body = "";
    request.on?.("data", chunk => {
      body += chunk;
      if(body.length > 12 * 1024 * 1024) reject(new Error("Request body too large"));
    });
    request.on?.("end", () => {
      if(!body.trim()){
        resolve({});
        return;
      }
      try{
        resolve(JSON.parse(body));
      }catch(error){
        reject(error);
      }
    });
    request.on?.("error", reject);
  });
}

function getQuery(request){
  return new URL(request.url || "/", "http://localhost").searchParams;
}

module.exports = {
  sendJson,
  methodNotAllowed,
  readBody,
  getQuery
};
