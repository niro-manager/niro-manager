// Niro Manager 런처 서비스 워커.
// 같은 출처의 런처 파일만 캐시한다. Apps Script 웹 앱(script.google.com) 등 다른 출처 요청은 건드리지 않는다.
// manifest나 아래 캐시 대상 파일을 바꾸면 CACHE_VERSION을 올린다.
const CACHE_VERSION = 'v4'
const CACHE_PREFIX = 'niro-manager-shell-'
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`
const SHELL = [
  './',
  './webAppUrl.js',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // 예전 PWA(v2 이하)가 남긴 앱 셸 캐시도 같은 접두사라 함께 지워진다.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const scope = new URL(self.registration.scope)
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return
  // 네트워크 우선, 오프라인이면 캐시. 런처 화면이 오프라인 안내를 보여준다.
  event.respondWith(networkFirst(request))
})

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached =
      (await caches.match(request, { ignoreSearch: request.mode === 'navigate' })) ??
      (request.mode === 'navigate' ? await caches.match('./') : undefined)
    if (cached) return cached
    throw error
  }
}
