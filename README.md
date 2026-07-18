# The Everything Calculator — Web

A responsive, dependency-free HTML build of The Everything Calculator 1.0.5. It includes a live scientific expression engine, native MathML formula layout, 34 conversion families, 58 practical calculators, light/dark/system themes, nested favorite folders, local history, bundled icons, live reference-rate currency conversion, visual graphs/shapes, and offline PWA support for the local app shell.

## Version 1.0.5 highlights

- Half-width toolbox with protected text/icon layout and a tighter main calculator viewport
- Nameable, searchable favorite folders with nested folders, rename, move, and delete controls
- Rearranged signed-number keypad with `000`, and mortgage lifetime loan cost
- Typed reference dimensions plus shared true-scale geometry and element-shape visuals
- Corrected isometric prisms, labeled triangle sides/angles, and lighter reference labels
- Crisp, pannable/zoomable quadratic graph with 0.2 subdivisions and a marked apex
- Fully inline rocket branding for reliable GitHub Pages rendering and corrected rectangle badge

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

All interface assets are local. The optional live currency converter requests the latest available reference rate directly from `api.frankfurter.dev` and keeps a last-known quote locally; the rest of the app has no CDN, font, or analytics dependencies.

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
- `CHANGELOG.md` — versioned release notes mirrored by the in-app Change log button
- `assets/` — custom logo, SVG icon sprite, and install icons
- `tests/` — dependency-free smoke and catalog tests

Element names and density references were checked against the [PubChem periodic table](https://pubchem.ncbi.nlm.nih.gov/periodic-table/) and [NIST periodic table](https://www.nist.gov/pml/periodic-table-elements). Density varies with state, temperature, pressure, purity, and allotrope; gases and theoretical values are labeled in the app.
