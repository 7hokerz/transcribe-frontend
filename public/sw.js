/// <reference lib="webworker" />

const CACHE_PREFIX = 'ffmpeg-cache-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;

const FFMPEG_ASSETS = new Set([
    '/ffmpeg/ffmpeg-core.js',
    '/ffmpeg/ffmpeg-core.wasm',
]);

// 서비스 워커 설치 이벤트
self.addEventListener('install', (event) => {
    // 설치 작업 보장 + 새로운 서비스 워커 즉시 활성화
    event.waitUntil(self.skipWaiting());
});

// fetch 요청 가로채기 및 캐싱
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Origin 체크 (CDN 사용 시 수정 필요)
    if (url.origin !== self.location.origin) return;

    // 캐싱 대상인지 확인
    if (!FFMPEG_ASSETS.has(url.pathname)) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);

        // 캐시 키 정규화 (쿼리 스트링 무시)
        const cacheKey = new Request(url.origin + url.pathname, { method: 'GET' });

        const cached = await cache.match(cacheKey);
        if (cached) return cached;

        const res = await fetch(event.request);
        if (res && res.ok) {
            // 캐시 저장은 백그라운드에서
            event.waitUntil(cache.put(cacheKey, res.clone()));
        }
        // 응답 즉시 반환
        return res;
    })());
});

// 서비스 워커 활성화 및 구버전 캐시 정리
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
                .map((k) => caches.delete(k))
        );
        await self.clients.claim();
    })());
});
