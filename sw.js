/* Meeting Floor — Service Worker
   アプリ本体をキャッシュし、機内モードや地下鉄でも起動できるようにする。
   ※ ファイルを更新したら CACHE の版番号を必ず上げること（上げないと古い版が出続ける）
*/
const CACHE = 'meeting-floor-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // 1つでも取得失敗したらキャッシュ無しで続行
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // AI生成のPOSTは常にネットワーク
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // 外部APIは介在しない

  // アプリ本体: まずネットワーク、失敗したらキャッシュ（更新を取り逃さない）
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // アイコン等: まずキャッシュ（起動を速くする）
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
