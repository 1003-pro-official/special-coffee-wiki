/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — 서비스 워커

   왜 필요한가
     부엌과 카페는 와이파이가 약한 곳이 많습니다. 지하 카페면 LTE도 약합니다.
     그런데 이 앱은 열 때마다 JSON 8개(약 200KB)를 받아야 했고, 그중 하나만
     실패해도 전체가 실패했습니다(Promise.all). 커피를 내리려는 순간에
     앱이 안 켜지는 겁니다.

     이제 두 번째 방문부터는 네트워크 없이 완전히 동작합니다.

   전략
     앱 셸(HTML·CSS·JS)과 데이터(JSON)  캐시 우선 + 뒤에서 갱신
       이 파일들은 거의 안 바뀝니다. 매번 네트워크를 기다릴 이유가 없습니다.
       대신 응답을 준 뒤 조용히 새로 받아 다음 실행에 반영합니다.

     폰트 CDN                             캐시 우선
       cross-origin이라 응답이 opaque입니다. 내용을 볼 수 없어 검사도 못 하지만,
       폰트는 바뀌지 않으니 한 번 받으면 그대로 씁니다.

     그 외                                네트워크만
       GET이 아니거나 우리 자산이 아니면 건드리지 않습니다.

   업데이트
     skipWaiting을 자동으로 하지 않습니다. 추출 3분 중에 앱이 갈아끼워지면
     타이머가 날아갑니다. 새 버전은 대기 상태로 두고, 앱이 사용자에게 물어본 뒤
     SKIP_WAITING 메시지를 보낼 때만 교체합니다.
   ══════════════════════════════════════════════════════════ */
'use strict';

/* 이 값을 올리면 새 캐시가 만들어지고 옛 캐시는 정리됩니다.
   자산을 바꿨는데 버전을 안 올리면 사용자는 옛 파일을 계속 봅니다. */
const VERSION = 'v1';
const CACHE = `scw-${VERSION}`;

/* 설치할 때 통째로 받아둘 목록.
   여기 있는 파일 중 하나라도 404면 설치 자체가 실패합니다 —
   그래서 test/pwa.test.mjs가 이 목록과 실제 파일을 대조합니다. */
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',

  'assets/style.css',
  'assets/engine.js',
  'assets/brew.js',
  'assets/logs.js',
  'assets/flavor.js',
  'assets/analysis.js',
  'assets/router.js',
  'assets/app.js',

  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/apple-touch-icon.png',

  'data/brewers.json',
  'data/grinders.json',
  'data/flavor-nodes.json',
  'data/recipes.json',
  'data/beans.json',
  'data/wiki.json',
  'data/i18n/terms.json',
  'data/i18n/ko.json',
  'data/i18n/en.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* addAll은 하나라도 실패하면 전부 취소됩니다. 그게 맞습니다 —
       반쪽짜리 캐시로 오프라인에 들어가면 화면이 깨진 채로 열립니다. */
    await cache.addAll(PRECACHE);
    // skipWaiting은 하지 않습니다. 앱이 사용자에게 물어본 뒤 지시합니다.
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('scw-') && n !== CACHE)
                           .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/** 앱이 "이제 바꿔도 된다"고 알려줄 때만 교체합니다 */
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'cdn.jsdelivr.net';

  if (!sameOrigin && !isFont) return;

  /* 화면 이동(navigate)은 항상 index.html로 답합니다.
     이 앱은 해시 라우팅이라 실제 경로는 하나뿐입니다. */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match('index.html', { cacheName: CACHE });
      if (cached) { refresh(req); return cached; }
      try { return await fetch(req); }
      catch (err) { return offlineFallback(); }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req, { cacheName: CACHE, ignoreSearch: true });
    if (cached) {
      refresh(req);          // 응답은 캐시로 즉시, 갱신은 뒤에서 조용히
      return cached;
    }
    try {
      const res = await fetch(req);
      if (shouldStore(res, isFont)) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      // 오프라인이고 캐시에도 없음 — 여기서 던지면 앱의 renderError가 받습니다
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

/** 뒤에서 조용히 갱신. 실패해도 사용자는 이미 캐시 응답을 받았으니 무시합니다. */
function refresh(req) {
  fetch(req).then(res => {
    if (!shouldStore(res, req.url.includes('cdn.jsdelivr.net'))) return;
    return caches.open(CACHE).then(c => c.put(req, res));
  }).catch(() => { /* 오프라인 — 정상 */ });
}

/** opaque 응답은 상태를 볼 수 없습니다. 폰트에 한해서만 허용합니다. */
function shouldStore(res, allowOpaque) {
  if (!res) return false;
  if (res.type === 'opaque') return !!allowOpaque;
  return res.ok;
}

function offlineFallback() {
  return new Response(
    `<!doctype html><meta charset="utf-8">
     <body style="font-family:system-ui;padding:2rem;text-align:center;color:#3D3D3D">
     <p>오프라인입니다. 한 번 접속한 뒤에는 인터넷 없이도 열립니다.</p>
     <p>You are offline. The app works without a connection after the first visit.</p>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
  );
}
