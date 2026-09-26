#!/usr/bin/env node
// Sends today's meals to everyone in the Notion "WhatsApp Recipients" database, one WhatsApp
// message per meal, through CallMeBot (https://www.callmebot.com/blog/free-api-whatsapp-messages/).
// Reads site/data/meals.json, so run scripts/sync-notion.mjs first.
//
// Env: NOTION_TOKEN, NOTION_WHATSAPP_DB
// Optional: SITE_URL, MEAL_DATE (YYYY-MM-DD, default today in India), DRY_RUN=1 to print instead of send.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setLang, locale, t, unit, dishText } from '../site/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { NOTION_TOKEN, NOTION_WHATSAPP_DB } = process.env;
const SITE_URL = (process.env.SITE_URL || 'https://bhattvishal.github.io/meal-master/').replace(/\/?$/, '/');
const DRY_RUN = process.env.DRY_RUN === '1';
const PAUSE_MS = 4000; // CallMeBot asks for messages not to be sent back to back.

const LANG_CODES = { English: 'en', Hindi: 'hi', Marathi: 'mr' };
const SLOT_ORDER = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };
const SLOT_EMOJI = { breakfast: '🌅', lunch: '🍱', snack: '🥜', dinner: '🌙' };

const indiaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

async function recipients() {
  if (!NOTION_TOKEN || !NOTION_WHATSAPP_DB) throw new Error('NOTION_TOKEN and NOTION_WHATSAPP_DB must be set.');
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_WHATSAPP_DB}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { property: 'Active', checkbox: { equals: true } }, page_size: 100 }),
  });
  if (!res.ok) throw new Error(`Notion query failed: ${res.status} ${await res.text()}`);
  const plain = (rich = []) => rich.map((r) => r.plain_text).join('').trim();
  return (await res.json()).results
    .map((p) => ({
      name: plain(p.properties.Name?.title),
      phone: (p.properties.Phone?.phone_number ?? '').replace(/[^\d+]/g, ''),
      key: plain(p.properties['CallMeBot key']?.rich_text),
      lang: LANG_CODES[p.properties.Language?.select?.name] ?? 'en',
    }))
    .filter((r) => {
      if (r.phone && r.key) return true;
      console.warn(`Skipping "${r.name}": phone number or CallMeBot key is missing.`);
      return false;
    });
}

function mealMessage(meal, dishes, date) {
  const all = [...meal.main, ...meal.sides].map((id) => dishes[id]).filter(Boolean);
  if (!all.length) return null;
  const [main, ...sides] = all;
  const total = (k) => {
    const vals = all.map((d) => d.nutrition?.[k]).filter((v) => typeof v === 'number');
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0)) : null;
  };
  const protein = total('protein');
  const kcal = total('calories');
  const day = new Date(`${date}T00:00:00`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const lines = [
    `${SLOT_EMOJI[meal.meal] ?? '🍽️'} *${t(meal.meal)}*${meal.time ? ` · ${meal.time}` : ''}`,
    day,
    '',
    `*${dishText(main, 'name')}*`,
    sides.length ? `${t('with')} ${sides.map((d) => dishText(d, 'name')).join(', ')}` : null,
    [protein != null ? `💪 ${protein} ${t('gProtein')}` : null, kcal != null ? `🔥 ${kcal} ${unit('kcal')}` : null].filter(Boolean).join(' · ') || null,
    meal.notes ? `📝 ${meal.notes}` : null,
    '',
    `${t('viewRecipe')} ${SITE_URL}#/meal/${date}/${meal.meal}`,
  ];
  return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function send(to, text) {
  if (DRY_RUN) {
    console.log(`--- to ${to.name} (${to.lang}) ---\n${text}\n`);
    return;
  }
  const qs = new URLSearchParams({ phone: to.phone, text, apikey: to.key });
  const res = await fetch(`https://api.callmebot.com/whatsapp.php?${qs}`);
  const body = await res.text();
  if (!res.ok || /error|invalid/i.test(body)) throw new Error(`CallMeBot ${res.status}: ${body.replace(/<[^>]*>/g, ' ').trim().slice(0, 200)}`);
}

async function main() {
  const date = process.env.MEAL_DATE || indiaToday();
  const data = JSON.parse(await readFile(join(ROOT, 'site', 'data', 'meals.json'), 'utf8'));
  const meals = data.meals
    .filter((m) => m.date === date)
    .sort((a, b) => (SLOT_ORDER[a.meal] ?? 9) - (SLOT_ORDER[b.meal] ?? 9) || (a.time ?? '').localeCompare(b.time ?? ''));
  const people = await recipients();
  console.log(`${meals.length} meals on ${date}, ${people.length} recipients.`);
  if (!meals.length || !people.length) return;

  let failures = 0;
  for (const person of people) {
    setLang(person.lang);
    for (const meal of meals) {
      const text = mealMessage(meal, data.dishes, date);
      if (!text) continue;
      try {
        await send(person, text);
        console.log(`Sent ${meal.meal} to ${person.name}.`);
      } catch (err) {
        failures++;
        console.error(`Could not send ${meal.meal} to ${person.name}: ${err.message}`);
      }
      if (!DRY_RUN) await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
