// Two kinds of storage:
//   - A short response cache (about 60 s) for GET endpoints, in the Cache API and in memory. The
//     in-memory copy covers places where the Cache API does nothing (workers.dev, local dev).
//   - Long-lived maps that change rarely (parsed recipes, stock photo lookups): in the MEAL_KV
//     namespace when it is bound, otherwise the Cache API plus memory.

const CACHE_HOST = 'https://meal-master.cache';
const memory = new Map(); // key -> { expires, value }

const cacheApi = () => (typeof caches !== 'undefined' && caches.default ? caches.default : null);

export const cacheKey = (path) => `${CACHE_HOST}${path}`;

// ---------- response cache ----------

export async function getCached(path) {
  const key = cacheKey(path);
  const mem = memory.get(key);
  if (mem && mem.expires > Date.now()) return mem.value;
  const hit = await cacheApi()?.match(key).catch(() => null);
  if (!hit) return null;
  const expires = Number(hit.headers.get('X-Expires')) || 0;
  if (expires <= Date.now()) return null;
  const value = await hit.text();
  memory.set(key, { expires, value });
  return value;
}

export async function putCached(path, value, seconds = 60) {
  const key = cacheKey(path);
  const expires = Date.now() + seconds * 1000;
  memory.set(key, { expires, value });
  await cacheApi()?.put(key, new Response(value, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${seconds}`, 'X-Expires': String(expires) },
  })).catch(() => {});
}

export async function purge(paths) {
  await Promise.all(paths.map(async (path) => {
    const key = cacheKey(path);
    memory.delete(key);
    await cacheApi()?.delete(key).catch(() => {});
  }));
}

// ---------- long-lived maps ----------

const LONG = 30 * 86400;

export async function loadMap(env, name) {
  const key = cacheKey(`/_store/${name}`);
  const mem = memory.get(key);
  if (mem) return mem.value;
  let value = null;
  try {
    if (env.MEAL_KV) value = await env.MEAL_KV.get(name, 'json');
    else {
      const hit = await cacheApi()?.match(key);
      if (hit) value = await hit.json();
    }
  } catch { /* start empty */ }
  value ??= {};
  memory.set(key, { expires: Infinity, value });
  return value;
}

export async function saveMap(env, name, value) {
  const key = cacheKey(`/_store/${name}`);
  memory.set(key, { expires: Infinity, value });
  const json = JSON.stringify(value);
  try {
    if (env.MEAL_KV) await env.MEAL_KV.put(name, json);
    else await cacheApi()?.put(key, new Response(json, { headers: { 'Cache-Control': `public, max-age=${LONG}` } }));
  } catch { /* the in-memory copy still helps this instance */ }
}
