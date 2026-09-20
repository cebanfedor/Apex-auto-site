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

const SB_BUCKET = "site-uploads";
let sbBucketReady = false;
async function putSupabase(name, buffer, contentType){
  const base = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if(!base || !key) throw new Error("Нет хранилища для фото: не заданы ни BLOB_READ_WRITE_TOKEN, ни SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");
  const auth = {apikey:key, authorization:`Bearer ${key}`};
  const upload = () => fetch(`${base}/storage/v1/object/${SB_BUCKET}/${name}`, {
    method:"POST",
    headers:{...auth, "content-type":contentType, "cache-control":"public, max-age=31536000, immutable", "x-upsert":"false"},
    body:buffer
  });
  let r = await upload();
  if(!r.ok && !sbBucketReady){
    // Бакета ещё нет → создаём публичный (только картинки, до 8 МБ) и повторяем.
    await fetch(`${base}/storage/v1/bucket`, {
      method:"POST",
      headers:{...auth, "content-type":"application/json"},
      body:JSON.stringify({id:SB_BUCKET, name:SB_BUCKET, public:true, file_size_limit:MAX_UPLOAD_BYTES, allowed_mime_types:["image/jpeg","image/png","image/webp"]})
    }).catch(() => null);
    r = await upload();
  }
  if(!r.ok){
    const t = await r.text().catch(() => "");
    throw new Error("Supabase Storage: " + r.status + " " + t.slice(0, 160));
  }
  sbBucketReady = true;
  return `${base}/storage/v1/object/public/${SB_BUCKET}/${name}`;
}

module.exports = async function handler(request, response){
  if(!requireAdmin(request, response)) return;
  if(request.method !== "POST"){
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try{
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
    // Хранилище: Vercel Blob, если подключён; иначе — Supabase Storage (ключ уже есть,
    // отдельной настройки не требует; публичный бакет создаётся при первой загрузке).
    if(process.env.BLOB_READ_WRITE_TOKEN){
      const {put} = require("@vercel/blob");
      const blob = await put(name, buffer, {access:"public", contentType:sniffed.type});
      sendJson(response, 200, {ok:true,url:blob.url,pathname:blob.pathname});
      return;
    }
    const url = await putSupabase(name, buffer, sniffed.type);
    sendJson(response, 200, {ok:true,url,pathname:name});
  }catch(error){
    console.error("uploads error:", error?.message || error);
    sendJson(response, 500, {ok:false,error:"Не удалось загрузить файл: " + String(error?.message || error).slice(0, 200)});
  }
};
