/* =====================================================================
   Service Worker für den „Wochenkompass“
   Speichert die App auf dem Handy, damit sie auch mit schlechtem Netz startet.
   Videos werden NICHT gespeichert (laden nur mit Internet).
   ===================================================================== */
const VERSION = "wochenkompass-v38";   // bei Änderungen hochzählen
const DATEIEN = ["./", "index.html", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];

// 1) Installieren: App-Dateien speichern
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

// 2) Aktivieren: alte Versionen löschen
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((n) => Promise.all(n.filter((x) => x.startsWith("wochenkompass-") && x !== VERSION).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});

// 3) Anfragen: erst Netz (für Updates), bei Funkloch der Speicher
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url);
  if (url.origin !== location.origin) return;                               // Schriften usw. normal laden
  if (r.headers.has("range") || /\.mp4($|\?)/.test(url.pathname)) return;  // Videos direkt aus dem Netz
  // Seite selbst immer frisch vom Server holen (sonst zeigt das Handy bis zu 10 Min. die alte Version)
  const seite = r.mode === "navigate" || /\/$|\.html$|sw\.js$/.test(url.pathname);
  e.respondWith(
    (seite ? fetch(r.url, {cache: "no-cache", credentials: "same-origin"}) : fetch(r)).then((res) => {
      if (res.ok) { const kopie = res.clone(); caches.open(VERSION).then((c) => c.put(r, kopie)); }
      return res;
    }).catch(() => caches.match(r).then((m) => m || caches.match("index.html")))
  );
});
