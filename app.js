(function (root) {
  'use strict';

  const VERSION = '1.0.11';
  const ELEMENTS = root.ElementDensityData || (typeof require === 'function' ? require('./element-data.js') : []);
  const EXPANSION_1011 = root.EverythingExpansion1011 || (typeof require === 'function' ? require('./expansion-1.0.11.js') : {
    scienceUnitTools: [], financeTools: [], healthTools: [],
  });
  const DEFAULT_SETTINGS = Object.freeze({
    theme: 'system',
    angle: 'deg',
    precision: 8,
    separators: true,
    haptics: true,
  });

  const STORAGE_KEYS = {
    settings: 'everything-calculator.settings.v1',
    history: 'everything-calculator.history.v1',
    favorites: 'everything-calculator.favorites.v1',
    favoriteFolders: 'everything-calculator.favorite-folders.v2',
  };

  const ICONS = Object.freeze({
    everyday: 'home',
    conversions: 'ruler',
    scienceConversions: 'flask',
    digital: 'code',
    finance: 'wallet',
    health: 'heart',
    geometry: 'geometry',
    math: 'calculator',
    science: 'rocket',
    academics: 'book',
    culinary: 'utensils',
    time: 'clock',
  });

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function finiteNumber(value, label) {
    const parsed = typeof value === 'number' ? value : Number(String(value).replaceAll(',', '').trim());
    if (!Number.isFinite(parsed)) throw new Error(`${label || 'Value'} must be a valid number.`);
    return parsed;
  }

  function positive(value, label, allowZero) {
    const parsed = finiteNumber(value, label);
    if (allowZero ? parsed < 0 : parsed <= 0) {
      throw new Error(`${label || 'Value'} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.`);
    }
    return parsed;
  }

  function roundTo(value, precision) {
    if (!Number.isFinite(value)) return value;
    const p = clamp(Number(precision) || 8, 1, 15);
    return Number.parseFloat(value.toPrecision(Math.min(15, Math.max(p + 2, 8))));
  }

  function trimNumber(value, precision) {
    if (!Number.isFinite(value)) return String(value);
    if (Object.is(value, -0)) value = 0;
    const p = clamp(Number(precision) || 8, 1, 15);
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e12 || abs < Math.pow(10, -Math.min(p, 6)))) {
      return value.toExponential(Math.min(p, 10)).replace(/\.0+e/, 'e').replace(/(\.\d*?[1-9])0+e/, '$1e').replace('e+', 'e');
    }
    return value.toFixed(p).replace(/\.?0+$/, '');
  }

  function formatNumber(value, settings, options) {
    const opts = options || {};
    if (!Number.isFinite(value)) return value === Infinity ? '∞' : value === -Infinity ? '−∞' : 'Not a number';
    if (Object.is(value, -0)) value = 0;
    const precision = clamp(Number(opts.precision ?? settings?.precision ?? 8), 1, 15);
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e12 || abs < Math.pow(10, -Math.min(precision, 6)))) {
      return value.toExponential(Math.min(precision, 10)).replace(/\.0+e/, 'e').replace(/(\.\d*?[1-9])0+e/, '$1e').replace('e+', 'e');
    }
    const rounded = Number(value.toFixed(precision));
    if (opts.separators === false || settings?.separators === false) return trimNumber(rounded, precision);
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: precision,
      useGrouping: true,
    }).format(rounded);
  }

  function formatMoney(value, settings) {
    if (!Number.isFinite(Number(value))) return String(value);
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: settings?.separators !== false,
    }).format(Number(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeExpression(expression) {
    return String(expression || '')
      .replaceAll('×', '*')
      .replaceAll('÷', '/')
      .replaceAll('−', '-')
      .replaceAll('π', 'pi')
      .replaceAll('√', 'sqrt')
      .replace(/\s+/g, ' ')
      .trim();
  }

  class ExpressionError extends Error {
    constructor(message, position) {
      super(message);
      this.name = 'ExpressionError';
      this.position = position;
    }
  }

  class Tokenizer {
    constructor(input) {
      this.input = normalizeExpression(input);
      this.index = 0;
      this.current = null;
      this.next();
    }

    next() {
      const input = this.input;
      while (this.index < input.length && /\s/.test(input[this.index])) this.index += 1;
      if (this.index >= input.length) {
        this.current = { type: 'eof', value: '', position: this.index };
        return this.current;
      }

      const start = this.index;
      const character = input[this.index];
      if (/[0-9.]/.test(character)) {
        const match = input.slice(this.index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
        if (!match) throw new ExpressionError('Invalid number.', start);
        this.index += match[0].length;
        this.current = { type: 'number', value: match[0], position: start };
        return this.current;
      }

      if (/[a-z_]/i.test(character)) {
        const match = input.slice(this.index).match(/^[a-z_][a-z0-9_]*/i);
        this.index += match[0].length;
        this.current = { type: 'identifier', value: match[0].toLowerCase(), position: start };
        return this.current;
      }

      if ('+-*/^%!(),'.includes(character)) {
        this.index += 1;
        this.current = { type: 'operator', value: character, position: start };
        return this.current;
      }

      throw new ExpressionError(`Unexpected character “${character}”.`, start);
    }

    match(value) {
      if (this.current.value === value) {
        this.next();
        return true;
      }
      return false;
    }

    expect(value) {
      if (!this.match(value)) throw new ExpressionError(`Expected “${value}”.`, this.current.position);
    }
  }

  const FUNCTIONS = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'sqrt', 'cbrt', 'ln', 'log', 'exp', 'abs',
    'floor', 'ceil', 'round', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  ]);
  const CONSTANTS = new Set(['pi', 'e', 'ans']);

  class ExpressionParser {
    constructor(input) {
      this.tokens = new Tokenizer(input);
    }

    parse() {
      const node = this.parseExpression();
      if (this.tokens.current.type !== 'eof') {
        throw new ExpressionError(`Unexpected “${this.tokens.current.value}”.`, this.tokens.current.position);
      }
      return node;
    }

    parseExpression() {
      let node = this.parseTerm();
      while (this.tokens.current.value === '+' || this.tokens.current.value === '-') {
        const operator = this.tokens.current.value;
        this.tokens.next();
        node = { type: 'binary', operator, left: node, right: this.parseTerm() };
      }
      return node;
    }

    parseTerm() {
      let node = this.parseUnary();
      while (true) {
        if (this.tokens.current.value === '*' || this.tokens.current.value === '/') {
          const operator = this.tokens.current.value;
          this.tokens.next();
          node = { type: 'binary', operator, left: node, right: this.parseUnary() };
          continue;
        }
        if (this.isImplicitMultiplication()) {
          node = { type: 'binary', operator: '*', implicit: true, left: node, right: this.parseUnary() };
          continue;
        }
        break;
      }
      return node;
    }

    isImplicitMultiplication() {
      const token = this.tokens.current;
      return token.type === 'number' || token.type === 'identifier' || token.value === '(';
    }

    parseUnary() {
      if (this.tokens.match('+')) return { type: 'unary', operator: '+', argument: this.parseUnary() };
      if (this.tokens.match('-')) return { type: 'unary', operator: '-', argument: this.parseUnary() };
      return this.parsePower();
    }

    parsePower() {
      let node = this.parsePostfix();
      if (this.tokens.match('^')) {
        node = { type: 'binary', operator: '^', left: node, right: this.parseUnary() };
      }
      return node;
    }

    parsePostfix() {
      let node = this.parsePrimary();
      while (this.tokens.current.value === '%' || this.tokens.current.value === '!') {
        const operator = this.tokens.current.value;
        this.tokens.next();
        node = { type: 'postfix', operator, argument: node };
      }
      return node;
    }

    parsePrimary() {
      const token = this.tokens.current;
      if (token.type === 'number') {
        this.tokens.next();
        return { type: 'number', value: Number(token.value), raw: token.value };
      }

      if (token.type === 'identifier') {
        this.tokens.next();
        if (CONSTANTS.has(token.value)) return { type: 'constant', name: token.value };
        if (!FUNCTIONS.has(token.value)) throw new ExpressionError(`Unknown function or constant “${token.value}”.`, token.position);
        this.tokens.expect('(');
        const argument = this.parseExpression();
        this.tokens.expect(')');
        return { type: 'function', name: token.value, argument };
      }

      if (this.tokens.match('(')) {
        const node = this.parseExpression();
        this.tokens.expect(')');
        return { type: 'group', argument: node };
      }

      if (token.type === 'eof') throw new ExpressionError('Finish the expression to see a result.', token.position);
      throw new ExpressionError(`Expected a number or function.`, token.position);
    }
  }

  function factorial(value) {
    if (!Number.isInteger(value) || value < 0) throw new ExpressionError('Factorial is defined for non-negative whole numbers.');
    if (value > 170) throw new ExpressionError('That factorial is too large to display.');
    let result = 1;
    for (let index = 2; index <= value; index += 1) result *= index;
    return result;
  }

  function evaluateAst(node, context) {
    const angle = context?.angle || 'deg';
    const ans = Number(context?.ans || 0);
    const toRadians = (value) => angle === 'deg' ? value * Math.PI / 180 : value;
    const fromRadians = (value) => angle === 'deg' ? value * 180 / Math.PI : value;

    switch (node.type) {
      case 'number': return node.value;
      case 'constant':
        if (node.name === 'pi') return Math.PI;
        if (node.name === 'e') return Math.E;
        return ans;
      case 'group': return evaluateAst(node.argument, context);
      case 'unary': {
        const value = evaluateAst(node.argument, context);
        return node.operator === '-' ? -value : value;
      }
      case 'postfix': {
        const value = evaluateAst(node.argument, context);
        return node.operator === '%' ? value / 100 : factorial(value);
      }
      case 'binary': {
        const left = evaluateAst(node.left, context);
        const right = evaluateAst(node.right, context);
        let value;
        if (node.operator === '+') value = left + right;
        else if (node.operator === '-') value = left - right;
        else if (node.operator === '*') value = left * right;
        else if (node.operator === '/') {
          if (right === 0) throw new ExpressionError('Cannot divide by zero.');
          value = left / right;
        } else value = Math.pow(left, right);
        if (!Number.isFinite(value)) throw new ExpressionError('The result is outside the supported range.');
        return value;
      }
      case 'function': {
        const value = evaluateAst(node.argument, context);
        let result;
        switch (node.name) {
          case 'sin': result = Math.sin(toRadians(value)); break;
          case 'cos': result = Math.cos(toRadians(value)); break;
          case 'tan': result = Math.tan(toRadians(value)); break;
          case 'asin': result = fromRadians(Math.asin(value)); break;
          case 'acos': result = fromRadians(Math.acos(value)); break;
          case 'atan': result = fromRadians(Math.atan(value)); break;
          case 'sqrt':
            if (value < 0) throw new ExpressionError('Square root requires a non-negative number.');
            result = Math.sqrt(value); break;
          case 'cbrt': result = Math.cbrt(value); break;
          case 'ln':
            if (value <= 0) throw new ExpressionError('Natural logarithm requires a positive number.');
            result = Math.log(value); break;
          case 'log':
            if (value <= 0) throw new ExpressionError('Logarithm requires a positive number.');
            result = Math.log10(value); break;
          case 'exp': result = Math.exp(value); break;
          case 'abs': result = Math.abs(value); break;
          case 'floor': result = Math.floor(value); break;
          case 'ceil': result = Math.ceil(value); break;
          case 'round': result = Math.round(value); break;
          case 'sinh': result = Math.sinh(value); break;
          case 'cosh': result = Math.cosh(value); break;
          case 'tanh': result = Math.tanh(value); break;
          case 'asinh': result = Math.asinh(value); break;
          case 'acosh':
            if (value < 1) throw new ExpressionError('Inverse hyperbolic cosine requires a value of 1 or greater.');
            result = Math.acosh(value); break;
          case 'atanh':
            if (Math.abs(value) >= 1) throw new ExpressionError('Inverse hyperbolic tangent requires a value between −1 and 1.');
            result = Math.atanh(value); break;
          default: throw new ExpressionError(`Unsupported function “${node.name}”.`);
        }
        if (!Number.isFinite(result)) throw new ExpressionError('The result is outside the supported range.');
        return result;
      }
      default: throw new ExpressionError('Invalid expression.');
    }
  }

  function expressionPrecedence(node) {
    if (!node) return 0;
    if (node.type === 'binary') return node.operator === '+' || node.operator === '-' ? 1 : node.operator === '*' || node.operator === '/' ? 2 : 4;
    if (node.type === 'unary') return 3;
    if (node.type === 'postfix') return 5;
    return 6;
  }

  function astToMathML(node, parentPrecedence) {
    const precedence = expressionPrecedence(node);
    let content = '';
    switch (node.type) {
      case 'number': content = `<mn>${escapeHtml(node.raw ?? trimNumber(node.value, 10))}</mn>`; break;
      case 'constant': content = node.name === 'pi' ? '<mi>π</mi>' : node.name === 'ans' ? '<mi>Ans</mi>' : '<mi>e</mi>'; break;
      case 'group': content = `<mrow><mo>(</mo>${astToMathML(node.argument, 0)}<mo>)</mo></mrow>`; break;
      case 'unary': content = `<mrow><mo>${node.operator === '-' ? '−' : '+'}</mo>${astToMathML(node.argument, precedence)}</mrow>`; break;
      case 'postfix': content = `<mrow>${astToMathML(node.argument, precedence)}<mo>${node.operator}</mo></mrow>`; break;
      case 'function': {
        const argument = astToMathML(node.argument, 0);
        if (node.name === 'sqrt') content = `<msqrt>${argument}</msqrt>`;
        else if (node.name === 'cbrt') content = `<mroot>${argument}<mn>3</mn></mroot>`;
        else if (node.name === 'abs') content = `<mrow><mo>|</mo>${argument}<mo>|</mo></mrow>`;
        else content = `<mrow><mi mathvariant="normal">${escapeHtml(node.name)}</mi><mo>(</mo>${argument}<mo>)</mo></mrow>`;
        break;
      }
      case 'binary': {
        const left = astToMathML(node.left, precedence);
        const right = astToMathML(node.right, node.operator === '^' ? precedence - 1 : precedence);
        if (node.operator === '/') content = `<mfrac>${left}${right}</mfrac>`;
        else if (node.operator === '^') content = `<msup>${left}${right}</msup>`;
        else content = `<mrow>${left}<mo>${node.operator === '*' ? (node.implicit ? '⁢' : '×') : node.operator === '-' ? '−' : '+'}</mo>${right}</mrow>`;
        break;
      }
      default: content = '<mn>0</mn>';
    }
    return parentPrecedence && precedence < parentPrecedence ? `<mrow><mo>(</mo>${content}<mo>)</mo></mrow>` : content;
  }

  function astToLatex(node, parentPrecedence) {
    const precedence = expressionPrecedence(node);
    let content;
    switch (node.type) {
      case 'number': content = node.raw ?? trimNumber(node.value, 10); break;
      case 'constant': content = node.name === 'pi' ? '\\pi' : node.name === 'ans' ? '\\mathrm{Ans}' : 'e'; break;
      case 'group': content = `\\left(${astToLatex(node.argument, 0)}\\right)`; break;
      case 'unary': content = `${node.operator}${astToLatex(node.argument, precedence)}`; break;
      case 'postfix': content = `${astToLatex(node.argument, precedence)}${node.operator === '%' ? '\\%' : '!'}`; break;
      case 'function':
        if (node.name === 'sqrt') content = `\\sqrt{${astToLatex(node.argument, 0)}}`;
        else if (node.name === 'cbrt') content = `\\sqrt[3]{${astToLatex(node.argument, 0)}}`;
        else if (node.name === 'abs') content = `\\left|${astToLatex(node.argument, 0)}\\right|`;
        else content = `\\${node.name}\\left(${astToLatex(node.argument, 0)}\\right)`;
        break;
      case 'binary': {
        const left = astToLatex(node.left, precedence);
        const right = astToLatex(node.right, node.operator === '^' ? precedence - 1 : precedence);
        if (node.operator === '/') content = `\\frac{${left}}{${right}}`;
        else if (node.operator === '^') content = `{${left}}^{${right}}`;
        else content = `${left}${node.operator === '*' ? (node.implicit ? '\\,' : '\\times') : node.operator}${right}`;
        break;
      }
      default: content = '0';
    }
    return parentPrecedence && precedence < parentPrecedence ? `\\left(${content}\\right)` : content;
  }

  function parseExpression(expression) {
    const normalized = normalizeExpression(expression);
    if (!normalized) return { type: 'number', value: 0, raw: '0' };
    return new ExpressionParser(normalized).parse();
  }

  function calculateExpression(expression, context) {
    const ast = parseExpression(expression);
    return {
      ast,
      value: evaluateAst(ast, context || {}),
      mathML: `<math display="block">${astToMathML(ast, 0)}</math>`,
      latex: astToLatex(ast, 0),
    };
  }

  function fallbackMathML(expression) {
    const pretty = String(expression || '0')
      .replaceAll('*', ' × ')
      .replaceAll('/', ' ÷ ')
      .replaceAll('-', ' − ')
      .replace(/\bpi\b/gi, 'π');
    return `<math display="block"><mtext>${escapeHtml(pretty)}</mtext></math>`;
  }

  function unit(name, symbol, factor, offset) {
    return { name, symbol, factor, offset: offset || 0 };
  }

  function unitTool(id, title, description, units, options) {
    const opts = options || {};
    return {
      id: `unit-${id}`,
      kind: 'unit',
      title,
      shortTitle: title.replace(' converter', ''),
      description,
      icon: opts.icon || 'ruler',
      units,
      defaultFrom: opts.defaultFrom || 0,
      defaultTo: opts.defaultTo || Math.min(1, units.length - 1),
      note: opts.note || '',
      customConvert: opts.customConvert,
    };
  }

  const UNIT_TOOLS = [
    unitTool('length', 'Length converter', 'Convert metric, imperial, nautical, and astronomical distances.', [
      unit('Nanometer', 'nm', 1e-9), unit('Micrometer', 'µm', 1e-6), unit('Millimeter', 'mm', 1e-3), unit('Centimeter', 'cm', 1e-2),
      unit('Meter', 'm', 1), unit('Kilometer', 'km', 1e3), unit('Inch', 'in', 0.0254), unit('Foot', 'ft', 0.3048), unit('Yard', 'yd', 0.9144),
      unit('Mile', 'mi', 1609.344), unit('Nautical mile', 'nmi', 1852), unit('Astronomical unit', 'AU', 149597870700),
      unit('Light-year', 'ly', 9.4607304725808e15), unit('Parsec', 'pc', 3.085677581491367e16),
    ], { defaultFrom: 5, defaultTo: 9 }),
    unitTool('area', 'Area converter', 'Convert surface area from tiny metric units through acres and square miles.', [
      unit('Square millimeter', 'mm²', 1e-6), unit('Square centimeter', 'cm²', 1e-4), unit('Square meter', 'm²', 1), unit('Square kilometer', 'km²', 1e6),
      unit('Square inch', 'in²', 0.00064516), unit('Square foot', 'ft²', 0.09290304), unit('Square yard', 'yd²', 0.83612736),
      unit('Acre', 'ac', 4046.8564224), unit('Hectare', 'ha', 10000), unit('Square mile', 'mi²', 2589988.110336),
    ], { defaultFrom: 2, defaultTo: 5 }),
    unitTool('volume', 'Volume converter', 'Convert metric, US customary, imperial, and cubic volume units.', [
      unit('Milliliter', 'mL', 1e-6), unit('Liter', 'L', 0.001), unit('Cubic centimeter', 'cm³', 1e-6), unit('Cubic meter', 'm³', 1),
      unit('US teaspoon', 'tsp', 4.92892159375e-6), unit('US tablespoon', 'tbsp', 1.478676478125e-5), unit('US fluid ounce', 'fl oz', 2.95735295625e-5),
      unit('US cup', 'cup', 0.0002365882365), unit('US pint', 'pt', 0.000473176473), unit('US quart', 'qt', 0.000946352946),
      unit('US gallon', 'gal', 0.003785411784), unit('Imperial gallon', 'imp gal', 0.00454609), unit('Cubic inch', 'in³', 1.6387064e-5), unit('Cubic foot', 'ft³', 0.028316846592),
    ], { defaultFrom: 1, defaultTo: 10 }),
    unitTool('mass', 'Mass converter', 'Convert mass and weight across metric, imperial, and trade units.', [
      unit('Microgram', 'µg', 1e-9), unit('Milligram', 'mg', 1e-6), unit('Gram', 'g', 1e-3), unit('Kilogram', 'kg', 1), unit('Metric tonne', 't', 1000),
      unit('Ounce', 'oz', 0.028349523125), unit('Pound', 'lb', 0.45359237), unit('Stone', 'st', 6.35029318), unit('US short ton', 'US ton', 907.18474), unit('Imperial long ton', 'long ton', 1016.0469088),
    ], { defaultFrom: 3, defaultTo: 6 }),
    unitTool('temperature', 'Temperature converter', 'Convert Celsius, Fahrenheit, Kelvin, and Rankine with exact offsets.', [
      unit('Celsius', '°C', 1, 273.15), unit('Fahrenheit', '°F', 5 / 9, 459.67), unit('Kelvin', 'K', 1, 0), unit('Rankine', '°R', 5 / 9, 0),
    ], { defaultFrom: 0, defaultTo: 1 }),
    unitTool('time', 'Time converter', 'Convert from nanoseconds to calendar-scale time units.', [
      unit('Nanosecond', 'ns', 1e-9), unit('Microsecond', 'µs', 1e-6), unit('Millisecond', 'ms', 1e-3), unit('Second', 's', 1), unit('Minute', 'min', 60),
      unit('Hour', 'h', 3600), unit('Day', 'day', 86400), unit('Week', 'wk', 604800), unit('Fortnight', 'fn', 1209600),
      unit('Calendar year (average Gregorian)', 'cal yr', 31556952), unit('Julian year', 'Julian yr', 31557600),
    ], { defaultFrom: 5, defaultTo: 4, icon: 'clock', note: 'An average Gregorian calendar year is 365.2425 days; a Julian year is exactly 365.25 days.' }),
    unitTool('speed', 'Speed converter', 'Convert road, marine, aviation, and scientific speed units.', [
      unit('Meter per second', 'm/s', 1), unit('Kilometer per hour', 'km/h', 1 / 3.6), unit('Mile per hour', 'mph', 0.44704),
      unit('Foot per second', 'ft/s', 0.3048), unit('Kilometer per second', 'km/s', 1000), unit('Mile per second', 'mi/s', 1609.344),
      unit('Knot', 'kn', 0.514444444444), unit('Mach (standard air)', 'Mach', 343),
    ], { defaultFrom: 2, defaultTo: 1, note: 'Mach uses 343 m/s, an approximate speed of sound in dry air at 20 °C.' }),
    unitTool('cooking', 'Cooking converter', 'Convert common kitchen volume measures for recipes.', [
      unit('Milliliter', 'mL', 1e-6), unit('Liter', 'L', 0.001), unit('US teaspoon', 'tsp', 4.92892159375e-6), unit('US tablespoon', 'tbsp', 1.478676478125e-5),
      unit('US fluid ounce', 'fl oz', 2.95735295625e-5), unit('US cup', 'cup', 0.0002365882365), unit('US pint', 'pt', 0.000473176473),
      unit('US quart', 'qt', 0.000946352946), unit('US gallon', 'gal', 0.003785411784), unit('Imperial teaspoon', 'imp tsp', 5.919388020833e-6),
      unit('Imperial tablespoon', 'imp tbsp', 1.77581640625e-5), unit('Imperial cup', 'imp cup', 0.000284130625),
    ], { defaultFrom: 5, defaultTo: 0, icon: 'home', note: 'Volume-to-mass conversions depend on ingredient density and are intentionally kept separate.' }),
    unitTool('fuel-volume', 'Fuel-volume converter', 'Convert fuel quantities across US, Imperial, metric, quart, and barrel units.', [
      unit('US gallon', 'US gal', 3.785411784), unit('Liter', 'L', 1), unit('Imperial gallon', 'imp gal', 4.54609),
      unit('US liquid quart', 'US qt', 0.946352946), unit('Imperial quart', 'imp qt', 1.1365225),
      unit('US oil barrel', 'bbl', 158.987294928), unit('Cubic meter', 'm³', 1000),
    ], { defaultFrom: 0, defaultTo: 1, icon: 'fuel', note: 'The barrel result uses the standard 42-US-gallon oil barrel. Other commodity barrel definitions differ.' }),
    unitTool('pressure', 'Pressure converter', 'Convert atmospheric, metric, laboratory, and imperial pressure.', [
      unit('Pascal', 'Pa', 1), unit('Kilopascal', 'kPa', 1e3), unit('Megapascal', 'MPa', 1e6), unit('Bar', 'bar', 1e5), unit('Millibar', 'mbar', 100),
      unit('Standard atmosphere', 'atm', 101325), unit('Torr', 'Torr', 101325 / 760), unit('Millimeter of mercury', 'mmHg', 133.322387415),
      unit('Pound per square inch', 'psi', 6894.757293168), unit('Inch of mercury', 'inHg', 3386.389),
    ], { defaultFrom: 8, defaultTo: 1, icon: 'flask' }),
    unitTool('energy', 'Energy converter', 'Convert mechanical, electrical, thermal, and particle-scale energy.', [
      unit('Joule', 'J', 1), unit('Kilojoule', 'kJ', 1e3), unit('Calorie', 'cal', 4.184), unit('Kilocalorie', 'kcal', 4184),
      unit('Watt-hour', 'Wh', 3600), unit('Kilowatt-hour', 'kWh', 3.6e6), unit('British thermal unit', 'BTU', 1055.05585262),
      unit('Electronvolt', 'eV', 1.602176634e-19), unit('US therm', 'therm', 105480400), unit('Foot-pound', 'ft⋅lb', 1.3558179483314),
    ], { defaultFrom: 5, defaultTo: 3, icon: 'flask' }),
    unitTool('power', 'Power converter', 'Convert watts, horsepower, refrigeration, and thermal power.', [
      unit('Milliwatt', 'mW', 1e-3), unit('Watt', 'W', 1), unit('Kilowatt', 'kW', 1e3), unit('Megawatt', 'MW', 1e6),
      unit('Mechanical horsepower', 'hp', 745.699871582), unit('Metric horsepower', 'PS', 735.49875), unit('BTU per hour', 'BTU/h', 0.293071070172), unit('Ton of refrigeration', 'TR', 3516.85284207),
    ], { defaultFrom: 2, defaultTo: 4, icon: 'flask' }),
    unitTool('force', 'Force converter', 'Convert newtons and common gravitational force units.', [
      unit('Newton', 'N', 1), unit('Kilonewton', 'kN', 1e3), unit('Dyne', 'dyn', 1e-5), unit('Pound-force', 'lbf', 4.4482216152605),
      unit('Kilogram-force', 'kgf', 9.80665), unit('Ounce-force', 'ozf', 0.278013850953781),
    ], { defaultFrom: 0, defaultTo: 3, icon: 'flask' }),
    unitTool('angle', 'Angle converter', 'Convert turns, degrees, radians, gradians, and arc units.', [
      unit('Degree', '°', Math.PI / 180), unit('Radian', 'rad', 1), unit('Gradian', 'grad', Math.PI / 200), unit('Turn', 'turn', Math.PI * 2),
      unit('Arcminute', 'arcmin', Math.PI / 10800), unit('Arcsecond', 'arcsec', Math.PI / 648000),
    ], { defaultFrom: 0, defaultTo: 1, icon: 'geometry' }),
    unitTool('frequency', 'Frequency converter', 'Convert cycles and rotational rates from hertz through gigahertz.', [
      unit('Hertz', 'Hz', 1), unit('Kilohertz', 'kHz', 1e3), unit('Megahertz', 'MHz', 1e6), unit('Gigahertz', 'GHz', 1e9),
      unit('Revolutions per minute', 'rpm', 1 / 60), unit('Beats per minute', 'bpm', 1 / 60),
    ], { defaultFrom: 2, defaultTo: 3, icon: 'flask' }),
    unitTool('acceleration', 'Acceleration converter', 'Convert linear acceleration and standard gravity.', [
      unit('Meter per second squared', 'm/s²', 1), unit('Kilometer per hour per second', 'km/h/s', 1 / 3.6), unit('Foot per second squared', 'ft/s²', 0.3048),
      unit('Standard gravity', 'g₀', 9.80665), unit('Gal', 'Gal', 0.01),
    ], { defaultFrom: 3, defaultTo: 0, icon: 'flask' }),
    unitTool('density', 'Density converter', 'Convert density used in science, materials, and engineering.', [
      unit('Kilogram per cubic meter', 'kg/m³', 1), unit('Gram per cubic centimeter', 'g/cm³', 1000), unit('Kilogram per liter', 'kg/L', 1000),
      unit('Gram per liter', 'g/L', 1), unit('Pound per cubic foot', 'lb/ft³', 16.01846337396), unit('Pound per cubic inch', 'lb/in³', 27679.9047102),
    ], { defaultFrom: 1, defaultTo: 0, icon: 'flask' }),
    unitTool('torque', 'Torque converter', 'Convert rotational force across metric and imperial units.', [
      unit('Newton-meter', 'N⋅m', 1), unit('Kilonewton-meter', 'kN⋅m', 1e3), unit('Pound-foot', 'lbf⋅ft', 1.3558179483314),
      unit('Pound-inch', 'lbf⋅in', 0.11298482902762), unit('Kilogram-force meter', 'kgf⋅m', 9.80665),
    ], { defaultFrom: 2, defaultTo: 0, icon: 'flask' }),
    unitTool('flow', 'Flow rate converter', 'Convert liquid and gas volumetric flow rates.', [
      unit('Cubic meter per second', 'm³/s', 1), unit('Liter per second', 'L/s', 0.001), unit('Liter per minute', 'L/min', 0.001 / 60),
      unit('Cubic meter per hour', 'm³/h', 1 / 3600), unit('US gallon per minute', 'gpm', 0.003785411784 / 60), unit('Cubic foot per minute', 'cfm', 0.028316846592 / 60),
    ], { defaultFrom: 4, defaultTo: 2, icon: 'flask' }),
    unitTool('dynamic-viscosity', 'Dynamic viscosity converter', 'Convert common absolute viscosity units.', [
      unit('Pascal-second', 'Pa⋅s', 1), unit('Millipascal-second', 'mPa⋅s', 1e-3), unit('Centipoise', 'cP', 1e-3), unit('Poise', 'P', 0.1), unit('Pound per foot-second', 'lb/(ft⋅s)', 1.48816394357),
    ], { defaultFrom: 2, defaultTo: 1, icon: 'flask' }),
    unitTool('kinematic-viscosity', 'Kinematic viscosity converter', 'Convert viscosity normalized by density.', [
      unit('Square meter per second', 'm²/s', 1), unit('Square millimeter per second', 'mm²/s', 1e-6), unit('Centistokes', 'cSt', 1e-6),
      unit('Stokes', 'St', 1e-4), unit('Square foot per second', 'ft²/s', 0.09290304),
    ], { defaultFrom: 2, defaultTo: 0, icon: 'flask' }),
    unitTool('storage', 'Digital storage converter', 'Convert decimal and binary storage units, from bits to petabytes.', [
      unit('Bit', 'bit', 0.125), unit('Byte', 'B', 1), unit('Kilobyte', 'kB', 1e3), unit('Megabyte', 'MB', 1e6), unit('Gigabyte', 'GB', 1e9), unit('Terabyte', 'TB', 1e12), unit('Petabyte', 'PB', 1e15),
      unit('Kibibyte', 'KiB', 1024), unit('Mebibyte', 'MiB', 1048576), unit('Gibibyte', 'GiB', 1073741824), unit('Tebibyte', 'TiB', 1099511627776),
    ], { defaultFrom: 4, defaultTo: 9, icon: 'code', note: 'Decimal units use powers of 1,000; IEC binary units use powers of 1,024.' }),
    unitTool('data-rate', 'Data rate converter', 'Convert network and file transfer rates in bits or bytes per second.', [
      unit('Bit per second', 'bit/s', 1), unit('Kilobit per second', 'kbit/s', 1e3), unit('Megabit per second', 'Mbit/s', 1e6), unit('Gigabit per second', 'Gbit/s', 1e9),
      unit('Byte per second', 'B/s', 8), unit('Kilobyte per second', 'kB/s', 8e3), unit('Megabyte per second', 'MB/s', 8e6), unit('Gigabyte per second', 'GB/s', 8e9),
      unit('Mebibyte per second', 'MiB/s', 8 * 1048576),
    ], { defaultFrom: 2, defaultTo: 6, icon: 'code' }),
    unitTool('typography', 'Typography converter', 'Convert CSS and print sizing using a 96 dpi reference.', [
      unit('Pixel', 'px', 1), unit('Point', 'pt', 96 / 72), unit('Pica', 'pc', 16), unit('Inch', 'in', 96), unit('Centimeter', 'cm', 96 / 2.54),
      unit('Millimeter', 'mm', 96 / 25.4), unit('rem (16 px root)', 'rem', 16), unit('em (16 px context)', 'em', 16),
    ], { defaultFrom: 1, defaultTo: 0, icon: 'code', note: 'CSS assumes 96 px per inch; rem and em use a 16 px reference.' }),
    unitTool('charge', 'Electric charge converter', 'Convert coulombs, ampere-hours, and elementary charge.', [
      unit('Coulomb', 'C', 1), unit('Millicoulomb', 'mC', 1e-3), unit('Microcoulomb', 'µC', 1e-6), unit('Ampere-hour', 'Ah', 3600),
      unit('Milliampere-hour', 'mAh', 3.6), unit('Elementary charge', 'e', 1.602176634e-19),
    ], { defaultFrom: 4, defaultTo: 0, icon: 'flask' }),
    unitTool('current', 'Electric current converter', 'Convert amperes across SI prefixes.', [
      unit('Nanoampere', 'nA', 1e-9), unit('Microampere', 'µA', 1e-6), unit('Milliampere', 'mA', 1e-3), unit('Ampere', 'A', 1), unit('Kiloampere', 'kA', 1e3),
    ], { defaultFrom: 2, defaultTo: 3, icon: 'flask' }),
    unitTool('voltage', 'Voltage converter', 'Convert electric potential across SI prefixes.', [
      unit('Microvolt', 'µV', 1e-6), unit('Millivolt', 'mV', 1e-3), unit('Volt', 'V', 1), unit('Kilovolt', 'kV', 1e3), unit('Megavolt', 'MV', 1e6),
    ], { defaultFrom: 2, defaultTo: 1, icon: 'flask' }),
    unitTool('resistance', 'Resistance converter', 'Convert electrical resistance across SI prefixes.', [
      unit('Microohm', 'µΩ', 1e-6), unit('Milliohm', 'mΩ', 1e-3), unit('Ohm', 'Ω', 1), unit('Kiloohm', 'kΩ', 1e3), unit('Megaohm', 'MΩ', 1e6), unit('Gigaohm', 'GΩ', 1e9),
    ], { defaultFrom: 3, defaultTo: 2, icon: 'flask' }),
    unitTool('capacitance', 'Capacitance converter', 'Convert farads and common electronic component units.', [
      unit('Picofarad', 'pF', 1e-12), unit('Nanofarad', 'nF', 1e-9), unit('Microfarad', 'µF', 1e-6), unit('Millifarad', 'mF', 1e-3), unit('Farad', 'F', 1),
    ], { defaultFrom: 2, defaultTo: 1, icon: 'flask' }),
    unitTool('illuminance', 'Illuminance converter', 'Convert light incident on a surface.', [
      unit('Lux', 'lx', 1), unit('Foot-candle', 'fc', 10.7639104167), unit('Phot', 'ph', 10000), unit('Nox', 'nx', 0.001),
    ], { defaultFrom: 1, defaultTo: 0, icon: 'flask' }),
    unitTool('radioactivity', 'Radioactivity converter', 'Convert radioactive decay rates.', [
      unit('Becquerel', 'Bq', 1), unit('Kilobecquerel', 'kBq', 1e3), unit('Megabecquerel', 'MBq', 1e6), unit('Gigabecquerel', 'GBq', 1e9),
      unit('Curie', 'Ci', 3.7e10), unit('Millicurie', 'mCi', 3.7e7), unit('Rutherford', 'Rd', 1e6),
    ], { defaultFrom: 5, defaultTo: 2, icon: 'flask' }),
    unitTool('radiation-dose', 'Absorbed dose converter', 'Convert absorbed ionizing radiation dose.', [
      unit('Microgray', 'µGy', 1e-6), unit('Milligray', 'mGy', 1e-3), unit('Centigray', 'cGy', 1e-2), unit('Gray', 'Gy', 1), unit('Rad', 'rad', 0.01),
    ], { defaultFrom: 4, defaultTo: 2, icon: 'flask', note: 'Absorbed dose is not the same as equivalent or effective dose.' }),
    unitTool('magnetic-flux', 'Magnetic flux converter', 'Convert weber-based and CGS magnetic flux.', [
      unit('Microweber', 'µWb', 1e-6), unit('Milliweber', 'mWb', 1e-3), unit('Weber', 'Wb', 1), unit('Maxwell', 'Mx', 1e-8),
    ], { defaultFrom: 2, defaultTo: 3, icon: 'flask' }),
    unitTool('magnetic-field', 'Magnetic field converter', 'Convert magnetic flux density between tesla and gauss.', [
      unit('Microtesla', 'µT', 1e-6), unit('Millitesla', 'mT', 1e-3), unit('Tesla', 'T', 1), unit('Gauss', 'G', 1e-4),
    ], { defaultFrom: 3, defaultTo: 1, icon: 'flask' }),
    unitTool('fuel-economy', 'Fuel economy converter', 'Convert consumption and economy formats without losing reciprocal meaning.', [
      { name: 'Liters per 100 kilometers', symbol: 'L/100 km', key: 'l100' },
      { name: 'Kilometers per liter', symbol: 'km/L', key: 'kml' },
      { name: 'US miles per gallon', symbol: 'mpg US', key: 'mpgus' },
      { name: 'Imperial miles per gallon', symbol: 'mpg imp', key: 'mpgimp' },
    ], {
      defaultFrom: 2, defaultTo: 0, icon: 'home',
      customConvert(value, from, to) {
        if (value <= 0) throw new Error('Fuel economy must be greater than zero.');
        let litersPer100;
        if (from.key === 'l100') litersPer100 = value;
        else if (from.key === 'kml') litersPer100 = 100 / value;
        else if (from.key === 'mpgus') litersPer100 = 235.214583 / value;
        else litersPer100 = 282.480936 / value;
        if (to.key === 'l100') return litersPer100;
        if (to.key === 'kml') return 100 / litersPer100;
        if (to.key === 'mpgus') return 235.214583 / litersPer100;
        return 282.480936 / litersPer100;
      },
      note: 'Fuel consumption (L/100 km) is reciprocal to fuel economy (mpg or km/L).',
    }),
  ];
  UNIT_TOOLS.push(...EXPANSION_1011.scienceUnitTools);

  function convertUnit(tool, value, fromIndex, toIndex) {
    const numeric = finiteNumber(value, 'Value');
    const from = tool.units[Number(fromIndex)];
    const to = tool.units[Number(toIndex)];
    if (!from || !to) throw new Error('Choose valid units.');
    let result;
    let expression;
    if (tool.customConvert) {
      result = tool.customConvert(numeric, from, to);
      if (tool.customExpression) expression = tool.customExpression(numeric, from, to);
      else {
        const baseExpression = from.key === 'l100' ? `${numeric}` : from.key === 'kml' ? `100/${numeric}` : from.key === 'mpgus' ? `235.214583/${numeric}` : `282.480936/${numeric}`;
        expression = to.key === 'l100' ? baseExpression : to.key === 'kml' ? `100/(${baseExpression})` : to.key === 'mpgus' ? `235.214583/(${baseExpression})` : `282.480936/(${baseExpression})`;
      }
    } else {
      const base = (numeric + (from.offset || 0)) * from.factor;
      result = base / to.factor - (to.offset || 0);
      if (tool.id === 'unit-temperature') expression = temperatureExpression(numeric, from.symbol, to.symbol);
      else if (from.offset || to.offset) expression = `((${numeric}+${from.offset || 0})*${from.factor}/${to.factor})-${to.offset || 0}`;
      else expression = `${numeric}*${from.factor}/${to.factor}`;
    }
    if (!Number.isFinite(result)) throw new Error('The converted result is outside the supported range.');
    return { value: result, from, to, expression };
  }

  function temperatureExpression(value, from, to) {
    if (from === to) return `${value}`;
    const expressions = {
      '°C>°F': `${value}*9/5+32`, '°F>°C': `(${value}-32)*5/9`,
      '°C>K': `${value}+273.15`, 'K>°C': `${value}-273.15`,
      '°F>K': `(${value}+459.67)*5/9`, 'K>°F': `${value}*9/5-459.67`,
      '°C>°R': `(${value}+273.15)*9/5`, '°R>°C': `${value}*5/9-273.15`,
      '°F>°R': `${value}+459.67`, '°R>°F': `${value}-459.67`,
      'K>°R': `${value}*9/5`, '°R>K': `${value}*5/9`,
    };
    return expressions[`${from}>${to}`] || `${value}`;
  }

  function numberField(id, label, value, unitLabel, options) {
    const opts = options || {};
    return {
      id, label, type: 'number', default: value, unit: unitLabel || '',
      min: opts.min, max: opts.max, step: opts.step || 'any',
      placeholder: opts.placeholder || '', help: opts.help || '',
      full: Boolean(opts.full), when: opts.when || null,
      solveToggle: Boolean(opts.solveToggle), solveByDefault: Boolean(opts.solveByDefault),
    };
  }

  function textField(id, label, value, options) {
    const opts = options || {};
    return { id, label, type: opts.time12 ? 'time12' : 'text', default: value || '', placeholder: opts.placeholder || '', help: opts.help || '', full: Boolean(opts.full), when: opts.when || null, numericList: Boolean(opts.numericList), periodDefault: opts.periodDefault || 'am' };
  }

  function dateField(id, label, value, options) {
    const opts = options || {};
    return { id, label, type: 'date', default: value || '', help: opts.help || '', full: Boolean(opts.full), when: opts.when || null };
  }

  function selectField(id, label, value, options, help, config) {
    const opts = config || {};
    return { id, label, type: 'select', default: value, options, help: help || '', segmented: Boolean(opts.segmented), full: Boolean(opts.full), when: opts.when || null };
  }

  function calculatorTool(id, title, description, icon, fields, calculate, options) {
    const opts = options || {};
    return {
      id: `calc-${id}`,
      kind: 'calculator',
      title,
      shortTitle: opts.shortTitle || title.replace(' calculator', ''),
      description,
      icon: icon || 'calculator',
      fields,
      calculate,
      note: opts.note || '',
      asyncType: opts.asyncType || '',
    };
  }

  function calcResult(primary, unitLabel, expression, details, note, options) {
    return { primary, unit: unitLabel || '', expression: expression || '', details: details || [], note: note || '', currency: Boolean(options?.currency), meta: options?.meta || null };
  }

  const CURRENCY_OPTIONS = [
    ['AUD', 'Australian dollar'], ['BGN', 'Bulgarian lev'], ['BRL', 'Brazilian real'], ['CAD', 'Canadian dollar'],
    ['CHF', 'Swiss franc'], ['CNY', 'Chinese yuan'], ['CZK', 'Czech koruna'], ['DKK', 'Danish krone'],
    ['EUR', 'Euro'], ['GBP', 'British pound'], ['HKD', 'Hong Kong dollar'], ['HUF', 'Hungarian forint'],
    ['IDR', 'Indonesian rupiah'], ['ILS', 'Israeli new shekel'], ['INR', 'Indian rupee'], ['ISK', 'Icelandic króna'],
    ['JPY', 'Japanese yen'], ['KRW', 'South Korean won'], ['MXN', 'Mexican peso'], ['MYR', 'Malaysian ringgit'],
    ['NOK', 'Norwegian krone'], ['NZD', 'New Zealand dollar'], ['PHP', 'Philippine peso'], ['PLN', 'Polish złoty'],
    ['RON', 'Romanian leu'], ['SEK', 'Swedish krona'], ['SGD', 'Singapore dollar'], ['THB', 'Thai baht'],
    ['TRY', 'Turkish lira'], ['USD', 'US dollar'], ['ZAR', 'South African rand'],
  ].map(([value, name]) => ({ value, label: `${value} · ${name}` }));

  async function fetchCurrencyQuote(fromCurrency, toCurrency, fetcher) {
    const from = String(fromCurrency || '').toUpperCase();
    const to = String(toCurrency || '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw new Error('Choose valid currencies.');
    if (from === to) return { rate: 1, date: new Date().toISOString().slice(0, 10), source: 'same currency' };
    const request = fetcher || root.fetch?.bind(root);
    if (!request) throw new Error('This browser cannot request exchange rates.');
    const endpoints = [
      `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
      `https://api.frankfurter.dev/v1/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ];
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const response = await request(endpoint, { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Rate service returned ${response.status}.`);
        const payload = await response.json();
        const rate = Number(payload?.rate ?? payload?.rates?.[to]);
        if (!Number.isFinite(rate) || rate <= 0) throw new Error('The rate service returned an invalid rate.');
        return {
          rate,
          date: String(payload?.date || 'Latest available'),
          source: endpoint.includes('/v2/') ? 'Frankfurter v2' : 'Frankfurter v1 fallback',
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('The exchange-rate service could not be reached.');
  }

  const FINANCE_TOOLS = [
    calculatorTool('loan-payment', 'Loan payment calculator', 'Estimate payments after a down payment for a fixed-rate amortizing loan.', 'wallet', [
      numberField('principal', 'Purchase / loan amount', 250000, '$', { min: 0 }),
      numberField('downPayment', 'Down payment', 50000, '$', { min: 0 }),
      numberField('rate', 'Annual interest rate', 6.5, '%', { min: 0 }),
      numberField('years', 'Loan term', 30, 'years', { min: 0 }),
      selectField('payments', 'Payments per year', '12', [{ value: '12', label: 'Monthly (12)' }, { value: '26', label: 'Biweekly (26)' }, { value: '52', label: 'Weekly (52)' }]),
    ], (v) => {
      const amount = positive(v.principal, 'Purchase / loan amount');
      const downPayment = positive(v.downPayment, 'Down payment', true);
      if (downPayment >= amount) throw new Error('Down payment must be less than the purchase / loan amount.');
      const principal = amount - downPayment;
      const annualRate = positive(v.rate, 'Interest rate', true) / 100;
      const years = positive(v.years, 'Loan term');
      const payments = positive(v.payments, 'Payments per year');
      const count = Math.round(years * payments);
      const rate = annualRate / payments;
      const payment = rate === 0 ? principal / count : principal * rate * Math.pow(1 + rate, count) / (Math.pow(1 + rate, count) - 1);
      const total = payment * count;
      return calcResult(payment, 'per payment', rate === 0 ? `${principal}/${count}` : `${principal}*${rate}*(1+${rate})^${count}/((1+${rate})^${count}-1)`, [
        { label: 'Total paid', value: total, prefix: '$' },
        { label: 'Total interest', value: total - principal, prefix: '$' },
        { label: 'Amount financed', value: principal, prefix: '$' },
        { label: 'Down payment', value: downPayment, prefix: '$' },
        { label: 'Number of payments', value: count },
      ], 'Estimate only. Fees, taxes, insurance, and lender-specific compounding are not included.', { currency: true });
    }),
    calculatorTool('mortgage-payment', 'Mortgage payment calculator', 'Estimate principal, interest, escrow, PMI, HOA, and the total monthly housing payment.', 'home', [
      numberField('homePrice', 'Home price', 400000, '$', { min: 0 }),
      numberField('downPayment', 'Down payment', 80000, '$', { min: 0 }),
      numberField('rate', 'Annual interest rate', 6.5, '%', { min: 0 }),
      numberField('years', 'Loan term', 30, 'years', { min: 0 }),
      numberField('propertyTax', 'Annual property tax', 4800, '$ / year', { min: 0 }),
      numberField('insurance', 'Home insurance premium', 1800, '$ / year', { min: 0 }),
      numberField('pmiRate', 'Annual PMI rate', 0.5, '% of loan', { min: 0, help: 'Enter 0 if PMI does not apply.' }),
      numberField('hoa', 'HOA / other monthly dues', 0, '$ / month', { min: 0 }),
      numberField('extraPayment', 'Extra monthly principal payment', 0, '$ / month', { min: 0 }),
      numberField('extraStartMonth', 'Start extra payment after', 0, 'months', { min: 0, step: 1, help: 'Enter 0 to start with the first payment.' }),
    ], (v) => {
      const price = positive(v.homePrice, 'Home price');
      const down = positive(v.downPayment, 'Down payment', true);
      if (down >= price) throw new Error('Down payment must be less than the home price.');
      const principal = price - down;
      const annualRate = positive(v.rate, 'Interest rate', true) / 100;
      const years = positive(v.years, 'Loan term');
      const months = Math.round(years * 12);
      const monthlyRate = annualRate / 12;
      const principalInterest = monthlyRate === 0 ? principal / months : principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
      const propertyTax = positive(v.propertyTax, 'Property tax', true) / 12;
      const insurance = positive(v.insurance, 'Home insurance', true) / 12;
      const pmi = principal * positive(v.pmiRate, 'PMI rate', true) / 100 / 12;
      const hoa = positive(v.hoa, 'HOA dues', true);
      const extraPayment = positive(v.extraPayment ?? 0, 'Extra payment', true);
      const extraStartMonth = Math.round(positive(v.extraStartMonth ?? 0, 'Extra-payment start month', true));
      const total = principalInterest + propertyTax + insurance + pmi + hoa + extraPayment;
      let extraBalance = principal; let acceleratedInterest = 0; let acceleratedMonths = 0;
      while (extraBalance > 1e-8 && acceleratedMonths < months) {
        const interestCharge = extraBalance * monthlyRate;
        acceleratedInterest += interestCharge;
        const scheduled = Math.min(principalInterest, extraBalance + interestCharge);
        const extra = acceleratedMonths >= extraStartMonth ? Math.min(extraPayment, Math.max(0, extraBalance + interestCharge - scheduled)) : 0;
        extraBalance = Math.max(0, extraBalance + interestCharge - scheduled - extra);
        acceleratedMonths += 1;
      }
      const normalInterest = principalInterest * months - principal;
      return calcResult(total, 'planned monthly payment', `${principalInterest}+${propertyTax}+${insurance}+${pmi}+${hoa}+${extraPayment}`, [
        { label: 'Principal & interest', value: principalInterest, prefix: '$' },
        { label: 'Extra principal', value: extraPayment, prefix: '$' },
        { label: 'Property-tax escrow', value: propertyTax, prefix: '$' },
        { label: 'Insurance escrow', value: insurance, prefix: '$' },
        { label: 'PMI', value: pmi, prefix: '$' },
        { label: 'HOA / other dues', value: hoa, prefix: '$' },
        { label: 'Amount financed', value: principal, prefix: '$' },
        { label: 'Standard payoff time', value: `${Math.floor(months / 12)} yr ${months % 12} mo` },
        { label: 'Payoff with extra payments', value: `${Math.floor(acceleratedMonths / 12)} yr ${acceleratedMonths % 12} mo` },
        { label: 'Time saved', value: `${Math.floor((months - acceleratedMonths) / 12)} yr ${(months - acceleratedMonths) % 12} mo` },
        { label: 'Interest with extra payments', value: acceleratedInterest, prefix: '$' },
        { label: 'Interest saved', value: normalInterest - acceleratedInterest, prefix: '$' },
        { label: 'Lifetime cost with extra payments', value: principal + acceleratedInterest + pmi * acceleratedMonths, prefix: '$' },
        { label: 'Lifetime cost of loan', value: principal + normalInterest + pmi * months, prefix: '$' },
      ], 'Extra payments are applied to principal after the scheduled payment beginning with the selected month. Estimate only; actual escrow, PMI cancellation, fees, and servicer rules can alter results.', { currency: true });
    }),
    calculatorTool('currency', 'Currency converter', 'Convert money with the latest available reference exchange rate.', 'wallet', [
      numberField('amount', 'Amount', 1000, '', { full: true }),
      selectField('from', 'From currency', 'USD', CURRENCY_OPTIONS),
      selectField('to', 'To currency', 'EUR', CURRENCY_OPTIONS),
    ], () => {
      throw new Error('A live exchange rate is required.');
    }, {
      asyncType: 'currency',
      note: 'Rates load online from Frankfurter’s latest available reference-rate feed. Markets and providers may quote different intraday rates or fees.',
    }),
    calculatorTool('compound-interest', 'Compound interest calculator', 'Project growth with compounding and optional monthly contributions.', 'wallet', [
      numberField('principal', 'Starting balance', 10000, '$', { min: 0 }),
      numberField('rate', 'Annual return', 7, '%', { min: 0 }),
      numberField('years', 'Time horizon', 10, 'years', { min: 0 }),
      selectField('compoundings', 'Compounding', '12', [{ value: '1', label: 'Annually' }, { value: '4', label: 'Quarterly' }, { value: '12', label: 'Monthly' }, { value: '365', label: 'Daily' }]),
      numberField('contribution', 'Monthly contribution', 250, '$', { min: 0, full: true }),
    ], (v) => {
      const principal = positive(v.principal, 'Starting balance', true);
      const annualRate = positive(v.rate, 'Annual return', true) / 100;
      const years = positive(v.years, 'Time horizon');
      const n = positive(v.compoundings, 'Compounding frequency');
      const contribution = positive(v.contribution, 'Monthly contribution', true);
      const initialGrowth = principal * Math.pow(1 + annualRate / n, n * years);
      const monthlyRate = annualRate === 0 ? 0 : Math.pow(1 + annualRate / n, n / 12) - 1;
      const months = Math.round(years * 12);
      const contributionGrowth = monthlyRate === 0 ? contribution * months : contribution * (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
      const future = initialGrowth + contributionGrowth;
      const contributed = principal + contribution * months;
      return calcResult(future, 'future value', `${principal}*(1+${annualRate}/${n})^(${n}*${years})+${contribution}*((1+${monthlyRate})^${months}-1)/${monthlyRate || 1}`, [
        { label: 'Total contributed', value: contributed, prefix: '$' },
        { label: 'Estimated growth', value: future - contributed, prefix: '$' },
        { label: 'Months', value: months },
      ], 'This is a mathematical projection, not an investment forecast. Returns and contribution timing vary.', { currency: true });
    }),
    calculatorTool('simple-interest', 'Simple interest calculator', 'Calculate interest that does not compound.', 'wallet', [
      numberField('principal', 'Principal', 5000, '$', { min: 0 }),
      numberField('rate', 'Annual rate', 5, '%', { min: 0 }),
      numberField('years', 'Time', 3, 'years', { min: 0 }),
    ], (v) => {
      const p = positive(v.principal, 'Principal', true);
      const r = positive(v.rate, 'Annual rate', true) / 100;
      const t = positive(v.years, 'Time', true);
      const interest = p * r * t;
      return calcResult(p + interest, 'total amount', `${p}+${p}*${r}*${t}`, [
        { label: 'Interest', value: interest, prefix: '$' }, { label: 'Principal', value: p, prefix: '$' },
      ], '', { currency: true });
    }),
    calculatorTool('savings-goal', 'Savings goal calculator', 'Estimate the monthly deposit needed to reach a future balance.', 'wallet', [
      numberField('goal', 'Target balance', 50000, '$', { min: 0 }),
      numberField('current', 'Current savings', 5000, '$', { min: 0 }),
      numberField('rate', 'Annual return', 4, '%', { min: 0 }),
      numberField('years', 'Time available', 5, 'years', { min: 0 }),
    ], (v) => {
      const goal = positive(v.goal, 'Target balance');
      const current = positive(v.current, 'Current savings', true);
      const rate = positive(v.rate, 'Annual return', true) / 12 / 100;
      const months = Math.max(1, Math.round(positive(v.years, 'Time available') * 12));
      const currentFuture = current * Math.pow(1 + rate, months);
      const gap = Math.max(0, goal - currentFuture);
      const payment = rate === 0 ? gap / months : gap * rate / (Math.pow(1 + rate, months) - 1);
      return calcResult(payment, 'per month', rate === 0 ? `${gap}/${months}` : `${gap}*${rate}/((1+${rate})^${months}-1)`, [
        { label: 'Current savings at goal date', value: currentFuture, prefix: '$' },
        { label: 'Total new deposits', value: payment * months, prefix: '$' },
        { label: 'Months', value: months },
      ], 'Projection assumes a constant return and end-of-month deposits.', { currency: true });
    }),
    calculatorTool('discount', 'Discount calculator', 'Find the sale price and savings from one or two discounts.', 'wallet', [
      numberField('price', 'Original price', 120, '$', { min: 0 }),
      numberField('discount', 'First discount', 25, '%', { min: 0 }),
      numberField('second', 'Second discount', 0, '%', { min: 0, help: 'Applied after the first discount.' }),
    ], (v) => {
      const price = positive(v.price, 'Original price', true);
      const first = clamp(positive(v.discount, 'First discount', true), 0, 100) / 100;
      const second = clamp(positive(v.second, 'Second discount', true), 0, 100) / 100;
      const sale = price * (1 - first) * (1 - second);
      return calcResult(sale, 'sale price', `${price}*(1-${first})*(1-${second})`, [
        { label: 'You save', value: price - sale, prefix: '$' },
        { label: 'Effective discount', value: price === 0 ? 0 : (1 - sale / price) * 100, suffix: '%' },
      ], '', { currency: true });
    }),
    calculatorTool('sales-tax', 'Sales tax calculator', 'Add tax to a price or work backward from a tax-inclusive total.', 'wallet', [
      numberField('amount', 'Amount', 100, '$', { min: 0 }),
      numberField('rate', 'Tax rate', 8.25, '%', { min: 0 }),
      selectField('direction', 'Amount entered is', 'pre', [{ value: 'pre', label: 'Before tax' }, { value: 'total', label: 'Tax included' }]),
    ], (v) => {
      const amount = positive(v.amount, 'Amount', true);
      const rate = positive(v.rate, 'Tax rate', true) / 100;
      const preTax = v.direction === 'total' ? amount / (1 + rate) : amount;
      const total = v.direction === 'total' ? amount : amount * (1 + rate);
      return calcResult(total, 'total', v.direction === 'total' ? `${amount}` : `${amount}*(1+${rate})`, [
        { label: 'Before tax', value: preTax, prefix: '$' }, { label: 'Tax', value: total - preTax, prefix: '$' },
      ], '', { currency: true });
    }),
    calculatorTool('tip-split', 'Tip & split calculator', 'Calculate a tip and split the final bill evenly.', 'wallet', [
      numberField('bill', 'Bill amount', 86.4, '$', { min: 0 }),
      numberField('tip', 'Tip', 20, '%', { min: 0 }),
      numberField('people', 'People', 3, '', { min: 1, step: 1 }),
    ], (v) => {
      const bill = positive(v.bill, 'Bill amount', true);
      const tipRate = positive(v.tip, 'Tip', true) / 100;
      const people = Math.max(1, Math.round(positive(v.people, 'People')));
      const tip = bill * tipRate;
      const total = bill + tip;
      return calcResult(total / people, 'per person', `(${bill}+${bill}*${tipRate})/${people}`, [
        { label: 'Tip amount', value: tip, prefix: '$' }, { label: 'Bill total', value: total, prefix: '$' }, { label: 'People', value: people },
      ], '', { currency: true });
    }),
    calculatorTool('profit-margin', 'Profit margin calculator', 'Compare cost and revenue to find profit, margin, and markup.', 'wallet', [
      numberField('cost', 'Cost', 45, '$', { min: 0 }),
      numberField('revenue', 'Selling price', 80, '$', { min: 0 }),
    ], (v) => {
      const cost = positive(v.cost, 'Cost', true);
      const revenue = positive(v.revenue, 'Selling price', true);
      const profit = revenue - cost;
      const margin = revenue === 0 ? 0 : profit / revenue * 100;
      const markup = cost === 0 ? 0 : profit / cost * 100;
      return calcResult(margin, 'profit margin %', `(${revenue}-${cost})/${revenue || 1}*100`, [
        { label: 'Profit', value: profit, prefix: '$' }, { label: 'Markup', value: markup, suffix: '%' }, { label: 'Selling price', value: revenue, prefix: '$' },
      ]);
    }),
    calculatorTool('break-even', 'Break-even calculator', 'Find the number of units needed to cover fixed and variable costs.', 'wallet', [
      numberField('fixed', 'Fixed costs', 10000, '$', { min: 0 }),
      numberField('price', 'Price per unit', 75, '$', { min: 0 }),
      numberField('variable', 'Variable cost per unit', 40, '$', { min: 0 }),
    ], (v) => {
      const fixed = positive(v.fixed, 'Fixed costs', true);
      const price = positive(v.price, 'Price per unit');
      const variable = positive(v.variable, 'Variable cost', true);
      if (price <= variable) throw new Error('Price per unit must be greater than variable cost.');
      const units = fixed / (price - variable);
      return calcResult(Math.ceil(units), 'whole units', `${fixed}/(${price}-${variable})`, [
        { label: 'Exact break-even', value: units, suffix: ' units' }, { label: 'Contribution margin', value: price - variable, prefix: '$' },
        { label: 'Revenue at break-even', value: Math.ceil(units) * price, prefix: '$' },
      ]);
    }),
  ];

  const HEALTH_TOOLS = [
    calculatorTool('bmi', 'BMI calculator', 'Calculate body mass index with metric or imperial measurements.', 'heart', [
      selectField('system', 'Measurement system', 'metric', [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }], '', { segmented: true, full: true }),
      numberField('weight', 'Weight', 72, 'kg or lb', { min: 0 }), numberField('height', 'Height', 175, 'cm or in', { min: 0 }),
    ], (v) => {
      const metric = v.system !== 'imperial';
      const weight = positive(v.weight, 'Weight') * (metric ? 1 : 0.45359237);
      const height = positive(v.height, 'Height') * (metric ? 0.01 : 0.0254);
      const bmi = weight / (height * height);
      const category = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Healthy weight' : bmi < 30 ? 'Overweight' : bmi < 35 ? 'Obesity class 1' : bmi < 40 ? 'Obesity class 2' : 'Obesity class 3';
      const healthyLowKg = 18.5 * height * height;
      const healthyHighKg = 24.9 * height * height;
      const healthyFactor = metric ? 1 : 1 / 0.45359237;
      const healthyUnit = metric ? 'kg' : 'lb';
      const heightDetail = metric
        ? { label: 'Height', value: height, suffix: ' m' }
        : (() => {
            const totalInches = positive(v.height, 'Height');
            const feet = Math.floor(totalInches / 12);
            const inches = totalInches - feet * 12;
            return { label: 'Height', value: `${feet} ft ${trimNumber(inches, 4)} in` };
          })();
      return calcResult(bmi, 'kg/m²', `${weight}/${height}^2`, [
        { label: 'Adult screening category', value: category }, heightDetail,
        { label: 'Healthy-range lower weight', value: healthyLowKg * healthyFactor, suffix: ` ${healthyUnit}` },
        { label: 'Healthy-range upper weight', value: healthyHighKg * healthyFactor, suffix: ` ${healthyUnit}` },
      ], 'The adult healthy-weight range is the weight span corresponding to BMI 18.5–24.9 at the entered height. BMI is a screening measure, not a diagnosis.');
    }, { note: 'For general informational use only; discuss personal health decisions with a qualified clinician.' }),
    calculatorTool('bmr', 'BMR calculator', 'Estimate resting energy use with metric or imperial inputs.', 'heart', [
      selectField('system', 'Measurement system', 'metric', [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }], '', { segmented: true, full: true }),
      selectField('sex', 'Equation', 'male', [{ value: 'male', label: 'Male constant (+5)' }, { value: 'female', label: 'Female constant (−161)' }]),
      numberField('age', 'Age', 30, 'years', { min: 1 }), numberField('weight', 'Weight', 72, 'kg or lb', { min: 0 }), numberField('height', 'Height', 175, 'cm or in', { min: 0 }),
    ], (v) => {
      const metric = v.system !== 'imperial';
      const weight = positive(v.weight, 'Weight') * (metric ? 1 : 0.45359237);
      const height = positive(v.height, 'Height') * (metric ? 1 : 2.54);
      const age = positive(v.age, 'Age');
      const constant = v.sex === 'male' ? 5 : -161;
      const bmr = 10 * weight + 6.25 * height - 5 * age + constant;
      return calcResult(bmr, 'kcal/day', `10*${weight}+6.25*${height}-5*${age}+${constant}`, [{ label: 'Equation', value: 'Mifflin–St Jeor' }], 'This estimate is not a personalized nutrition prescription.');
    }),
    calculatorTool('tdee', 'Daily energy estimate', 'Apply an activity factor to estimated resting energy use.', 'heart', [
      numberField('bmr', 'Resting energy (BMR)', 1650, 'kcal/day', { min: 0 }),
      selectField('activity', 'Activity factor', '1.55', [
        { value: '1.2', label: 'Sedentary (1.20)' }, { value: '1.375', label: 'Light (1.375)' }, { value: '1.55', label: 'Moderate (1.55)' },
        { value: '1.725', label: 'Very active (1.725)' }, { value: '1.9', label: 'Extra active (1.90)' },
      ]),
    ], (v) => {
      const bmr = positive(v.bmr, 'BMR');
      const factor = positive(v.activity, 'Activity factor');
      return calcResult(bmr * factor, 'kcal/day', `${bmr}*${factor}`, [{ label: 'Resting estimate', value: bmr, suffix: ' kcal/day' }, { label: 'Activity factor', value: factor }], 'Activity multipliers are broad estimates; actual energy needs vary.');
    }),
    calculatorTool('body-surface-area', 'Body surface area calculator', 'Estimate body surface area with metric or imperial measurements.', 'heart', [
      selectField('system', 'Measurement system', 'metric', [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }], '', { segmented: true, full: true }),
      numberField('weight', 'Weight', 72, 'kg or lb', { min: 0 }), numberField('height', 'Height', 175, 'cm or in', { min: 0 }),
    ], (v) => {
      const metric = v.system !== 'imperial';
      const weight = positive(v.weight, 'Weight') * (metric ? 1 : 0.45359237);
      const height = positive(v.height, 'Height') * (metric ? 1 : 2.54);
      const bsa = Math.sqrt(height * weight / 3600);
      return calcResult(bsa, 'm²', `sqrt(${height}*${weight}/3600)`, [{ label: 'Formula', value: 'Mosteller' }], 'For informational use only. Clinical calculations require professional verification.');
    }),
    calculatorTool('pace', 'Running pace calculator', 'Calculate pace and speed in metric or imperial units.', 'heart', [
      selectField('system', 'Measurement system', 'metric', [{ value: 'metric', label: 'Kilometers' }, { value: 'imperial', label: 'Miles' }], '', { segmented: true, full: true }),
      numberField('distance', 'Distance', 5, 'km or mi', { min: 0 }), numberField('minutes', 'Finish time', 28, 'minutes', { min: 0 }),
    ], (v) => {
      const distance = positive(v.distance, 'Distance');
      const minutes = positive(v.minutes, 'Finish time');
      const pace = minutes / distance;
      const paceMinutes = Math.floor(pace);
      const paceSeconds = Math.round((pace - paceMinutes) * 60);
      const paceText = `${paceMinutes}:${String(paceSeconds === 60 ? 0 : paceSeconds).padStart(2, '0')}`;
      const adjustedMinutes = paceSeconds === 60 ? paceMinutes + 1 : paceMinutes;
      const imperial = v.system === 'imperial';
      const distanceUnit = imperial ? 'mi' : 'km';
      const speedUnit = imperial ? 'mph' : 'km/h';
      return calcResult(`${adjustedMinutes}:${String(paceSeconds === 60 ? 0 : paceSeconds).padStart(2, '0')}`, `min/${distanceUnit}`, `${minutes}/${distance}`, [
        { label: 'Average speed', value: distance / (minutes / 60), suffix: ` ${speedUnit}` }, { label: 'Raw pace', value: pace, suffix: ` min/${distanceUnit}` },
      ]);
    }),
    calculatorTool('target-heart-rate', 'Target heart rate calculator', 'Estimate a training zone with the heart-rate reserve method.', 'heart', [
      numberField('age', 'Age', 35, 'years', { min: 1 }), numberField('resting', 'Resting heart rate', 65, 'bpm', { min: 1 }),
      numberField('low', 'Low intensity', 60, '%', { min: 1 }), numberField('high', 'High intensity', 80, '%', { min: 1 }),
    ], (v) => {
      const age = positive(v.age, 'Age');
      const resting = positive(v.resting, 'Resting heart rate');
      const low = clamp(positive(v.low, 'Low intensity') / 100, 0, 1);
      const high = clamp(positive(v.high, 'High intensity') / 100, low, 1);
      const max = 220 - age;
      const reserve = max - resting;
      const lowRate = reserve * low + resting;
      const highRate = reserve * high + resting;
      return calcResult(`${Math.round(lowRate)}–${Math.round(highRate)}`, 'bpm zone', `(${max}-${resting})*${low}+${resting}`, [
        { label: 'Estimated maximum', value: max, suffix: ' bpm' }, { label: 'Heart-rate reserve', value: reserve, suffix: ' bpm' },
      ], 'This age-based estimate is not medical advice. Stop exercise and seek care for concerning symptoms.');
    }),
  ];

  const FINANCE_CATALOG_TOOLS = [...FINANCE_TOOLS, ...EXPANSION_1011.financeTools];
  const HEALTH_CATALOG_TOOLS = [...HEALTH_TOOLS, ...EXPANSION_1011.healthTools];

  function solveTriangle(values) {
    const read = (id, label) => {
      const raw = values[id];
      if (raw === null || raw === undefined || String(raw).trim() === '' || Number.isNaN(raw)) return null;
      return positive(raw, label);
    };
    let sides = [read('sideA', 'Side a'), read('sideB', 'Side b'), read('sideC', 'Side c')];
    let angles = [read('angleA', 'Angle A'), read('angleB', 'Angle B'), read('angleC', 'Angle C')];
    const tolerance = 1e-8;
    const radians = (degrees) => degrees * Math.PI / 180;
    const degrees = (radiansValue) => radiansValue * 180 / Math.PI;
    const cosineAngle = (opposite, adjacent1, adjacent2) => degrees(Math.acos(clamp((adjacent1 ** 2 + adjacent2 ** 2 - opposite ** 2) / (2 * adjacent1 * adjacent2), -1, 1)));

    if (angles.some((angle) => angle !== null && (angle <= 0 || angle >= 180))) throw new Error('Known angles must be between 0° and 180°.');

    for (let iteration = 0; iteration < 12; iteration += 1) {
      let changed = false;
      const knownAngles = angles.map((value, index) => value === null ? -1 : index).filter((index) => index >= 0);
      if (knownAngles.length === 2) {
        const missing = [0, 1, 2].find((index) => angles[index] === null);
        angles[missing] = 180 - knownAngles.reduce((sum, index) => sum + angles[index], 0);
        changed = true;
      }
      if (sides.every((value) => value !== null)) {
        if (angles[0] === null) { angles[0] = cosineAngle(sides[0], sides[1], sides[2]); changed = true; }
        if (angles[1] === null) { angles[1] = cosineAngle(sides[1], sides[0], sides[2]); changed = true; }
        if (angles[2] === null) { angles[2] = 180 - angles[0] - angles[1]; changed = true; }
      }
      const sas = [
        [0, 1, 2],
        [0, 2, 1],
        [1, 2, 0],
      ];
      sas.forEach(([first, second, oppositeAngle]) => {
        const missingSide = oppositeAngle;
        if (sides[first] !== null && sides[second] !== null && sides[missingSide] === null && angles[oppositeAngle] !== null) {
          sides[missingSide] = Math.sqrt(Math.max(0, sides[first] ** 2 + sides[second] ** 2 - 2 * sides[first] * sides[second] * Math.cos(radians(angles[oppositeAngle]))));
          changed = true;
        }
      });
      const knownPair = [0, 1, 2].find((index) => sides[index] !== null && angles[index] !== null);
      if (knownPair !== undefined) {
        for (let index = 0; index < 3; index += 1) {
          if (index === knownPair) continue;
          if (angles[index] !== null && sides[index] === null) {
            sides[index] = sides[knownPair] * Math.sin(radians(angles[index])) / Math.sin(radians(angles[knownPair]));
            changed = true;
          } else if (sides[index] !== null && angles[index] === null) {
            const ratio = sides[index] * Math.sin(radians(angles[knownPair])) / sides[knownPair];
            if (ratio <= 1 + tolerance) {
              const candidate = degrees(Math.asin(clamp(ratio, -1, 1)));
              if (candidate > 0 && candidate + angles[knownPair] < 180) {
                angles[index] = candidate;
                changed = true;
              }
            }
          }
        }
      }
      if (!changed) break;
    }

    if (sides.some((value) => value === null) || angles.some((value) => value === null)) throw new Error('More data needed for triangle calculation.');
    sides = sides.map(Number);
    angles = angles.map(Number);
    if (Math.abs(angles.reduce((sum, value) => sum + value, 0) - 180) > 1e-5) throw new Error('The angles must total 180°.');
    if (sides[0] + sides[1] <= sides[2] || sides[0] + sides[2] <= sides[1] || sides[1] + sides[2] <= sides[0]) throw new Error('Those side lengths cannot form a triangle.');
    const perimeter = sides.reduce((sum, value) => sum + value, 0);
    const semi = perimeter / 2;
    const area = Math.sqrt(Math.max(0, semi * (semi - sides[0]) * (semi - sides[1]) * (semi - sides[2])));
    const largestSide = Math.max(...sides);
    const sideTolerance = largestSide * 1e-7;
    const equalAB = Math.abs(sides[0] - sides[1]) <= sideTolerance;
    const equalAC = Math.abs(sides[0] - sides[2]) <= sideTolerance;
    const equalBC = Math.abs(sides[1] - sides[2]) <= sideTolerance;
    const sideType = equalAB && equalAC ? 'equilateral' : (equalAB || equalAC || equalBC ? 'isosceles' : 'scalene');
    const largestAngle = Math.max(...angles);
    const angleType = Math.abs(largestAngle - 90) <= 1e-6 ? 'right' : (largestAngle > 90 ? 'obtuse' : 'acute');
    const triangleType = sideType === 'equilateral'
      ? 'Equilateral triangle'
      : `${angleType[0].toUpperCase()}${angleType.slice(1)} ${sideType} triangle`;
    return { sides, angles, area, perimeter, triangleType };
  }

  function polygonName(sides) {
    return ({ 3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 11: 'Hendecagon', 12: 'Dodecagon', 13: 'Tridecagon', 14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon', 17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon', 20: 'Icosagon' })[sides] || `${sides}-gon`;
  }

  const GEOMETRY_TOOLS = [
    calculatorTool('circle', 'Circle calculator', 'Find area, circumference, and diameter from a radius.', 'geometry', [numberField('radius', 'Radius', 5, 'units', { min: 0, full: true })], (v) => {
      const r = positive(v.radius, 'Radius', true);
      return calcResult(Math.PI * r * r, 'square units', `pi*${r}^2`, [{ label: 'Circumference', value: 2 * Math.PI * r, suffix: ' units' }, { label: 'Diameter', value: 2 * r, suffix: ' units' }]);
    }),
    calculatorTool('rectangle', 'Rectangle calculator', 'Find area, perimeter, and diagonal.', 'geometry', [numberField('length', 'Length', 12, 'units', { min: 0 }), numberField('width', 'Width', 8, 'units', { min: 0 })], (v) => {
      const l = positive(v.length, 'Length', true); const w = positive(v.width, 'Width', true);
      return calcResult(l * w, 'square units', `${l}*${w}`, [{ label: 'Perimeter', value: 2 * (l + w), suffix: ' units' }, { label: 'Diagonal', value: Math.hypot(l, w), suffix: ' units' }]);
    }),
    calculatorTool('triangle', 'Standard triangle calculator', 'Enter any sufficient combination of sides and angles; blank measurements are solved automatically.', 'geometry', [
      numberField('sideA', 'Side a (opposite angle A)', 3, 'units', { min: 0 }),
      numberField('sideB', 'Side b (opposite angle B)', 4, 'units', { min: 0 }),
      numberField('sideC', 'Side c (opposite angle C)', 5, 'units', { min: 0 }),
      numberField('angleA', 'Angle A', 36.86989765, '°', { min: 0, max: 180 }),
      numberField('angleB', 'Angle B', 53.13010235, '°', { min: 0, max: 180 }),
      numberField('angleC', 'Angle C', 90, '°', { min: 0, max: 180 }),
    ], (v) => {
      const solved = solveTriangle(v);
      const [a, b, c] = solved.sides; const [A, B, C] = solved.angles;
      return calcResult(solved.area, 'square units', `sqrt(${solved.perimeter / 2}*(${solved.perimeter / 2}-${a})*(${solved.perimeter / 2}-${b})*(${solved.perimeter / 2}-${c}))`, [
        { label: 'Triangle type', value: solved.triangleType },
        { label: 'Side a', value: a, suffix: ' units' }, { label: 'Side b', value: b, suffix: ' units' }, { label: 'Side c', value: c, suffix: ' units' },
        { label: 'Angle A', value: A, suffix: '°' }, { label: 'Angle B', value: B, suffix: '°' }, { label: 'Angle C', value: C, suffix: '°' },
        { label: 'Perimeter', value: solved.perimeter, suffix: ' units' }, { label: 'Area', value: solved.area, suffix: ' square units' },
      ], '', { meta: solved });
    }),
    calculatorTool('trapezoid', 'Trapezoid calculator', 'Find area from two parallel bases and height.', 'geometry', [
      numberField('a', 'First base', 8, 'units', { min: 0 }), numberField('b', 'Second base', 12, 'units', { min: 0 }), numberField('height', 'Height', 6, 'units', { min: 0 }),
    ], (v) => {
      const a = positive(v.a, 'First base', true); const b = positive(v.b, 'Second base', true); const h = positive(v.height, 'Height', true);
      return calcResult((a + b) * h / 2, 'square units', `(${a}+${b})*${h}/2`, [{ label: 'Average base', value: (a + b) / 2, suffix: ' units' }]);
    }),
    calculatorTool('sphere', 'Sphere calculator', 'Find volume and surface area from radius.', 'geometry', [numberField('radius', 'Radius', 4, 'units', { min: 0, full: true })], (v) => {
      const r = positive(v.radius, 'Radius', true);
      return calcResult(4 / 3 * Math.PI * Math.pow(r, 3), 'cubic units', `4/3*pi*${r}^3`, [{ label: 'Surface area', value: 4 * Math.PI * r * r, suffix: ' square units' }, { label: 'Diameter', value: 2 * r, suffix: ' units' }]);
    }),
    calculatorTool('cylinder', 'Cylinder calculator', 'Find volume and surface area from radius and height.', 'geometry', [numberField('radius', 'Radius', 4, 'units', { min: 0 }), numberField('height', 'Height', 10, 'units', { min: 0 })], (v) => {
      const r = positive(v.radius, 'Radius', true); const h = positive(v.height, 'Height', true);
      return calcResult(Math.PI * r * r * h, 'cubic units', `pi*${r}^2*${h}`, [{ label: 'Surface area', value: 2 * Math.PI * r * (r + h), suffix: ' square units' }, { label: 'Base area', value: Math.PI * r * r, suffix: ' square units' }]);
    }),
    calculatorTool('cone', 'Cone calculator', 'Find volume, slant height, and total surface area.', 'geometry', [numberField('radius', 'Radius', 4, 'units', { min: 0 }), numberField('height', 'Height', 9, 'units', { min: 0 })], (v) => {
      const r = positive(v.radius, 'Radius', true); const h = positive(v.height, 'Height', true); const slant = Math.hypot(r, h);
      return calcResult(Math.PI * r * r * h / 3, 'cubic units', `pi*${r}^2*${h}/3`, [{ label: 'Slant height', value: slant, suffix: ' units' }, { label: 'Surface area', value: Math.PI * r * (r + slant), suffix: ' square units' }]);
    }),
    calculatorTool('rectangular-prism', 'Rectangular prism calculator', 'Find volume, surface area, and space diagonal.', 'geometry', [
      numberField('length', 'Length', 10, 'units', { min: 0 }), numberField('width', 'Width', 6, 'units', { min: 0 }), numberField('height', 'Height', 4, 'units', { min: 0 }),
    ], (v) => {
      const l = positive(v.length, 'Length', true); const w = positive(v.width, 'Width', true); const h = positive(v.height, 'Height', true);
      return calcResult(l * w * h, 'cubic units', `${l}*${w}*${h}`, [{ label: 'Surface area', value: 2 * (l * w + l * h + w * h), suffix: ' square units' }, { label: 'Diagonal', value: Math.hypot(l, w, h), suffix: ' units' }]);
    }),
    calculatorTool('regular-polygon', 'Regular polygon calculator', 'Find area and perimeter from side count and side length.', 'geometry', [numberField('sides', 'Number of sides', 6, '', { min: 3, step: 1 }), numberField('length', 'Side length', 5, 'units', { min: 0 })], (v) => {
      const n = Math.max(3, Math.round(positive(v.sides, 'Number of sides'))); const s = positive(v.length, 'Side length', true);
      const area = n * s * s / (4 * Math.tan(Math.PI / n));
      return calcResult(area, 'square units', `${n}*${s}^2/(4*tan(${180 / n}))`, [{ label: 'Shape name', value: polygonName(n) }, { label: 'Perimeter', value: n * s, suffix: ' units' }, { label: 'Interior angle', value: (n - 2) * 180 / n, suffix: '°' }], '', { meta: { sides: n, length: s } });
    }),
  ];

  function parseNumberList(value) {
    const values = String(value || '').split(/[\s,;]+/).filter(Boolean).map(Number);
    if (!values.length || values.some((item) => !Number.isFinite(item))) throw new Error('Enter a list of valid numbers separated by commas.');
    return values;
  }

  function gcd(a, b) {
    a = Math.abs(Math.trunc(a)); b = Math.abs(Math.trunc(b));
    while (b) [a, b] = [b, a % b];
    return a;
  }

  function nChooseR(n, r) {
    n = Math.trunc(n); r = Math.trunc(r);
    if (n < 0 || r < 0 || r > n) throw new Error('Require whole numbers with 0 ≤ r ≤ n.');
    r = Math.min(r, n - r);
    let result = 1;
    for (let i = 1; i <= r; i += 1) result = result * (n - r + i) / i;
    return result;
  }

  function decimalToFraction(value, tolerance, maxDenominator) {
    const sign = value < 0 ? -1 : 1;
    let x = Math.abs(value);
    if (!Number.isFinite(x)) throw new Error('Enter a finite decimal.');
    if (Number.isInteger(x)) return { numerator: sign * x, denominator: 1 };
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1, b = x;
    for (let iteration = 0; iteration < 64; iteration += 1) {
      const a = Math.floor(b);
      const h = a * h1 + h2;
      const k = a * k1 + k2;
      if (k > maxDenominator) break;
      if (Math.abs(x - h / k) <= tolerance) return { numerator: sign * h, denominator: k };
      h2 = h1; h1 = h; k2 = k1; k1 = k;
      const remainder = b - a;
      if (remainder === 0) break;
      b = 1 / remainder;
    }
    return { numerator: sign * h1, denominator: k1 };
  }

  const MATH_TOOLS = [
    calculatorTool('percentage-of', 'Percentage calculator', 'Find a percentage of a number or determine what percent one value is of another.', 'calculator', [
      numberField('percent', 'Percentage', 18, '%'), numberField('value', 'Of value', 240, ''),
    ], (v) => {
      const percent = finiteNumber(v.percent, 'Percentage'); const value = finiteNumber(v.value, 'Value'); const answer = percent / 100 * value;
      return calcResult(answer, 'result', `${percent}/100*${value}`, [{ label: `${answer} is what % of ${value}?`, value: value === 0 ? 'Undefined' : `${trimNumber(answer / value * 100, 8)}%` }]);
    }),
    calculatorTool('percentage-change', 'Percentage change calculator', 'Measure increase or decrease relative to a starting value.', 'calculator', [
      numberField('from', 'Starting value', 80, ''), numberField('to', 'New value', 104, ''),
    ], (v) => {
      const from = finiteNumber(v.from, 'Starting value'); const to = finiteNumber(v.to, 'New value');
      if (from === 0) throw new Error('Starting value cannot be zero for percentage change.');
      const change = (to - from) / Math.abs(from) * 100;
      return calcResult(change, change >= 0 ? '% increase' : '% decrease', `(${to}-${from})/abs(${from})*100`, [{ label: 'Absolute change', value: to - from }, { label: 'Multiplier', value: to / from }]);
    }),
    calculatorTool('quadratic', 'Quadratic equation solver', 'Solve ax² + bx + c = 0 and inspect the discriminant.', 'calculator', [
      numberField('a', 'Coefficient a', 1, ''), numberField('b', 'Coefficient b', -3, ''), numberField('c', 'Coefficient c', 2, ''),
    ], (v) => {
      const a = finiteNumber(v.a, 'Coefficient a'); const b = finiteNumber(v.b, 'Coefficient b'); const c = finiteNumber(v.c, 'Coefficient c');
      if (a === 0) throw new Error('Coefficient a must not be zero for a quadratic equation.');
      const d = b * b - 4 * a * c;
      const apexX = -b / (2 * a); const apexY = a * apexX * apexX + b * apexX + c;
      if (d >= 0) {
        const root1 = (-b + Math.sqrt(d)) / (2 * a); const root2 = (-b - Math.sqrt(d)) / (2 * a);
        return calcResult(`${trimNumber(root1, 10)}, ${trimNumber(root2, 10)}`, 'real roots', `(-(${b})+sqrt(${d}))/(2*${a})`, [{ label: 'x₁', value: root1 }, { label: 'x₂', value: root2 }, { label: 'Discriminant', value: d }, { label: 'Apex X coordinate', value: apexX }, { label: 'Apex Y coordinate', value: apexY }], '', { meta: { a, b, c } });
      }
      const real = -b / (2 * a); const imaginary = Math.sqrt(-d) / Math.abs(2 * a);
      return calcResult(`${trimNumber(real, 8)} ± ${trimNumber(imaginary, 8)}i`, 'complex roots', `${-b}/(2*${a})`, [{ label: 'Real part', value: real }, { label: 'Imaginary magnitude', value: imaginary }, { label: 'Discriminant', value: d }, { label: 'Apex X coordinate', value: apexX }, { label: 'Apex Y coordinate', value: apexY }], '', { meta: { a, b, c } });
    }),
    calculatorTool('statistics', 'Mean, median & mode', 'Summarize a comma-separated list of numeric observations.', 'calculator', [
      textField('values', 'Values', '4, 7, 7, 9, 13, 15', { full: true, placeholder: '1, 2, 3, 4', numericList: true, help: 'Use commas or spaces between values.' }),
    ], (v) => {
      const values = parseNumberList(v.values); const sorted = [...values].sort((a, b) => a - b); const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const middle = Math.floor(sorted.length / 2); const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
      const counts = new Map(); values.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
      const maxCount = Math.max(...counts.values()); const modes = maxCount === 1 ? [] : [...counts].filter(([, count]) => count === maxCount).map(([item]) => item);
      return calcResult(mean, 'mean', `(${values.join('+')})/${values.length}`, [{ label: 'Median', value: median }, { label: 'Mode', value: modes.length ? modes.join(', ') : 'No mode' }, { label: 'Count', value: values.length }, { label: 'Range', value: sorted.at(-1) - sorted[0] }]);
    }),
    calculatorTool('standard-deviation', 'Standard deviation calculator', 'Calculate population or sample spread for a list of values.', 'calculator', [
      textField('values', 'Values', '10, 12, 13, 16, 19', { full: true, numericList: true, help: 'Use commas or spaces between values.' }),
      selectField('type', 'Method', 'population', [{ value: 'population', label: 'Population (N)' }, { value: 'sample', label: 'Sample (N − 1)' }]),
    ], (v) => {
      const values = parseNumberList(v.values); if (v.type === 'sample' && values.length < 2) throw new Error('Sample standard deviation needs at least two values.');
      const mean = values.reduce((a, b) => a + b, 0) / values.length; const sum = values.reduce((total, item) => total + Math.pow(item - mean, 2), 0);
      const divisor = v.type === 'sample' ? values.length - 1 : values.length; const variance = sum / divisor;
      return calcResult(Math.sqrt(variance), 'standard deviation', `sqrt(${sum}/${divisor})`, [{ label: 'Variance', value: variance }, { label: 'Mean', value: mean }, { label: 'Count', value: values.length }]);
    }),
    calculatorTool('ratio-scale', 'Ratio scaling calculator', 'Scale one side of a ratio while preserving proportion.', 'calculator', [
      numberField('a', 'Ratio A', 16, ''), numberField('b', 'Ratio B', 9, ''), numberField('newA', 'New A', 1920, '', { full: true }),
    ], (v) => {
      const a = finiteNumber(v.a, 'Ratio A'); const b = finiteNumber(v.b, 'Ratio B'); const newA = finiteNumber(v.newA, 'New A');
      if (a === 0) throw new Error('Ratio A cannot be zero.'); const newB = newA * b / a;
      return calcResult(newB, 'scaled B', `${newA}*${b}/${a}`, [{ label: 'Scale factor', value: newA / a }, { label: 'Original ratio', value: `${a}:${b}` }, { label: 'Scaled ratio', value: `${trimNumber(newA, 6)}:${trimNumber(newB, 6)}` }]);
    }),
    calculatorTool('gcd-lcm', 'GCD & LCM calculator', 'Find the greatest common divisor and least common multiple of two integers.', 'calculator', [
      numberField('a', 'Integer A', 84, '', { step: 1 }), numberField('b', 'Integer B', 126, '', { step: 1 }),
    ], (v) => {
      const a = Math.trunc(finiteNumber(v.a, 'Integer A')); const b = Math.trunc(finiteNumber(v.b, 'Integer B')); const divisor = gcd(a, b); const multiple = divisor === 0 ? 0 : Math.abs(a * b) / divisor;
      return calcResult(divisor, 'greatest common divisor', `${Math.abs(a)}*${Math.abs(b)}/${multiple || 1}`, [{ label: 'Least common multiple', value: multiple }, { label: 'Reduced ratio', value: divisor ? `${a / divisor}:${b / divisor}` : '0:0' }]);
    }),
    calculatorTool('combinations', 'Combinations calculator', 'Count selections where order does not matter: n choose r.', 'calculator', [
      numberField('n', 'Total items (n)', 10, '', { min: 0, step: 1 }), numberField('r', 'Selected items (r)', 3, '', { min: 0, step: 1 }),
    ], (v) => {
      const n = Math.trunc(finiteNumber(v.n, 'n')); const r = Math.trunc(finiteNumber(v.r, 'r')); const result = nChooseR(n, r);
      return calcResult(result, 'combinations', `${n}!/(${r}!*${n-r}!)`, [{ label: 'Notation', value: `C(${n}, ${r})` }, { label: 'Order matters?', value: 'No' }]);
    }),
    calculatorTool('permutations', 'Permutations calculator', 'Count arrangements where order matters.', 'calculator', [
      numberField('n', 'Total items (n)', 10, '', { min: 0, step: 1 }), numberField('r', 'Arranged items (r)', 3, '', { min: 0, step: 1 }),
    ], (v) => {
      const n = Math.trunc(finiteNumber(v.n, 'n')); const r = Math.trunc(finiteNumber(v.r, 'r')); if (n < 0 || r < 0 || r > n) throw new Error('Require whole numbers with 0 ≤ r ≤ n.');
      let result = 1; for (let i = 0; i < r; i += 1) result *= n - i;
      return calcResult(result, 'permutations', `${n}!/${n-r}!`, [{ label: 'Notation', value: `P(${n}, ${r})` }, { label: 'Order matters?', value: 'Yes' }]);
    }),
    calculatorTool('decimal-fraction', 'Decimal to fraction', 'Approximate a decimal as a reduced fraction.', 'calculator', [
      numberField('decimal', 'Decimal', 0.375, '', { full: true }), numberField('denominator', 'Maximum denominator', 10000, '', { min: 1, step: 1, full: true }),
    ], (v) => {
      const decimal = finiteNumber(v.decimal, 'Decimal'); const max = Math.max(1, Math.trunc(positive(v.denominator, 'Maximum denominator'))); const fraction = decimalToFraction(decimal, 1e-12, max);
      return calcResult(`${fraction.numerator}/${fraction.denominator}`, 'fraction', `${fraction.numerator}/${fraction.denominator}`, [{ label: 'Decimal check', value: fraction.numerator / fraction.denominator }, { label: 'Approximation error', value: Math.abs(decimal - fraction.numerator / fraction.denominator) }]);
    }),
  ];

  const SCIENCE_TOOLS = [
    calculatorTool('ohms-law', 'Ohm’s law calculator', 'Use voltage and current to calculate resistance and electric power.', 'flask', [
      numberField('voltage', 'Voltage', 12, 'V'), numberField('current', 'Current', 2, 'A'),
    ], (v) => {
      const voltage = finiteNumber(v.voltage, 'Voltage'); const current = finiteNumber(v.current, 'Current'); if (current === 0) throw new Error('Current cannot be zero when solving resistance.');
      return calcResult(voltage / current, 'Ω resistance', `${voltage}/${current}`, [{ label: 'Power', value: voltage * current, suffix: ' W' }, { label: 'Voltage', value: voltage, suffix: ' V' }, { label: 'Current', value: current, suffix: ' A' }]);
    }),
    calculatorTool('electric-power', 'Electric power calculator', 'Calculate DC electrical power and energy use.', 'flask', [
      numberField('voltage', 'Voltage', 120, 'V'), numberField('current', 'Current', 5, 'A'), numberField('hours', 'Run time', 3, 'hours', { min: 0 }),
    ], (v) => {
      const voltage = finiteNumber(v.voltage, 'Voltage'); const current = finiteNumber(v.current, 'Current'); const hours = positive(v.hours, 'Run time', true); const power = voltage * current;
      return calcResult(power, 'watts', `${voltage}*${current}`, [{ label: 'Energy', value: power * hours / 1000, suffix: ' kWh' }, { label: 'Resistance', value: current === 0 ? 'Undefined' : voltage / current, suffix: current === 0 ? '' : ' Ω' }]);
    }),
    calculatorTool('kinetic-energy', 'Kinetic energy calculator', 'Calculate translational kinetic energy from mass and velocity.', 'flask', [
      numberField('mass', 'Mass', 80, 'kg', { min: 0 }), numberField('velocity', 'Velocity', 12, 'm/s'),
    ], (v) => {
      const mass = positive(v.mass, 'Mass', true); const velocity = finiteNumber(v.velocity, 'Velocity'); const energy = 0.5 * mass * velocity * velocity;
      return calcResult(energy, 'joules', `1/2*${mass}*${velocity}^2`, [{ label: 'Momentum', value: mass * velocity, suffix: ' kg⋅m/s' }]);
    }),
    calculatorTool('potential-energy', 'Gravitational potential energy', 'Calculate near-Earth gravitational potential energy.', 'flask', [
      numberField('mass', 'Mass', 20, 'kg', { min: 0 }), numberField('height', 'Height', 8, 'm'), numberField('gravity', 'Gravity', 9.80665, 'm/s²'),
    ], (v) => {
      const mass = positive(v.mass, 'Mass', true); const height = finiteNumber(v.height, 'Height'); const gravity = finiteNumber(v.gravity, 'Gravity');
      return calcResult(mass * gravity * height, 'joules', `${mass}*${gravity}*${height}`, [{ label: 'Force (weight)', value: mass * gravity, suffix: ' N' }]);
    }),
    calculatorTool('newtons-second-law', 'Force calculator', 'Use Newton’s second law, F = ma.', 'flask', [
      numberField('mass', 'Mass', 1200, 'kg', { min: 0 }), numberField('acceleration', 'Acceleration', 3.5, 'm/s²'),
    ], (v) => {
      const mass = positive(v.mass, 'Mass', true); const acceleration = finiteNumber(v.acceleration, 'Acceleration');
      return calcResult(mass * acceleration, 'newtons', `${mass}*${acceleration}`, [{ label: 'Mass', value: mass, suffix: ' kg' }, { label: 'Acceleration', value: acceleration, suffix: ' m/s²' }]);
    }),
    calculatorTool('momentum', 'Momentum calculator', 'Calculate linear momentum and optional impulse over a stop time.', 'flask', [
      numberField('mass', 'Mass', 1000, 'kg', { min: 0 }), numberField('velocity', 'Velocity', 20, 'm/s'), numberField('time', 'Stop time', 2, 's', { min: 0 }),
    ], (v) => {
      const mass = positive(v.mass, 'Mass', true); const velocity = finiteNumber(v.velocity, 'Velocity'); const time = positive(v.time, 'Stop time'); const momentum = mass * velocity;
      return calcResult(momentum, 'kg⋅m/s', `${mass}*${velocity}`, [{ label: 'Average stopping force', value: Math.abs(momentum / time), suffix: ' N' }, { label: 'Impulse magnitude', value: Math.abs(momentum), suffix: ' N⋅s' }]);
    }),
    calculatorTool('wave', 'Wave relation calculator', 'Relate wave speed, frequency, wavelength, and period.', 'flask', [
      numberField('speed', 'Wave speed', 343, 'm/s'), numberField('frequency', 'Frequency', 440, 'Hz', { min: 0 }),
    ], (v) => {
      const speed = finiteNumber(v.speed, 'Wave speed'); const frequency = positive(v.frequency, 'Frequency');
      return calcResult(speed / frequency, 'm wavelength', `${speed}/${frequency}`, [{ label: 'Period', value: 1 / frequency, suffix: ' s' }, { label: 'Frequency', value: frequency, suffix: ' Hz' }]);
    }),
    calculatorTool('ideal-gas', 'Ideal gas law calculator', 'Solve pressure from amount, temperature, and volume using PV = nRT.', 'flask', [
      numberField('moles', 'Amount', 1, 'mol', { min: 0 }), numberField('temperature', 'Temperature', 298.15, 'K', { min: 0 }), numberField('volume', 'Volume', 0.0245, 'm³', { min: 0 }),
    ], (v) => {
      const n = positive(v.moles, 'Amount', true); const t = positive(v.temperature, 'Temperature'); const volume = positive(v.volume, 'Volume'); const R = 8.31446261815324; const pressure = n * R * t / volume;
      return calcResult(pressure, 'Pa', `${n}*${R}*${t}/${volume}`, [{ label: 'Kilopascals', value: pressure / 1000, suffix: ' kPa' }, { label: 'Gas constant', value: '8.314462618 J/(mol⋅K)' }], 'The ideal gas law is an approximation; real gases can deviate at high pressure or low temperature.');
    }),
    calculatorTool('molarity', 'Molarity calculator', 'Calculate concentration from amount of solute and solution volume.', 'flask', [
      numberField('moles', 'Solute amount', 0.25, 'mol', { min: 0 }), numberField('liters', 'Solution volume', 0.5, 'L', { min: 0 }),
    ], (v) => {
      const moles = positive(v.moles, 'Solute amount', true); const liters = positive(v.liters, 'Solution volume');
      return calcResult(moles / liters, 'mol/L', `${moles}/${liters}`, [{ label: 'Millimolar', value: moles / liters * 1000, suffix: ' mM' }]);
    }),
    calculatorTool('element-shape', 'Element to shape calculator', 'Estimate a shaped element’s volume, mass, and weight from its reference density.', 'atom', [
      selectField('element', 'Element', 'Al', ELEMENTS.map((element) => ({ value: element.symbol, label: `${element.atomicNumber}. ${element.name} (${element.symbol}) · ${element.density.toFixed(4)} g/cm³` })), 'All 118 elements are included; displayed densities are rounded to four decimals while calculations use the stored reference precision.', { full: true }),
      selectField('shape', '3D shape', 'cube', [
        { value: 'cube', label: 'Cube' }, { value: 'box', label: 'Rectangular prism' }, { value: 'sphere', label: 'Sphere' },
        { value: 'cylinder', label: 'Cylinder' }, { value: 'cone', label: 'Cone' }, { value: 'pyramid', label: 'Rectangular pyramid' },
        { value: 'triangular', label: 'Triangular prism' }, { value: 'ellipsoid', label: 'Ellipsoid' },
      ]),
      selectField('dimensionUnit', 'Dimension unit', 'cm', [
        { value: 'mm', label: 'Millimeters (mm)' }, { value: 'cm', label: 'Centimeters (cm)' }, { value: 'm', label: 'Meters (m)' },
        { value: 'in', label: 'Inches (in)' }, { value: 'ft', label: 'Feet (ft)' },
      ]),
      numberField('cubeSide', 'Side', 10, 'selected units', { min: 0, when: { field: 'shape', values: ['cube'] } }),
      numberField('boxLength', 'Length', 10, 'selected units', { min: 0, when: { field: 'shape', values: ['box'] } }),
      numberField('boxWidth', 'Width', 8, 'selected units', { min: 0, when: { field: 'shape', values: ['box'] } }),
      numberField('boxHeight', 'Height', 6, 'selected units', { min: 0, when: { field: 'shape', values: ['box'] } }),
      numberField('sphereRadius', 'Radius', 5, 'selected units', { min: 0, when: { field: 'shape', values: ['sphere'] } }),
      numberField('cylinderRadius', 'Radius', 5, 'selected units', { min: 0, when: { field: 'shape', values: ['cylinder'] } }),
      numberField('cylinderHeight', 'Height', 10, 'selected units', { min: 0, when: { field: 'shape', values: ['cylinder'] } }),
      numberField('coneRadius', 'Radius', 5, 'selected units', { min: 0, when: { field: 'shape', values: ['cone'] } }),
      numberField('coneHeight', 'Height', 10, 'selected units', { min: 0, when: { field: 'shape', values: ['cone'] } }),
      numberField('pyramidLength', 'Base length', 10, 'selected units', { min: 0, when: { field: 'shape', values: ['pyramid'] } }),
      numberField('pyramidWidth', 'Base width', 8, 'selected units', { min: 0, when: { field: 'shape', values: ['pyramid'] } }),
      numberField('pyramidHeight', 'Height', 6, 'selected units', { min: 0, when: { field: 'shape', values: ['pyramid'] } }),
      numberField('triangleBase', 'Triangle base', 8, 'selected units', { min: 0, when: { field: 'shape', values: ['triangular'] } }),
      numberField('triangleHeight', 'Triangle height', 6, 'selected units', { min: 0, when: { field: 'shape', values: ['triangular'] } }),
      numberField('prismLength', 'Prism length', 10, 'selected units', { min: 0, when: { field: 'shape', values: ['triangular'] } }),
      numberField('axisA', 'Semi-axis a', 5, 'selected units', { min: 0, when: { field: 'shape', values: ['ellipsoid'] } }),
      numberField('axisB', 'Semi-axis b', 4, 'selected units', { min: 0, when: { field: 'shape', values: ['ellipsoid'] } }),
      numberField('axisC', 'Semi-axis c', 3, 'selected units', { min: 0, when: { field: 'shape', values: ['ellipsoid'] } }),
    ], (v) => {
      const element = ELEMENTS.find((item) => item.symbol === v.element);
      if (!element) throw new Error('Choose a valid element.');
      const dimension = (id, label) => positive(v[id], label);
      let volume;
      let expression;
      switch (v.shape) {
        case 'cube': { const side = dimension('cubeSide', 'Side'); volume = side ** 3; expression = `${side}^3`; break; }
        case 'box': { const l = dimension('boxLength', 'Length'); const w = dimension('boxWidth', 'Width'); const h = dimension('boxHeight', 'Height'); volume = l * w * h; expression = `${l}*${w}*${h}`; break; }
        case 'sphere': { const r = dimension('sphereRadius', 'Radius'); volume = 4 * Math.PI * r ** 3 / 3; expression = `4*pi*${r}^3/3`; break; }
        case 'cylinder': { const r = dimension('cylinderRadius', 'Radius'); const h = dimension('cylinderHeight', 'Height'); volume = Math.PI * r ** 2 * h; expression = `pi*${r}^2*${h}`; break; }
        case 'cone': { const r = dimension('coneRadius', 'Radius'); const h = dimension('coneHeight', 'Height'); volume = Math.PI * r ** 2 * h / 3; expression = `pi*${r}^2*${h}/3`; break; }
        case 'pyramid': { const l = dimension('pyramidLength', 'Base length'); const w = dimension('pyramidWidth', 'Base width'); const h = dimension('pyramidHeight', 'Height'); volume = l * w * h / 3; expression = `${l}*${w}*${h}/3`; break; }
        case 'triangular': { const b = dimension('triangleBase', 'Triangle base'); const h = dimension('triangleHeight', 'Triangle height'); const l = dimension('prismLength', 'Prism length'); volume = b * h * l / 2; expression = `${b}*${h}*${l}/2`; break; }
        case 'ellipsoid': { const a = dimension('axisA', 'Semi-axis a'); const b = dimension('axisB', 'Semi-axis b'); const c = dimension('axisC', 'Semi-axis c'); volume = 4 * Math.PI * a * b * c / 3; expression = `4*pi*${a}*${b}*${c}/3`; break; }
        default: throw new Error('Choose a valid 3D shape.');
      }
      const factors = { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 };
      const factor = factors[v.dimensionUnit];
      if (!factor) throw new Error('Choose a valid dimension unit.');
      const volumeCm3 = volume * factor ** 3;
      const massGrams = volumeCm3 * element.density;
      const massKg = massGrams / 1000;
      const metricDimensions = ['mm', 'cm', 'm'].includes(v.dimensionUnit);
      const alternateVolume = metricDimensions ? volumeCm3 / 16.387064 : volumeCm3;
      return calcResult(volume, `${v.dimensionUnit}³ volume`, expression, [
        { label: metricDimensions ? 'Imperial volume' : 'Metric volume', value: alternateVolume, suffix: metricDimensions ? ' in³' : ' cm³' },
        { label: 'Mass', value: massKg, suffix: ' kg' },
        { label: 'Mass', value: massGrams, suffix: ' g' },
        { label: 'Weight', value: massKg / 0.45359237, suffix: ' lb' },
        { label: 'Reference density', value: element.density, suffix: ' g/cm³' },
        { label: 'Reference state', value: `${element.phase}${element.estimated ? ' · predicted density' : ''}` },
      ], `Density varies with temperature, pressure, allotrope, and purity. Gas densities use standard-condition references; values marked predicted are theoretical because no bulk sample has been measured.`, { meta: { shape: v.shape, element: element.symbol, phase: element.phase } });
    }, { note: 'This is a mathematical density model, not guidance for handling reactive, toxic, or radioactive elements.' }),
  ].map((tool) => ({ ...tool, icon: 'rocket' }));

  const EVERYDAY_TOOLS = [
    calculatorTool('trip-fuel-cost', 'Trip fuel cost calculator', 'Estimate fuel needed and cost for a road trip.', 'home', [
      selectField('system', 'Measurement system', 'metric', [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Miles / US gallons' }], '', { segmented: true, full: true }),
      numberField('distance', 'Trip distance', 500, 'km or mi', { min: 0 }), numberField('economy', 'Consumption / economy', 0.08, 'L/km or mpg', { min: 0 }), numberField('price', 'Fuel price', 1.65, 'per L or US gal', { min: 0 }),
    ], (v) => {
      const distance = positive(v.distance, 'Trip distance', true); const economy = positive(v.economy, 'Fuel consumption / economy'); const price = positive(v.price, 'Fuel price', true);
      const imperial = v.system === 'imperial';
      const fuel = imperial ? distance / economy : distance * economy;
      return calcResult(fuel * price, 'trip cost', imperial ? `${distance}/${economy}*${price}` : `${distance}*${economy}*${price}`, [
        { label: 'Fuel needed', value: fuel, suffix: imperial ? ' US gal' : ' L' },
        { label: `Cost per ${imperial ? 'mile' : 'kilometer'}`, value: distance === 0 ? 0 : fuel * price / distance, prefix: '$' },
      ], '', { currency: true });
    }),
    calculatorTool('paint', 'Paint coverage calculator', 'Estimate paint volume from wall area, coverage, and coats.', 'home', [
      selectField('system', 'Measurement system', 'metric', [{ value: 'metric', label: 'm² / liters' }, { value: 'imperial', label: 'ft² / US gallons' }], '', { segmented: true, full: true }),
      numberField('area', 'Paintable area', 60, 'm² or ft²', { min: 0 }), numberField('coverage', 'Coverage', 10, 'm²/L or ft²/gal', { min: 0 }), numberField('coats', 'Coats', 2, '', { min: 1, step: 1 }),
      numberField('buffer', 'Extra buffer', 0, '%', { min: 0 }),
    ], (v) => {
      const area = positive(v.area, 'Area', true); const coverage = positive(v.coverage, 'Coverage'); const coats = Math.max(1, Math.round(positive(v.coats, 'Coats'))); const buffer = positive(v.buffer, 'Buffer', true); const basePaint = area * coats / coverage; const paint = basePaint * (1 + buffer / 100); const imperial = v.system === 'imperial';
      return calcResult(paint, imperial ? 'US gallons of paint' : 'liters of paint', `${area}*${coats}/${coverage}*(1+${buffer}/100)`, [{ label: 'Before buffer', value: basePaint, suffix: imperial ? ' US gal' : ' L' }, { label: 'Buffer', value: buffer, suffix: '%' }, { label: 'Coated area', value: area * coats, suffix: imperial ? ' ft²' : ' m²' }]);
    }),
    calculatorTool('recipe-scale', 'Recipe scaling calculator', 'Scale any ingredient quantity to a new serving count.', 'home', [
      numberField('quantity', 'Original ingredient amount', 2.5, 'units'), numberField('servings', 'Original servings', 4, '', { min: 0 }), numberField('newServings', 'New servings', 10, '', { min: 0 }),
    ], (v) => {
      const quantity = finiteNumber(v.quantity, 'Ingredient amount'); const servings = positive(v.servings, 'Original servings'); const next = positive(v.newServings, 'New servings', true); const factor = next / servings;
      return calcResult(quantity * factor, 'scaled units', `${quantity}*${next}/${servings}`, [{ label: 'Scale factor', value: factor }, { label: 'Per serving', value: quantity / servings, suffix: ' units' }]);
    }),
    calculatorTool('unit-price', 'Unit price comparison', 'Compare two packages by normalized price.', 'home', [
      numberField('priceA', 'Package A price', 6.49, '$', { min: 0 }), numberField('amountA', 'Package A amount', 18, 'units', { min: 0 }),
      numberField('priceB', 'Package B price', 8.99, '$', { min: 0 }), numberField('amountB', 'Package B amount', 30, 'units', { min: 0 }),
    ], (v) => {
      const priceA = positive(v.priceA, 'Package A price', true); const amountA = positive(v.amountA, 'Package A amount'); const priceB = positive(v.priceB, 'Package B price', true); const amountB = positive(v.amountB, 'Package B amount');
      const unitA = priceA / amountA; const unitB = priceB / amountB; const winner = unitA <= unitB ? 'Package A' : 'Package B';
      return calcResult(winner, 'is the better value', `${Math.min(unitA, unitB)}`, [{ label: 'Package A per unit', value: unitA, prefix: '$' }, { label: 'Package B per unit', value: unitB, prefix: '$' }, { label: 'Difference per unit', value: Math.abs(unitA - unitB), prefix: '$' }]);
    }),
    calculatorTool('mileage', 'Mileage reimbursement calculator', 'Calculate a mileage reimbursement from distance and rate.', 'home', [
      selectField('system', 'Distance unit', 'imperial', [{ value: 'imperial', label: 'Miles' }, { value: 'metric', label: 'Kilometers' }], '', { segmented: true, full: true }),
      numberField('distance', 'Business distance', 240, 'mi or km', { min: 0 }), numberField('rate', 'Rate per distance unit', 0.7, '$', { min: 0 }),
    ], (v) => {
      const distance = positive(v.distance, 'Distance', true); const rate = positive(v.rate, 'Rate', true);
      const suffix = v.system === 'metric' ? 'km' : 'mi';
      return calcResult(distance * rate, 'reimbursement', `${distance}*${rate}`, [{ label: 'Distance', value: distance, suffix: ` ${suffix}` }, { label: 'Rate', value: rate, prefix: '$', suffix: `/${suffix}` }], 'Enter the rate that applies to your organization and jurisdiction.', { currency: true });
    }),
    calculatorTool('work-time', 'Work time calculator', 'Find elapsed paid time after an unpaid break.', 'clock', [
      selectField('format', 'Time format', 'decimal', [{ value: 'decimal', label: '24h decimal' }, { value: 'clock', label: 'Actual time' }], '', { segmented: true, full: true }),
      numberField('startDecimal', 'Start time', 8.5, '24h decimal', { when: { field: 'format', values: ['decimal'] } }),
      numberField('endDecimal', 'End time', 17.25, '24h decimal', { when: { field: 'format', values: ['decimal'] }, help: 'Overnight shifts are handled automatically.' }),
      textField('startTime', 'Start time', '08:30', { time12: true, periodDefault: 'am', placeholder: '00:00', when: { field: 'format', values: ['clock'] } }),
      textField('endTime', 'End time', '05:15', { time12: true, periodDefault: 'pm', placeholder: '00:00', when: { field: 'format', values: ['clock'] }, help: 'Use 12-hour time; the colon is inserted automatically.' }),
      numberField('break', 'Unpaid break', 30, 'minutes', { min: 0 }),
    ], (v) => {
      const parseClock = (raw, period, label) => {
        const match = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
        const hour = Number(match?.[1]); const minute = Number(match?.[2]);
        if (!match || hour < 1 || hour > 12 || minute > 59) throw new Error(`${label} must use a valid 12-hour time such as 08:30.`);
        return (hour % 12) + (period === 'pm' ? 12 : 0) + minute / 60;
      };
      const actual = v.format === 'clock';
      const start = actual ? parseClock(v.startTime, v.startTimePeriod, 'Start time') : finiteNumber(v.startDecimal, 'Start time');
      let end = actual ? parseClock(v.endTime, v.endTimePeriod, 'End time') : finiteNumber(v.endDecimal, 'End time');
      if (!actual && (start < 0 || start > 24 || end < 0 || end > 48)) throw new Error('Decimal times must be between 0 and 24 (or 48 for the end).');
      const breakMinutes = positive(v.break, 'Break', true); if (end < start) end += 24;
      const hours = end - start - breakMinutes / 60; if (hours < 0) throw new Error('Break is longer than the shift.'); const whole = Math.floor(hours); const minutes = Math.round((hours - whole) * 60);
      return calcResult(`${whole}h ${minutes}m`, 'paid time', `(${end}-${start})-${breakMinutes}/60`, [{ label: 'Decimal hours', value: hours }, { label: 'Break', value: breakMinutes, suffix: ' min' }]);
    }),
    calculatorTool('date-difference', 'Date difference calculator', 'Count exact elapsed calendar days between two dates.', 'clock', [
      dateField('start', 'Start date', '2025-01-01'), dateField('end', 'End date', '2026-01-01'),
    ], (v) => {
      const start = new Date(`${v.start}T00:00:00Z`); const end = new Date(`${v.end}T00:00:00Z`); if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error('Choose two valid dates.');
      const startSerial = Math.floor(start.getTime() / 86400000); const endSerial = Math.floor(end.getTime() / 86400000); const days = Math.abs(endSerial - startSerial);
      const ordinal = (date) => Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000) + 1;
      return calcResult(days, 'days', `abs(${endSerial}-${startSerial})`, [
        { label: 'Weeks', value: days / 7 }, { label: 'Months (average)', value: days / 30.436875 }, { label: 'Years (average)', value: days / 365.2425 },
        { label: 'Start day of year', value: `${ordinal(start)} of ${((Date.UTC(start.getUTCFullYear() + 1, 0, 1) - Date.UTC(start.getUTCFullYear(), 0, 1)) / 86400000)}` },
        { label: 'End day of year', value: `${ordinal(end)} of ${((Date.UTC(end.getUTCFullYear() + 1, 0, 1) - Date.UTC(end.getUTCFullYear(), 0, 1)) / 86400000)}` },
        { label: 'Direction', value: end >= start ? 'Forward' : 'Reverse' },
      ], 'Calendar serial-day subtraction counts leap days exactly. Months and years are average-length equivalents.');
    }),
    calculatorTool('fuel-mix', 'Two-stroke fuel mix', 'Calculate oil volume for a fuel-to-oil ratio.', 'home', [
      selectField('system', 'Measurement system', 'metric', [{ value: 'metric', label: 'Liters / milliliters' }, { value: 'imperial', label: 'US gal / fl oz' }], '', { segmented: true, full: true }),
      numberField('fuel', 'Fuel volume', 5, 'L or US gal', { min: 0 }), numberField('ratio', 'Fuel ratio', 50, ':1', { min: 0 }),
    ], (v) => {
      const fuel = positive(v.fuel, 'Fuel volume', true); const ratio = positive(v.ratio, 'Ratio'); const imperial = v.system === 'imperial';
      if (imperial) {
        const oilGallons = fuel / ratio; const oilOunces = oilGallons * 128;
        return calcResult(oilOunces, 'US fl oz oil', `${fuel}*128/${ratio}`, [{ label: 'Oil gallons', value: oilGallons, suffix: ' US gal' }, { label: 'Mixture total', value: fuel + oilGallons, suffix: ' US gal' }]);
      }
      const oilLiters = fuel / ratio;
      return calcResult(oilLiters * 1000, 'mL oil', `${fuel}*1000/${ratio}`, [{ label: 'Oil liters', value: oilLiters, suffix: ' L' }, { label: 'Mixture total', value: fuel + oilLiters, suffix: ' L' }]);
    }),
  ];

  const SHOE_SYSTEM_OPTIONS = [
    { value: 'us', label: 'US size' }, { value: 'uk', label: 'UK size' }, { value: 'eu', label: 'EU size' },
    { value: 'jp', label: 'Japan (cm)' }, { value: 'cm', label: 'Foot length (cm)' }, { value: 'mondo', label: 'Mondopoint (mm)' },
  ];
  const SHOE_OFFSETS = {
    men: { us: 22, uk: 23 }, women: { us: 21, uk: 23 }, child: { us: 9.25, uk: 10.25 }, youth: { us: 22.5, uk: 23.5 },
  };

  function shoeLengthCm(size, system, profile) {
    const value = finiteNumber(size, 'Shoe size');
    if (system === 'cm' || system === 'jp') return value;
    if (system === 'mondo') return value / 10;
    if (system === 'eu') return value / 1.5 - 1.5;
    const offset = SHOE_OFFSETS[profile]?.[system];
    if (!Number.isFinite(offset)) throw new Error('Choose a supported shoe profile and size system.');
    return (value + offset) * 2.54 / 3;
  }

  function shoeSizeFromLength(lengthCm, system, profile) {
    if (system === 'cm' || system === 'jp') return lengthCm;
    if (system === 'mondo') return lengthCm * 10;
    if (system === 'eu') return 1.5 * (lengthCm + 1.5);
    return 3 * lengthCm / 2.54 - SHOE_OFFSETS[profile][system];
  }

  function commonShoeSize(value, system) {
    if (system === 'mondo') return Math.round(value / 5) * 5;
    if (system === 'cm' || system === 'jp') return Math.round(value * 10) / 10;
    return Math.round(value * 2) / 2;
  }

  function clothingInternational(profile, anchor) {
    if (profile === 'men') {
      if (anchor < 34) return 'XS'; if (anchor < 38) return 'S'; if (anchor < 42) return 'M';
      if (anchor < 46) return 'L'; if (anchor < 50) return 'XL'; return 'XXL';
    }
    if (profile === 'women') {
      if (anchor <= 0) return 'XXS'; if (anchor <= 2) return 'XS'; if (anchor <= 6) return 'S';
      if (anchor <= 10) return 'M'; if (anchor <= 14) return 'L'; if (anchor <= 18) return 'XL'; return 'XXL';
    }
    if (anchor <= 62) return '3–6 months'; if (anchor <= 74) return '6–12 months'; if (anchor <= 86) return '1–2 years';
    if (anchor <= 98) return '2–3 years'; if (anchor <= 110) return '4–5 years'; if (anchor <= 122) return '6–7 years';
    if (anchor <= 134) return '8–9 years'; if (anchor <= 146) return '10–11 years'; if (anchor <= 158) return '12–13 years'; return '14+ years';
  }

  function clothingAnchor(profile, system, size) {
    const value = finiteNumber(size, 'Clothing size');
    if (profile === 'men') {
      if (system === 'eu') return value - 10;
      if (system === 'jp') return value / 2.54;
      return value;
    }
    if (profile === 'women') {
      if (system === 'uk') return value - 4;
      if (system === 'eu') return value - 30;
      if (system === 'jp') return value - 5;
      return value;
    }
    return system === 'eu' || system === 'jp' ? value : 50 + value * 6;
  }

  const UK_RING_LABELS = Array.from({ length: 52 }, (_, index) => {
    const letter = String.fromCharCode(65 + Math.floor(index / 2));
    return `${letter}${index % 2 ? '½' : ''}`;
  });
  const UK_RING_OPTIONS = UK_RING_LABELS.map((label, index) => ({ value: String(index), label }));

  function ringDiameterMm(system, value, ukIndex) {
    if (system === 'diameter') return positive(value, 'Inside diameter');
    let usSize;
    if (system === 'us') usSize = finiteNumber(value, 'US ring size');
    else if (system === 'eu') return positive(value, 'EU circumference') / Math.PI;
    else if (system === 'jp') return (finiteNumber(value, 'Japanese ring size') + 40) / Math.PI;
    else usSize = 0.5 + Number(ukIndex) * 0.25;
    return 11.63 + 0.8128 * usSize;
  }

  function ringConversions(diameter) {
    const us = (diameter - 11.63) / 0.8128;
    const circumference = diameter * Math.PI;
    const ukIndex = clamp(Math.round((us - 0.5) / 0.25), 0, UK_RING_LABELS.length - 1);
    return { diameter, us, eu: circumference, jp: circumference - 40, uk: UK_RING_LABELS[ukIndex] };
  }

  const PAPER_SIZES_MM = Object.freeze({
    A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210], A6: [105, 148], A7: [74, 105], A8: [52, 74], A9: [37, 52], A10: [26, 37],
    B0: [1000, 1414], B1: [707, 1000], B2: [500, 707], B3: [353, 500], B4: [250, 353], B5: [176, 250], B6: [125, 176], B7: [88, 125], B8: [62, 88], B9: [44, 62], B10: [31, 44],
    C0: [917, 1297], C1: [648, 917], C2: [458, 648], C3: [324, 458], C4: [229, 324], C5: [162, 229], C6: [114, 162], C7: [81, 114], C8: [57, 81], C9: [40, 57], C10: [28, 40],
    Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8],
  });
  const PAPER_SIZE_OPTIONS = [
    ...Object.keys(PAPER_SIZES_MM).map((name) => ({ value: name, label: name.startsWith('A') || name.startsWith('B') || name.startsWith('C') ? `ISO ${name}` : `US ${name}` })),
    { value: 'custom', label: 'Custom dimensions' },
  ];
  const PAPER_UNIT_FACTORS = { mm: 1, cm: 10, in: 25.4 };

  const TIME_ZONE_OPTIONS = [
    ['UTC', 'UTC'], ['America/New_York', 'New York'], ['America/Chicago', 'Chicago'], ['America/Denver', 'Denver'], ['America/Phoenix', 'Phoenix'],
    ['America/Los_Angeles', 'Los Angeles'], ['America/Anchorage', 'Anchorage'], ['Pacific/Honolulu', 'Honolulu'], ['America/Toronto', 'Toronto'],
    ['America/Vancouver', 'Vancouver'], ['America/Mexico_City', 'Mexico City'], ['America/Sao_Paulo', 'São Paulo'], ['Europe/London', 'London'],
    ['Europe/Paris', 'Paris'], ['Europe/Berlin', 'Berlin'], ['Europe/Moscow', 'Moscow'], ['Africa/Cairo', 'Cairo'], ['Africa/Johannesburg', 'Johannesburg'],
    ['Asia/Dubai', 'Dubai'], ['Asia/Kolkata', 'Delhi / Kolkata'], ['Asia/Shanghai', 'Shanghai'], ['Asia/Tokyo', 'Tokyo'], ['Asia/Seoul', 'Seoul'],
    ['Asia/Singapore', 'Singapore'], ['Australia/Sydney', 'Sydney'], ['Australia/Perth', 'Perth'], ['Pacific/Auckland', 'Auckland'],
  ].map(([value, label]) => ({ value, label: `${label} · ${value}` }));
  const TIME_ZONE_LABELS = new Map(TIME_ZONE_OPTIONS.map((option) => [option.value, option.label.split(' · ')[0]]));
  const OPTIONAL_TIME_ZONE_OPTIONS = [{ value: 'none', label: 'None' }, ...TIME_ZONE_OPTIONS];

  function clock12Parts(raw, period, label) {
    const match = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) throw new Error(`${label} must use a 12-hour time such as 09:30.`);
    const hour = Number(match[1]); const minute = Number(match[2]);
    if (hour < 1 || hour > 12 || minute > 59) throw new Error(`${label} must use a valid 12-hour time.`);
    return { hour: (hour % 12) + (period === 'pm' ? 12 : 0), minute };
  }

  function zonedComponents(epochMs, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(epochMs));
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
    return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
  }

  function localTimeToEpoch(dateValue, timeValue, period, timeZone) {
    const dateMatch = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) throw new Error('Choose a valid source date.');
    const time = clock12Parts(timeValue, period, 'Source time');
    const wanted = { year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]), hour: time.hour, minute: time.minute, second: 0 };
    const wantedSerial = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute, 0);
    let epoch = wantedSerial;
    for (let pass = 0; pass < 5; pass += 1) {
      const observed = zonedComponents(epoch, timeZone);
      const observedSerial = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
      const difference = wantedSerial - observedSerial;
      epoch += difference;
      if (difference === 0) break;
    }
    const verified = zonedComponents(epoch, timeZone);
    if (verified.year !== wanted.year || verified.month !== wanted.month || verified.day !== wanted.day || verified.hour !== wanted.hour || verified.minute !== wanted.minute) {
      throw new Error('That local clock time does not exist because of a daylight-saving transition. Choose another time.');
    }
    return epoch;
  }

  function zoneOffsetMinutes(epoch, zone) {
    const parts = zonedComponents(epoch, zone);
    const localSerial = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return Math.round((localSerial - Math.floor(epoch / 1000) * 1000) / 60000);
  }

  function offsetText(minutes) {
    const sign = minutes < 0 ? '−' : '+'; const absolute = Math.abs(minutes);
    return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
  }

  function formatZoneTime(epoch, zone) {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    }).format(new Date(epoch));
    return `${formatted} · ${offsetText(zoneOffsetMinutes(epoch, zone))}`;
  }

  const DISTANCE_UNITS = [
    { value: 'mm', label: 'Millimeters' }, { value: 'cm', label: 'Centimeters' }, { value: 'm', label: 'Meters' }, { value: 'km', label: 'Kilometers' },
    { value: 'in', label: 'Inches' }, { value: 'ft', label: 'Feet' }, { value: 'mi', label: 'Miles' },
  ];
  const DISTANCE_METERS = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, mi: 1609.344 };

  function coordinateFromParts(degrees, minutes, seconds, direction, maximum, label) {
    const d = positive(degrees, `${label} degrees`, true); const m = positive(minutes, `${label} minutes`, true); const s = positive(seconds, `${label} seconds`, true);
    if (d > maximum || m >= 60 || s >= 60 || (d === maximum && (m > 0 || s > 0))) throw new Error(`${label} is outside its valid coordinate range.`);
    const sign = direction === 'S' || direction === 'W' ? -1 : 1;
    return sign * (d + m / 60 + s / 3600);
  }

  function coordinateDms(value, positiveDirection, negativeDirection, decimals) {
    let absolute = Math.abs(value); let degrees = Math.floor(absolute); let minutesFull = (absolute - degrees) * 60; let minutes = Math.floor(minutesFull); let seconds = Number(((minutesFull - minutes) * 60).toFixed(decimals));
    if (seconds >= 60) { seconds = 0; minutes += 1; }
    if (minutes >= 60) { minutes = 0; degrees += 1; }
    return `${degrees}° ${minutes}′ ${trimNumber(seconds, decimals)}″ ${value < 0 ? negativeDirection : positiveDirection}`;
  }

  function coordinateDdm(value, positiveDirection, negativeDirection) {
    const absolute = Math.abs(value); const degrees = Math.floor(absolute); const minutes = (absolute - degrees) * 60;
    return `${degrees}° ${trimNumber(minutes, 6)}′ ${value < 0 ? negativeDirection : positiveDirection}`;
  }

  const CARDINAL_32 = ['N', 'NbE', 'NNE', 'NEbN', 'NE', 'NEbE', 'ENE', 'EbN', 'E', 'EbS', 'ESE', 'SEbE', 'SE', 'SEbS', 'SSE', 'SbE', 'S', 'SbW', 'SSW', 'SWbS', 'SW', 'SWbW', 'WSW', 'WbS', 'W', 'WbN', 'WNW', 'NWbW', 'NW', 'NWbN', 'NNW', 'NbW'];
  const CARDINAL_OPTIONS = CARDINAL_32.map((label, index) => ({ value: String(index), label: `${label} · ${index * 11.25}°` }));

  function compassDegrees(type, numeric, cardinal) {
    let degrees;
    if (type === 'degrees') degrees = finiteNumber(numeric, 'Bearing');
    else if (type === 'radians') degrees = finiteNumber(numeric, 'Bearing') * 180 / Math.PI;
    else if (type === 'mils') degrees = finiteNumber(numeric, 'Bearing') * 360 / 6400;
    else degrees = Number(cardinal) * 11.25;
    return ((degrees % 360) + 360) % 360;
  }

  const EVERYDAY_CONVERTER_TOOLS = [
    calculatorTool('shoe-size', 'Shoe size converter', 'Convert approximate shoe sizes across US, UK, EU, Japanese, centimeter, and Mondopoint systems.', 'shoe', [
      selectField('profile', 'Sizing profile', 'men', [{ value: 'men', label: 'Adult men' }, { value: 'women', label: 'Adult women' }, { value: 'child', label: 'Children (C)' }, { value: 'youth', label: 'Youth (Y)' }]),
      selectField('from', 'From system', 'us', SHOE_SYSTEM_OPTIONS), selectField('to', 'To system', 'eu', SHOE_SYSTEM_OPTIONS),
      numberField('size', 'Entered size', 10, '', { full: true }),
    ], (v) => {
      const length = shoeLengthCm(v.size, v.from, v.profile); if (length <= 0 || length > 45) throw new Error('The converted foot length is outside the supported range.');
      const converted = shoeSizeFromLength(length, v.to, v.profile); const common = commonShoeSize(converted, v.to);
      return calcResult(common, SHOE_SYSTEM_OPTIONS.find((option) => option.value === v.to)?.label || 'converted size', `${converted}`, [
        { label: 'Foot length', value: length, suffix: ' cm' }, { label: 'US size', value: commonShoeSize(shoeSizeFromLength(length, 'us', v.profile), 'us') },
        { label: 'UK size', value: commonShoeSize(shoeSizeFromLength(length, 'uk', v.profile), 'uk') }, { label: 'EU size', value: commonShoeSize(shoeSizeFromLength(length, 'eu', v.profile), 'eu') },
        { label: 'Japan', value: commonShoeSize(length, 'jp'), suffix: ' cm' }, { label: 'Mondopoint', value: commonShoeSize(length * 10, 'mondo'), suffix: ' mm' },
      ], 'Shoe lasts, toe allowances, and brand charts vary. Use the result as a sizing estimate and verify against the manufacturer chart.');
    }),
    calculatorTool('clothing-size', 'Clothing size converter', 'Compare approximate men’s, women’s, and children’s regional clothing sizes.', 'shirt', [
      selectField('profile', 'Profile', 'women', [{ value: 'men', label: 'Men · jacket/chest' }, { value: 'women', label: 'Women · general apparel' }, { value: 'children', label: 'Children · age/height' }]),
      selectField('system', 'Entered system', 'us', [{ value: 'us', label: 'US' }, { value: 'uk', label: 'UK' }, { value: 'eu', label: 'EU' }, { value: 'jp', label: 'Japan' }]),
      numberField('size', 'Entered numeric size', 8, '', { full: true, help: 'Men: jacket size or Japanese chest cm. Children: age size or EU/Japan height cm.' }),
    ], (v) => {
      const anchor = clothingAnchor(v.profile, v.system, v.size);
      if (!Number.isFinite(anchor)
        || (v.profile === 'men' && anchor < 20)
        || (v.profile === 'women' && anchor < -4)
        || (v.profile === 'children' && anchor < 40)) throw new Error('Enter a supported clothing size.');
      let details;
      if (v.profile === 'men') details = [{ label: 'US', value: anchor }, { label: 'UK', value: anchor }, { label: 'EU', value: anchor + 10 }, { label: 'Japan chest reference', value: anchor * 2.54, suffix: ' cm' }];
      else if (v.profile === 'women') details = [{ label: 'US', value: anchor }, { label: 'UK', value: anchor + 4 }, { label: 'EU', value: anchor + 30 }, { label: 'Japan', value: anchor + 5 }];
      else details = [{ label: 'US age size', value: (anchor - 50) / 6, suffix: ' years' }, { label: 'UK age size', value: (anchor - 50) / 6, suffix: ' years' }, { label: 'EU height size', value: anchor, suffix: ' cm' }, { label: 'Japan height size', value: anchor, suffix: ' cm' }];
      return calcResult(clothingInternational(v.profile, anchor), 'international size band', `${anchor}`, details, 'Clothing sizes are not universal. Cut, fit, garment type, brand, and children’s growth ranges can change the appropriate size.');
    }),
    calculatorTool('ring-size', 'Ring size converter', 'Convert US, UK, EU, Japanese, and inside-diameter ring sizing.', 'ring', [
      selectField('from', 'From system', 'us', [{ value: 'us', label: 'US size' }, { value: 'uk', label: 'UK letter size' }, { value: 'eu', label: 'EU circumference (mm)' }, { value: 'jp', label: 'Japanese size' }, { value: 'diameter', label: 'Inside diameter (mm)' }]),
      selectField('to', 'To system', 'eu', [{ value: 'us', label: 'US size' }, { value: 'uk', label: 'UK letter size' }, { value: 'eu', label: 'EU circumference (mm)' }, { value: 'jp', label: 'Japanese size' }, { value: 'diameter', label: 'Inside diameter (mm)' }]),
      numberField('size', 'Numeric size', 7, '', { when: { field: 'from', values: ['us', 'eu', 'jp', 'diameter'] }, full: true }),
      selectField('ukSize', 'UK size', '26', UK_RING_OPTIONS, '', { when: { field: 'from', values: ['uk'] }, full: true }),
    ], (v) => {
      const converted = ringConversions(ringDiameterMm(v.from, v.size, v.ukSize)); if (converted.diameter < 10 || converted.diameter > 30) throw new Error('The ring diameter is outside the supported 10–30 mm range.');
      const outputs = { us: Math.round(converted.us * 4) / 4, uk: converted.uk, eu: Math.round(converted.eu * 10) / 10, jp: Math.round(converted.jp), diameter: Math.round(converted.diameter * 100) / 100 };
      return calcResult(outputs[v.to], 'converted ring size', `${converted.diameter}`, [
        { label: 'US size', value: outputs.us }, { label: 'UK size', value: outputs.uk }, { label: 'EU circumference', value: outputs.eu, suffix: ' mm' },
        { label: 'Japanese size', value: outputs.jp }, { label: 'Inside diameter', value: outputs.diameter, suffix: ' mm' },
      ], 'Ring standards and manufacturer rounding can differ slightly. Measure the inside diameter of a well-fitting ring for the best estimate.');
    }),
    calculatorTool('paper-size', 'Paper size converter', 'Convert ISO A/B/C, US paper, and custom dimensions.', 'paper', [
      selectField('preset', 'Paper format', 'A4', PAPER_SIZE_OPTIONS), selectField('outputUnit', 'Result unit', 'in', [{ value: 'mm', label: 'Millimeters' }, { value: 'cm', label: 'Centimeters' }, { value: 'in', label: 'Inches' }]),
      numberField('width', 'Custom width', 210, '', { when: { field: 'preset', values: ['custom'] } }), numberField('height', 'Custom height', 297, '', { when: { field: 'preset', values: ['custom'] } }),
      selectField('customUnit', 'Custom input unit', 'mm', [{ value: 'mm', label: 'Millimeters' }, { value: 'cm', label: 'Centimeters' }, { value: 'in', label: 'Inches' }], '', { when: { field: 'preset', values: ['custom'] } }),
    ], (v) => {
      let dimensions = PAPER_SIZES_MM[v.preset];
      if (!dimensions) { const factor = PAPER_UNIT_FACTORS[v.customUnit]; dimensions = [positive(v.width, 'Width') * factor, positive(v.height, 'Height') * factor]; }
      const factor = PAPER_UNIT_FACTORS[v.outputUnit]; const width = dimensions[0] / factor; const height = dimensions[1] / factor;
      return calcResult(`${trimNumber(width, 6)} × ${trimNumber(height, 6)}`, v.outputUnit, `${dimensions[0]}*${dimensions[1]}`, [
        { label: 'Portrait', value: `${trimNumber(Math.min(width, height), 6)} × ${trimNumber(Math.max(width, height), 6)} ${v.outputUnit}` },
        { label: 'Landscape', value: `${trimNumber(Math.max(width, height), 6)} × ${trimNumber(Math.min(width, height), 6)} ${v.outputUnit}` },
        { label: 'Area', value: width * height, suffix: ` ${v.outputUnit}²` }, { label: 'Aspect ratio', value: Math.max(width, height) / Math.min(width, height) },
      ]);
    }),
    calculatorTool('map-scale', 'Map and drawing scale converter', 'Convert between printed or model distance and full-size real distance.', 'map', [
      selectField('inputType', 'Entered distance represents', 'drawing', [{ value: 'drawing', label: 'Printed / model distance' }, { value: 'real', label: 'Real distance' }], '', { segmented: true, full: true }),
      numberField('scale', 'Scale denominator · 1:n', 50000, '', { min: 0 }), numberField('distance', 'Entered distance', 2.5, '', { min: 0 }),
      selectField('inputUnit', 'Entered unit', 'cm', DISTANCE_UNITS), selectField('outputUnit', 'Result unit', 'km', DISTANCE_UNITS),
    ], (v) => {
      const scale = positive(v.scale, 'Scale denominator'); const entered = positive(v.distance, 'Distance', true); const enteredMeters = entered * DISTANCE_METERS[v.inputUnit];
      const drawingMeters = v.inputType === 'drawing' ? enteredMeters : enteredMeters / scale; const realMeters = v.inputType === 'drawing' ? enteredMeters * scale : enteredMeters;
      const resultMeters = v.inputType === 'drawing' ? realMeters : drawingMeters; const output = resultMeters / DISTANCE_METERS[v.outputUnit];
      return calcResult(output, v.outputUnit, v.inputType === 'drawing' ? `${entered}*${DISTANCE_METERS[v.inputUnit]}*${scale}/${DISTANCE_METERS[v.outputUnit]}` : `${entered}*${DISTANCE_METERS[v.inputUnit]}/${scale}/${DISTANCE_METERS[v.outputUnit]}`, [
        { label: 'Scale', value: `1:${formatNumber(scale, { precision: 0, separators: true })}` }, { label: 'Drawing / model distance', value: drawingMeters / 0.01, suffix: ' cm' }, { label: 'Real distance', value: realMeters / 1000, suffix: ' km' },
      ]);
    }),
  ];

  const SCIENCE_CONVERTER_TOOLS = [
    calculatorTool('coordinate-format', 'Coordinate format converter', 'Convert latitude and longitude between decimal degrees, DMS, and degrees-decimal-minutes.', 'coordinates', [
      selectField('format', 'Entered coordinate format', 'decimal', [{ value: 'decimal', label: 'Decimal degrees (DD)' }, { value: 'dms', label: 'Degrees, minutes, seconds' }, { value: 'ddm', label: 'Degrees, decimal minutes' }], '', { segmented: true, full: true }),
      numberField('latitude', 'Latitude', 40.7128, '°', { when: { field: 'format', values: ['decimal'] } }), numberField('longitude', 'Longitude', -74.006, '°', { when: { field: 'format', values: ['decimal'] } }),
      numberField('latDegrees', 'Latitude degrees', 40, '°', { when: { field: 'format', values: ['dms', 'ddm'] } }), numberField('latMinutes', 'Latitude minutes', 42, '′', { when: { field: 'format', values: ['dms', 'ddm'] } }),
      numberField('latSeconds', 'Latitude seconds', 46.08, '″', { when: { field: 'format', values: ['dms'] } }), selectField('latDirection', 'Latitude direction', 'N', [{ value: 'N', label: 'North' }, { value: 'S', label: 'South' }], '', { when: { field: 'format', values: ['dms', 'ddm'] } }),
      numberField('lonDegrees', 'Longitude degrees', 74, '°', { when: { field: 'format', values: ['dms', 'ddm'] } }), numberField('lonMinutes', 'Longitude minutes', 0, '′', { when: { field: 'format', values: ['dms', 'ddm'] } }),
      numberField('lonSeconds', 'Longitude seconds', 21.6, '″', { when: { field: 'format', values: ['dms'] } }), selectField('lonDirection', 'Longitude direction', 'W', [{ value: 'E', label: 'East' }, { value: 'W', label: 'West' }], '', { when: { field: 'format', values: ['dms', 'ddm'] } }),
    ], (v) => {
      let latitude; let longitude;
      if (v.format === 'decimal') { latitude = finiteNumber(v.latitude, 'Latitude'); longitude = finiteNumber(v.longitude, 'Longitude'); }
      else { latitude = coordinateFromParts(v.latDegrees, v.latMinutes, v.format === 'dms' ? v.latSeconds : 0, v.latDirection, 90, 'Latitude'); longitude = coordinateFromParts(v.lonDegrees, v.lonMinutes, v.format === 'dms' ? v.lonSeconds : 0, v.lonDirection, 180, 'Longitude'); }
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Latitude must be within ±90° and longitude within ±180°.');
      return calcResult(`${trimNumber(latitude, 8)}, ${trimNumber(longitude, 8)}`, 'decimal degrees', `${latitude}`, [
        { label: 'DMS', value: `${coordinateDms(latitude, 'N', 'S', 4)}, ${coordinateDms(longitude, 'E', 'W', 4)}` },
        { label: 'Degrees-decimal-minutes', value: `${coordinateDdm(latitude, 'N', 'S')}, ${coordinateDdm(longitude, 'E', 'W')}` },
        { label: 'Geo URI order', value: `geo:${trimNumber(latitude, 8)},${trimNumber(longitude, 8)}` },
      ]);
    }),
    calculatorTool('compass-bearing', 'Compass bearing converter', 'Convert degrees, cardinal directions, radians, and 6400-circle mils.', 'compass', [
      selectField('type', 'Entered bearing format', 'degrees', [{ value: 'degrees', label: 'Degrees' }, { value: 'cardinal', label: '32-point compass' }, { value: 'radians', label: 'Radians' }, { value: 'mils', label: 'NATO mils · 6400/turn' }], '', { segmented: true, full: true }),
      numberField('bearing', 'Numeric bearing', 22.5, '', { when: { field: 'type', values: ['degrees', 'radians', 'mils'] }, full: true }),
      selectField('cardinal', 'Cardinal direction', '2', CARDINAL_OPTIONS, '', { when: { field: 'type', values: ['cardinal'] }, full: true }),
    ], (v) => {
      const degrees = compassDegrees(v.type, v.bearing, v.cardinal); const index = Math.round(degrees / 11.25) % 32; const cardinal = CARDINAL_32[index];
      return calcResult(cardinal, '32-point compass direction', `${degrees}`, [
        { label: 'Degrees', value: degrees, suffix: '°' }, { label: 'Radians', value: degrees * Math.PI / 180, suffix: ' rad' }, { label: 'NATO mils', value: degrees * 6400 / 360, suffix: ' mil' },
        { label: 'Nearest 8-point direction', value: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8] },
      ], 'Mils use the NATO 6400-mil circle; other military and artillery systems can use different mil definitions.');
    }),
    calculatorTool('rain-snow-water', 'Rainfall and snow-water converter', 'Convert precipitation depth, collection volume, and snow-water equivalent.', 'precipitation', [
      selectField('inputType', 'Entered measurement', 'rain', [{ value: 'rain', label: 'Rainfall depth' }, { value: 'snow', label: 'Snow depth' }, { value: 'volume', label: 'Collected water volume' }], '', { segmented: true, full: true }),
      numberField('depth', 'Entered depth', 25, '', { when: { field: 'inputType', values: ['rain', 'snow'] } }), selectField('depthUnit', 'Depth unit', 'mm', [{ value: 'mm', label: 'Millimeters' }, { value: 'cm', label: 'Centimeters' }, { value: 'in', label: 'Inches' }], '', { when: { field: 'inputType', values: ['rain', 'snow'] } }),
      numberField('volume', 'Collected volume', 100, '', { when: { field: 'inputType', values: ['volume'] } }), selectField('volumeUnit', 'Volume unit', 'l', [{ value: 'l', label: 'Liters' }, { value: 'usgal', label: 'US gallons' }, { value: 'impgal', label: 'Imperial gallons' }], '', { when: { field: 'inputType', values: ['volume'] } }),
      numberField('area', 'Collection / ground area', 10, '', { min: 0 }), selectField('areaUnit', 'Area unit', 'm2', [{ value: 'm2', label: 'Square meters' }, { value: 'ft2', label: 'Square feet' }, { value: 'acre', label: 'Acres' }]),
      numberField('snowRatio', 'Snow-to-water ratio', 10, ':1', { min: 0, when: { field: 'inputType', values: ['snow'] }, help: '10:1 means 10 units of snow depth contain 1 unit of liquid water.' }),
    ], (v) => {
      const areaFactors = { m2: 1, ft2: 0.09290304, acre: 4046.8564224 }; const depthFactors = { mm: 1, cm: 10, in: 25.4 }; const volumeFactors = { l: 1, usgal: 3.785411784, impgal: 4.54609 };
      const area = positive(v.area, 'Area') * areaFactors[v.areaUnit]; let waterMm;
      if (v.inputType === 'volume') waterMm = positive(v.volume, 'Collected volume', true) * volumeFactors[v.volumeUnit] / area;
      else { const depthMm = positive(v.depth, 'Depth', true) * depthFactors[v.depthUnit]; waterMm = v.inputType === 'snow' ? depthMm / positive(v.snowRatio, 'Snow-to-water ratio') : depthMm; }
      const liters = waterMm * area;
      return calcResult(waterMm, 'mm water equivalent', `${liters}/${area}`, [
        { label: 'Water-equivalent depth', value: waterMm / 25.4, suffix: ' in' }, { label: 'Collected volume', value: liters, suffix: ' L' },
        { label: 'Collected volume', value: liters / 3.785411784, suffix: ' US gal' }, { label: 'Collected volume', value: liters / 4.54609, suffix: ' imp gal' },
      ], 'Snow-to-water ratio varies widely with snow type, temperature, wind, and compaction. The selected ratio is an estimate.');
    }),
  ];

  const TIME_DATE_TOOLS = [
    calculatorTool('time-zone', 'Time-zone converter', 'Convert one local clock time to multiple named locations with date-specific daylight-saving rules.', 'globe-clock', [
      dateField('date', 'Source date', '2026-07-21'), textField('time', 'Source time', '09:00', { time12: true, periodDefault: 'am', placeholder: '00:00' }),
      selectField('fromZone', 'Source location', 'America/Chicago', TIME_ZONE_OPTIONS), selectField('toZone', 'Primary destination', 'Europe/London', TIME_ZONE_OPTIONS),
      selectField('toZone2', 'Additional destination', 'Asia/Tokyo', OPTIONAL_TIME_ZONE_OPTIONS), selectField('toZone3', 'Additional destination', 'Australia/Sydney', OPTIONAL_TIME_ZONE_OPTIONS),
    ], (v) => {
      const epoch = localTimeToEpoch(v.date, v.time, v.timePeriod, v.fromZone); const destinations = [v.toZone, v.toZone2, v.toZone3].filter((zone, index, values) => zone && zone !== 'none' && values.indexOf(zone) === index);
      const primaryZone = destinations[0]; const primary = formatZoneTime(epoch, primaryZone); const details = [
        { label: `Source · ${TIME_ZONE_LABELS.get(v.fromZone) || v.fromZone}`, value: formatZoneTime(epoch, v.fromZone) },
        { label: 'UTC', value: new Date(epoch).toISOString().replace('T', ' ').replace(':00.000Z', ' UTC') },
        ...destinations.map((zone) => ({ label: TIME_ZONE_LABELS.get(zone) || zone, value: formatZoneTime(epoch, zone) })),
      ];
      return calcResult(primary, TIME_ZONE_LABELS.get(primaryZone) || primaryZone, `${epoch}/1000`, details, 'Named IANA regions apply the daylight-saving and historical offset rules available in this browser for the selected date. Ambiguous fall-back times use one valid occurrence.');
    }),
  ];

  const DIGITAL_TOOLS = [
    calculatorTool('number-base', 'Number base converter', 'Convert integers between binary, octal, decimal, and hexadecimal.', 'code', [
      textField('value', 'Number', 'FF', { full: true }),
      selectField('from', 'From base', '16', [{ value: '2', label: 'Binary (2)' }, { value: '8', label: 'Octal (8)' }, { value: '10', label: 'Decimal (10)' }, { value: '16', label: 'Hexadecimal (16)' }]),
      selectField('to', 'To base', '10', [{ value: '2', label: 'Binary (2)' }, { value: '8', label: 'Octal (8)' }, { value: '10', label: 'Decimal (10)' }, { value: '16', label: 'Hexadecimal (16)' }]),
    ], (v) => {
      const from = Number(v.from); const to = Number(v.to); const source = String(v.value || '').trim();
      if (!source) throw new Error('Enter a number to convert.'); const parsed = Number.parseInt(source, from); if (!Number.isSafeInteger(parsed) || parsed.toString(from).toLowerCase() !== source.replace(/^\+/, '').replace(/^0+(?=.)/, '').toLowerCase()) throw new Error(`“${source}” is not a valid base-${from} safe integer.`);
      const converted = parsed.toString(to).toUpperCase();
      const absolute = Math.abs(parsed); const iecUnits = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']; let iecIndex = 0; let iecValue = absolute;
      while (iecValue >= 1024 && iecIndex < iecUnits.length - 1) { iecValue /= 1024; iecIndex += 1; }
      return calcResult(converted, `base ${to}`, '', [{ label: 'Decimal value', value: parsed }, { label: 'Binary', value: parsed.toString(2) }, { label: 'Hexadecimal', value: parsed.toString(16).toUpperCase() }, { label: 'IEC binary unit value', value: `${parsed < 0 ? '−' : ''}${trimNumber(iecValue, 10)} ${iecUnits[iecIndex]}` }]);
    }),
    calculatorTool('download-time', 'Download time calculator', 'Estimate transfer time from file size and connection speed.', 'code', [
      numberField('size', 'File size', 10, 'GB', { min: 0 }), numberField('speed', 'Connection speed', 100, 'Mbit/s', { min: 0 }), numberField('efficiency', 'Real-world efficiency', 90, '%', { min: 1, max: 100 }),
    ], (v) => {
      const size = positive(v.size, 'File size', true); const speed = positive(v.speed, 'Connection speed'); const efficiency = clamp(positive(v.efficiency, 'Efficiency') / 100, 0.01, 1); const seconds = size * 8e9 / (speed * 1e6 * efficiency);
      const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.round(seconds % 60);
      return calcResult(`${h ? `${h}h ` : ''}${m ? `${m}m ` : ''}${s}s`, 'estimated time', `${size}*8*1000/${speed}/${efficiency}`, [{ label: 'Seconds', value: seconds }, { label: 'Effective speed', value: speed * efficiency, suffix: ' Mbit/s' }], 'Actual transfers also depend on latency, protocol overhead, server limits, and network congestion.');
    }),
    calculatorTool('screen-ppi', 'Screen PPI calculator', 'Calculate display pixel density from resolution and diagonal size.', 'code', [
      numberField('width', 'Horizontal pixels', 2556, 'px', { min: 0 }), numberField('height', 'Vertical pixels', 1179, 'px', { min: 0 }), numberField('diagonal', 'Diagonal size', 6.1, 'in', { min: 0 }),
    ], (v) => {
      const width = positive(v.width, 'Width'); const height = positive(v.height, 'Height'); const diagonal = positive(v.diagonal, 'Diagonal'); const ppi = Math.hypot(width, height) / diagonal;
      const ratioDivisor = gcd(width, height);
      return calcResult(ppi, 'pixels per inch', `sqrt(${width}^2+${height}^2)/${diagonal}`, [{ label: 'Total pixels', value: width * height }, { label: 'Aspect ratio', value: `${width / ratioDivisor}:${height / ratioDivisor}` }, { label: 'Megapixels', value: width * height / 1e6 }]);
    }),
    calculatorTool('aspect-ratio', 'Aspect ratio calculator', 'Scale dimensions while preserving width-to-height ratio.', 'code', [
      numberField('width', 'Ratio width', 16, '', { min: 0 }), numberField('height', 'Ratio height', 9, '', { min: 0 }), numberField('newWidth', 'New width', 1920, 'px', { min: 0 }),
    ], (v) => {
      const width = positive(v.width, 'Width'); const height = positive(v.height, 'Height'); const next = positive(v.newWidth, 'New width', true); const newHeight = next * height / width;
      return calcResult(newHeight, 'px height', `${next}*${height}/${width}`, [{ label: 'Scale', value: next / width }, { label: 'Dimensions', value: `${trimNumber(next, 5)} × ${trimNumber(newHeight, 5)}` }]);
    }),
  ];

  const UNIT_TOOL_MAP = new Map(UNIT_TOOLS.map((tool) => [tool.id, tool]));
  const everydayUnitIds = [
    'unit-length', 'unit-area', 'unit-volume', 'unit-mass', 'unit-temperature', 'unit-time', 'unit-speed', 'unit-cooking', 'unit-fuel-volume', 'unit-fuel-economy',
  ];
  const digitalUnitIds = ['unit-storage', 'unit-data-rate', 'unit-typography'];
  const scienceUnitIds = UNIT_TOOLS.map((tool) => tool.id).filter((id) => !everydayUnitIds.includes(id) && !digitalUnitIds.includes(id));

  function pickTools(source, ids) {
    const byId = new Map(source.map((tool) => [tool.id, tool]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  function toolSubcategory(id, title, tools) {
    return Object.freeze({ id, title, tools: Object.freeze(tools) });
  }

  function toolCategory(id, title, description, icon, subcategories) {
    return Object.freeze({
      id,
      title,
      description,
      icon,
      subcategories: Object.freeze(subcategories),
      tools: Object.freeze(subcategories.flatMap((subcategory) => subcategory.tools)),
    });
  }

  const everydayUnits = everydayUnitIds.map((id) => UNIT_TOOL_MAP.get(id));
  const scienceUnits = scienceUnitIds.map((id) => UNIT_TOOL_MAP.get(id));
  const digitalCatalog = [...digitalUnitIds.map((id) => UNIT_TOOL_MAP.get(id)), ...DIGITAL_TOOLS];
  const everydayConversionCatalog = [...everydayUnits, ...EVERYDAY_CONVERTER_TOOLS];
  const scienceConversionCatalog = [...scienceUnits, ...SCIENCE_CONVERTER_TOOLS];
  const timeDateCatalog = [...TIME_DATE_TOOLS, ...everydayUnits, ...EVERYDAY_TOOLS];

  const TOOL_CATEGORIES = Object.freeze([
    toolCategory('conversions', 'Everyday conversions', 'Common measurements, sizing, paper & fuel', ICONS.conversions, [
      toolSubcategory('measurements', 'Measurements', pickTools(everydayConversionCatalog, ['unit-length', 'unit-area', 'unit-volume', 'unit-mass', 'unit-temperature'])),
      toolSubcategory('personal-sizing', 'Personal sizing', pickTools(everydayConversionCatalog, ['calc-shoe-size', 'calc-clothing-size', 'calc-ring-size'])),
      toolSubcategory('paper-scale', 'Paper & scale', pickTools(everydayConversionCatalog, ['calc-paper-size', 'calc-map-scale'])),
      toolSubcategory('motion-fuel', 'Motion & fuel', pickTools(everydayConversionCatalog, ['unit-speed', 'unit-fuel-volume', 'unit-fuel-economy'])),
    ]),
    toolCategory('science-conversions', 'Science conversions', 'Engineering and laboratory units', ICONS.scienceConversions, [
      toolSubcategory('mechanics-energy', 'Mechanics & energy', pickTools(scienceConversionCatalog, ['unit-pressure', 'unit-energy', 'unit-power', 'unit-force', 'unit-angle', 'unit-frequency', 'unit-angular-velocity', 'unit-acceleration', 'unit-torque'])),
      toolSubcategory('fluids-materials', 'Fluids, heat & materials', pickTools(scienceConversionCatalog, ['unit-density', 'unit-flow', 'unit-mass-flow-rate', 'unit-dynamic-viscosity', 'unit-kinematic-viscosity', 'unit-thermal-conductivity', 'unit-specific-heat-capacity', 'unit-surface-tension', 'unit-concentration'])),
      toolSubcategory('electricity-units', 'Electricity', pickTools(scienceConversionCatalog, ['unit-charge', 'unit-current', 'unit-voltage', 'unit-resistance', 'unit-capacitance', 'unit-inductance', 'unit-conductivity-resistivity'])),
      toolSubcategory('light-radiation-magnetism', 'Light, radiation & magnetism', pickTools(scienceConversionCatalog, ['unit-illuminance', 'unit-luminous-flux', 'unit-luminance', 'unit-radioactivity', 'unit-radiation-dose', 'unit-magnetic-flux', 'unit-magnetic-field'])),
      toolSubcategory('earth-navigation', 'Earth, weather & navigation', pickTools(scienceConversionCatalog, ['calc-coordinate-format', 'calc-compass-bearing', 'calc-rain-snow-water'])),
    ]),
    toolCategory('time-dates', 'Time & Dates', 'Time units, world clocks, work and calendars', ICONS.time, [
      toolSubcategory('time-units', 'Time units', pickTools(timeDateCatalog, ['unit-time'])),
      toolSubcategory('world-time', 'World time', pickTools(timeDateCatalog, ['calc-time-zone'])),
      toolSubcategory('schedules-calendars', 'Schedules & calendars', pickTools(timeDateCatalog, ['calc-work-time', 'calc-date-difference'])),
    ]),
    toolCategory('finance', 'Economics', 'Debt, housing, investing, prices & business', ICONS.finance, [
      toolSubcategory('debt-credit', 'Debt & credit', pickTools(FINANCE_CATALOG_TOOLS, ['calc-loan-payment', 'calc-credit-card-payoff', 'calc-debt-strategy', 'calc-apr-apy'])),
      toolSubcategory('housing-vehicles', 'Housing & vehicles', pickTools(FINANCE_CATALOG_TOOLS, ['calc-mortgage-payment', 'calc-refinance-comparison', 'calc-auto-loan-lease'])),
      toolSubcategory('saving-investing', 'Saving & investing', pickTools(FINANCE_CATALOG_TOOLS, ['calc-compound-interest', 'calc-simple-interest', 'calc-savings-goal', 'calc-roi-cagr', 'calc-dollar-cost-averaging', 'calc-retirement-projection', 'calc-inflation-purchasing-power'])),
      toolSubcategory('prices-exchange', 'Prices & exchange', pickTools(FINANCE_CATALOG_TOOLS, ['calc-currency', 'calc-discount', 'calc-sales-tax', 'calc-tip-split'])),
      toolSubcategory('business', 'Business', pickTools(FINANCE_CATALOG_TOOLS, ['calc-profit-margin', 'calc-break-even'])),
    ]),
    toolCategory('health', 'Health & fitness', 'General wellness estimates', ICONS.health, [
      toolSubcategory('body-metrics', 'Body metrics', pickTools(HEALTH_CATALOG_TOOLS, ['calc-bmi', 'calc-body-fat', 'calc-waist-ratios', 'calc-bmr', 'calc-tdee', 'calc-body-surface-area'])),
      toolSubcategory('nutrition-recovery', 'Nutrition & recovery', pickTools(HEALTH_CATALOG_TOOLS, ['calc-macronutrient-targets', 'calc-hydration', 'calc-sleep-cycle'])),
      toolSubcategory('training', 'Training & performance', pickTools(HEALTH_CATALOG_TOOLS, ['calc-pace', 'calc-target-heart-rate', 'calc-one-rep-max', 'calc-met-calories', 'calc-vo2-max', 'calc-endurance-splits'])),
    ]),
    toolCategory('geometry', 'Geometry', 'Area, volume and dimensions', ICONS.geometry, [
      toolSubcategory('two-dimensional', '2D shapes', pickTools(GEOMETRY_TOOLS, ['calc-circle', 'calc-rectangle', 'calc-triangle', 'calc-trapezoid', 'calc-regular-polygon'])),
      toolSubcategory('three-dimensional', '3D solids', pickTools(GEOMETRY_TOOLS, ['calc-sphere', 'calc-cylinder', 'calc-cone', 'calc-rectangular-prism'])),
    ]),
    toolCategory('math', 'Math & statistics', 'Algebra, percentages and data', ICONS.math, [
      toolSubcategory('algebra-percentages', 'Algebra & percentages', pickTools(MATH_TOOLS, ['calc-percentage-of', 'calc-percentage-change', 'calc-quadratic'])),
      toolSubcategory('statistics', 'Statistics', pickTools(MATH_TOOLS, ['calc-statistics', 'calc-standard-deviation'])),
    ]),
    toolCategory('academics', 'Academics', 'Number skills and probability', ICONS.academics, [
      toolSubcategory('number-skills', 'Number skills', pickTools(MATH_TOOLS, ['calc-ratio-scale', 'calc-gcd-lcm', 'calc-decimal-fraction'])),
      toolSubcategory('probability-counting', 'Probability & counting', pickTools(MATH_TOOLS, ['calc-combinations', 'calc-permutations'])),
    ]),
    toolCategory('science', 'Science & engineering', 'Physics, electricity and chemistry', ICONS.science, [
      toolSubcategory('electricity', 'Electricity', pickTools(SCIENCE_TOOLS, ['calc-ohms-law', 'calc-electric-power'])),
      toolSubcategory('mechanics', 'Mechanics', pickTools(SCIENCE_TOOLS, ['calc-kinetic-energy', 'calc-potential-energy', 'calc-newtons-second-law', 'calc-momentum'])),
      toolSubcategory('waves-gases', 'Waves & gases', pickTools(SCIENCE_TOOLS, ['calc-wave', 'calc-ideal-gas'])),
      toolSubcategory('chemistry-materials', 'Chemistry & materials', pickTools(SCIENCE_TOOLS, ['calc-molarity', 'calc-element-shape'])),
    ]),
    toolCategory('everyday', 'Everyday life', 'Trips, transport, home and shopping', ICONS.everyday, [
      toolSubcategory('travel-transport', 'Travel & transport', pickTools(EVERYDAY_TOOLS, ['calc-trip-fuel-cost', 'calc-mileage', 'calc-fuel-mix'])),
      toolSubcategory('home-shopping', 'Home & shopping', pickTools(EVERYDAY_TOOLS, ['calc-paint', 'calc-unit-price'])),
    ]),
    toolCategory('culinary', 'Culinary', 'Kitchen conversions and recipes', ICONS.culinary, [
      toolSubcategory('kitchen-conversions', 'Kitchen conversions', pickTools(everydayUnits, ['unit-cooking'])),
      toolSubcategory('recipe-planning', 'Recipe planning', pickTools(EVERYDAY_TOOLS, ['calc-recipe-scale'])),
    ]),
    toolCategory('digital', 'Digital & computing', 'Data, displays and number systems', ICONS.digital, [
      toolSubcategory('data-transfer', 'Data & transfer', pickTools(digitalCatalog, ['unit-storage', 'unit-data-rate', 'calc-download-time'])),
      toolSubcategory('displays-typography', 'Displays & typography', pickTools(digitalCatalog, ['unit-typography', 'calc-screen-ppi', 'calc-aspect-ratio'])),
      toolSubcategory('number-systems', 'Number systems', pickTools(digitalCatalog, ['calc-number-base'])),
    ]),
  ]);

  const CALCULATOR_BADGES = Object.freeze({
    'calc-loan-payment': 'PMT', 'calc-mortgage-payment': 'PITI', 'calc-currency': '$↔¥',
    'calc-compound-interest': 'FVⁿ', 'calc-simple-interest': 'P·r·t', 'calc-savings-goal': '$→Goal',
    'calc-discount': '−%', 'calc-sales-tax': '+Tax', 'calc-tip-split': 'Bill÷n', 'calc-profit-margin': 'π%', 'calc-break-even': 'Q₀',
    'calc-bmi': 'BMI', 'calc-bmr': 'BMR', 'calc-tdee': 'TDEE', 'calc-body-surface-area': 'BSA', 'calc-pace': 'min/mi', 'calc-target-heart-rate': 'bpm♥',
    'calc-circle': 'πr²', 'calc-rectangle': 'A=l×w', 'calc-triangle': '△ABC', 'calc-trapezoid': '(a+b)h/2',
    'calc-sphere': '⁴⁄₃πr³', 'calc-cylinder': 'πr²h', 'calc-cone': '⅓πr²h', 'calc-rectangular-prism': 'V=l×w×h', 'calc-regular-polygon': 'n-gon',
    'calc-percentage-of': 'p%·x', 'calc-percentage-change': 'Δx%', 'calc-quadratic': 'ax²+bx+c', 'calc-statistics': 'x̄·M',
    'calc-standard-deviation': 'σ', 'calc-ratio-scale': 'a:b', 'calc-gcd-lcm': 'GCD·LCM', 'calc-combinations': 'nCr', 'calc-permutations': 'nPr', 'calc-decimal-fraction': '0.5→½',
    'calc-ohms-law': 'V=IR', 'calc-electric-power': 'P=VI', 'calc-kinetic-energy': '½mv²', 'calc-potential-energy': 'mgh',
    'calc-newtons-second-law': 'F=ma', 'calc-momentum': 'p=mv', 'calc-wave': 'v=fλ', 'calc-ideal-gas': 'PV=nRT', 'calc-molarity': 'M=n/V', 'calc-element-shape': 'Au▣',
    'calc-trip-fuel-cost': 'd·L/km', 'calc-paint': 'm²/coat', 'calc-recipe-scale': '×serv', 'calc-unit-price': '$/unit',
    'calc-mileage': 'mi·rate', 'calc-work-time': '8:30', 'calc-date-difference': 'Δdays', 'calc-fuel-mix': '50:1',
    'calc-shoe-size': 'USₛ↔EU', 'calc-clothing-size': 'USᶜ↔EU', 'calc-ring-size': 'Ø↔EU', 'calc-paper-size': 'A4↔LTR',
    'calc-map-scale': '1:n', 'calc-coordinate-format': 'DD↔DMS', 'calc-compass-bearing': '°↔NNE', 'calc-rain-snow-water': 'mm↔L', 'calc-time-zone': 'TZ↔DST',
    'calc-credit-card-payoff': 'APR→0', 'calc-debt-strategy': 'S↔A', 'calc-refinance-comparison': 'old↔new', 'calc-auto-loan-lease': 'buy↔lease',
    'calc-apr-apy': 'APR↔APY', 'calc-roi-cagr': 'ROI·CAGR', 'calc-dollar-cost-averaging': '$·t', 'calc-retirement-projection': '$→67', 'calc-inflation-purchasing-power': '$÷π',
    'calc-body-fat': 'BF%', 'calc-waist-ratios': 'W:H', 'calc-macronutrient-targets': 'P·C·F', 'calc-hydration': 'mL/kg',
    'calc-one-rep-max': '1RM', 'calc-met-calories': 'MET→kcal', 'calc-vo2-max': 'VO₂max', 'calc-endurance-splits': 'Δtₙ', 'calc-sleep-cycle': '90m×n',
    'calc-number-base': '2↔16', 'calc-download-time': 'GB÷Mb/s', 'calc-screen-ppi': 'ppi', 'calc-aspect-ratio': '16:9',
  });

  function toolBadge(tool) {
    if (tool.kind === 'unit') {
      const from = tool.units[tool.defaultFrom]?.symbol || tool.units[0]?.symbol || '?';
      const to = tool.units[tool.defaultTo]?.symbol || tool.units[1]?.symbol || '?';
      return `${from}↔${to}`;
    }
    return CALCULATOR_BADGES[tool.id] || tool.shortTitle.slice(0, 7);
  }

  const ALL_TOOLS = TOOL_CATEGORIES.flatMap((category) => category.tools);
  const TOOL_MAP = new Map(ALL_TOOLS.map((tool) => [tool.id, tool]));
  const CATEGORY_BY_TOOL = new Map(TOOL_CATEGORIES.flatMap((category) => category.tools.map((tool) => [tool.id, category])));

  function safeStorageRead(key, fallback) {
    try {
      const raw = root.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeStorageWrite(key, value) {
    try { root.localStorage?.setItem(key, JSON.stringify(value)); } catch (_) { /* Private storage can be unavailable. */ }
  }

  function iconMarkup(name) {
    if (name === 'rocket') {
      // Keep the rocket self-contained. Cross-document SVG <use> references can
      // be blocked by some GitHub Pages/browser combinations.
      return '<svg class="inline-rocket-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M14 4.2c2.4-1.5 4.7-1.7 6-1.6.1 1.4-.1 3.7-1.6 6.1l-5.8 8.5-5.8-5.8L14 4.2Z"/><circle cx="15.5" cy="7.2" r="1.7"/><path d="m8.8 9.4-4.2.8-2 2 5.2.7m6.8 2.3-.8 4.2-2 2-.7-5.2M7 17l-3 3m4-1-2 2"/></svg>';
    }
    if (name === 'folder') return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Z"/><path d="M3 10h18"/></svg>';
    return `<svg aria-hidden="true"><use href="assets/icons.svg#icon-${escapeHtml(name)}"></use></svg>`;
  }

  function fieldValue(field, raw) {
    if (field.type === 'number') return raw === '' ? NaN : Number(String(raw).replaceAll(',', ''));
    return raw;
  }

  function groupedInputValue(value) {
    const source = String(value ?? '');
    if (!source || /[eE]/.test(source)) return source;
    const negative = source.startsWith('-');
    const unsigned = source.replace(/^[+-]/, '').replaceAll(',', '').replace(/[^\d.]/g, '');
    const [integerRaw = '', ...decimalParts] = unsigned.split('.');
    const integer = integerRaw.replace(/^0+(?=\d)/, '') || (unsigned.startsWith('.') ? '0' : integerRaw);
    const grouped = integer ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
    const decimal = decimalParts.length ? `.${decimalParts.join('')}` : (unsigned.endsWith('.') ? '.' : '');
    return `${negative ? '-' : ''}${grouped}${decimal}`;
  }

  function detailValue(detail, settings) {
    const value = typeof detail.value === 'number'
      ? (String(detail.prefix || '').includes('$') ? formatMoney(detail.value, settings) : formatNumber(detail.value, settings))
      : String(detail.value ?? '');
    return `${detail.prefix || ''}${value}${detail.suffix || ''}`;
  }

  function favoriteFolderId() {
    if (root.crypto?.randomUUID) return `folder-${root.crypto.randomUUID()}`;
    return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function starterFavoriteFolders(legacyFavorites) {
    const folders = Array.from({ length: 4 }, (_, index) => ({
      id: `starter-folder-${index + 1}`,
      name: `Folder ${index + 1}`,
      parentId: null,
      toolIds: [],
    }));
    const imported = Array.isArray(legacyFavorites) ? legacyFavorites.filter((id) => TOOL_MAP.has(id)) : [];
    if (imported.length) {
      folders[0].name = 'Saved tools';
      folders[0].toolIds = [...new Set(imported)];
    }
    return folders;
  }

  function normalizeFavoriteFolders(raw, legacyFavorites) {
    const source = Array.isArray(raw?.folders) ? raw.folders : null;
    if (source === null) return starterFavoriteFolders(legacyFavorites);
    const ids = new Set(source.map((folder) => String(folder?.id || '')).filter(Boolean));
    const folders = source.map((folder, index) => ({
      id: ids.has(String(folder?.id || '')) ? String(folder.id) : `recovered-folder-${index + 1}`,
      name: String(folder?.name || `Folder ${index + 1}`).trim().slice(0, 48) || `Folder ${index + 1}`,
      parentId: ids.has(String(folder?.parentId || '')) && String(folder.parentId) !== String(folder.id) ? String(folder.parentId) : null,
      toolIds: Array.isArray(folder?.toolIds) ? [...new Set(folder.toolIds.filter((id) => TOOL_MAP.has(id)))] : [],
    }));
    return folders;
  }

  function initialState() {
    const savedSettings = safeStorageRead(STORAGE_KEYS.settings, {});
    const precision = Number(savedSettings.precision);
    const settings = {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
      precision: Number.isInteger(precision) && precision >= 1 && precision <= 15 ? precision : DEFAULT_SETTINGS.precision,
    };
    const savedHistory = safeStorageRead(STORAGE_KEYS.history, []);
    const savedFavorites = safeStorageRead(STORAGE_KEYS.favorites, []);
    const savedFavoriteFolders = safeStorageRead(STORAGE_KEYS.favoriteFolders, null);
    return {
      expression: '',
      currentResult: 0,
      lastValidResult: 0,
      ans: 0,
      memory: 0,
      second: false,
      mode: 'basic',
      settings,
      history: Array.isArray(savedHistory) ? savedHistory.slice(0, 50) : [],
      favoriteFolders: normalizeFavoriteFolders(savedFavoriteFolders, savedFavorites),
      activeFavoriteFolderId: null,
      folderPickerTargetId: null,
      movingFavoriteFolderId: null,
      folderEditorMode: null,
      folderEditorTargetId: null,
      deletingFavoriteFolderId: null,
      currentTool: null,
      toolOrigin: { type: 'calculator', folderId: null },
      openCategories: new Set(),
      drawerOpen: false,
      currencyTimer: null,
      currencyRequest: 0,
      referenceSides: {},
      graphZoom: 1.5,
      graphResolution: 1,
      graphPanX: .5,
      graphPanY: .5,
      graphDrag: null,
      currentToolResult: null,
      toastTimer: null,
    };
  }

  const state = initialState();
  let dom = null;
  let themeMedia = null;

  function isIncompleteExpression(expression, error) {
    const value = normalizeExpression(expression);
    return !value || /[+\-*/^(,]$/.test(value) || (error && /Finish the expression|Expected “\)”|Expected a number/.test(error.message));
  }

  function updateExpression(options) {
    if (!dom) return;
    const opts = options || {};
    const expression = dom.expressionInput.value;
    state.expression = expression;
    if (!expression.trim()) {
      dom.formulaDisplay.innerHTML = '<math display="block"><mn>0</mn></math>';
      dom.resultDisplay.textContent = '0';
      dom.displayError.textContent = '';
      state.currentResult = 0;
      state.lastValidResult = 0;
      return;
    }
    try {
      const calculation = calculateExpression(expression, { angle: state.settings.angle, ans: state.ans });
      dom.formulaDisplay.innerHTML = calculation.mathML;
      dom.resultDisplay.textContent = formatNumber(calculation.value, state.settings);
      dom.displayError.textContent = '';
      state.currentResult = calculation.value;
      state.lastValidResult = calculation.value;
      if (opts.commit) commitExpression(calculation);
    } catch (error) {
      dom.formulaDisplay.innerHTML = fallbackMathML(expression);
      dom.resultDisplay.textContent = formatNumber(state.lastValidResult, state.settings);
      dom.displayError.textContent = isIncompleteExpression(expression, error) ? '' : error.message;
      state.currentResult = state.lastValidResult;
    }
  }

  function commitExpression(calculation) {
    if (!Number.isFinite(calculation.value)) return;
    state.ans = calculation.value;
    const expression = state.expression.trim();
    const latest = state.history[0];
    if (!latest || latest.expression !== expression || latest.result !== calculation.value) {
      state.history.unshift({ expression, result: calculation.value, timestamp: Date.now(), kind: 'expression' });
      state.history = state.history.slice(0, 50);
      safeStorageWrite(STORAGE_KEYS.history, state.history);
    }
    showToast('Added to history');
  }

  function setExpression(value, focus) {
    dom.expressionInput.value = value;
    updateExpression();
    if (focus !== false) {
      dom.expressionInput.focus({ preventScroll: true });
      dom.expressionInput.setSelectionRange(value.length, value.length);
    }
  }

  function insertAtCursor(text) {
    const input = dom.expressionInput;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = input.value.slice(0, start) + text + input.value.slice(end);
    input.value = next;
    const cursor = start + text.length;
    input.focus({ preventScroll: true });
    input.setSelectionRange(cursor, cursor);
    updateExpression();
  }

  function backspaceAtCursor() {
    const input = dom.expressionInput;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    if (start !== end) {
      input.value = input.value.slice(0, start) + input.value.slice(end);
      input.setSelectionRange(start, start);
    } else if (start > 0) {
      const before = input.value.slice(0, start);
      const functionMatch = before.match(/(?:sqrt|sin|cos|tan|log|ln|abs)\($/);
      const count = functionMatch ? functionMatch[0].length : 1;
      input.value = input.value.slice(0, start - count) + input.value.slice(end);
      input.setSelectionRange(start - count, start - count);
    }
    input.focus({ preventScroll: true });
    updateExpression();
  }

  function handleCalculatorKey(key) {
    if (state.settings.haptics && root.navigator?.vibrate) root.navigator.vibrate(7);
    if (key === 'clear') setExpression('');
    else if (key === 'backspace') backspaceAtCursor();
    else if (key === 'equals') updateExpression({ commit: true });
    else insertAtCursor(key);
  }

  function updateScienceKeys() {
    if (!dom) return;
    const secondKey = document.getElementById('secondKey');
    if (secondKey) {
      secondKey.textContent = state.second ? '1st' : '2nd';
      secondKey.classList.toggle('is-active', state.second);
    }
    document.querySelectorAll('.inverse-key').forEach((button) => {
      const direct = button.dataset.direct.replace('(', '');
      button.textContent = state.second ? `${direct}⁻¹` : direct;
    });
    document.querySelectorAll('.inverse-hyperbolic-key').forEach((button) => {
      const direct = button.dataset.direct.replace('(', '');
      button.textContent = state.second ? `a${direct}` : direct;
    });
    const angleKey = document.getElementById('angleKey');
    if (angleKey) angleKey.textContent = state.settings.angle.toUpperCase();
  }

  function handleScienceAction(action) {
    const value = Number.isFinite(state.currentResult) ? state.currentResult : 0;
    switch (action) {
      case 'memory-clear': state.memory = 0; showToast('Memory cleared'); break;
      case 'memory-add': state.memory += value; showToast('Added to memory'); break;
      case 'memory-subtract': state.memory -= value; showToast('Subtracted from memory'); break;
      case 'memory-recall': insertAtCursor(trimNumber(state.memory, 15)); break;
      case 'random': insertAtCursor(trimNumber(Math.random(), 15)); break;
      case 'second': state.second = !state.second; updateScienceKeys(); break;
      case 'angle':
        state.settings.angle = state.settings.angle === 'deg' ? 'rad' : 'deg';
        saveSettings();
        showToast(`Angle mode: ${state.settings.angle.toUpperCase()}`);
        break;
      default: break;
    }
  }

  function applyTheme() {
    const resolved = state.settings.theme === 'system'
      ? (themeMedia?.matches ? 'dark' : 'light')
      : state.settings.theme;
    document.documentElement.dataset.theme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === 'dark' ? '#100e0d' : '#fffaf6';
  }

  function saveSettings() {
    safeStorageWrite(STORAGE_KEYS.settings, state.settings);
    applyTheme();
    updateScienceKeys();
    updateExpression();
    if (state.currentTool) refreshCurrentToolResult();
  }

  function syncSettingsControls() {
    document.querySelectorAll('input[name="theme"]').forEach((radio) => { radio.checked = radio.value === state.settings.theme; });
    dom.precisionSetting.value = String(state.settings.precision);
    dom.separatorSetting.checked = state.settings.separators;
    dom.hapticSetting.checked = state.settings.haptics;
  }

  function setMode(mode) {
    state.mode = mode === 'scientific' ? 'scientific' : 'basic';
    document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('is-active', button.dataset.mode === state.mode));
    dom.scientificKeys.hidden = state.mode !== 'scientific';
    updateScienceKeys();
  }

  function toggleMenu(force) {
    const shouldOpen = force ?? dom.appMenu.hidden;
    dom.appMenu.hidden = !shouldOpen;
    dom.menuButton.setAttribute('aria-expanded', String(shouldOpen));
    if (shouldOpen) dom.appMenu.querySelector('button')?.focus({ preventScroll: true });
  }

  function openDrawer(targetFolderId) {
    state.folderPickerTargetId = state.favoriteFolders.some((folder) => folder.id === targetFolderId) ? targetFolderId : null;
    state.openCategories.clear();
    dom.toolSearch.value = '';
    const targetFolder = state.favoriteFolders.find((folder) => folder.id === state.folderPickerTargetId);
    dom.drawerTitle.textContent = targetFolder ? `Add to ${targetFolder.name}` : 'Everything, organized.';
    dom.drawerDescription.textContent = targetFolder ? 'Choose a tool to save in this folder.' : 'Converters and calculators for daily life, work, and study.';
    renderToolCategories('');
    state.drawerOpen = true;
    dom.toolDrawer.classList.add('is-open');
    dom.toolDrawer.setAttribute('aria-hidden', 'false');
    dom.drawerBackdrop.hidden = false;
    document.querySelectorAll('[data-action="tools"]').forEach((button) => button.setAttribute('aria-expanded', 'true'));
    document.body.style.overflow = 'hidden';
    root.setTimeout(() => dom.toolSearch.focus({ preventScroll: true }), 180);
  }

  function closeDrawer(options) {
    state.drawerOpen = false;
    if (!options?.preserveFavoriteMode) state.folderPickerTargetId = null;
    dom.toolDrawer.classList.remove('is-open');
    dom.toolDrawer.setAttribute('aria-hidden', 'true');
    dom.drawerBackdrop.hidden = true;
    document.querySelectorAll('[data-action="tools"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
    document.body.style.overflow = '';
    if (options?.restoreFocus) document.querySelector('.tools-button')?.focus({ preventScroll: true });
  }

  function toolSearchText(tool, category, subcategory) {
    const units = tool.kind === 'unit' ? tool.units.flatMap((item) => [item.name, item.symbol]).join(' ') : tool.fields.flatMap((field) => [field.label, field.unit || '']).join(' ');
    return `${tool.title} ${tool.description} ${category.title} ${subcategory?.title || ''} ${units}`.toLowerCase();
  }

  function renderToolCategories(query) {
    const search = String(query || '').trim().toLowerCase();
    const matches = TOOL_CATEGORIES.map((category) => {
      const categoryMatches = !search || `${category.title} ${category.description}`.toLowerCase().includes(search);
      const subcategories = category.subcategories.map((subcategory) => {
        const subcategoryMatches = categoryMatches || subcategory.title.toLowerCase().includes(search);
        const tools = !search || subcategoryMatches
          ? subcategory.tools
          : subcategory.tools.filter((tool) => toolSearchText(tool, category, subcategory).includes(search));
        return { subcategory, tools };
      }).filter((item) => item.tools.length);
      return { category, subcategories, tools: subcategories.flatMap((item) => item.tools) };
    }).filter((item) => item.tools.length);
    const count = matches.reduce((total, item) => total + item.tools.length, 0);
    if (!matches.length) {
      dom.toolCategories.innerHTML = `<div class="no-results">${iconMarkup('search')}<strong>No tools found</strong>Try a unit name, topic, or formula such as “mile,” “loan,” or “energy.”</div>`;
      return 0;
    }
    let selectedId = [...state.openCategories][0] || null;
    if (!matches.some((item) => item.category.id === selectedId)) selectedId = search ? matches[0].category.id : null;
    const toolItems = (tools) => tools.map((tool) => `<button class="tool-item" type="button" data-tool-id="${tool.id}"><span>${escapeHtml(tool.shortTitle)}</span><span class="tool-badge" aria-hidden="true">${escapeHtml(toolBadge(tool))}</span></button>`).join('');
    const subcategoryItems = (subcategories) => `<div class="category-subcategories">${subcategories.map(({ subcategory, tools }) => `<section class="subcategory-group"><div class="subcategory-heading"><strong>${escapeHtml(subcategory.title)}</strong><span>${tools.length}</span></div><div class="category-items">${toolItems(tools)}</div></section>`).join('')}</div>`;
    const groups = [];
    for (let index = 0; index < matches.length; index += 4) groups.push(matches.slice(index, index + 4));
    dom.toolCategories.innerHTML = `<div class="category-matrix">${groups.map((group) => {
      const selected = group.find((item) => item.category.id === selectedId);
      const row = `<div class="category-row">${group.map(({ category, tools }) => {
        const open = category.id === selectedId;
        return `<button class="category-app${open ? ' is-open' : ''}" type="button" data-category-id="${category.id}" aria-expanded="${open}" title="${escapeHtml(category.description)}"><span class="tool-icon">${iconMarkup(category.icon)}</span><strong>${escapeHtml(category.title)}</strong><small>${tools.length} tool${tools.length === 1 ? '' : 's'}</small></button>`;
      }).join('')}</div>`;
      if (!selected) return row;
      const { category, subcategories, tools } = selected;
      return `${row}<section class="category-panel" data-category="${category.id}"><div class="category-panel-header"><strong>${escapeHtml(category.title)}</strong><span>${escapeHtml(category.description)} · ${tools.length}</span></div>${subcategoryItems(subcategories)}</section>`;
    }).join('')}</div>`;
    return count;
  }

  function favoriteFolderById(id) {
    return state.favoriteFolders.find((folder) => folder.id === id) || null;
  }

  function favoriteFolderChildren(parentId) {
    return state.favoriteFolders.filter((folder) => folder.parentId === parentId);
  }

  function favoriteFolderDescendants(id) {
    const found = new Set();
    const visit = (parentId) => favoriteFolderChildren(parentId).forEach((folder) => {
      if (found.has(folder.id)) return;
      found.add(folder.id);
      visit(folder.id);
    });
    visit(id);
    return found;
  }

  function saveFavoriteFolders() {
    safeStorageWrite(STORAGE_KEYS.favoriteFolders, { version: 2, folders: state.favoriteFolders });
  }

  function favoriteFolderPath(id) {
    const path = [];
    let current = favoriteFolderById(id);
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      path.unshift(current);
      seen.add(current.id);
      current = favoriteFolderById(current.parentId);
    }
    return path;
  }

  function renderQuickTools() {
    if (state.activeFavoriteFolderId && !favoriteFolderById(state.activeFavoriteFolderId)) state.activeFavoriteFolderId = null;
    const current = favoriteFolderById(state.activeFavoriteFolderId);
    const query = String(dom.favoriteSearch?.value || '').trim().toLowerCase();
    const childFolders = favoriteFolderChildren(current?.id ?? null).filter((folder) => folder.name.toLowerCase().includes(query));
    const toolIds = (current?.toolIds || []).filter((id) => {
      const tool = TOOL_MAP.get(id); const category = CATEGORY_BY_TOOL.get(id);
      return tool && (!query || `${tool.title} ${tool.description} ${category?.title || ''}`.toLowerCase().includes(query));
    });
    const cards = childFolders.map((folder) => {
      const count = folder.toolIds.length + favoriteFolderChildren(folder.id).length;
      return `<article class="quick-card folder-card">
        <button class="folder-open" type="button" data-folder-open="${escapeHtml(folder.id)}"><span class="tool-icon">${iconMarkup('folder')}</span><strong>${escapeHtml(folder.name)}</strong><span>${count} item${count === 1 ? '' : 's'}</span></button>
        <button class="folder-control folder-rename" type="button" data-folder-action="rename" data-folder-id="${escapeHtml(folder.id)}">Rename</button>
        <button class="folder-control folder-move" type="button" data-folder-action="move" data-folder-id="${escapeHtml(folder.id)}">Move</button>
        <button class="folder-delete" type="button" data-folder-action="delete" data-folder-id="${escapeHtml(folder.id)}" aria-label="Delete ${escapeHtml(folder.name)}">×</button>
      </article>`;
    });
    toolIds.forEach((id) => {
      const tool = TOOL_MAP.get(id); const category = CATEGORY_BY_TOOL.get(id);
      cards.push(`<article class="quick-card favorite-card">
        <button class="favorite-open" type="button" data-tool-id="${tool.id}"><span class="tool-icon">${iconMarkup(tool.icon)}</span><strong>${escapeHtml(tool.shortTitle)}</strong><span>${escapeHtml(category?.title || 'Tool')}</span></button>
        <button class="favorite-remove" type="button" data-folder-tool-remove="${escapeHtml(tool.id)}" data-folder-id="${escapeHtml(current.id)}" aria-label="Remove ${escapeHtml(tool.shortTitle)} from ${escapeHtml(current.name)}">×</button>
      </article>`);
    });
    if (!cards.length) cards.push(`<div class="favorite-empty-state">${query ? 'No matching folders or tools here.' : current ? 'This folder is empty. Add a tool or create a nested folder.' : 'Create a folder to start organizing your favorite calculators.'}</div>`);
    dom.quickGrid.innerHTML = cards.join('');
    const path = favoriteFolderPath(current?.id);
    dom.folderBreadcrumbs.innerHTML = `<button type="button" data-folder-nav="root">Favorite folders</button>${path.map((folder, index) => `<span aria-hidden="true">/</span>${index === path.length - 1 ? `<span>${escapeHtml(folder.name)}</span>` : `<button type="button" data-folder-nav="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</button>`}`).join('')}`;
    dom.addFavoriteToolButton.hidden = !current;
  }

  function createFavoriteFolder() {
    const parent = favoriteFolderById(state.activeFavoriteFolderId);
    const suggested = `Folder ${favoriteFolderChildren(parent?.id ?? null).length + 1}`;
    state.folderEditorMode = 'create'; state.folderEditorTargetId = null;
    dom.folderEditorEyebrow.textContent = parent ? `Inside ${parent.name}` : 'Favorite folders';
    dom.folderEditorTitle.textContent = 'Create folder'; dom.folderEditorSave.textContent = 'Create folder';
    dom.folderNameInput.value = suggested; dom.folderNameError.hidden = true;
    dom.folderEditorDialog.showModal();
    root.requestAnimationFrame?.(() => { dom.folderNameInput.focus({ preventScroll: true }); dom.folderNameInput.select(); });
  }

  function renameFavoriteFolder(id) {
    const folder = favoriteFolderById(id); if (!folder) return;
    state.folderEditorMode = 'rename'; state.folderEditorTargetId = id;
    dom.folderEditorEyebrow.textContent = 'Favorite folders'; dom.folderEditorTitle.textContent = `Rename “${folder.name}”`; dom.folderEditorSave.textContent = 'Save name';
    dom.folderNameInput.value = folder.name; dom.folderNameError.hidden = true;
    dom.folderEditorDialog.showModal();
    root.requestAnimationFrame?.(() => { dom.folderNameInput.focus({ preventScroll: true }); dom.folderNameInput.select(); });
  }

  function closeFavoriteFolderEditor() {
    state.folderEditorMode = null; state.folderEditorTargetId = null; dom.folderNameError.hidden = true;
    if (dom.folderEditorDialog.open) dom.folderEditorDialog.close();
  }

  function submitFavoriteFolderEditor() {
    const clean = dom.folderNameInput.value.trim().slice(0, 48);
    if (!clean) { dom.folderNameError.hidden = false; dom.folderNameInput.focus(); return; }
    if (state.folderEditorMode === 'create') {
      const parent = favoriteFolderById(state.activeFavoriteFolderId);
      state.favoriteFolders.push({ id: favoriteFolderId(), name: clean, parentId: parent?.id ?? null, toolIds: [] });
      saveFavoriteFolders(); renderQuickTools(); closeFavoriteFolderEditor(); showToast('Folder created');
      return;
    }
    if (state.folderEditorMode === 'rename') {
      const folder = favoriteFolderById(state.folderEditorTargetId); if (!folder) { closeFavoriteFolderEditor(); return; }
      folder.name = clean; saveFavoriteFolders(); renderQuickTools(); closeFavoriteFolderEditor(); showToast('Folder renamed');
    }
  }

  function favoriteMoveTreeBranches(parentId, excluded, currentParentId, depth = 0) {
    return favoriteFolderChildren(parentId).filter((folder) => !excluded.has(folder.id)).map((folder) => {
      const current = folder.id === currentParentId;
      const path = favoriteFolderPath(folder.id).map((part) => part.name).join(' / ');
      const children = favoriteMoveTreeBranches(folder.id, excluded, currentParentId, depth + 1);
      return `<div class="folder-tree-branch" role="treeitem" aria-level="${depth + 2}"${children ? ' aria-expanded="true"' : ''}><button class="folder-tree-option" type="button" data-folder-move-target="${escapeHtml(folder.id)}"${current ? ' aria-current="true" disabled' : ''}><span class="folder-tree-icon">${iconMarkup('folder')}</span><span class="folder-tree-copy"><strong>${escapeHtml(folder.name)}</strong><small>${escapeHtml(path)}</small></span>${current ? '<span class="folder-tree-current">Current</span>' : ''}</button>${children ? `<div class="folder-tree-children" role="group">${children}</div>` : ''}</div>`;
    }).join('');
  }

  function moveFavoriteFolder(id) {
    const folder = favoriteFolderById(id); if (!folder) return;
    const excluded = favoriteFolderDescendants(id); excluded.add(id);
    state.movingFavoriteFolderId = id;
    dom.folderMoveTitle.textContent = `Move “${folder.name}”`;
    const rootCurrent = folder.parentId === null;
    const branches = favoriteMoveTreeBranches(null, excluded, folder.parentId);
    dom.folderMoveTree.innerHTML = `<div class="folder-tree-branch" role="treeitem" aria-level="1"${branches ? ' aria-expanded="true"' : ''}><button class="folder-tree-option" type="button" data-folder-move-target="__root__"${rootCurrent ? ' aria-current="true" disabled' : ''}><span class="folder-tree-icon">${iconMarkup('home')}</span><span class="folder-tree-copy"><strong>Favorite folders</strong><small>Top level</small></span>${rootCurrent ? '<span class="folder-tree-current">Current</span>' : ''}</button>${branches ? `<div class="folder-tree-children" role="group">${branches}</div>` : ''}</div>`;
    dom.folderMoveDialog.showModal();
    root.requestAnimationFrame?.(() => dom.folderMoveTree.querySelector('button:not([disabled])')?.focus({ preventScroll: true }));
  }

  function moveFavoriteFolderTo(targetId) {
    const folder = favoriteFolderById(state.movingFavoriteFolderId); if (!folder) return;
    const parentId = targetId === '__root__' ? null : targetId;
    const excluded = favoriteFolderDescendants(folder.id); excluded.add(folder.id);
    if (parentId !== null && (excluded.has(parentId) || !favoriteFolderById(parentId))) return;
    folder.parentId = parentId;
    state.movingFavoriteFolderId = null;
    dom.folderMoveDialog.close();
    saveFavoriteFolders(); renderQuickTools(); showToast('Folder moved');
  }

  function deleteFavoriteFolder(id) {
    const folder = favoriteFolderById(id); if (!folder) return;
    const descendants = favoriteFolderDescendants(id);
    const nestedCount = descendants.size; const toolCount = [folder.id, ...descendants].reduce((sum, folderId) => sum + (favoriteFolderById(folderId)?.toolIds.length || 0), 0);
    state.deletingFavoriteFolderId = id;
    dom.folderDeleteTitle.textContent = `Delete “${folder.name}”?`;
    dom.folderDeleteMessage.textContent = nestedCount || toolCount
      ? `This also removes ${nestedCount} nested folder${nestedCount === 1 ? '' : 's'} and ${toolCount} saved tool shortcut${toolCount === 1 ? '' : 's'}. This cannot be undone.`
      : 'This empty folder will be removed. This cannot be undone.';
    dom.folderDeleteDialog.showModal();
  }

  function closeFavoriteFolderDelete() {
    state.deletingFavoriteFolderId = null;
    if (dom.folderDeleteDialog.open) dom.folderDeleteDialog.close();
  }

  function confirmDeleteFavoriteFolder() {
    const id = state.deletingFavoriteFolderId; const folder = favoriteFolderById(id); if (!folder) { closeFavoriteFolderDelete(); return; }
    const descendants = favoriteFolderDescendants(id);
    descendants.add(id); state.favoriteFolders = state.favoriteFolders.filter((item) => !descendants.has(item.id));
    if (descendants.has(state.activeFavoriteFolderId)) state.activeFavoriteFolderId = folder.parentId;
    saveFavoriteFolders(); renderQuickTools(); closeFavoriteFolderDelete(); showToast('Folder deleted');
  }

  function addToolToFavoriteFolder(folderId, toolId) {
    const folder = favoriteFolderById(folderId); if (!folder || !TOOL_MAP.has(toolId)) return false;
    if (folder.toolIds.includes(toolId)) return false;
    folder.toolIds.push(toolId); saveFavoriteFolders(); renderQuickTools(); return true;
  }

  function removeToolFromFavoriteFolder(folderId, toolId) {
    const folder = favoriteFolderById(folderId); if (!folder) return;
    folder.toolIds = folder.toolIds.filter((id) => id !== toolId); saveFavoriteFolders(); renderQuickTools(); showToast('Tool removed');
  }

  function unitOptions(tool, selected) {
    return tool.units.map((item, index) => `<option value="${index}"${index === Number(selected) ? ' selected' : ''} title="${escapeHtml(item.name)} (${escapeHtml(item.symbol)})">${escapeHtml(item.name)} (${escapeHtml(item.symbol)})</option>`).join('');
  }

  function renderUnitTool(tool) {
    return `<div class="converter-layout">
      <div class="tool-form-card">
        <h2>Enter a value</h2><p>Results update immediately as you type or change a unit.</p>
        <div class="field-stack">
          <label class="field-card"><span>From</span><span class="input-shell unit-input-shell"><input id="unitInput" data-unit-value data-numeric type="text" inputmode="none" virtualkeyboardpolicy="manual" value="" placeholder="Example: 1" aria-label="Value to convert"><select id="unitFrom" data-unit-from aria-label="From unit">${unitOptions(tool, tool.defaultFrom)}</select></span></label>
          <div class="swap-row"><button class="swap-button" type="button" data-tool-action="swap-units" aria-label="Swap units">${iconMarkup('swap')}</button></div>
          <label class="field-card"><span>To</span><span class="input-shell unit-input-shell"><input id="unitOutput" data-unit-output type="text" value="" readonly aria-label="Converted value"><select id="unitTo" data-unit-to aria-label="To unit">${unitOptions(tool, tool.defaultTo)}</select></span></label>
        </div>
        <p class="tool-error" id="toolError"></p>
        <div class="tool-actions"><button class="secondary-button" type="button" data-tool-action="reset">Reset</button><span class="action-pair"><button class="primary-button" type="button" data-tool-action="copy-tool">${iconMarkup('copy')} Copy</button><button class="secondary-button save-history-button" type="button" data-tool-action="save-tool">${iconMarkup('bookmark')} Save</button></span></div>
        ${tool.note ? `<div class="formula-banner">${iconMarkup('info')}<span>${escapeHtml(tool.note)}</span></div>` : ''}
      </div>
      <div class="tool-result-card" id="toolResult"><div class="result-placeholder"><div>${iconMarkup('sparkles')}<p>Enter a value to see the conversion and its formula.</p></div></div></div>
    </div>`;
  }

  function fieldMarkup(field) {
    const classes = `field-card${field.full ? ' full' : ''}`;
    const condition = field.when ? ` data-when-field="${escapeHtml(field.when.field)}" data-when-values="${escapeHtml(field.when.values.join(','))}"` : '';
    let control;
    if (field.type === 'select' && field.segmented) {
      control = `<div class="segment-field" role="group" aria-label="${escapeHtml(field.label)}"><input id="field-${field.id}" name="${field.id}" data-calc-field type="hidden" value="${escapeHtml(field.default)}">${field.options.map((option) => `<button type="button" data-segment-field="${escapeHtml(field.id)}" data-segment-value="${escapeHtml(option.value)}" class="${String(option.value) === String(field.default) ? 'is-active' : ''}">${escapeHtml(option.label)}</button>`).join('')}</div>`;
    } else if (field.type === 'select') {
      control = `<select class="smart-select" id="field-${field.id}" name="${field.id}" data-calc-field>${field.options.map((option) => `<option value="${escapeHtml(option.value)}"${String(option.value) === String(field.default) ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>`;
    } else if (field.type === 'time12') {
      control = `<span class="input-shell clock-input-shell"><input id="field-${field.id}" name="${field.id}" data-calc-field data-time-input type="text" inputmode="none" virtualkeyboardpolicy="manual" value="" maxlength="5" placeholder="${escapeHtml(field.placeholder || '00:00')}"><select id="field-${field.id}Period" data-time-period aria-label="${escapeHtml(field.label)} AM or PM"><option value="am"${field.periodDefault === 'am' ? ' selected' : ''}>AM</option><option value="pm"${field.periodDefault === 'pm' ? ' selected' : ''}>PM</option></select></span>`;
    } else if (field.type === 'number' && field.unit) {
      control = `<span class="input-shell"><input id="field-${field.id}" name="${field.id}" data-calc-field data-numeric type="text" inputmode="none" virtualkeyboardpolicy="manual" value="" placeholder="${escapeHtml(field.placeholder || `Example: ${field.default}`)}"><span class="input-unit" title="${escapeHtml(field.unit)}">${escapeHtml(field.unit)}</span></span>`;
    } else {
      const type = field.type === 'date' ? 'date' : 'text';
      const numeric = field.type === 'number' ? ' data-numeric inputmode="none" virtualkeyboardpolicy="manual"' : field.numericList ? ' data-numeric-list inputmode="none" virtualkeyboardpolicy="manual"' : '';
      control = `<input class="smart-input" id="field-${field.id}" name="${field.id}" data-calc-field type="${type}"${numeric} value="" placeholder="${escapeHtml(field.placeholder || `Example: ${field.default}`)}">`;
    }
    const solveControl = field.solveToggle ? `<label class="solve-toggle"><input type="checkbox" data-solve-target="${escapeHtml(field.id)}"${field.solveByDefault ? ' checked' : ''}><span>Solve for</span></label>` : '';
    return `<div class="${classes}${field.solveByDefault ? ' is-solving' : ''}" data-field-wrapper="${escapeHtml(field.id)}"${condition}><div class="field-label-row"><label class="input-label" for="field-${field.id}">${escapeHtml(field.label)}</label>${solveControl}</div>${control}${field.help ? `<span class="field-help">${escapeHtml(field.help)}</span>` : ''}</div>`;
  }

  function renderCalculatorTool(tool) {
    return `<div class="calculator-layout">
      <div class="tool-form-card">
        <h2>Your inputs</h2><p>Change any field to recalculate instantly.</p>
        <form id="calculatorToolForm" class="field-grid${tool.id === 'calc-date-difference' ? ' compact-date-fields' : ''}" novalidate>${tool.fields.map(fieldMarkup).join('')}</form>
        <p class="tool-error" id="toolError"></p>
        <div class="tool-actions"><button class="secondary-button" type="button" data-tool-action="reset">Reset</button><span class="action-pair"><button class="primary-button" type="button" data-tool-action="copy-tool">${iconMarkup('copy')} Copy</button><button class="secondary-button save-history-button" type="button" data-tool-action="save-tool">${iconMarkup('bookmark')} Save</button></span></div>
        ${tool.note ? `<div class="formula-banner">${iconMarkup('info')}<span>${escapeHtml(tool.note)}</span></div>` : ''}
      </div>
      <div class="tool-result-card" id="toolResult"><div class="result-placeholder"><div>${iconMarkup('sparkles')}<p>Fill in the fields to see the answer and working formula.</p></div></div></div>
    </div>`;
  }

  function openTool(toolId, initialValues, origin) {
    const tool = TOOL_MAP.get(toolId);
    if (!tool) return;
    state.currentTool = tool;
    state.currentToolResult = null;
    state.graphZoom = tool.id === 'calc-quadratic' ? 1.5 : 1;
    if (tool.id === 'calc-quadratic') state.graphResolution = 1;
    state.toolOrigin = origin && ['toolbox', 'folder'].includes(origin.type)
      ? { type: origin.type, folderId: origin.folderId || null }
      : { type: 'calculator', folderId: null };
    hideNumericPad();
    closeDrawer();
    toggleMenu(false);
    dom.calculatorView.hidden = true;
    dom.toolView.hidden = false;
    const category = CATEGORY_BY_TOOL.get(tool.id);
    dom.toolPageCategory.textContent = category.title;
    dom.toolPageTitle.textContent = tool.title;
    dom.toolPageDescription.textContent = tool.description;
    dom.toolPageIcon.innerHTML = iconMarkup(tool.icon);
    const originFolder = favoriteFolderById(state.toolOrigin.folderId);
    dom.toolBackLabel.textContent = state.toolOrigin.type === 'toolbox'
      ? 'Back to toolbox'
      : state.toolOrigin.type === 'folder' && originFolder
        ? `Back to ${originFolder.name}`
        : 'Back to calculator';
    dom.toolWorkspace.innerHTML = tool.kind === 'unit' ? renderUnitTool(tool) : renderCalculatorTool(tool);
    bindToolEvents();
    if (initialValues && typeof initialValues === 'object') {
      if (tool.kind === 'unit') {
        const input = document.querySelector('[data-unit-value]');
        const from = document.querySelector('[data-unit-from]');
        const to = document.querySelector('[data-unit-to]');
        if (input && initialValues.value !== undefined) input.value = String(initialValues.value);
        if (from && initialValues.from !== undefined) from.value = String(initialValues.from);
        if (to && initialValues.to !== undefined) to.value = String(initialValues.to);
      } else {
        tool.fields.forEach((field) => {
          const element = document.getElementById(`field-${field.id}`);
          if (element && initialValues[field.id] !== undefined) element.value = String(initialValues[field.id]);
          const period = document.getElementById(`field-${field.id}Period`);
          if (period && initialValues[`${field.id}Period`] !== undefined) period.value = String(initialValues[`${field.id}Period`]);
          const solveToggle = document.querySelector(`[data-solve-target="${field.id}"]`);
          if (solveToggle && initialValues[`solve_${field.id}`] !== undefined) solveToggle.checked = String(initialValues[`solve_${field.id}`]) === 'true';
        });
        syncSegmentedFields();
      }
    }
    dom.toolWorkspace.querySelectorAll('[data-numeric]').forEach((input) => { if (input.value) input.value = groupedInputValue(input.value); });
    dom.toolWorkspace.querySelectorAll('[data-time-input]').forEach((input) => { if (input.value) input.value = formatClockInput(input.value); });
    updateConditionalFields();
    updateSolveFields();
    refreshCurrentToolResult();
    root.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showCalculatorHome() {
    state.currentTool = null;
    hideNumericPad();
    closeDrawer();
    toggleMenu(false);
    dom.toolView.hidden = true;
    dom.calculatorView.hidden = false;
    root.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backFromTool() {
    const origin = { ...state.toolOrigin };
    showCalculatorHome();
    if (origin.type === 'toolbox') {
      openDrawer();
      return;
    }
    if (origin.type === 'folder' && favoriteFolderById(origin.folderId)) {
      state.activeFavoriteFolderId = origin.folderId;
      dom.favoriteSearch.value = '';
      renderQuickTools();
      root.setTimeout(() => document.querySelector('.quick-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
    }
  }

  function formulaMarkup(expression) {
    if (!expression) return '<span>Result shown in exact notation where applicable.</span>';
    try {
      const ast = parseExpression(expression);
      return `<math display="block">${astToMathML(ast, 0)}</math>`;
    } catch (_) {
      return fallbackMathML(expression);
    }
  }

  const VISUAL_GREEN = '#2d9b63';
  const VISUAL_GREEN_DARK = '#176f45';
  const REFERENCE_RED = '#d63d3d';

  function visualFrame(svg, caption, referenceLabel) {
    return `<div class="live-visual">${svg}<div class="visual-caption"><span>${escapeHtml(caption)}</span><span class="visual-reference-label">${escapeHtml(referenceLabel)}</span></div></div>`;
  }

  function referenceSide(toolId) {
    const value = Number(state.referenceSides[toolId] ?? 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function referenceSideLabel(side) {
    return trimNumber(side, side < 1 ? 4 : 2);
  }

  function isoPoint(x, y, z) {
    return { x: (x - y) * Math.sqrt(3) / 2, y: (x + y) / 2 - z };
  }

  function pointBounds(points) {
    const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  function isoBoxData(length, width, height) {
    const p = {
      o: isoPoint(0, 0, 0), x: isoPoint(length, 0, 0), y: isoPoint(0, width, 0), xy: isoPoint(length, width, 0),
      z: isoPoint(0, 0, height), xz: isoPoint(length, 0, height), yz: isoPoint(0, width, height), xyz: isoPoint(length, width, height),
    };
    return { points: p, bounds: pointBounds(Object.values(p)) };
  }

  function polygonPoints(points) {
    return points.map((point) => `${point.x},${point.y}`).join(' ');
  }

  function isoBoxMarkup(data, stroke, colors) {
    const p = data.points; const shift = (point) => ({ x: point.x - data.bounds.minX, y: point.y - data.bounds.minY });
    const top = [p.z, p.xz, p.xyz, p.yz].map(shift);
    const left = [p.y, p.xy, p.xyz, p.yz].map(shift);
    const right = [p.x, p.xz, p.xyz, p.xy].map(shift);
    return `<polygon points="${polygonPoints(left)}" fill="${colors[1]}" stroke="${colors[3]}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/><polygon points="${polygonPoints(right)}" fill="${colors[2]}" stroke="${colors[3]}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/><polygon points="${polygonPoints(top)}" fill="${colors[0]}" stroke="${colors[3]}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/>`;
  }

  function circularSolidProjection(radius, height, type, fill, topFill, strokeColor) {
    const diameter = radius * 2;
    const width = diameter * Math.sqrt(3);
    const projectedHeight = height * 2;
    const ellipseHeight = Math.max(.000001, Math.min(projectedHeight * .42, width * .28));
    const centerX = width / 2;
    const topCenterY = ellipseHeight / 2;
    const bottomCenterY = projectedHeight - ellipseHeight / 2;
    const rx = centerX; const ry = ellipseHeight / 2; const kappa = .5522847498307936;
    const frontEdge = `C0 ${bottomCenterY + kappa * ry} ${centerX - kappa * rx} ${bottomCenterY + ry} ${centerX} ${bottomCenterY + ry}C${centerX + kappa * rx} ${bottomCenterY + ry} ${width} ${bottomCenterY + kappa * ry} ${width} ${bottomCenterY}`;
    const rearEdge = `C0 ${bottomCenterY - kappa * ry} ${centerX - kappa * rx} ${bottomCenterY - ry} ${centerX} ${bottomCenterY - ry}C${centerX + kappa * rx} ${bottomCenterY - ry} ${width} ${bottomCenterY - kappa * ry} ${width} ${bottomCenterY}`;
    const hiddenEdge = `<path d="M0 ${bottomCenterY}${rearEdge}" fill="none" stroke="${strokeColor}" stroke-opacity=".48" stroke-width="1.7" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`;
    const markup = (stroke) => type === 'cylinder'
      ? `<path d="M0 ${topCenterY}V${bottomCenterY}${frontEdge}V${topCenterY}Z" fill="${fill}" stroke="${strokeColor}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/><ellipse cx="${centerX}" cy="${topCenterY}" rx="${centerX}" ry="${ellipseHeight / 2}" fill="${topFill}" stroke="${strokeColor}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/>${hiddenEdge}`
      : `<path d="M${centerX} 0L0 ${bottomCenterY}${frontEdge}Z" fill="${fill}" stroke="${strokeColor}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/>${hiddenEdge}`;
    return { width, height: projectedHeight, markup };
  }

  function geometryVisualSvg(tool, result, side = referenceSide(tool.id)) {
    const id = tool.id;
    if (!id.startsWith('calc-') || !['calc-circle', 'calc-rectangle', 'calc-triangle', 'calc-trapezoid', 'calc-sphere', 'calc-cylinder', 'calc-cone', 'calc-rectangular-prism', 'calc-regular-polygon'].includes(id)) return '';
    const values = calculatorValues(tool);
    const canvasWidth = 420; const canvasHeight = 274; const contentHeight = 266; const padding = id === 'calc-triangle' ? 38 : 20;
    const is3d = ['calc-sphere', 'calc-cylinder', 'calc-cone', 'calc-rectangular-prism'].includes(id);
    let shapeWidth; let shapeHeight; let shapeMarkup; let triangleData = null; let referenceWidth = side; let referenceHeight = side; let referenceMarkup;
    if (id === 'calc-circle') {
      const radius = Math.max(.000001, Number(values.radius));
      shapeWidth = shapeHeight = radius * 2;
      shapeMarkup = (stroke) => `<circle cx="${radius}" cy="${radius}" r="${radius}" fill="${VISUAL_GREEN}" fill-opacity=".78" stroke="${VISUAL_GREEN_DARK}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/><line x1="${radius}" y1="${radius}" x2="${radius * 2}" y2="${radius}" stroke="white" stroke-width="${Math.max(stroke * .7, .00001)}" stroke-dasharray="${stroke * 2} ${stroke * 1.5}" vector-effect="non-scaling-stroke"/>`;
    } else if (id === 'calc-rectangle') {
      shapeWidth = Math.max(.000001, Number(values.length)); shapeHeight = Math.max(.000001, Number(values.width));
      shapeMarkup = (stroke) => `<rect width="${shapeWidth}" height="${shapeHeight}" fill="${VISUAL_GREEN}" fill-opacity=".78" stroke="${VISUAL_GREEN_DARK}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/>`;
    } else if (id === 'calc-triangle') {
      const sides = result.meta?.sides || [3, 4, 5]; const [a, b, c] = sides; const rawX = (b * b + c * c - a * a) / (2 * c); const rawY = Math.sqrt(Math.max(0, b * b - rawX * rawX));
      const minX = Math.min(0, rawX); const maxX = Math.max(c, rawX);
      shapeWidth = Math.max(.000001, maxX - minX); shapeHeight = Math.max(.000001, rawY);
      const left = { x: -minX, y: rawY }; const right = { x: c - minX, y: rawY }; const top = { x: rawX - minX, y: 0 };
      const points = `${left.x},${left.y} ${right.x},${right.y} ${top.x},${top.y}`;
      const [A, B, C] = result.meta?.angles || [0, 0, 0];
      triangleData = { left, right, top, angles: [A, B, C], sides: [a, b, c] };
      shapeMarkup = (stroke) => `<polygon points="${points}" fill="${VISUAL_GREEN}" fill-opacity=".78" stroke="${VISUAL_GREEN_DARK}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/>`;
    } else if (id === 'calc-trapezoid') {
      const a = Math.max(.000001, Number(values.a)); const b = Math.max(.000001, Number(values.b)); const height = Math.max(.000001, Number(values.height));
      shapeWidth = Math.max(a, b); shapeHeight = height;
      shapeMarkup = (stroke) => `<polygon points="${(shapeWidth - a) / 2},0 ${(shapeWidth + a) / 2},0 ${(shapeWidth + b) / 2},${height} ${(shapeWidth - b) / 2},${height}" fill="${VISUAL_GREEN}" fill-opacity=".78" stroke="${VISUAL_GREEN_DARK}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/>`;
    } else if (id === 'calc-regular-polygon') {
      const n = Math.max(3, Math.min(80, Math.round(Number(values.sides)))); const length = Math.max(.000001, Number(values.length)); const radius = length / (2 * Math.sin(Math.PI / n));
      const rawPoints = Array.from({ length: n }, (_, index) => ({ x: radius * Math.cos(-Math.PI / 2 + index * Math.PI * 2 / n), y: radius * Math.sin(-Math.PI / 2 + index * Math.PI * 2 / n) }));
      const bounds = pointBounds(rawPoints); shapeWidth = bounds.maxX - bounds.minX; shapeHeight = bounds.maxY - bounds.minY;
      const points = polygonPoints(rawPoints.map((point) => ({ x: point.x - bounds.minX, y: point.y - bounds.minY })));
      shapeMarkup = (stroke) => `<polygon points="${points}" fill="${VISUAL_GREEN}" fill-opacity=".78" stroke="${VISUAL_GREEN_DARK}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/>`;
    } else {
      const refBox = isoBoxData(side, side, side); referenceWidth = refBox.bounds.maxX - refBox.bounds.minX; referenceHeight = refBox.bounds.maxY - refBox.bounds.minY;
      referenceMarkup = (stroke) => isoBoxMarkup(refBox, stroke, ['#ef7373', '#d94444', '#b92d2d', '#9d2222']);
      if (id === 'calc-sphere') {
        const radius = Math.max(.000001, Number(values.radius)); shapeWidth = shapeHeight = radius * 2;
        shapeMarkup = (stroke) => `<circle cx="${radius}" cy="${radius}" r="${radius}" fill="url(#sphereGreen)" stroke="${VISUAL_GREEN_DARK}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/><ellipse cx="${radius}" cy="${radius}" rx="${radius}" ry="${radius * .28}" fill="none" stroke="#d4f5e2" stroke-width="${stroke * .65}" vector-effect="non-scaling-stroke"/>`;
      } else if (id === 'calc-cylinder' || id === 'calc-cone') {
        const radius = Math.max(.000001, Number(values.radius)); const height = Math.max(.000001, Number(values.height));
        const circular = circularSolidProjection(radius, height, id === 'calc-cylinder' ? 'cylinder' : 'cone', 'url(#shapeGreen)', '#79dca4', VISUAL_GREEN_DARK);
        shapeWidth = circular.width; shapeHeight = circular.height; shapeMarkup = circular.markup;
      } else {
        const data = isoBoxData(Math.max(.000001, Number(values.length)), Math.max(.000001, Number(values.width)), Math.max(.000001, Number(values.height)));
        shapeWidth = data.bounds.maxX - data.bounds.minX; shapeHeight = data.bounds.maxY - data.bounds.minY;
        shapeMarkup = (stroke) => isoBoxMarkup(data, stroke, ['#7bddaa', '#258657', '#1d7048', VISUAL_GREEN_DARK]);
      }
    }

    const gapWorld = Math.max(Math.max(shapeWidth, shapeHeight, referenceWidth, referenceHeight) * .08, side * .25, .00001);
    const triangleAnnotationGap = triangleData ? 76 : 0;
    const totalWidth = shapeWidth + gapWorld + referenceWidth; const totalHeight = Math.max(shapeHeight, referenceHeight);
    const scale = Math.min((canvasWidth - padding * 2 - triangleAnnotationGap) / totalWidth, (contentHeight - padding * 2) / totalHeight);
    const occupiedWidth = totalWidth * scale + triangleAnnotationGap;
    const left = (canvasWidth - occupiedWidth) / 2; const top = (contentHeight - totalHeight * scale) / 2;
    const shapeY = top + (totalHeight - shapeHeight) * scale / 2; const refX = left + (shapeWidth + gapWorld) * scale + triangleAnnotationGap; const refY = top + (totalHeight - referenceHeight) * scale / 2;
    const worldStroke = 2.4;
    const reference = referenceMarkup
      ? `<g transform="translate(${refX} ${refY}) scale(${scale})">${referenceMarkup(worldStroke)}</g>`
      : `<rect x="${refX}" y="${refY}" width="${referenceWidth * scale}" height="${referenceHeight * scale}" fill="${REFERENCE_RED}" fill-opacity=".72" stroke="#9d2222" stroke-width="2"/>`;
    let triangleAnnotations = '';
    if (triangleData) {
      const screen = (point) => ({ x: left + point.x * scale, y: shapeY + point.y * scale });
      const l = screen(triangleData.left); const r = screen(triangleData.right); const t = screen(triangleData.top); const [A, B, C] = triangleData.angles; const [a, b, c] = triangleData.sides;
      const label = (title, value, x, y, anchor = 'middle') => `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="var(--ink-2)" stroke="var(--surface)" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round" font-family="ui-sans-serif,system-ui" font-size="9.5" font-weight="520"><tspan x="${x}" dy="-4">${escapeHtml(title)}</tspan><tspan x="${x}" dy="11">${escapeHtml(value)}</tspan></text>`;
      triangleAnnotations = `<g class="triangle-annotations" pointer-events="none">${label('Leg 3 (c)', trimNumber(c, 4), (l.x + r.x) / 2, l.y + 20)}${label('Leg 2 (b)', trimNumber(b, 4), (l.x + t.x) / 2 - 13, (l.y + t.y) / 2, 'end')}${label('Leg 1 (a)', trimNumber(a, 4), (r.x + t.x) / 2 + 13, (r.y + t.y) / 2, 'start')}${label('∠1 A', `${trimNumber(A, 2)}°`, Math.max(4, l.x - 28), l.y + 23, 'start')}${label('∠2 B', `${trimNumber(B, 2)}°`, r.x + 9, r.y + 23, 'start')}${label('∠3 C', `${trimNumber(C, 2)}°`, t.x, t.y - 18)}</g>`;
    }
    return `<svg viewBox="0 0 ${canvasWidth} ${canvasHeight}" role="img" aria-label="Scale-accurate green shape and adjustable red reference"><defs><linearGradient id="shapeGreen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#70d99f"/><stop offset="1" stop-color="${VISUAL_GREEN_DARK}"/></linearGradient><radialGradient id="sphereGreen" cx="35%" cy="28%"><stop stop-color="#b4f0ce"/><stop offset=".45" stop-color="${VISUAL_GREEN}"/><stop offset="1" stop-color="${VISUAL_GREEN_DARK}"/></radialGradient></defs><g transform="translate(${left} ${shapeY}) scale(${scale})">${shapeMarkup(worldStroke, scale)}</g>${reference}${triangleAnnotations}</svg>`;
  }

  function geometryVisualMarkup(tool, result) {
    const id = tool.id;
    if (!['calc-circle', 'calc-rectangle', 'calc-triangle', 'calc-trapezoid', 'calc-sphere', 'calc-cylinder', 'calc-cone', 'calc-rectangular-prism', 'calc-regular-polygon'].includes(id)) return '';
    const side = referenceSide(id); const is3d = ['calc-sphere', 'calc-cylinder', 'calc-cone', 'calc-rectangular-prism'].includes(id);
    const label = referenceSideLabel(side);
    return `<div class="live-visual geometry-visual" data-geometry-visual="${id}"><div class="visual-toolbar"><span>${is3d ? 'Scale-accurate isometric view' : 'Scale-accurate 2D view'}</span><label class="reference-control"><span>Reference side</span><input type="text" inputmode="decimal" value="${label}" data-reference-side="${id}" aria-label="Red reference side"><small>units</small></label></div><div class="geometry-canvas">${geometryVisualSvg(tool, result, side)}</div><div class="visual-caption"><span>Green dimensions keep their entered proportions.</span><span class="visual-reference-label">Red ${is3d ? `cube = ${label}×${label}×${label}` : `square = ${label}×${label}`} unit${side === 1 ? '' : 's'}</span></div></div>`;
  }

  function normalizedGraphResolution(value) {
    const parsed = Number(String(value ?? '').replaceAll(',', '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? clamp(parsed, .000001, 1e6) : 1;
  }

  function quadraticGraphSvg(meta, requestedResolution) {
    const { a, b, c } = meta; const resolution = normalizedGraphResolution(requestedResolution);
    const width = 820; const height = 560; const pad = 62; const plotWidth = width - pad * 2; const plotHeight = height - pad * 2;
    const vertex = -b / (2 * a); const vertexY = a * vertex * vertex + b * vertex + c;
    const halfSpan = Math.max(10, resolution * 2);
    let xMin = Math.floor((vertex - halfSpan) / resolution) * resolution; let xMax = Math.ceil((vertex + halfSpan) / resolution) * resolution;
    if (!(xMax > xMin)) { xMin = vertex - resolution * 2; xMax = vertex + resolution * 2; }
    const xSpan = xMax - xMin; const unitScale = plotWidth / xSpan; const ySpan = plotHeight / unitScale;
    const yMin = vertexY - ySpan * .38; const yMax = yMin + ySpan;
    const samples = Array.from({ length: 1601 }, (_, index) => { const x = xMin + (xMax - xMin) * index / 1600; return { x, y: a * x * x + b * x + c }; });
    const sx = (x) => pad + (x - xMin) * unitScale; const sy = (y) => height - pad - (y - yMin) * unitScale;
    const xStart = Math.ceil((xMin - resolution * 1e-9) / resolution) * resolution; const yStart = Math.ceil((yMin - resolution * 1e-9) / resolution) * resolution;
    const xCount = Math.max(0, Math.floor((xMax - xStart + resolution * 1e-9) / resolution)); const yCount = Math.max(0, Math.floor((yMax - yStart + resolution * 1e-9) / resolution));
    const safeGridStride = Math.max(1, Math.ceil(Math.max(xCount, yCount) / 4000));
    const labelStride = Math.max(1, Math.ceil(25 / Math.max(resolution * unitScale, .000001)));
    const labelPrecision = Math.min(10, Math.max(2, Math.ceil(-Math.log10(resolution)) + 2));
    let gridLines = ''; let labels = '';
    for (let step = 0; step <= xCount; step += safeGridStride) {
      const x = xStart + step * resolution;
      gridLines += `<line x1="${sx(x)}" y1="${pad}" x2="${sx(x)}" y2="${height - pad}" stroke="currentColor" stroke-opacity=".2" stroke-width=".72" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/>`;
    }
    for (let step = 0; step <= yCount; step += safeGridStride) {
      const y = yStart + step * resolution;
      gridLines += `<line x1="${pad}" y1="${sy(y)}" x2="${width - pad}" y2="${sy(y)}" stroke="currentColor" stroke-opacity=".2" stroke-width=".72" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/>`;
    }
    for (let step = 0; step <= xCount; step += labelStride) {
      const x = xStart + step * resolution;
      labels += `<text x="${sx(x)}" y="${height - 24}" text-anchor="middle" fill="currentColor" fill-opacity=".72" font-family="ui-sans-serif,system-ui" font-size="10" font-weight="400">${trimNumber(x, labelPrecision)}</text>`;
    }
    for (let step = 0; step <= yCount; step += labelStride) {
      const y = yStart + step * resolution; if (Math.abs(y) < resolution * .001) continue;
      labels += `<text x="${pad - 10}" y="${sy(y) + 3.5}" text-anchor="end" fill="currentColor" fill-opacity=".72" font-family="ui-sans-serif,system-ui" font-size="10" font-weight="400">${trimNumber(y, labelPrecision)}</text>`;
    }
    const path = samples.map((point, index) => `${index ? 'L' : 'M'}${sx(point.x).toFixed(2)} ${sy(point.y).toFixed(2)}`).join(' ');
    const xAxis = yMin <= 0 && yMax >= 0 ? `<line x1="${pad}" y1="${sy(0)}" x2="${width - pad}" y2="${sy(0)}" stroke="currentColor" stroke-width="2.35" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/>` : '';
    const yAxis = xMin <= 0 && xMax >= 0 ? `<line x1="${sx(0)}" y1="${pad}" x2="${sx(0)}" y2="${height - pad}" stroke="currentColor" stroke-width="2.35" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/>` : '';
    const apex = vertexY >= yMin && vertexY <= yMax ? `<circle cx="${sx(vertex)}" cy="${sy(vertexY)}" r="5" fill="${REFERENCE_RED}" stroke="var(--surface)" stroke-width="1.4" vector-effect="non-scaling-stroke"/>` : '';
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Crisp, zoomable and pannable live graph of the quadratic equation at ${escapeHtml(trimNumber(resolution, labelPrecision))} resolution"><defs><clipPath id="quadraticPlotClip"><rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}"/></clipPath></defs>${gridLines}${labels}${xAxis}${yAxis}<g clip-path="url(#quadraticPlotClip)"><path d="${path}" fill="none" stroke="${VISUAL_GREEN_DARK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${apex}</g></svg>`;
  }

  function quadraticGraphMarkup(meta) {
    if (!meta) return '';
    const { a, b, c } = meta; const resolution = normalizedGraphResolution(state.graphResolution); const resolutionLabel = trimNumber(resolution, 10);
    const equation = `y = ${trimNumber(a, 6)}x² ${b < 0 ? '−' : '+'} ${trimNumber(Math.abs(b), 6)}x ${c < 0 ? '−' : '+'} ${trimNumber(Math.abs(c), 6)}`;
    return `<div class="live-visual quadratic-visual"><div class="graph-toolbar"><span>LIVE GRAPH · drag to pan</span><label class="graph-resolution-control"><span>Graph Resolution</span><input type="text" inputmode="none" virtualkeyboardpolicy="manual" data-numeric data-graph-resolution value="${escapeHtml(resolutionLabel)}" aria-label="Graph Resolution"></label><span class="graph-zoom-controls"><button type="button" data-tool-action="graph-zoom-out" aria-label="Zoom graph out">−</button><button type="button" data-tool-action="graph-zoom-reset" aria-label="Reset graph zoom">${Math.round(state.graphZoom * 100)}%</button><button type="button" data-tool-action="graph-zoom-in" aria-label="Zoom graph in">+</button></span></div><div class="graph-viewport" data-graph-viewport><div class="graph-canvas" data-graph-svg-host style="width:${state.graphZoom * 100}%">${quadraticGraphSvg(meta, resolution)}</div></div><div class="visual-caption quadratic-caption"><span>Red dot = parabola apex</span><span class="quadratic-equation">${escapeHtml(equation)}</span></div></div>`;
  }

  function elementAppearance(symbol, phase) {
    const specific = { Au: ['#f2c94c', '#8f6500'], C: ['#30343a', '#050607'], Pb: ['#8d9399', '#484e55'], Cu: ['#cf7443', '#7b321b'], Ag: ['#e8edf2', '#89939e'], Fe: ['#9aa0a6', '#4d555c'], Al: ['#dce3e8', '#818b94'], Hg: ['#d8e1e8', '#667580'], S: ['#f2d84b', '#9b7d00'], Br: ['#a63c27', '#52180f'] };
    if (specific[symbol]) return specific[symbol];
    if (phase === 'Gas') return ['#8ed6f2', '#317c9d'];
    if (phase === 'Liquid') return ['#8dbbd3', '#3b6378'];
    return ['#b7c2c8', '#57646c'];
  }

  function elementVisualSvg(tool, result, side = referenceSide(tool.id)) {
    const values = calculatorValues(tool); const shape = result.meta.shape;
    const [light, dark] = elementAppearance(result.meta.element, result.meta.phase);
    const canvasWidth = 420; const canvasHeight = 274; const contentHeight = 266; const padding = 20;
    const positiveVisual = (id) => Math.max(.000001, Math.abs(Number(values[id]) || 0));
    const referenceData = isoBoxData(side, side, side);
    const referenceWidth = referenceData.bounds.maxX - referenceData.bounds.minX; const referenceHeight = referenceData.bounds.maxY - referenceData.bounds.minY;
    let shapeWidth; let shapeHeight; let shapeMarkup;
    const shiftedMarkup = (points, faces, stroke) => {
      const bounds = pointBounds(points); const shift = (point) => ({ x: point.x - bounds.minX, y: point.y - bounds.minY });
      return faces.map((face, index) => `<polygon points="${polygonPoints(face.map((item) => shift(points[item])))}" fill="${index === 0 ? light : index === 1 ? dark : `url(#elementMaterial)`}" stroke="${dark}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/>`).join('');
    };
    if (shape === 'cube' || shape === 'box') {
      const l = shape === 'cube' ? positiveVisual('cubeSide') : positiveVisual('boxLength');
      const w = shape === 'cube' ? l : positiveVisual('boxWidth'); const h = shape === 'cube' ? l : positiveVisual('boxHeight');
      const data = isoBoxData(l, w, h); shapeWidth = data.bounds.maxX - data.bounds.minX; shapeHeight = data.bounds.maxY - data.bounds.minY;
      shapeMarkup = (stroke) => isoBoxMarkup(data, stroke, [light, dark, `url(#elementMaterial)`, dark]);
    } else if (shape === 'sphere' || shape === 'ellipsoid') {
      const a = shape === 'sphere' ? positiveVisual('sphereRadius') : positiveVisual('axisA');
      const b = shape === 'sphere' ? a : positiveVisual('axisB'); const c = shape === 'sphere' ? a : positiveVisual('axisC');
      shapeWidth = 2 * Math.hypot(a * .866, b * .866); shapeHeight = 2 * Math.hypot((a + b) / 2, c);
      shapeMarkup = (stroke) => `<ellipse cx="${shapeWidth / 2}" cy="${shapeHeight / 2}" rx="${shapeWidth / 2}" ry="${shapeHeight / 2}" fill="url(#elementSphere)" stroke="${dark}" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/><ellipse cx="${shapeWidth / 2}" cy="${shapeHeight / 2}" rx="${shapeWidth / 2}" ry="${Math.max(.000001, c * .28)}" fill="none" stroke="${light}" stroke-opacity=".75" stroke-width="${stroke * .65}" vector-effect="non-scaling-stroke"/>`;
    } else if (shape === 'cylinder' || shape === 'cone') {
      const radius = positiveVisual(shape === 'cylinder' ? 'cylinderRadius' : 'coneRadius'); const height = positiveVisual(shape === 'cylinder' ? 'cylinderHeight' : 'coneHeight');
      const circular = circularSolidProjection(radius, height, shape, 'url(#elementMaterial)', light, dark);
      shapeWidth = circular.width; shapeHeight = circular.height; shapeMarkup = circular.markup;
    } else if (shape === 'pyramid') {
      const l = positiveVisual('pyramidLength'); const w = positiveVisual('pyramidWidth'); const h = positiveVisual('pyramidHeight');
      const points = [isoPoint(0, 0, 0), isoPoint(l, 0, 0), isoPoint(l, w, 0), isoPoint(0, w, 0), isoPoint(l / 2, w / 2, h)]; const bounds = pointBounds(points);
      shapeWidth = bounds.maxX - bounds.minX; shapeHeight = bounds.maxY - bounds.minY;
      shapeMarkup = (stroke) => shiftedMarkup(points, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]], stroke);
    } else {
      const b = positiveVisual('triangleBase'); const h = positiveVisual('triangleHeight'); const l = positiveVisual('prismLength');
      const points = [isoPoint(0, 0, 0), isoPoint(0, b, 0), isoPoint(0, b / 2, h), isoPoint(l, 0, 0), isoPoint(l, b, 0), isoPoint(l, b / 2, h)]; const bounds = pointBounds(points);
      shapeWidth = bounds.maxX - bounds.minX; shapeHeight = bounds.maxY - bounds.minY;
      shapeMarkup = (stroke) => shiftedMarkup(points, [[0, 1, 2], [3, 5, 4], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]], stroke);
    }
    const gapWorld = Math.max(Math.max(shapeWidth, shapeHeight, referenceWidth, referenceHeight) * .09, side * .28, .00001);
    const totalWidth = shapeWidth + gapWorld + referenceWidth; const totalHeight = Math.max(shapeHeight, referenceHeight);
    const scale = Math.min((canvasWidth - padding * 2) / totalWidth, (contentHeight - padding * 2) / totalHeight);
    const left = (canvasWidth - totalWidth * scale) / 2; const top = (contentHeight - totalHeight * scale) / 2;
    const shapeY = top + (totalHeight - shapeHeight) * scale / 2; const refX = left + (shapeWidth + gapWorld) * scale; const refY = top + (totalHeight - referenceHeight) * scale / 2;
    const reference = `<g transform="translate(${refX} ${refY}) scale(${scale})">${isoBoxMarkup(referenceData, 2.2, ['#ef7373', '#d94444', '#b92d2d', '#9d2222'])}</g>`;
    return `<svg viewBox="0 0 ${canvasWidth} ${canvasHeight}" role="img" aria-label="Scale-accurate ${escapeHtml(shape)} made from ${escapeHtml(result.meta.element)} beside an adjustable reference cube"><defs><linearGradient id="elementMaterial" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".55" stop-color="${dark}"/><stop offset=".82" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient><radialGradient id="elementSphere" cx="32%" cy="26%"><stop stop-color="#fff" stop-opacity=".86"/><stop offset=".25" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient><pattern id="elementGrain" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".7" fill="#fff" opacity=".2"/><circle cx="7" cy="6" r=".6" fill="#111" opacity=".16"/></pattern></defs><g transform="translate(${left} ${shapeY}) scale(${scale})">${shapeMarkup(2.4, scale)}</g>${reference}</svg>`;
  }

  function elementVisualMarkup(tool, result) {
    if (tool.id !== 'calc-element-shape' || !result.meta) return '';
    const side = referenceSide(tool.id); const label = referenceSideLabel(side); const shape = result.meta.shape;
    return `<div class="live-visual geometry-visual element-visual" data-geometry-visual="${tool.id}"><div class="visual-toolbar"><span>Scale-accurate material view</span><label class="reference-control"><span>Reference side</span><input type="text" inputmode="decimal" value="${label}" data-reference-side="${tool.id}" aria-label="Red reference cube side"><small>units</small></label></div><div class="geometry-canvas">${elementVisualSvg(tool, result, side)}</div><div class="visual-caption"><span>${escapeHtml(result.meta.element)} reference appearance · ${escapeHtml(shape)}</span><span class="visual-reference-label">Red cube = ${label}×${label}×${label} unit${side === 1 ? '' : 's'}</span></div></div>`;
  }

  function bmiChartMarkup() {
    return `<button class="secondary-button bmi-chart-toggle" type="button" data-tool-action="toggle-bmi-chart" aria-expanded="false">View full adult BMI chart</button><div class="bmi-chart" id="bmiChart" hidden><table><thead><tr><th>Adult screening category</th><th>BMI (kg/m²)</th></tr></thead><tbody><tr><td><span class="bmi-swatch" style="background:#5aa7dc"></span>Underweight</td><td>Below 18.5</td></tr><tr><td><span class="bmi-swatch" style="background:#48a868"></span>Healthy weight</td><td>18.5–24.9</td></tr><tr><td><span class="bmi-swatch" style="background:#e0a82e"></span>Overweight</td><td>25.0–29.9</td></tr><tr><td><span class="bmi-swatch" style="background:#de7b34"></span>Obesity class 1</td><td>30.0–34.9</td></tr><tr><td><span class="bmi-swatch" style="background:#d45545"></span>Obesity class 2</td><td>35.0–39.9</td></tr><tr><td><span class="bmi-swatch" style="background:#9f3e68"></span>Obesity class 3</td><td>40.0 or above</td></tr></tbody></table><p class="bmi-chart-note">Original in-app table based on standard CDC adult screening thresholds. BMI is not a diagnosis and is interpreted differently for children and teens.</p></div>`;
  }

  function renderResultCard(result, tool) {
    state.currentToolResult = result;
    const primary = typeof result.primary === 'number'
      ? (result.currency ? `$${formatMoney(result.primary, state.settings)}` : formatNumber(result.primary, state.settings))
      : String(result.primary);
    const visual = geometryVisualMarkup(tool, result) || (tool.id === 'calc-quadratic' ? quadraticGraphMarkup(result.meta) : '') || elementVisualMarkup(tool, result);
    if (tool.id === 'calc-quadratic' && root.requestAnimationFrame) root.requestAnimationFrame(() => {
      const viewport = document.querySelector('[data-graph-viewport]');
      if (!viewport) return;
      viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) * state.graphPanX;
      viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * state.graphPanY;
    });
    return `${visual}<span class="result-kicker">Live result</span>
      <div class="result-primary">${escapeHtml(primary)}</div>
      <div class="result-unit">${escapeHtml(result.unit || '')}</div>
      <div class="result-formula" aria-label="Formula">${formulaMarkup(result.expression)}</div>
      ${result.details?.length ? `<div class="detail-grid">${result.details.map((detail) => `<div class="detail-item"><span>${escapeHtml(detail.label)}</span><strong title="${escapeHtml(detailValue(detail, state.settings))}">${escapeHtml(detailValue(detail, state.settings))}</strong></div>`).join('')}</div>` : ''}
      ${(result.note || tool.note) ? `<p class="formula-note">${escapeHtml(result.note || tool.note)}</p>` : ''}
      ${tool.id === 'calc-bmi' ? bmiChartMarkup() : ''}`;
  }

  function calculateCurrentUnitTool(tool) {
    const input = document.querySelector('[data-unit-value]');
    const output = document.querySelector('[data-unit-output]');
    const from = document.querySelector('[data-unit-from]');
    const to = document.querySelector('[data-unit-to]');
    const errorElement = document.getElementById('toolError');
    const resultElement = document.getElementById('toolResult');
    if (!input || !output || !from || !to || !resultElement) return;
    if (!input.value.trim()) {
      output.value = '';
      errorElement.textContent = '';
      resultElement.innerHTML = `<div class="result-placeholder"><div>${iconMarkup('sparkles')}<p>Enter a value to see the conversion and its formula.</p></div></div>`;
      delete resultElement.dataset.copyValue;
      return;
    }
    try {
      const result = convertUnit(tool, input.value, from.value, to.value);
      output.value = formatNumber(result.value, state.settings);
      errorElement.textContent = '';
      const details = [
        { label: 'From', value: `${input.value} ${result.from.symbol}` },
        { label: 'To', value: result.to.name },
        { label: 'Conversion factor', value: tool.customConvert ? 'Reciprocal conversion' : result.from.factor / result.to.factor },
      ];
      if (tool.id === 'unit-storage') {
        const bytes = (finiteNumber(input.value, 'Value') + (result.from.offset || 0)) * result.from.factor;
        const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']; let index = 0; let binary = Math.abs(bytes);
        while (binary >= 1024 && index < units.length - 1) { binary /= 1024; index += 1; }
        details.push({ label: 'IEC binary unit value', value: `${bytes < 0 ? '−' : ''}${formatNumber(binary, state.settings)} ${units[index]}` });
      }
      const rendered = {
        primary: result.value,
        unit: result.to.symbol,
        expression: result.expression,
        details,
        note: tool.note,
      };
      resultElement.innerHTML = renderResultCard(rendered, tool);
      resultElement.dataset.copyValue = `${formatNumber(result.value, state.settings)} ${result.to.symbol}`;
    } catch (error) {
      output.value = '';
      errorElement.textContent = error.message;
      resultElement.innerHTML = `<div class="result-placeholder"><div>${iconMarkup('info')}<p>${escapeHtml(error.message)}</p></div></div>`;
      delete resultElement.dataset.copyValue;
    }
  }

  function calculatorValues(tool) {
    const values = {};
    tool.fields.forEach((field) => {
      const element = document.getElementById(`field-${field.id}`);
      values[field.id] = fieldValue(field, element?.value ?? '');
      const period = document.getElementById(`field-${field.id}Period`);
      if (period) values[`${field.id}Period`] = period.value;
      const solveToggle = document.querySelector(`[data-solve-target="${field.id}"]`);
      if (solveToggle) values[`solve_${field.id}`] = String(solveToggle.checked);
    });
    return values;
  }

  function scheduleCurrencyCalculation(tool) {
    root.clearTimeout(state.currencyTimer);
    const request = ++state.currencyRequest;
    const resultElement = document.getElementById('toolResult');
    if (resultElement) {
      resultElement.innerHTML = `<div class="result-placeholder"><div>${iconMarkup('sparkles')}<p>Loading the latest available reference rate…</p></div></div>`;
      delete resultElement.dataset.copyValue;
    }
    state.currencyTimer = root.setTimeout(() => calculateCurrencyTool(tool, request), 240);
  }

  async function calculateCurrencyTool(tool, request) {
    if (state.currentTool?.id !== tool.id || request !== state.currencyRequest) return;
    const errorElement = document.getElementById('toolError'); const resultElement = document.getElementById('toolResult');
    if (!resultElement) return;
    try {
      const values = calculatorValues(tool); const amount = finiteNumber(values.amount, 'Amount'); const from = String(values.from); const to = String(values.to);
      let rate = 1; let rateDate = 'Same-currency conversion'; let cached = false;
      if (from !== to) {
        const cacheKey = `everything-calculator.currency.${from}.${to}`;
        const stored = safeStorageRead(cacheKey, null);
        try {
          const quote = await fetchCurrencyQuote(from, to);
          rate = quote.rate; rateDate = quote.date;
          safeStorageWrite(cacheKey, { rate, date: rateDate, savedAt: Date.now() });
        } catch (networkError) {
          if (!stored || !Number.isFinite(Number(stored.rate))) throw networkError;
          rate = Number(stored.rate); rateDate = String(stored.date || 'Previously loaded'); cached = true;
        }
      }
      if (state.currentTool?.id !== tool.id || request !== state.currencyRequest) return;
      const converted = amount * rate;
      const result = calcResult(`${formatMoney(converted, state.settings)} ${to}`, 'converted amount', `${amount}*${rate}`, [
        { label: 'Entered amount', value: `${formatMoney(amount, state.settings)} ${from}` },
        { label: 'Reference rate', value: `1 ${from} = ${trimNumber(rate, 12)} ${to}` },
        { label: cached ? 'Rate date · cached' : 'Rate date', value: rateDate },
      ], cached ? 'The live service was unavailable, so the most recently loaded dated rate on this device is shown.' : tool.note);
      errorElement.textContent = '';
      resultElement.innerHTML = renderResultCard(result, tool);
      resultElement.dataset.copyValue = `${formatMoney(converted, state.settings)} ${to}`;
    } catch (error) {
      if (state.currentTool?.id !== tool.id || request !== state.currencyRequest) return;
      errorElement.textContent = error.message || 'Could not load the latest exchange rate.';
      resultElement.innerHTML = `<div class="result-placeholder"><div>${iconMarkup('info')}<p>Connect to the internet to load the latest exchange rate.</p></div></div>`;
      delete resultElement.dataset.copyValue;
    }
  }

  function calculateCurrentCalculatorTool(tool) {
    const errorElement = document.getElementById('toolError');
    const resultElement = document.getElementById('toolResult');
    if (!resultElement) return;
    const missing = tool.id !== 'calc-triangle' && [...dom.toolWorkspace.querySelectorAll('[data-field-wrapper]:not([hidden]) [data-calc-field]')]
      .some((element) => element.type !== 'hidden' && element.tagName !== 'SELECT' && !element.closest('[data-field-wrapper]')?.classList.contains('is-solving') && !String(element.value).trim());
    if (missing) {
      root.clearTimeout(state.currencyTimer);
      state.currencyRequest += 1;
      errorElement.textContent = '';
      resultElement.innerHTML = `<div class="result-placeholder"><div>${iconMarkup('sparkles')}<p>Fill in the fields to see the answer and working formula.</p></div></div>`;
      delete resultElement.dataset.copyValue;
      return;
    }
    if (tool.asyncType === 'currency') {
      scheduleCurrencyCalculation(tool);
      return;
    }
    try {
      const result = tool.calculate(calculatorValues(tool));
      errorElement.textContent = '';
      resultElement.innerHTML = renderResultCard(result, tool);
      const primary = typeof result.primary === 'number' ? (result.currency ? `$${formatMoney(result.primary, state.settings)}` : formatNumber(result.primary, state.settings)) : result.primary;
      resultElement.dataset.copyValue = `${primary}${result.unit ? ` ${result.unit}` : ''}`;
    } catch (error) {
      errorElement.textContent = error.message;
      resultElement.innerHTML = `<div class="result-placeholder"><div>${iconMarkup('info')}<p>${escapeHtml(error.message)}</p></div></div>`;
      delete resultElement.dataset.copyValue;
    }
  }

  function refreshCurrentToolResult() {
    if (!state.currentTool) return;
    if (state.currentTool.kind === 'unit') calculateCurrentUnitTool(state.currentTool);
    else calculateCurrentCalculatorTool(state.currentTool);
  }

  function resetCurrentTool() {
    const tool = state.currentTool;
    if (!tool) return;
    if (tool.kind === 'unit') {
      document.querySelector('[data-unit-value]').value = '';
      document.querySelector('[data-unit-from]').value = String(tool.defaultFrom);
      document.querySelector('[data-unit-to]').value = String(tool.defaultTo);
    } else {
      tool.fields.forEach((field) => {
        const element = document.getElementById(`field-${field.id}`);
        if (element) element.value = field.type === 'select' ? String(field.default) : '';
        const period = document.getElementById(`field-${field.id}Period`);
        if (period) period.value = field.periodDefault || 'am';
        const solveToggle = document.querySelector(`[data-solve-target="${field.id}"]`);
        if (solveToggle) solveToggle.checked = Boolean(field.solveByDefault);
      });
      syncSegmentedFields();
      updateConditionalFields();
      updateSolveFields();
    }
    refreshCurrentToolResult();
  }

  function updateConditionalFields() {
    if (!dom) return;
    dom.toolWorkspace.querySelectorAll('[data-when-field]').forEach((wrapper) => {
      const source = document.getElementById(`field-${wrapper.dataset.whenField}`);
      const values = String(wrapper.dataset.whenValues || '').split(',');
      wrapper.hidden = !source || !values.includes(String(source.value));
    });
  }

  function syncSegmentedFields() {
    dom.toolWorkspace.querySelectorAll('[data-segment-field]').forEach((button) => {
      const input = document.getElementById(`field-${button.dataset.segmentField}`);
      button.classList.toggle('is-active', input && input.value === button.dataset.segmentValue);
    });
  }

  function updateSolveFields() {
    dom.toolWorkspace.querySelectorAll('[data-solve-target]').forEach((toggle) => {
      const wrapper = toggle.closest('[data-field-wrapper]');
      const input = document.getElementById(`field-${toggle.dataset.solveTarget}`);
      wrapper?.classList.toggle('is-solving', toggle.checked);
      if (input) {
        input.readOnly = toggle.checked;
        input.setAttribute('aria-disabled', String(toggle.checked));
      }
    });
  }

  function formatClockInput(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  }

  function ensureNumericPad() {
    let pad = document.getElementById('numericPad');
    if (pad) return pad;
    pad = document.createElement('div');
    pad.id = 'numericPad';
    pad.className = 'numeric-pad';
    pad.hidden = true;
    pad.innerHTML = `<div class="numeric-pad-header"><strong id="numericPadLabel">Enter a number</strong><span>Signed numeric keypad</span></div><div class="numeric-pad-grid"><button class="numeric-pad-key" type="button" data-pad-key="7">7</button><button class="numeric-pad-key" type="button" data-pad-key="8">8</button><button class="numeric-pad-key" type="button" data-pad-key="9">9</button><button class="numeric-pad-key pad-backspace" type="button" data-pad-key="backspace">${iconMarkup('backspace')}</button><button class="numeric-pad-key" type="button" data-pad-key="4">4</button><button class="numeric-pad-key" type="button" data-pad-key="5">5</button><button class="numeric-pad-key" type="button" data-pad-key="6">6</button><button class="numeric-pad-key" type="button" data-pad-key="-">−</button><button class="numeric-pad-key" type="button" data-pad-key="1">1</button><button class="numeric-pad-key" type="button" data-pad-key="2">2</button><button class="numeric-pad-key" type="button" data-pad-key="3">3</button><button class="numeric-pad-key pad-list" type="button" data-pad-key=",">,</button><button class="numeric-pad-key" type="button" data-pad-key="0">0</button><button class="numeric-pad-key" type="button" data-pad-key="00">00</button><button class="numeric-pad-key" type="button" data-pad-key="000">000</button><button class="numeric-pad-key" type="button" data-pad-key=".">.</button><button class="numeric-pad-key pad-done" type="button" data-pad-key="done">Done</button></div>`;
    document.body.appendChild(pad);
    pad.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pad-key]'); const input = state.numericPadInput;
      if (!button || !input) return;
      const key = button.dataset.padKey;
      if (key === 'done') { hideNumericPad(); return; }
      const time = input.matches('[data-time-input]'); const list = input.matches('[data-numeric-list]');
      if (time) {
        let digits = input.value.replace(/\D/g, '');
        if (key === 'backspace') digits = digits.slice(0, -1);
        else if (/^\d+$/.test(key)) digits = (digits + key).slice(0, 4);
        input.value = formatClockInput(digits);
      } else if (list) {
        if (key === 'backspace') input.value = input.value.slice(0, -1);
        else if (key === ',') input.value = `${input.value.replace(/\s+$/, '')}, `;
        else if (key === '-') input.value += '-';
        else input.value += key;
      } else {
        let raw = input.value.replaceAll(',', '');
        if (key === 'backspace') raw = raw.slice(0, -1);
        else if (key === '-') raw = raw.startsWith('-') ? raw.slice(1) : `-${raw}`;
        else if (key === '.' && raw.includes('.')) { /* one decimal point */ }
        else raw += key;
        input.value = groupedInputValue(raw);
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.setSelectionRange?.(input.value.length, input.value.length);
    });
    return pad;
  }

  function showNumericPad(input) {
    if (input.readOnly || input.disabled) return;
    const pad = ensureNumericPad(); state.numericPadInput = input;
    const label = input.closest('[data-field-wrapper]')?.querySelector('.input-label')?.textContent || input.getAttribute('aria-label') || 'Enter a number';
    pad.querySelector('#numericPadLabel').textContent = label;
    const list = input.matches('[data-numeric-list]'); const time = input.matches('[data-time-input]');
    pad.querySelectorAll('[data-pad-key="-"], [data-pad-key="."], [data-pad-key=","]').forEach((button) => { button.style.visibility = time || (button.dataset.padKey === ',' && !list) ? 'hidden' : 'visible'; });
    pad.hidden = false; document.body.classList.add('numeric-pad-open');
  }

  function hideNumericPad() {
    const pad = document.getElementById('numericPad'); if (pad) pad.hidden = true;
    document.body.classList.remove('numeric-pad-open'); state.numericPadInput = null;
  }

  function bindToolEvents() {
    dom.toolWorkspace.querySelectorAll('input, select').forEach((element) => {
      element.addEventListener('input', () => {
        if (element.matches('[data-numeric]')) {
          const next = groupedInputValue(element.value);
          if (next !== element.value) { element.value = next; element.setSelectionRange?.(next.length, next.length); }
        }
        if (element.matches('[data-time-input]')) {
          const next = formatClockInput(element.value);
          if (next !== element.value) { element.value = next; element.setSelectionRange?.(next.length, next.length); }
        }
        updateConditionalFields(); refreshCurrentToolResult();
      });
      element.addEventListener('change', () => { updateConditionalFields(); refreshCurrentToolResult(); });
    });
    dom.toolWorkspace.querySelectorAll('[data-numeric], [data-numeric-list], [data-time-input]').forEach((input) => {
      input.addEventListener('pointerdown', (event) => {
        if (!root.matchMedia?.('(pointer: coarse)').matches) return;
        event.preventDefault(); input.focus({ preventScroll: true }); showNumericPad(input);
      });
      input.addEventListener('focus', () => { if (root.matchMedia?.('(pointer: coarse)').matches) showNumericPad(input); });
    });
    dom.toolWorkspace.querySelectorAll('[data-solve-target]').forEach((toggle) => toggle.addEventListener('change', () => { updateSolveFields(); refreshCurrentToolResult(); }));
    dom.toolWorkspace.querySelectorAll('[data-segment-field]').forEach((button) => button.addEventListener('click', () => {
      const input = document.getElementById(`field-${button.dataset.segmentField}`);
      if (!input) return;
      input.value = button.dataset.segmentValue;
      syncSegmentedFields();
      updateConditionalFields();
      refreshCurrentToolResult();
    }));
    updateConditionalFields();
    updateSolveFields();
  }

  async function copyText(value) {
    if (!value) return false;
    try {
      if (root.navigator?.clipboard?.writeText) await root.navigator.clipboard.writeText(String(value));
      else {
        const textarea = document.createElement('textarea'); textarea.value = String(value); textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
      }
      return true;
    } catch (_) { return false; }
  }

  function showToast(message) {
    if (!dom) return;
    root.clearTimeout(state.toastTimer);
    dom.toast.querySelector('span').textContent = message;
    dom.toast.classList.add('is-visible');
    state.toastTimer = root.setTimeout(() => dom.toast.classList.remove('is-visible'), 1900);
  }

  function currentToolSnapshot() {
    const tool = state.currentTool;
    if (!tool) return null;
    if (tool.kind === 'unit') {
      return {
        value: document.querySelector('[data-unit-value]')?.value || '',
        from: document.querySelector('[data-unit-from]')?.value || String(tool.defaultFrom),
        to: document.querySelector('[data-unit-to]')?.value || String(tool.defaultTo),
      };
    }
    const snapshot = {};
    tool.fields.forEach((field) => {
      snapshot[field.id] = document.getElementById(`field-${field.id}`)?.value || '';
      const period = document.getElementById(`field-${field.id}Period`);
      if (period) snapshot[`${field.id}Period`] = period.value;
      const solveToggle = document.querySelector(`[data-solve-target="${field.id}"]`);
      if (solveToggle) snapshot[`solve_${field.id}`] = String(solveToggle.checked);
    });
    return snapshot;
  }

  function saveCurrentToolToHistory() {
    const tool = state.currentTool;
    const resultElement = document.getElementById('toolResult');
    const result = resultElement?.dataset.copyValue;
    if (!tool || !result) {
      showToast('Complete the calculation first');
      return;
    }
    const item = {
      expression: tool.title,
      result,
      timestamp: Date.now(),
      kind: 'tool',
      toolId: tool.id,
      values: currentToolSnapshot(),
    };
    const latest = state.history[0];
    if (!latest || latest.toolId !== item.toolId || latest.result !== item.result || JSON.stringify(latest.values) !== JSON.stringify(item.values)) {
      state.history.unshift(item);
      state.history = state.history.slice(0, 50);
      safeStorageWrite(STORAGE_KEYS.history, state.history);
    }
    showToast('Saved to history');
  }

  function renderHistory() {
    if (!state.history.length) {
      dom.historyList.innerHTML = `<div class="empty-history"><div>${iconMarkup('history')}<p>Your completed calculations will appear here.</p></div></div>`;
      return;
    }
    dom.historyList.innerHTML = state.history.map((item, index) => {
      const result = typeof item.result === 'number' ? formatNumber(item.result, state.settings) : String(item.result ?? '');
      return `<article class="history-item"><button type="button" data-history-index="${index}"><span class="history-expression">${escapeHtml(item.expression)}</span><strong class="history-result">${escapeHtml(result)}</strong></button><time datetime="${new Date(item.timestamp).toISOString()}">${escapeHtml(new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(item.timestamp))}</time></article>`;
    }).join('');
  }

  function openHistory() {
    toggleMenu(false); renderHistory(); dom.historyDialog.showModal();
  }

  function openInfo(type) {
    toggleMenu(false);
    if (type === 'about') {
      dom.infoEyebrow.textContent = `Version ${VERSION}`;
      dom.infoTitle.textContent = 'One calculator. A lot less hunting.';
      dom.infoContent.innerHTML = `<p>The Everything Calculator combines a live scientific expression engine with ${ALL_TOOLS.length} focused calculators and converters. It works locally in your browser, keeps recent history on this device, and does not require an account.</p><ul class="capability-list"><li>Scientific expressions</li><li>Textbook-style formulas</li><li>Unit conversions</li><li>Finance estimates</li><li>Geometry & statistics</li><li>Science & engineering</li><li>Everyday planning</li><li>Light and dark themes</li></ul>`;
    } else if (type === 'changelog') {
      dom.infoEyebrow.textContent = `Version ${VERSION}`;
      dom.infoTitle.textContent = 'Change log';
      dom.infoContent.innerHTML = `<h3>1.0.7</h3><ul class="capability-list"><li>Triangle visuals now show solved side lengths as well as angles</li><li>Dimension-calibrated cylinders and cones with translucent hidden base edges</li><li>Equal X/Y graph units and shared resolution-label spacing</li><li>Raised, separated folder actions with a corner-mounted red delete control</li><li>Clickable hierarchical destination tree for moving favorite folders</li></ul><h3>1.0.6</h3><ul class="capability-list"><li>Wide four-across category matrix with fluid expanding tool panels</li><li>Double-size logo with updated version placement</li><li>Correct prism/reference-cube faces and clean cylinder/cone seams</li><li>Rebuilt readable triangle annotations without canvas overlap</li><li>Larger graph with user-defined resolution, thin grid lines, and emphasized zero axes</li><li>Back navigation that returns to the toolbox or originating folder</li><li>Unobstructed folder content with spaced actions and a red close control</li></ul><h3>1.0.5</h3><ul class="capability-list"><li>Half-width toolbox and a shorter scientific calculator viewport</li><li>Searchable, nameable favorite folders with nesting, rename, move, and delete controls</li><li>Rearranged signed keypad with 000 plus mortgage lifetime loan cost</li><li>Typed reference dimensions and corrected true-scale geometry and element visuals</li><li>Labeled triangle sides/angles and a crisp pannable/zoomable quadratic graph</li><li>Reliable inline rocket branding and corrected rectangle badge</li></ul><h3>1.0.4</h3><ul class="capability-list"><li>Larger logo, quieter version badge, corrected divide / backspace placement, and denser toolbox rows</li><li>Narrower date inputs and an automatic triangle solver that classifies each valid result</li><li>True-proportion geometry drawings with an adjustable, equally scaled red reference square or cube</li><li>Lighter graph labels, 0.2-unit quadratic dots, zoom controls, a one-line equation, and a marked apex</li><li>Rocket branding for Science &amp; engineering plus revised rectangle and prism badges</li><li>Direct Frankfurter v2 exchange-rate requests with a v1 fallback and retained cached-rate support</li></ul><h3>1.0.3</h3><ul class="capability-list"><li>Compact title area, stable toolbox icon, and external version badge</li><li>Shorter formula display with revised keypad positions and double-tap zoom protection</li><li>Unlimited favorites with centered icons and compact Copy / Save actions</li><li>Grouped signed-number inputs and 12-hour AM/PM work-time entry</li><li>Live reference-rate currency converter plus added time and speed units</li><li>Correct imperial BMI height and an original adult reference chart</li><li>Live 2D/3D geometry, unified triangle solver, polygon names, and quadratic graph</li><li>Textured element-shape visuals and revised volume, mass, weight, and density output</li><li>Paint buffer, calendar-day subtraction, and IEC binary results</li></ul><h3>1.0.2</h3><p>Expanded scientific keypad, blank tool forms, manual history, mortgage escrow, unit-system toggles, and the 118-element density calculator.</p><h3>1.0.0</h3><p>Initial calculator, conversion catalog, themes, and offline web app.</p>`;
    } else {
      dom.infoEyebrow.textContent = 'Quick guide'; dom.infoTitle.textContent = 'Keyboard shortcuts';
      dom.infoContent.innerHTML = `<div class="shortcut-grid"><div><span>Calculate and save to history</span><kbd>Enter</kbd></div><div><span>Clear the expression</span><kbd>Esc</kbd></div><div><span>Delete one character</span><kbd>Backspace</kbd></div><div><span>Open tool search while drawer is open</span><kbd>/</kbd></div><div><span>Use scientific functions</span><kbd>sin(45)</kbd></div><div><span>Use the last answer</span><kbd>Ans</kbd></div></div>`;
    }
    if (type === 'changelog') dom.infoContent.insertAdjacentHTML('afterbegin', `<h3>1.0.11</h3><ul class="capability-list"><li>Added 10 electrical, photometric, thermal, fluid, rotational, and concentration converters</li><li>Added nine Economics tools for debt payoff, refinancing, vehicle comparison, rates, investing, retirement, and inflation</li><li>Added nine Health &amp; fitness tools for body metrics, nutrition, hydration, strength, MET calories, VO₂ max, splits, and sleep</li><li>Expanded Mortgage with extra-payment payoff analysis and BMI with a height-specific healthy-weight range</li><li>Expanded the searchable toolbox to 130 tools across 12 main categories</li></ul><h3>1.0.10</h3><ul class="capability-list"><li>Added shoe, clothing, ring, paper, fuel-volume, and map/drawing-scale converters</li><li>Added coordinate-format, compass-bearing, and rainfall/snow-water converters</li><li>Added a multi-location, daylight-saving-aware time-zone converter</li><li>Created Time &amp; Dates and moved time units, work time, and date difference into it</li><li>Expanded the toolbox to 102 tools across 12 main categories</li></ul><h3>1.0.9</h3><ul class="capability-list"><li>Organized every main toolbox category into clear subcategories</li><li>Added Academics and Culinary main categories and moved applicable existing tools</li><li>Renamed Finance &amp; money to Economics</li><li>Fixed deleted favorite folders and tools reappearing after the app reloads</li></ul><h3>1.0.8</h3><ul class="capability-list"><li>Top-anchored folder controls with themed create, rename, and delete dialogs</li><li>Save Calculation main keypad action</li><li>Triangle values kept outside the diagram and reference square</li><li>Matched half-ellipse cylinder and cone base curves</li><li>Quadratic apex X and Y result coordinates</li></ul>`);
    dom.infoDialog.showModal();
  }

  function handleAction(action, source) {
    switch (action) {
      case 'home': showCalculatorHome(); break;
      case 'back-from-tool': backFromTool(); break;
      case 'tools': state.drawerOpen ? closeDrawer({ restoreFocus: true }) : openDrawer(); break;
      case 'close-tools': closeDrawer({ restoreFocus: true }); break;
      case 'menu': toggleMenu(); break;
      case 'settings': toggleMenu(false); syncSettingsControls(); dom.settingsDialog.showModal(); break;
      case 'history': openHistory(); break;
      case 'close-history': dom.historyDialog.close(); break;
      case 'clear-history': state.history = []; safeStorageWrite(STORAGE_KEYS.history, state.history); renderHistory(); showToast('History cleared'); break;
      case 'shortcuts': openInfo('shortcuts'); break;
      case 'about': openInfo('about'); break;
      case 'changelog': dom.settingsDialog.close(); openInfo('changelog'); break;
      case 'close-info': dom.infoDialog.close(); break;
      case 'close-folder-move': state.movingFavoriteFolderId = null; dom.folderMoveDialog.close(); break;
      case 'close-folder-editor': closeFavoriteFolderEditor(); break;
      case 'close-folder-delete': closeFavoriteFolderDelete(); break;
      case 'confirm-folder-delete': confirmDeleteFavoriteFolder(); break;
      case 'create-favorite-folder': createFavoriteFolder(); break;
      case 'add-tool-to-folder':
        if (state.activeFavoriteFolderId) openDrawer(state.activeFavoriteFolderId);
        break;
      case 'copy-result':
        if (Number.isFinite(state.currentResult)) copyText(formatNumber(state.currentResult, state.settings)).then((ok) => showToast(ok ? 'Result copied' : 'Could not copy'));
        else showToast('Nothing to copy yet');
        break;
      case 'reset-settings':
        state.settings = { ...DEFAULT_SETTINGS }; syncSettingsControls(); saveSettings(); showToast('Settings reset'); break;
      default: break;
    }
  }

  function handleToolAction(action) {
    if (action === 'reset') resetCurrentTool();
    else if (action === 'graph-zoom-in' || action === 'graph-zoom-out' || action === 'graph-zoom-reset') {
      state.graphZoom = action === 'graph-zoom-reset' ? 1.5 : clamp(state.graphZoom + (action === 'graph-zoom-in' ? .25 : -.25), 1, 4);
      if (action === 'graph-zoom-reset') { state.graphPanX = .5; state.graphPanY = .5; }
      refreshCurrentToolResult();
    }
    else if (action === 'swap-units' && state.currentTool?.kind === 'unit') {
      const from = document.querySelector('[data-unit-from]'); const to = document.querySelector('[data-unit-to]'); const input = document.querySelector('[data-unit-value]'); const output = document.querySelector('[data-unit-output]');
      [from.value, to.value] = [to.value, from.value];
      if (output.value) input.value = output.value;
      refreshCurrentToolResult();
    } else if (action === 'toggle-bmi-chart') {
      const chart = document.getElementById('bmiChart'); const button = document.querySelector('[data-tool-action="toggle-bmi-chart"]');
      if (chart && button) { chart.hidden = !chart.hidden; button.setAttribute('aria-expanded', String(!chart.hidden)); button.textContent = chart.hidden ? 'View full adult BMI chart' : 'Hide adult BMI chart'; }
    } else if (action === 'copy-tool') {
      const value = document.getElementById('toolResult')?.dataset.copyValue;
      copyText(value).then((ok) => showToast(ok ? 'Result copied' : 'Nothing to copy yet'));
    } else if (action === 'save-tool') saveCurrentToolToHistory();
  }

  function cacheDom() {
    dom = {
      expressionInput: document.getElementById('expressionInput'), formulaDisplay: document.getElementById('formulaDisplay'), resultDisplay: document.getElementById('resultDisplay'), displayError: document.getElementById('displayError'),
      scientificKeys: document.getElementById('scientificKeys'), appMenu: document.getElementById('appMenu'), menuButton: document.getElementById('menuButton'),
      calculatorView: document.getElementById('calculatorView'), toolView: document.getElementById('toolView'), toolWorkspace: document.getElementById('toolWorkspace'), toolPageCategory: document.getElementById('toolPageCategory'), toolPageTitle: document.getElementById('toolPageTitle'), toolPageDescription: document.getElementById('toolPageDescription'), toolPageIcon: document.getElementById('toolPageIcon'), toolBackButton: document.getElementById('toolBackButton'), toolBackLabel: document.getElementById('toolBackLabel'),
      quickGrid: document.getElementById('quickGrid'), folderBreadcrumbs: document.getElementById('folderBreadcrumbs'), favoriteSearch: document.getElementById('favoriteSearch'), addFavoriteToolButton: document.getElementById('addFavoriteToolButton'), toolDrawer: document.getElementById('toolDrawer'), drawerBackdrop: document.getElementById('drawerBackdrop'), toolSearch: document.getElementById('toolSearch'), toolCategories: document.getElementById('toolCategories'), drawerTitle: document.getElementById('drawerTitle'), drawerDescription: document.getElementById('drawerDescription'),
      settingsDialog: document.getElementById('settingsDialog'), precisionSetting: document.getElementById('precisionSetting'), separatorSetting: document.getElementById('separatorSetting'), hapticSetting: document.getElementById('hapticSetting'),
      historyDialog: document.getElementById('historyDialog'), historyList: document.getElementById('historyList'), infoDialog: document.getElementById('infoDialog'), infoEyebrow: document.getElementById('infoEyebrow'), infoTitle: document.getElementById('infoTitle'), infoContent: document.getElementById('infoContent'),
      folderMoveDialog: document.getElementById('folderMoveDialog'), folderMoveTitle: document.getElementById('folderMoveTitle'), folderMoveTree: document.getElementById('folderMoveTree'),
      folderEditorDialog: document.getElementById('folderEditorDialog'), folderEditorForm: document.getElementById('folderEditorForm'), folderEditorEyebrow: document.getElementById('folderEditorEyebrow'), folderEditorTitle: document.getElementById('folderEditorTitle'), folderEditorSave: document.getElementById('folderEditorSave'), folderNameInput: document.getElementById('folderNameInput'), folderNameError: document.getElementById('folderNameError'),
      folderDeleteDialog: document.getElementById('folderDeleteDialog'), folderDeleteTitle: document.getElementById('folderDeleteTitle'), folderDeleteMessage: document.getElementById('folderDeleteMessage'), toast: document.getElementById('toast'),
    };
  }

  function bindGlobalEvents() {
    document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });
    document.addEventListener('pointerdown', (event) => {
      const dynamicNumeric = event.target.closest?.('[data-graph-resolution]');
      if (dynamicNumeric && root.matchMedia?.('(pointer: coarse)').matches) {
        event.preventDefault(); dynamicNumeric.focus({ preventScroll: true }); showNumericPad(dynamicNumeric); return;
      }
      const viewport = event.target.closest?.('[data-graph-viewport]');
      if (!viewport || event.pointerType !== 'mouse' || event.button !== 0) return;
      state.graphDrag = { viewport, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, pointerId: event.pointerId };
      viewport.classList.add('is-panning');
      viewport.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    document.addEventListener('pointermove', (event) => {
      const drag = state.graphDrag; if (!drag || drag.pointerId !== event.pointerId) return;
      drag.viewport.scrollLeft = drag.left - (event.clientX - drag.x);
      drag.viewport.scrollTop = drag.top - (event.clientY - drag.y);
    });
    const endGraphDrag = (event) => {
      const drag = state.graphDrag; if (!drag || (event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
      drag.viewport.classList.remove('is-panning'); state.graphDrag = null;
    };
    document.addEventListener('pointerup', endGraphDrag);
    document.addEventListener('pointercancel', endGraphDrag);
    document.addEventListener('scroll', (event) => {
      const viewport = event.target.closest?.('[data-graph-viewport]'); if (!viewport) return;
      const maxX = viewport.scrollWidth - viewport.clientWidth; const maxY = viewport.scrollHeight - viewport.clientHeight;
      state.graphPanX = maxX > 0 ? viewport.scrollLeft / maxX : .5;
      state.graphPanY = maxY > 0 ? viewport.scrollTop / maxY : .5;
    }, true);
    document.addEventListener('click', (event) => {
      if (!event.target.closest('#numericPad') && !event.target.closest('[data-numeric], [data-numeric-list], [data-time-input]')) hideNumericPad();
      const keyButton = event.target.closest('[data-key]');
      if (keyButton) { handleCalculatorKey(keyButton.dataset.key); return; }
      const dynamicScienceButton = event.target.closest('[data-direct]');
      if (dynamicScienceButton) { insertAtCursor(state.second ? dynamicScienceButton.dataset.inverse : dynamicScienceButton.dataset.direct); return; }
      const scienceButton = event.target.closest('[data-science-action]');
      if (scienceButton) { handleScienceAction(scienceButton.dataset.scienceAction); return; }
      const modeButton = event.target.closest('[data-mode]');
      if (modeButton) { setMode(modeButton.dataset.mode); return; }
      const toolButton = event.target.closest('[data-tool-id]');
      if (toolButton) {
        if (state.folderPickerTargetId !== null) {
          const folderId = state.folderPickerTargetId;
          const added = addToolToFavoriteFolder(folderId, toolButton.dataset.toolId);
          closeDrawer();
          showToast(added ? 'Tool added to folder' : 'Tool is already in that folder');
        } else {
          const origin = toolButton.closest('#toolDrawer')
            ? { type: 'toolbox' }
            : toolButton.closest('#quickGrid')
              ? { type: 'folder', folderId: state.activeFavoriteFolderId }
              : { type: 'calculator' };
          openTool(toolButton.dataset.toolId, undefined, origin);
        }
        return;
      }
      const folderOpen = event.target.closest('[data-folder-open]');
      if (folderOpen) {
        state.activeFavoriteFolderId = folderOpen.dataset.folderOpen;
        dom.favoriteSearch.value = '';
        renderQuickTools();
        return;
      }
      const folderNav = event.target.closest('[data-folder-nav]');
      if (folderNav) {
        state.activeFavoriteFolderId = folderNav.dataset.folderNav === 'root' ? null : folderNav.dataset.folderNav;
        dom.favoriteSearch.value = '';
        renderQuickTools();
        return;
      }
      const folderAction = event.target.closest('[data-folder-action]');
      if (folderAction) {
        const id = folderAction.dataset.folderId;
        if (folderAction.dataset.folderAction === 'rename') renameFavoriteFolder(id);
        else if (folderAction.dataset.folderAction === 'move') moveFavoriteFolder(id);
        else if (folderAction.dataset.folderAction === 'delete') deleteFavoriteFolder(id);
        return;
      }
      const folderMoveTarget = event.target.closest('[data-folder-move-target]');
      if (folderMoveTarget) {
        moveFavoriteFolderTo(folderMoveTarget.dataset.folderMoveTarget);
        return;
      }
      const folderToolRemove = event.target.closest('[data-folder-tool-remove]');
      if (folderToolRemove) {
        removeToolFromFavoriteFolder(folderToolRemove.dataset.folderId, folderToolRemove.dataset.folderToolRemove);
        return;
      }
      const categoryButton = event.target.closest('[data-category-id]');
      if (categoryButton) {
        const id = categoryButton.dataset.categoryId;
        const wasOpen = state.openCategories.has(id);
        state.openCategories.clear();
        if (!wasOpen) state.openCategories.add(id);
        renderToolCategories(dom.toolSearch.value); return;
      }
      const historyButton = event.target.closest('[data-history-index]');
      if (historyButton) {
        const item = state.history[Number(historyButton.dataset.historyIndex)];
        if (item) {
          dom.historyDialog.close();
          if (item.kind === 'tool' && item.toolId) openTool(item.toolId, item.values, { type: 'calculator' });
          else { showCalculatorHome(); setExpression(item.expression); }
        }
        return;
      }
      const toolActionButton = event.target.closest('[data-tool-action]');
      if (toolActionButton) { handleToolAction(toolActionButton.dataset.toolAction); return; }
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) { handleAction(actionButton.dataset.action, actionButton); return; }
      if (!event.target.closest('.menu-anchor') && !dom.appMenu.hidden) toggleMenu(false);
    });

    dom.expressionInput.addEventListener('input', updateExpression);
    dom.toolSearch.addEventListener('input', () => renderToolCategories(dom.toolSearch.value));
    dom.favoriteSearch.addEventListener('input', renderQuickTools);
    dom.folderEditorForm.addEventListener('submit', (event) => { event.preventDefault(); submitFavoriteFolderEditor(); });
    dom.folderNameInput.addEventListener('input', () => { dom.folderNameError.hidden = Boolean(dom.folderNameInput.value.trim()); });
    document.addEventListener('input', (event) => {
      const graphResolution = event.target.closest?.('[data-graph-resolution]');
      if (graphResolution && state.currentTool?.id === 'calc-quadratic' && state.currentToolResult?.meta) {
        const parsed = Number(String(graphResolution.value).replaceAll(',', '').trim());
        if (Number.isFinite(parsed) && parsed > 0) {
          state.graphResolution = normalizedGraphResolution(parsed);
          const host = graphResolution.closest('.quadratic-visual')?.querySelector('[data-graph-svg-host]');
          if (host) host.innerHTML = quadraticGraphSvg(state.currentToolResult.meta, state.graphResolution);
        }
        return;
      }
      const input = event.target.closest?.('[data-reference-side]');
      if (!input || !state.currentTool || !state.currentToolResult) return;
      const toolId = input.dataset.referenceSide;
      if (state.currentTool.id !== toolId) return;
      const parsed = Number(String(input.value).replaceAll(',', '').trim());
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      const side = clamp(parsed, .000001, 1e9); state.referenceSides[toolId] = side;
      const label = referenceSideLabel(side); const frame = input.closest('[data-geometry-visual]'); const canvas = frame?.querySelector('.geometry-canvas');
      if (canvas) canvas.innerHTML = toolId === 'calc-element-shape' ? elementVisualSvg(state.currentTool, state.currentToolResult, side) : geometryVisualSvg(state.currentTool, state.currentToolResult, side);
      const is3d = toolId === 'calc-element-shape' || ['calc-sphere', 'calc-cylinder', 'calc-cone', 'calc-rectangular-prism'].includes(toolId);
      const referenceLabel = frame?.querySelector('.visual-reference-label');
      if (referenceLabel) referenceLabel.textContent = `Red ${is3d ? `cube = ${label}×${label}×${label}` : `square = ${label}×${label}`} unit${side === 1 ? '' : 's'}`;
    });
    document.addEventListener('keydown', (event) => {
      const active = document.activeElement;
      const isFormControl = active && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName);
      if (event.key === 'Escape' && state.drawerOpen) { event.preventDefault(); closeDrawer({ restoreFocus: true }); return; }
      if (event.key === 'Enter' && active === dom.expressionInput) { event.preventDefault(); updateExpression({ commit: true }); return; }
      if (event.key === 'Escape' && active === dom.expressionInput && !document.querySelector('dialog[open]')) { event.preventDefault(); setExpression(''); return; }
      if (event.key === '/' && state.drawerOpen && !isFormControl) { event.preventDefault(); dom.toolSearch.focus(); }
      if (!isFormControl && !event.metaKey && !event.ctrlKey && !event.altKey && /^[0-9.+\-*/^()%!]$/.test(event.key)) {
        event.preventDefault(); insertAtCursor(event.key);
      }
    });

    document.querySelectorAll('input[name="theme"]').forEach((radio) => radio.addEventListener('change', () => { if (radio.checked) { state.settings.theme = radio.value; saveSettings(); } }));
    dom.precisionSetting.addEventListener('change', () => { state.settings.precision = Number(dom.precisionSetting.value); saveSettings(); });
    dom.separatorSetting.addEventListener('change', () => { state.settings.separators = dom.separatorSetting.checked; saveSettings(); });
    dom.hapticSetting.addEventListener('change', () => { state.settings.haptics = dom.hapticSetting.checked; saveSettings(); });

    themeMedia?.addEventListener?.('change', () => { if (state.settings.theme === 'system') applyTheme(); });
    ['settingsDialog', 'historyDialog', 'infoDialog', 'folderMoveDialog', 'folderEditorDialog', 'folderDeleteDialog'].forEach((key) => dom[key].addEventListener('click', (event) => {
      const rect = dom[key].getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dom[key].close();
    }));
    dom.folderMoveDialog.addEventListener('close', () => { state.movingFavoriteFolderId = null; });
    dom.folderEditorDialog.addEventListener('close', () => { state.folderEditorMode = null; state.folderEditorTargetId = null; dom.folderNameError.hidden = true; });
    dom.folderDeleteDialog.addEventListener('close', () => { state.deletingFavoriteFolderId = null; });
  }

  function initApp() {
    cacheDom();
    themeMedia = root.matchMedia?.('(prefers-color-scheme: dark)') || null;
    applyTheme();
    syncSettingsControls();
    dom.toolSearch.placeholder = `Search ${ALL_TOOLS.length} tools and units`;
    renderQuickTools();
    renderToolCategories('');
    bindGlobalEvents();
    setMode('basic');
    updateExpression();
    if ('serviceWorker' in root.navigator && /^https?:$/.test(root.location?.protocol || '')) {
      root.navigator.serviceWorker.register('./service-worker.js').catch(() => {
        // The calculator still works normally when offline installation is unavailable.
      });
    }
  }

  const publicApi = Object.freeze({
    VERSION,
    parseExpression,
    calculateExpression,
    evaluateAst,
    astToMathML,
    astToLatex,
    convertUnit,
    UNIT_TOOLS,
    TOOL_CATEGORIES,
    ALL_TOOLS,
    formatNumber,
    decimalToFraction,
    gcd,
    nChooseR,
    toolBadge,
    fetchCurrencyQuote,
    circularSolidProjection,
    geometryVisualSvg,
    elementVisualSvg,
    quadraticGraphSvg,
    normalizeFavoriteFolders,
  });

  root.EverythingCalculator = publicApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = publicApi;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp, { once: true });
    else initApp();
  }
})(typeof window !== 'undefined' ? window : globalThis);
