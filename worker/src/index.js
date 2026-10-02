// Meal Master API: reads the meal plan from Notion live, writes meal changes back, and sends
// tomorrow's menu on WhatsApp every evening. See worker/README section in the repo README.

import { ApiError, notion, queryAll, cleanId, isId, dashed, dishBase, ownPhotoUrl, recipeText } from './notion.js';
import { appData, daysBetween, dishSummary, fillBodies, fillStock, loadCombos, loadScheduleRows, newBudget } from './data.js';
import { resolveMeals, istToday, addDays, SLOTS } from './schedule.js';
import { getCached, putCached, purge, loadMap } from './store.js';
import { preview, sendTomorrow } from './whatsapp.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s) => DATE.test(s ?? '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---------- CORS ----------

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  let allowed = null;
  try { allowed = env.ALLOWED_ORIGIN ? new URL(env.ALLOWED_ORIGIN).origin : null; } catch { /* misconfigured */ }
  if (origin === allowed) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function withCors(response, request, env) {
  const origin = allowedOrigin(request, env);
  const headers = new Headers(response.headers);
  headers.append('Vary', 'Origin');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'X-Cache');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function preflight(request, env) {
  const origin = allowedOrigin(request, env);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Pin',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

// ---------- responses ----------

const json = (value, status = 200, extra = {}) => new Response(typeof value === 'string' ? value : JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ...extra },
});

const errorResponse = (err) => (err instanceof ApiError
  ? json({ error: err.error, hint: err.hint, ...(err.detail && err.detail !== err.hint ? { detail: err.detail } : {}) }, err.status)
  : json({ error: 'internal', hint: String(err?.message ?? err) }, 500));

// A GET answer from the ~60 s cache (CACHE_SECONDS), or built fresh and cached.
async function cached(ctx, path, build, ttl = (_, s) => s) {
  const hit = await getCached(path);
  if (hit) return json(hit, 200, { 'X-Cache': 'HIT' });
  const value = await build();
  const body = JSON.stringify(value);
  ctx.waitUntil(putCached(path, body, ttl(value, Number(ctx.env?.CACHE_SECONDS) || 60)));
  return json(body, 200, { 'X-Cache': 'MISS' });
}

// ---------- PIN ----------

function checkPin(request, env) {
  const given = request.headers.get('X-App-Pin') ?? '';
  const pin = String(env.APP_PIN ?? '');
  let diff = given.length === pin.length && pin.length > 0 ? 0 : 1;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ pin.charCodeAt(i % Math.max(pin.length, 1));
  if (diff) throw new ApiError(401, 'unauthorized', pin ? 'Send the app PIN in the X-App-Pin header.' : 'Set the APP_PIN secret: wrangler secret put APP_PIN');
}

// ---------- POST /meal ----------

const relation = (ids) => ({ relation: ids.map((id) => ({ id: dashed(id) })) });
const richText = (s) => ({ rich_text: s ? [{ type: 'text', text: { content: s } }] : [] });

function parseMealBody(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'bad_request', 'Send JSON: {date, meal, main?, sides?, notes?}.');
  const { date, meal, main, sides, notes } = body;
  if (!isDate(date)) throw new ApiError(400, 'bad_date', 'date must be YYYY-MM-DD.');
  if (!SLOTS.includes(meal)) throw new ApiError(400, 'bad_meal', `meal must be one of ${SLOTS.join(', ')}.`);
  for (const [name, list] of [['main', main], ['sides', sides]]) {
    if (list !== undefined && (!Array.isArray(list) || !list.every(isId))) throw new ApiError(400, `bad_${name}`, `${name} must be an array of Dishes page ids.`);
  }
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 2000)) throw new ApiError(400, 'bad_notes', 'notes must be text (up to 2000 characters) or null.');
  if (main === undefined && sides === undefined && notes === undefined) throw new ApiError(400, 'nothing_to_change', 'Send at least one of main, sides or notes.');
  return { date, meal, main, sides, notes };
}

// Paths whose cached answers include this date.
const pathsFor = (date) => [
  '/data', `/day?date=${date}`, '/whatsapp/preview',
  ...Array.from({ length: 7 }, (_, i) => `/week?start=${addDays(date, -i)}`),
];

async function updateMeal(request, env) {
  checkPin(request, env);
  let body;
  try { body = await request.json(); } catch { throw new ApiError(400, 'bad_json', 'The body must be JSON.'); }
  const { date, meal, main, sides, notes } = parseMealBody(body);
  const budget = newBudget(env);
  const MEAL = cap(meal);

  // 1. A normal row for this date and meal: update it.
  const normal = await queryAll(env, env.MEAL_DS, {
    budget,
    filter: { and: [
      { property: 'Date', date: { equals: date } },
      { property: 'Meal', select: { equals: MEAL } },
      { property: 'Repeat', select: { is_empty: true } },
    ] },
  });
  let action;
  let id;
  if (normal.length) {
    const properties = {
      ...(main !== undefined && { Main: relation(main) }),
      ...(sides !== undefined && { Sides: relation(sides) }),
      ...(notes !== undefined && { Notes: richText(notes) }),
    };
    id = normal[0].id;
    await notion(env, `pages/${id}`, { method: 'PATCH', body: { properties }, budget });
    action = 'updated';
  } else {
    // 2. Only a repeat (or nothing) covers it: add a normal row, which overrides the repeat for that day.
    const [combos, rows] = await Promise.all([loadCombos(env, budget), loadScheduleRows(env, date, date, budget)]);
    const current = resolveMeals(rows, combos, date, date).find((m) => m.meal === meal);
    const page = await notion(env, 'pages', {
      method: 'POST',
      budget,
      body: {
        parent: { type: 'data_source_id', data_source_id: env.MEAL_DS },
        properties: {
          Name: { title: [{ type: 'text', text: { content: current?.name || `${MEAL} ${date}` } }] },
          Meal: { select: { name: MEAL } },
          Date: { date: { start: date } },
          Main: relation(main ?? current?.main ?? []),
          Sides: relation(sides ?? current?.sides ?? []),
          Notes: richText(notes !== undefined ? notes : current?.notes ?? null),
          ...(current?.time && { Time: richText(current.time) }),
          'Planned by': { select: { name: 'Me' } },
        },
      },
    });
    id = page.id;
    action = current ? 'overrode_repeat' : 'created';
  }
  await purge(pathsFor(date));
  return json({ ok: true, action, id, date, meal });
}

// ---------- GET /photo/:id ----------

// Streams a dish photo with a fresh Notion link each time (they expire after about an hour).
async function photo(id, request, env, ctx) {
  if (!isId(id)) throw new ApiError(400, 'bad_id', 'Not a Notion page id.');
  const key = new Request(`https://meal-master.cache/photo/${cleanId(id)}${new URL(request.url).search}`);
  const hit = await caches.default?.match(key).catch(() => null);
  if (hit) return hit;

  const budget = newBudget(env);
  const page = await notion(env, `pages/${dashed(id)}`, { budget });
  let src = ownPhotoUrl(page);
  if (!src) {
    const stock = await loadMap(env, 'stock');
    src = stock[page.id]?.url ?? null;
    if (!src && env.STOCK_PHOTOS !== '0') {
      const { stock: filled } = await fillStock(env, [{ base: dishBase(page), page }], budget);
      src = filled[page.id]?.url ?? null;
    }
  }
  if (!src) throw new ApiError(404, 'no_photo', 'This dish has no photo. Add one in the Photo column in Notion.');
  const upstream = await fetch(src, { headers: { 'User-Agent': 'meal-master-worker/1.0' } });
  if (!upstream.ok) throw new ApiError(502, `photo_${upstream.status}`, 'Could not fetch the photo.');
  const response = new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'image/jpeg',
      // The URL carries the page's edit time, so a new upload gets a new URL.
      'Cache-Control': 'public, max-age=86400',
    },
  });
  ctx.waitUntil(caches.default?.put(key, response.clone()).catch(() => {}));
  return response;
}

// ---------- GET /dish/:id ----------

async function dish(id, env, origin) {
  if (!isId(id)) throw new ApiError(400, 'bad_id', 'Not a Notion page id.');
  const budget = newBudget(env);
  const page = await notion(env, `pages/${dashed(id)}`, { budget });
  const entry = { base: dishBase(page), page };
  const [{ bodies }, stock] = await Promise.all([fillBodies(env, [entry], budget), loadMap(env, 'stock')]);
  const body = bodies[page.id]?.body ?? { en: { intro: '', sections: [] } };
  return { ...dishSummary(entry, stock, origin), notionUrl: page.url, prepAhead: entry.base.prepAhead, recipe: body, text: recipeText(body) };
}

// ---------- router ----------

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname: path, searchParams: q } = url;
  const origin = env.PUBLIC_URL?.replace(/\/$/, '') || url.origin;

  if (request.method === 'POST' && path === '/meal') return updateMeal(request, env);
  if (request.method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'Use GET, or POST /meal.');

  if (path === '/' || path === '/health') {
    return json({ ok: true, today: istToday(), endpoints: ['/today', '/day?date=', '/week?start=', '/dish/:id', '/data', '/photo/:id', 'POST /meal', '/whatsapp/preview'] });
  }
  if (path === '/today' || path === '/day') {
    const date = path === '/today' ? istToday() : q.get('date');
    if (!isDate(date)) throw new ApiError(400, 'bad_date', 'Use /day?date=YYYY-MM-DD.');
    return cached(ctx, `/day?date=${date}`, async () => (await daysBetween(env, date, date, origin))[0]);
  }
  if (path === '/week') {
    const start = q.get('start') || istToday();
    if (!isDate(start)) throw new ApiError(400, 'bad_date', 'Use /week?start=YYYY-MM-DD.');
    return cached(ctx, `/week?start=${start}`, async () => ({ start, days: await daysBetween(env, start, addDays(start, 6), origin) }));
  }
  if (path === '/data') {
    // A cold start fills recipes over a few calls; those partial answers are kept only briefly.
    return cached(ctx, '/data', () => appData(env, origin), (v, s) => (v.incomplete ? Math.min(5, s) : s));
  }
  const dishMatch = path.match(/^\/dish\/([0-9a-fA-F-]{32,36})$/);
  if (dishMatch) return cached(ctx, `/dish/${cleanId(dishMatch[1])}`, () => dish(dishMatch[1], env, origin));
  const photoMatch = path.match(/^\/photo\/([0-9a-fA-F-]{32,36})$/);
  if (photoMatch) return photo(photoMatch[1], request, env, ctx);
  if (path === '/whatsapp/preview') return cached(ctx, '/whatsapp/preview', () => preview(env, origin));
  throw new ApiError(404, 'not_found', 'Unknown endpoint. GET / lists them.');
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflight(request, env);
    let response;
    try {
      response = await route(request, env, { waitUntil: (p) => ctx.waitUntil(p), env });
    } catch (err) {
      if (!(err instanceof ApiError)) console.error(err);
      response = errorResponse(err);
    }
    return withCors(response, request, env);
  },

  // 21:00 IST: tomorrow's menu on WhatsApp.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendTomorrow(env, env.PUBLIC_URL || ''));
  },
};

