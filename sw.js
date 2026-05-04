const STATIC_CACHE = 'ai-sandbox-static-v3.0';
const RUNTIME_CACHE = 'ai-sandbox-runtime-v3.0';

const PRECACHE_URLS = [
  '/offline.html',
  '/css/fonts-local.css',
  '/prompts/changelog.json',
  '/prompts/defaultworldcard.json',
  '/prompts/defaultworldcard.data.js',
  '/prompts/defaultworldcard.localization.en.js',
  '/prompts/cyberpunkworldcard.json',
  '/prompts/cyberpunkworldcard.data.js',
  '/prompts/cyberpunkworldcard.localization.en.js',
  '/prompts/cultivationworldcard.json',
  '/prompts/cultivationworldcard.data.js',
  '/prompts/cultivationworldcard.localization.en.js',
  '/js/config/launcherWorldOptions.js?v=20260504c',
  '/assets/pwa/manifest.webmanifest',
  '/assets/pwa/manifest.zh-CN.webmanifest',
  '/assets/pwa/manifest.en.webmanifest',
  '/assets/pwa/icon-192.png',
  '/assets/pwa/icon-512.png',
  '/assets/pwa/icon-maskable-512.png',
  '/assets/pwa/apple-touch-icon-180.png',
  '/assets/launcher/cover-640.webp?v=20260504c',
  '/assets/launcher/cover-960.webp?v=20260504c',
  '/assets/launcher/cover-1280.webp?v=20260504c',
  '/assets/launcher/cover-1920.webp?v=20260504c',
  '/assets/launcher/cover-2560.webp?v=20260504c',
  '/assets/launcher/cover-3840.webp?v=20260504c',
  '/assets/launcher/cover-fallback.jpg?v=20260504c',
  '/assets/fonts/material-icons-400.ttf',
  '/assets/fonts/material-symbols-outlined-w400.ttf',
  '/assets/fonts/material-symbols-outlined-w500.ttf',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'SKIP_WAITING') return;
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(
              key => key.startsWith('ai-sandbox-') && key !== STATIC_CACHE && key !== RUNTIME_CACHE
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, responseClone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/offline.html');
        })
    );
    return;
  }


  if (url.origin !== self.location.origin) {
    return;
  }

  const isTokenizerAsset =
    url.pathname.startsWith('/assets/tokenizers/') ||
    url.pathname.startsWith('/js/vendor/transformers');

  if (isTokenizerAsset || ['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request)
          .then(response => {
            if (response && response.ok) {
              const responseClone = response.clone();
              caches.open(RUNTIME_CACHE).then(cache => cache.put(request, responseClone));
            }
            return response;
          })
          .catch(() => Response.error());

        if (cached) return cached;
        return networkFetch;
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      return Response.error();
    })
  );
});
