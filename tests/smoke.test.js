'use strict';

const assert = require('node:assert/strict');
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
      const values = Object.fromEntries(tool.fields.map((field) => [
        field.id,
        field.type === 'number' ? Number(field.default) : String(field.default),
      ]));
      assert.doesNotThrow(() => tool.calculate(values), tool.id);
    }
  }
}

const temperature = calculator.UNIT_TOOLS.find((tool) => tool.id === 'unit-temperature');
assert.ok(Math.abs(calculator.convertUnit(temperature, 0, 0, 1).value - 32) < 1e-10);
assert.ok(Math.abs(calculator.convertUnit(temperature, 100, 0, 1).value - 212) < 1e-10);
assert.equal(calculator.ALL_TOOLS.length, 92);

const mortgage = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-mortgage-payment');
const mortgageResult = mortgage.calculate({
  homePrice: 400000, downPayment: 80000, rate: 6.5, years: 30,
  propertyTax: 4800, insurance: 1800, pmiRate: 0.5, hoa: 0,
});
assert.ok(mortgageResult.primary > 2000 && mortgageResult.primary < 3000);

const elementShape = calculator.ALL_TOOLS.find((tool) => tool.id === 'calc-element-shape');
const aluminumCube = elementShape.calculate(Object.fromEntries(elementShape.fields.map((field) => [field.id, field.type === 'number' ? Number(field.default) : String(field.default)])));
assert.ok(Math.abs(aluminumCube.primary - 2.7) < 1e-10, '10 cm aluminum cube should have 2.7 kg mass');

console.log(`Passed ${expressionCases.length} expression cases and validated ${calculator.ALL_TOOLS.length} tools.`);
