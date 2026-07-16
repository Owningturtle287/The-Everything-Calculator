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
    if (field.time12) values[`${field.id}Period`] = field.periodDefault || 'am';
  }
  return values;
}

const temperature = calculator.UNIT_TOOLS.find((tool) => tool.id === 'unit-temperature');
assert.ok(Math.abs(calculator.convertUnit(temperature, 0, 0, 1).value - 32) < 1e-10);
assert.ok(Math.abs(calculator.convertUnit(temperature, 100, 0, 1).value - 212) < 1e-10);
assert.equal(calculator.ALL_TOOLS.length, 92);
assert.equal(calculator.VERSION, '1.0.3');

const time = calculator.UNIT_TOOLS.find((tool) => tool.id === 'unit-time');
assert.ok(time.units.some((unit) => unit.symbol === 'cal yr'));
assert.ok(time.units.some((unit) => unit.symbol === 'Julian yr'));
const speed = calculator.UNIT_TOOLS.find((tool) => tool.id === 'unit-speed');
assert.ok(speed.units.some((unit) => unit.symbol === 'km/s'));
assert.ok(speed.units.some((unit) => unit.symbol === 'mi/s'));

const badges = calculator.ALL_TOOLS.map(calculator.toolBadge);
assert.equal(new Set(badges).size, badges.length, 'toolbox badges must be unique');

const mortgage = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-mortgage-payment');
const mortgageResult = mortgage.calculate({
  homePrice: 400000, downPayment: 80000, rate: 6.5, years: 30,
  propertyTax: 4800, insurance: 1800, pmiRate: 0.5, hoa: 0,
});
assert.ok(mortgageResult.primary > 2000 && mortgageResult.primary < 3000);

const elementShape = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-element-shape');
const aluminumCube = elementShape.calculate(defaultsFor(elementShape));
assert.ok(Math.abs(aluminumCube.primary - 1000) < 1e-10, '10 cm cube should have 1,000 cm³ volume');
assert.ok(Math.abs(aluminumCube.details.find((detail) => detail.label === 'Mass' && detail.suffix === ' g').value - 2700) < 1e-10);

const triangle = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-triangle');
const triangleResult = triangle.calculate(defaultsFor(triangle));
assert.ok(Math.abs(triangleResult.primary - 6) < 1e-8, 'default 3-4-5 triangle area');

const currency = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-currency');
assert.equal(currency.asyncType, 'currency');

const bmi = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-bmi');
const imperialBmi = bmi.calculate({ system: 'imperial', weight: 180, height: 70 });
assert.equal(imperialBmi.details.find((detail) => detail.label === 'Height').value, '5 ft 10 in');

const polygon = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-regular-polygon');
assert.equal(polygon.calculate({ sides: 12, length: 5 }).details[0].value, 'Dodecagon');

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
assert.match(index, /<small class="version-label">v1\.0\.3<\/small>/);
assert.match(index, /<svg class="toolbox-icon"[^>]*><path/);
assert.match(index, /id="expressionInput"[^>]*inputmode="none"[^>]*readonly[^>]*hidden/);
assert.doesNotMatch(index, /Ready for anything|Use the keypad and watch/);
assert.match(styles, /touch-action:\s*manipulation/);
assert.match(styles, /width:\s*min\(540px,/);
assert.match(worker, /everything-calculator-v1\.0\.3/);

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
