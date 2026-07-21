# The Everything Calculator — Web

A responsive, dependency-free HTML build of The Everything Calculator 1.0.11. It includes a live scientific expression engine, native MathML formula layout, 45 conversion families, 85 practical calculators, light/dark/system themes, nested favorite folders, local history, bundled icons, live reference-rate currency conversion, visual graphs/shapes, and offline PWA support for the local app shell.

## Version 1.0.11 highlights

- Added 10 electrical, photometric, thermal, fluid, rotational, and concentration converters
- Added nine dedicated Economics tools covering debt payoff, refinancing, vehicle comparisons, rates, investing, retirement, and inflation
- Added nine dedicated Health & fitness tools covering body composition, nutrition, hydration, training, aerobic performance, splits, and sleep
- Integrated extra-payment and early-payoff analysis into Mortgage instead of duplicating it as a separate calculator
- Integrated a height-specific healthy-weight range into BMI instead of duplicating its height and unit inputs
- Expanded the toolbox to 130 tools across 12 main categories

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

All interface assets are local. The optional live currency converter requests the latest available reference rate directly from `api.frankfurter.dev` and keeps a last-known quote locally. Time-zone conversion uses the browser's bundled IANA time-zone rules; the app has no CDN, font, or analytics dependencies.

## Extend the catalog

- Core unit families live in `UNIT_TOOLS` inside `app.js`; the 1.0.11 expansion lives in `expansion-1.0.11.js`.
- Practical calculators live in the category arrays in `app.js` and the data-driven 1.0.11 expansion.
- Add the tool to `TOOL_CATEGORIES`; search and the right-side drawer update automatically.
- Increment `CACHE_NAME` in `service-worker.js` after changing production assets so installed copies refresh cleanly.

## Project files

- `index.html` — accessible application structure
- `styles.css` — responsive light/dark design system
- `app.js` — parser, catalog, calculations, settings, history, and UI logic
- `expansion-1.0.11.js` — 1.0.11 science, Economics, and Health tool definitions
- `element-data.js` — 118-element reference-density catalog
- `manifest.webmanifest` / `service-worker.js` — installable offline app shell
- `CHANGELOG.md` — versioned release notes mirrored by the in-app Change log button
- `assets/` — custom logo, SVG icon sprite, and install icons
- `tests/` — dependency-free smoke and catalog tests

Element names and density references were checked against the [PubChem periodic table](https://pubchem.ncbi.nlm.nih.gov/periodic-table/) and [NIST periodic table](https://www.nist.gov/pml/periodic-table-elements). Density varies with state, temperature, pressure, purity, and allotrope; gases and theoretical values are labeled in the app.
