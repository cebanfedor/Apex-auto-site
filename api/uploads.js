const {sendJson, methodNotAllowed} = require("../server/http");
const {requireAdmin} = require("../server/auth");

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB

// Определяем тип по СИГНАТУРЕ файла, а не по клиентскому Content-Type (его можно
// подделать). SVG запрещён: как public-blob он даёт хранимый XSS при прямом
// открытии URL. Растровые PNG/JPEG/WEBP безопасны. P3-4.
function sniffImage(buffer){
  if(buffer.length < 12) return null;
  if(buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return {ext:"jpg", type:"image/jpeg"};
  if(buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return {ext:"png", type:"image/png"};
  if(buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return {ext:"webp", type:"image/webp"};
  return null;
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
    let received = 0;
    for await (const chunk of request){
      received += chunk.length;
      if(received > MAX_UPLOAD_BYTES){
        sendJson(response, 413, {ok:false,error:"Файл слишком большой (макс. 8 МБ)"});
        return;
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    if(!buffer.length){
      sendJson(response, 400, {ok:false,error:"Empty file"});
      return;
    }

    // Тип — по сигнатуре, не по заголовку. SVG и любой не-растровый файл отклоняем.
    const sniffed = sniffImage(buffer);
    if(!sniffed){
      sendJson(response, 400, {ok:false,error:"Разрешены только изображения PNG, JPEG или WEBP"});
      return;
    }

    const folder = String(request.headers["x-apex-folder"] || "uploads").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const name = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${sniffed.ext}`;
    const blob = await put(name, buffer, {
      access:"public",
      contentType:sniffed.type
    });

    sendJson(response, 200, {ok:true,url:blob.url,pathname:blob.pathname});
  }catch(error){
    console.error("uploads error:", error?.message || error);
    sendJson(response, 500, {ok:false,error:"Не удалось загрузить файл"});
  }
};
