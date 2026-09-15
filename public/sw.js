// public/sw.js
// ShopAccounting PWA Service Worker v1.1.0
// ★★★ v1.1.0: FIX ریشه‌ای — صفحات ناوبری (HTML) دیگر Cache First نیستند
//   مشکل قبلی: چون مسیر '/' با استراتژی Cache First سرو می‌شد، بعد از هر
//   دیپلوی جدید در Railway، کاربر همچنان همان HTML/باندل JS نسخه‌ی قدیمی را
//   می‌گرفت (چون محتوای این فایل sw.js بین دیپلوی‌ها عوض نمی‌شد، مرورگر هم
//   هیچ‌وقت متوجه نیاز به آپدیت کش نمی‌شد). همین باعث می‌شد دکمه‌های دمو در
//   لندینگ‌پیج به مسیر قدیمی و منسوخ /demo/phone بروند تا کلیک دوم که باندل
//   تازه از شبکه لود می‌شد.
//   راه‌حل: صفحات ناوبری (document) حالا Network First هستند — همیشه اول از
//   شبکه گرفته می‌شوند و کش فقط به‌عنوان fallback در حالت آفلاین استفاده می‌شود.
//   فایل‌های استاتیک هش‌دار Next.js (_next/static/...، فونت‌ها، آیکون‌ها) که
//   نامشان با هر دیپلوی عوض می‌شود، همچنان Cache First می‌مانند (کاملاً امن).
// ★★★ v1.0.1: Fixed: catch handler always returns Response

const SW_VERSION = 'v1.1.0';
const STATIC_CACHE = `shopaccounting-static-${SW_VERSION}`;
const DYNAMIC_CACHE = `shopaccounting-dynamic-${SW_VERSION}`;

// فایل‌هایی که برای fallback آفلاین cache می‌شوند (نه به‌عنوان منبع اصلی ناوبری)
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
  console.log('[SW] Installing...', SW_VERSION);

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets (offline fallback only)');
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
  console.log('[SW] Activating...', SW_VERSION);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // ★ v1.1.0: هر کش متعلق به نسخه‌ی قبلی (نامش شامل SW_VERSION فعلی نیست) پاک می‌شود
            return name !== STATIC_CACHE && name !== DYNAMIC_CACHE;
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

  // ═══════════════════════════════════════════════════════════
  // ★★★ v1.1.0: ناوبری (HTML/صفحات) — Network First
  //   این بخش جدید است و مشکل اصلی را حل می‌کند: همیشه اول تلاش می‌شود
  //   آخرین نسخه‌ی صفحه از سرور (شامل جدیدترین باندل JS) گرفته شود.
  //   کش فقط زمانی استفاده می‌شود که کاربر واقعاً آفلاین باشد.
  // ═══════════════════════════════════════════════════════════
  const isNavigation =
    request.mode === 'navigate' || request.destination === 'document';

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // آفلاین — از کش (اول همان مسیر، بعد صفحه‌ی اصلی) استفاده کن
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match('/').then((homePage) => {
              return (
                homePage ||
                new Response('آفلاین هستید', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                })
              );
            });
          });
        })
    );
    return;
  }

  // استراتژی: Network First برای API، Cache First برای assets هش‌دار
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
    // ★ Cache First — فقط برای فایل‌های استاتیک هش‌دار (_next/static، فونت‌ها،
    //   آیکون‌ها و ...) که نامشان با هر دیپلوی عوض می‌شود، پس کاملاً امن است
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        // اگر cache نداشت از network بگیر
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            // ★★★ برای هر درخواست دیگه (فونت، عکس، chunk و ...)
            // هم باید حتماً یک Response واقعی برگردونیم
            return new Response('', {
              status: 504,
              statusText: 'Offline',
            });
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

console.log('[SW] Script loaded successfully:', SW_VERSION);
