// One meal on WhatsApp (Meta Cloud API, graph.facebook.com), sent from the app's WhatsApp button.
//
// The approved template (WhatsApp Manager → Message templates), in WA_TEMPLATE / WA_LANG:
//   Header: Image
//   Body:   Today's Meal
//           {{1}}
//
//           Main: {{2}}
//           Sides: {{3}}
//           Instructions: {{4}}
//
//           Tap below for the full recipe.
//   Button: Visit website, dynamic URL https://bhattvishal.github.io/meal-master/?m={{1}}
//
// The header image is the meal collage the app draws and sends with the request.

import { ApiError } from './notion.js';
import { daysBetween } from './data.js';
import { istToday, SLOTS } from './schedule.js';

const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

// WhatsApp rejects template values with line breaks, tabs or more than 4 spaces in a row.
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const dishLabel = (d) => `${d.emoji || '🍽️'} ${d.names.en}`;

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE VARIABLES: the one place to edit if the template changes.
// Returns the body values in {{1}}, {{2}}, … order. WhatsApp rejects empty values, so
// anything missing is "—".
//
// `meal` is { date, meal: 'breakfast'|'lunch'|'dinner'|'snack', main: [dish], sides: [dish],
// notes }, and each dish has emoji and names.en/.hi/.mr.
export function templateParams(meal) {
  return [
    SLOT_LABEL[meal.meal] ?? meal.meal, // {{1}} Breakfast, Lunch or Dinner
    meal.main.map(dishLabel).join(' • ') || '—', // {{2}} 🫓 Paneer Wrap
    meal.sides.map(dishLabel).join(' • ') || '—', // {{3}} 🍚 Plain Rice • 🥣 Dal Fry (Toor)
    oneLine(meal.notes) || '—', // {{4}} instructions, optional
  ].map(oneLine);
}

// The template body with the values filled in, as the cook will read it.
export const renderText = (p) => `Today's Meal\n${p[0]}\n\nMain: ${p[1]}\nSides: ${p[2]}\nInstructions: ${p[3]}\n\nTap below for the full recipe.`;
// ─────────────────────────────────────────────────────────────────────────────

export const recipients = (env) => String(env.WA_TO ?? '').split(',').map((n) => n.replace(/[^\d]/g, '')).filter(Boolean);
const mask = (n) => (n.length > 4 ? `${'•'.repeat(n.length - 4)}${n.slice(-4)}` : n);
// 919812345678 -> +91 98123 45678
export const pretty = (n) => (n.length === 12 && n.startsWith('91') ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : `+${n}`);

const graph = (env) => `${env.WA_API_BASE || 'https://graph.facebook.com'}/${env.WA_API_VERSION || 'v26.0'}`;
const siteUrl = (env) => (env.SITE_URL || 'https://bhattvishal.github.io/meal-master/').replace(/\/?$/, '/');

export function missingConfig(env) {
  return ['WA_TOKEN', 'WA_PHONE_ID', 'WA_TEMPLATE', 'WA_TO'].filter((k) => !env[k]);
}

function components(env, { date, meal }, params, header) {
  return [
    { type: 'header', parameters: [header] },
    { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
    ...(env.WA_BUTTON === 'none' ? [] : [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: `${date}-${meal}` }] }]),
  ];
}

function payload(env, to, meal, params, header) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: env.WA_TEMPLATE, language: { code: env.WA_LANG || 'en' }, components: components(env, meal, params, header) },
  };
}

async function loadMeal(env, date, slot, origin) {
  const [day] = await daysBetween(env, date, date, origin);
  const meal = day.meals[slot];
  if (!meal || ![...meal.main, ...meal.sides].length) throw new ApiError(404, 'no_meal', `Nothing is planned for ${slot} on ${date}.`);
  return meal;
}

// What a meal's message would look like, for each planned meal of a day. Numbers are masked.
export async function preview(env, origin, date = istToday()) {
  const [day] = await daysBetween(env, date, date, origin);
  const to = recipients(env);
  const messages = SLOTS.filter((s) => day.meals[s]).map((slot) => {
    const meal = day.meals[slot];
    const params = templateParams(meal);
    const header = { type: 'image', image: { link: '(the collage the app sends)' } };
    return { meal: slot, params, text: renderText(params), payloads: to.map((n) => payload(env, mask(n), meal, params, header)) };
  });
  return { date, template: env.WA_TEMPLATE || null, lang: env.WA_LANG || 'en', recipients: to.map(mask), ready: !missingConfig(env).length, messages };
}

// Uploads the collage to WhatsApp and returns its media id.
async function uploadImage(env, bytes) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'image/jpeg');
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'meal.jpg');
  const res = await fetch(`${graph(env)}/${env.WA_PHONE_ID}/media`, { method: 'POST', headers: { Authorization: `Bearer ${env.WA_TOKEN}` }, body: form });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.id) throw new ApiError(502, 'whatsapp_upload_failed', out.error?.message || `Upload failed (${res.status}).`);
  return out.id;
}

const MAX_IMAGE = 5 * 1024 * 1024; // WhatsApp's limit for image headers

function decodeImage(dataUrl) {
  if (dataUrl == null) return null;
  const m = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new ApiError(400, 'bad_image', 'image must be a data:image/jpeg;base64 URL.');
  const bin = atob(m[1]);
  if (bin.length > MAX_IMAGE) throw new ApiError(400, 'image_too_large', 'The collage is over WhatsApp\'s 5 MB limit.');
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// Sends one meal to everyone in WA_TO. `image` is the app's collage as a JPEG data URL; without
// one, the header uses the Meal Master card from the site.
export async function sendMeal(env, { date, meal: slot, image }, origin) {
  const missing = missingConfig(env);
  if (missing.length) throw new ApiError(503, 'whatsapp_not_configured', `Set ${missing.join(', ')} in the Worker (see README → WhatsApp).`);
  const bytes = decodeImage(image);
  const meal = await loadMeal(env, date, slot, origin);
  const params = templateParams(meal);
  const header = bytes
    ? { type: 'image', image: { id: await uploadImage(env, bytes) } }
    : { type: 'image', image: { link: `${siteUrl(env)}icons/meal-card.png` } };

  const sent = [];
  const failed = [];
  for (const n of recipients(env)) {
    const res = await fetch(`${graph(env)}/${env.WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(env, n, meal, params, header)),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok) sent.push(pretty(n));
    else failed.push({ to: pretty(n), error: out.error?.error_data?.details || out.error?.message || `HTTP ${res.status}` });
  }
  if (!sent.length) throw new ApiError(502, 'whatsapp_failed', failed.map((f) => `${f.to}: ${f.error}`).join('; '));
  return { ok: true, date, meal: slot, sent, failed, text: renderText(params) };
}
