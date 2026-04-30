// ============================================================
// 阿虎投信 Service Worker
// 功能：離線快取、推播通知接收
// ============================================================

const CACHE_NAME = 'tiger-stock-v7-2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&family=JetBrains+Mono:wght@400;700&family=Bebas+Neue&display=swap',
];

// 安裝 SW，預先快取核心資源
self.addEventListener('install', (event) => {
  console.log('[SW] 安裝中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 預先快取資源中');
        return cache.addAll(ASSETS_TO_CACHE.map(u => new Request(u, { cache: 'reload' })));
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] 預先快取失敗:', err))
  );
});

// 啟用 SW，清除舊快取
self.addEventListener('activate', (event) => {
  console.log('[SW] 啟用中...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] 清除舊快取:', k);
          return caches.delete(k);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 攔截 fetch — 對 API 用網路優先、對靜態資源用快取優先
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 不快取 POST 等非 GET 請求
  if (event.request.method !== 'GET') return;

  // API 請求（Yahoo Finance、TWSE、Worker）：網路優先，網路失敗才回快取
  const isApiRequest = url.hostname.includes('finance.yahoo.com') ||
                        url.hostname.includes('twse.com.tw') ||
                        url.hostname.includes('tpex.org.tw') ||
                        url.hostname.includes('workers.dev') ||
                        url.hostname.includes('corsproxy.io') ||
                        url.hostname.includes('allorigins.win') ||
                        url.hostname.includes('codetabs.com');

  if (isApiRequest) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 成功的話也存進快取，下次離線時可用
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 靜態資源：快取優先，加速載入
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request).then(response => {
        // 把網路回應也存到快取
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }))
      .catch(() => {
        // 完全離線時，HTML 請求回主頁
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
  );
});

// ============================================================
// 推播通知 - 接收推播訊息
// ============================================================
self.addEventListener('push', (event) => {
  console.log('[SW] 收到推播');

  let data = {
    title: '🐅 阿虎投信',
    body: '阿虎選股有新股票！',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    url: './',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || 'icon-192.png',
    badge: data.badge || 'icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' },
    actions: [
      { action: 'open', title: '查看' },
      { action: 'dismiss', title: '稍後' },
    ],
    tag: data.tag || 'tiger-pick',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 點擊通知 → 開啟 / 切換到 PWA 頁面
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 通知被點擊');
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // 如果已有開啟的視窗就 focus
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // 否則開新視窗
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

// 訊息（從 page 傳來）
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] 快取已清除');
    });
  }
});
