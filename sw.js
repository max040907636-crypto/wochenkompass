/* =====================================================================
   Service Worker für den „Wochenkompass“
   Speichert die App auf dem Handy, damit sie SOFORT startet – auch mit
   schlechtem oder gar keinem Netz.
   Ablauf seit v52 („erst Speicher, dann Netz im Hintergrund“):
     1. Die App kommt sofort aus dem Speicher.
     2. Gleichzeitig wird im Hintergrund geprüft, ob es eine neue Version gibt.
        Wenn ja, landet sie im Speicher → beim nächsten Öffnen ist sie da.
     3. Die App selbst zeigt „🆕 Neue Version da – Jetzt laden“ (Block v48).
   Videos werden NICHT gespeichert (laden nur mit Internet).
   ===================================================================== */
const VERSION = "wochenkompass-v52";   // bei Änderungen hochzählen (macht das Build-Skript automatisch)
const DATEIEN = ["index.html", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];
// Die Seite liegt immer unter EINEM Schlüssel im Speicher, egal ob „/wochenkompass/“ oder „…/index.html“ aufgerufen wird
const SEITE = new URL("index.html", self.registration.scope).href;

// Frisch vom Server holen (am Browser-Zwischenspeicher vorbei, mit ETag → nur Daten, wenn sich etwas geändert hat)
const frisch = (url) => fetch(url, {cache: "no-cache", credentials: "same-origin"});

// Seite frisch holen und im Speicher ablegen
function seiteAktualisieren() {
  return frisch(SEITE).then((res) => {
    if (!res.ok) throw new Error("HTTP " + res.status);
    const kopie = res.clone();
    return caches.open(VERSION).then((c) => c.put(SEITE, kopie)).then(() => res);
  });
}

// 1) Installieren: App-Dateien frisch vom Server speichern
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(DATEIEN.map((d) => new Request(d, {cache: "reload"}))))
    .then(() => self.skipWaiting()));
});

// 2) Aktivieren: alte Versionen löschen
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((n) => Promise.all(n.filter((x) => x.startsWith("wochenkompass-") && x !== VERSION).map((x) => caches.delete(x))))
    .then(() => self.clients.claim()));
});

// 3) Anfragen
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url);
  if (url.origin !== location.origin) return;                               // Schriften usw. normal laden
  if (r.headers.has("range") || /\.mp4($|\?)/.test(url.pathname)) return;  // Videos direkt aus dem Netz

  // a) sw.js: immer frisch (daran erkennt die App, ob es eine neue Version gibt)
  if (/sw\.js$/.test(url.pathname)) {
    e.respondWith(frisch(r.url).catch(() => caches.match(r)));
    return;
  }

  // b) Die App-Seite: sofort aus dem Speicher, im Hintergrund aktualisieren
  const istSeite = r.mode === "navigate" || /\/$|\/index\.html$/.test(url.pathname);
  if (istSeite) {
    const netz = seiteAktualisieren();
    e.waitUntil(netz.then(() => {}, () => {}));                            // Hintergrund-Update zu Ende laufen lassen
    e.respondWith(caches.match(SEITE).then((m) => m || netz).catch(() => caches.match(SEITE)));
    return;
  }

  // c) Alles andere (Grafiken, Icons …): erst Netz, beim Funkloch der Speicher
  e.respondWith(fetch(r).then((res) => {
    if (res.ok) { const kopie = res.clone(); caches.open(VERSION).then((c) => c.put(r, kopie)); }
    return res;
  }).catch(() => caches.match(r)));
});

// 4) Knopf „Jetzt laden“ in der App: neue Seite sicher in den Speicher holen, dann Bescheid geben
self.addEventListener("message", (e) => {
  if (!e.data || e.data.typ !== "frisch") return;
  const antwort = (ok) => { if (e.ports && e.ports[0]) e.ports[0].postMessage({ok}); };
  e.waitUntil(seiteAktualisieren().then(() => antwort(true), () => antwort(false)));
});
