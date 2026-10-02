// Turns Meal Schedule rows into one meal per date and meal slot. Pure functions, no Notion calls.
//
// Rules for a date + meal:
//   1. A normal (non-repeating) row with that Date and Meal wins.
//   2. Otherwise a repeating row whose Date <= date, whose Until is empty or >= date, and which
//      matches the day: Daily, Weekdays (Mon–Fri), Weekends (Sat–Sun), Weekly (same weekday as Date).
//      If several repeats match, the one that started most recently wins.
//   3. With a Combo, Main and Sides come from the combo, but Main or Sides set on the row win.

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday

// "Today" and "tomorrow" are always in India time.
export const istToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);

const REPEATS = {
  daily: () => true,
  weekdays: (day) => weekday(day) >= 1 && weekday(day) <= 5,
  weekends: (day) => weekday(day) === 0 || weekday(day) === 6,
  weekly: (day, from) => weekday(day) === weekday(from),
};

/**
 * rows: [{ id, name, meal, date, time, notes, main, sides, combo, repeat, until, draft }] with
 *       meal/repeat lower-case, dates as YYYY-MM-DD and combo an id or null.
 * combos: Map id -> { name, i18n, meal, notes, main, sides }
 * Returns meals from `from` to `to` (inclusive), sorted by date and time.
 */
export function resolveMeals(rows, combos, from, to) {
  const byKey = new Map();
  const put = (meal, priority) => {
    const key = `${meal.date}|${meal.meal}`;
    const existing = byKey.get(key);
    if (!existing || priority > existing.priority) byKey.set(key, { meal, priority });
  };

  for (const row of rows) {
    if (!row.date) continue;
    const combo = row.combo ? combos.get(row.combo) : null;
    const base = {
      meal: row.meal || combo?.meal?.toLowerCase() || 'dinner',
      name: row.name || combo?.name || null,
      time: row.time || null,
      notes: row.notes || combo?.notes || null,
      combo: combo?.name ?? null,
      comboI18n: combo?.i18n ?? null,
      main: row.main?.length ? row.main : combo?.main ?? [],
      sides: row.sides?.length ? row.sides : combo?.sides ?? [],
      draft: Boolean(row.draft),
      rowId: row.id,
    };
    const repeat = row.repeat && REPEATS[row.repeat] ? row.repeat : null;
    if (!repeat) {
      if (row.date >= from && row.date <= to) put({ id: row.id, date: row.date, ...base, repeat: null }, Infinity);
      continue;
    }
    const last = row.until && row.until < to ? row.until : to;
    for (let day = row.date > from ? row.date : from; day <= last; day = addDays(day, 1)) {
      if (REPEATS[repeat](day, row.date)) put({ id: `${row.id}:${day}`, date: day, ...base, repeat }, Date.parse(row.date));
    }
  }
  return [...byKey.values()]
    .map((v) => v.meal)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || SLOTS.indexOf(a.meal) - SLOTS.indexOf(b.meal));
}
