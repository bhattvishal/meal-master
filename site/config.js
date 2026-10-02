// The address of the Meal Master Worker on Cloudflare, which reads the meal plan from Notion live.
// After deploying the Worker (README → "Cloudflare Worker"), paste its URL here.
const MEAL_API = 'https://meal-master.YOUR-SUBDOMAIN.workers.dev';

// Loaded by the page and by the service worker. Local testing only: on a localhost page,
// ?api=http://127.0.0.1:8787 points the app at `wrangler dev` (remembered until cleared).
self.MEAL_API = (() => {
  try {
    if (/^(localhost|127\.0\.0\.1)$/.test(self.location.hostname) && typeof localStorage !== 'undefined') {
      const fromUrl = new URLSearchParams(self.location.search).get('api');
      if (fromUrl) localStorage.setItem('mealApiDev', fromUrl);
      return localStorage.getItem('mealApiDev') || MEAL_API;
    }
  } catch { /* storage blocked */ }
  return MEAL_API;
})();
