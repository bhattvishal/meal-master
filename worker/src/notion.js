// Notion API client (version 2025-09-03, data-source endpoints) and the parsing of rows and recipe pages.

export const NOTION_VERSION = '2025-09-03';

// An error the Worker reports to the caller as { error, hint }.
export class ApiError extends Error {
  constructor(status, error, hint, detail) {
    super(hint || error);
    this.status = status;
    this.error = error;
    this.hint = hint;
    this.detail = detail;
  }
}

const HINTS = {
  401: 'NOTION_TOKEN is wrong or was revoked. Copy the integration secret again and run: wrangler secret put NOTION_TOKEN',
  403: 'The integration lacks a capability. In Notion → Integrations, give it Read, Update and Insert content.',
  404: 'Share the Meal Plan page with the integration: open Meal Plan in Notion → ••• → Connections → add the integration.',
  429: 'Notion is rate limiting; try again in a few seconds.',
};

// Counts outbound requests so one Worker call stays well inside Cloudflare's subrequest limit.
export class Budget {
  constructor(max) { this.left = max; }
  take(n = 1) {
    if (this.left < n) return false;
    this.left -= n;
    return true;
  }
}

export async function notion(env, path, { method = 'GET', body, budget } = {}) {
  if (!env.NOTION_TOKEN) throw new ApiError(500, 'config_missing', 'Set the NOTION_TOKEN secret: wrangler secret put NOTION_TOKEN');
  const base = (env.NOTION_API || 'https://api.notion.com').replace(/\/$/, '');
  for (let attempt = 0; ; attempt++) {
    if (budget && !budget.take()) throw new ApiError(503, 'busy', 'Too many Notion calls for one request; try again.');
    const res = await fetch(`${base}/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, Math.min(2, Number(res.headers.get('retry-after') ?? 1)) * 1000));
      continue;
    }
    if (res.ok) return res.json();
    let detail = '';
    try { detail = (await res.json()).message ?? ''; } catch { /* not JSON */ }
    throw new ApiError(res.status === 404 || res.status === 400 ? res.status : 502, `notion_${res.status}`, HINTS[res.status] ?? detail, detail);
  }
}

export async function queryAll(env, dataSourceId, { filter, sorts, budget } = {}) {
  const rows = [];
  let cursor;
  do {
    const page = await notion(env, `data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body: { page_size: 100, ...(filter && { filter }), ...(sorts && { sorts }), ...(cursor && { start_cursor: cursor }) },
      budget,
    });
    rows.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return rows;
}

export async function blocksOf(env, pageId, budget) {
  const blocks = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ page_size: '100', ...(cursor && { start_cursor: cursor }) });
    const page = await notion(env, `blocks/${pageId}/children?${qs}`, { budget });
    blocks.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

// ---------- properties ----------

const text = (rich = []) => rich.map((t) => t.plain_text).join('').trim();

export function prop(page, name) {
  const p = page.properties?.[name];
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

export const cleanId = (id) => String(id ?? '').replace(/-/g, '').toLowerCase();
export const isId = (id) => /^[0-9a-f]{32}$/.test(cleanId(id));
export const dashed = (id) => cleanId(id).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

export function scheduleRow(page) {
  return {
    id: page.id,
    name: prop(page, 'Name') || null,
    meal: prop(page, 'Meal')?.toLowerCase() ?? null,
    date: prop(page, 'Date')?.slice(0, 10) ?? null,
    time: prop(page, 'Time'),
    notes: prop(page, 'Notes'),
    main: prop(page, 'Main') ?? [],
    sides: prop(page, 'Sides') ?? [],
    combo: prop(page, 'Combo')?.[0] ?? null,
    repeat: prop(page, 'Repeat')?.toLowerCase() ?? null,
    until: prop(page, 'Until')?.slice(0, 10) ?? null,
    draft: prop(page, 'Planned by') === 'Claude draft',
  };
}

export function comboEntry(page) {
  return {
    name: prop(page, 'Name'),
    i18n: { hi: prop(page, 'Name (Hindi)'), mr: prop(page, 'Name (Marathi)') },
    meal: prop(page, 'Meal'),
    notes: prop(page, 'Notes'),
    main: prop(page, 'Main') ?? [],
    sides: prop(page, 'Sides') ?? [],
  };
}

// The photo the dish page has: the Photo column first, then the page cover.
// Notion-hosted links are signed and expire after about an hour, so they are never stored.
export function ownPhotoUrl(page) {
  return prop(page, 'Photo')?.[0] ?? page.cover?.file?.url ?? page.cover?.external?.url ?? null;
}

// Everything about a dish except its recipe body.
export function dishBase(page) {
  return {
    id: page.id,
    name: prop(page, 'Name') || 'Untitled dish',
    type: (prop(page, 'Type') || 'Main').toLowerCase(),
    category: prop(page, 'Category'),
    emoji: page.icon?.type === 'emoji' ? page.icon.emoji : null,
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
    prepAhead: prop(page, 'Prep ahead'),
    photoSearch: prop(page, 'Photo search'),
    notionUrl: page.url,
    edited: page.last_edited_time,
    names: { en: prop(page, 'Name') || 'Untitled dish', hi: prop(page, 'Name (Hindi)'), mr: prop(page, 'Name (Marathi)') },
    servings: { en: prop(page, 'Serving'), hi: prop(page, 'Serving (Hindi)'), mr: prop(page, 'Serving (Marathi)') },
  };
}

// Quick lunches for the Grab and Go page: tagged "Grab and Go", or office-friendly and ready in 10 minutes.
export function isGrabAndGo(dish) {
  return dish.tags.includes('Grab and Go') || (dish.tags.includes('Office-friendly') && dish.prepTime != null && dish.prepTime <= 10);
}

// ---------- recipe body ----------

// A top-level heading with one of these names starts that language's copy of the recipe.
const LANGUAGE_HEADINGS = { hi: /^(hindi|हिन्दी|हिंदी)$/i, mr: /^(marathi|मराठी)$/i };

// Turns a recipe page body into { en: { intro, sections }, hi: {...}, mr: {...} }, where
// sections are [{ title, kind: 'list'|'steps'|'text', items }].
export function parseBody(blocks) {
  const copies = { en: { intro: [], sections: [] } };
  let lang = 'en';
  let current = null;
  const push = (kind, item) => {
    if (!item) return;
    const copy = copies[lang];
    if (!current) {
      if (kind === 'text') return copy.intro.push(item);
      current = { title: '', kind, items: [] };
      copy.sections.push(current);
    }
    if (current.items.length === 0) current.kind = kind;
    current.items.push(item);
  };
  for (const b of blocks) {
    const data = b[b.type];
    if (!data) continue;
    if (b.type === 'heading_1') {
      const title = text(data.rich_text);
      const marker = Object.keys(LANGUAGE_HEADINGS).find((l) => LANGUAGE_HEADINGS[l].test(title));
      if (marker) {
        lang = marker;
        copies[lang] ??= { intro: [], sections: [] };
        current = null;
        continue;
      }
    }
    if (b.type.startsWith('heading_')) {
      current = { title: text(data.rich_text), kind: 'list', items: [] };
      copies[lang].sections.push(current);
    } else if (b.type === 'bulleted_list_item' || b.type === 'to_do') push('list', text(data.rich_text));
    else if (b.type === 'numbered_list_item') push('steps', text(data.rich_text));
    else if (b.type === 'paragraph' || b.type === 'quote' || b.type === 'callout') push('text', text(data.rich_text));
  }
  const tidy = (c) => ({ intro: c.intro.join('\n\n'), sections: c.sections.filter((s) => s.items.length) });
  return Object.fromEntries(Object.entries(copies).map(([l, c]) => [l, tidy(c)]));
}

// The recipe as plain text, one language after another.
export function recipeText(body) {
  const LABEL = { en: '', hi: '# हिन्दी', mr: '# मराठी' };
  return Object.entries(body).map(([lang, copy]) => [
    LABEL[lang],
    copy.intro,
    ...copy.sections.map((s) => [s.title && `## ${s.title}`, ...s.items.map((it, i) => (s.kind === 'steps' ? `${i + 1}. ${it}` : s.kind === 'list' ? `- ${it}` : it))].filter(Boolean).join('\n')),
  ].filter(Boolean).join('\n\n')).join('\n\n');
}
