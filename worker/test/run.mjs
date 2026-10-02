// End-to-end test: runs the Worker in workerd (`wrangler dev`) against the mock Notion in
// mock-notion.mjs and checks the acceptance points. Run with: cd worker && npm test
// (needs wrangler, from `npm install`).

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createMock } from './mock-notion.mjs';

const WORKER_DIR = new URL('..', import.meta.url).pathname;
const WRANGLER = process.env.WRANGLER || 'npx';
const WRANGLER_ARGS = process.env.WRANGLER ? [] : ['wrangler'];
const ORIGIN = 'https://bhattvishal.github.io';

const ist = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dow = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
const nextWhere = (from, test) => { let d = from; while (!test(d)) d = addDays(d, 1); return d; };
const isWeekday = (d) => dow(d) >= 1 && dow(d) <= 5;

const today = ist();
const tomorrow = addDays(today, 1);
const weekdayA = nextWhere(addDays(today, 1), isWeekday); // only the weekday repeat
const weekdayB = nextWhere(addDays(weekdayA, 1), isWeekday); // a normal row overrides it
const weekdayC = nextWhere(addDays(weekdayB, 1), isWeekday); // combo row with its own Sides
const weekend = nextWhere(addDays(today, 1), (d) => !isWeekday(d));

const mock = createMock();
const { D } = mock;
mock.addRow({ name: 'Office lunch', meal: 'Lunch', date: addDays(today, -30), repeat: 'Weekdays', combo: mock.COMBO });
mock.addRow({ name: 'Paneer day', meal: 'Lunch', date: weekdayB, main: [D.paneer], sides: [D.roti] });
mock.addRow({ name: 'Combo with salad', meal: 'Lunch', date: weekdayC, combo: mock.COMBO, sides: [D.salad] });
mock.addRow({ name: 'Poha breakfast', meal: 'Breakfast', date: addDays(today, -30), repeat: 'Daily', main: [D.poha], sides: [D.juice], time: '09:00' });
mock.addRow({ name: 'Old dinner', meal: 'Dinner', date: addDays(today, -30), repeat: 'Daily', until: addDays(today, -1), main: [D.rice] });
mock.addRow({ name: 'Dal night', meal: 'Dinner', date: tomorrow, repeat: 'Weekly', main: [D.dal], sides: [D.rice, D.roti] });

const notionPort = await mock.listen();
let failures = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    results.push(`  ✗ ${name}\n      ${String(err.message).split('\n').join('\n      ')}`);
  }
}

// Each Worker gets empty storage, so earlier runs can't make a test pass.
const stateDirs = [];
function startWorker(port, vars) {
  const state = mkdtempSync(join(tmpdir(), 'meal-worker-'));
  stateDirs.push(state);
  const args = [...WRANGLER_ARGS, 'dev', '--port', String(port), '--ip', '127.0.0.1', '--test-scheduled', '--log-level', 'log', '--persist-to', state,
    ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])];
  const child = spawn(WRANGLER, args, { cwd: WORKER_DIR, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' } });
  let log = '';
  child.stdout.on('data', (b) => { log += b; });
  child.stderr.on('data', (b) => { log += b; });
  return { child, log: () => log };
}

async function waitUp(base) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* not yet */ }
    await sleep(500);
  }
  throw new Error('worker did not start');
}

const baseVars = {
  NOTION_API: `http://127.0.0.1:${notionPort}`,
  NOTION_TOKEN: 'test-token',
  APP_PIN: '2468',
  STOCK_PHOTOS: '0',
  CACHE_SECONDS: '3',
};

// ---------- main instance ----------
const PORT = 8790;
const W = `http://127.0.0.1:${PORT}`;
const main = startWorker(PORT, baseVars);
try {
  await waitUp(W);
  const get = async (path, headers = {}) => {
    const res = await fetch(`${W}${path}`, { headers: { Origin: ORIGIN, ...headers } });
    return { res, body: await res.json().catch(() => null) };
  };
  const names = (m) => (m ? [...m.main, ...m.sides].map((d) => d.names.en) : null);

  await check('/today is today in IST, weekday repeat applies on weekdays', async () => {
    const { body } = await get('/today');
    assert.equal(body.date, today);
    assert.deepEqual(names(body.meals.breakfast), ['Poha', 'Mosambi Juice']);
    assert.deepEqual(names(body.meals.lunch), isWeekday(today) ? ['Paneer or Chana Wrap', 'Curd Cup with Chia'] : null);
    const { body: day } = await get(`/day?date=${today}`);
    assert.deepEqual(day, body);
  });
  await check(`Weekdays repeat + combo on ${weekdayA}`, async () => {
    const { body } = await get(`/day?date=${weekdayA}`);
    const lunch = body.meals.lunch;
    assert.deepEqual(names(lunch), ['Paneer or Chana Wrap', 'Curd Cup with Chia']);
    assert.equal(lunch.repeat, 'weekdays');
    assert.equal(lunch.combo, 'Office lunch');
    assert.equal(lunch.notes, 'Pack by 8:30');
    assert.equal(lunch.main[0].names.hi, 'पनीर या चना रैप');
  });
  await check(`A normal row overrides the repeat on ${weekdayB}`, async () => {
    const { body } = await get(`/day?date=${weekdayB}`);
    assert.deepEqual(names(body.meals.lunch), ['Paneer Bhurji', 'Multigrain Roti']);
    assert.equal(body.meals.lunch.repeat, null);
  });
  await check(`Row Sides override the combo's on ${weekdayC}`, async () => {
    const { body } = await get(`/day?date=${weekdayC}`);
    assert.deepEqual(names(body.meals.lunch), ['Paneer or Chana Wrap', 'Green Salad']);
  });
  await check(`No weekday lunch on the weekend (${weekend})`, async () => {
    const { body } = await get(`/day?date=${weekend}`);
    assert.equal(body.meals.lunch, null);
  });
  await check('Until ends a repeat; Weekly repeats on its weekday', async () => {
    const { body: past } = await get(`/day?date=${addDays(today, -2)}`);
    assert.deepEqual(names(past.meals.dinner), ['Plain Rice']);
    const { body: t } = await get(`/day?date=${tomorrow}`);
    assert.deepEqual(names(t.meals.dinner), ['Dal Fry (Toor)', 'Plain Rice', 'Multigrain Roti']);
    const { body: after } = await get(`/day?date=${addDays(tomorrow, 1)}`);
    assert.equal(after.meals.dinner, null);
    const { body: week } = await get(`/day?date=${addDays(tomorrow, 7)}`);
    assert.deepEqual(names(week.meals.dinner), ['Dal Fry (Toor)', 'Plain Rice', 'Multigrain Roti']);
  });
  await check('/week returns 7 days', async () => {
    const { body } = await get(`/week?start=${today}`);
    assert.equal(body.days.length, 7);
    assert.equal(body.days[0].date, today);
    assert.equal(body.days[6].date, addDays(today, 6));
  });
  await check('Uploaded (signed) and external photos are served fresh through /photo', async () => {
    const { body } = await get(`/day?date=${weekdayA}`);
    const [wrap, curd] = [body.meals.lunch.main[0], body.meals.lunch.sides[0]];
    assert.match(wrap.photo.url, /expires=\d+/);
    assert.ok(Number(new URL(wrap.photo.url).searchParams.get('expires')) > Date.now(), 'signed link is fresh');
    for (const d of [wrap, curd]) {
      const res = await fetch(d.photo.src, { headers: { Origin: ORIGIN } });
      assert.equal(res.status, 200, await res.clone().text());
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    }
    const { body: b2 } = await get(`/day?date=${today}`);
    assert.equal(b2.meals.breakfast.main[0].photo, null, 'dish without a photo');
  });
  await check('/dish/:id has the recipe in each language', async () => {
    const { body } = await get(`/dish/${D.wrap}`);
    assert.equal(body.recipe.en.intro, 'Office lunch.');
    assert.deepEqual(body.recipe.en.sections.map((s) => s.kind), ['list', 'steps']);
    assert.equal(body.recipe.hi.sections[0].items[0], '2 मल्टीग्रेन रोटी');
    assert.match(body.text, /## Ingredients\n- 2 multigrain roti/);
  });
  await check('Unknown page gives a clear notion_404 error', async () => {
    const { res, body } = await get('/dish/0000000000004000800000000000abcd');
    assert.equal(res.status, 404);
    assert.equal(body.error, 'notion_404');
    assert.match(body.hint, /Connections/);
  });
  await check('/data has the app shape: recipes, Grab and Go, pantry', async () => {
    const { body } = await get('/data');
    assert.equal(body.incomplete, undefined);
    const wrap = body.dishes[D.wrap];
    assert.equal(wrap.sections.length, 2);
    assert.equal(wrap.i18n.hi.name, 'पनीर या चना रैप');
    assert.deepEqual(new Set(body.grabAndGo), new Set([D.wrap, D.salad]));
    assert.equal(body.pantry[0].status, 'low');
    assert.ok(body.meals.some((m) => m.date === weekdayB && m.meal === 'lunch' && m.main[0] === D.paneer));
  });
  await check('GET answers are cached and pick up Notion changes after the cache time', async () => {
    const first = await get(`/day?date=${weekdayA}`);
    const again = await get(`/day?date=${weekdayA}`);
    assert.equal(again.res.headers.get('x-cache'), 'HIT');
    mock.touchDish('wrap', 'Chana Wrap');
    const stillCached = await get(`/day?date=${weekdayA}`);
    assert.equal(stillCached.body.meals.lunch.main[0].names.en, first.body.meals.lunch.main[0].names.en);
    await sleep(3500);
    const fresh = await get(`/day?date=${weekdayA}`);
    assert.equal(fresh.body.meals.lunch.main[0].names.en, 'Chana Wrap');
  });
  await check('CORS: only the allowed origin (and localhost)', async () => {
    const ok = await fetch(`${W}/today`, { headers: { Origin: ORIGIN } });
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
    const local = await fetch(`${W}/today`, { headers: { Origin: 'http://localhost:8765' } });
    assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:8765');
    const bad = await fetch(`${W}/today`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    const pre = await fetch(`${W}/meal`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.status, 403);
    const pre2 = await fetch(`${W}/meal`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre2.status, 204);
    assert.match(pre2.headers.get('access-control-allow-headers'), /X-App-Pin/);
  });

  const post = (body, pin) => fetch(`${W}/meal`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(pin && { 'X-App-Pin': pin }) },
    body: JSON.stringify(body),
  });
  await check('POST /meal without or with a wrong PIN is 401', async () => {
    const before = mock.rows.length;
    const none = await post({ date: weekdayA, meal: 'lunch', notes: 'x' });
    assert.equal(none.status, 401);
    assert.equal((await none.json()).error, 'unauthorized');
    const wrong = await post({ date: weekdayA, meal: 'lunch', notes: 'x' }, '1111');
    assert.equal(wrong.status, 401);
    assert.equal(mock.rows.length, before, 'nothing written');
  });
  await check('POST /meal validates its body', async () => {
    assert.equal((await post({ date: '2026-13-40', meal: 'lunch', notes: 'x' }, '2468')).status, 400);
    assert.equal((await post({ date: weekdayA, meal: 'brunch', notes: 'x' }, '2468')).status, 400);
    assert.equal((await post({ date: weekdayA, meal: 'lunch', main: ['nope'] }, '2468')).status, 400);
    assert.equal((await post({ date: weekdayA, meal: 'lunch' }, '2468')).status, 400);
  });
  await check('POST /meal on a repeat day adds a normal row that overrides it, and purges the cache', async () => {
    await get(`/day?date=${weekdayA}`); // cached
    const res = await post({ date: weekdayA, meal: 'lunch', sides: [D.salad], notes: 'Extra salad' }, '2468');
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out));
    assert.equal(out.action, 'overrode_repeat');
    const { res: r2, body } = await get(`/day?date=${weekdayA}`);
    assert.equal(r2.headers.get('x-cache'), 'MISS');
    assert.deepEqual(names(body.meals.lunch), ['Chana Wrap', 'Green Salad'], 'main copied from the repeat, sides changed');
    assert.equal(body.meals.lunch.notes, 'Extra salad');
    assert.equal(body.meals.lunch.repeat, null);
    const { body: other } = await get(`/day?date=${nextWhere(addDays(weekdayC, 1), isWeekday)}`);
    assert.deepEqual(names(other.meals.lunch), ['Chana Wrap', 'Curd Cup with Chia'], 'other weekdays keep the repeat');
  });
  await check('POST /meal on a normal row updates it', async () => {
    const res = await post({ date: weekdayB, meal: 'lunch', main: [D.poha] }, '2468');
    const out = await res.json();
    assert.equal(out.action, 'updated');
    const { body } = await get(`/day?date=${weekdayB}`);
    assert.deepEqual(names(body.meals.lunch), ['Poha', 'Multigrain Roti']);
  });
  await check('Snack Box Fillers come with /data (hidden ones left out, defaults first)', async () => {
    const { body } = await get('/data');
    assert.deepEqual(body.snackFillers.map((f) => f.name), ['Peanuts', 'Roasted chana', 'Walnuts']);
    assert.equal(body.snackFillers[0].default, true);
    assert.equal(body.snackFillers[2].default, false);
    assert.equal(body.snackFillers[1].nutrition.calories, 110);
    assert.equal(body.snackFillers[1].portion, '30 g');
  });
  await check('A dish with an image inside its Notion page uses it as the photo', async () => {
    const { body: paneer } = await get(`/dish/${D.paneer}`);
    assert.ok(paneer.photo?.src, 'has a photo');
    const res = await fetch(paneer.photo.src, { headers: { Origin: ORIGIN } });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(res.headers.get('content-type'), 'image/png');
  });
  await check('The Photo link column is used when the page has no picture: an image, or a web page\'s og:image', async () => {
    for (const [key, file] of [['juice', 'juice.png'], ['dal', 'recipes/dal-fry']]) {
      const { body } = await get(`/dish/${D[key]}`);
      assert.ok(body.photo?.src, `${key} has a photo`);
      assert.ok(body.photo.url.endsWith(file), body.photo.url);
      assert.equal(body.photo.credit, null);
      const res = await fetch(body.photo.src, { headers: { Origin: ORIGIN } });
      assert.equal(res.status, 200, await res.clone().text());
      assert.equal(res.headers.get('content-type'), 'image/png');
    }
    assert.ok(mock.calls.some((c) => c.startsWith('GET /files/dal-photo.png')), 'fetched the og:image');
  });
  await check('/whatsapp/preview shows each meal of a day in the template format', async () => {
    const { body } = await get(`/whatsapp/preview?date=${tomorrow}`);
    assert.equal(body.date, tomorrow);
    assert.equal(body.ready, false);
    const breakfast = body.messages.find((m) => m.meal === 'breakfast');
    assert.deepEqual(breakfast.params, ['Breakfast', '🍽️ Poha', '🍽️ Mosambi Juice', '—']);
    assert.equal(breakfast.text, "Today's Meal\nBreakfast\n\nMain: 🍽️ Poha\nSides: 🍽️ Mosambi Juice\nInstructions: —\n\nTap below for the full recipe.");
    const dinner = body.messages.find((m) => m.meal === 'dinner');
    assert.deepEqual(dinner.params.slice(1, 3), ['🍽️ Dal Fry (Toor)', '🍽️ Plain Rice • 🍽️ Multigrain Roti']);
  });
  await check('WhatsApp recipients and sending need the PIN, and say when WhatsApp isn\'t set up', async () => {
    assert.equal((await get('/whatsapp/recipients')).res.status, 401);
    const { body } = await get('/whatsapp/recipients', { 'X-App-Pin': '2468' });
    assert.deepEqual(body.to, []);
    assert.equal(body.ready, false);
    assert.ok(body.missing.includes('WA_TOKEN'));
    const res = await fetch(`${W}/whatsapp/send`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-App-Pin': '2468' }, body: JSON.stringify({ date: tomorrow, meal: 'breakfast' }) });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'whatsapp_not_configured');
  });
} finally {
  main.child.kill();
}

// ---------- WhatsApp instance ----------
const PORT2 = 8791;
const W2 = `http://127.0.0.1:${PORT2}`;
const wa = startWorker(PORT2, {
  ...baseVars, WA_TOKEN: 'wa-token', WA_PHONE_ID: '123456', WA_TO: '+91 98765 43210', WA_TEMPLATE: 'todays_meal', WA_LANG: 'en',
  WA_API_BASE: `http://127.0.0.1:${notionPort}`,
});
try {
  await waitUp(W2);
  const send = (body, pin = '2468') => fetch(`${W2}/whatsapp/send`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(pin && { 'X-App-Pin': pin }) }, body: JSON.stringify(body),
  });
  const JPEG = `data:image/jpeg;base64,${Buffer.from('fake-jpeg-bytes').toString('base64')}`;
  await check('The app can see who the WhatsApp button sends to (with the PIN)', async () => {
    const out = await (await fetch(`${W2}/whatsapp/recipients`, { headers: { 'X-App-Pin': '2468' } })).json();
    assert.deepEqual(out.to, ['+91 98765 43210']);
    assert.equal(out.ready, true);
  });
  await check('Sending a meal without the PIN is 401 and sends nothing', async () => {
    const res = await send({ date: tomorrow, meal: 'breakfast', image: JPEG }, null);
    assert.equal(res.status, 401);
    assert.equal(mock.sent.length, 0);
    assert.equal(mock.uploads.length, 0);
  });
  await check('Sending a meal uploads the collage and fills the template header, body and button', async () => {
    const res = await send({ date: tomorrow, meal: 'breakfast', image: JPEG });
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out));
    assert.deepEqual(out.sent, ['+91 98765 43210']);
    assert.equal(mock.uploads.length, 1);
    assert.equal(mock.uploads[0].auth, 'Bearer wa-token');
    assert.match(mock.uploads[0].type, /multipart\/form-data/);
    assert.ok(mock.uploads[0].hasJpeg);
    const msg = mock.sent.at(-1).body;
    assert.equal(msg.to, '919876543210');
    assert.equal(msg.template.name, 'todays_meal');
    assert.equal(msg.template.language.code, 'en');
    const [header, body, button] = msg.template.components;
    assert.deepEqual(header, { type: 'header', parameters: [{ type: 'image', image: { id: 'media-123' } }] });
    assert.deepEqual(body.parameters.map((p) => p.text), ['Breakfast', '🍽️ Poha', '🍽️ Mosambi Juice', '—']);
    assert.deepEqual(button, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: `${tomorrow}-breakfast` }] });
  });
  await check('Without a collage the header uses the Meal Master card; notes become Instructions', async () => {
    const before = mock.uploads.length;
    const res = await send({ date: weekdayB, meal: 'lunch' });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(mock.uploads.length, before);
    const msg = mock.sent.at(-1).body;
    assert.equal(msg.template.components[0].parameters[0].image.link, 'https://bhattvishal.github.io/meal-master/icons/meal-card.png');
  });
  await check('Sending a meal that isn\'t planned, or a bad image, is a clear error', async () => {
    const none = await send({ date: weekend, meal: 'lunch' });
    assert.equal(none.status, 404);
    assert.equal((await none.json()).error, 'no_meal');
    const bad = await send({ date: tomorrow, meal: 'breakfast', image: 'data:image/png;base64,AAAA' });
    assert.equal(bad.status, 400);
  });
} finally {
  wa.child.kill();
}

// ---------- cold start with a small request budget ----------
const PORT3 = 8792;
const W3 = `http://127.0.0.1:${PORT3}`;
const small = startWorker(PORT3, { ...baseVars, MAX_SUBREQUESTS: '8' });
try {
  await waitUp(W3);
  await check('A cold /data fills recipes over a few calls instead of failing', async () => {
    const first = await (await fetch(`${W3}/data`)).json();
    assert.equal(first.incomplete, true);
    assert.ok(Object.values(first.dishes).some((d) => d.pending), 'some recipes still pending');
    let body = first;
    for (let i = 0; i < 6 && body.incomplete; i++) {
      await sleep(3500);
      body = await (await fetch(`${W3}/data`)).json();
    }
    assert.equal(body.incomplete, undefined, 'complete after a few calls');
    assert.equal(body.dishes[D.wrap].sections.length, 2);
  });
} finally {
  small.child.kill();
  mock.close();
}

for (const dir of stateDirs) rmSync(dir, { recursive: true, force: true });
console.log(`Dates: today ${today}, weekdayA ${weekdayA}, weekdayB ${weekdayB}, weekdayC ${weekdayC}, weekend ${weekend}`);
console.log(results.join('\n'));
console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
