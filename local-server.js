const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const handler = require("./api/lot.js");
const bidAdviceHandler = require("./api/bid-advice.js");

const apiRoutes = {
  "/api/admin":"./api/admin.js",
  "/api/auctions":"./api/auctions.js",
  "/api/hot-lots":"./api/hot-lots.js",
  "/api/vehicles":"./api/vehicles.js",
  "/api/customers":"./api/customers.js",
  "/api/leads":"./api/leads.js",
  "/api/content":"./api/content.js",
  "/api/uploads":"./api/uploads.js"
};

const root = __dirname;
const port = Number(process.env.PORT || 8081);
const mime = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"application/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".svg":"image/svg+xml",
  ".ico":"image/x-icon"
};

function send(res, status, body, type = "text/plain; charset=utf-8"){
  res.writeHead(status, {"content-type":type});
  res.end(body);
}

function jsonResponse(res){
  return {
    setHeader(name, value){
      res.setHeader(name, value);
      return this;
    },
    status(code){
      this.statusCode = code;
      return this;
    },
    json(payload){
      res.writeHead(this.statusCode || 200, {"content-type":"application/json; charset=utf-8"});
      res.end(JSON.stringify(payload));
    }
  };
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if(body.length > 1024 * 1024) reject(new Error("Request body too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  req.query = Object.fromEntries(url.searchParams.entries());

  if(url.pathname === "/api/lot"){
    return handler(req, jsonResponse(res));
  }

  if(url.pathname === "/api/w8-tracking"){
    const { vin, lot } = req.query;
    const query = vin || lot;
    if(!query){
      return send(res, 400, JSON.stringify({error:"vin or lot required"}), "application/json; charset=utf-8");
    }
    const paramKey = vin ? "vin" : "lot";
    const w8url = `https://dc.w8shipping.ua/ru/cargo-tracking?${paramKey}=${encodeURIComponent(query)}`;
    fetch(w8url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ApexAutoTracker/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      }
    }).then(r => {
      if(!r.ok) return send(res, 502, JSON.stringify({error:"W8 fetch failed", status:r.status}), "application/json; charset=utf-8");
      return r.text().then(html => {
        const chunks = [];
        const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
        let m;
        while((m = re.exec(html)) !== null) chunks.push(m[1]);
        const rsc = chunks.join("").replace(/\\n/g,"\n").replace(/\\\\/g,"\\").replace(/\\"/g,'"');
        if(!rsc.includes("tracking-results") && !rsc.includes("Car won")){
          return send(res, 404, JSON.stringify({error:"not_found",message:"Лот или VIN не найден в системе W8"}), "application/json; charset=utf-8");
        }
        function extractLabel(key){
          const rx = new RegExp(`"label":"${key}","value":"([^"]+)"`, "i");
          const m2 = rx.exec(rsc);
          return m2 ? m2[1] : null;
        }
        let stages = [];
        const stagesMatch = rsc.match(/"items":\[(\{"title":"[^}]+\}(?:,\{"title":"[^}]+\})*)\]/);
        if(stagesMatch){ try{ stages = JSON.parse("["+stagesMatch[1]+"]"); }catch(_){} }
        let vehicleName = null;
        const nameMatch = rsc.match(/"baggage-claim[^"]*"[^}]+\}[^\]]+\][^,]+,\s*"([0-9]{4}\s+[A-Z][^"]+)"\]/i);
        if(nameMatch) vehicleName = nameMatch[1];
        const vinCode = extractLabel("VIN number") || (vin ? vin : null);
        const portArrival = extractLabel("Expected arrival date");
        let etaChisinau = null;
        if(portArrival){
          const pd = new Date(portArrival + "T00:00:00Z");
          const dow = pd.getUTCDay();
          let days = 14;
          if(dow === 5) days += 2;
          else if(dow === 6) days += 1;
          pd.setUTCDate(pd.getUTCDate() + days);
          etaChisinau = pd.toISOString().slice(0, 10);
        }
        // Photos from W8 RSC
        const photoMatches = [...rsc.matchAll(/https:\/\/static\.w8shipping\.com\/images\/auto\/[^"'\s<>]+/g)];
        const photos = [...new Set(photoMatches.map(m => m[0]))].slice(0, 12);
        // NHTSA VIN decode
        let vehicleDecoded = vehicleName;
        const doNhtsa = () => {
          if(!vinCode || vehicleDecoded) return Promise.resolve();
          return fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vinCode)}?format=json`, {headers:{"Accept":"application/json"}})
            .then(r => r.ok ? r.json() : null)
            .then(j => {
              const r = j?.Results?.[0];
              if(r?.ModelYear && r?.Make && r?.Model) vehicleDecoded = `${r.ModelYear} ${r.Make} ${r.Model}`;
            }).catch(()=>{});
        };
        doNhtsa().then(() => {
          const data = {
            vehicle: vehicleDecoded,
            vin: vinCode,
            auction: extractLabel("Auction"),
            city: extractLabel("City"),
            lotNumber: extractLabel("Lot number"),
            keys: rsc.includes('"Yes"') ? "yes" : rsc.includes('"No"') ? "no" : null,
            container: {
              number: extractLabel("Container number"),
              booking: extractLabel("Booking number"),
              loadingPort: extractLabel("Loading port"),
              destinationPort: extractLabel("Destination port"),
              portArrival,
            },
            etaChisinau,
            stages,
            photos,
            source: "w8shipping",
          };
          res.setHeader("Cache-Control","s-maxage=600, stale-while-revalidate=60");
          send(res, 200, JSON.stringify(data), "application/json; charset=utf-8");
        });
      });
    }).catch(e => {
      send(res, 502, JSON.stringify({error:"W8 unreachable", detail:e.message}), "application/json; charset=utf-8");
    });
    return;
  }

  if(url.pathname === "/api/bid-advice"){
    return readBody(req)
      .then(body => {
        req.body = body;
        return bidAdviceHandler(req, jsonResponse(res));
      })
      .catch(() => send(res, 400, JSON.stringify({ok:false,error:"Bad request body"}), "application/json; charset=utf-8"));
  }

  if(apiRoutes[url.pathname]){
    if(url.pathname === "/api/uploads"){
      const routeHandler = require(apiRoutes[url.pathname]);
      return routeHandler(req, jsonResponse(res));
    }

    return readBody(req)
      .then(body => {
        if(body) req.body = body;
        const routeHandler = require(apiRoutes[url.pathname]);
        return routeHandler(req, jsonResponse(res));
      })
      .catch(error => send(res, 500, JSON.stringify({ok:false,error:error.message}), "application/json; charset=utf-8"));
  }

  let pathname = url.pathname === "/admin" ? "/admin/" : url.pathname;
  if(pathname === "/auctions") pathname = "/auctions.html";
  if(pathname === "/tracking") pathname = "/tracking.html";
  if(/^\/auctions\/[^/]+$/.test(pathname)) pathname = "/auctions.html";
  const safePath = path.normalize(pathname === "/" ? "/index.html" : pathname);
  const filePath = path.join(root, safePath.endsWith("/") ? `${safePath}index.html` : safePath);
  if(!filePath.startsWith(root)){
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if(error){
      send(res, 404, "Not found");
      return;
    }
    res.writeHead(200, {"content-type":mime[path.extname(filePath)] || "application/octet-stream"});
    res.end(data);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`APEX local API server: http://127.0.0.1:${port}`);
});
