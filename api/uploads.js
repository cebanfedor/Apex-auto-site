const {sendJson, methodNotAllowed} = require("../server/http");
const {requireAdmin} = require("../server/auth");

function extensionFromType(type){
  if(type === "image/png") return "png";
  if(type === "image/webp") return "webp";
  if(type === "image/svg+xml") return "svg";
  return "jpg";
}

module.exports = async function handler(request, response){
  if(!requireAdmin(request, response)) return;
  if(request.method !== "POST"){
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try{
    if(!process.env.BLOB_READ_WRITE_TOKEN){
      sendJson(response, 500, {
        ok:false,
        error:"Missing BLOB_READ_WRITE_TOKEN. Connect Vercel Blob to the project or add the read-write token in Vercel Environment Variables."
      });
      return;
    }

    const {put} = require("@vercel/blob");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if(!buffer.length){
      sendJson(response, 400, {ok:false,error:"Empty file"});
      return;
    }

    const type = request.headers["content-type"] || "image/jpeg";
    if(!String(type).startsWith("image/")){
      sendJson(response, 400, {ok:false,error:"Only images are allowed"});
      return;
    }

    const folder = String(request.headers["x-apex-folder"] || "uploads").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const name = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extensionFromType(type)}`;
    const blob = await put(name, buffer, {
      access:"public",
      contentType:type
    });

    sendJson(response, 200, {ok:true,url:blob.url,pathname:blob.pathname});
  }catch(error){
    sendJson(response, 500, {ok:false,error:error.message});
  }
};
