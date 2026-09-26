#!/usr/bin/env node
// Pulls dishes and the meal schedule from Notion and writes site/data/meals.json.
// Photos are downloaded into site/images/ because Notion file links expire after an hour.
// Dishes without a photo get a free stock photo from Wikimedia Commons.
//
// Env: NOTION_TOKEN, NOTION_DISHES_DB, NOTION_SCHEDULE_DB, NOTION_COMBOS_DB (optional)
// Optional: PAST_DAYS (default 14), FUTURE_DAYS (default 60), STOCK_PHOTOS=0 to disable Commons lookup.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const IMAGE_DIR = join(SITE, 'images', 'dishes');
const OUT_FILE = join(SITE, 'data', 'meals.json');

const NOTION_VERSION = '2022-06-28';
const USER_AGENT = 'meal-master-sync/1.0 (https://github.com/bhattvishal/meal-master)';

const { NOTION_TOKEN, NOTION_DISHES_DB, NOTION_SCHEDULE_DB, NOTION_COMBOS_DB } = process.env;
const PAST_DAYS = Number(process.env.PAST_DAYS ?? 14);
const FUTURE_DAYS = Number(process.env.FUTURE_DAYS ?? 60);
const STOCK_PHOTOS = process.env.STOCK_PHOTOS !== '0';

if (!NOTION_TOKEN || !NOTION_DISHES_DB || !NOTION_SCHEDULE_DB) {
  console.warn('NOTION_TOKEN, NOTION_DISHES_DB or NOTION_SCHEDULE_DB is not set; keeping the committed site/data/meals.json.');
  process.exit(0);
}

async function notion(path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.notion.com/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') ?? 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  }
}

async function queryAll(databaseId, filter) {
  const rows = [];
  let cursor;
  do {
    const page = await notion(`databases/${databaseId}/query`, { filter, start_cursor: cursor, page_size: 100 });
    rows.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return rows;
}

async function blocksOf(pageId) {
  const blocks = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ page_size: '100', ...(cursor && { start_cursor: cursor }) });
    const page = await notion(`blocks/${pageId}/children?${qs}`);
    blocks.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

const text = (rich = []) => rich.map((t) => t.plain_text).join('').trim();

function prop(page, name) {
  const p = page.properties[name];
  if (!p) return null;
  switch (p.type) {
    case 'title': return text(p.title);
    case 'rich_text': return text(p.rich_text) || null;
    case 'number': return p.number;
    case 'select': return p.select?.name ?? null;
    case 'multi_select': return p.multi_select.map((o) => o.name);
    case 'date': return p.date?.start ?? null;
    case 'relation': return p.relation.map((r) => r.id);
    case 'files': return p.files.map((f) => f.file?.url ?? f.external?.url).filter(Boolean);
    default: return null;
  }
}

// Turns a recipe page body into { intro, sections: [{ title, kind: 'list'|'steps'|'text', items }] }.
function parseBody(blocks) {
  const intro = [];
  const sections = [];
  let current = null;
  const push = (kind, item) => {
    if (!item) return;
    if (!current) {
      if (kind === 'text') return intro.push(item);
      current = { title: '', kind, items: [] };
      sections.push(current);
    }
    if (current.items.length === 0) current.kind = kind;
    current.items.push(item);
  };
  for (const b of blocks) {
    const data = b[b.type];
    if (b.type.startsWith('heading_')) {
      current = { title: text(data.rich_text), kind: 'list', items: [] };
      sections.push(current);
    } else if (b.type === 'bulleted_list_item' || b.type === 'to_do') push('list', text(data.rich_text));
    else if (b.type === 'numbered_list_item') push('steps', text(data.rich_text));
    else if (b.type === 'paragraph' || b.type === 'quote' || b.type === 'callout') push('text', text(data.rich_text));
  }
  return { intro: intro.join('\n\n'), sections: sections.filter((s) => s.items.length) };
}

const extFor = (contentType, url) => {
  const fromType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[contentType?.split(';')[0]];
  return fromType ?? (url.split('?')[0].match(/\.(jpe?g|png|webp|gif|avif)$/i)?.[1].toLowerCase() || 'jpg');
};

async function download(url, baseName) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const file = `${baseName}.${extFor(res.headers.get('content-type'), url)}`;
  await writeFile(join(IMAGE_DIR, file), Buffer.from(await res.arrayBuffer()));
  return `images/dishes/${file}`;
}

const stripHtml = (s = '') => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function commonsPhoto(query) {
  const qs = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: '6', gsrlimit: '5',
    prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '1200',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${qs}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;
  const pages = Object.values((await res.json()).query?.pages ?? {}).sort((a, b) => a.index - b.index);
  // Prefer landscape photos, which suit the card headers.
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

async function photoFor(page, name) {
  const base = page.id.replace(/-/g, '');
  const own = prop(page, 'Photo')?.[0] ?? page.cover?.file?.url ?? page.cover?.external?.url;
  try {
    if (own) return { src: await download(own, base), credit: null };
    if (!STOCK_PHOTOS) return null;
    const stock = await commonsPhoto(prop(page, 'Photo search') || name);
    if (!stock) return null;
    return { src: await download(stock.url, base), credit: stock.credit, license: stock.license, sourceUrl: stock.sourceUrl };
  } catch (err) {
    console.warn(`  photo for "${name}" failed: ${err.message}`);
    return null;
  }
}

const isoDay = (d) => d.toISOString().slice(0, 10);
const shift = (days) => isoDay(new Date(Date.now() + days * 86400000));
const addDays = (day, n) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000));
const weekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday

// Which days a repeating row lands on.
const REPEATS = {
  daily: () => true,
  weekdays: (day) => weekday(day) >= 1 && weekday(day) <= 5,
  weekends: (day) => weekday(day) === 0 || weekday(day) === 6,
  weekly: (day, from) => weekday(day) === weekday(from),
};

// Turns schedule rows into one meal per date. One-off rows win over repeats on the same
// date and meal; among repeats, the one that started most recently wins.
function expandSchedule(rows, combos, windowStart, windowEnd) {
  const byKey = new Map();
  const put = (meal, priority) => {
    const key = `${meal.date}|${meal.meal}`;
    const existing = byKey.get(key);
    if (!existing || priority > existing.priority) byKey.set(key, { meal, priority });
  };

  for (const p of rows) {
    const date = prop(p, 'Date')?.slice(0, 10);
    if (!date) continue;
    const combo = combos.get(prop(p, 'Combo')?.[0]);
    const main = prop(p, 'Main') ?? [];
    const sides = prop(p, 'Sides') ?? [];
    const base = {
      meal: (prop(p, 'Meal') || combo?.meal || 'Dinner').toLowerCase(),
      name: prop(p, 'Name') || combo?.name || null,
      time: prop(p, 'Time'),
      notes: prop(p, 'Notes') || combo?.notes || null,
      combo: combo?.name ?? null,
      main: main.length ? main : combo?.main ?? [],
      sides: sides.length ? sides : combo?.sides ?? [],
      draft: prop(p, 'Planned by') === 'Claude draft',
    };
    const repeat = prop(p, 'Repeat')?.toLowerCase();
    if (!repeat || !REPEATS[repeat]) {
      if (date >= windowStart && date <= windowEnd) put({ id: p.id, date, ...base, repeat: null }, Infinity);
      continue;
    }
    const until = prop(p, 'Until')?.slice(0, 10) ?? windowEnd;
    const last = until < windowEnd ? until : windowEnd;
    for (let day = date > windowStart ? date : windowStart; day <= last; day = addDays(day, 1)) {
      if (REPEATS[repeat](day, date)) put({ id: `${p.id}:${day}`, date: day, ...base, repeat }, Date.parse(date));
    }
  }
  return [...byKey.values()]
    .map((v) => v.meal)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

async function main() {
  const windowStart = shift(-PAST_DAYS);
  const windowEnd = shift(FUTURE_DAYS);

  const combos = new Map();
  if (NOTION_COMBOS_DB) {
    console.log('Querying meal combos…');
    for (const p of await queryAll(NOTION_COMBOS_DB)) {
      combos.set(p.id, {
        name: prop(p, 'Name'),
        meal: prop(p, 'Meal'),
        notes: prop(p, 'Notes'),
        main: prop(p, 'Main') ?? [],
        sides: prop(p, 'Sides') ?? [],
      });
    }
  }

  console.log('Querying meal schedule…');
  const schedule = await queryAll(NOTION_SCHEDULE_DB, {
    or: [
      {
        and: [
          { property: 'Date', date: { on_or_after: windowStart } },
          { property: 'Date', date: { on_or_before: windowEnd } },
        ],
      },
      {
        and: [
          { property: 'Repeat', select: { is_not_empty: true } },
          { property: 'Date', date: { on_or_before: windowEnd } },
        ],
      },
    ],
  });
  const meals = expandSchedule(schedule, combos, windowStart, windowEnd);

  console.log('Querying dishes…');
  const dishPages = await queryAll(NOTION_DISHES_DB);
  const used = new Set(meals.flatMap((m) => [...m.main, ...m.sides]));

  await rm(IMAGE_DIR, { recursive: true, force: true });
  await mkdir(IMAGE_DIR, { recursive: true });

  const dishes = {};
  for (const page of dishPages.filter((p) => used.has(p.id))) {
    const name = prop(page, 'Name') || 'Untitled dish';
    console.log(`  ${name}`);
    const body = parseBody(await blocksOf(page.id));
    dishes[page.id] = {
      id: page.id,
      name,
      type: (prop(page, 'Type') || 'Main').toLowerCase(),
      emoji: page.icon?.type === 'emoji' ? page.icon.emoji : null,
      photo: await photoFor(page, name),
      nutrition: {
        protein: prop(page, 'Protein (g)'),
        carbs: prop(page, 'Carbs (g)'),
        fat: prop(page, 'Fat (g)'),
        fibre: prop(page, 'Fibre (g)'),
        calories: prop(page, 'Calories (kcal)'),
      },
      nutritionSource: prop(page, 'Nutrition source'),
      serving: prop(page, 'Serving'),
      serves: prop(page, 'Serves'),
      prepTime: prop(page, 'Prep time (min)'),
      tags: prop(page, 'Tags') ?? [],
      notionUrl: page.url,
      ...body,
    };
  }

  const data = {
    generatedAt: new Date().toISOString(),
    source: 'notion',
    notionScheduleUrl: `https://www.notion.so/${NOTION_SCHEDULE_DB.replace(/-/g, '')}`,
    dishes,
    meals,
  };
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`Wrote ${meals.length} meals and ${Object.keys(dishes).length} dishes to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
