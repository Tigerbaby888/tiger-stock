// ============================================================
// 阿虎投信 Service Worker v8
// 功能：離線快取 + Firebase Cloud Messaging 推播接收
// ============================================================

// 引入 Firebase compat（SW 中只能用 compat 版本，不能用模組版）
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// 初始化 Firebase
firebase.initializeApp({
  apiKey: "AIzaSyDB7uy2Og9-E7HDlEKG1sxbWGogtOrqek8",
  authDomain: "tiger-stock-app.firebaseapp.com",
  projectId: "tiger-stock-app",
  storageBucket: "tiger-stock-app.firebasestorage.app",
  messagingSenderId: "233486790295",
  appId: "1:233486790295:web:c93c65142afeeba28543d2"
});

const messaging = firebase.messaging();

// 收到背景推播訊息（App 沒開時）
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] 收到背景推播:', payload);

  const title = payload.notification?.title || '🐅 阿虎投信';
  const body = payload.notification?.body || '阿虎選股有新股票！';

  const options = {
    body: body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [200, 100, 200],
    tag: payload.data?.tag || 'tiger-pick',
    renotify: true,
    requireInteraction: false,
    data: {
      url: payload.data?.url || './',
      ...payload.data,
    },
    actions: [
      { action: 'open', title: '查看' },
      { action: 'dismiss', title: '稍後' },
    ],
  };

  return self.registration.showNotification(title, options);
});

// ============================================================
// PWA 離線快取
// ============================================================
const CACHE_NAME = 'tiger-stock-v8';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './firebase-config.js',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js',
];

self.addEventListener('install', (event) => {
  console.log('[SW] 安裝中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] 預先快取失敗:', err))
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] 啟用中...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // API 請求：網路優先
  const isApi = url.hostname.includes('finance.yahoo.com') ||
                url.hostname.includes('twse.com.tw') ||
                url.hostname.includes('tpex.org.tw') ||
                url.hostname.includes('workers.dev') ||
                url.hostname.includes('corsproxy.io') ||
                url.hostname.includes('allorigins.win') ||
                url.hostname.includes('codetabs.com');

  if (isApi) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
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

  // 靜態資源：快取優先
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }))
      .catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
  );
});

// ============================================================
// 推播通知點擊處理
// ============================================================
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 通知被點擊');
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
  }
});
