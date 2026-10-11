// Niro Manager 서비스 워커.
// 앱 셸(같은 출처의 정적 파일)만 캐시한다. Google 로그인·Sheets API 등 다른 출처 요청과
// 차계부 기록은 캐시하지 않는다(AGENTS.md, docs/PWA_GUIDE.md).
// manifest나 캐시 대상 정적 파일을 바꾸면 CACHE_VERSION을 올린다.
const CACHE_VERSION = 'v2'
const CACHE_NAME = `niro-manager-shell-${CACHE_VERSION}`
const SHELL = [
  './',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('niro-manager-shell-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const scope = new URL(self.registration.scope)
  // 다른 출처(Google API 등)와 앱 범위 밖 요청은 건드리지 않는다.
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return

  // 빌드 해시가 붙은 정적 파일은 캐시 우선.
  if (url.pathname.startsWith(`${scope.pathname}assets/`)) {
    event.respondWith(cacheFirst(request))
    return
  }
  // 페이지와 manifest 등은 네트워크 우선, 오프라인이면 캐시.
  event.respondWith(networkFirst(request))
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  }
  return response
}

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
      (await caches.match(request)) ??
      (request.mode === 'navigate' ? await caches.match('./') : undefined)
    if (cached) return cached
    throw error
  }
}
