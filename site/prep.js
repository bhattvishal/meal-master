// Things to do ahead of a meal: soaking, sprouting, fermenting, setting overnight.
// Tasks come from a dish's "Prep ahead" text in Notion when it has one, otherwise
// they are read from the recipe: ingredients like "1 cup rajma, soaked overnight",
// sprouts, and method steps that take hours ("leave 8–12 hours until risen").

import { scaleLine, parseLine, formatQty } from './kitchen.js';

export const SLOT_TIME = { breakfast: '08:00', lunch: '13:00', dinner: '20:00', snack: '16:00' };
const HOUR = 3600000;
const OVERNIGHT = 12;

const at = (date, hhmm) => new Date(`${date}T${hhmm}:00`);
const dayBefore = (d, n = 1) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
const withTime = (d, h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);

// Nobody soaks dal at 3 am: anything due between 10 pm and 7 am moves to 9 pm the evening before.
function awake(due) {
  const h = due.getHours();
  if (h >= 22) return withTime(due, 21);
  if (h < 7) return withTime(dayBefore(due), 21);
  return due;
}

// "overnight", "4 hours", "8–12 hours", "5-6 hrs" -> hours to allow, or null if it's quick or optional.
function duration(text) {
  const t = text.toLowerCase();
  // "at least 15 minutes, or overnight" and "if making the night before" are optional.
  if (/\bminutes?\b.*\bor overnight\b|\bif (you are )?making\b/.test(t)) return null;
  const hrs = t.match(/(\d+)(?:\s*(?:–|-|to)\s*(\d+))?\s*(?:hours?|hrs?)\b/);
  if (hrs && Number(hrs[1]) >= 4) return Number(hrs[2] ?? hrs[1]);
  if (/\bovernight\b/.test(t)) return OVERNIGHT;
  return null;
}

const SPROUTS = /\b(sprouts|sprouted)\b/i;
const BOUGHT = /\b(store|shop|bought|ready)\b/i;

// "N nights before: …", "night before: …", "morning before: …", "N hours before: …", "morning: …"
function parseNotion(text, mealAt) {
  const tasks = [];
  for (const raw of text.split(/\n|;/)) {
    const m = raw.match(/^\s*([^:]+):\s*(.+)$/);
    if (!m) continue;
    const when = m[1].toLowerCase().trim();
    let due = null;
    let n;
    if ((n = when.match(/(\d+)\s*nights?\s*before/))) due = withTime(dayBefore(mealAt, Number(n[1])), 21);
    else if (/night before|evening before|day before/.test(when)) due = withTime(dayBefore(mealAt), 21);
    else if (/morning before/.test(when)) due = withTime(dayBefore(mealAt), 8);
    else if ((n = when.match(/(\d+)\s*(?:hours?|hrs?)\s*before/))) due = awake(new Date(mealAt - Number(n[1]) * HOUR));
    else if (/morning/.test(when)) due = withTime(mealAt, 8);
    if (due) tasks.push({ due, text: m[2].trim(), kind: 'notion' });
  }
  return tasks;
}

/**
 * Prep tasks for one dish in one meal.
 * `local` is the dish's sections in the current language (same shape as `dish.sections` when translated).
 */
function dishTasks(dish, mealAt, factor, local, words) {
  if (dish.prepAhead) return parseNotion(dish.prepAhead, mealAt);
  const tasks = [];
  const sections = dish.sections ?? [];
  const same = local && local.length === sections.length && local.every((s, i) => s.items.length === sections[i].items.length);
  const localItem = (si, ii) => (same ? local[si].items[ii] : sections[si].items[ii]);

  sections.forEach((sec, si) => {
    if (sec.kind !== 'list') return;
    sec.items.forEach((item, ii) => {
      const soaked = item.match(/^(.*?),?\s+soaked\b(.*)$/i);
      const hours = soaked && duration(soaked[2]);
      if (hours) {
        const what = scaleLine(same ? localItem(si, ii).split(/,\s*[^,]*$/)[0] : soaked[1], factor);
        tasks.push({ due: awake(new Date(mealAt - hours * HOUR)), text: words.soak(what), kind: 'soak' });
      } else if (SPROUTS.test(item) && !BOUGHT.test(item)) {
        const line = localItem(si, ii).split(',')[0];
        const p = parseLine(line);
        const what = p.qty != null && !p.qtyHigh ? { qty: p.qty * factor, unit: p.unit, rest: p.rest } : { text: scaleLine(line, factor) };
        tasks.push({ due: withTime(dayBefore(mealAt, 2), 21), what, text: words.sproutSoak(addUp([what])), kind: 'sprout', merge: 'sproutSoak' });
        tasks.push({ due: withTime(dayBefore(mealAt), 8), text: words.sproutDrain(), kind: 'sprout', merge: 'sproutDrain' });
      }
    });
  });

  // Long method steps chain: a 6-hour soak followed by a 12-hour ferment starts 18 hours ahead.
  sections.forEach((sec, si) => {
    if (sec.kind !== 'steps') return;
    const long = sec.items.map((step, ii) => ({ ii, hours: duration(step) })).filter((s) => s.hours);
    long.forEach((s, k) => {
      const lead = long.slice(k).reduce((a, x) => a + x.hours, 0);
      tasks.push({ due: awake(new Date(mealAt - lead * HOUR)), text: localItem(si, s.ii), kind: 'step' });
    });
  });
  return tasks;
}

// 1½ cup moong sprouts + 3 cup moong sprouts -> "4½ cup moong sprouts"; different things stay joined with "+".
const show = (w) => w.text ?? `${formatQty(w.qty, w.unit)} ${w.rest}`;
function addUp(whats) {
  const [first] = whats;
  if (whats.every((w) => w.qty != null && w.unit === first.unit && w.rest === first.rest)) {
    return show({ ...first, qty: whats.reduce((a, w) => a + w.qty, 0) });
  }
  return whats.map(show).join(' + ');
}

/**
 * Every prep task for meals from `from` (a Date) to the end of `untilDate` (YYYY-MM-DD).
 * The same job at the same time for several meals (soaking moong for two sprout dishes)
 * becomes one task. Returns [{ id, due, text, kind, uses: [{ meal, dish }] }] sorted by when to do it.
 */
export function prepTasks({ meals, dishes, from, untilDate, factorFor, local, words }) {
  const out = [];
  const byKey = new Map();
  for (const meal of meals) {
    if (meal.date > untilDate) continue;
    const mealAt = at(meal.date, meal.time || SLOT_TIME[meal.meal] || '13:00');
    if (mealAt < from) continue;
    for (const id of [...meal.main, ...meal.sides]) {
      const dish = dishes[id];
      if (!dish) continue;
      dishTasks(dish, mealAt, factorFor(dish), local(dish), words).forEach((task, i) => {
        const key = `${task.due.getTime()}|${task.merge ?? task.text}`;
        const same = byKey.get(key);
        if (same) {
          same.uses.push({ meal, dish });
          if (task.what) {
            same.whats.push(task.what);
            same.text = words.sproutSoak(addUp(same.whats));
          }
          return;
        }
        const merged = { ...task, id: `${meal.id}:${id}:${i}`, uses: [{ meal, dish }], whats: task.what ? [task.what] : [], mealAt };
        byKey.set(key, merged);
        out.push(merged);
      });
    }
  }
  return out.sort((a, b) => a.due - b.due || a.mealAt - b.mealAt);
}
