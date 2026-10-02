// A small stand-in for the Notion API (2025-09-03 data-source endpoints) and the WhatsApp Graph API,
// used by test/run.mjs. Holds data in memory; POST/PATCH change it like Notion would.

import http from 'node:http';

const MEAL_DS = 'f41b8852-00f8-4721-9ae8-1123c180b1f8';
const DISH_DS = '32e53ab6-113b-4da5-8586-56c23cc33500';
const COMBO_DS = '6a946f52-b613-4498-b2b1-512ed9f64b9e';
const PANTRY_DS = 'e4d4bfef-f6e4-4d8c-9be7-413e5f9392bb';
export const IDS = { MEAL_DS, DISH_DS, COMBO_DS, PANTRY_DS };

const rt = (s) => (s ? [{ type: 'text', plain_text: String(s), text: { content: String(s) } }] : []);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const D = { wrap: id(1), curd: id(2), poha: id(3), juice: id(4), dal: id(5), rice: id(6), paneer: id(7), roti: id(8), salad: id(9) };
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

export function createMock() {
  let port;
  const now = () => new Date().toISOString();
  const signed = (name) => `http://127.0.0.1:${port}/files/${name}?expires=${Date.now() + 3600000}`;
  const dishes = new Map();
  const addDish = (key, name, extra = {}) => dishes.set(D[key], {
    object: 'page', id: D[key], url: `https://www.notion.so/${D[key].replace(/-/g, '')}`, last_edited_time: '2026-09-01T10:00:00.000Z',
    icon: { type: 'emoji', emoji: extra.emoji ?? '🍽️' }, cover: null, parent: { type: 'data_source_id', data_source_id: DISH_DS },
    properties: {
      Name: { type: 'title', title: rt(name) },
      'Name (Hindi)': { type: 'rich_text', rich_text: rt(extra.hi) },
      'Name (Marathi)': { type: 'rich_text', rich_text: rt(extra.mr) },
      Type: { type: 'select', select: { name: extra.type ?? 'Main' } },
      Category: { type: 'select', select: extra.category ? { name: extra.category } : null },
      Tags: { type: 'multi_select', multi_select: (extra.tags ?? []).map((name) => ({ name })) },
      'Calories (kcal)': { type: 'number', number: extra.kcal ?? 300 },
      'Protein (g)': { type: 'number', number: extra.protein ?? 15 },
      'Carbs (g)': { type: 'number', number: 30 },
      'Fat (g)': { type: 'number', number: 10 },
      'Fibre (g)': { type: 'number', number: 5 },
      Serves: { type: 'number', number: 2 },
      Serving: { type: 'rich_text', rich_text: rt('1 plate') },
      'Serving (Hindi)': { type: 'rich_text', rich_text: rt('1 प्लेट') },
      'Serving (Marathi)': { type: 'rich_text', rich_text: [] },
      'Prep time (min)': { type: 'number', number: extra.prep ?? 20 },
      Photo: { type: 'files', files: extra.photo ?? [] },
      'Photo search': { type: 'rich_text', rich_text: [] },
      'Prep ahead': { type: 'rich_text', rich_text: [] },
      'Nutrition source': { type: 'select', select: { name: 'Estimated' } },
    },
  });
  addDish('wrap', 'Paneer or Chana Wrap', { hi: 'पनीर या चना रैप', tags: ['Office-friendly', 'Grab and Go'], prep: 10, photo: [{ type: 'file', name: 'wrap.png', file: { url: 'SIGNED:wrap.png' } }] });
  addDish('curd', 'Curd Cup with Chia', { hi: 'चिया वाला दही', type: 'Side', photo: [{ type: 'external', name: 'curd', external: { url: 'EXTERNAL:curd.png' } }] });
  addDish('poha', 'Poha', { hi: 'पोहा', mr: 'पोहे' });
  addDish('juice', 'Mosambi Juice', { hi: 'मौसमी जूस', type: 'Side' });
  addDish('dal', 'Dal Fry (Toor)', { hi: 'दाल फ्राई (तूर)', type: 'Side' });
  addDish('rice', 'Plain Rice', { hi: 'सादा चावल', type: 'Side' });
  addDish('paneer', 'Paneer Bhurji', { hi: 'पनीर भुर्जी' });
  addDish('roti', 'Multigrain Roti', { hi: 'मल्टीग्रेन रोटी', type: 'Side' });
  addDish('salad', 'Green Salad', { hi: 'हरा सलाद', type: 'Side', tags: ['Office-friendly'], prep: 10 });

  const blocks = new Map([[D.wrap, [
    { type: 'paragraph', paragraph: { rich_text: rt('Office lunch.') } },
    { type: 'heading_2', heading_2: { rich_text: rt('Ingredients') } },
    { type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt('2 multigrain roti') } },
    { type: 'heading_2', heading_2: { rich_text: rt('Method') } },
    { type: 'numbered_list_item', numbered_list_item: { rich_text: rt('Fill and roll.') } },
    { type: 'heading_1', heading_1: { rich_text: rt('हिन्दी') } },
    { type: 'heading_2', heading_2: { rich_text: rt('सामग्री') } },
    { type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt('2 मल्टीग्रेन रोटी') } },
  ]]]);

  const combos = [{
    object: 'page', id: id(100), properties: {
      Name: { type: 'title', title: rt('Office lunch') }, 'Name (Hindi)': { type: 'rich_text', rich_text: rt('ऑफ़िस लंच') },
      'Name (Marathi)': { type: 'rich_text', rich_text: [] }, Meal: { type: 'select', select: { name: 'Lunch' } },
      Main: { type: 'relation', relation: [{ id: D.wrap }] }, Sides: { type: 'relation', relation: [{ id: D.curd }] },
      Notes: { type: 'rich_text', rich_text: rt('Pack by 8:30') },
    },
  }];

  let nextRow = 200;
  const rows = [];
  const addRow = ({ name, meal, date, repeat, until, main = [], sides = [], combo, notes, time }) => {
    const row = {
      object: 'page', id: id(nextRow++), last_edited_time: now(), parent: { type: 'data_source_id', data_source_id: MEAL_DS },
      properties: {
        Name: { type: 'title', title: rt(name) },
        Meal: { type: 'select', select: meal ? { name: meal } : null },
        Date: { type: 'date', date: date ? { start: date } : null },
        Time: { type: 'rich_text', rich_text: rt(time) },
        Main: { type: 'relation', relation: main.map((x) => ({ id: x })) },
        Sides: { type: 'relation', relation: sides.map((x) => ({ id: x })) },
        Combo: { type: 'relation', relation: combo ? [{ id: combo }] : [] },
        Notes: { type: 'rich_text', rich_text: rt(notes) },
        Repeat: { type: 'select', select: repeat ? { name: repeat } : null },
        Until: { type: 'date', date: until ? { start: until } : null },
        'Planned by': { type: 'select', select: { name: 'Me' } },
      },
    };
    rows.push(row);
    return row;
  };

  const pantry = [{ object: 'page', id: id(300), properties: {
    Name: { type: 'title', title: rt('Paneer') }, Aisle: { type: 'select', select: { name: 'Dairy' } }, Status: { type: 'select', select: { name: 'Running low' } },
    Quantity: { type: 'number', number: 200 }, Unit: { type: 'select', select: { name: 'g' } }, 'Also matches': { type: 'rich_text', rich_text: rt('cottage cheese') },
    'Name (Hindi)': { type: 'rich_text', rich_text: rt('पनीर') }, 'Name (Marathi)': { type: 'rich_text', rich_text: [] },
  } }];

  const calls = [];
  const sent = [];

  // Evaluates the subset of Notion filters the Worker uses.
  const value = (page, name) => {
    const p = page.properties[name];
    if (!p) return undefined;
    if (p.type === 'date') return p.date?.start ?? null;
    if (p.type === 'select') return p.select?.name ?? null;
    return undefined;
  };
  const matches = (page, f) => {
    if (!f) return true;
    if (f.and) return f.and.every((x) => matches(page, x));
    if (f.or) return f.or.some((x) => matches(page, x));
    const v = value(page, f.property);
    const [kind] = Object.keys(f).filter((k) => k !== 'property');
    const [op, arg] = Object.entries(f[kind])[0];
    if (op === 'is_empty') return v == null;
    if (op === 'is_not_empty') return v != null;
    if (v == null) return false;
    if (op === 'equals') return kind === 'date' ? v.slice(0, 10) === arg : v === arg;
    if (op === 'on_or_after') return v.slice(0, 10) >= arg;
    if (op === 'on_or_before') return v.slice(0, 10) <= arg;
    throw new Error(`mock: unsupported filter ${JSON.stringify(f)}`);
  };
  // Signed Notion file links are made fresh on every read, like the real API.
  const fresh = (page) => {
    const copy = JSON.parse(JSON.stringify(page));
    for (const f of copy.properties?.Photo?.files ?? []) {
      if (f.file) f.file.url = signed(f.file.url.replace('SIGNED:', '').replace(/\?.*$/, '').split('/').pop());
      if (f.external) f.external.url = `http://127.0.0.1:${port}/files/${f.external.url.replace('EXTERNAL:', '').split('/').pop()}`;
    }
    return copy;
  };
  const allPages = () => [...dishes.values(), ...rows, ...combos, ...pantry];
  const findPage = (pid) => allPages().find((p) => p.id.replace(/-/g, '') === pid.replace(/-/g, ''));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    for await (const chunk of req) body += chunk;
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    calls.push(`${req.method} ${url.pathname}`);

    if (url.pathname.startsWith('/files/')) {
      if (Number(url.searchParams.get('expires') ?? Infinity) < Date.now()) return send(403, { error: 'expired' });
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(PNG);
    }
    if (url.pathname.includes('/messages')) {
      sent.push({ auth: req.headers.authorization, body: JSON.parse(body) });
      return send(200, { messages: [{ id: 'wamid.test' }] });
    }
    if (req.headers.authorization !== 'Bearer test-token') return send(401, { object: 'error', code: 'unauthorized', message: 'API token is invalid.' });
    if (req.headers['notion-version'] !== '2025-09-03') return send(400, { object: 'error', code: 'validation_error', message: `bad version ${req.headers['notion-version']}` });

    let m;
    if (req.method === 'POST' && (m = url.pathname.match(/^\/v1\/data_sources\/([^/]+)\/query$/))) {
      const q = JSON.parse(body || '{}');
      const source = { [MEAL_DS]: rows, [DISH_DS]: [...dishes.values()], [COMBO_DS]: combos, [PANTRY_DS]: pantry }[m[1]];
      if (!source) return send(404, { object: 'error', code: 'object_not_found', message: `Could not find data_source with ID: ${m[1]}.` });
      const results = source.filter((p) => matches(p, q.filter)).map(fresh);
      return send(200, { object: 'list', results, has_more: false, next_cursor: null });
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/blocks\/([^/]+)\/children$/))) {
      const list = blocks.get(findPage(m[1])?.id) ?? [];
      return send(200, { object: 'list', results: list.map((b, i) => ({ object: 'block', id: `${m[1]}-${i}`, ...b })), has_more: false });
    }
    if ((m = url.pathname.match(/^\/v1\/pages\/([^/]+)$/))) {
      const page = findPage(m[1]);
      if (!page) return send(404, { object: 'error', code: 'object_not_found', message: 'Could not find page.' });
      if (req.method === 'GET') return send(200, fresh(page));
      if (req.method === 'PATCH') {
        Object.assign(page.properties, fromWrite(JSON.parse(body).properties));
        page.last_edited_time = now();
        return send(200, fresh(page));
      }
    }
    if (req.method === 'POST' && url.pathname === '/v1/pages') {
      const q = JSON.parse(body);
      if (q.parent?.data_source_id !== MEAL_DS) return send(400, { object: 'error', code: 'validation_error', message: 'parent must be the Meal Schedule data source' });
      const row = addRow({ name: 'new' });
      Object.assign(row.properties, fromWrite(q.properties));
      return send(200, fresh(row));
    }
    send(404, { object: 'error', code: 'invalid_request_url', message: `mock: ${req.method} ${url.pathname}` });
  });

  // Turns write-shaped properties into read-shaped ones.
  function fromWrite(props) {
    const out = {};
    for (const [k, v] of Object.entries(props)) {
      if (v.title) out[k] = { type: 'title', title: v.title.map((t) => ({ plain_text: t.text.content })) };
      else if (v.rich_text) out[k] = { type: 'rich_text', rich_text: v.rich_text.map((t) => ({ plain_text: t.text.content })) };
      else if (v.relation) out[k] = { type: 'relation', relation: v.relation };
      else if ('select' in v) out[k] = { type: 'select', select: v.select };
      else if ('date' in v) out[k] = { type: 'date', date: v.date };
    }
    return out;
  }

  return {
    rows, dishes, calls, sent, addRow, D, COMBO: id(100),
    touchDish(key, name) {
      const page = dishes.get(D[key]);
      page.properties.Name.title = rt(name);
      page.last_edited_time = now();
    },
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(port); })),
    close: () => server.close(),
  };
}
