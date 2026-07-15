# The Everything Calculator — Web

A responsive, dependency-free HTML clone of The Everything Calculator 1.0.2. It includes a live scientific expression engine, native MathML formula layout, 34 conversion families, 58 practical calculators, light/dark/system themes, favorites, local history, bundled icons, and offline PWA support.

## Version 1.0.2 highlights

- Wide animated top-drop toolbox and a thinner sticky header
- Bottom Basic/Scientific switch and a 30-key scientific panel
- Four user-selected favorite slots and manual tool-history saves
- Blank tool inputs with example placeholders
- Loan down payments and a mortgage/escrow/PMI/HOA estimator
- Metric/US choices for fuel, health, paint, pace, mileage, and related tools
- All 118 elements in the Element to Shape mass/weight calculator
- Two-decimal money and decimal precision choices from 1 through 15

## Run locally

No build step is required. Serve the folder from any static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Opening `index.html` directly also works, except browser service workers require HTTP or HTTPS.

## Test

```bash
npm test
```

The tests use only Node’s built-in modules and cover expression parsing, formula operations, unit offsets, every catalog tool’s defaults, and the expected tool count.

## Deploy to GitHub Pages

1. Put this folder at the repository root (or select it as the Pages source).
2. In GitHub, open **Settings → Pages**.
3. Deploy from your main branch and the folder containing `index.html`.

All production assets are local. There are no CDN, font, analytics, or API dependencies.

## Extend the catalog

- Unit families live in `UNIT_TOOLS` inside `app.js`.
- Practical calculators live in the category arrays in `app.js`.
- Add the tool to `TOOL_CATEGORIES`; search and the right-side drawer update automatically.
- Increment `CACHE_NAME` in `service-worker.js` after changing production assets so installed copies refresh cleanly.

## Project files

- `index.html` — accessible application structure
- `styles.css` — responsive light/dark design system
- `app.js` — parser, catalog, calculations, settings, history, and UI logic
- `element-data.js` — 118-element reference-density catalog
- `manifest.webmanifest` / `service-worker.js` — installable offline app shell
- `assets/` — custom logo, SVG icon sprite, and install icons
- `tests/` — dependency-free smoke and catalog tests

Element names and density references were checked against the [PubChem periodic table](https://pubchem.ncbi.nlm.nih.gov/periodic-table/) and [NIST periodic table](https://www.nist.gov/pml/periodic-table-elements). Density varies with state, temperature, pressure, purity, and allotrope; gases and theoretical values are labeled in the app.
