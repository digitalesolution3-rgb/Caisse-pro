const CACHE_NAME = 'caisse-pro-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-app-compat.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-firestore-compat.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-auth-compat.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Outfit:wght@400;500;600;700;800;900&display=swap'
];

// Installation du Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Stratégie de cache: Network First avec fallback
self.addEventListener('fetch', event => {
  // Ne pas intercepter les appels Firebase (préserver la synchronisation temps réel)
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('firestore') ||
      event.request.url.includes('googleapis')) {
    return;
  }
  
  // Pour les requêtes POST, ne pas cacher
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Mettre en cache les réponses réussies
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Fallback: retourner depuis le cache
        return caches.match(event.request)
          .then(response => {
            if (response) {
              return response;
            }
            // Si la page index.html est demandée et pas en cache
            if (event.request.url.endsWith('/') || event.request.url.includes('index.html')) {
              return caches.match('/index.html');
            }
            return new Response('Hors ligne - Contenu non disponible', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// Gestion des notifications push (optionnel)
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Nouvelle notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Caisse Pro', options)
  );
});

// Gestion du clic sur notification
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});