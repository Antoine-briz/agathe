const CACHE = "agathe-v7";
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./share.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png",
  "./icon-maskable-512.png"
];

// Installation : met en cache les fichiers de l'app. Promise.allSettled ->
// l'installation réussit même si l'un des fichiers (ex. une icône) manque.
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(CORE.map(u => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

async function cachePut(req, res) {
  try { const c = await caches.open(CACHE); await c.put(req, res); } catch (_) { /* schéma non cachable, etc. */ }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;                 // laisse passer POST/PUT (écriture GitHub)

  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;  // ignore chrome-extension://, data:, etc.
  if (url.hostname === "api.github.com") return;     // API GitHub : toujours direct (données à jour + jeton)

  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Fichiers de l'app : cache d'abord, puis réseau.
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match("./index.html")))
    );
    return;
  }

  if (url.hostname === "cdn.jsdelivr.net") {
    // Police d'icônes : cache pour le hors-ligne.
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => { cachePut(req, res.clone()); return res; }).catch(() => hit))
    );
  }
  // Autres origines (extensions, etc.) : on ne fait rien, le navigateur gère.
});

/* Notifications push (utile seulement si un service d'envoi est ajouté plus tard) */
self.addEventListener("push", e => {
  let d = { title: "Agathe", body: "Rappel biberon" };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (_) { }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: "icon-192.png", badge: "icon-192.png",
    tag: d.tag || "feed", renotify: true, vibrate: [120, 60, 120], data: d
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow("./");
  }));
});
