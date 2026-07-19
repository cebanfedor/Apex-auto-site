const crypto = require("node:crypto");

const COOKIE_NAME = "apex_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getSecret(){
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if(!secret) throw new Error("ADMIN_SESSION_SECRET or ADMIN_PASSWORD env var is required");
  return secret;
}

function sign(value){
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function timingSafeEqualText(a, b){
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if(left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseCookies(header = ""){
  return String(header || "").split(";").reduce((acc, part) => {
    const index = part.indexOf("=");
    if(index === -1) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if(key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function createSessionCookie(){
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_TTL_SECONDS;
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload = `${issuedAt}.${expiresAt}.${nonce}`;
  const token = `${payload}.${sign(payload)}`;
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie(){
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

function isAuthenticated(request){
  const cookies = parseCookies(request.headers?.cookie || "");
  const token = cookies[COOKIE_NAME];
  if(!token) return false;
  const parts = token.split(".");
  if(parts.length !== 4) return false;
  const payload = parts.slice(0, 3).join(".");
  const signature = parts[3];
  if(!timingSafeEqualText(signature, sign(payload))) return false;
  const expiresAt = Number(parts[1]);
  return Number.isFinite(expiresAt) && expiresAt > Math.floor(Date.now() / 1000);
}

function requireAdmin(request, response){
  if(isAuthenticated(request)) return true;
  response.status(401).json({ok:false,error:"Unauthorized"});
  return false;
}

function verifyPassword(password){
  const configured = process.env.ADMIN_PASSWORD;
  if(!configured) return false;
  return timingSafeEqualText(password, configured);
}

module.exports = {
  COOKIE_NAME,
  createSessionCookie,
  clearSessionCookie,
  isAuthenticated,
  requireAdmin,
  verifyPassword
};
