# Weekwise — browser-only nutrition tracker

A client-side weekly nutrition tracker designed for mobile Safari and GitHub Pages.

## Features in this starter

- Weekly calorie and macro budgets
- Choose any weekday as the start of your nutrition week
- Daily food diary grouped into breakfast, lunch, dinner, and snacks
- Barcode lookup using Open Food Facts API v3
- Camera scanning with ZXing (requires HTTPS and camera permission)
- Manual food entry and saved previously used foods
- IndexedDB storage on the current browser/device
- JSON backup export and restore
- Responsive layout for iPhone and desktop

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Camera access may require localhost or HTTPS.

## Deploy to GitHub Pages

1. Create a GitHub repository and upload/push this project.
2. If using a project repository URL such as `https://USERNAME.github.io/REPOSITORY/`, edit `vite.config.ts` and set `base: '/REPOSITORY/'`.
3. If using `https://USERNAME.github.io/` or a custom domain at the root, keep `base: '/'`.
4. In GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
5. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys the app.

## Important data notes

- No app backend or account is used.
- Food logs and saved foods are stored in IndexedDB in the current browser profile.
- Preferences are stored in LocalStorage.
- Browser data clearing, private browsing, or device loss can erase local data.
- Export JSON backups regularly. Importing a backup replaces the current local food log and saved-food database.
- This starter does not sync data between iPhone and desktop.
- Barcode lookups require an internet connection. Product data may be incomplete; verify nutrition labels when accuracy matters.

## Nutrition data source

Barcode lookups use the Open Food Facts product endpoint:
`https://world.openfoodfacts.org/api/v3/product/{barcode}.json`

The app requests a small set of fields and caches each returned product in IndexedDB after it is logged.

## Next development steps

1. Add edit-log and edit-serving controls.
2. Add product search by name and a food detail screen.
3. Add weight tracking and weekly history charts.
4. Add optional PWA install/offline app-shell support if desired.
5. Add tests for week boundaries, backup import, and nutrition calculations.
