// public/sw.js
// ShopAccounting PWA Service Worker v1.0.0

const CACHE_NAME = 'shopaccounting-v1';
const STATIC_CACHE = 'shopaccounting-static-v1';
const DYNAMIC_CACHE = 'shopaccounting-dynamic-v1';

// فایل‌هایی که باید cache شوند
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/fonts/PeydaWeb-Regular.woff2',
  '/fonts/PeydaWeb-Medium.woff2',
  '/fonts/PeydaWeb-SemiBold.woff2',
  '/fonts/PeydaWeb-Bold.woff2',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// API‌هایی که نباید cache شوند
const NO_CACHE_PATTERNS = [
  /\/api\/auth\//,
  /\/api\/subscription\//,
  /\/api\/payments\//,
  /\/api\/tickets\//,
];

// ─── Install Event ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      // از addAll استفاده نمی‌کنیم تا اگر یک فایل نبود کل install fail نشه
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err);
          })
        )
      );
    }).then(() => {
      console.log('[SW] Installed successfully');
      return self.skipWaiting();
    })
  );
});

// ─── Activate Event ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return (
              name !== STATIC_CACHE &&
              name !== DYNAMIC_CACHE &&
              name !== CACHE_NAME
            );
          })
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activated successfully');
      return self.clients.claim();
    })
  );
});

// ─── Fetch Event ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // فقط same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // POST/PUT/DELETE را cache نکن
  if (request.method !== 'GET') {
    return;
  }

  // API‌های حساس را cache نکن
  const shouldSkip = NO_CACHE_PATTERNS.some((pattern) =>
    pattern.test(url.pathname)
  );
  if (shouldSkip) {
    return;
  }

  // استراتژی: Network First برای API، Cache First برای assets
  if (url.pathname.startsWith('/api/')) {
    // Network First
    event.respondWith(
      fetch(request)
        .then((response) => {
          // فقط موفق را cache کن
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // اگر آفلاین بود از cache بخون
          return caches.match(request).then((cached) => {
            if (cached) {
              return cached;
            }
            // اگر cache هم نداشت، خطای آفلاین برگردون
            return new Response(
              JSON.stringify({ error: 'آفلاین هستید', offline: true }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          });
        })
    );
  } else {
    // Cache First برای static assets
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        // اگر cache نداشت از network بگیر
        return fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          // صفحه آفلاین برای navigation
          if (request.destination === 'document') {
            return caches.match('/').then((homePage) => {
              return homePage || new Response('آفلاین هستید', {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
              });
            });
          }
        });
      })
    );
  }
});

// ─── Push Notifications (آینده) ──────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-32x32.png',
    dir: 'rtl',
    lang: 'fa',
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ShopAccounting', options)
  );
});

console.log('[SW] Script loaded successfully');