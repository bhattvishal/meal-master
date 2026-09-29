// Tomorrow's menu on WhatsApp (Meta Cloud API, graph.facebook.com), sent by the 21:00 IST cron.
// GET /whatsapp/preview shows exactly what the cron would send, without sending.

import { daysBetween } from './data.js';
import { istToday, addDays } from './schedule.js';

const dayLabel = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('hi-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

// A dish's name in Hindi, falling back to English.
const hindi = (dish) => dish.names.hi || dish.names.en;
const namesOf = (meal) => (meal ? [...meal.main, ...meal.sides].map(hindi) : []);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE VARIABLES — the one place to edit when the WhatsApp template is approved.
// Return the body values in the template's {{1}}, {{2}}, … order. WhatsApp rejects empty
// values, so use "—" for a meal that isn't planned.
//
// `menu` is { date: 'YYYY-MM-DD', meals: { breakfast, lunch, dinner, snack } }, where each meal is
// null or { main: [dish], sides: [dish], notes, time } and each dish has names.en/.hi/.mr.
export function templateParams(menu) {
  const list = (slot) => namesOf(menu.meals[slot]).join(', ') || '—';
  return [
    dayLabel(menu.date), // {{1}} e.g. "बुधवार, 30 सितंबर"
    list('breakfast'), // {{2}}
    list('lunch'), // {{3}}
    list('dinner'), // {{4}}
  ];
}
// ─────────────────────────────────────────────────────────────────────────────

export const recipients = (env) => String(env.WA_TO ?? '').split(',').map((n) => n.replace(/[^\d]/g, '')).filter(Boolean);
const mask = (n) => (n.length > 4 ? `${'•'.repeat(n.length - 4)}${n.slice(-4)}` : n);

function payload(env, to, params) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: env.WA_TEMPLATE,
      language: { code: env.WA_LANG || 'hi' },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }],
    },
  };
}

export async function tomorrowMenu(env, origin) {
  const date = addDays(istToday(), 1);
  const [day] = await daysBetween(env, date, date, origin);
  return day;
}

// What the cron would send. Phone numbers are masked because this endpoint is public.
export async function preview(env, origin) {
  const menu = await tomorrowMenu(env, origin);
  const params = templateParams(menu);
  const to = recipients(env);
  return {
    date: menu.date,
    template: env.WA_TEMPLATE || null,
    lang: env.WA_LANG || 'hi',
    params,
    text: params.map((p, i) => `{{${i + 1}}} ${p}`).join('\n'),
    recipients: to.map(mask),
    payloads: to.map((n) => ({ ...payload(env, n, params), to: mask(n) })),
    ready: Boolean(env.WA_TOKEN && env.WA_PHONE_ID && env.WA_TEMPLATE && to.length),
  };
}

// Sends tomorrow's menu. Skips (with a log line, not an error) until WhatsApp is configured.
export async function sendTomorrow(env, origin) {
  if (!env.WA_TOKEN || !env.WA_PHONE_ID) {
    console.log('WhatsApp: WA_TOKEN or WA_PHONE_ID is not set; skipping.');
    return { skipped: true };
  }
  const to = recipients(env);
  if (!env.WA_TEMPLATE || !to.length) {
    console.log('WhatsApp: WA_TEMPLATE or WA_TO is not set; skipping.');
    return { skipped: true };
  }
  const menu = await tomorrowMenu(env, origin);
  const params = templateParams(menu);
  const version = env.WA_API_VERSION || 'v26.0';
  const failures = [];
  for (const n of to) {
    const res = await fetch(`${env.WA_API_BASE || 'https://graph.facebook.com'}/${version}/${env.WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(env, n, params)),
    });
    const body = await res.text();
    if (res.ok) console.log(`WhatsApp: sent ${menu.date} menu to ${mask(n)}`);
    else failures.push(`${mask(n)}: ${res.status} ${body.slice(0, 300)}`);
  }
  if (failures.length) throw new Error(`WhatsApp send failed for ${failures.join('; ')}`);
  return { sent: to.length, date: menu.date };
}
