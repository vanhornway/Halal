# HalalFinder — Bay Area

A static web app for discovering halal restaurants across the Bay Area. No backend required — just upload to any static host (GitHub Pages, Netlify, Vercel, etc.).

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell and layout |
| `styles.css` | All styling and responsive rules |
| `script.js` | App logic — filtering, map, modals |
| `restaurants.json` | Restaurant data (185 listings) |

## How halal status works

Halal status is read **directly from the `halal_status` field in `restaurants.json`**. There is no inference or scoring logic. Possible values:

| Value | Badge colour |
|-------|-------------|
| `Full Halal` | Green |
| `Partial Halal` | Yellow |
| anything else / missing | Blue — "Ask for options" |

To update a restaurant's status, edit its `halal_status` field in `restaurants.json`.

## Updating the data

The `restaurants.json` is generated from `Halal_Bay.xlsx`. To refresh it:

1. Update the spreadsheet
2. Re-run the conversion script (or regenerate via Claude)
3. Replace `restaurants.json` in this repo

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository
2. Go to **Settings → Pages**
3. Set source to `main` branch, `/ (root)`
4. Your app will be live at `https://<username>.github.io/<repo>/`

## Local development

No build step needed. Just serve the folder with any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
