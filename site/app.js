// Meal Master: a small hash-routed app over the meal data the Worker (worker/) reads live from Notion.
//   #/ or #/day[/YYYY-MM-DD] breakfast, lunch and dinner for a day (the app opens here)
//   #/home                   animated overview of today
//   #/meal/YYYY-MM-DD/slot   one meal with its dishes and recipes
//   #/week[/YYYY-MM-DD]      the week (Mon-Sun) containing that date
//   #/shop[/YYYY-MM-DD/N]    grocery list for N days from that date
//   #/prep[/N]               things to soak, sprout or ferment ahead for the next N days
//   #/settings               language, household size and appearance

import { getPeople, setPeople, factorFor, scaleLine, buildGroceries, applyPantry, getGoals, setGoal, goalProgress, DEFAULT_GOALS } from './kitchen.js';
import { prepTasks, SLOT_TIME } from './prep.js';
import { mealCollage } from './collage.js';
import { LANGS, getLang, setLang, locale, t, tag, unit, grocery, amount, dishText } from './i18n.js';

const SLOTS = ['breakfast', 'lunch', 'dinner'];
const SLOT_EMOJI = { breakfast: '🥣', lunch: '🍱', dinner: '🍛', snack: '🥜' };
const MACROS = [
  { key: 'protein', kcal: 4 },
  { key: 'carbs', kcal: 4 },
  { key: 'fat', kcal: 9 },
  { key: 'fibre', kcal: 0 },
];
const REPEAT_KEY = { daily: 'rDaily', weekdays: 'rWeekdays', weekends: 'rWeekends', weekly: 'rWeekly' };

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
const fmt = (s, opts) => parse(s).toLocaleDateString(locale(), opts);
const weekStart = (s) => { const d = parse(s); return addDays(s, -((d.getDay() + 6) % 7)); };
const round = (n) => (n == null ? null : Math.round(n * 10) / 10);
const slotName = (slot) => t(slot);
const name = (dish) => dishText(dish, 'name');
const peopleText = (n) => t(n === 1 ? 'person' : 'people', { n });
const kcal = () => unit('kcal');
const g = () => unit('g');

function relDay(s) {
  const diff = Math.round((parse(s) - parse(today())) / 86400000);
  if (diff === 0) return t('today');
  if (diff === 1) return t('tomorrow');
  if (diff === -1) return t('yesterday');
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
  // The Office Snack Box's nutrition is whatever was picked for this meal.
  const withPicks = (d) => (isSnackBox(d) ? { ...d, nutrition: boxNutrition(boxPick(meal.id)), nutritionSource: 'Estimated' } : d);
  const main = meal.main.map((id) => data.dishes[id]).filter(Boolean).map((d) => ({ ...withPicks(d), role: 'main' }));
  const sides = meal.sides.map((id) => data.dishes[id]).filter(Boolean).map((d) => ({ ...withPicks(d), role: 'side' }));
  return [...main, ...sides];
}

// ---------- Office Snack Box ----------
// A dish whose recipe has a "Box fillers" section is put together in the app: up to five fillers
// from the Snack Box Fillers list in Notion, plus one Grab and Go dish. Picks are saved per meal.
const BOX_MAX = 5;
const isSnackBox = (d) => Boolean(data?.snackFillers?.length) && (d?.sections ?? []).some((s) => /box fillers/i.test(s.title));
const fillerName = (f) => f.i18n?.[getLang()] || f.name;

function boxPick(mealId) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(`snackbox:${mealId}`) ?? 'null'); } catch { /* storage unavailable */ }
  const known = new Set(data.snackFillers.map((f) => f.id));
  const fillers = saved?.fillers ? saved.fillers.filter((id) => known.has(id)) : data.snackFillers.filter((f) => f.default).map((f) => f.id);
  const grab = saved?.grab && data.dishes[saved.grab] ? saved.grab : null;
  return { fillers: fillers.slice(0, BOX_MAX), grab };
}
function saveBoxPick(mealId, pick) {
  try { localStorage.setItem(`snackbox:${mealId}`, JSON.stringify(pick)); } catch { /* storage unavailable */ }
}
function boxNutrition(pick) {
  const items = [...pick.fillers.map((id) => data.snackFillers.find((f) => f.id === id)), pick.grab && data.dishes[pick.grab]].filter(Boolean);
  const out = {};
  for (const k of ['protein', 'carbs', 'fat', 'fibre', 'calories']) {
    const vals = items.map((i) => i.nutrition?.[k]).filter((v) => typeof v === 'number');
    out[k] = vals.length ? round(vals.reduce((a, b) => a + b, 0)) : null;
  }
  return out;
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
const show = (v, u = '') => (v == null ? '—' : `${v}${u}`);

function badges(meal) {
  return [
    meal.repeat ? `<span class="chip small">🔁 ${t(REPEAT_KEY[meal.repeat] ?? 'rWeekly')}</span>` : '',
    meal.draft ? `<span class="chip small draft">✏️ ${t('draft')}</span>` : '',
  ].join('');
}
const comboName = (meal) => meal.comboI18n?.[getLang()] || meal.combo;

const peopleControl = (people) => `
  <div class="people" role="group">
    <button class="icon-btn small" data-people="-1" aria-label="${t('fewer')}">−</button>
    <span><b>${people}</b></span>
    <button class="icon-btn small" data-people="1" aria-label="${t('more')}">+</button>
  </div>`;

function mealTime(meal, slot) {
  return meal?.time || SLOT_TIME[slot];
}

// The next meal from now.
function upNext() {
  const now = new Date();
  const hhmm = `${pad(Math.max(0, now.getHours() - 1))}:${pad(now.getMinutes())}`;
  const sorted = [...data.meals].sort((a, b) => (a.date + mealTime(a, a.meal)).localeCompare(b.date + mealTime(b, b.meal)));
  return sorted.find((m) => m.date > today() || (m.date === today() && mealTime(m, m.meal) >= hhmm)) ?? null;
}

function greeting() {
  const h = new Date().getHours();
  return t(h < 5 ? 'lateNight' : h < 12 ? 'goodMorning' : h < 17 ? 'goodAfternoon' : 'goodEvening');
}

// ---------- building blocks ----------

function photo(dish, slot, { credit = false, eager = false } = {}) {
  if (dish?.photo?.src) {
    const c = credit && dish.photo.credit
      ? `<a class="credit" href="${esc(dish.photo.sourceUrl)}" target="_blank" rel="noopener">📷 ${esc(dish.photo.credit)}${dish.photo.license ? ` · ${esc(dish.photo.license)}` : ''}</a>`
      : '';
    return `<div class="photo"><img src="${esc(dish.photo.src)}" alt="${esc(name(dish))}" crossorigin="anonymous" data-emoji="${esc(dish.emoji || SLOT_EMOJI[slot] || '🍽️')}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">${c}</div>`;
  }
  const emoji = dish?.emoji || SLOT_EMOJI[slot] || '🍽️';
  return `<div class="photo placeholder" role="img" aria-label="${esc(dish ? name(dish) : t('notPlanned'))}"><span class="emoji">${emoji}</span></div>`;
}

function macroBars(n) {
  const max = Math.max(1, ...MACROS.map((m) => n[m.key] ?? 0));
  return `<div class="macros">${MACROS.map((m, i) => `
    <div class="macro">
      <span class="label">${t(m.key)}</span>
      <span class="bar"><i style="--c:var(--${m.key});--w:${((n[m.key] ?? 0) / max) * 100}%;--i:${i}"></i></span>
      <span class="val">${show(n[m.key], ` ${g()}`)}</span>
    </div>`).join('')}</div>`;
}

// Day totals; with goals, each tile also shows how much of the daily goal the day covers.
function statTiles(n, withGoals = false) {
  const tiles = [
    { k: 'calories', u: kcal(), c: 'var(--ink-3)' },
    ...MACROS.map((m) => ({ k: m.key, u: g(), c: `var(--${m.key})` })),
  ];
  return `<div class="totals">${tiles.map((tl, i) => {
    const p = withGoals ? goalProgress(tl.k, n[tl.k]) : null;
    const goal = p ? `
      <span class="goal-bar"><i style="--w:${Math.min(p.pct, 100)}%"></i></span>
      <span class="goal-text"><span class="full">${esc(t('goalOf', { pct: p.pct, goal: p.goal }))}</span><span class="short">${p.pct}%</span>${p.status === 'met' ? ' ✓' : p.status === 'over' ? ' ▲' : ''}</span>` : '';
    return `
    <div class="stat rise${p?.status ? ` ${p.status}` : ''}" style="--c:${tl.c};--i:${i}"><b>${show(n[tl.k])}${n[tl.k] == null ? '' : `<small style="font-size:14px"> ${tl.u}</small>`}</b><span>${t(tl.k)}</span>${goal}</div>`;
  }).join('')}</div>`;
}

// A small ring showing a day's protein against the goal.
function proteinRing(protein) {
  const p = goalProgress('protein', protein);
  if (!p) return '';
  return `<span class="mini-ring${p.status ? ` ${p.status}` : ''}" style="--p:${Math.min(p.pct, 100)}" title="${esc(t('proteinGoalLine', { pct: p.pct, goal: p.goal }))}"><b>${p.pct}%</b></span>`;
}

// The main dish large with up to three sides stacked beside it; "+2" when there are more.
function collage(dishes, slot) {
  if (dishes.length < 2) return photo(dishes[0], slot);
  const sides = dishes.slice(1, 4);
  const more = dishes.length - 1 - sides.length;
  return `<div class="collage sides-${sides.length}">${[dishes[0], ...sides].map((d) => photo(d, slot)).join('')}${more ? `<span class="more">+${more}</span>` : ''}</div>`;
}

const shareIcon = `<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`;
// Share always includes the recipe link; the WhatsApp button sends the meal through the Worker.
const shareBtn = (date, slot, cls = 'icon-btn') => `<button class="${cls} share-meal" data-share-meal="${date}/${slot}" aria-label="${esc(t('shareRecipe'))}" title="${esc(t('shareRecipe'))}">${shareIcon}</button>`;
const waIcon = `<svg class="wa-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.47 9.47 0 0 1-4.83-1.32l-.35-.21-3.59.94.96-3.5-.23-.36a9.45 9.45 0 0 1-1.45-5.04c0-5.23 4.26-9.49 9.5-9.49 2.54 0 4.92.99 6.71 2.79a9.43 9.43 0 0 1 2.78 6.71c0 5.24-4.26 9.49-9.49 9.49m8.08-17.57A11.35 11.35 0 0 0 12.05.58C5.75.58.63 5.7.62 11.99c0 2.01.53 3.97 1.52 5.7L.53 23.6l6.05-1.59a11.4 11.4 0 0 0 5.46 1.39h.01c6.29 0 11.41-5.12 11.42-11.41 0-3.05-1.19-5.92-3.34-8.07"/></svg>`;
const waBtn = (date, slot, cls = 'icon-btn') => `<button class="${cls} wa-meal" data-wa-meal="${date}/${slot}" aria-label="${esc(t('waSend'))}" title="${esc(t('waSend'))}">${waIcon}</button>`;
const recipeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7h8M8 11h6"/></svg>`;
const chevron = (dir) => `<svg viewBox="0 0 24 24"><path d="${dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;

const syncedAt = () => new Date(data.generatedAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });

function footer() {
  const src = data.source === 'notion' ? t('notion') : t('snapshot');
  const link = data.notionScheduleUrl ? ` · <a href="${esc(data.notionScheduleUrl)}" target="_blank" rel="noopener">${t('editNotion')}</a>` : '';
  return `<p class="footer-note">${esc(t('synced', { src, when: syncedAt() }))}${link}</p>`;
}

// ---------- pages ----------

function homePage() {
  const date = today();
  const todays = SLOTS.map((slot) => ({ slot, meal: mealFor(date, slot) }));
  const dishes = todays.flatMap((x) => dishesOf(x.meal));
  const totals = sum(mealsOn(date).flatMap(dishesOf));
  const next = upNext();
  const planned = todays.filter((x) => x.meal);

  // Ring: fills towards the daily protein goal, one arc per meal in that meal's colour.
  const C = 2 * Math.PI * 46;
  const proteinGoal = getGoals().protein;
  const order = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };
  let used = 0;
  const segs = `<circle class="track" cx="50" cy="50" r="46"/>` + mealsOn(date)
    .slice()
    .sort((a, b) => (order[a.meal] ?? 9) - (order[b.meal] ?? 9))
    .map((m, i) => {
      const protein = sum(dishesOf(m)).protein ?? 0;
      const len = Math.min(C - used, (protein / proteinGoal) * C);
      if (len <= 0) return '';
      const seg = `<circle class="seg meal-${m.meal}" cx="50" cy="50" r="46" style="--len:${Math.max(0, len - 1.5)};--i:${i};stroke-dashoffset:${-used}"/>`;
      used += len;
      return seg;
    }).join('');

  const orbitEmoji = (dishes.length ? dishes.map((d) => d.emoji || '🍽️') : ['🥗', '🍳', '🫓', '🥒', '🍢', '🥜']).slice(0, 8);
  const orbit = orbitEmoji.map((e, i) => `<div class="food" style="--a:${(360 / orbitEmoji.length) * i}deg;--i:${i}"><span>${e}</span></div>`).join('');

  const centre = totals.protein != null
    ? `<div class="big" data-count="${totals.protein}">0</div><div class="unit">${t('proteinToday')}</div><div class="unit goal-line">${esc(t('proteinGoalLine', { pct: Math.round((totals.protein / proteinGoal) * 100), goal: proteinGoal }))}</div>`
    : `<div class="big">${planned.length}</div><div class="unit">${t('mealsPlannedToday')}</div>`;

  const nextDish = next && mainDish(next);
  const lede = planned.length
    ? `${t('ledePlanned', { n: planned.length })}${totals.calories != null ? t('ledeKcal', { kcal: Math.round(totals.calories) }) : ''}.`
    : next
      ? t('ledeNext', { meal: slotName(next.meal), day: relDay(next.date) })
      : t('ledeEmpty');
  const shownDate = planned.length || !next ? date : next.date;

  return `
    <section class="home-hero">
      <div>
        <div class="eyebrow rise" style="--i:0">${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1 class="rise" style="--i:1">${greeting()}.<br>${nextDish ? `${t('nextUp')}: <em>${esc(name(nextDish))}</em>` : t('letsEat')}</h1>
        <p class="lede rise" style="--i:2">${esc(lede)}</p>
        <div class="actions rise" style="--i:3">
          <a class="btn primary" href="#/day">${t('todaysMeals')}</a>
          <a class="btn" href="#/week">${t('thisWeek')}</a>
        </div>
      </div>
      <div class="plate-wrap" aria-hidden="true">
        <div class="plate"></div>
        <svg class="plate-ring" viewBox="0 0 100 100">${segs}</svg>
        <div class="plate-center">${centre}</div>
        <div class="orbit">${orbit}</div>
      </div>
    </section>

    <div class="section-title"><h2>${planned.length || !next ? t('today') : esc(t('comingUp', { day: relDay(next.date) }))}</h2><a class="muted" href="#/day/${shownDate}">${t('seeAll')}</a></div>
    <div class="timeline">
      ${SLOTS.map((slot, i) => {
        const meal = mealFor(shownDate, slot);
        const dish = mainDish(meal);
        const isNext = next && meal && meal.id === next.id;
        return `<a class="tl-card meal-${slot} rise${meal ? '' : ' empty'}${isNext ? ' next' : ''}" style="--i:${i + 4}" href="${meal ? `#/meal/${shownDate}/${slot}` : `#/day/${shownDate}`}">
          ${photo(dish, slot)}
          <div><span class="pill"><span class="dot"></span>${slotName(slot)} · ${mealTime(meal, slot)}</span>
          <div class="name" style="margin-top:8px">${dish ? esc(name(dish)) : `<span class="muted">${t('notPlanned')}</span>`}</div></div>
        </a>`;
      }).join('')}
    </div>`;
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
        <div class="body"><span class="with">${slotName(slot)}</span><h3 class="muted">${t('nothingPlanned')}</h3>
        ${data.notionScheduleUrl ? `<a class="cta" href="${esc(data.notionScheduleUrl)}" target="_blank" rel="noopener">${t('planInNotion')} <span>→</span></a>` : ''}</div>
      </div>`;
    }
    const n = sum(all);
    const sides = all.slice(1);
    return `<a class="meal-card meal-${slot} rise" style="--i:${i + 2}" href="#/meal/${date}/${slot}">
      <div class="photo-frame">${collage(all, slot)}
        <span class="pill slot-pill"><span class="dot"></span>${slotName(slot)}</span>
        <span class="pill time-pill">🕒 ${mealTime(meal, slot)}</span>
        <div class="card-actions">${shareBtn(date, slot, 'icon-btn small')}${waBtn(date, slot, 'icon-btn small')}</div>
      </div>
      <div class="body">
        <h3>${esc(name(dish))}</h3>
        ${meal.repeat || meal.draft ? `<div class="sides">${badges(meal)}</div>` : ''}
        ${sides.length ? `<div class="sides"><span class="with">${t('with')}</span>${sides.map((s) => `<span class="chip">${s.emoji ?? ''} ${esc(name(s))}</span>`).join('')}</div>` : ''}
        ${macroBars(n)}
        <div class="macro-line"><span style="--c:var(--protein)">💪 ${show(n.protein, ` ${g()}`)}</span><span style="--c:var(--carbs)">🌾 ${show(n.carbs, ` ${g()}`)}</span><span style="--c:var(--fat)">🧈 ${show(n.fat, ` ${g()}`)}</span></div>
        <div class="cta"><span>${show(n.calories, ` ${kcal()}`)}</span><span>${t('viewRecipe')}</span></div>
      </div>
    </a>`;
  };

  // Snacks and other extra meals sit as small links in the header so the page fits one screen.
  const extras = extra.map((m) => {
    const d = mainDish(m);
    return `<a class="chip extra meal-${m.meal}" href="#/meal/${date}/${m.meal}"><span class="dot"></span>${slotName(m.meal)} · ${esc(d ? name(d) : m.name)}</a>`;
  }).join('');

  // A reminder when something needs soaking or sprouting in the next day.
  const soon = date === today() ? prepList(1).filter((task) => !prepDone().has(task.id) && task.due - Date.now() < 24 * 3600000) : [];
  const prepChip = soon.length ? `<a class="chip extra prep-chip" href="#/prep">🔔 ${esc(t(soon.length === 1 ? 'prepChipOne' : 'prepChip', { n: soon.length }))}</a>` : '';

  return `
    <header class="page-head rise">
      <div class="titles"><div class="eyebrow">${esc(relDay(date))}</div><h1>${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h1></div>
      ${extras || prepChip ? `<div class="extras">${prepChip}${extras}</div>` : ''}
      <div class="nav">
        ${date !== today() ? `<a class="btn small" href="#/day">${t('jumpToday')}</a>` : ''}
        <a class="icon-btn" href="#/day/${addDays(date, -1)}" aria-label="${t('prevDay')}">${chevron('left')}</a>
        <a class="icon-btn" href="#/day/${addDays(date, 1)}" aria-label="${t('nextDay')}">${chevron('right')}</a>
      </div>
    </header>
    ${statTiles(sum(dishes), true)}
    <div class="meals">${SLOTS.map((slot, i) => card(slot, mealFor(date, slot), i)).join('')}</div>`;
}

// After a pick, updates the snack box in place (no re-render, so nothing flickers or reloads):
// the ticks, the count, the dish's protein and calories, and "This meal".
function updateSnackBox(mealId, pick) {
  const full = pick.fillers.length >= BOX_MAX;
  app.querySelectorAll('[data-filler]').forEach((box) => {
    const on = pick.fillers.includes(box.dataset.filler);
    box.checked = on;
    box.disabled = !on && full;
    box.closest('.pick').classList.toggle('on', on);
    box.closest('.pick').classList.toggle('off', !on && full);
  });
  app.querySelectorAll('[data-grab]').forEach((r) => r.closest('.pick').classList.toggle('on', (pick.grab ?? '') === r.dataset.grab));
  const count = app.querySelector('.snack-col .count');
  if (count) count.textContent = t('boxCount', { n: pick.fillers.length, max: BOX_MAX });
  const meal = data.meals.find((m) => m.id === mealId);
  const dishes = dishesOf(meal);
  const shown = dishes.find((d) => d.id === app.querySelector('[data-dishid]')?.dataset.dishid);
  const facts = app.querySelector('[data-dish-facts]');
  if (facts && shown) facts.innerHTML = dishFacts(shown);
  const panel = app.querySelector('[data-meal-nutrition]');
  if (panel) panel.innerHTML = mealNutrition(dishes);
}

// "This meal": calories as a donut split by macro, and the macro totals.
function mealNutrition(dishes) {
  const n = sum(dishes);
  const split = MACROS.filter((m) => m.kcal).map((m) => ({ ...m, v: (n[m.key] ?? 0) * m.kcal }));
  const kTotal = split.reduce((a, b) => a + b.v, 0) || 1;
  const C = 2 * Math.PI * 40;
  let off = 0;
  const donut = split.map((m, i) => {
    const len = (m.v / kTotal) * C;
    const s = `<circle class="seg" cx="50" cy="50" r="40" style="--c:var(--${m.key});--len:${len};--i:${i};stroke-dashoffset:${-off}"/>`;
    off += len;
    return s;
  }).join('');
  return `
    <h2>${t('thisMeal')}</h2>
    <div class="donut-wrap">
      <div class="donut"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke="var(--surface-2)"/>${donut}</svg>
        <div class="center"><b>${show(n.calories == null ? null : Math.round(n.calories))}</b><span>${kcal()}</span></div></div>
      <div class="legend">${MACROS.map((m) => `<div><i style="--c:var(--${m.key})"></i>${t(m.key)}<b>${show(n[m.key], ` ${g()}`)}</b></div>`).join('')}</div>
    </div>
    <p class="muted" style="font-size:13px;margin:14px 0 0">${t('perPerson')}${dishes.some((d) => d.nutritionSource === 'Estimated') ? ` · ${t('someEstimates')}` : ''}</p>`;
}

// A dish's protein and calorie chips.
const dishFacts = (dish) => `${dish.nutrition?.protein != null ? `<span class="chip">💪 ${dish.nutrition.protein} ${t('gProtein')}</span>` : ''}${dish.nutrition?.calories != null ? `<span class="chip">🔥 ${dish.nutrition.calories} ${kcal()}</span>` : ''}`;

// The Office Snack Box: fillers on the left (up to five), one Grab and Go dish on the right.
// Ticking anything updates the meal's nutrition straight away.
function snackBoxBuilder(meal, slot) {
  const pick = boxPick(meal.id);
  const full = pick.fillers.length >= BOX_MAX;
  const facts = (n) => [n?.calories != null ? `${n.calories} ${kcal()}` : '', n?.protein != null ? `💪 ${n.protein} ${g()}` : ''].filter(Boolean).join(' · ');
  const fillers = data.snackFillers.map((f) => {
    const on = pick.fillers.includes(f.id);
    return `<li><label class="pick${on ? ' on' : ''}${!on && full ? ' off' : ''}">
      <input type="checkbox" data-filler="${f.id}" ${on ? 'checked' : ''} ${!on && full ? 'disabled' : ''}>
      <span class="pick-emoji">${f.emoji || '🥜'}</span>
      <span class="pick-text"><b>${esc(fillerName(f))}</b><small>${esc([f.portion, facts(f.nutrition)].filter(Boolean).join(' · '))}</small></span>
    </label></li>`;
  }).join('');
  const grabs = (data.grabAndGo ?? []).map((id) => data.dishes[id]).filter(Boolean);
  const radio = (id, label, sub, emoji, d) => `<li class="pick-row"><label class="pick${(pick.grab ?? '') === id ? ' on' : ''}">
      <input type="radio" name="grab-${esc(meal.id)}" data-grab="${id}" ${(pick.grab ?? '') === id ? 'checked' : ''}>
      ${d ? photo(d, slot) : `<span class="pick-emoji">${emoji}</span>`}
      <span class="pick-text"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
    </label>${d ? `<a class="icon-btn small recipe-link" href="#/grab/${d.id}" aria-label="${esc(t('openRecipe'))}" title="${esc(t('openRecipe'))}">${recipeIcon}</a>` : ''}</li>`;
  return `
    <div class="snack-builder">
      <section class="snack-col">
        <h3>${esc(t('boxFillers'))} <span class="count">${esc(t('boxCount', { n: pick.fillers.length, max: BOX_MAX }))}</span></h3>
        <ul class="pick-list">${fillers}</ul>
      </section>
      <section class="snack-col">
        <h3>${esc(t('grabTitle'))} <span class="count">${esc(t('pickOne'))}</span></h3>
        <ul class="pick-list">
          ${radio('', t('noGrab'), '', '–')}
          ${grabs.map((d) => radio(d.id, name(d), facts(d.nutrition), d.emoji, d)).join('')}
        </ul>
      </section>
    </div>`;
}

// `grabId` shows one Grab and Go dish on its own, with the same recipe view as a planned meal.
function mealPage(date, slot, selectedId, grabId = null) {
  const meal = grabId ? (data.dishes[grabId] ? { id: 'grab', main: [grabId], sides: [] } : null) : mealFor(date, slot);
  const dishes = dishesOf(meal);
  if (grabId && !dishes.length) return grabPage();
  if (!meal || !dishes.length) {
    return `<div class="error"><h1>${esc(t('noMeal', { meal: slotName(slot) }))}</h1><p class="muted">${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p><a class="btn primary" href="#/day/${date}">${t('backToDay')}</a></div>`;
  }
  const main = dishes[0];
  const dish = dishes.find((d) => d.id === selectedId) ?? main;

  const sections = dishText(dish, 'sections') ?? [];
  const intro = dishText(dish, 'intro');
  const lists = sections.filter((s) => s.kind !== 'steps');
  const steps = sections.filter((s) => s.kind === 'steps');
  const checked = loadChecks(meal.id, dish.id);
  const people = getPeople();
  const factor = factorFor(dish, people);
  let idx = 0;
  const listHtml = lists.map((s) => `
    <div><h3>${esc(s.title || t('ingredients'))}</h3>
    ${s.kind === 'text' ? s.items.map((x) => `<p>${esc(x)}</p>`).join('') : `<ul class="ingredients">${s.items.map((it) => {
      const k = idx++;
      return `<li><label><input type="checkbox" data-check="${k}" ${checked.includes(k) ? 'checked' : ''}><span>${esc(scaleLine(it, factor))}</span></label></li>`;
    }).join('')}</ul>`}</div>`).join('');
  const stepHtml = steps.map((s) => `<div><h3>${esc(s.title || t('method'))}</h3><ol class="steps">${s.items.map((it) => `<li><span>${esc(it)}</span></li>`).join('')}</ol></div>`).join('');
  const scaleNote = dish.serves
    ? (factor === 1 ? t('amountsWritten') : t('amountsScaled', { from: dish.serves, to: people }))
    : t('amountsNoServes');

  // A compact header instead of a big photo: the dishes already have their own photos below.
  return `
    <section class="panel meal-top meal-${slot} rise">
      <a class="icon-btn" href="${grabId ? '#/grab' : `#/day/${date}`}" aria-label="${esc(t(grabId ? 'grabBack' : 'backToDay'))}">${chevron('left')}</a>
      <div class="titles">
        <div class="eyebrow">${grabId
          ? `<span class="pill meal-${slot}"><span class="dot"></span>${esc(t('grabTitle'))}</span>`
          : `<span class="pill meal-${slot}"><span class="dot"></span>${slotName(slot)} · ${mealTime(meal, slot)}</span> ${esc(relDay(date))} · ${fmt(date, { day: 'numeric', month: 'long' })}`}</div>
        <h1>${esc(name(main))}${dishes.length > 1 ? ` <span class="sub">${t('with')} ${dishes.slice(1).map((d) => esc(name(d))).join(' & ')}</span>` : ''}</h1>
      </div>
      ${grabId ? '' : `<div class="share-group">${shareBtn(date, slot)}${waBtn(date, slot)}</div>`}
      ${dishes.length > 1 ? `<div class="dish-tabs" role="tablist">${dishes.map((d) => `
        <button class="dish-tab" role="tab" aria-selected="${d.id === dish.id}" data-dish="${d.id}">
          ${photo(d, slot)}<span><small>${t(d.role === 'main' ? 'main' : 'side')}</small>${esc(name(d))}</span>
        </button>`).join('')}</div>` : ''}
    </section>

    <div class="detail meal-${slot}">
      <aside>
        <div class="panel dish-info rise" style="--i:1">
          <div class="dish-head">
            ${photo(dish, slot, { credit: true, eager: true })}
            <div>
              <h2>${esc(name(dish))}</h2>
              <div class="meta">
                ${dish.prepTime ? `<span class="chip">⏱ ${dish.prepTime} ${t('min')}</span>` : ''}
                ${dishText(dish, 'serving') ? `<span class="chip">🍽 ${esc(dishText(dish, 'serving'))}</span>` : ''}
                <span class="dish-facts" data-dish-facts>${dishFacts(dish)}</span>
                ${(dish.tags ?? []).map((x) => `<span class="chip">${esc(tag(x))}</span>`).join('')}
              </div>
              ${intro ? `<p class="muted" style="margin:12px 0 0">${esc(intro)}</p>` : ''}
            </div>
          </div>
          <div class="scale-row">${peopleControl(people)}<span class="muted">${esc(peopleText(people))} · ${esc(scaleNote)}</span></div>
        </div>
        <div class="panel rise" style="--i:1" data-meal-nutrition>${mealNutrition(dishes)}</div>
        ${meal.repeat || meal.draft || meal.combo ? `<div class="meta rise" style="--i:2">${meal.combo ? `<span class="chip small">🍱 ${esc(comboName(meal))}</span>` : ''}${badges(meal)}</div>` : ''}
        ${meal.notes ? `<div class="note rise" style="--i:2">📝 ${esc(meal.notes)}</div>` : ''}
        ${'wakeLock' in navigator ? `<div class="panel rise toggle" style="--i:3"><span>🍳 ${t('keepScreen')}</span><button class="switch" role="switch" aria-checked="${wakeLock ? 'true' : 'false'}" data-wake aria-label="${t('keepScreen')}"></button></div>` : ''}
      </aside>

      <div style="display:grid;gap:18px;min-width:0">

        <article class="panel dish rise" style="--i:2" data-meal="${meal.id}" data-dishid="${dish.id}">
          ${isSnackBox(dish) ? snackBoxBuilder(meal, slot) : sections.length ? `<div class="recipe ${lists.length && steps.length ? 'two' : ''}">${listHtml ? `<div class="recipe-col">${listHtml}</div>` : ''}${stepHtml ? `<div class="recipe-col">${stepHtml}</div>` : ''}</div>` : `<p class="muted">${t('noRecipe')}</p>`}
          ${dish.notionUrl ? `<p style="margin:0"><a class="muted" style="text-decoration:underline" href="${esc(dish.notionUrl)}" target="_blank" rel="noopener">${t('openNotion')}</a></p>` : ''}
        </article>
      </div>
    </div>
    ${footer()}`;
}

// Dishes ready in 10 minutes or less that pack well for an office lunch. The sync lists them in
// `grabAndGo`; older data without it falls back to the same rule over the dishes it has.
const isGrabAndGo = (d) => d.tags?.includes('Grab and Go') || (d.tags?.includes('Office-friendly') && d.prepTime != null && d.prepTime <= 10);
const needsPrepAhead = (d) => Boolean(d.prepAhead) || /\bsoaked\b|\bsprout(s|ed)?\b/i.test(JSON.stringify(d.sections ?? []));

function grabPage() {
  const ids = data.grabAndGo ?? Object.keys(data.dishes).filter((id) => isGrabAndGo(data.dishes[id]));
  const list = ids.map((id) => data.dishes[id]).filter(Boolean)
    .sort((a, b) => (a.prepTime ?? 99) - (b.prepTime ?? 99) || name(a).localeCompare(name(b)));
  const card = (d, i) => `
    <a class="panel grab-card meal-lunch rise" style="--i:${i + 1}" href="#/grab/${d.id}">
      ${photo(d, 'lunch')}
      <div class="body">
        <h3>${esc(name(d))}</h3>
        <div class="meta">
          ${d.prepTime ? `<span class="chip">⏱ ${d.prepTime} ${t('min')}</span>` : ''}
          ${d.nutrition?.protein != null ? `<span class="chip">💪 ${d.nutrition.protein} ${t('gProtein')}</span>` : ''}
          ${d.nutrition?.calories != null ? `<span class="chip">🔥 ${d.nutrition.calories} ${kcal()}</span>` : ''}
          ${needsPrepAhead(d) ? `<span class="chip prep-chip">🔔 ${esc(t('grabPrepAhead'))}</span>` : ''}
        </div>
        ${dishText(d, 'intro') ? `<p class="muted">${esc(dishText(d, 'intro'))}</p>` : ''}
      </div>
    </a>`;
  return `
    <header class="page-head rise">
      <div class="titles"><div class="eyebrow">${esc(t('grabEyebrow'))}</div><h1>${esc(t('grabTitle'))}</h1></div>
    </header>
    <p class="muted grab-help rise">${esc(t('grabHelp'))}</p>
    ${list.length ? `<div class="grab-grid">${list.map(card).join('')}</div>` : `<div class="panel"><p class="muted" style="margin:0">${esc(t('grabNone'))}</p></div>`}
    ${footer()}`;
}

function weekPage(date) {
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = days[6];
  const weekDishes = days.flatMap((d) => mealsOn(d).flatMap(dishesOf));
  const planned = days.reduce((a, d) => a + SLOTS.filter((s) => mealFor(d, s)).length, 0);
  const tot = sum(weekDishes);
  const range = `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short' })}`;

  return `
    <header class="page-head rise">
      <div class="titles"><div class="eyebrow">${start <= today() && today() <= end ? t('thisWeek') : t('weekOf')}</div><h1>${range}</h1></div>
      <div class="nav">
        <a class="icon-btn" href="#/week/${addDays(start, -7)}" aria-label="${t('prevWeek')}">${chevron('left')}</a>
        <a class="icon-btn" href="#/week/${addDays(start, 7)}" aria-label="${t('nextWeek')}">${chevron('right')}</a>
      </div>
    </header>
    <div class="totals">
      <div class="stat rise" style="--i:0;--c:var(--accent)"><b>${planned}<small style="font-size:14px"> / 21</small></b><span>${t('mealsPlanned')}</span></div>
      <div class="stat rise" style="--i:1;--c:var(--protein)"><b>${show(tot.protein)}<small style="font-size:14px">${tot.protein == null ? '' : ` ${g()}`}</small></b><span>${t('proteinWeek')}</span></div>
      <div class="stat rise" style="--i:2;--c:var(--ink-3)"><b>${show(tot.calories == null ? null : Math.round(tot.calories))}<small style="font-size:14px">${tot.calories == null ? '' : ` ${kcal()}`}</small></b><span>${t('caloriesWeek')}</span></div>
    </div>
    <div class="week">
      ${days.map((d, i) => {
        const dayProtein = sum(mealsOn(d).flatMap(dishesOf)).protein;
        return `<div class="day-row rise${d === today() ? ' today' : ''}" style="--i:${i + 3}">
          <a class="day-label" href="#/day/${d}"><span class="dow">${fmt(d, { weekday: 'short' })} ${fmt(d, { day: 'numeric' })}</span><span class="date">${dayProtein != null ? `${proteinRing(dayProtein)}<span class="grams">${esc(t('gProteinDay', { n: dayProtein }))}</span>` : d === today() ? t('today') : ''}</span></a>
          <div class="slots">${SLOTS.map((slot) => {
            const meal = mealFor(d, slot);
            const dish = mainDish(meal);
            if (!dish) return `<a class="slot empty meal-${slot}" href="#/day/${d}" aria-label="${slotName(slot)}, ${t('notPlanned')}">${slotName(slot)}</a>`;
            return `<a class="slot meal-${slot}" href="#/meal/${d}/${slot}">${photo(dish, slot)}<span class="label"><small>${slotName(slot)}</small>${esc(name(dish))}</span></a>`;
          }).join('')}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function shopPage(from, days) {
  const to = addDays(from, days - 1);
  const meals = data.meals.filter((m) => m.date >= from && m.date <= to);
  const people = getPeople();
  const { groups, have } = applyPantry(buildGroceries(meals, data.dishes, people), data.pantry);
  const listKey = `shop:${from}:${days}`;
  const ticked = new Set(loadList(listKey));
  const total = groups.reduce((a, gr) => a + gr.items.length, 0);
  const done = groups.reduce((a, gr) => a + gr.items.filter((i) => ticked.has(i.key)).length, 0);
  const mon = weekStart(today());
  const ranges = [
    ['next3', today(), 3],
    ['next7', today(), 7],
    ['thisWeek', mon, 7],
    ['nextWeekChip', addDays(mon, 7), 7],
  ];
  const range = `${fmt(from, { weekday: 'short', day: 'numeric', month: 'short' })} – ${fmt(to, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const lang = getLang();
  const itemLabel = (it) => cap((lang !== 'en' && it.pantry?.i18n?.[lang]) || grocery(it.name));
  const haveQty = (p) => (p?.qty != null ? t('haveQty', { qty: amount(`${p.qty}${p.unit ? ` ${p.unit}` : ''}`) }) : '');
  const note = (it) => {
    const badge = it.pantry?.status === 'low' || it.pantry?.status === 'out'
      ? `<span class="pantry-tag ${it.pantry.status}">${t(it.pantry.status === 'low' ? 'pantryLow' : 'pantryOut')}</span> ` : '';
    const usedIn = it.dishes.length ? `<span class="used-in">${esc(it.dishes.map((id) => name(data.dishes[id])).join(', '))}</span>` : '';
    const extra = [it.restock ? t('restock') : '', haveQty(it.pantry)].filter(Boolean).map(esc);
    return `${badge}${[usedIn, ...extra].filter(Boolean).join('<span class="sep"> · </span>')}`;
  };
  const showUsedIn = loadFlag('shopUsedIn');

  return `
    <header class="page-head rise">
      <div class="titles"><div class="eyebrow">${t('groceryList')}</div><h1>${range}</h1></div>
      <div class="nav">
        <a class="icon-btn" href="#/shop/${addDays(from, -days)}/${days}" aria-label="${t('earlier')}">${chevron('left')}</a>
        <a class="icon-btn" href="#/shop/${addDays(from, days)}/${days}" aria-label="${t('later')}">${chevron('right')}</a>
      </div>
    </header>
    <div class="shop-bar rise" style="--i:1">
      <div class="range-chips">${ranges.map(([key, f, n]) => `<a class="chip${f === from && n === days ? ' active' : ''}" href="#/shop/${f}/${n}">${t(key)}</a>`).join('')}</div>
      <div class="scale-row">${peopleControl(people)}<span class="muted">${esc(peopleText(people))}</span></div>
    </div>
    <div class="shop-summary rise" style="--i:2">
      <span><b>${meals.length}</b> ${t('meals')} · <b>${total}</b> ${t('items')}${total ? ` · <b data-done>${done}</b> ${t('inBasket')}` : ''}${have.length ? ` · <b>${have.length}</b> ${t('inPantryShort')}` : ''}</span>
      <span class="actions">
        ${total ? `<button class="btn${showUsedIn ? ' active' : ''}" data-used-in aria-pressed="${showUsedIn}">${t(showUsedIn ? 'hideUsedIn' : 'showUsedIn')}</button>` : ''}
        ${total ? `<button class="btn" data-share>${t('share')}</button><button class="btn" data-clear>${t('clear')}</button>` : ''}
        ${data.notionPantryUrl ? `<a class="btn" href="${esc(data.notionPantryUrl)}" target="_blank" rel="noopener">${t('editPantry')}</a>` : ''}
      </span>
    </div>
    ${total ? `<div class="shop-grid${showUsedIn ? ' show-used' : ''}" data-list="${listKey}">${groups.map((gr, gi) => `
      <section class="panel shop-group rise" style="--i:${gi + 3}">
        <h2>${esc(t(gr.category))}</h2>
        <ul class="ingredients">${gr.items.map((it) => `
          <li><label><input type="checkbox" data-shop="${esc(it.key)}" ${ticked.has(it.key) ? 'checked' : ''}>
            <span class="shop-item"><span class="shop-name">${esc(itemLabel(it))}</span>${it.amount ? `<b class="shop-amt">${esc(amount(it.amount))}</b>` : ''}
            <small class="muted">${note(it)}</small></span></label></li>`).join('')}
        </ul>
      </section>`).join('')}</div>`
      : `<div class="panel" style="text-align:center"><p class="muted">${t(have.length ? 'allInPantry' : 'noMealsDays')}</p></div>`}
    ${have.length ? `<details class="panel have-panel rise" style="--i:${groups.length + 3}">
      <summary><h2>✓ ${t('inPantry')} <span class="muted">(${have.length})</span></h2></summary>
      <p class="muted">${t('inPantryHelp')}</p>
      <ul class="have-list">${have.map((it) => `<li><span>${esc(itemLabel(it))}</span>${it.amount ? ` <small class="muted">${esc(amount(it.amount))}${it.pantry.qty != null ? ` · ${esc(haveQty(it.pantry))}` : ''}</small>` : ''}</li>`).join('')}</ul>
    </details>` : ''}
    <p class="footer-note">${esc(t('amountsFor', { people: peopleText(people) }))}</p>
    ${footer()}`;
}

// ---------- prep ahead ----------

const prepWords = () => ({
  soak: (what) => t('prepSoak', { what }),
  sproutSoak: (what) => t('prepSproutSoak', { what }),
  sproutDrain: () => t('prepSproutDrain'),
});
const prepDone = () => new Set(loadList('prepDone'));

// Tasks for meals from now until the end of `days` days after today.
function prepList(days) {
  const people = getPeople();
  return prepTasks({
    meals: data.meals,
    dishes: data.dishes,
    from: new Date(),
    untilDate: addDays(today(), days),
    factorFor: (dish) => factorFor(dish, people),
    local: (dish) => dishText(dish, 'sections'),
    words: prepWords(),
  });
}

const PREP_ICON = { soak: '💧', sprout: '🌱', step: '⏱️', notion: '📝' };

function prepWhen(due) {
  if (due < new Date()) return t('prepNow');
  const diff = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()) - new Date(`${today()}T00:00:00`)) / 86400000);
  const part = due.getHours() < 12 ? 'Morning' : due.getHours() < 17 ? 'Afternoon' : 'Evening';
  if (diff === 0) return t(part === 'Evening' ? 'tonight' : `this${part}`);
  if (diff === 1) return t(`tomorrow${part}`);
  return `${fmt(iso(due), { weekday: 'long' })} · ${t(`part${part}`)}`;
}

function prepPage(days) {
  const tasks = prepList(days);
  const done = prepDone();
  const groups = [];
  for (const task of tasks) {
    const label = prepWhen(task.due);
    if (groups.at(-1)?.label !== label) groups.push({ label, tasks: [] });
    groups.at(-1).tasks.push(task);
  }
  const clock = (d) => d.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  const ranges = [['prep2', 2], ['prep4', 4], ['prep7', 7]];
  return `
    <header class="page-head rise">
      <div class="titles"><div class="eyebrow">${t('prepEyebrow')}</div><h1>${t('prepTitle')}</h1></div>
    </header>
    <div class="shop-bar rise" style="--i:1">
      <div class="range-chips">${ranges.map(([key, n]) => `<a class="chip${n === days ? ' active' : ''}" href="#/prep/${n}">${t(key)}</a>`).join('')}</div>
      <span class="muted">${tasks.length ? `<b>${tasks.length}</b> ${t('prepTasks')} · <b data-done>${tasks.filter((x) => done.has(x.id)).length}</b> ${t('prepDoneCount')}` : ''}</span>
    </div>
    ${groups.length ? `<div class="prep-list">${groups.map((gr, gi) => `
      <section class="panel prep-group rise" style="--i:${gi + 2}">
        <h2>${esc(gr.label)}</h2>
        <ul class="ingredients">${gr.tasks.map((task) => `
          <li><label><input type="checkbox" data-prep="${esc(task.id)}" ${done.has(task.id) ? 'checked' : ''}>
            <span class="prep-item"><span class="prep-text"><span aria-hidden="true">${PREP_ICON[task.kind]}</span> ${esc(task.text)}</span>
            <small class="muted">${esc(task.due < new Date() ? t('prepBefore', { time: clock(task.mealAt) }) : t('prepBy', { time: clock(task.due) }))} · ${task.uses.map((u) => `<a href="#/meal/${u.meal.date}/${u.meal.meal}">${esc(t('prepFor', { meal: `${fmt(u.meal.date, { weekday: 'short' })} ${slotName(u.meal.meal)}`, dish: name(u.dish) }))}</a>`).join(', ')}</small></span></label></li>`).join('')}
        </ul>
      </section>`).join('')}</div>`
      : `<div class="panel rise" style="--i:2;text-align:center"><p class="muted">${t('prepNone')}</p></div>`}
    <p class="footer-note">${esc(t('prepHelp'))}</p>`;
}

function settingsPage() {
  const lang = getLang();
  const theme = getTheme();
  const option = (attr, value, current, label) =>
    `<button class="choice${value === current ? ' active' : ''}" ${attr}="${value}" aria-pressed="${value === current}">${label}</button>`;
  return `
    <header class="page-head rise"><div class="titles"><div class="eyebrow">Meal Master</div><h1>${t('settings')}</h1></div></header>
    <div class="settings">
      <section class="panel rise" style="--i:1">
        <h2>🌐 ${t('language')}</h2>
        <div class="choices">${Object.entries(LANGS).map(([code, l]) => option('data-lang', code, lang, `<span lang="${code}">${l.label}</span>`)).join('')}</div>
        <p class="muted">${t('languageHelp')}</p>
      </section>
      <section class="panel rise" style="--i:2">
        <h2>👪 ${t('household')}</h2>
        <div class="scale-row">${peopleControl(getPeople())}<span class="muted">${esc(peopleText(getPeople()))}</span></div>
        <p class="muted">${t('householdHelp')}</p>
      </section>
      <section class="panel rise goals-panel" style="--i:3">
        <h2>🎯 ${t('dailyGoals')}</h2>
        <div class="goal-fields">${Object.keys(DEFAULT_GOALS).map((k) => `
          <label class="goal-field" style="--c:var(--${k === 'calories' ? 'ink-3' : k})"><span>${t(k)} <small>(${k === 'calories' ? kcal() : g()})</small></span>
            <input type="number" inputmode="numeric" min="1" step="${k === 'calories' ? 50 : 1}" value="${getGoals()[k]}" data-goal="${k}"></label>`).join('')}
        </div>
        <p class="muted">${t('dailyGoalsHelp')} <button class="link-btn" data-reset-goals>${t('resetGoals')}</button></p>
      </section>
      <section class="panel rise" style="--i:3">
        <h2>🎨 ${t('appearance')}</h2>
        <div class="choices">${option('data-theme-choice', 'auto', theme, t('system'))}${option('data-theme-choice', 'light', theme, `☀️ ${t('light')}`)}${option('data-theme-choice', 'dark', theme, `🌙 ${t('dark')}`)}</div>
      </section>
      <section class="panel rise" style="--i:4">
        <h2>💬 ${t('whatsapp')}</h2>
        <p class="muted wa-help" style="margin-top:0">${t('whatsappHelp')}</p>
        ${data.notionWhatsappUrl ? `<p><a class="btn" href="${esc(data.notionWhatsappUrl)}" target="_blank" rel="noopener">${t('whatsappEdit')}</a></p>` : ''}
      </section>
      <section class="panel rise" style="--i:5">
        <h2>🗂 ${t('dataTitle')}</h2>
        <p class="muted" style="margin-top:0">${t('lastSynced')}: ${esc(syncedAt())}</p>
        ${data.notionScheduleUrl ? `<a class="btn" href="${esc(data.notionScheduleUrl)}" target="_blank" rel="noopener">${t('editNotion')}</a>` : ''}
      </section>
    </div>`;
}

// "Today's Breakfast", "Tomorrow's Lunch", "Wednesday's Dinner"; further off or in the past, "Dinner · 5 October".
function shareHeading(date, slot) {
  const diff = Math.round((parse(date) - parse(today())) / 86400000);
  const meal = slotName(slot);
  if (diff < 0 || diff > 6) return t('shareHeadingOn', { meal, date: fmt(date, { day: 'numeric', month: 'long' }) });
  const day = diff === 0 ? t('today') : diff === 1 ? t('tomorrow') : fmt(date, { weekday: 'long' });
  const key = t(`shareHeading_${slot}`) === `shareHeading_${slot}` ? 'shareHeading' : `shareHeading_${slot}`;
  return t(key, { day, meal });
}

// Only what the cook needs: a collage of the dishes, dish names and the meal's note. No recipe or nutrition;
// "Share with recipe" adds a link that opens this meal in the app.
function mealShareText(date, slot, withLink = false) {
  const meal = mealFor(date, slot);
  const dishes = dishesOf(meal);
  const lines = [
    `${SLOT_EMOJI[slot] ?? '🍽️'} *${shareHeading(date, slot)}*`,
    '',
    ...dishes.map((d, i) => `${i + 1}. ${name(d)}${d.role === 'main' ? ` (${t('shareMain')})` : ''}`),
  ];
  if (meal.notes) lines.push('', `📝 ${t('shareNote')}: ${meal.notes}`);
  if (withLink) lines.push('', `📖 ${t('shareRecipeLine')}: ${location.origin}${location.pathname}?m=${date}-${slot}`);
  return { text: lines.join('\n') };
}

// "Today's Lunch" in English, for the WhatsApp message (its template is in English).
function englishHeading(date, slot) {
  const diff = Math.round((parse(date) - parse(today())) / 86400000);
  const meal = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }[slot] ?? slot;
  if (diff < 0 || diff > 6) return `${meal} · ${parse(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;
  const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : parse(date).toLocaleDateString('en-GB', { weekday: 'long' });
  return `${day}'s ${meal}`;
}

// One picture of every dish in the meal, with a heading (at most four dishes are pictured).
function collageBlob(date, slot, { english = false } = {}) {
  const css = getComputedStyle(document.documentElement);
  return mealCollage({
    heading: `${SLOT_EMOJI[slot] ?? '🍽️'} ${english ? englishHeading(date, slot) : shareHeading(date, slot)}`,
    dishes: dishesOf(mealFor(date, slot)).map((d) => ({ name: english ? d.name : name(d), src: d.photo?.src, emoji: d.emoji })),
    color: css.getPropertyValue(`--${slot}`).trim() || '#3f9b5a',
    family: css.getPropertyValue('--sans').trim() || 'sans-serif',
  });
}

// For the share sheet.
async function mealCollageFile(date, slot) {
  if (!navigator.canShare) return null;
  try {
    const blob = await collageBlob(date, slot);
    const file = blob && new File([blob], `${date}-${slot}.jpg`, { type: 'image/jpeg' });
    return file && navigator.canShare({ files: [file] }) ? file : null;
  } catch {
    return null;
  }
}

// The share sheet (WhatsApp, with the photo) where the browser has one; otherwise WhatsApp with the text.
async function shareMeal(date, slot, withLink) {
  const { text } = mealShareText(date, slot, withLink);
  if (navigator.share) {
    const file = await mealCollageFile(date, slot);
    try {
      await navigator.share(file ? { files: [file], text } : { text });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ---------- WhatsApp through the Worker ----------

const getPin = () => { try { return localStorage.getItem('appPin') || ''; } catch { return ''; } };
const setPin = (pin) => { try { if (pin) localStorage.setItem('appPin', pin); else localStorage.removeItem('appPin'); } catch { /* storage unavailable */ } };

// A small modal: resolves true (OK), the typed text (with `input`), or null (cancelled).
function dialog({ title, message = '', input = false, ok = t('ok'), cancel = t('cancel') }) {
  return new Promise((resolve) => {
    const box = document.createElement('dialog');
    box.className = 'app-dialog';
    box.innerHTML = `<form method="dialog">
      <h2>${esc(title)}</h2>${message ? `<p>${esc(message)}</p>` : ''}
      ${input ? '<input type="password" inputmode="numeric" autocomplete="off" required>' : ''}
      <div class="actions">${cancel ? `<button class="btn" type="button" data-cancel>${esc(cancel)}</button>` : ''}<button class="btn primary">${esc(ok)}</button></div>
    </form>`;
    document.body.append(box);
    const done = (value) => { box.close(); box.remove(); resolve(value); };
    box.querySelector('[data-cancel]')?.addEventListener('click', () => done(null));
    box.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    box.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      done(input ? box.querySelector('input').value.trim() || null : true);
    });
    box.showModal();
    box.querySelector('input')?.focus();
  });
}

function toast(message, kind = '') {
  document.querySelector('.toast')?.remove();
  const el = Object.assign(document.createElement('div'), { className: `toast ${kind}`, textContent: message, role: 'status' });
  document.body.append(el);
  if (kind) setTimeout(() => el.remove(), 5000);
  return el;
}

async function api(path, { method = 'GET', body, pin } = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      cache: 'no-store',
      headers: { ...(body && { 'Content-Type': 'application/json' }), ...(pin && { 'X-App-Pin': pin }) },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, ok: res.ok, out: await res.json().catch(() => ({})) };
  } catch {
    return { status: 0, ok: false, out: { hint: t('waOffline') } };
  }
}

// Runs a call that needs the app PIN: asks for it once (then it's saved on this device), and
// again if the Worker says it's wrong.
async function withPin(call) {
  let wrong = false;
  for (let tries = 0; tries < 3; tries++) {
    let pin = getPin();
    if (!pin) {
      pin = await dialog({ title: t('pinTitle'), message: wrong ? t('pinWrong') : t('pinHelp'), input: true, ok: t('continue') });
      if (!pin) return null;
    }
    const result = await call(pin);
    if (result.status !== 401) {
      setPin(pin);
      return result;
    }
    setPin('');
    wrong = true;
  }
  return null;
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

let waBusy = false;
async function sendOnWhatsApp(date, slot) {
  if (waBusy) return;
  waBusy = true;
  try {
    const who = await withPin((pin) => api('/whatsapp/recipients', { pin }));
    if (!who) return;
    if (!who.ok) return void toast(t('waFailed', { why: who.out.hint || who.out.error || who.status }), 'error');
    if (!who.out.ready) {
      return void await dialog({ title: t('waTitle'), message: t('waNotSetUp', { missing: who.out.missing.join(', ') }), cancel: null });
    }
    const yes = await dialog({ title: t('waTitle'), message: t('waConfirm', { to: who.out.to.join(', ') }), ok: t('waShare') });
    if (!yes) return;
    toast(t('waSending'));
    let image = null;
    try { image = await blobToDataUrl(await collageBlob(date, slot, { english: true })); } catch { /* send with the default header */ }
    const sent = await api('/whatsapp/send', { method: 'POST', pin: getPin(), body: { date, meal: slot, image } });
    if (sent.ok) toast(t('waSent', { to: sent.out.sent.join(', ') }), 'ok');
    else toast(t('waFailed', { why: sent.out.hint || sent.out.error || sent.status }), 'error');
  } finally {
    waBusy = false;
  }
}

function shopText() {
  const lines = [...app.querySelectorAll('.shop-group')].map((gr) => {
    const items = [...gr.querySelectorAll('li')]
      .filter((li) => !li.querySelector('input').checked)
      .map((li) => `• ${li.querySelector('.shop-name').textContent}${li.querySelector('.shop-amt') ? ` — ${li.querySelector('.shop-amt').textContent}` : ''}`);
    return items.length ? `${gr.querySelector('h2').textContent}\n${items.join('\n')}` : '';
  }).filter(Boolean);
  return `${t('groceryList')}: ${app.querySelector('h1').textContent}\n\n${lines.join('\n\n')}`;
}

// ---------- per-device storage ----------

function loadList(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}
function saveList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage unavailable */ }
}
function loadFlag(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function saveFlag(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* storage unavailable */ }
}
const loadChecks = (mealId, dishId) => loadList(`checks:${mealId}:${dishId}`);
const saveChecks = (mealId, dishId, list) => saveList(`checks:${mealId}:${dishId}`, list);

function getTheme() {
  try { return localStorage.getItem('theme') || 'auto'; } catch { return 'auto'; }
}
function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

// Labels outside #app (tab bar, page language) follow the chosen language.
function applyLanguage() {
  document.documentElement.lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
}

// ---------- router ----------

function route() {
  const [page, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  switch (page) {
    case 'home': return { tab: 'home', fit: true, render: homePage };
    case 'week': return { tab: 'week', fit: true, render: () => weekPage(isDate(a) ? a : today()), swipe: (dir) => `#/week/${addDays(weekStart(isDate(a) ? a : today()), dir * 7)}` };
    case 'shop': {
      const from = isDate(a) ? a : today();
      const days = Math.min(14, Math.max(1, Number(b) || 7));
      return { tab: 'shop', render: () => shopPage(from, days), swipe: (dir) => `#/shop/${addDays(from, dir * days)}/${days}` };
    }
    case 'grab': return { tab: 'grab', render: () => (a ? mealPage(today(), 'lunch', null, a) : grabPage()) };
    case 'prep': return { tab: 'prep', render: () => prepPage([2, 4, 7].includes(Number(a)) ? Number(a) : 2) };
    case 'settings': return { tab: 'settings', fit: true, render: settingsPage };
    case 'meal': return { tab: 'day', render: () => mealPage(isDate(a) ? a : today(), b || 'dinner') };
    default: return { tab: 'day', fit: true, render: () => dayPage(isDate(a) ? a : today()), swipe: (dir) => `#/day/${addDays(isDate(a) ? a : today(), dir)}` };
  }
}

let current = null;
function render() {
  current = route();
  const paint = () => {
    // Today, Home, Week and Settings fill exactly one screen; Shop and meal pages scroll.
    document.body.classList.toggle('fit', Boolean(current.fit));
    document.body.dataset.page = location.hash.replace(/^#\/?/, '').split('/')[0] || 'day';
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

// Re-renders in place, keeping the scroll position and the selected dish tab.
function rerender() {
  const y = window.scrollY;
  const selected = app.querySelector('[data-dishid]')?.dataset.dishid;
  const [page, date, slot] = location.hash.replace(/^#\/?/, '').split('/');
  app.innerHTML = page === 'meal' ? mealPage(date, slot, selected) : current.render();
  window.scrollTo({ top: y, behavior: 'instant' });
}

function countUp() {
  app.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target; return; }
    const t0 = performance.now() + 500;
    const step = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / 1400));
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
    rerender();
    return;
  }
  const langBtn = e.target.closest('[data-lang]');
  if (langBtn) {
    setLang(langBtn.dataset.lang);
    applyLanguage();
    rerender();
    return;
  }
  if (e.target.closest('[data-reset-goals]')) {
    try { localStorage.removeItem('goals'); } catch { /* storage unavailable */ }
    rerender();
    return;
  }
  const themeBtn = e.target.closest('[data-theme-choice]');
  if (themeBtn) {
    const theme = themeBtn.dataset.themeChoice;
    try { localStorage.setItem('theme', theme); } catch { /* storage unavailable */ }
    applyTheme(theme);
    rerender();
    return;
  }
  const shareMealBtn = e.target.closest('[data-share-meal]');
  if (shareMealBtn) {
    e.preventDefault();
    e.stopPropagation();
    const [d, slot] = shareMealBtn.dataset.shareMeal.split('/');
    shareMeal(d, slot, true);
    return;
  }
  const waMealBtn = e.target.closest('[data-wa-meal]');
  if (waMealBtn) {
    e.preventDefault();
    e.stopPropagation();
    const [d, slot] = waMealBtn.dataset.waMeal.split('/');
    sendOnWhatsApp(d, slot);
    return;
  }
  if (e.target.closest('[data-share]')) {
    const text = shopText();
    try {
      if (navigator.share) await navigator.share({ title: t('groceryList'), text });
      else { await navigator.clipboard.writeText(text); e.target.textContent = t('copied'); }
    } catch { /* share cancelled */ }
    return;
  }
  const usedIn = e.target.closest('[data-used-in]');
  if (usedIn) {
    const on = app.querySelector('.shop-grid').classList.toggle('show-used');
    saveFlag('shopUsedIn', on);
    usedIn.classList.toggle('active', on);
    usedIn.setAttribute('aria-pressed', String(on));
    usedIn.textContent = t(on ? 'hideUsedIn' : 'showUsedIn');
    return;
  }
  if (e.target.closest('[data-clear]')) {
    saveList(app.querySelector('[data-list]').dataset.list, []);
    rerender();
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
  if (e.target.matches('[data-filler], [data-grab]')) {
    const mealId = e.target.closest('[data-meal]').dataset.meal;
    const pick = boxPick(mealId);
    if (e.target.matches('[data-filler]')) {
      const id = e.target.dataset.filler;
      pick.fillers = e.target.checked ? [...new Set([...pick.fillers, id])].slice(0, BOX_MAX) : pick.fillers.filter((x) => x !== id);
    } else pick.grab = e.target.dataset.grab || null;
    saveBoxPick(mealId, pick);
    updateSnackBox(mealId, pick);
    return;
  }
  if (e.target.matches('[data-goal]')) {
    setGoal(e.target.dataset.goal, Number(e.target.value));
    e.target.value = getGoals()[e.target.dataset.goal];
    return;
  }
  if (e.target.matches('[data-prep]')) {
    const done = prepDone();
    if (e.target.checked) done.add(e.target.dataset.prep); else done.delete(e.target.dataset.prep);
    saveList('prepDone', [...done]);
    const count = app.querySelector('[data-done]');
    if (count) count.textContent = app.querySelectorAll('[data-prep]:checked').length;
    return;
  }
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

// Pick up new data from Notion without a reload: when the app comes back to the
// foreground, and every 10 minutes while it stays open. Only re-render if something changed.
let shownDay = today();
let lastCheck = Date.now();
let swReg = null;
async function refresh() {
  lastCheck = Date.now();
  swReg?.update().catch(() => {});
  const before = data?.generatedAt;
  try { await load(); } catch { return; }
  showOffline();
  if (data.generatedAt !== before || shownDay !== today()) { shownDay = today(); render(); }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (shownDay !== today() || Date.now() - lastCheck > 60000)) refresh();
});
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 10 * 60000);

// ---------- start ----------

// Everything comes from the Meal Master Worker, which reads Notion live (address in config.js).
// When the tablet is offline, the service worker answers with the last saved menu and marks it.
const API = /YOUR-SUBDOMAIN/.test(self.MEAL_API ?? '') ? '' : String(self.MEAL_API ?? '').replace(/\/$/, '');
let offline = false;
let fillRetries = 0;
async function load() {
  if (!API) throw new Error(t('apiMissing'));
  const res = await fetch(`${API}/data`, { cache: 'no-store' });
  if (!res.ok) {
    let why = `HTTP ${res.status}`;
    try { const err = await res.json(); why = err.hint || err.error || why; } catch { /* not JSON */ }
    throw new Error(why);
  }
  offline = res.headers.get('X-Offline') === '1';
  data = await res.json();
  showOffline();
  // A Worker that has just started fills in recipes over a few calls.
  if (data.incomplete && fillRetries++ < 8) setTimeout(refresh, 4000);
}

function showOffline() {
  const note = document.getElementById('offline');
  if (!note) return;
  note.hidden = !offline;
  note.textContent = offline ? `📴 ${t('offlineNote', { when: syncedAt() })}` : '';
}
addEventListener('online', () => refresh());

// A photo that can't load (offline, or removed in Notion) turns back into the dish's emoji.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName !== 'IMG' || !img.closest('.photo')) return;
  const box = img.closest('.photo');
  box.classList.add('placeholder');
  img.replaceWith(Object.assign(document.createElement('span'), { className: 'emoji', textContent: img.dataset.emoji || '🍽️' }));
}, true);

// Short links from WhatsApp buttons: ?m=2026-09-29-breakfast opens that meal.
const shortLink = new URLSearchParams(location.search).get('m')?.match(/^(\d{4}-\d{2}-\d{2})-([a-z]+)$/);
if (shortLink) history.replaceState(null, '', `${location.pathname}#/meal/${shortLink[1]}/${shortLink[2]}`);

applyTheme(getTheme());
applyLanguage();
addEventListener('hashchange', render);
load().then(render).catch((err) => {
  app.innerHTML = `<div class="error"><h1>${t('couldntLoad')}</h1><p class="muted">${esc(err.message)}</p><button class="btn primary" onclick="location.reload()">${t('tryAgain')}</button></div>`;
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
  // When a deploy changes the code, the new worker takes over and the app reloads onto it.
  // The very first install also takes control, but that page is already up to date.
  let hadWorker = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('sw.js').then((reg) => { swReg = reg; }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadWorker) location.reload();
    hadWorker = true;
  });
}
