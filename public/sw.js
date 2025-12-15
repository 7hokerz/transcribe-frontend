const CACHE_NAME = 'ffmpeg-cache-v3';
const FFMPEG_ASSETS = [
    '/ffmpeg/ffmpeg-core.js',
    '/ffmpeg/ffmpeg-core.wasm'
];

// 서비스 워커 설치 이벤트
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache:', CACHE_NAME); 
                return cache.addAll(FFMPEG_ASSETS);
            })
    );
    self.skipWaiting();
});

// fetch 요청 가로채기 및 캐싱
self.addEventListener('fetch', (event) => {
    if (FFMPEG_ASSETS.some(asset => event.request.url.endsWith(asset))) {
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    return response || fetch(event.request);
                })
        );
    }
});

// 서비스 워커 활성화 및 구버전 캐시 정리
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // 현재 서비스 워커에서 사용하는 캐시가 아니면 삭제합니다.
                    if (CACHE_NAME !== cacheName) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});