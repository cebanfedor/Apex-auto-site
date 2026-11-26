/* Apex Auto — service worker только для web push (26.11.2026).
   Намеренно БЕЗ fetch-обработчика и кэша: сайт работает как раньше, версионные ?v= ссылки не затрагиваются. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let d = {};
  try{ d = event.data ? event.data.json() : {}; }catch(e){ d = {title: "Apex Auto", body: event.data ? event.data.text() : ""}; }
  const title = d.title || "Apex Auto";
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "/favicon-96.png",
    badge: "/favicon-96.png",
    tag: d.tag || "apex",
    renotify: true,
    data: {url: d.url || "/cabinet"}
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/cabinet";
  let url; try{ url = new URL(raw, self.location.origin); if(url.origin !== self.location.origin) url = new URL("/cabinet", self.location.origin); }catch(e){ url = new URL("/cabinet", self.location.origin); }
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for(const c of all){
      if(c.url.startsWith(self.location.origin)){ try{ await c.navigate(url.href); }catch(e){} return c.focus(); }
    }
    return self.clients.openWindow(url.href);
  })());
});
