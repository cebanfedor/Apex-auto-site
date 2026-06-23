const SUPABASE_REST_PATH = "/rest/v1";

function getSupabaseConfig(){
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if(!url || !key){
    const missing = [];
    if(!url) missing.push("SUPABASE_URL");
    if(!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    const error = new Error(`Missing ${missing.join(", ")}`);
    error.status = 500;
    throw error;
  }
  return {url:url.replace(/\/$/, ""), key};
}

function headers(extra = {}){
  const {key} = getSupabaseConfig();
  return {
    "apikey":key,
    "authorization":`Bearer ${key}`,
    "content-type":"application/json",
    "prefer":"return=representation",
    ...extra
  };
}

function buildUrl(table, params = {}){
  const {url} = getSupabaseConfig();
  const search = new URLSearchParams();
  for(const [key, value] of Object.entries(params)){
    if(value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return `${url}${SUPABASE_REST_PATH}/${encodeURIComponent(table)}${search.toString() ? `?${search}` : ""}`;
}

async function parseSupabaseResponse(response){
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if(!response.ok){
    const error = new Error(payload?.message || payload?.error || "Supabase request failed");
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload;
}

async function list(table, params = {}){
  const response = await fetch(buildUrl(table, params), {
    method:"GET",
    headers:headers({"prefer":"count=exact"})
  });
  return parseSupabaseResponse(response);
}

async function count(table, params = {}){
  const response = await fetch(buildUrl(table, {select:"id", ...params}), {
    method:"HEAD",
    headers:headers({"prefer":"count=exact"})
  });
  if(!response.ok){
    await parseSupabaseResponse(response);
  }
  const range = response.headers.get("content-range") || "*/0";
  return Number(range.split("/").pop()) || 0;
}

async function create(table, payload){
  const response = await fetch(buildUrl(table), {
    method:"POST",
    headers:headers(),
    body:JSON.stringify(payload)
  });
  const data = await parseSupabaseResponse(response);
  return Array.isArray(data) ? data[0] : data;
}

async function update(table, id, payload){
  const response = await fetch(buildUrl(table, {id:`eq.${id}`}), {
    method:"PATCH",
    headers:headers(),
    body:JSON.stringify(payload)
  });
  const data = await parseSupabaseResponse(response);
  return Array.isArray(data) ? data[0] : data;
}

async function remove(table, id){
  const response = await fetch(buildUrl(table, {id:`eq.${id}`}), {
    method:"DELETE",
    headers:headers()
  });
  return parseSupabaseResponse(response);
}

module.exports = {
  list,
  count,
  create,
  update,
  remove
};
