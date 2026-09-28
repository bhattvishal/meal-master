# meal-master

Meal Master is a small web app for your meal plan. It shows today's breakfast, lunch and dinner, the recipe for each dish, and the week ahead. The meals come from two Notion databases. The app is hosted on GitHub Pages and can be installed on an Android tablet as an app (a PWA).

## Pages

The app opens on **Today**. Home is one tap away in the tab bar.

| Page | Address | What it shows |
| --- | --- | --- |
| Home | `#/home` | An animated plate for today, with the protein total, what's next, and today's three meals |
| Today / Day | `#/day` or `#/day/2026-09-29` | Breakfast, lunch and dinner cards with a collage of the main dish and its sides, the nutrients, plus day totals. Each card has a share button. Swipe or use the arrow keys to change day |
| Meal | `#/meal/2026-09-29/dinner` | A header with tabs for the main dish and each side, the dish photo and details beside the recipe, the nutrition breakdown, ingredients you can tick off, and numbered steps. It can keep the screen on while you cook. The share button sends the meal on WhatsApp: one collage picture of all the dishes, the dish names and the meal's note, nothing else. **Share with recipe** adds a link that opens the meal in the app |
| Week | `#/week` | Monday to Sunday with every meal, and the week's protein and calorie totals |
| Prep | `#/prep` or `#/prep/4` | What to soak, sprout or ferment ahead for the next 2, 4 or 7 days, grouped by when to do it (tonight, tomorrow morning…), with tick boxes. The Today page shows a 🔔 chip when something is due within a day |
| Settings | `#/settings` | Language (English, हिन्दी, मराठी), number of people, light or dark look. Saved on each device |
| Shop | `#/shop` or `#/shop/2026-09-28/7` | Grocery list for the next few days, scaled for your household, grouped by aisle, with tick-off boxes and a Share button. It checks the Pantry in Notion: things you have are set aside, and anything running low is added |

## How it works

```
Notion (Dishes + Meal Schedule)
        │   every 15 minutes, on every push to master, or on demand
        ▼
GitHub Action ── scripts/sync-notion.mjs ──► site/data/meals.json + site/images/
        │
        ▼
GitHub Pages ──► the web app on your tablet (works offline)
```

The browser never talks to Notion directly. Notion doesn't allow that, and it would expose your API key. Instead, a GitHub Action reads Notion using a key kept in a GitHub secret. It writes the meals to a JSON file and downloads the photos, because Notion's photo links expire after an hour. Then it publishes the site.

## Notion setup

The databases live under the **🥗 Meal Plan** page.

**Dishes**: one row per recipe. Write the ingredients and method in the page body, using headings with bulleted lists for ingredients and numbered lists for steps.

| Property | Type | Notes |
| --- | --- | --- |
| Name | Title | |
| Type | Select | Main, Side, Snack or Drink |
| Photo | Files | Your own photo. If it's empty, the sync finds a free photo on Wikimedia Commons |
| Photo search | Text | Optional. Better search words for the stock photo |
| Protein (g), Carbs (g), Fat (g), Fibre (g), Calories (kcal) | Number | Per serving |
| Serving | Text | What one serving is, for example "2 rotis" |
| Serves | Number | How many people the recipe as written feeds. The app uses it to scale amounts and the grocery list. Leave it empty for things like flour blends |
| Prep time (min) | Number | |
| Tags | Multi-select | High protein, Vegetarian, Make ahead, Office-friendly |
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

**Pantry**: what's in the kitchen, one row per item. The Shop list reads it on every sync.

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

## One-time setup

1. **Create a Notion integration.** Go to <https://www.notion.so/profile/integrations>, create a new internal integration, and give it only "Read content". Copy its secret.
2. **Share the Meal Plan page with it.** Open 🥗 Meal Plan in Notion, then choose **⋯ → Connections → Connect to** and pick your integration. All the databases are inside that page, so they're shared too.
3. **Add the secret and IDs to GitHub.** In the repo, go to **Settings → Secrets and variables → Actions**:
   - Secret `NOTION_TOKEN`: the integration secret.
   - Variable `NOTION_DISHES_DB`: `770bc04d890a41a589192a1f8129d0ef`
   - Variable `NOTION_SCHEDULE_DB`: `fdb3d2f43eee4a739ed7d8543a4bec9d`
   - Variable `NOTION_COMBOS_DB`: `d194d343e1624d3da63e101beec3fdb7`
   - Variable `NOTION_WHATSAPP_DB`: `3cae8d845e4f4c81bb8c15073d680295` (for the morning WhatsApp messages)
   - Variable `NOTION_PANTRY_DB`: optional. The workflow uses the Pantry database (`648fbd35e45147349998edb1ba16199e`) when it isn't set
4. **Make the repo public.** GitHub Pages only works for public repos on a free account. Go to **Settings → General → Danger Zone → Change visibility**. The repo holds no secrets: the Notion key lives in GitHub Secrets.
5. **Turn on Pages.** Go to **Settings → Pages → Source** and choose **GitHub Actions**.
6. **Publish.** Merge to `master`, or run **Actions → Sync from Notion and deploy → Run workflow**. The site will be at `https://bhattvishal.github.io/meal-master/`.

Until the secrets are set, the site uses the snapshot in `site/data/meals.json`.

> GitHub Pages sites are public, even when the repo is private. Anyone with the link can see the meal data.

## Morning WhatsApp messages

Every day at 6 am India time, `.github/workflows/whatsapp.yml` sends today's meals on WhatsApp. Each person gets one message per meal (breakfast, lunch, snack, dinner), in their chosen language, with the dishes, time, protein, calories and a link to the recipe.

It sends through **WhatsApp Business (Meta Cloud API)** when the settings below exist, and falls back to [CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/) otherwise.

### WhatsApp Business setup

1. **Meta app**: at <https://developers.facebook.com>, an app with the WhatsApp use case. Under **WhatsApp → API Setup**, note the **Phone number ID** of the sending number. While using Meta's free test number, add each person in **To → Manage phone number list** (up to 5).
2. **Permanent token**: in <https://business.facebook.com/settings/system-users>, a system user with the app and the WhatsApp account assigned, and a token that never expires with `whatsapp_business_messaging` and `whatsapp_business_management`.
3. **Template**: in WhatsApp Manager → Message templates, a **Utility** template named `meal_photo` in English, Hindi and Marathi:
   - **Header: Image.** Upload any food photo as the sample. Each message sends the main dish's photo from the site, or the Meal Master card (`site/icons/meal-card.png`) when a dish has no photo or it's over WhatsApp's 5 MB limit.
   - **Body** with six blanks, filled in this order:

     | Blank | Value | Example |
     | --- | --- | --- |
     | `{{1}}` | Meal | Breakfast |
     | `{{2}}` | Time | 10:00 |
     | `{{3}}` | Main dish | Protein Curd Bowl |
     | `{{4}}` | Sides (or "—") | Seasonal Fruit |
     | `{{5}}` | Protein in grams | 25 |
     | `{{6}}` | Calories | 500 |

     English body:
     ```
     Today's meal: {{1}} at {{2}}
     *{{3}}*
     With: {{4}}
     Protein {{5}} g · {{6}} kcal
     Tap below to see the meal and recipe.
     ```
   - **Button: Visit website**, text "View meal", **Dynamic** URL `https://bhattvishal.github.io/meal-master/?m={{1}}`, sample `2026-09-29-breakfast`. The app turns `?m=2026-09-29-breakfast` into that meal's page.

   A text-only template without photo or button also works: name it `meal_update`, give it seven body blanks (the six above plus the recipe link as `{{7}}`), and set the GitHub variable `WHATSAPP_TEMPLATE_KIND` = `text`.
4. **GitHub**: secret `WHATSAPP_TOKEN`, and variables `WHATSAPP_PHONE_NUMBER_ID` and `NOTION_WHATSAPP_DB` = `3cae8d845e4f4c81bb8c15073d680295`. If the template's English was created as "English (US)", also add the variable `WHATSAPP_LANGUAGE_CODES` = `en=en_US`.

Template messages are charged by Meta per message. Check Meta's price list for India.

### Who gets the messages

In Notion, open **🥗 Meal Plan → WhatsApp Recipients** and add a row per person: Name, Phone with country code (e.g. `+919812345678`), Language, and tick **Active**. The **CallMeBot key** column is only needed when sending through CallMeBot.

### Testing

Run **Actions → Send today's meals on WhatsApp → Run workflow** with a date that has meals. Tick "dry run" to print the photo link, template values and button link in the log without sending. The log says which service it used ("sending with WhatsApp Business …").

GitHub sometimes starts scheduled runs a few minutes late, so messages may arrive shortly after 6 am.

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
NOTION_SCHEDULE_DB=fdb3d2f43eee4a739ed7d8543a4bec9d NOTION_COMBOS_DB=d194d343e1624d3da63e101beec3fdb7 \
NOTION_PANTRY_DB=648fbd35e45147349998edb1ba16199e node scripts/sync-notion.mjs
```

The sync needs Node 18 or later and no extra packages.

## Project structure

```
meal-master/
├── .github/workflows/deploy.yml   Sync from Notion and publish to GitHub Pages
├── .github/workflows/whatsapp.yml Morning WhatsApp messages
├── scripts/sync-notion.mjs        Notion → site/data/meals.json and photos
├── scripts/send-whatsapp.mjs      Sends today's meals (WhatsApp Business or CallMeBot)
├── site/                          The published web app
│   ├── index.html
│   ├── app.js                     Pages and navigation
│   ├── kitchen.js                 Scaling amounts, the grocery list and the pantry check
│   ├── prep.js                    Soak, sprout and ferment reminders
│   ├── collage.js                 The meal picture shared on WhatsApp
│   ├── i18n.js                    English, Hindi and Marathi text
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
