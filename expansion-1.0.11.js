(function (root, factory) {
  'use strict';
  const expansion = factory();
  if (typeof module === 'object' && module.exports) module.exports = expansion;
  root.EverythingExpansion1011 = expansion;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const number = (value, label) => {
    const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replaceAll(',', '').trim());
    if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid number.`);
    return parsed;
  };
  const positive = (value, label, zero) => {
    const parsed = number(value, label);
    if (zero ? parsed < 0 : parsed <= 0) throw new Error(`${label} must be ${zero ? 'zero or greater' : 'greater than zero'}.`);
    return parsed;
  };
  const field = (id, label, defaultValue, unit, options) => ({
    id, label, type: 'number', default: defaultValue, unit: unit || '', step: 'any', ...(options || {}),
  });
  const select = (id, label, defaultValue, options, config) => ({
    id, label, type: 'select', default: defaultValue, options, segmented: Boolean(config?.segmented), when: config?.when || null,
  });
  const text = (id, label, defaultValue, options) => ({
    id, label, type: options?.time12 ? 'time12' : 'text', default: defaultValue, placeholder: options?.placeholder || '',
    help: options?.help || '', numericList: Boolean(options?.numericList), periodDefault: options?.periodDefault || 'am', when: options?.when || null,
  });
  const date = (id, label, defaultValue) => ({ id, label, type: 'date', default: defaultValue });
  const tool = (id, title, description, icon, fields, calculate, options) => ({
    id: `calc-${id}`, kind: 'calculator', title, shortTitle: options?.shortTitle || title.replace(' calculator', ''),
    description, icon, fields, calculate, note: options?.note || '', asyncType: '',
  });
  const result = (primary, unit, expression, details, note, currency) => ({
    primary, unit: unit || '', expression: expression || '', details: details || [], note: note || '', currency: Boolean(currency), meta: null,
  });
  const unitItem = (name, symbol, factor, extra) => ({ name, symbol, factor, offset: 0, ...(extra || {}) });
  const unitTool = (id, title, description, icon, units, from, to, note, customConvert, customExpression) => ({
    id: `unit-${id}`, kind: 'unit', title: `${title} converter`, shortTitle: title, description, icon, units,
    defaultFrom: from ?? 0, defaultTo: to ?? 1, note: note || '', customConvert, customExpression,
  });
  const option = (value, label) => ({ value, label });
  const compact = (value) => Number(value).toPrecision(10).replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
  const list = (value, label) => {
    const parsed = String(value || '').split(/[\s,;]+/).filter(Boolean).map(Number);
    if (!parsed.length || parsed.some((item) => !Number.isFinite(item))) throw new Error(`${label} must contain valid numbers separated by commas.`);
    return parsed;
  };
  const money = (label, value) => ({ label, value, prefix: '$' });
  const monthsText = (months) => `${Math.floor(months / 12)} yr ${months % 12} mo`;
  const payment = (principal, annualRate, months) => {
    const rate = annualRate / 12;
    if (rate === 0) return principal / months;
    const growth = Math.pow(1 + rate, months);
    return principal * rate * growth / (growth - 1);
  };
  const addMonths = (isoDate, months) => {
    const parsed = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) throw new Error('Start date must be valid.');
    parsed.setMonth(parsed.getMonth() + months);
    return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const clockMinutes = (input, period, label) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(input || '').trim());
    if (!match) throw new Error(`${label} must use 12-hour time such as 08:30.`);
    const hour = Number(match[1]); const minute = Number(match[2]);
    if (hour < 1 || hour > 12 || minute > 59) throw new Error(`${label} must be a valid 12-hour time.`);
    return (hour % 12) * 60 + minute + (period === 'pm' ? 720 : 0);
  };
  const clockText = (minutes) => {
    const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const hour24 = Math.floor(wrapped / 60); const minute = wrapped % 60;
    return `${hour24 % 12 || 12}:${String(minute).padStart(2, '0')} ${hour24 >= 12 ? 'PM' : 'AM'}`;
  };
  const durationText = (seconds) => {
    const rounded = Math.round(seconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const remainder = rounded % 60;
    return hours > 0
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  };

  const conductivityUnits = [
    unitItem('Siemens per meter', 'S/m', 1, { family: 'conductivity' }),
    unitItem('Millisiemens per meter', 'mS/m', 1e-3, { family: 'conductivity' }),
    unitItem('Microsiemens per centimeter', 'µS/cm', 1e-4, { family: 'conductivity' }),
    unitItem('Millisiemens per centimeter', 'mS/cm', 0.1, { family: 'conductivity' }),
    unitItem('Ohm-meter', 'Ω·m', 1, { family: 'resistivity' }),
    unitItem('Ohm-centimeter', 'Ω·cm', 0.01, { family: 'resistivity' }),
    unitItem('Milliohm-centimeter', 'mΩ·cm', 1e-5, { family: 'resistivity' }),
    unitItem('Microohm-centimeter', 'µΩ·cm', 1e-8, { family: 'resistivity' }),
  ];

  const scienceUnitTools = [
    unitTool('inductance', 'Inductance', 'Convert henries and common electronic-component prefixes.', 'coil', [
      unitItem('Henry', 'H', 1), unitItem('Millihenry', 'mH', 1e-3), unitItem('Microhenry', 'µH', 1e-6), unitItem('Nanohenry', 'nH', 1e-9), unitItem('Picohenry', 'pH', 1e-12),
    ], 1, 2),
    unitTool('conductivity-resistivity', 'Electrical conductivity & resistivity', 'Convert conductivity or its reciprocal resistivity across SI and engineering units.', 'conductivity', conductivityUnits, 0, 4,
      'Conductivity σ and resistivity ρ are reciprocals: ρ = 1/σ. Zero cannot be converted.',
      (value, from, to) => {
        if (value === 0) throw new Error('Conductivity and resistivity must be nonzero for reciprocal conversion.');
        const conductivity = from.family === 'conductivity' ? value * from.factor : 1 / (value * from.factor);
        return to.family === 'conductivity' ? conductivity / to.factor : (1 / conductivity) / to.factor;
      },
      (value, from, to) => from.family === to.family
        ? `${value}*${from.factor}/${to.factor}`
        : `1/(${value}*${from.factor})/${to.factor}`),
    unitTool('luminous-flux', 'Luminous flux', 'Convert lumen-based photometric flux units.', 'luminous-flux', [
      unitItem('Lumen', 'lm', 1), unitItem('Kilolumen', 'klm', 1000), unitItem('Millilumen', 'mlm', 0.001),
      unitItem('Candela-steradian', 'cd·sr', 1), unitItem('Lux-square meter', 'lx·m²', 1),
    ], 0, 1, 'One lumen is exactly one candela-steradian; one lux-square meter is one lumen.'),
    unitTool('luminance', 'Luminance', 'Convert nits, candela-area units, foot-lamberts, stilbs, and apostilbs.', 'luminance', [
      unitItem('Nit', 'nt', 1), unitItem('Candela per square meter', 'cd/m²', 1), unitItem('Candela per square centimeter', 'cd/cm²', 10000),
      unitItem('Candela per square foot', 'cd/ft²', 10.7639104167097), unitItem('Foot-lambert', 'fL', 3.42625909963539),
      unitItem('Stilb', 'sb', 10000), unitItem('Apostilb', 'asb', 1 / Math.PI),
    ], 0, 4),
    unitTool('thermal-conductivity', 'Thermal conductivity', 'Convert heat-transfer conductivity units.', 'thermal-conductivity', [
      unitItem('Watt per meter-kelvin', 'W/(m·K)', 1), unitItem('Milliwatt per meter-kelvin', 'mW/(m·K)', 0.001),
      unitItem('Watt per centimeter-kelvin', 'W/(cm·K)', 100), unitItem('Watt per meter-degree Celsius', 'W/(m·°C)', 1),
      unitItem('BTU per hour-foot-degree Fahrenheit', 'BTU/(h·ft·°F)', 1.73073466637), unitItem('Kilocalorie per hour-meter-degree Celsius', 'kcal/(h·m·°C)', 1.163),
    ], 0, 4),
    unitTool('specific-heat-capacity', 'Specific heat capacity', 'Convert energy required per unit mass and temperature change.', 'heat-capacity', [
      unitItem('Joule per kilogram-kelvin', 'J/(kg·K)', 1), unitItem('Kilojoule per kilogram-kelvin', 'kJ/(kg·K)', 1000),
      unitItem('Joule per gram-kelvin', 'J/(g·K)', 1000), unitItem('Calorie per gram-degree Celsius', 'cal/(g·°C)', 4184),
      unitItem('Kilocalorie per kilogram-degree Celsius', 'kcal/(kg·°C)', 4184), unitItem('BTU per pound-degree Fahrenheit', 'BTU/(lb·°F)', 4186.8),
    ], 1, 5),
    unitTool('surface-tension', 'Surface tension', 'Convert force per unit length used for liquid interfaces.', 'surface-tension', [
      unitItem('Newton per meter', 'N/m', 1), unitItem('Millinewton per meter', 'mN/m', 0.001), unitItem('Dyne per centimeter', 'dyn/cm', 0.001),
      unitItem('Pound-force per foot', 'lbf/ft', 14.5939029372), unitItem('Pound-force per inch', 'lbf/in', 175.126835246),
    ], 1, 2),
    unitTool('mass-flow-rate', 'Mass flow rate', 'Convert mass transported per unit time.', 'mass-flow', [
      unitItem('Kilogram per second', 'kg/s', 1), unitItem('Kilogram per minute', 'kg/min', 1 / 60), unitItem('Kilogram per hour', 'kg/h', 1 / 3600),
      unitItem('Gram per second', 'g/s', 0.001), unitItem('Pound per second', 'lb/s', 0.45359237), unitItem('Pound per minute', 'lb/min', 0.45359237 / 60),
      unitItem('Pound per hour', 'lb/h', 0.45359237 / 3600), unitItem('Metric tonne per hour', 't/h', 1000 / 3600), unitItem('US ton per hour', 'US ton/h', 907.18474 / 3600),
    ], 0, 6),
    unitTool('angular-velocity', 'Angular velocity', 'Convert rotational speed between revolutions, radians, and degrees.', 'angular-velocity', [
      unitItem('Radian per second', 'rad/s', 1), unitItem('Radian per minute', 'rad/min', 1 / 60), unitItem('Degree per second', '°/s', Math.PI / 180),
      unitItem('Degree per minute', '°/min', Math.PI / 10800), unitItem('Revolution per minute', 'rpm', 2 * Math.PI / 60), unitItem('Revolution per second', 'rev/s', 2 * Math.PI),
    ], 4, 0),
    unitTool('concentration', 'Concentration', 'Convert ratio concentrations and dilute aqueous mass-per-volume equivalents.', 'concentration', [
      unitItem('Percent', '%', 10000), unitItem('Per mille', '‰', 1000), unitItem('Parts per million', 'ppm', 1), unitItem('Parts per billion', 'ppb', 0.001),
      unitItem('Parts per trillion', 'ppt', 0.000001), unitItem('Milligram per liter', 'mg/L', 1), unitItem('Microgram per liter', 'µg/L', 0.001), unitItem('Nanogram per liter', 'ng/L', 0.000001),
    ], 2, 5, 'mg/L≈ppm and µg/L≈ppb only for dilute water-like solutions with density near 1 kg/L. Ratio conversions are exact.'),
  ];

  function simulateCard(balance, annualRate, monthlyPayment) {
    const rate = annualRate / 12;
    if (monthlyPayment <= balance * rate && rate > 0) throw new Error('Monthly payment must exceed the first month’s interest.');
    let remaining = balance; let interest = 0; let months = 0;
    while (remaining > 1e-8 && months < 2400) {
      const charge = remaining * rate; interest += charge; remaining += charge;
      remaining -= Math.min(monthlyPayment, remaining); months += 1;
    }
    if (months >= 2400) throw new Error('The payoff period exceeds 200 years. Increase the payment.');
    return { months, interest, paid: balance + interest };
  }

  function simulateDebtStrategy(balances, aprs, minimums, budget, strategy) {
    const debts = balances.map((balance, index) => ({ balance, apr: aprs[index] / 100, minimum: minimums[index], index }));
    let interest = 0; let months = 0;
    while (debts.some((debt) => debt.balance > 1e-7) && months < 2400) {
      debts.forEach((debt) => { if (debt.balance > 0) { const charge = debt.balance * debt.apr / 12; debt.balance += charge; interest += charge; } });
      let left = budget;
      debts.forEach((debt) => { if (debt.balance > 0) { const paid = Math.min(debt.minimum, debt.balance, left); debt.balance -= paid; left -= paid; } });
      while (left > 1e-8) {
        const active = debts.filter((debt) => debt.balance > 1e-7).sort(strategy === 'snowball'
          ? (a, b) => a.balance - b.balance || b.apr - a.apr
          : (a, b) => b.apr - a.apr || a.balance - b.balance);
        if (!active.length) break;
        const paid = Math.min(left, active[0].balance); active[0].balance -= paid; left -= paid;
      }
      months += 1;
    }
    if (months >= 2400) throw new Error('The selected budget does not pay the debts off within 200 years.');
    return { months, interest };
  }

  const financeTools = [
    tool('credit-card-payoff', 'Credit-card payoff calculator', 'Estimate payoff time and interest with a fixed monthly payment.', 'credit-card', [
      field('balance', 'Current balance', 6500, '$'), field('apr', 'Annual percentage rate', 22.9, '%'),
      field('payment', 'Planned monthly payment', 250, '$'), field('extra', 'Additional monthly payment', 0, '$'),
    ], (v) => {
      const balance = positive(v.balance, 'Current balance'); const apr = positive(v.apr, 'APR', true) / 100;
      const monthly = positive(v.payment, 'Monthly payment') + positive(v.extra, 'Additional payment', true);
      const plan = simulateCard(balance, apr, monthly);
      return result(plan.months, 'months to payoff', `${balance}*(1+${compact(apr)}/12)-${monthly}`, [
        { label: 'Payoff time', value: monthsText(plan.months) }, money('Total interest', plan.interest), money('Total paid', plan.paid), money('Monthly payment', monthly),
      ], 'Assumes no new charges or fees and a constant APR applied monthly.', false);
    }, { note: 'Estimate only. Card issuers may use daily periodic rates, fees, and minimum-payment rules.' }),

    tool('debt-strategy', 'Debt snowball vs avalanche calculator', 'Compare smallest-balance-first and highest-rate-first payoff plans.', 'debt-strategy', [
      text('balances', 'Balances', '2500, 7000, 12000', { numericList: true, help: 'Enter one balance per debt, separated by commas.' }),
      text('aprs', 'APR values', '18.9, 8.5, 5.9', { numericList: true, help: 'Use the same debt order.' }),
      text('minimums', 'Minimum monthly payments', '75, 140, 220', { numericList: true, help: 'Use the same debt order.' }),
      field('budget', 'Total monthly debt budget', 700, '$'),
    ], (v) => {
      const balances = list(v.balances, 'Balances'); const aprs = list(v.aprs, 'APR values'); const minimums = list(v.minimums, 'Minimum payments');
      if (balances.length !== aprs.length || balances.length !== minimums.length) throw new Error('Balances, APRs, and minimum payments must contain the same number of entries.');
      if (balances.some((x) => x <= 0) || aprs.some((x) => x < 0) || minimums.some((x) => x < 0)) throw new Error('Balances must be positive; APRs and minimums cannot be negative.');
      const budget = positive(v.budget, 'Monthly budget');
      if (budget + 1e-9 < minimums.reduce((sum, x) => sum + x, 0)) throw new Error('Monthly budget must cover the listed minimum payments.');
      const snowball = simulateDebtStrategy(balances, aprs, minimums, budget, 'snowball');
      const avalanche = simulateDebtStrategy(balances, aprs, minimums, budget, 'avalanche');
      const winner = avalanche.interest <= snowball.interest ? 'Avalanche' : 'Snowball';
      return result(Math.min(snowball.months, avalanche.months), 'months (faster plan)', 'B(n+1)=B(n)*(1+r/12)-payment', [
        { label: 'Lower-interest strategy', value: winner }, { label: 'Snowball payoff', value: monthsText(snowball.months) }, money('Snowball interest', snowball.interest),
        { label: 'Avalanche payoff', value: monthsText(avalanche.months) }, money('Avalanche interest', avalanche.interest), money('Interest difference', Math.abs(snowball.interest - avalanche.interest)),
      ], 'The simulation pays required minimums, then directs the remaining fixed budget to the strategy target. It assumes fixed rates and no new debt.', false);
    }),

    tool('refinance-comparison', 'Refinance comparison calculator', 'Compare payments, lifetime interest, closing costs, and a break-even date.', 'refinance', [
      field('balance', 'Current loan balance', 280000, '$'), field('currentRate', 'Current annual rate', 7, '%'), field('remainingYears', 'Years remaining', 27, 'years'),
      field('newRate', 'New annual rate', 5.75, '%'), field('newYears', 'New loan term', 20, 'years'), field('closingCosts', 'Refinance closing costs', 6000, '$'),
      date('startDate', 'Refinance start date', '2026-07-01'),
    ], (v) => {
      const balance = positive(v.balance, 'Loan balance'); const currentRate = positive(v.currentRate, 'Current rate', true) / 100; const oldMonths = Math.round(positive(v.remainingYears, 'Years remaining') * 12);
      const newRate = positive(v.newRate, 'New rate', true) / 100; const newMonths = Math.round(positive(v.newYears, 'New term') * 12); const costs = positive(v.closingCosts, 'Closing costs', true);
      const oldPayment = payment(balance, currentRate, oldMonths); const newPayment = payment(balance, newRate, newMonths); const savings = oldPayment - newPayment;
      const breakEvenMonths = savings > 0 ? Math.ceil(costs / savings) : null;
      const oldInterest = oldPayment * oldMonths - balance; const newInterest = newPayment * newMonths - balance;
      return result(savings, 'monthly payment change', `${compact(oldPayment)}-${compact(newPayment)}`, [
        money('Current payment', oldPayment), money('New payment', newPayment), money('Monthly savings', savings),
        { label: 'Break-even time', value: breakEvenMonths === null ? 'No payment-savings break-even' : monthsText(breakEvenMonths) },
        { label: 'Break-even date', value: breakEvenMonths === null ? 'Not reached' : addMonths(v.startDate, breakEvenMonths) },
        money('Current remaining interest', oldInterest), money('New lifetime interest + costs', newInterest + costs), money('Lifetime savings after costs', oldInterest - newInterest - costs),
      ], 'Break-even is closing costs divided by monthly payment savings. This does not model taxes, points, prepayment penalties, or the time value of money.', true);
    }),

    tool('auto-loan-lease', 'Auto loan vs lease calculator', 'Compare estimated net ownership cost with total lease cost.', 'car-compare', [
      field('price', 'Vehicle price', 42000, '$'), field('down', 'Loan down payment', 5000, '$'), field('taxRate', 'Purchase tax rate', 7, '%'),
      field('loanApr', 'Loan APR', 6.5, '%'), field('loanMonths', 'Loan term', 60, 'months'), field('resale', 'Expected value at comparison date', 22000, '$'),
      field('leaseMonths', 'Lease term', 36, 'months'), field('leasePayment', 'Monthly lease payment', 525, '$'), field('dueAtSigning', 'Lease due at signing', 3500, '$'),
      field('leaseFees', 'Acquisition / disposition fees', 1200, '$'), field('excessMiles', 'Expected excess miles', 0, 'miles'), field('milePenalty', 'Excess-mile charge', 0.25, '$ / mile'),
    ], (v) => {
      const price = positive(v.price, 'Vehicle price'); const down = positive(v.down, 'Down payment', true); const tax = price * positive(v.taxRate, 'Tax rate', true) / 100;
      const months = Math.round(positive(v.loanMonths, 'Loan term')); const annualRate = positive(v.loanApr, 'Loan APR', true) / 100;
      const principal = price + tax - down; const monthly = payment(principal, annualRate, months);
      const leaseMonths = Math.round(positive(v.leaseMonths, 'Lease term')); const paymentsMade = Math.min(months, leaseMonths); const monthlyRate = annualRate / 12;
      const remainingBalance = paymentsMade >= months ? 0 : monthlyRate === 0
        ? principal * (months - paymentsMade) / months
        : principal * (Math.pow(1 + monthlyRate, months) - Math.pow(1 + monthlyRate, paymentsMade)) / (Math.pow(1 + monthlyRate, months) - 1);
      const resale = positive(v.resale, 'Expected vehicle value', true); const equity = resale - remainingBalance;
      const loanOutlay = down + monthly * paymentsMade; const loanNet = loanOutlay - equity;
      const lease = positive(v.dueAtSigning, 'Due at signing', true) + positive(v.leasePayment, 'Lease payment', true) * leaseMonths + positive(v.leaseFees, 'Lease fees', true) + positive(v.excessMiles, 'Excess miles', true) * positive(v.milePenalty, 'Mileage charge', true);
      const difference = Math.abs(loanNet - lease); const choice = loanNet <= lease ? 'Loan / ownership' : 'Lease';
      return result(difference, 'estimated cost difference', `|${compact(loanNet)}-${compact(lease)}|`, [
        { label: 'Lower estimated cost', value: choice }, { label: 'Comparison horizon', value: leaseMonths, suffix: ' months' }, money('Loan monthly payment', monthly),
        money('Loan payments and down payment', loanOutlay), money('Loan balance at comparison', remainingBalance), money('Estimated vehicle equity', equity),
        money('Loan net cost after equity', loanNet), money('Lease total cost', lease),
      ], 'Both options are compared at the end of the entered lease term. Insurance, maintenance, registration, financing fees, and tax rules vary.', true);
    }),

    tool('apr-apy', 'APR, APY & effective-rate converter', 'Convert nominal APR and effective APY for a chosen compounding frequency.', 'rate-convert', [
      select('entered', 'Entered rate', 'apr', [option('apr', 'Nominal APR'), option('apy', 'Effective APY')], { segmented: true }),
      field('rate', 'Annual rate', 5, '%'), select('compounds', 'Compounding frequency', '12', [option('1', 'Annual'), option('4', 'Quarterly'), option('12', 'Monthly'), option('365', 'Daily')]),
    ], (v) => {
      const entered = positive(v.rate, 'Annual rate', true) / 100; const n = positive(v.compounds, 'Compounding frequency');
      const apr = v.entered === 'apy' ? n * (Math.pow(1 + entered, 1 / n) - 1) : entered;
      const apy = v.entered === 'apy' ? entered : Math.pow(1 + apr / n, n) - 1;
      const continuous = Math.log1p(apy);
      return result(apy * 100, '% effective APY', `(1+${compact(apr)}/${n})^${n}-1`, [
        { label: 'Nominal APR', value: apr * 100, suffix: '%' }, { label: 'Effective APY', value: apy * 100, suffix: '%' },
        { label: 'Periodic rate', value: apr / n * 100, suffix: '%' }, { label: 'Continuous-equivalent rate', value: continuous * 100, suffix: '%' },
      ], 'APR here is a nominal interest rate, not a lender disclosure APR that may also include fees.', false);
    }),

    tool('roi-cagr', 'Investment ROI & CAGR calculator', 'Compare total return with annualized compound growth.', 'roi', [
      field('beginning', 'Beginning value', 10000, '$'), field('ending', 'Ending value', 17500, '$'), field('additional', 'Additional capital added', 2000, '$'),
      field('distributions', 'Cash distributions received', 500, '$'), field('years', 'Holding period', 5, 'years'),
    ], (v) => {
      const beginning = positive(v.beginning, 'Beginning value'); const ending = positive(v.ending, 'Ending value', true); const additional = positive(v.additional, 'Additional capital', true); const distributions = positive(v.distributions, 'Distributions', true); const years = positive(v.years, 'Holding period');
      const invested = beginning + additional; const gain = ending + distributions - invested; const roi = gain / invested; const cagr = Math.pow(ending / beginning, 1 / years) - 1;
      return result(roi * 100, '% total ROI', `(${ending}+${distributions}-${invested})/${invested}`, [
        { label: 'ROI', value: roi * 100, suffix: '%' }, { label: 'CAGR', value: cagr * 100, suffix: '%' }, money('Net gain', gain), { label: 'Ending multiple', value: ending / beginning, suffix: '×' },
      ], 'CAGR uses beginning and ending value only; it does not time-weight intermediate contributions or distributions.', false);
    }),

    tool('dollar-cost-averaging', 'Dollar-cost averaging calculator', 'Project recurring investments with a constant hypothetical return.', 'dca', [
      field('initial', 'Initial investment', 5000, '$'), field('contribution', 'Recurring contribution', 300, '$'),
      select('frequency', 'Contribution frequency', '12', [option('12', 'Monthly'), option('26', 'Biweekly'), option('52', 'Weekly')]),
      field('years', 'Investment period', 10, 'years'), field('return', 'Estimated annual return', 7, '%'),
    ], (v) => {
      const initial = positive(v.initial, 'Initial investment', true); const contribution = positive(v.contribution, 'Contribution', true); const frequency = positive(v.frequency, 'Frequency'); const years = positive(v.years, 'Investment period');
      const annual = number(v.return, 'Annual return') / 100; if (annual <= -1) throw new Error('Annual return must be greater than −100%.');
      const periods = Math.round(frequency * years); const periodRate = Math.pow(1 + annual, 1 / frequency) - 1;
      const future = initial * Math.pow(1 + periodRate, periods) + (periodRate === 0 ? contribution * periods : contribution * (Math.pow(1 + periodRate, periods) - 1) / periodRate);
      const contributed = initial + contribution * periods;
      const formula = periodRate === 0 ? `${initial}+${contribution}*${periods}` : `${initial}*(1+${compact(periodRate)})^${periods}+${contribution}*((1+${compact(periodRate)})^${periods}-1)/${compact(periodRate)}`;
      return result(future, 'projected value', formula, [
        money('Total contributed', contributed), money('Estimated growth', future - contributed), { label: 'Contributions', value: periods }, { label: 'Periodic return', value: periodRate * 100, suffix: '%' },
      ], 'Constant-return projection with contributions at period end; it is not a market forecast.', true);
    }),

    tool('retirement-projection', 'Retirement savings projection calculator', 'Project retirement balance, inflation-adjusted value, and a first-year withdrawal.', 'retirement', [
      field('currentAge', 'Current age', 32, 'years'), field('retirementAge', 'Retirement age', 67, 'years'), field('currentSavings', 'Current savings', 45000, '$'),
      field('monthly', 'Monthly contribution', 750, '$'), field('return', 'Estimated annual return', 7, '%'), field('inflation', 'Estimated inflation', 2.5, '%'), field('withdrawal', 'First-year withdrawal rate', 4, '%'),
    ], (v) => {
      const age = positive(v.currentAge, 'Current age'); const retirement = positive(v.retirementAge, 'Retirement age'); if (retirement <= age) throw new Error('Retirement age must be greater than current age.');
      const current = positive(v.currentSavings, 'Current savings', true); const monthly = positive(v.monthly, 'Monthly contribution', true); const annual = number(v.return, 'Annual return') / 100; if (annual <= -1) throw new Error('Annual return must be greater than −100%.');
      const inflation = number(v.inflation, 'Inflation') / 100; if (inflation <= -1) throw new Error('Inflation must be greater than −100%.'); const years = retirement - age; const months = Math.round(years * 12); const rate = Math.pow(1 + annual, 1 / 12) - 1;
      const future = current * Math.pow(1 + rate, months) + (rate === 0 ? monthly * months : monthly * (Math.pow(1 + rate, months) - 1) / rate);
      const contributed = current + monthly * months; const real = future / Math.pow(1 + inflation, years); const withdrawal = future * positive(v.withdrawal, 'Withdrawal rate', true) / 100;
      const formula = rate === 0 ? `${current}+${monthly}*${months}` : `${current}*(1+${compact(rate)})^${months}+${monthly}*((1+${compact(rate)})^${months}-1)/${compact(rate)}`;
      return result(future, 'projected at retirement', formula, [
        money('Total contributed', contributed), money('Estimated growth', future - contributed), money('Value in today’s dollars', real), money('First-year withdrawal', withdrawal), { label: 'Years invested', value: years },
      ], 'Constant-return, constant-inflation estimate. It excludes taxes, fees, account rules, sequence-of-returns risk, and changing contributions.', true);
    }),

    tool('inflation-purchasing-power', 'Inflation & purchasing-power calculator', 'Estimate a future price and the purchasing power of today’s money.', 'inflation', [
      field('amount', 'Current amount', 10000, '$'), field('inflation', 'Annual inflation rate', 3, '%'), field('years', 'Years', 10, 'years'),
    ], (v) => {
      const amount = positive(v.amount, 'Amount', true); const rate = number(v.inflation, 'Inflation rate') / 100; if (rate <= -1) throw new Error('Inflation must be greater than −100%.'); const years = positive(v.years, 'Years', true);
      const factor = Math.pow(1 + rate, years); const futureCost = amount * factor; const purchasingPower = amount / factor;
      return result(futureCost, 'future equivalent cost', `${amount}(1+${rate})^${years}`, [
        money('Future equivalent cost', futureCost), money('Future purchasing power of current amount', purchasingPower), { label: 'Cumulative price change', value: (factor - 1) * 100, suffix: '%' }, { label: 'Inflation factor', value: factor, suffix: '×' },
      ], 'Uses a constant annual inflation rate; actual inflation differs by year, location, and spending category.', true);
    }),
  ];

  const healthTools = [
    tool('body-fat', 'Body-fat percentage estimator', 'Compare U.S. Navy circumference and BMI-age estimates.', 'body-fat', [
      select('sex', 'Equation sex', 'male', [option('male', 'Male'), option('female', 'Female')], { segmented: true }),
      select('system', 'Measurement system', 'metric', [option('metric', 'Metric'), option('imperial', 'US / Imperial')], { segmented: true }),
      field('age', 'Age', 35, 'years'), field('weight', 'Weight', 78, 'kg or lb'), field('height', 'Height', 178, 'cm or in'),
      field('waist', 'Waist circumference', 88, 'cm or in'), field('neck', 'Neck circumference', 39, 'cm or in'),
      { ...field('hip', 'Hip circumference', 98, 'cm or in'), when: { field: 'sex', values: ['female'] } },
    ], (v) => {
      const metric = v.system !== 'imperial'; const weightKg = positive(v.weight, 'Weight') * (metric ? 1 : 0.45359237); const heightIn = positive(v.height, 'Height') * (metric ? 1 / 2.54 : 1); const heightM = heightIn * 0.0254;
      const waist = positive(v.waist, 'Waist') * (metric ? 1 / 2.54 : 1); const neck = positive(v.neck, 'Neck') * (metric ? 1 / 2.54 : 1); const age = positive(v.age, 'Age');
      let navy; if (v.sex === 'female') { const hip = positive(v.hip, 'Hip') * (metric ? 1 / 2.54 : 1); if (waist + hip <= neck) throw new Error('Waist plus hip must be greater than neck circumference.'); navy = 163.205 * Math.log10(waist + hip - neck) - 97.684 * Math.log10(heightIn) - 78.387; }
      else { if (waist <= neck) throw new Error('Waist must be greater than neck circumference.'); navy = 86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(heightIn) + 36.76; }
      const bmi = weightKg / (heightM * heightM); const bmiEstimate = 1.2 * bmi + 0.23 * age - 10.8 * (v.sex === 'male' ? 1 : 0) - 5.4; const average = (navy + bmiEstimate) / 2;
      return result(average, '% estimated body fat', `(${compact(navy)}+${compact(bmiEstimate)})/2`, [
        { label: 'U.S. Navy estimate', value: navy, suffix: '%' }, { label: 'BMI-age estimate', value: bmiEstimate, suffix: '%' }, { label: 'Difference between methods', value: Math.abs(navy - bmiEstimate), suffix: ' percentage points' }, { label: 'Calculated BMI', value: bmi },
      ], 'These are population equations, not a direct body-composition measurement. Circumference technique and individual physiology can materially change the estimate.', false);
    }, { note: 'Informational estimate only. Do not use it to diagnose health or make treatment decisions.' }),

    tool('waist-ratios', 'Waist ratio calculator', 'Calculate waist-to-height and waist-to-hip ratios.', 'waist-ratio', [
      select('system', 'Measurement system', 'metric', [option('metric', 'Metric'), option('imperial', 'US / Imperial')], { segmented: true }),
      field('waist', 'Waist circumference', 85, 'cm or in'), field('hip', 'Hip circumference', 100, 'cm or in'), field('height', 'Height', 175, 'cm or in'),
    ], (v) => {
      const waist = positive(v.waist, 'Waist'); const hip = positive(v.hip, 'Hip'); const height = positive(v.height, 'Height'); const whtr = waist / height; const whr = waist / hip;
      return result(whtr, 'waist-to-height ratio', `${waist}/${height}`, [
        { label: 'Waist-to-height ratio', value: whtr }, { label: 'Waist-to-hip ratio', value: whr }, { label: 'Waist as share of height', value: whtr * 100, suffix: '%' },
      ], 'Ratios are screening measurements, not diagnoses. Measurement location and clinical interpretation matter.', false);
    }),

    tool('macronutrient-targets', 'Macronutrient target calculator', 'Turn a calorie target and percentage split into daily grams.', 'macros', [
      field('calories', 'Daily calorie target', 2200, 'kcal'), field('protein', 'Protein share', 30, '%'), field('carbs', 'Carbohydrate share', 45, '%'), field('fat', 'Fat share', 25, '%'),
    ], (v) => {
      const calories = positive(v.calories, 'Calories'); const protein = positive(v.protein, 'Protein share', true); const carbs = positive(v.carbs, 'Carbohydrate share', true); const fat = positive(v.fat, 'Fat share', true); const total = protein + carbs + fat;
      if (Math.abs(total - 100) > 0.01) throw new Error('Protein, carbohydrate, and fat percentages must total 100%.');
      const proteinGrams = calories * protein / 100 / 4; const carbGrams = calories * carbs / 100 / 4; const fatGrams = calories * fat / 100 / 9;
      return result(proteinGrams, 'g protein / day', `${calories}*${protein / 100}/4`, [
        { label: 'Protein', value: proteinGrams, suffix: ' g/day' }, { label: 'Carbohydrate', value: carbGrams, suffix: ' g/day' }, { label: 'Fat', value: fatGrams, suffix: ' g/day' }, { label: 'Percentage total', value: total, suffix: '%' },
      ], 'Uses 4 kcal/g for protein and carbohydrate and 9 kcal/g for fat. Individual needs can differ substantially.', false);
    }),

    tool('hydration', 'Daily hydration estimate calculator', 'Estimate fluid volume from body mass, activity, and climate.', 'hydration', [
      select('system', 'Measurement system', 'metric', [option('metric', 'Metric'), option('imperial', 'US / Imperial')], { segmented: true }),
      field('weight', 'Body weight', 72, 'kg or lb'), field('activity', 'Exercise duration', 45, 'minutes'),
      select('climate', 'Climate adjustment', 'temperate', [option('temperate', 'Temperate'), option('warm', 'Warm / humid'), option('hot', 'Very hot / high altitude')]),
    ], (v) => {
      const kg = positive(v.weight, 'Weight') * (v.system === 'imperial' ? 0.45359237 : 1); const activity = positive(v.activity, 'Activity duration', true); const climate = v.climate === 'hot' ? 1000 : v.climate === 'warm' ? 500 : 0;
      const ml = kg * 35 + activity / 30 * 350 + climate; const liters = ml / 1000;
      return result(liters, 'L/day estimated fluids', `${compact(kg)}*35+${activity}/30*350+${climate}`, [
        { label: 'Liters', value: liters, suffix: ' L/day' }, { label: 'US fluid ounces', value: ml / 29.5735295625, suffix: ' fl oz/day' }, { label: 'US cups', value: ml / 236.5882365, suffix: ' cups/day' }, { label: 'Activity allowance', value: activity / 30 * 350, suffix: ' mL' },
      ], 'A general planning heuristic, not a medical prescription. Food moisture is not separately modeled; illness, pregnancy, medications, kidney/heart conditions, and extreme heat require individualized guidance.', false);
    }),

    tool('one-rep-max', 'One-repetition maximum calculator', 'Estimate 1RM using Epley, Brzycki, and Lombardi equations.', 'one-rep-max', [
      select('unit', 'Weight unit', 'lb', [option('lb', 'Pounds'), option('kg', 'Kilograms')], { segmented: true }), field('weight', 'Weight lifted', 185, 'lb or kg'), field('reps', 'Completed repetitions', 5, 'reps'),
    ], (v) => {
      const weight = positive(v.weight, 'Weight'); const reps = Math.round(positive(v.reps, 'Repetitions')); if (reps > 12) throw new Error('Use 1–12 repetitions for a more meaningful 1RM estimate.');
      const epley = reps === 1 ? weight : weight * (1 + reps / 30); const brzycki = reps === 1 ? weight : weight * 36 / (37 - reps); const lombardi = reps === 1 ? weight : weight * Math.pow(reps, 0.1); const average = (epley + brzycki + lombardi) / 3;
      return result(average, `${v.unit} estimated 1RM`, `${weight}(1+${reps}/30)`, [
        { label: 'Epley estimate', value: epley, suffix: ` ${v.unit}` }, { label: 'Brzycki estimate', value: brzycki, suffix: ` ${v.unit}` }, { label: 'Lombardi estimate', value: lombardi, suffix: ` ${v.unit}` }, { label: '80% training load', value: average * 0.8, suffix: ` ${v.unit}` },
      ], 'Stop if form breaks down; this estimate is not a recommendation to attempt a maximal lift without appropriate experience and supervision.', false);
    }),

    tool('met-calories', 'Exercise calorie-burn calculator', 'Estimate gross exercise energy from MET value, weight, and time.', 'met-calories', [
      select('system', 'Measurement system', 'metric', [option('metric', 'Metric'), option('imperial', 'US / Imperial')], { segmented: true }), field('weight', 'Body weight', 72, 'kg or lb'), field('minutes', 'Activity duration', 45, 'minutes'),
      select('activity', 'Activity / MET value', '7', [option('3.5', 'Brisk walking · 3.5 MET'), option('5', 'Moderate strength training · 5 MET'), option('6', 'Lap swimming · 6 MET'), option('7', 'Jogging · 7 MET'), option('8', 'Moderate cycling · 8 MET'), option('10', 'Running · 10 MET'), option('custom', 'Custom MET')]),
      { ...field('customMet', 'Custom MET value', 6, 'MET'), when: { field: 'activity', values: ['custom'] } },
    ], (v) => {
      const kg = positive(v.weight, 'Weight') * (v.system === 'imperial' ? 0.45359237 : 1); const minutes = positive(v.minutes, 'Duration'); const met = v.activity === 'custom' ? positive(v.customMet, 'MET value') : positive(v.activity, 'MET value'); const kcal = met * 3.5 * kg / 200 * minutes;
      return result(kcal, 'kcal estimated', `${met}*3.5*${compact(kg)}/200*${minutes}`, [
        { label: 'Average kcal per minute', value: kcal / minutes }, { label: 'MET value used', value: met }, { label: 'Body mass', value: kg, suffix: ' kg' }, { label: 'Duration', value: minutes, suffix: ' min' },
      ], 'Gross estimate based on the conventional 1 MET = 3.5 mL O₂/kg/min reference. Actual expenditure varies with physiology, technique, and conditions.', false);
    }),

    tool('vo2-max', 'VO₂ max estimator', 'Estimate aerobic capacity with Cooper 12-minute or Rockport 1-mile equations.', 'vo2-max', [
      select('method', 'Field-test equation', 'cooper', [option('cooper', 'Cooper 12-minute distance'), option('rockport', 'Rockport 1-mile walk')]),
      select('system', 'Measurement system', 'metric', [option('metric', 'Metric'), option('imperial', 'US / Imperial')], { segmented: true }),
      { ...field('distance', 'Distance in 12 minutes', 2.5, 'km or mi'), when: { field: 'method', values: ['cooper'] } },
      { ...field('age', 'Age', 35, 'years'), when: { field: 'method', values: ['rockport'] } },
      { ...select('sex', 'Equation sex', 'male', [option('male', 'Male'), option('female', 'Female')]), when: { field: 'method', values: ['rockport'] } },
      { ...field('weight', 'Body weight', 165, 'kg or lb'), when: { field: 'method', values: ['rockport'] } },
      { ...field('time', 'One-mile walk time', 15, 'minutes'), when: { field: 'method', values: ['rockport'] } },
      { ...field('heartRate', 'Heart rate at finish', 135, 'bpm'), when: { field: 'method', values: ['rockport'] } },
    ], (v) => {
      let vo2; let expression; const details = [];
      if (v.method === 'rockport') {
        const weightLb = positive(v.weight, 'Weight') * (v.system === 'metric' ? 2.20462262185 : 1); const age = positive(v.age, 'Age'); const time = positive(v.time, 'Walk time'); const heart = positive(v.heartRate, 'Heart rate'); const sex = v.sex === 'male' ? 1 : 0;
        vo2 = 132.853 - 0.0769 * weightLb - 0.3877 * age + 6.315 * sex - 3.2649 * time - 0.1565 * heart; expression = `132.853-.0769(${compact(weightLb)})-.3877(${age})+6.315(${sex})-3.2649(${time})-.1565(${heart})`; details.push({ label: 'Method', value: 'Rockport 1-mile walk' });
      } else {
        const meters = positive(v.distance, 'Distance') * (v.system === 'metric' ? 1000 : 1609.344); vo2 = (meters - 504.9) / 44.73; expression = `(${compact(meters)}-504.9)/44.73`; details.push({ label: 'Method', value: 'Cooper 12-minute run' }, { label: 'Distance used', value: meters, suffix: ' m' });
      }
      if (vo2 <= 0) throw new Error('The entered field-test result is outside the supported equation range.');
      details.push({ label: 'Estimated VO₂ max', value: vo2, suffix: ' mL/kg/min' });
      return result(vo2, 'mL/kg/min estimated VO₂ max', expression, details, 'Field-test equation estimate only. Test conditions, medications, health, and effort affect the result; strenuous tests may require medical clearance.', false);
    }),

    tool('endurance-splits', 'Running & cycling split planner', 'Build even or progressively faster target splits.', 'splits', [
      select('activity', 'Activity', 'running', [option('running', 'Running'), option('cycling', 'Cycling')], { segmented: true }), select('unit', 'Distance unit', 'mi', [option('mi', 'Miles'), option('km', 'Kilometers')], { segmented: true }),
      field('distance', 'Total distance', 10, 'mi or km'), field('minutes', 'Target total time', 85, 'minutes'), field('segments', 'Number of equal splits', 5, 'splits'),
      select('strategy', 'Pacing plan', 'even', [option('even', 'Even splits'), option('negative', 'Progressively faster')]),
    ], (v) => {
      const distance = positive(v.distance, 'Distance'); const totalMinutes = positive(v.minutes, 'Total time'); const segments = Math.round(positive(v.segments, 'Segments')); if (segments > 30) throw new Error('Use 30 or fewer splits.');
      let weights = Array.from({ length: segments }, () => 1); if (v.strategy === 'negative' && segments > 1) weights = weights.map((_, index) => 1.08 - 0.16 * index / (segments - 1)); const sum = weights.reduce((a, b) => a + b, 0);
      const schedule = weights.map((weight, index) => `#${index + 1} ${durationText(totalMinutes * 60 * weight / sum)}`).join(' · ');
      const pace = totalMinutes / distance; const speed = distance / (totalMinutes / 60);
      return result(pace, `min/${v.unit} average pace`, `${totalMinutes}/${distance}`, [
        { label: 'Split distance', value: distance / segments, suffix: ` ${v.unit}` }, { label: 'Average speed', value: speed, suffix: ` ${v.unit}/h` }, { label: 'Target splits', value: schedule }, { label: 'Pacing strategy', value: v.strategy === 'negative' ? 'Progressively faster' : 'Even' },
      ], 'Split times are planning targets. Terrain, wind, traffic, stops, fatigue, and course profile are not modeled.', false);
    }),

    tool('sleep-cycle', 'Sleep-cycle & bedtime calculator', 'Suggest bedtimes or wake times using adjustable cycle length and fall-asleep time.', 'sleep-cycle', [
      select('direction', 'Calculate', 'bedtime', [option('bedtime', 'Bedtimes from wake time'), option('wake', 'Wake times from bedtime')], { segmented: true }),
      text('time', 'Clock time', '7:00', { time12: true, placeholder: '00:00', periodDefault: 'am' }), field('cycleLength', 'Estimated cycle length', 90, 'minutes'), field('fallAsleep', 'Time to fall asleep', 15, 'minutes'),
    ], (v) => {
      const base = clockMinutes(v.time, v.timePeriod, 'Clock time'); const cycle = positive(v.cycleLength, 'Cycle length'); const latency = positive(v.fallAsleep, 'Time to fall asleep', true); const bedtimes = v.direction === 'bedtime';
      const suggestions = [6, 5, 4].map((cycles) => ({ cycles, time: clockText(base + (bedtimes ? -1 : 1) * (cycles * cycle + latency)) }));
      return result(suggestions[1].time, bedtimes ? 'suggested bedtime · 5 cycles' : 'suggested wake time · 5 cycles', `${base}${bedtimes ? '-' : '+'}(5*${cycle}+${latency})`, suggestions.map((item) => ({ label: `${item.cycles} cycles · ${compact(item.cycles * cycle / 60)} h sleep`, value: item.time })),
        'Sleep cycles vary and healthy sleep needs differ by age and person. Suggestions are clock arithmetic, not medical guidance or a guarantee of waking between sleep stages.', false);
    }),
  ];

  return { scienceUnitTools, financeTools, healthTools };
});
