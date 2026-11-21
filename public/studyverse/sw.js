// STUDYVERSE 서비스 워커 — 앱 설치와 오프라인 플레이를 위한 캐시.
// 온라인이면 항상 최신 파일을 받고(네트워크 우선), 오프라인이면 캐시로 실행한다.
// 공부 기록과 진행 상황은 브라우저 저장소에 있으므로 캐시를 지워도 사라지지 않는다.
const CACHE = 'studyverse-v1';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/game.css',
  'js/main.js', 'js/ui.js', 'js/game.js', 'js/scene.js', 'js/pixel.js', 'js/content.js', 'js/gen.js', 'js/state.js', 'js/story.js', 'js/story.pack.js', 'js/util.js',
  'fonts/Galmuri11.woff2', 'fonts/Galmuri11-Bold.woff2', 'fonts/Galmuri9.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return; // API는 캐시하지 않음
  const isFont = url.pathname.endsWith('.woff2') || url.pathname.endsWith('.png');
  if (isFont) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
