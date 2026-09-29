// Offline support.
//   - App shell (HTML, CSS, JS, icons): cache-first. The deploy workflow replaces __BUILD__ with a hash
//     of the code, so a code change installs a new worker and the app reloads onto it.
//   - Worker API (menus): network-first; offline, the last saved answer, marked with X-Offline: 1.
//   - Dish photos from the Worker: cache-first (their URL changes when the photo changes).
importScripts('config.js');

const VERSION = 'mm-__BUILD__';
const API_CACHE = 'mm-api';
const PHOTO_CACHE = 'mm-photos';
const KEEP = [VERSION, API_CACHE, PHOTO_CACHE];
const SHELL = ['./', 'index.html', 'config.js', 'styles.css', 'app.js', 'kitchen.js', 'prep.js', 'collage.js', 'i18n.js', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

const apiOrigin = (() => { try { return new URL(self.MEAL_API).origin; } catch { return null; } })();
const isApi = (url) => url.origin === apiOrigin
  // Local testing against `wrangler dev` on another port.
  || (/^(localhost|127\.0\.0\.1)$/.test(self.location.hostname) && /^(localhost|127\.0\.0\.1)$/.test(url.hostname) && url.origin !== self.location.origin);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function shellFirst(request) {
  const cache = await caches.open(VERSION);
  // Pages opened with ?m=… or #/… are the same app shell.
  const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function apiNetworkFirst(request) {
  const cache = await caches.open(API_CACHE);
  const key = request.url;
  const lastSaved = async () => {
    const saved = await cache.match(key);
    if (!saved) return null;
    const headers = new Headers(saved.headers);
    headers.set('X-Offline', '1');
    headers.set('Access-Control-Expose-Headers', 'X-Offline, X-Cache');
    return new Response(await saved.blob(), { status: 200, headers });
  };
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res.ok) {
      await cache.put(key, res.clone());
      return res;
    }
    // Notion or the Worker is having trouble: the last menu beats an error screen.
    return (res.status >= 500 && (await lastSaved())) || res;
  } catch (err) {
    const saved = await lastSaved();
    if (!saved) throw err;
    return saved;
  }
}

async function photoFirst(request) {
  const cache = await caches.open(PHOTO_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    // Keep only the newest version of each dish's photo.
    const path = new URL(request.url).pathname;
    for (const old of await cache.keys()) if (new URL(old.url).pathname === path) await cache.delete(old);
    await cache.put(request, res.clone());
  }
  return res;
}

async function fontFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(shellFirst(request));
  else if (isApi(url)) event.respondWith(url.pathname.startsWith('/photo/') ? photoFirst(request) : apiNetworkFirst(request));
  else if (url.host.includes('fonts.g')) event.respondWith(fontFirst(request));
});
