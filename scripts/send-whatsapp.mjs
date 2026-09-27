#!/usr/bin/env node
// Sends today's meals to everyone in the Notion "WhatsApp Recipients" database, one WhatsApp
// message per meal. Reads site/data/meals.json, so run scripts/sync-notion.mjs first.
//
// Two ways to send, picked automatically:
//   - WhatsApp Business (Meta Cloud API), when WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set.
//     Uses the approved template WHATSAPP_TEMPLATE (default "meal_update") in each person's language.
//   - CallMeBot otherwise, using each person's "CallMeBot key" from Notion.
//
// Env: NOTION_TOKEN, NOTION_WHATSAPP_DB
// Optional: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE, GRAPH_API_VERSION,
//           WHATSAPP_LANGUAGE_CODES (e.g. "en=en_US" if the template's English is "English (US)"),
//           SITE_URL, MEAL_DATE (YYYY-MM-DD, default today in India), DRY_RUN=1 to print instead of send.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setLang, locale, t, unit, dishText } from '../site/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { NOTION_TOKEN, NOTION_WHATSAPP_DB, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
const TEMPLATE = process.env.WHATSAPP_TEMPLATE || 'meal_update';
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v26.0';
const SITE_URL = (process.env.SITE_URL || 'https://bhattvishal.github.io/meal-master/').replace(/\/?$/, '/');
const DRY_RUN = process.env.DRY_RUN === '1';
const USE_CLOUD_API = Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
// CallMeBot asks for messages not to be sent back to back; the Cloud API only needs a short gap.
const PAUSE_MS = USE_CLOUD_API ? 500 : 4000;

const LANG_CODES = { English: 'en', Hindi: 'hi', Marathi: 'mr' };
// Template language codes, when they differ from the app's (e.g. "en=en_US,hi=hi").
const TEMPLATE_LANGS = Object.fromEntries(
  (process.env.WHATSAPP_LANGUAGE_CODES || '').split(',').map((pair) => pair.split('=').map((x) => x.trim())).filter(([a, b]) => a && b),
);
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
      if (r.phone && (USE_CLOUD_API || r.key)) return true;
      console.warn(`Skipping "${r.name}": ${r.phone ? 'CallMeBot key' : 'phone number'} is missing.`);
      return false;
    });
}

// The facts shown for one meal, in the current language.
function mealFacts(meal, dishes, date) {
  const all = [...meal.main, ...meal.sides].map((id) => dishes[id]).filter(Boolean);
  if (!all.length) return null;
  const [main, ...sides] = all;
  const total = (k) => {
    const vals = all.map((d) => d.nutrition?.[k]).filter((v) => typeof v === 'number');
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0)) : null;
  };
  return {
    slot: t(meal.meal),
    emoji: SLOT_EMOJI[meal.meal] ?? '🍽️',
    time: meal.time,
    day: new Date(`${date}T00:00:00`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }),
    main: dishText(main, 'name'),
    sides: sides.map((d) => dishText(d, 'name')),
    protein: total('protein'),
    kcal: total('calories'),
    notes: meal.notes,
    url: `${SITE_URL}#/meal/${date}/${meal.meal}`,
  };
}

// Free text for CallMeBot.
function messageText(f) {
  const lines = [
    `${f.emoji} *${f.slot}*${f.time ? ` · ${f.time}` : ''}`,
    f.day,
    '',
    `*${f.main}*`,
    f.sides.length ? `${t('with')} ${f.sides.join(', ')}` : null,
    [f.protein != null ? `💪 ${f.protein} ${t('gProtein')}` : null, f.kcal != null ? `🔥 ${f.kcal} ${unit('kcal')}` : null].filter(Boolean).join(' · ') || null,
    f.notes ? `📝 ${f.notes}` : null,
    '',
    `${t('viewRecipe')} ${f.url}`,
  ];
  return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Values for the {{1}}–{{7}} blanks of the "meal_update" template. WhatsApp rejects blanks that are
// empty or contain line breaks, tabs or more than four spaces in a row.
function templateParams(f) {
  const clean = (v) => String(v ?? '').replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, ' ').trim() || '—';
  return [f.slot, f.time, f.main, f.sides.join(', '), f.protein, f.kcal, f.url].map(clean);
}

async function sendCloudApi(to, params) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.phone.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: TEMPLATE,
        language: { code: TEMPLATE_LANGS[to.lang] ?? to.lang },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw new Error(`WhatsApp API ${res.status}: ${e.message ?? 'unknown error'}${e.code ? ` (code ${e.code})` : ''}${e.error_data?.details ? ` — ${e.error_data.details}` : ''}`);
  }
}

async function sendCallMeBot(to, text) {
  const qs = new URLSearchParams({ phone: to.phone, text, apikey: to.key });
  const res = await fetch(`https://api.callmebot.com/whatsapp.php?${qs}`);
  const body = await res.text();
  if (!res.ok || /error|invalid/i.test(body)) throw new Error(`CallMeBot ${res.status}: ${body.replace(/<[^>]*>/g, ' ').trim().slice(0, 200)}`);
}

async function send(to, facts) {
  if (USE_CLOUD_API) {
    const params = templateParams(facts);
    if (DRY_RUN) return console.log(`--- to ${to.name} (${to.lang}), template ${TEMPLATE} ---\n${params.map((p, i) => `{{${i + 1}}} ${p}`).join('\n')}\n`);
    return sendCloudApi(to, params);
  }
  const text = messageText(facts);
  if (DRY_RUN) return console.log(`--- to ${to.name} (${to.lang}) ---\n${text}\n`);
  return sendCallMeBot(to, text);
}

async function main() {
  const date = process.env.MEAL_DATE || indiaToday();
  const data = JSON.parse(await readFile(join(ROOT, 'site', 'data', 'meals.json'), 'utf8'));
  const meals = data.meals
    .filter((m) => m.date === date)
    .sort((a, b) => (SLOT_ORDER[a.meal] ?? 9) - (SLOT_ORDER[b.meal] ?? 9) || (a.time ?? '').localeCompare(b.time ?? ''));
  const people = await recipients();
  console.log(`${meals.length} meals on ${date}, ${people.length} recipients, sending with ${USE_CLOUD_API ? `WhatsApp Business (template ${TEMPLATE})` : 'CallMeBot'}.`);
  if (!meals.length || !people.length) return;

  let failures = 0;
  for (const person of people) {
    setLang(person.lang);
    for (const meal of meals) {
      const facts = mealFacts(meal, data.dishes, date);
      if (!facts) continue;
      try {
        await send(person, facts);
        if (!DRY_RUN) console.log(`Sent ${meal.meal} to ${person.name}.`);
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
