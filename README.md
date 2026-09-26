# meal-master

Meal Master is a small web app for your meal plan. It shows today's breakfast, lunch and dinner, the recipe for each dish, and the week ahead. The meals come from two Notion databases. The app is hosted on GitHub Pages and can be installed on an Android tablet as an app (a PWA).

## Pages

| Page | Address | What it shows |
| --- | --- | --- |
| Home | `#/` | An animated plate for today, with the protein total, what's next, and today's three meals |
| Day | `#/day` or `#/day/2026-09-29` | Breakfast, lunch and dinner cards with a photo, sides and nutrients, plus day totals. Swipe or use the arrow keys to change day |
| Meal | `#/meal/2026-09-29/dinner` | A large photo, the nutrition breakdown, tabs for the main dish and each side, ingredients you can tick off, and numbered steps. It can keep the screen on while you cook |
| Week | `#/week` | Monday to Sunday with every meal, and the week's protein and calorie totals |

## How it works

```
Notion (Dishes + Meal Schedule)
        │   every 3 hours, on every push to main, or on demand
        ▼
GitHub Action ── scripts/sync-notion.mjs ──► site/data/meals.json + site/images/
        │
        ▼
GitHub Pages ──► the web app on your tablet (works offline)
```

The browser never talks to Notion directly. Notion doesn't allow that, and it would expose your API key. Instead, a GitHub Action reads Notion using a key kept in a GitHub secret. It writes the meals to a JSON file and downloads the photos, because Notion's photo links expire after an hour. Then it publishes the site.

## Notion setup

Both databases live under the **🥗 Meal Plan** page.

**Dishes**: one row per recipe. Write the ingredients and method in the page body, using headings with bulleted lists for ingredients and numbered lists for steps.

| Property | Type | Notes |
| --- | --- | --- |
| Name | Title | |
| Type | Select | Main, Side, Snack or Drink |
| Photo | Files | Your own photo. If it's empty, the sync finds a free photo on Wikimedia Commons |
| Photo search | Text | Optional. Better search words for the stock photo |
| Protein (g), Carbs (g), Fat (g), Fibre (g), Calories (kcal) | Number | Per serving |
| Serving | Text | What one serving is, for example "2 rotis" |
| Prep time (min) | Number | |
| Tags | Multi-select | High protein, Vegetarian, Make ahead, Office-friendly |
| Nutrition source | Select | Estimated or Verified |

**Meal Schedule**: one row per meal on a specific date.

| Property | Type | Notes |
| --- | --- | --- |
| Name | Title | For example "Tuesday dinner" |
| Date | Date | |
| Meal | Select | Breakfast, Lunch, Dinner or Snack |
| Main | Relation → Dishes | |
| Sides | Relation → Dishes | Any number |
| Time | Text | Optional, for example `21:30` |
| Notes | Text | Shown on the meal page |

The page emoji you give a dish is used as its icon until it has a photo.

## One-time setup

1. **Create a Notion integration.** Go to <https://www.notion.so/profile/integrations>, create a new internal integration, and give it only "Read content". Copy its secret.
2. **Share the Meal Plan page with it.** Open 🥗 Meal Plan in Notion, then choose **⋯ → Connections → Connect to** and pick your integration. Both databases are inside that page, so they're shared too.
3. **Add the secret and IDs to GitHub.** In the repo, go to **Settings → Secrets and variables → Actions**:
   - Secret `NOTION_TOKEN`: the integration secret.
   - Variable `NOTION_DISHES_DB`: `770bc04d890a41a589192a1f8129d0ef`
   - Variable `NOTION_SCHEDULE_DB`: `fdb3d2f43eee4a739ed7d8543a4bec9d`
4. **Turn on Pages.** Go to **Settings → Pages → Source** and choose **GitHub Actions**.
5. **Publish.** Merge to `main`, or run **Actions → Sync from Notion and deploy → Run workflow**. The site will be at `https://bhattvishal.github.io/meal-master/`.

Until the secrets are set, the site uses the snapshot in `site/data/meals.json`.

> GitHub Pages sites are public, even when the repo is private. Anyone with the link can see the meal data.

## Install it on your Android tablet

1. Open the site in Chrome.
2. Tap **⋮ → Add to home screen → Install**.
3. Say **"Hey Google, open Meal Master"**. The app opens on the home page, which shows today's meals.

Long-press the app icon for shortcuts straight to **Today** and **Week**.

Asking the assistant for a specific day or meal doesn't work with installed web apps; it can only open the app. So the app always starts on today.

## Running it locally

```bash
cd site && python3 -m http.server 8000   # then open http://localhost:8000
```

To pull fresh data from Notion locally:

```bash
NOTION_TOKEN=secret_xxx NOTION_DISHES_DB=770bc04d890a41a589192a1f8129d0ef \
NOTION_SCHEDULE_DB=fdb3d2f43eee4a739ed7d8543a4bec9d node scripts/sync-notion.mjs
```

The sync needs Node 18 or later and no extra packages.

## Project structure

```
meal-master/
├── .github/workflows/deploy.yml   Sync from Notion and publish to GitHub Pages
├── scripts/sync-notion.mjs        Notion → site/data/meals.json and photos
├── site/                          The published web app
│   ├── index.html
│   ├── app.js                     Pages and navigation
│   ├── styles.css
│   ├── sw.js                      Offline support
│   ├── manifest.webmanifest       Makes it installable as an app
│   ├── icons/
│   └── data/meals.json            Meal data (a snapshot until the first sync)
├── LICENSE
└── README.md
```

## Contributing

Contributions are welcome:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/my-feature`).
3. Commit your changes (`git commit -m "Add my feature"`).
4. Push to your branch (`git push origin feature/my-feature`).
5. Open a pull request.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
