// Meal Master: a small hash-routed app over data/meals.json (written by scripts/sync-notion.mjs).
//   #/                      home: animated overview of today
//   #/day[/YYYY-MM-DD]      breakfast, lunch and dinner for a day
//   #/meal/YYYY-MM-DD/slot  one meal with its dishes and recipes
//   #/week[/YYYY-MM-DD]     the week (Mon-Sun) containing that date
//   #/shop[/YYYY-MM-DD/N]   grocery list for N days from that date

import { getPeople, setPeople, factorFor, scaleLine, buildGroceries } from './kitchen.js';

const SLOTS = ['breakfast', 'lunch', 'dinner'];
const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const SLOT_TIME = { breakfast: '08:00', lunch: '13:00', dinner: '20:00', snack: '16:00' };
const SLOT_EMOJI = { breakfast: '🥣', lunch: '🍱', dinner: '🍛', snack: '🥜' };
const MACROS = [
  { key: 'protein', label: 'Protein', unit: 'g', kcal: 4 },
  { key: 'carbs', label: 'Carbs', unit: 'g', kcal: 4 },
  { key: 'fat', label: 'Fat', unit: 'g', kcal: 9 },
  { key: 'fibre', label: 'Fibre', unit: 'g', kcal: 0 },
];

const app = document.getElementById('app');
let data = null;
let wakeLock = null;

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');
const fmt = (s, opts) => parse(s).toLocaleDateString(undefined, opts);
const weekStart = (s) => { const d = parse(s); return addDays(s, -((d.getDay() + 6) % 7)); };
const round = (n) => (n == null ? null : Math.round(n * 10) / 10);

function relDay(s) {
  const diff = Math.round((parse(s) - parse(today())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return fmt(s, { weekday: 'long' });
}

function mealsOn(date) {
  return data.meals.filter((m) => m.date === date);
}
function mealFor(date, slot) {
  return data.meals.find((m) => m.date === date && m.meal === slot) ?? null;
}
function dishesOf(meal) {
  if (!meal) return [];
  const main = meal.main.map((id) => data.dishes[id]).filter(Boolean).map((d) => ({ ...d, role: 'main' }));
  const sides = meal.sides.map((id) => data.dishes[id]).filter(Boolean).map((d) => ({ ...d, role: 'side' }));
  return [...main, ...sides];
}
function mainDish(meal) {
  return dishesOf(meal)[0] ?? null;
}

// Adds up nutrition; a macro is null only if no dish has a value for it.
function sum(dishes) {
  const out = {};
  for (const k of ['protein', 'carbs', 'fat', 'fibre', 'calories']) {
    const vals = dishes.map((d) => d.nutrition?.[k]).filter((v) => typeof v === 'number');
    out[k] = vals.length ? round(vals.reduce((a, b) => a + b, 0)) : null;
  }
  return out;
}
const show = (v, unit = '') => (v == null ? '—' : `${v}${unit}`);
const REPEAT_LABEL = { daily: 'Every day', weekdays: 'Every weekday', weekends: 'Every weekend', weekly: 'Every week' };
function badges(meal) {
  return [
    meal.repeat ? `<span class="chip small">🔁 ${REPEAT_LABEL[meal.repeat] ?? 'Repeats'}</span>` : '',
    meal.draft ? '<span class="chip small draft">✏️ Claude draft</span>' : '',
  ].join('');
}
const peopleControl = (people) => `
  <div class="people" role="group" aria-label="Number of people">
    <button class="icon-btn small" data-people="-1" aria-label="Fewer people">−</button>
    <span><b>${people}</b> ${people === 1 ? 'person' : 'people'}</span>
    <button class="icon-btn small" data-people="1" aria-label="More people">+</button>
  </div>`;

function mealTime(meal, slot) {
  return meal?.time || SLOT_TIME[slot];
}

// The next meal from now, looking up to two weeks ahead.
function upNext() {
  const now = new Date();
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const sorted = [...data.meals].sort((a, b) => (a.date + mealTime(a, a.meal)).localeCompare(b.date + mealTime(b, b.meal)));
  return sorted.find((m) => m.date > today() || (m.date === today() && mealTime(m, m.meal) >= subtractHour(hhmm))) ?? null;
}
function subtractHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${pad(Math.max(0, h - 1))}:${pad(m)}`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ---------- building blocks ----------

function photo(dish, slot, { credit = false, eager = false } = {}) {
  if (dish?.photo?.src) {
    const c = credit && dish.photo.credit
      ? `<a class="credit" href="${esc(dish.photo.sourceUrl)}" target="_blank" rel="noopener">📷 ${esc(dish.photo.credit)}${dish.photo.license ? ` · ${esc(dish.photo.license)}` : ''}</a>`
      : '';
    return `<div class="photo"><img src="${esc(dish.photo.src)}" alt="${esc(dish.name)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">${c}</div>`;
  }
  const emoji = dish?.emoji || SLOT_EMOJI[slot] || '🍽️';
  return `<div class="photo placeholder" role="img" aria-label="${esc(dish?.name ?? 'No dish')}"><span class="emoji">${emoji}</span></div>`;
}

function macroBars(n) {
  const max = Math.max(1, ...MACROS.map((m) => n[m.key] ?? 0));
  return `<div class="macros">${MACROS.map((m, i) => `
    <div class="macro">
      <span class="label">${m.label}</span>
      <span class="bar"><i style="--c:var(--${m.key});--w:${((n[m.key] ?? 0) / max) * 100}%;--i:${i}"></i></span>
      <span class="val">${show(n[m.key], m.unit)}</span>
    </div>`).join('')}</div>`;
}

function statTiles(n) {
  const tiles = [
    { k: 'calories', label: 'Calories', unit: ' kcal', c: 'var(--ink-3)' },
    ...MACROS.map((m) => ({ k: m.key, label: m.label, unit: ' g', c: `var(--${m.key})` })),
  ];
  return `<div class="totals">${tiles.map((t, i) => `
    <div class="stat rise" style="--c:${t.c};--i:${i}"><b>${show(n[t.k])}${n[t.k] == null ? '' : `<small style="font-size:14px">${t.unit}</small>`}</b><span>${t.label}</span></div>`).join('')}</div>`;
}

const chevron = (dir) => `<svg viewBox="0 0 24 24"><path d="${dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;

function footer() {
  const when = new Date(data.generatedAt);
  const src = data.source === 'notion' ? 'Notion' : 'a saved snapshot';
  const link = data.notionScheduleUrl ? ` · <a href="${esc(data.notionScheduleUrl)}" target="_blank" rel="noopener">Edit in Notion</a>` : '';
  return `<p class="footer-note">Synced from ${src} ${when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}${link}</p>`;
}

// ---------- pages ----------

function homePage() {
  const date = today();
  const todays = SLOTS.map((slot) => ({ slot, meal: mealFor(date, slot) }));
  const dishes = todays.flatMap((t) => dishesOf(t.meal));
  const totals = sum(mealsOn(date).flatMap(dishesOf));
  const next = upNext();
  const planned = todays.filter((t) => t.meal);

  // Ring: one arc per meal slot, coloured when that meal is planned.
  const C = 2 * Math.PI * 46;
  const arc = C / 3 - 8;
  const segs = todays.map((t, i) => {
    const cls = t.meal ? `seg meal-${t.slot}` : 'track';
    return `<circle class="${cls}" cx="50" cy="50" r="46" style="--len:${arc};--i:${i};${t.meal ? '' : `stroke-dasharray:${arc} 999;`}stroke-dashoffset:${-(i * (arc + 8) + 4)}"/>`;
  }).join('');

  const orbitEmoji = (dishes.length ? dishes.map((d) => d.emoji || '🍽️') : ['🥗', '🍳', '🫓', '🥒', '🍢', '🥜']).slice(0, 8);
  const orbit = orbitEmoji.map((e, i) => `<div class="food" style="--a:${(360 / orbitEmoji.length) * i}deg;--i:${i}"><span>${e}</span></div>`).join('');

  const centre = totals.protein != null
    ? `<div class="big" data-count="${totals.protein}">0</div><div class="unit">grams of protein today</div>`
    : `<div class="big">${planned.length}</div><div class="unit">meals planned today</div>`;

  const nextDish = next && mainDish(next);
  const lede = planned.length
    ? `${planned.length} of 3 meals planned today${totals.calories != null ? `, about ${Math.round(totals.calories)} kcal` : ''}.`
    : next
      ? `Nothing planned for today. Next up: ${SLOT_LABEL[next.meal].toLowerCase()} ${relDay(next.date).toLowerCase() === 'tomorrow' ? 'tomorrow' : `on ${relDay(next.date)}`}.`
      : 'Nothing planned yet. Add meals to your Notion schedule and they will show up here.';

  return `
    <section class="home-hero">
      <div>
        <div class="eyebrow rise" style="--i:0">${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1 class="rise" style="--i:1">${greeting()}.<br>${nextDish ? `Next up: <em>${esc(nextDish.name)}</em>` : 'Let’s eat well.'}</h1>
        <p class="lede rise" style="--i:2">${esc(lede)}</p>
        <div class="actions rise" style="--i:3">
          <a class="btn primary" href="#/day">Today’s meals</a>
          <a class="btn" href="#/week">This week</a>
        </div>
      </div>
      <div class="plate-wrap" aria-hidden="true">
        <div class="plate"></div>
        <svg class="plate-ring" viewBox="0 0 100 100">${segs}</svg>
        <div class="plate-center">${centre}</div>
        <div class="orbit">${orbit}</div>
      </div>
    </section>

    <div class="section-title"><h2>${planned.length ? 'Today' : next ? `Coming up · ${esc(relDay(next.date))}` : 'Today'}</h2><a class="muted" href="#/day/${planned.length || !next ? date : next.date}">See all →</a></div>
    <div class="timeline">
      ${SLOTS.map((slot, i) => {
        const d = planned.length || !next ? date : next.date;
        const meal = mealFor(d, slot);
        const dish = mainDish(meal);
        const isNext = next && meal && meal.id === next.id;
        return `<a class="tl-card meal-${slot} rise${meal ? '' : ' empty'}${isNext ? ' next' : ''}" style="--i:${i + 4}" href="${meal ? `#/meal/${d}/${slot}` : `#/day/${d}`}">
          ${photo(dish, slot)}
          <div><span class="pill"><span class="dot"></span>${SLOT_LABEL[slot]} · ${mealTime(meal, slot)}</span>
          <div class="name" style="margin-top:8px">${dish ? esc(dish.name) : '<span class="muted">Not planned</span>'}</div></div>
        </a>`;
      }).join('')}
    </div>
    ${footer()}`;
}

function dayPage(date) {
  const dishes = mealsOn(date).flatMap(dishesOf);
  const extra = mealsOn(date).filter((m) => !SLOTS.includes(m.meal));
  const card = (slot, meal, i) => {
    const all = dishesOf(meal);
    const dish = all[0];
    if (!meal || !dish) {
      return `<div class="meal-card empty meal-${slot} rise" style="--i:${i + 2}">
        ${photo(null, slot)}
        <div class="body"><span class="with">${SLOT_LABEL[slot]}</span><h3 class="muted">Nothing planned</h3>
        ${data.notionScheduleUrl ? `<a class="cta" href="${esc(data.notionScheduleUrl)}" target="_blank" rel="noopener">Plan it in Notion <span>→</span></a>` : ''}</div>
      </div>`;
    }
    const n = sum(all);
    const sides = all.slice(1);
    return `<a class="meal-card meal-${slot} rise" style="--i:${i + 2}" href="#/meal/${date}/${slot}">
      <div class="photo-frame" style="position:relative">${photo(dish, slot)}
        <span class="pill" style="position:absolute;left:14px;top:14px"><span class="dot"></span>${SLOT_LABEL[slot]}</span>
        <span class="pill" style="position:absolute;right:14px;top:14px">🕒 ${mealTime(meal, slot)}</span>
      </div>
      <div class="body">
        <h3>${esc(dish.name)}</h3>
        ${meal.repeat || meal.draft ? `<div class="sides">${badges(meal)}</div>` : ''}
        ${sides.length ? `<div class="sides"><span class="with">with</span>${sides.map((s) => `<span class="chip">${s.emoji ?? ''} ${esc(s.name)}</span>`).join('')}</div>` : ''}
        ${macroBars(n)}
        <div class="cta"><span>${show(n.calories, ' kcal')}</span><span>View recipe →</span></div>
      </div>
    </a>`;
  };

  return `
    <header class="page-head rise">
      <div class="titles"><div class="eyebrow">${esc(relDay(date))}</div><h1>${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h1></div>
      <div class="nav">
        <a class="icon-btn" href="#/day/${addDays(date, -1)}" aria-label="Previous day">${chevron('left')}</a>
        <a class="icon-btn" href="#/day/${addDays(date, 1)}" aria-label="Next day">${chevron('right')}</a>
      </div>
    </header>
    ${statTiles(sum(dishes))}
    <div class="meals">${SLOTS.map((slot, i) => card(slot, mealFor(date, slot), i)).join('')}</div>
    ${extra.length ? `<div class="section-title"><h2>Also planned</h2></div><div class="timeline">${extra.map((m, i) => {
      const d = mainDish(m);
      return `<a class="tl-card meal-${m.meal} rise" style="--i:${i + 5}" href="#/meal/${date}/${m.meal}">${photo(d, m.meal)}<div><span class="pill"><span class="dot"></span>${SLOT_LABEL[m.meal] ?? m.meal}</span><div class="name" style="margin-top:8px">${esc(d?.name ?? m.name)}</div></div></a>`;
    }).join('')}</div>` : ''}
    ${date !== today() ? `<p style="text-align:center;margin-top:28px"><a class="btn" href="#/day">Jump to today</a></p>` : ''}
    ${footer()}`;
}

function mealPage(date, slot, selectedId) {
  const meal = mealFor(date, slot);
  const dishes = dishesOf(meal);
  if (!meal || !dishes.length) {
    return `<div class="error"><h1>No ${esc(SLOT_LABEL[slot]?.toLowerCase() ?? 'meal')} planned</h1><p class="muted">${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p><a class="btn primary" href="#/day/${date}">Back to the day</a></div>`;
  }
  const main = dishes[0];
  const dish = dishes.find((d) => d.id === selectedId) ?? main;
  const n = sum(dishes);

  // Calorie split by macro for the donut.
  const kcal = MACROS.filter((m) => m.kcal).map((m) => ({ ...m, v: (n[m.key] ?? 0) * m.kcal }));
  const kTotal = kcal.reduce((a, b) => a + b.v, 0) || 1;
  const C = 2 * Math.PI * 40;
  let off = 0;
  const donut = kcal.map((m, i) => {
    const len = (m.v / kTotal) * C;
    const s = `<circle class="seg" cx="50" cy="50" r="40" style="--c:var(--${m.key});--len:${len};--i:${i};stroke-dashoffset:${-off}"/>`;
    off += len;
    return s;
  }).join('');

  const sections = dish.sections ?? [];
  const lists = sections.filter((s) => s.kind !== 'steps');
  const steps = sections.filter((s) => s.kind === 'steps');
  const checked = loadChecks(meal.id, dish.id);
  const people = getPeople();
  const factor = factorFor(dish, people);
  let idx = 0;
  const listHtml = lists.map((s) => `
    <div><h3>${esc(s.title || 'Ingredients')}</h3>
    ${s.kind === 'text' ? s.items.map((t) => `<p>${esc(t)}</p>`).join('') : `<ul class="ingredients">${s.items.map((it) => {
      const k = idx++;
      return `<li><label><input type="checkbox" data-check="${k}" ${checked.includes(k) ? 'checked' : ''}><span>${esc(scaleLine(it, factor))}</span></label></li>`;
    }).join('')}</ul>`}</div>`).join('');
  const stepHtml = steps.map((s) => `<div><h3>${esc(s.title || 'Method')}</h3><ol class="steps">${s.items.map((it) => `<li><span>${esc(it)}</span></li>`).join('')}</ol></div>`).join('');

  return `
    <section class="hero meal-${slot}">
      ${photo(main, slot, { credit: true, eager: true })}
      <div class="top">
        <a class="icon-btn" href="#/day/${date}" aria-label="Back to ${esc(fmt(date, { weekday: 'long' }))}">${chevron('left')}</a>
        <span class="pill meal-${slot}"><span class="dot"></span>${SLOT_LABEL[slot]} · ${mealTime(meal, slot)}</span>
      </div>
      <div class="caption">
        <div class="eyebrow" style="color:rgba(255,255,255,.8)">${esc(relDay(date))} · ${fmt(date, { day: 'numeric', month: 'long' })}</div>
        <h1>${esc(main.name)}</h1>
        ${dishes.length > 1 ? `<div class="sub">with ${dishes.slice(1).map((d) => esc(d.name)).join(' & ')}</div>` : ''}
      </div>
    </section>

    <div class="detail meal-${slot}">
      <aside style="display:grid;gap:16px">
        <div class="panel rise" style="--i:1">
          <h2>This meal</h2>
          <div class="donut-wrap">
            <div class="donut"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke="var(--surface-2)"/>${donut}</svg>
              <div class="center"><b>${show(n.calories == null ? null : Math.round(n.calories))}</b><span>kcal</span></div></div>
            <div class="legend">${MACROS.map((m) => `<div><i style="--c:var(--${m.key})"></i>${m.label}<b>${show(n[m.key], ' g')}</b></div>`).join('')}</div>
          </div>
          <p class="muted" style="font-size:13px;margin:14px 0 0">Per person${dishes.some((d) => d.nutritionSource === 'Estimated') ? '. Some values are estimates' : ''}.</p>
        </div>
        ${meal.repeat || meal.draft || meal.combo ? `<div class="meta rise" style="--i:2">${meal.combo ? `<span class="chip small">🍱 ${esc(meal.combo)}</span>` : ''}${badges(meal)}</div>` : ''}
        ${meal.notes ? `<div class="note rise" style="--i:2">📝 ${esc(meal.notes)}</div>` : ''}
        ${'wakeLock' in navigator ? `<div class="panel rise toggle" style="--i:3"><span>🍳 Keep screen on while cooking</span><button class="switch" role="switch" aria-checked="${wakeLock ? 'true' : 'false'}" data-wake aria-label="Keep screen on"></button></div>` : ''}
      </aside>

      <div style="display:grid;gap:18px;min-width:0">
        ${dishes.length > 1 ? `<div class="dish-tabs" role="tablist">${dishes.map((d) => `
          <button class="dish-tab" role="tab" aria-selected="${d.id === dish.id}" data-dish="${d.id}">
            ${photo(d, slot)}<span><small>${d.role === 'main' ? 'Main' : 'Side'}</small>${esc(d.name)}</span>
          </button>`).join('')}</div>` : ''}

        <article class="panel dish rise" style="--i:2" data-meal="${meal.id}" data-dishid="${dish.id}">
          <div class="dish-head">
            ${photo(dish, slot, { credit: dish.id !== main.id })}
            <div>
              <h2>${esc(dish.name)}</h2>
              <div class="meta">
                ${dish.prepTime ? `<span class="chip">⏱ ${dish.prepTime} min</span>` : ''}
                ${dish.serving ? `<span class="chip">🍽 ${esc(dish.serving)}</span>` : ''}
                ${dish.nutrition?.protein != null ? `<span class="chip">💪 ${dish.nutrition.protein} g protein</span>` : ''}
                ${dish.nutrition?.calories != null ? `<span class="chip">🔥 ${dish.nutrition.calories} kcal</span>` : ''}
                ${(dish.tags ?? []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
              </div>
              ${dish.intro ? `<p class="muted" style="margin:12px 0 0">${esc(dish.intro)}</p>` : ''}
            </div>
          </div>
          <div class="scale-row">${peopleControl(people)}<span class="muted">${dish.serves ? (factor === 1 ? 'Amounts as written' : `Amounts scaled from ${dish.serves} to ${people}`) : 'Amounts as written (no serving count in Notion)'}</span></div>
          ${sections.length ? `<div class="recipe ${lists.length && steps.length ? 'two' : ''}">${listHtml ? `<div class="recipe-col">${listHtml}</div>` : ''}${stepHtml ? `<div class="recipe-col">${stepHtml}</div>` : ''}</div>` : '<p class="muted">No recipe written yet.</p>'}
          ${dish.notionUrl ? `<p style="margin:0"><a class="muted" style="text-decoration:underline" href="${esc(dish.notionUrl)}" target="_blank" rel="noopener">Open in Notion</a></p>` : ''}
        </article>
      </div>
    </div>
    ${footer()}`;
}

function weekPage(date) {
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = days[6];
  const weekDishes = days.flatMap((d) => mealsOn(d).flatMap(dishesOf));
  const planned = days.reduce((a, d) => a + SLOTS.filter((s) => mealFor(d, s)).length, 0);
  const t = sum(weekDishes);
  const range = `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short' })}`;

  return `
    <header class="page-head rise">
      <div class="titles"><div class="eyebrow">${start <= today() && today() <= end ? 'This week' : 'Week of'}</div><h1>${range}</h1></div>
      <div class="nav">
        <a class="icon-btn" href="#/week/${addDays(start, -7)}" aria-label="Previous week">${chevron('left')}</a>
        <a class="icon-btn" href="#/week/${addDays(start, 7)}" aria-label="Next week">${chevron('right')}</a>
      </div>
    </header>
    <div class="totals">
      <div class="stat rise" style="--i:0;--c:var(--accent)"><b>${planned}<small style="font-size:14px"> / 21</small></b><span>Meals planned</span></div>
      <div class="stat rise" style="--i:1;--c:var(--protein)"><b>${show(t.protein)}<small style="font-size:14px">${t.protein == null ? '' : ' g'}</small></b><span>Protein this week</span></div>
      <div class="stat rise" style="--i:2;--c:var(--ink-3)"><b>${show(t.calories == null ? null : Math.round(t.calories))}<small style="font-size:14px">${t.calories == null ? '' : ' kcal'}</small></b><span>Calories this week</span></div>
    </div>
    <div class="week">
      ${days.map((d, i) => {
        const dayProtein = sum(mealsOn(d).flatMap(dishesOf)).protein;
        return `<div class="day-row rise${d === today() ? ' today' : ''}" style="--i:${i + 3}">
          <a class="day-label" href="#/day/${d}"><span class="dow">${fmt(d, { weekday: 'short' })} ${fmt(d, { day: 'numeric' })}</span><span class="date">${dayProtein != null ? `${dayProtein} g protein` : d === today() ? 'Today' : ''}</span></a>
          <div class="slots">${SLOTS.map((slot) => {
            const meal = mealFor(d, slot);
            const dish = mainDish(meal);
            if (!dish) return `<a class="slot empty meal-${slot}" href="#/day/${d}" aria-label="${SLOT_LABEL[slot]}, not planned">${SLOT_LABEL[slot]}</a>`;
            return `<a class="slot meal-${slot}" href="#/meal/${d}/${slot}">${photo(dish, slot)}<span class="label"><small>${SLOT_LABEL[slot]}</small>${esc(dish.name)}</span></a>`;
          }).join('')}</div>
        </div>`;
      }).join('')}
    </div>
    ${footer()}`;
}

function shopPage(from, days) {
  const to = addDays(from, days - 1);
  const meals = data.meals.filter((m) => m.date >= from && m.date <= to);
  const people = getPeople();
  const groups = buildGroceries(meals, data.dishes, people);
  const listKey = `shop:${from}:${days}`;
  const ticked = new Set(loadList(listKey));
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const done = groups.reduce((a, g) => a + g.items.filter((i) => ticked.has(i.key)).length, 0);
  const mon = weekStart(today());
  const ranges = [
    ['Next 3 days', today(), 3],
    ['Next 7 days', today(), 7],
    ['This week', mon, 7],
    ['Next week', addDays(mon, 7), 7],
  ];
  const range = `${fmt(from, { weekday: 'short', day: 'numeric', month: 'short' })} – ${fmt(to, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  return `
    <header class="page-head rise">
      <div class="titles"><div class="eyebrow">Grocery list</div><h1>${range}</h1></div>
      <div class="nav">
        <a class="icon-btn" href="#/shop/${addDays(from, -days)}/${days}" aria-label="Earlier">${chevron('left')}</a>
        <a class="icon-btn" href="#/shop/${addDays(from, days)}/${days}" aria-label="Later">${chevron('right')}</a>
      </div>
    </header>
    <div class="shop-bar rise" style="--i:1">
      <div class="range-chips">${ranges.map(([label, f, n]) => `<a class="chip${f === from && n === days ? ' active' : ''}" href="#/shop/${f}/${n}">${label}</a>`).join('')}</div>
      ${peopleControl(people)}
    </div>
    <div class="shop-summary rise" style="--i:2">
      <span><b>${meals.length}</b> meals · <b>${total}</b> items${total ? ` · <b data-done>${done}</b> in the basket` : ''}</span>
      <span class="actions">
        ${total ? '<button class="btn" data-share>Share list</button><button class="btn" data-clear>Clear ticks</button>' : ''}
      </span>
    </div>
    ${total ? `<div class="shop-grid" data-list="${listKey}">${groups.map((g, gi) => `
      <section class="panel shop-group rise" style="--i:${gi + 3}">
        <h2>${esc(g.category)}</h2>
        <ul class="ingredients">${g.items.map((it) => `
          <li><label><input type="checkbox" data-shop="${esc(it.key)}" ${ticked.has(it.key) ? 'checked' : ''}>
            <span class="shop-item"><span class="shop-name">${esc(cap(it.name))}</span>${it.amount ? `<b class="shop-amt">${esc(it.amount)}</b>` : ''}
            <small class="muted">${esc(it.dishes.join(', '))}</small></span></label></li>`).join('')}
        </ul>
      </section>`).join('')}</div>`
      : '<div class="panel" style="text-align:center"><p class="muted">No meals planned in these days.</p></div>'}
    <p class="footer-note">Amounts are for ${people} ${people === 1 ? 'person' : 'people'}. Recipes without a serving count in Notion are listed without amounts.</p>
    ${footer()}`;
}

function shopText() {
  const lines = [...app.querySelectorAll('.shop-group')].map((g) => {
    const items = [...g.querySelectorAll('li')]
      .filter((li) => !li.querySelector('input').checked)
      .map((li) => `• ${li.querySelector('.shop-name').textContent}${li.querySelector('.shop-amt') ? ` — ${li.querySelector('.shop-amt').textContent}` : ''}`);
    return items.length ? `${g.querySelector('h2').textContent}\n${items.join('\n')}` : '';
  }).filter(Boolean);
  return `${app.querySelector('h1').textContent}\n\n${lines.join('\n\n')}`;
}

function loadList(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}
function saveList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

// ---------- ingredient checkboxes (per viewer, remembered on this device) ----------

function loadChecks(mealId, dishId) {
  try { return JSON.parse(localStorage.getItem(`checks:${mealId}:${dishId}`) ?? '[]'); } catch { return []; }
}
function saveChecks(mealId, dishId, list) {
  try { localStorage.setItem(`checks:${mealId}:${dishId}`, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

// ---------- router ----------

function route() {
  const [page, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  switch (page) {
    case 'day': return { tab: 'day', render: () => dayPage(isDate(a) ? a : today()), swipe: (dir) => `#/day/${addDays(isDate(a) ? a : today(), dir)}` };
    case 'week': return { tab: 'week', render: () => weekPage(isDate(a) ? a : today()), swipe: (dir) => `#/week/${addDays(weekStart(isDate(a) ? a : today()), dir * 7)}` };
    case 'shop': {
      const from = isDate(a) ? a : today();
      const days = Math.min(14, Math.max(1, Number(b) || 7));
      return { tab: 'shop', render: () => shopPage(from, days), swipe: (dir) => `#/shop/${addDays(from, dir * days)}/${days}` };
    }
    case 'meal': return { tab: 'day', render: () => mealPage(isDate(a) ? a : today(), b || 'dinner') };
    default: return { tab: 'home', render: homePage };
  }
}

let current = null;
function render() {
  current = route();
  const paint = () => {
    app.innerHTML = current.render();
    document.querySelectorAll('.tabbar a').forEach((l) => {
      if (l.dataset.tab === current.tab) l.setAttribute('aria-current', 'page');
      else l.removeAttribute('aria-current');
    });
    countUp();
  };
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(paint);
  else paint();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function countUp() {
  app.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target; return; }
    const t0 = performance.now() + 500;
    const step = (t) => {
      const p = Math.min(1, Math.max(0, (t - t0) / 1400));
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---------- interactions ----------

app.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-dish]');
  if (tab) {
    const [, date, slot] = location.hash.replace(/^#\/?/, '').split('/').slice(0, 3);
    const y = window.scrollY;
    app.innerHTML = mealPage(date, slot, tab.dataset.dish);
    window.scrollTo({ top: y, behavior: 'instant' });
    return;
  }
  const people = e.target.closest('[data-people]');
  if (people) {
    setPeople(getPeople() + Number(people.dataset.people));
    const y = window.scrollY;
    const selected = app.querySelector('[data-dishid]')?.dataset.dishid;
    const [page, date, slot] = location.hash.replace(/^#\/?/, '').split('/');
    app.innerHTML = page === 'meal' ? mealPage(date, slot, selected) : current.render();
    window.scrollTo({ top: y, behavior: 'instant' });
    return;
  }
  if (e.target.closest('[data-share]')) {
    const text = shopText();
    try {
      if (navigator.share) await navigator.share({ title: 'Grocery list', text });
      else { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied!'; }
    } catch { /* share cancelled */ }
    return;
  }
  if (e.target.closest('[data-clear]')) {
    saveList(app.querySelector('[data-list]').dataset.list, []);
    app.innerHTML = current.render();
    return;
  }
  const wake = e.target.closest('[data-wake]');
  if (wake) {
    try {
      if (wakeLock) { await wakeLock.release(); wakeLock = null; }
      else { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    } catch { wakeLock = null; }
    wake.setAttribute('aria-checked', wakeLock ? 'true' : 'false');
  }
});

app.addEventListener('change', (e) => {
  if (e.target.matches('[data-shop]')) {
    const list = app.querySelector('[data-list]');
    const keys = [...list.querySelectorAll('[data-shop]')].filter((c) => c.checked).map((c) => c.dataset.shop);
    saveList(list.dataset.list, keys);
    const done = app.querySelector('[data-done]');
    if (done) done.textContent = keys.length;
    return;
  }
  if (!e.target.matches('[data-check]')) return;
  const article = e.target.closest('[data-dishid]');
  const list = [...article.querySelectorAll('[data-check]')].filter((c) => c.checked).map((c) => Number(c.dataset.check));
  saveChecks(article.dataset.meal, article.dataset.dishid, list);
});

// Swipe left/right (and arrow keys) to move between days or weeks.
let touch = null;
addEventListener('touchstart', (e) => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
addEventListener('touchend', (e) => {
  if (!touch || !current?.swipe || e.target.closest('.dish-tabs')) return;
  const dx = e.changedTouches[0].clientX - touch.x;
  const dy = e.changedTouches[0].clientY - touch.y;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) location.hash = current.swipe(dx < 0 ? 1 : -1);
  touch = null;
});
addEventListener('keydown', (e) => {
  if (!current?.swipe || e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowRight') location.hash = current.swipe(1);
  if (e.key === 'ArrowLeft') location.hash = current.swipe(-1);
});

// Re-render when the app comes back to the foreground on a new day.
let shownDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && shownDay !== today()) { shownDay = today(); load().then(render); }
});

// ---------- start ----------

async function load() {
  const res = await fetch('data/meals.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load meals (${res.status})`);
  data = await res.json();
}

addEventListener('hashchange', render);
load().then(render).catch((err) => {
  app.innerHTML = `<div class="error"><h1>Couldn’t load your meals</h1><p class="muted">${esc(err.message)}</p><button class="btn primary" onclick="location.reload()">Try again</button></div>`;
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
