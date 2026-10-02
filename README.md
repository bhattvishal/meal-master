# meal-master

Meal Master is a small web app for your meal plan. It shows today's breakfast, lunch and dinner, the recipe for each dish, and the week ahead. The meals come from Notion through a small Cloudflare Worker, so changes in Notion show up within about a minute. The app is hosted on GitHub Pages and can be installed on an Android tablet as an app (a PWA).

## Pages

The app opens on **Today**. Home is one tap away in the tab bar.

| Page | Address | What it shows |
| --- | --- | --- |
| Home | `#/home` | An animated plate for today, with the protein total, what's next, and today's three meals |
| Today / Day | `#/day` or `#/day/2026-09-29` | Breakfast, lunch and dinner cards with a collage of the main dish and its sides, the nutrients, plus day totals. Each card has a share button and a WhatsApp button. Swipe or use the arrow keys to change day |
| Meal | `#/meal/2026-09-29/dinner` | A header with tabs for the main dish and each side, the dish photo and details beside the recipe, the nutrition breakdown, ingredients you can tick off, and numbered steps. It can keep the screen on while you cook. The share button opens the phone's share sheet with a collage of the dishes, their names, the meal's note and a link to the recipe. The green WhatsApp button sends the meal to the cook through the Worker, after asking you to confirm. For the **Office Snack Box**, the page lets you pick up to 5 box fillers and one Grab and Go dish side by side, and the nutrition updates as you pick |
| Week | `#/week` | Monday to Sunday with every meal, and the week's protein and calorie totals |
| Grab and Go | `#/grab` | Quick office lunches: dishes ready in 10 minutes or less that pack well, planned or not. Tap one for its recipe. A 🔔 chip marks dishes that need soaking or sprouting ahead |
| Prep | `#/prep` or `#/prep/4` | What to soak, sprout or ferment ahead for the next 2, 4 or 7 days, grouped by when to do it (tonight, tomorrow morning…), with tick boxes. The Today page shows a 🔔 chip when something is due within a day |
| Settings | `#/settings` | Language (English, हिन्दी, मराठी), number of people, light or dark look. Saved on each device |
| Shop | `#/shop` or `#/shop/2026-09-28/7` | Grocery list for the next few days, scaled for your household, grouped by aisle, with tick-off boxes and a Share button. It checks the Pantry in Notion: things you have are set aside, and anything running low is added |

## How it works

```
Notion (Meal Schedule, Dishes, Meal Combos, Pantry)
        ▲  read live, and POST /meal writes back
        │
Cloudflare Worker (worker/) ── caches answers for about a minute
        ▲  HTTPS + CORS (only the GitHub Pages site may call it)
        │
GitHub Pages (site/) ──► the installed app on your tablet (works offline with the last menu)
```

The browser never talks to Notion directly: Notion doesn't allow that, and it would expose the key. The **Worker** holds the Notion key as a Cloudflare secret, reads the meal plan when the app asks, and answers within about a minute of any change in Notion. No deploy or sync is needed. Photos go through the Worker too, because Notion's photo links expire after an hour.

The Worker also sends a meal on WhatsApp when you tap the WhatsApp button in the app.

## Notion setup

The databases live under the **🥗 Meal Plan** page.

**Dishes**: one row per recipe. Write the ingredients and method in the page body, using headings with bulleted lists for ingredients and numbered lists for steps.

| Property | Type | Notes |
| --- | --- | --- |
| Name | Title | |
| Type | Select | Main, Side, Snack or Drink |
| Photo | Files | Your own photo, for example an AI-generated one. The app uses, in order: this column, the page cover, then the first image placed inside the dish page. Only when there's none of these does it find a free photo on Wikimedia Commons |
| Photo search | Text | Optional. Better search words for the stock photo |
| Protein (g), Carbs (g), Fat (g), Fibre (g), Calories (kcal) | Number | Per serving |
| Serving | Text | What one serving is, for example "2 rotis" |
| Serves | Number | How many people the recipe as written feeds. The app uses it to scale amounts and the grocery list. Leave it empty for things like flour blends |
| Prep time (min) | Number | |
| Tags | Multi-select | High protein, Vegetarian, Make ahead, Office-friendly, Contains egg, Grab and Go. **Grab and Go** puts a dish on the Grab and Go page; so does Office-friendly with a prep time of 10 minutes or less. The weekly plan never puts Grab and Go dishes into meals: they're for taking out |
| Nutrition source | Select | Estimated or Verified |
| Name (Hindi), Name (Marathi) | Text | Dish name in Hindi and Marathi |
| Prep ahead | Text | Optional reminders for the Prep page, one per line: `Night before: Soak rajma`, `2 nights before: Soak moong to sprout`, `Morning before: …`, `4 hours before: …`. When empty, the app finds them in the recipe (see below) |
| Serving (Hindi), Serving (Marathi) | Text | The serving text in Hindi and Marathi |

**Prep reminders from recipes**: for dishes without a Prep ahead note, the app looks for ingredients like "1 cup rajma, soaked overnight" or "soaked 4 hours", sprouts (soak whole moong two nights before, tie in a cloth the morning before), and method steps that take four hours or more, like "leave 8–12 hours until risen". Back-to-back steps are added up, so a 6-hour soak before a 12-hour ferment starts 18 hours ahead. Anything that would fall between 10 pm and 7 am moves to 9 pm the evening before.

**Meal Combos**: meals you repeat, saved once. For example, "Idli Sambar" is Idli plus Sambar and Coconut Chutney.

| Property | Type | Notes |
| --- | --- | --- |
| Name | Title | |
| Meal | Select | Breakfast, Lunch, Dinner or Snack |
| Main | Relation → Dishes | |
| Sides | Relation → Dishes | |

**Meal Schedule**: one row per meal on a specific date, or a repeat rule.

| Property | Type | Notes |
| --- | --- | --- |
| Name | Title | For example "Tuesday dinner" |
| Date | Date | |
| Meal | Select | Breakfast, Lunch, Dinner or Snack |
| Combo | Relation → Meal Combos | Pick a combo instead of Main and Sides |
| Main | Relation → Dishes | Overrides the combo's main dish if set |
| Sides | Relation → Dishes | Any number. Overrides the combo's sides if set |
| Repeat | Select | Daily, Weekdays, Weekends or Weekly (same weekday as Date). Repeats from Date onwards |
| Until | Date | Optional last day of a repeat |
| Time | Text | Optional, for example `21:30` |
| Notes | Text | Shown on the meal page |
| Planned by | Select | Me or Claude draft |

**Snack Box Fillers**: no-prep things for the Office Snack Box, one row per portion: Name, Name (Hindi), Name (Marathi), Portion, Calories, Protein, Carbs, Fat, Fibre. Tick **Default** for the fillers that start selected, and **Hide** to leave one out of the app. The Office Snack Box dish is recognised by a `## Box fillers` heading in its page; on its meal page you pick up to 5 fillers and one Grab and Go dish, and the meal's nutrition is the sum of what you picked (saved on the device, per day).

**Pantry**: what's in the kitchen, one row per item. The Shop list reads it through the Worker.

| Property | Type | Notes |
| --- | --- | --- |
| Name | Title | For example "Toor dal" |
| Aisle | Select | The same aisles as the Shop list |
| Status | Select | In stock, Running low or Out of stock |
| Quantity, Unit | Number, Select | Optional. Shown on the Shop list as "have 200 g" |
| Buy when below | Number | Optional reminder for yourself |
| Also matches | Text | Other names recipes use, comma separated. For example "coriander" on Coriander leaves, or "oil" on Cooking oil |
| Perishable, Last bought, Notes | | For your own tracking |
| Name (Hindi), Name (Marathi) | Text | |

On the Shop list, an ingredient marked **In stock** moves to "Already in your pantry" at the bottom. One marked **Running low** or **Out of stock** stays on the list with a tag, and pantry items running low that no recipe needs are added to their aisle as "Restock". Ingredients with no pantry row are listed as usual. The Pantry's **To buy** view shows everything that isn't in stock.

A normal row always wins over a repeat on the same date and meal. So to change one day of a repeating lunch, add a normal row for that day. If two repeats overlap, the one that started later wins.

The page emoji you give a dish is used as its icon until it has a photo.

**Hindi and Marathi recipes**: after the English recipe, add a heading `# हिन्दी` and write the Hindi version under it, using the same layout (`##` section headings, bullet lists for ingredients, numbered lists for steps). Do the same under `# मराठी`. Keep amounts in 0–9 digits so they can scale. When a translation is missing, the app shows the English text. Meal Combos also have Name (Hindi) and Name (Marathi) columns.

## Setup

### 1. Notion integration

1. Go to <https://www.notion.so/profile/integrations> and create an **internal integration**. Give it **Read content**, **Update content** and **Insert content** (the app's `POST /meal` changes meals). Copy its secret. Don't paste it anywhere in this repo: it goes into Cloudflare only.
2. Share the data with it: open **🥗 Meal Plan** in Notion → **•••** → **Connections** → add the integration. The databases are inside that page, so they're all shared.

### 2. Cloudflare Worker

The Worker's code is in `worker/`, with its settings in `worker/wrangler.toml`. That file has no secrets and is safe to publish.

**With wrangler** (Node 18 or later):

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put NOTION_TOKEN     # the Notion integration secret
npx wrangler secret put APP_PIN          # a PIN for changing meals from the app: use 8 or more characters
npx wrangler deploy
```

The deploy prints the Worker's address, like `https://meal-master.<your-subdomain>.workers.dev`.

**Or in the dashboard:** Cloudflare → **Workers & Pages → Create → Worker**, name it `meal-master`, then **Edit code**. Paste `worker/src/*.js` as files with the same names, keeping `index.js` as the main module, and deploy. Under **Settings → Variables and Secrets**, add the variables from the `[vars]` section of `wrangler.toml` as text, and `NOTION_TOKEN` and `APP_PIN` as secrets. No cron trigger is needed.

**Recommended: a KV namespace.** It stores parsed recipes and photo lookups between requests, so a cold Worker doesn't have to fetch every recipe from Notion again. Create it with `npx wrangler kv namespace create MEAL_KV`, or Dashboard → **Storage & Databases → KV**. Then uncomment the `[[kv_namespaces]]` block in `wrangler.toml`, paste the id (it isn't a secret) and deploy again. In the dashboard, bind it under **Settings → Bindings** as `MEAL_KV`. Without KV the Worker still works: it falls back to the Cache API and memory, and its first call after a quiet spell fills recipes over a few requests. The app retries on its own.

Settings:

| Name | Kind | What |
| --- | --- | --- |
| `NOTION_TOKEN` | secret | Notion integration secret |
| `APP_PIN` | secret | PIN the app sends as `X-App-Pin` to change meals. The Worker doesn't limit attempts, so use 8 or more characters, not a 4-digit code |
| `WA_TOKEN`, `WA_PHONE_ID` | secrets | WhatsApp Cloud API token and phone number id (optional) |
| `WA_TO` | variable, set in the dashboard | Recipient number(s) with country code, comma-separated, e.g. `919812345678`. Kept out of `wrangler.toml` so the number isn't published; `keep_vars = true` keeps it when you deploy |
| `MEAL_DS`, `DISH_DS`, `COMBO_DS`, `PANTRY_DS`, `FILLER_DS` | variables | Notion data source ids (already filled in) |
| `ALLOWED_ORIGIN` | variable | The site allowed to call the Worker: `https://bhattvishal.github.io` |
| `WA_TEMPLATE` | variable, set in the dashboard | The approved WhatsApp template's name |
| `WA_LANG` | variable | The template's language code, `en` |
| `WA_BUTTON` | variable, optional | `none` if the template has no button |
| `SCHEDULE_URL`, `PANTRY_URL`, `SITE_URL` | variables | Notion links the app shows, and the site's address |
| `STOCK_PHOTOS` | variable, optional | `0` turns off Wikimedia photos for dishes without one |

Check it: open `https://meal-master.<your-subdomain>.workers.dev/today`. An `{"error":"notion_404", "hint": …}` answer means the Meal Plan page isn't shared with the integration yet (step 1.2).

### 3. Point the app at the Worker

Put the Worker's address in `site/config.js` (`MEAL_API`) and merge to `master`. GitHub Pages publishes `site/` with `.github/workflows/deploy.yml`, which needs no secrets. The Notion and WhatsApp secrets that the old GitHub sync used (`NOTION_TOKEN`, `WHATSAPP_TOKEN`) can be deleted from the repo's **Settings → Secrets and variables → Actions**.

> GitHub Pages sites and the Worker's GET endpoints are public: anyone with the link can see the meal plan. Changing meals needs the PIN.

## Worker API

| Endpoint | What |
| --- | --- |
| `GET /today` | Breakfast, lunch, dinner and snack for today (India time) |
| `GET /day?date=YYYY-MM-DD` | The same for any date |
| `GET /week?start=YYYY-MM-DD` | Seven days from `start` |
| `GET /dish/:id` | A dish with its recipe (English, Hindi, Marathi) and the recipe as plain text |
| `POST /meal` | Change a meal's Main, Sides or Notes: `{"date","meal","main"?,"sides"?,"notes"?}` with the header `X-App-Pin`. It updates that day's normal row. If only a repeat covers the day, it adds a normal row that overrides the repeat for that day |
| `GET /whatsapp/preview?date=YYYY-MM-DD` | The WhatsApp message for each planned meal of that day (default today), as it would be sent, without sending. Numbers are masked |
| `GET /whatsapp/recipients` | Who the WhatsApp button sends to, and whether WhatsApp is set up. Needs `X-App-Pin` |
| `POST /whatsapp/send` | Sends one meal: `{"date","meal","image"?}`, where `image` is the collage as a JPEG data URL. Needs `X-App-Pin` |
| `GET /data` | Everything the app shows: meals from 14 days back to 60 ahead, their dishes and recipes, Grab and Go dishes, Snack Box Fillers, the pantry |
| `GET /photo/:id` | A dish photo, fetched fresh from Notion (or Wikimedia) each time |

Each meal says how it was resolved. A normal row for the date wins. Otherwise the most recent matching repeat applies: Daily, Weekdays (Mon–Fri), Weekends or Weekly (same weekday as its Date), from its Date until Until. A Combo supplies Main and Sides unless the row sets its own.

GET answers are cached for about 60 seconds, and `POST /meal` clears the ones it affects. Errors are JSON with a hint, e.g. `{"error":"notion_404","hint":"Share the Meal Plan page with the integration: …"}`.

**Tests:** `cd worker && npm install && npm test` runs the Worker in Cloudflare's local runtime against a fake Notion. It checks repeats and overrides, combos, photos (including images inside a page), Snack Box Fillers, the PIN, caching, CORS and sending a meal on WhatsApp.

## WhatsApp

Each meal in the app has a green WhatsApp button. Tapping it:
1. asks for the app PIN the first time (it's then saved on the device);
2. asks "Do you want to share this meal with +91 …?", with the number(s) in `WA_TO`;
3. draws the meal collage (up to 4 dishes) and sends it through the Worker, which uploads it to WhatsApp and sends your approved template.

The message looks like this:

```
[collage of the dishes]
Today's Meal
Lunch

Main: 🫓 Paneer or Chana Wrap
Sides: 🍚 Plain Rice • 🥣 Dal Fry (Toor) • 🥗 Green Salad
Instructions: Pack by 8:30
[View recipe]
```

WhatsApp doesn't allow line breaks inside a template value, so the sides share one line, separated by •. Each dish's icon is its Notion page emoji, and dish names are in English. Instructions come from the meal's Notes, and show "—" when there are none.

Setup:

1. **Meta app**: at <https://developers.facebook.com>, an app with the WhatsApp use case. Under **WhatsApp → API Setup**, pick the sending number in **From** and copy its **Phone number ID** (not the phone number, and not the WhatsApp Business Account ID). With Meta's free test number, add each recipient under **To → Manage phone number list**.
2. **Permanent token**: in <https://business.facebook.com/settings/system-users>, add a system user (Admin), assign it the app and the WhatsApp account, then **Generate new token** with no expiry and `whatsapp_business_messaging` and `whatsapp_business_management`. Save it as the `WA_TOKEN` secret, and the phone number id as `WA_PHONE_ID`.
3. **Template**: in WhatsApp Manager → **Message templates → Create template**, under the same WhatsApp account as the sending number:
   - Category **Utility**, a name such as `todays_meal`, language **English**.
   - **Header: Image.** Upload any food photo as the sample.
   - **Body**:
     ```
     Today's Meal
     {{1}}

     Main: {{2}}
     Sides: {{3}}
     Instructions: {{4}}
     ```
     Samples: `Lunch`, `🫓 Paneer Wrap`, `🍚 Plain Rice • 🥣 Dal Fry (Toor)`, `Pack by 8:30`.
   - **Button: Visit website**, text "View recipe", **Dynamic** URL `https://bhattvishal.github.io/meal-master/?m={{1}}`, sample `2026-10-05-lunch`. The app opens that meal.
4. In the Worker's dashboard settings, set `WA_TO` (e.g. `919812345678`) and `WA_TEMPLATE` (the template's name). `WA_LANG` is `en`.
5. Open `/whatsapp/preview` to check the message, then try the button on a meal.

`templateParams()` at the top of `worker/src/whatsapp.js` is the one place that fills `{{1}}`…`{{4}}`, if the template ever changes. Template messages are charged by Meta per message; check Meta's price list for India.

## Install it on your Android tablet

1. Open `https://bhattvishal.github.io/meal-master/` in Chrome.
2. Tap **⋮ → Add to home screen → Install** (or **Install app**).
3. Open **Meal Master** from the home screen. It runs full screen like an app and opens on Today. Long-press the icon for shortcuts to Home, Shop and Week.

It keeps the last menu it loaded, so it still opens without internet and says "Offline, showing the last saved menu". When a new version of the app is published, it reloads itself the next time you open it or within about 10 minutes.

## Running it locally

```bash
cd worker && npx wrangler dev                      # the Worker on http://127.0.0.1:8787 (needs worker/.dev.vars with NOTION_TOKEN=… and APP_PIN=…)
cd site && python3 -m http.server 8000             # then open http://localhost:8000/?api=http://127.0.0.1:8787
```

`?api=` works only on localhost. It points the app at your local Worker and is remembered until you clear the site's data. `worker/.dev.vars` is git-ignored.

## Project structure

```
meal-master/
├── .github/workflows/deploy.yml   Publishes site/ to GitHub Pages (no secrets)
├── worker/                        Cloudflare Worker: the API over Notion
│   ├── wrangler.toml              Worker settings (no secrets)
│   ├── src/index.js               Routes, CORS, PIN, caching
│   ├── src/data.js                Menus, recipes, photos and pantry from Notion
│   ├── src/schedule.js            Repeat and combo rules
│   ├── src/notion.js              Notion API client and page parsing
│   ├── src/whatsapp.js            A meal on WhatsApp (templateParams is the one place to edit)
│   ├── src/store.js               Response cache and stored recipes
│   └── test/                      End-to-end tests against a fake Notion
├── site/                          The published web app
│   ├── index.html
│   ├── config.js                  The Worker's address (MEAL_API)
│   ├── app.js                     Pages and navigation
│   ├── kitchen.js                 Scaling amounts, the grocery list and the pantry check
│   ├── prep.js                    Soak, sprout and ferment reminders
│   ├── collage.js                 The meal picture shared on WhatsApp
│   ├── i18n.js                    English, Hindi and Marathi text
│   ├── styles.css
│   ├── sw.js                      Offline support
│   ├── manifest.json              Makes it installable as an app
│   └── icons/
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
