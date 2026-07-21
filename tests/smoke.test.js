'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const calculator = require('../app.js');

const expressionCases = [
  ['2*(8+4)', 24],
  ['sqrt(81)+3^2', 18],
  ['sin(30)', .5],
  ['2pi', 2 * Math.PI],
  ['-2^2', -4],
  ['5!', 120],
  ['50%', .5],
  ['1/4+1/4', .5],
];

for (const [expression, expected] of expressionCases) {
  const actual = calculator.calculateExpression(expression, { angle: 'deg' }).value;
  assert.ok(Math.abs(actual - expected) < 1e-10, `${expression}: ${actual} != ${expected}`);
}

for (const category of calculator.TOOL_CATEGORIES) {
  for (const tool of category.tools) {
    if (tool.kind === 'unit') {
      const result = calculator.convertUnit(tool, 1, tool.defaultFrom, tool.defaultTo);
      assert.ok(Number.isFinite(result.value), tool.id);
    } else {
      const values = defaultsFor(tool);
      if (tool.asyncType) {
        assert.equal(tool.asyncType, 'currency', tool.id);
      } else {
        assert.doesNotThrow(() => tool.calculate(values), tool.id);
      }
    }
  }
}

function defaultsFor(tool) {
  const values = Object.fromEntries(tool.fields.map((field) => [
    field.id,
    field.type === 'number' ? Number(field.default) : String(field.default),
  ]));
  for (const field of tool.fields) {
    if (field.solveToggle) values[`solve_${field.id}`] = String(Boolean(field.solveByDefault));
    if (field.type === 'time12') values[`${field.id}Period`] = field.periodDefault || 'am';
  }
  return values;
}

const temperature = calculator.UNIT_TOOLS.find((tool) => tool.id === 'unit-temperature');
assert.ok(Math.abs(calculator.convertUnit(temperature, 0, 0, 1).value - 32) < 1e-10);
assert.ok(Math.abs(calculator.convertUnit(temperature, 100, 0, 1).value - 212) < 1e-10);
assert.equal(calculator.ALL_TOOLS.length, 130);
assert.equal(calculator.VERSION, '1.0.11');
assert.equal(calculator.TOOL_CATEGORIES.length, 12);
const catalogIds = calculator.TOOL_CATEGORIES.flatMap((category) =>
  category.subcategories.flatMap((subcategory) => subcategory.tools.map((tool) => tool.id)));
assert.deepEqual(catalogIds, calculator.ALL_TOOLS.map((tool) => tool.id));
assert.equal(new Set(catalogIds).size, 130);
const economicsCategory = calculator.TOOL_CATEGORIES.find((category) => category.id === 'finance');
const academicsCategory = calculator.TOOL_CATEGORIES.find((category) => category.id === 'academics');
const culinaryCategory = calculator.TOOL_CATEGORIES.find((category) => category.id === 'culinary');
const everydayConversions = calculator.TOOL_CATEGORIES.find((category) => category.id === 'conversions');
const scienceConversions = calculator.TOOL_CATEGORIES.find((category) => category.id === 'science-conversions');
const timeDatesCategory = calculator.TOOL_CATEGORIES.find((category) => category.id === 'time-dates');
assert.equal(economicsCategory.title, 'Economics');
assert.deepEqual(academicsCategory.tools.map((tool) => tool.id), [
  'calc-ratio-scale', 'calc-gcd-lcm', 'calc-decimal-fraction', 'calc-combinations', 'calc-permutations',
]);
assert.deepEqual(culinaryCategory.tools.map((tool) => tool.id), ['unit-cooking', 'calc-recipe-scale']);
assert.ok(everydayConversions.tools.some((tool) => tool.id === 'calc-shoe-size'));
assert.ok(everydayConversions.tools.some((tool) => tool.id === 'calc-clothing-size'));
assert.ok(everydayConversions.tools.some((tool) => tool.id === 'calc-ring-size'));
assert.ok(everydayConversions.tools.some((tool) => tool.id === 'calc-paper-size'));
assert.ok(everydayConversions.tools.some((tool) => tool.id === 'unit-fuel-volume'));
assert.ok(everydayConversions.tools.some((tool) => tool.id === 'calc-map-scale'));
assert.deepEqual(scienceConversions.tools.slice(-3).map((tool) => tool.id), [
  'calc-coordinate-format', 'calc-compass-bearing', 'calc-rain-snow-water',
]);
assert.deepEqual(timeDatesCategory.tools.map((tool) => tool.id), [
  'unit-time', 'calc-time-zone', 'calc-work-time', 'calc-date-difference',
]);
assert.deepEqual(calculator.normalizeFavoriteFolders({ version: 2, folders: [] }, ['calc-bmi']), []);
assert.deepEqual(
  calculator.normalizeFavoriteFolders({ version: 2, folders: [{ id: 'kept', name: 'Kept', parentId: null, toolIds: [] }] }, ['calc-bmi']),
  [{ id: 'kept', name: 'Kept', parentId: null, toolIds: [] }],
);
const circularReferenceMatch = calculator.circularSolidProjection(.5, 1, 'cylinder', '#0a0', '#0b0', '#060');
assert.ok(Math.abs(circularReferenceMatch.width - Math.sqrt(3)) < 1e-12);
assert.equal(circularReferenceMatch.height, 2);
assert.match(circularReferenceMatch.markup(2), /stroke-dasharray="5 4"/);
const equalAxisGraph = calculator.quadraticGraphSvg({ a: 1, b: 2, c: -1 }, 4);
const gridSegments = [...equalAxisGraph.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" stroke="currentColor" stroke-opacity="\.2"/g)]
  .map((match) => match.slice(1).map(Number));
const verticalGrid = gridSegments.filter(([x1, , x2]) => Math.abs(x1 - x2) < 1e-8);
const horizontalGrid = gridSegments.filter(([, y1, , y2]) => Math.abs(y1 - y2) < 1e-8);
assert.ok(verticalGrid.length >= 2 && horizontalGrid.length >= 2);
assert.ok(Math.abs(Math.abs(verticalGrid[1][0] - verticalGrid[0][0]) - Math.abs(horizontalGrid[1][1] - horizontalGrid[0][1])) < 1e-8);
assert.match(circularReferenceMatch.markup(2), /C[^<]+C/);

const time = calculator.UNIT_TOOLS.find((tool) => tool.id === 'unit-time');
assert.ok(time.units.some((unit) => unit.symbol === 'cal yr'));
assert.ok(time.units.some((unit) => unit.symbol === 'Julian yr'));
const speed = calculator.UNIT_TOOLS.find((tool) => tool.id === 'unit-speed');
assert.ok(speed.units.some((unit) => unit.symbol === 'km/s'));
assert.ok(speed.units.some((unit) => unit.symbol === 'mi/s'));
const fuelVolume = calculator.ALL_TOOLS.find((tool) => tool.id === 'unit-fuel-volume');
assert.ok(Math.abs(calculator.convertUnit(fuelVolume, 1, 0, 1).value - 3.785411784) < 1e-12);
const inductance = calculator.ALL_TOOLS.find((tool) => tool.id === 'unit-inductance');
assert.ok(Math.abs(calculator.convertUnit(inductance, 1, 0, 2).value - 1e6) < 1e-6);
const conductivity = calculator.ALL_TOOLS.find((tool) => tool.id === 'unit-conductivity-resistivity');
assert.ok(Math.abs(calculator.convertUnit(conductivity, 2, 0, 4).value - 0.5) < 1e-12);
const angularVelocity = calculator.ALL_TOOLS.find((tool) => tool.id === 'unit-angular-velocity');
assert.ok(Math.abs(calculator.convertUnit(angularVelocity, 60, 4, 0).value - 2 * Math.PI) < 1e-10);
const concentration = calculator.ALL_TOOLS.find((tool) => tool.id === 'unit-concentration');
assert.equal(calculator.convertUnit(concentration, 1, 0, 2).value, 10000);

const shoeSize = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-shoe-size');
assert.equal(shoeSize.calculate({ profile: 'men', from: 'us', to: 'eu', size: 10 }).primary, 43);
const clothingSize = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-clothing-size');
assert.equal(clothingSize.calculate({ profile: 'women', system: 'us', size: 0 }).primary, 'XXS');
const ringSize = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-ring-size');
assert.equal(ringSize.calculate({ from: 'us', to: 'eu', size: 7, ukSize: '26' }).primary, 54.4);
const paperSize = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-paper-size');
assert.match(paperSize.calculate({ preset: 'A4', outputUnit: 'in', width: 210, height: 297, customUnit: 'mm' }).primary, /^8\.267717 × 11\.692913$/);
const mapScale = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-map-scale');
assert.equal(mapScale.calculate({ inputType: 'drawing', scale: 50000, distance: 2.5, inputUnit: 'cm', outputUnit: 'km' }).primary, 1.25);
const coordinates = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-coordinate-format');
assert.match(coordinates.calculate({ format: 'decimal', latitude: 40.7128, longitude: -74.006 }).details[0].value, /40° 42′ 46\.08″ N/);
const compass = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-compass-bearing');
assert.equal(compass.calculate({ type: 'radians', bearing: Math.PI, cardinal: '0' }).primary, 'S');
const precipitation = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-rain-snow-water');
assert.equal(precipitation.calculate({ inputType: 'rain', depth: 25, depthUnit: 'mm', area: 10, areaUnit: 'm2' }).details[1].value, 250);
const timeZone = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-time-zone');
const zoneResult = timeZone.calculate({
  date: '2026-07-21', time: '09:00', timePeriod: 'am', fromZone: 'America/Chicago',
  toZone: 'Europe/London', toZone2: 'Asia/Tokyo', toZone3: 'none',
});
assert.match(zoneResult.primary, /3:00 PM/);
assert.throws(() => timeZone.calculate({
  date: '2026-03-08', time: '02:30', timePeriod: 'am', fromZone: 'America/Chicago',
  toZone: 'UTC', toZone2: 'none', toZone3: 'none',
}), /does not exist because of a daylight-saving transition/);

const badges = calculator.ALL_TOOLS.map(calculator.toolBadge);
assert.equal(new Set(badges).size, badges.length, 'toolbox badges must be unique');

const mortgage = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-mortgage-payment');
const mortgageResult = mortgage.calculate({
  homePrice: 400000, downPayment: 80000, rate: 6.5, years: 30,
  propertyTax: 4800, insurance: 1800, pmiRate: 0.5, hoa: 0,
  extraPayment: 300, extraStartMonth: 0,
});
assert.ok(mortgageResult.primary > 2300 && mortgageResult.primary < 3300);
const lifetimeLoanCost = mortgageResult.details.find((detail) => detail.label === 'Lifetime cost of loan');
assert.ok(lifetimeLoanCost && lifetimeLoanCost.value > 400000, 'mortgage should include lifetime principal, interest, and PMI');
assert.ok(mortgageResult.details.find((detail) => detail.label === 'Interest saved').value > 0);

const creditCard = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-credit-card-payoff');
assert.ok(creditCard.calculate({ balance: 6500, apr: 22.9, payment: 250, extra: 0 }).primary > 20);
const debtStrategy = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-debt-strategy');
assert.doesNotThrow(() => debtStrategy.calculate({ balances: '2500, 7000, 12000', aprs: '18.9, 8.5, 5.9', minimums: '75, 140, 220', budget: 700 }));
const aprApy = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-apr-apy');
assert.ok(Math.abs(aprApy.calculate({ entered: 'apr', rate: 12, compounds: 12 }).primary - 12.6825030132) < 1e-8);
const roi = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-roi-cagr');
assert.equal(roi.calculate({ beginning: 10000, ending: 17500, additional: 2000, distributions: 500, years: 5 }).primary, 50);
const autoComparison = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-auto-loan-lease').calculate({
  price: 42000, down: 5000, taxRate: 7, loanApr: 6.5, loanMonths: 60, resale: 22000,
  leaseMonths: 36, leasePayment: 525, dueAtSigning: 3500, leaseFees: 1200, excessMiles: 0, milePenalty: .25,
});
assert.equal(autoComparison.details.find((detail) => detail.label === 'Comparison horizon').value, 36);
assert.ok(autoComparison.details.find((detail) => detail.label === 'Loan balance at comparison').value > 0);

const elementShape = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-element-shape');
const aluminumCube = elementShape.calculate(defaultsFor(elementShape));
assert.ok(Math.abs(aluminumCube.primary - 1000) < 1e-10, '10 cm cube should have 1,000 cm³ volume');
assert.ok(Math.abs(aluminumCube.details.find((detail) => detail.label === 'Mass' && detail.suffix === ' g').value - 2700) < 1e-10);

const triangle = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-triangle');
assert.equal(triangle.fields.some((field) => field.type === 'select' || field.solveToggle), false);
const triangleResult = triangle.calculate({
  sideA: 3, sideB: 4, sideC: 5, angleA: '', angleB: '', angleC: '',
});
assert.ok(Math.abs(triangleResult.primary - 6) < 1e-8, 'default 3-4-5 triangle area');
assert.equal(triangleResult.details.find((detail) => detail.label === 'Triangle type').value, 'Right scalene triangle');
assert.throws(() => triangle.calculate({ sideA: 3, sideB: '', sideC: '', angleA: '', angleB: '', angleC: '' }), /More data needed for triangle calculation\./);

const currency = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-currency');
assert.equal(currency.asyncType, 'currency');

(async () => {
  const urls = [];
  const quote = await calculator.fetchCurrencyQuote('USD', 'EUR', async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ date: '2026-07-16', rate: 0.91 }) };
  });
  assert.equal(quote.rate, 0.91);
  assert.match(urls[0], /^https:\/\/api\.frankfurter\.dev\/v2\/rate\/USD\/EUR$/);
  const fallbackUrls = [];
  const fallbackQuote = await calculator.fetchCurrencyQuote('USD', 'EUR', async (url) => {
    fallbackUrls.push(url);
    if (url.includes('/v2/')) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, json: async () => ({ date: '2026-07-16', rates: { EUR: 0.92 } }) };
  });
  assert.equal(fallbackQuote.rate, 0.92);
  assert.equal(fallbackUrls.length, 2);
  assert.match(fallbackUrls[1], /^https:\/\/api\.frankfurter\.dev\/v1\/latest\?from=USD&to=EUR$/);
})().catch((error) => { setImmediate(() => { throw error; }); });

const bmi = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-bmi');
const imperialBmi = bmi.calculate({ system: 'imperial', weight: 180, height: 70 });
assert.equal(imperialBmi.details.find((detail) => detail.label === 'Height').value, '5 ft 10 in');
assert.equal(imperialBmi.details.find((detail) => detail.label === 'Healthy-range upper weight').suffix, ' lb');
const macros = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-macronutrient-targets');
assert.equal(macros.calculate({ calories: 2000, protein: 30, carbs: 45, fat: 25 }).primary, 150);
const metCalories = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-met-calories');
assert.ok(Math.abs(metCalories.calculate({ system: 'metric', weight: 70, minutes: 30, activity: '7', customMet: 6 }).primary - 257.25) < 1e-10);
const vo2 = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-vo2-max');
assert.ok(vo2.calculate({ method: 'cooper', system: 'metric', distance: 2.5 }).primary > 40);
const enduranceSplits = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-endurance-splits');
assert.match(enduranceSplits.calculate({
  activity: 'running', unit: 'mi', distance: 10, minutes: 85, segments: 5, strategy: 'even',
}).details.find((detail) => detail.label === 'Target splits').value, /#1 17:00/);

const polygon = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-regular-polygon');
assert.equal(polygon.calculate({ sides: 12, length: 5 }).details[0].value, 'Dodecagon');
const quadratic = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-quadratic');
const quadraticResult = quadratic.calculate({ a: 1, b: 2, c: -1 });
assert.equal(quadraticResult.details.find((detail) => detail.label === 'Apex X coordinate').value, -1);
assert.equal(quadraticResult.details.find((detail) => detail.label === 'Apex Y coordinate').value, -2);

const dateDifference = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-date-difference');
const leapDifference = dateDifference.calculate({ start: '2024-02-28', end: '2024-03-01' });
assert.equal(leapDifference.primary, 2);
assert.ok(leapDifference.expression.includes('-'));
assert.ok(leapDifference.details.some((detail) => detail.label === 'Months (average)'));

const trip = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-trip-fuel-cost');
assert.equal(trip.calculate({ system: 'metric', distance: 500, economy: 0.08, price: 1.5 }).details[0].value, 40);

const workTime = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-work-time');
assert.equal(workTime.calculate({
  format: 'clock', startTime: '08:30', startTimePeriod: 'am',
  endTime: '05:15', endTimePeriod: 'pm', break: 30,
}).primary, '8h 15m');

const numberBase = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-number-base');
assert.ok(numberBase.calculate({ value: '1048576', from: '10', to: '2' }).details
  .some((detail) => detail.label === 'IEC binary unit value' && detail.value === '1 MiB'));

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const iconSprite = fs.readFileSync(path.join(root, 'assets/icons.svg'), 'utf8');
assert.match(index, /<small class="version-label">v1\.0\.11<\/small>/);
assert.match(index, /<svg class="toolbox-icon"[^>]*><path/);
assert.match(index, /id="expressionInput"[^>]*inputmode="none"[^>]*readonly[^>]*hidden/);
assert.doesNotMatch(index, /Ready for anything|Use the keypad and watch/);
assert.match(styles, /touch-action:\s*manipulation/);
assert.match(styles, /\.tool-drawer\s*\{[^}]*width:\s*min\(860px,/s);
assert.match(styles, /\.category-row[^}]*repeat\(4,/s);
assert.match(styles, /field-grid\.compact-date-fields/);
assert.match(styles, /quadratic-equation[^}]*white-space:\s*nowrap/s);
assert.match(styles, /graph-viewport[^}]*pinch-zoom/s);
assert.match(worker, /everything-calculator-v1\.0\.11/);
assert.match(index, /expansion-1\.0\.11\.js/);
assert.match(index, /Save Calculation/);
assert.match(index, /data-key="\/"[\s\S]*data-key="backspace"/);
assert.match(appSource, /science:\s*'rocket'/);
const scienceCategory = calculator.TOOL_CATEGORIES.find((category) => category.id === 'science');
assert.equal(scienceCategory.icon, 'rocket');
assert.ok(scienceCategory.tools.every((tool) => tool.icon === 'rocket'));
assert.match(appSource, /'calc-rectangle':\s*'A=l×w'/);
assert.match(appSource, /'calc-rectangular-prism':\s*'V=l×w×h'/);
assert.match(appSource, /Graph Resolution/);
assert.doesNotMatch(appSource, /LIVE GRAPH · 0\.2 subdivisions/);
assert.match(appSource, /data-reference-side/);
assert.match(appSource, /Red dot = parabola apex/);
assert.match(appSource, /data-category-id/);
assert.match(appSource, /subcategory-heading/);
assert.match(index, /data-action="back-from-tool"/);
assert.match(appSource, /Back to toolbox/);
assert.match(appSource, /p\.y, p\.xy, p\.xyz, p\.yz/);
assert.match(index, /id="folderBreadcrumbs"/);
assert.match(index, /id="favoriteSearch"/);
assert.match(appSource, /favoriteFolders/);
assert.match(appSource, /data-pad-key="000"/);
assert.match(index, /id="folderMoveDialog"/);
assert.match(index, /id="folderEditorDialog"/);
assert.match(index, /id="folderDeleteDialog"/);
assert.match(appSource, /data-folder-move-target/);
assert.doesNotMatch(appSource, /Choose a listed folder number/);
assert.doesNotMatch(appSource, /root\.(?:prompt|confirm)\(/);
assert.match(appSource, /label\('Leg 1 \(a\)'/);
assert.match(appSource, /function circularSolidProjection/);
assert.match(appSource, /const labelStride = Math\.max/);

for (const match of index.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  assert.ok(fs.existsSync(path.join(root, match[1])), `missing linked asset: ${match[1]}`);
}
const availableIcons = new Set([...iconSprite.matchAll(/id="icon-([^"]+)"/g)].map((match) => match[1]));
const requiredIcons = new Set([
  ...calculator.TOOL_CATEGORIES.map((category) => category.icon),
  ...calculator.ALL_TOOLS.map((tool) => tool.icon),
  ...[...index.matchAll(/icons\.svg#icon-([^"<]+)/g)].map((match) => match[1]),
  ...[...appSource.matchAll(/iconMarkup\('([^']+)'\)/g)].map((match) => match[1]),
]);
for (const icon of requiredIcons) assert.ok(availableIcons.has(icon), `missing sprite icon: ${icon}`);

console.log(`Passed ${expressionCases.length} expression cases and validated ${calculator.ALL_TOOLS.length} tools.`);
