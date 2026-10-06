/* Caisse SaaS Pro — Service Worker (accès hors-ligne)
   ► Placer ce fichier à la racine, à côté de index.html.
   ► Incrémenter CACHE_VERSION à chaque déploiement de index.html. */
const CACHE_VERSION = "caisse-v5";
const SHELL = "shell-" + CACHE_VERSION;
const RUNTIME = "runtime-" + CACHE_VERSION;

const LOCAL_ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
const CDN_ASSETS = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-app-compat.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-firestore-compat.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-auth-compat.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // allSettled : un fichier manquant (ex. icône) ne doit pas faire échouer toute l'installation
    await Promise.allSettled([...LOCAL_ASSETS, ...CDN_ASSETS].map((u) => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, RUNTIME];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

// Ne jamais intercepter Firestore / Auth : le SDK gère lui-même son cache hors-ligne (IndexedDB)
const BYPASS = /(firestore|firebaseio|identitytoolkit|securetoken|googleapis)\.com\/(?!css|.*\.woff)/;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (BYPASS.test(req.url) && !/fonts\.(googleapis|gstatic)\.com/.test(url.host)) return;

  // Pages : réseau d'abord (4 s) pour récupérer les mises à jour, sinon version en cache
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const fresh = await fetch(req, { signal: ctrl.signal });
        clearTimeout(t);
        const c = await caches.open(SHELL); c.put("./index.html", fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Ressources (CDN versionnés, polices, icônes) : cache d'abord, revalidation en arrière-plan
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async (res) => {
      if (res && (res.ok || res.type === "opaque")) { const c = await caches.open(RUNTIME); c.put(req, res.clone()); }
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
