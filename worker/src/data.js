// Builds menus from Notion: schedule rows + combos + dishes, with recipes and photos.

import { ApiError, Budget, queryAll, blocksOf, prop, scheduleRow, comboEntry, dishBase, ownPhotoUrl, isGrabAndGo, parseBody } from './notion.js';
import { resolveMeals, istToday, addDays, SLOTS } from './schedule.js';
import { loadMap, saveMap } from './store.js';

const USER_AGENT = 'meal-master-worker/1.0 (https://github.com/bhattvishal/meal-master)';

export const newBudget = (env) => new Budget(Number(env.MAX_SUBREQUESTS) || 40);

// Runs fn over items, a few at a time (Notion allows about 3 requests a second).
async function eachLimited(items, limit, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

function required(env, name) {
  if (!env[name]) throw new ApiError(500, 'config_missing', `Set the ${name} variable in wrangler.toml or the Cloudflare dashboard.`);
  return env[name];
}

export async function loadCombos(env, budget) {
  const combos = new Map();
  if (!env.COMBO_DS) return combos;
  for (const p of await queryAll(env, env.COMBO_DS, { budget })) combos.set(p.id, comboEntry(p));
  return combos;
}

// Normal rows inside the window, plus every repeat that started on or before its end.
export async function loadScheduleRows(env, from, to, budget) {
  const pages = await queryAll(env, required(env, 'MEAL_DS'), {
    budget,
    filter: {
      or: [
        { and: [{ property: 'Date', date: { on_or_after: from } }, { property: 'Date', date: { on_or_before: to } }] },
        { and: [{ property: 'Repeat', select: { is_not_empty: true } }, { property: 'Date', date: { on_or_before: to } }] },
      ],
    },
  });
  return pages.map(scheduleRow);
}

export async function loadDishPages(env, budget) {
  return queryAll(env, required(env, 'DISH_DS'), { budget });
}

// Meals from `from` to `to` and every dish as a Map id -> { base, page }.
export async function mealsBetween(env, from, to, budget) {
  const [combos, rows, dishPages] = await Promise.all([
    loadCombos(env, budget),
    loadScheduleRows(env, from, to, budget),
    loadDishPages(env, budget),
  ]);
  const dishes = new Map(dishPages.map((p) => [p.id, { base: dishBase(p), page: p }]));
  return { meals: resolveMeals(rows, combos, from, to), dishes, rows, combos };
}

// ---------- photos ----------

// The app loads every photo through /photo/:id, which fetches a fresh Notion link each time and
// adds CORS headers (so the share collage can draw it). `url` is the fresh original link itself.
export function photoOf({ base, page }, stock, origin) {
  const own = ownPhotoUrl(page);
  if (own) return { src: `${origin}/photo/${base.id}?v=${encodeURIComponent(base.edited)}`, url: own, credit: null };
  const s = stock?.[base.id];
  if (s?.url) {
    return {
      src: `${origin}/photo/${base.id}?v=s${encodeURIComponent(s.url.slice(-24))}`,
      url: s.url, credit: s.credit, license: s.license, sourceUrl: s.sourceUrl,
    };
  }
  return null;
}

const stripHtml = (s = '') => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// A free photo from Wikimedia Commons for dishes without their own.
export async function commonsPhoto(query) {
  const qs = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: '6', gsrlimit: '5',
    prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '1200',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${qs}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;
  const pages = Object.values((await res.json()).query?.pages ?? {}).sort((a, b) => a.index - b.index);
  const pick = pages.find((p) => p.imageinfo?.[0]?.width >= p.imageinfo?.[0]?.height) ?? pages[0];
  const info = pick?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  return {
    url: info.thumburl ?? info.url,
    credit: stripHtml(meta.Artist?.value) || 'Wikimedia Commons',
    license: stripHtml(meta.LicenseShortName?.value) || null,
    sourceUrl: info.descriptionurl,
  };
}

const STOCK_RETRY_MS = 7 * 86400000;

// Looks up stock photos for dishes without their own, as far as the budget allows.
// Results (including "nothing found") are remembered, keyed by the search words.
export async function fillStock(env, entries, budget) {
  const stock = await loadMap(env, 'stock');
  if (env.STOCK_PHOTOS === '0') return { stock, incomplete: false };
  const wanted = entries.filter(({ base, page }) => {
    if (ownPhotoUrl(page)) return false;
    const s = stock[base.id];
    const q = base.photoSearch || base.name;
    return !s || s.q !== q || (!s.url && Date.now() - (s.at ?? 0) > STOCK_RETRY_MS);
  });
  let changed = false;
  let incomplete = false;
  await eachLimited(wanted, 3, async ({ base }) => {
    if (!budget.take()) { incomplete = true; return; }
    const q = base.photoSearch || base.name;
    try {
      const found = await commonsPhoto(q);
      stock[base.id] = found ? { q, ...found } : { q, url: null, at: Date.now() };
      changed = true;
    } catch { incomplete = true; }
  });
  if (changed) await saveMap(env, 'stock', stock);
  return { stock, incomplete };
}

// ---------- recipes ----------

// Parsed recipe bodies, refetched only when the dish page was edited since.
export async function fillBodies(env, entries, budget) {
  const bodies = await loadMap(env, 'bodies');
  const stale = entries.filter(({ base }) => bodies[base.id]?.edited !== base.edited);
  let changed = false;
  let incomplete = false;
  await eachLimited(stale, 3, async ({ base }) => {
    if (budget.left < 1) { incomplete = true; return; }
    try {
      const body = parseBody(await blocksOf(env, base.id, budget));
      bodies[base.id] = { edited: base.edited, body };
      changed = true;
    } catch (err) {
      if (err.error === 'busy') incomplete = true;
      else throw err;
    }
  });
  if (changed) await saveMap(env, 'bodies', bodies);
  return { bodies, incomplete };
}

// ---------- shapes ----------

// A dish as the day/week/today endpoints return it.
export function dishSummary(entry, stock, origin) {
  const { base } = entry;
  return {
    id: base.id,
    names: base.names,
    serving: base.servings,
    type: base.type,
    category: base.category,
    emoji: base.emoji,
    tags: base.tags,
    prepTime: base.prepTime,
    macros: base.nutrition,
    photo: photoOf(entry, stock, origin),
  };
}

// A dish in the shape the app has always used (English at the top level, translations in i18n).
function appDish(entry, stock, bodies, origin) {
  const { base } = entry;
  const body = bodies[base.id]?.edited === base.edited ? bodies[base.id].body : null;
  const i18n = {};
  for (const lang of ['hi', 'mr']) {
    const e = { name: base.names[lang], serving: base.servings[lang], ...(body?.[lang] ?? {}) };
    if (e.name || e.serving || e.intro || e.sections?.length) i18n[lang] = e;
  }
  return {
    id: base.id,
    name: base.name,
    type: base.type,
    category: base.category,
    emoji: base.emoji,
    photo: photoOf(entry, stock, origin),
    nutrition: base.nutrition,
    nutritionSource: base.nutritionSource,
    serving: base.serving,
    serves: base.serves,
    prepTime: base.prepTime,
    tags: base.tags,
    prepAhead: base.prepAhead,
    notionUrl: base.notionUrl,
    intro: body?.en?.intro ?? '',
    sections: body?.en?.sections ?? [],
    ...(body ? {} : { pending: true }),
    i18n,
  };
}

function mealOut(meal, dishes, stock, origin) {
  const expand = (ids) => ids.map((id) => dishes.get(id)).filter(Boolean).map((e) => dishSummary(e, stock, origin));
  return {
    id: meal.id,
    row: meal.rowId,
    date: meal.date,
    meal: meal.meal,
    name: meal.name,
    time: meal.time,
    notes: meal.notes,
    combo: meal.combo,
    repeat: meal.repeat,
    draft: meal.draft,
    main: expand(meal.main),
    sides: expand(meal.sides),
  };
}

// { date, meals: { breakfast, lunch, dinner, snack } } for each day from `from` to `to`.
export async function daysBetween(env, from, to, origin) {
  const budget = newBudget(env);
  const [{ meals, dishes }, stock] = await Promise.all([mealsBetween(env, from, to, budget), loadMap(env, 'stock')]);
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const out = Object.fromEntries(SLOTS.map((s) => [s, null]));
    for (const m of meals.filter((x) => x.date === date)) out[m.meal] = mealOut(m, dishes, stock, origin);
    days.push({ date, meals: out });
  }
  return days;
}

// Everything the app needs, in the same shape as the old data/meals.json:
// 14 days back to 60 days ahead, the dishes those meals use, Grab and Go dishes, and the pantry.
export async function appData(env, origin) {
  const budget = newBudget(env);
  const today = istToday();
  const from = addDays(today, -Number(env.PAST_DAYS ?? 14));
  const to = addDays(today, Number(env.FUTURE_DAYS ?? 60));
  const [{ meals, dishes }, pantry] = await Promise.all([mealsBetween(env, from, to, budget), loadPantry(env, budget)]);

  const grabAndGo = [...dishes.values()].filter((e) => isGrabAndGo(e.base)).map((e) => e.base.id);
  const used = new Set([...meals.flatMap((m) => [...m.main, ...m.sides]), ...grabAndGo]);
  // Nearest meals first, so a partly filled response has the recipes that matter today.
  const order = [...new Set([...meals.filter((m) => m.date >= today).flatMap((m) => [...m.main, ...m.sides]), ...used])];
  const entries = order.map((id) => dishes.get(id)).filter(Boolean);

  const { bodies, incomplete: bodiesLeft } = await fillBodies(env, entries, budget);
  const { stock, incomplete: stockLeft } = await fillStock(env, entries, budget);

  return {
    generatedAt: new Date().toISOString(),
    source: 'notion',
    today,
    notionScheduleUrl: env.SCHEDULE_URL || null,
    notionPantryUrl: env.PANTRY_URL || null,
    dishes: Object.fromEntries(entries.map((e) => [e.base.id, appDish(e, stock, bodies, origin)])),
    meals: meals.map(({ rowId, ...m }) => m),
    grabAndGo,
    pantry,
    ...(bodiesLeft || stockLeft ? { incomplete: true } : {}),
  };
}

const PANTRY_STATUS = { 'In stock': 'in', 'Running low': 'low', 'Out of stock': 'out' };

export async function loadPantry(env, budget) {
  if (!env.PANTRY_DS) return [];
  const out = [];
  for (const p of await queryAll(env, env.PANTRY_DS, { budget })) {
    const name = prop(p, 'Name');
    if (!name) continue;
    out.push({
      id: p.id,
      name,
      aisle: prop(p, 'Aisle'),
      status: PANTRY_STATUS[prop(p, 'Status')] ?? null,
      qty: prop(p, 'Quantity'),
      unit: prop(p, 'Unit'),
      aliases: (prop(p, 'Also matches') ?? '').split(',').map((a) => a.trim()).filter(Boolean),
      i18n: { hi: prop(p, 'Name (Hindi)'), mr: prop(p, 'Name (Marathi)') },
    });
  }
  return out;
}
