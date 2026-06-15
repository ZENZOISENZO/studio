const CACHE_NAME = 'ldq-cache-v1'

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/projects.html',
  '/clients.html',
  '/invoices.html',
  '/invoice-print.html',
  '/revenue.html',
  '/expenses.html',
  '/calendar.html',
  '/production.html',
  '/quests.html',
  '/css/studio.css',
  '/css/style.css',
  '/js/db.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // let cross-origin (Supabase) requests pass through

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      }).catch(() => cached)

      return cached || network
    })
  )
})
