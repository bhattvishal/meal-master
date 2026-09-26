// Household size, ingredient scaling and the grocery list.

const PEOPLE_KEY = 'people';
export const DEFAULT_PEOPLE = 3;

export function getPeople() {
  try {
    const n = Number(localStorage.getItem(PEOPLE_KEY));
    return n >= 1 && n <= 12 ? n : DEFAULT_PEOPLE;
  } catch {
    return DEFAULT_PEOPLE;
  }
}
export function setPeople(n) {
  try { localStorage.setItem(PEOPLE_KEY, String(Math.min(12, Math.max(1, n)))); } catch { /* storage unavailable */ }
}

// How much to multiply a recipe by. Recipes without "Serves" (e.g. flour blends) are left as written.
export const factorFor = (dish, people) => (dish.serves ? people / dish.serves : 1);

const UNITS = {
  g: 'g', gm: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', litre: 'l', liter: 'l',
  cup: 'cup', cups: 'cup', tbsp: 'tbsp', tsp: 'tsp', inch: 'inch', clove: 'clove', cloves: 'clove',
};
const NUM = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;
const LEAD = new RegExp(String.raw`^\s*${NUM}(?:\s*[–-]\s*${NUM})?\s*(.*)$`);

const toNumber = (s) => {
  s = s.trim();
  if (s.includes(' ')) { const [w, f] = s.split(/\s+/); return Number(w) + toNumber(f); }
  if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return a / b; }
  return Number(s);
};

// "1 1/2 cups rice, washed" -> { qty: 1.5, unit: 'cup', item: 'rice, washed' }
export function parseLine(line) {
  const m = line.match(LEAD);
  if (!m) return { qty: null, unit: null, item: line.trim(), rest: line.trim() };
  const qty = toNumber(m[1]);
  const qtyHigh = m[2] ? toNumber(m[2]) : null;
  const [first, ...more] = m[3].split(/\s+/);
  const unit = UNITS[first?.toLowerCase().replace(/\.$/, '')];
  return unit
    ? { qty, qtyHigh, unit, item: more.join(' '), rest: m[3] }
    : { qty, qtyHigh, unit: null, item: m[3], rest: m[3] };
}

const FRACTIONS = [[0, ''], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];
export function formatQty(q, unit) {
  if (unit === 'g' || unit === 'ml') {
    if (q >= 1000) return `${Math.round(q / 50) * 50}`;
    return `${q >= 30 ? Math.round(q / 5) * 5 : Math.round(q)}`;
  }
  if (unit === 'kg' || unit === 'l') return `${Math.round(q * 10) / 10}`;
  let whole = Math.floor(q);
  const frac = q - whole;
  const [value, glyph] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - frac) < Math.abs(best[0] - frac) ? f : best));
  if (value === 1) whole += 1;
  if (whole === 0 && !glyph) return '¼';
  return `${whole || ''}${glyph}`;
}

// Rewrites the leading amount of an ingredient line for a different number of people.
export function scaleLine(line, factor) {
  if (factor === 1) return line;
  const p = parseLine(line);
  if (p.qty == null) return line;
  const amount = formatQty(p.qty * factor, p.unit) + (p.qtyHigh ? `–${formatQty(p.qtyHigh * factor, p.unit)}` : '');
  return `${amount} ${p.rest}`;
}

// ---------- grocery list ----------

const CATEGORIES = [
  ['Nuts & seeds', /\b(almond|walnut|peanut|cashew|makhana|chia|flax|pumpkin seed|sunflower seed)/],
  ['Spices & pantry', /\b(powder|masala|turmeric|cumin|jeera|ajwain|hing|mustard|methi|fenugreek|bay leaf|cinnamon|cardamom|clove|pepper|salt|sugar|jaggery|tamarind|honey|oil|amchur|dry red chill|chilli flakes|vinegar|sauce|kasuri)/],
  ['Dairy', /\b(paneer|curd|yogurt|yoghurt|ghee|milk|cream|butter|cheese|buttermilk)/],
  ['Pulses, grains & flours', /\b(dal|rajma|chhole|chole|chickpea|chana|beans|lentil|soya|besan|atta|flour|jowar|bajra|ragi|oats|rice|poha|roti|bread|quinoa|urad|moong(?! sprouts))/],
  ['Vegetables & herbs', /\b(onion|tomato|cucumber|potato|capsicum|spinach|palak|bhindi|okra|chilli|ginger|garlic|coriander|mint|curry leaves|lemon|lime|vegetable|drumstick|pumpkin|carrot|brinjal|shallot|sprouts|coconut|peas|cauliflower|cabbage|beetroot|methi leaves)/],
  ['Fruit', /\b(banana|fruit|apple|papaya|guava|pomegranate|mango|orange|berries|grapes)/],
];
const categoryOf = (name) => CATEGORIES.find(([, re]) => re.test(name))?.[0] ?? 'Other';

const SKIP = /\b(water|leftover|tossed with|soaked chia)\b/i;
const KEEP_PLURAL = /(leaves|seeds|sprouts|oats|flakes|greens|peas)$/;
const singular = (w) => (KEEP_PLURAL.test(w) ? w : w.replace(/(tomato|potato)es$/, '$1').replace(/ies$/, 'i').replace(/([^s])s$/, '$1'));

// "Handful of coriander, chopped" -> "coriander"; "oil or ghee" -> "oil"
function itemName(item) {
  const name = item
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .split(',')[0]
    .replace(/^(a |an )?(handful|pinch|sprig|few|splash|squeeze|small piece|piece|bunch|dash) of /, '')
    .replace(/^(a few|some|few) /, '')
    .split(' or ')[0]
    .replace(/ (to taste|to finish|to serve|to garnish|for .*|as needed|per .*)$/, '')
    .replace(/\b(large|medium|small|big|fresh|thick|very|finely|roughly|thinly|chopped|sliced|grated|crumbled|cubed|whisked|soaked|boiled|mashed|cooked|dried|roasted|optional)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = name.split(' ');
  words.push(singular(words.pop()));
  return words.join(' ');
}

function amountText(qty, unit) {
  if (!unit) return formatQty(roundCount(qty), null);
  if (unit === 'tsp' && qty >= 48) return `${formatQty(qty / 48, 'cup')} cup`;
  if (unit === 'tsp' && qty >= 3) return `${formatQty(qty / 3, 'tbsp')} tbsp`;
  return `${formatQty(qty, unit)} ${unit}`;
}

// Counted things (onions, chillies) round up to a whole or half.
const roundCount = (q) => (q >= 3 ? Math.ceil(q) : Math.ceil(q * 2) / 2);

/**
 * Adds up the ingredients of every dish in `meals`, scaled for `people`.
 * Returns [{ category, items: [{ key, name, amount, dishes: [names] }] }].
 */
export function buildGroceries(meals, dishes, people) {
  const items = new Map();
  for (const meal of meals) {
    for (const id of [...meal.main, ...meal.sides]) {
      const dish = dishes[id];
      if (!dish) continue;
      const factor = factorFor(dish, people);
      for (const section of dish.sections ?? []) {
        if (section.kind !== 'list') continue;
        for (const raw of section.items) {
          if (SKIP.test(raw)) continue;
          const line = raw.replace(/^juice of /i, '');
          const p = parseLine(line);
          const full = itemName(p.qty == null ? line : p.item);
          // An unmeasured "salt and pepper" is two things; a measured "almonds and walnuts" stays one.
          const names = p.qty == null ? full.split(' and ').map((n) => itemName(n)) : [full];
          for (const name of names) {
          if (!name) continue;
          // Pantry blends without a serving count are listed once, without amounts.
          const scalable = p.qty != null && dish.serves;
          // Spoons are added up in teaspoons and shown in the largest sensible unit.
          const spoon = p.unit === 'tsp' || p.unit === 'tbsp';
          const unit = spoon ? 'tsp' : p.unit;
          const key = `${name}|${scalable ? unit ?? '#' : '-'}`;
          const entry = items.get(key) ?? { key, name, unit: scalable ? unit : null, qty: 0, counted: !!scalable, dishes: new Set() };
          if (scalable) entry.qty += p.qty * factor * (p.unit === 'tbsp' ? 3 : 1);
          entry.dishes.add(dish.name);
          items.set(key, entry);
          }
        }
      }
    }
  }

  // If the same thing appears both with and without an amount, keep the amount.
  for (const e of [...items.values()]) {
    if (!e.counted && [...items.values()].some((o) => o !== e && o.counted && o.name === e.name)) {
      const withAmount = [...items.values()].find((o) => o !== e && o.counted && o.name === e.name);
      e.dishes.forEach((d) => withAmount.dishes.add(d));
      items.delete(e.key);
    }
  }

  // One row per ingredient, even when recipes measure it differently ("300 g + 1 cup curd").
  const byName = new Map();
  for (const e of items.values()) {
    const row = byName.get(e.name) ?? { key: e.name, name: e.name, amounts: [], dishes: new Set() };
    if (e.counted) row.amounts.push(amountText(e.qty, e.unit));
    e.dishes.forEach((d) => row.dishes.add(d));
    byName.set(e.name, row);
  }
  const grouped = new Map();
  for (const row of byName.values()) {
    const cat = categoryOf(row.name);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push({ key: row.key, name: row.name, amount: row.amounts.join(' + '), dishes: [...row.dishes] });
  }
  const order = [...CATEGORIES.map(([c]) => c), 'Other'];
  const display = ['Vegetables & herbs', 'Fruit', 'Dairy', 'Pulses, grains & flours', 'Nuts & seeds', 'Spices & pantry', 'Other'];
  return display
    .filter((c) => grouped.has(c) && order.includes(c))
    .map((category) => ({ category, items: grouped.get(category).sort((a, b) => a.name.localeCompare(b.name)) }));
}
