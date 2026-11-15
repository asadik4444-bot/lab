/* Explicit annual models. USD and fractions throughout. No DOM, network, or implicit missing-value zeros. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DetailedMath = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const fail = (...errors) => ({ ok: false, errors: errors.flat() });
  const required = (o, keys) => keys.filter(k => !finite(o[k])).map(k => 'Enter a finite value for ' + k + '.');
  const claimKeys = ['debt', 'financeLeases', 'nci', 'cash', 'investments'];

  function claims(p) {
    const errors = required(p, claimKeys);
    claimKeys.forEach(k => { if (finite(p[k]) && p[k] < 0) errors.push(k + ' cannot be negative.'); });
    if (errors.length) return fail(errors);
    const net = p.debt + p.financeLeases + p.nci - p.cash - p.investments;
    return finite(net) ? { ok: true, net } : fail('Claims exceed the numeric range.');
  }

  function wacc(p) {
    const errors = required(p, ['riskFree', 'beta', 'erp', 'costDebt', 'taxRate', 'equity', 'debtWeightValue']);
    if (errors.length) return fail(errors);
    if (p.equity <= 0 || p.debtWeightValue < 0 || p.beta < 0 || p.erp < 0 || p.costDebt < 0 ||
        p.taxRate < 0 || p.taxRate >= 1) return fail('Check the capital values, beta, risk premium, borrowing cost, and tax rate.');
    const equityCost = p.riskFree + p.beta * p.erp;
    // The weight comes from the ratio of the two values. Their sum can exceed the numeric range; their ratio does not.
    const equityWeight = 1 / (1 + p.debtWeightValue / p.equity);
    const rate = equityWeight * equityCost + (1 - equityWeight) * p.costDebt * (1 - p.taxRate);
    return finite(rate) && rate > -1 ? { ok: true, rate, equityCost, equityWeight, debtWeight: 1 - equityWeight } : fail('Invalid WACC.');
  }

  const annualKeys = ['growth', 'margin', 'taxRate', 'daRatio', 'capexRatio', 'wcRatio'];
  /* The generated operating path of the ten forecast years. dcf() and the annual-input table both use it.
     Growth holds for five years, then fades to terminal growth. The margin moves in a straight line.
     With capexFade, capex above depreciation is treated as growth investment: it holds for five years,
     then fades to the depreciation level together with growth. Capex at or below depreciation does not change. */
  function path(p) {
    const steadyCapex = p.capexFade === true ? Math.min(p.capexRatio, p.daRatio) : p.capexRatio;
    return Array.from({ length: 10 }, (_, i) => {
      const t = i + 1;
      return {
        growth: t <= 5 ? p.growth : p.growth + (p.terminalGrowth - p.growth) * (t - 5) / 5,
        margin: p.margin + (p.targetMargin - p.margin) * t / 10,
        taxRate: p.taxRate, daRatio: p.daRatio,
        capexRatio: t <= 5 ? p.capexRatio : p.capexRatio + (steadyCapex - p.capexRatio) * (t - 5) / 5,
        wcRatio: p.wcRatio
      };
    });
  }

  function dcf(p) {
    const errors = required(p, ['revenue', 'growth', 'margin', 'targetMargin', 'taxRate', 'daRatio',
      'capexRatio', 'wcRatio', 'rate', 'terminalGrowth', 'terminalRoc']);
    if (errors.length) return fail(errors);
    if (p.revenue <= 0 || p.growth <= -1 || p.terminalGrowth <= -1 || p.rate <= p.terminalGrowth ||
        p.rate <= -1 || p.terminalRoc <= 0 || p.terminalGrowth > p.terminalRoc) {
      return fail('Require positive revenue and terminal return on capital. Growth must exceed -100%. WACC must exceed terminal growth. Terminal reinvestment cannot exceed 100%.');
    }
    if (p.forecast != null && (!Array.isArray(p.forecast) || p.forecast.length !== 10)) return fail('Enter exactly ten forecast years.');
    const rows = [], generated = p.forecast ? null : path(p);
    let revenue = p.revenue, wc = p.revenue * p.wcRatio, sumPv = 0;
    for (let t = 1; t <= 10; t++) {
      const a = p.forecast ? p.forecast[t - 1] : generated[t - 1];
      if (required(a, annualKeys).length || a.growth <= -1 || a.taxRate < 0 || a.taxRate >= 1 ||
          a.daRatio < 0 || a.capexRatio < 0 || a.margin < -1 || a.margin > 1) return fail('Invalid operating inputs in year ' + t + '.');
      revenue *= 1 + a.growth;
      const ebit = revenue * a.margin, tax = Math.max(0, ebit) * a.taxRate;
      const da = revenue * a.daRatio, capex = revenue * a.capexRatio, nextWc = revenue * a.wcRatio;
      const deltaWc = nextWc - wc, fcff = ebit - tax + da - capex - deltaWc;
      const pv = fcff / Math.pow(1 + p.rate, t);
      rows.push({ t, ...a, revenue, ebit, tax, da, capex, workingCapital: nextWc, deltaWc, fcff, pv });
      wc = nextWc; sumPv += pv;
    }
    const last = rows[9], terminalNopat = last.revenue * (1 + p.terminalGrowth) * last.margin * (1 - last.taxRate);
    if (!(terminalNopat > 0)) return fail('The stable business needs positive after-tax operating profit. Revise the forecast or use another valuation method.');
    const reinvestmentRate = p.terminalGrowth / p.terminalRoc;
    // (return − growth) / return is 1 − the reinvestment rate. This form keeps its digits when growth is close to the return.
    const terminalCash = terminalNopat * (p.terminalRoc - p.terminalGrowth) / p.terminalRoc;
    const terminalValue = terminalCash / (p.rate - p.terminalGrowth);
    const pvTerminal = terminalValue / Math.pow(1 + p.rate, 10), enterprise = sumPv + pvTerminal;
    if (![enterprise, pvTerminal, terminalValue, sumPv].every(finite)) return fail('The forecast exceeds the numeric range.');
    return { ok: true, rows, sumPv, terminalNopat, reinvestmentRate, terminalCash, terminalValue, pvTerminal,
      enterprise, terminalShare: enterprise > 0 ? pvTerminal / enterprise : null };
  }

  function equity(enterprise, bridge, shares) {
    const c = claims(bridge);
    if (!c.ok) return c;
    if (!finite(enterprise) || !finite(shares) || shares <= 0) return fail('Enter a valid enterprise value and current share count.');
    const residual = enterprise - c.net, value = Math.max(0, residual);
    if (!finite(residual) || !finite(value / shares)) return fail('Equity value exceeds the numeric range.');
    return { ok: true, netClaims: c.net, residual, equity: value, perShare: value / shares };
  }

  function multiples(p, bridge) {
    if (!finite(p.price) || p.price <= 0 || !finite(p.shares) || p.shares <= 0) return fail('Enter price and current shares.');
    const c = claims(bridge), marketEquity = p.price * p.shares;
    if (!finite(marketEquity)) return fail('The market value exceeds the numeric range.');
    return { ok: true, marketEquity, enterprise: c.ok && !p.financial ? marketEquity + c.net : null,
      evEbitda: c.ok && !p.financial && p.ebitda > 0 ? (marketEquity + c.net) / p.ebitda : null,
      // Price / EPS is used only when the earnings and the entered price refer to the same class.
      pe: p.epsClassVerified && finite(p.eps) && p.eps > 0 ? p.price / p.eps : null,
      errors: c.ok ? [] : c.errors };
  }

  /* The two solvers below must find every solution, or they cannot say that a solution is the only one.
     A scan with a fixed step cannot do that: two solutions can lie between two of its points.
     So each solver first finds every turning point of its value function. Between two neighbouring turning points
     the function only rises or only falls, and it crosses a level one time at most.
     Both value functions are polynomials, which makes the turning points exact:
     - Enterprise value is a polynomial in 1 + growth.
     - Enterprise value less a required value, multiplied by a factor that is positive in the search range,
       is a polynomial in 1 + rate.
     Polynomials have ascending coefficients. */
  const polyValue = (c, x) => c.reduceRight((y, k) => y * x + k, 0);
  const polyTimes = (a, b) => a.reduce((out, x, i) => { b.forEach((y, j) => { out[i + j] += x * y; }); return out; },
    Array(a.length + b.length - 1).fill(0));
  // The points between a and b where a polynomial changes sign. It can change sign once between two of its own
  // turning points, and those are the sign changes of its derivative. So the search starts at the highest derivative.
  function signChanges(c, a, b) {
    let n = c.length - 1;
    while (n > 0 && c[n] === 0) n--;
    if (n < 1) return [];
    const cuts = [a, ...turningPoints(c.slice(0, n + 1), a, b), b], ys = cuts.map(x => polyValue(c, x)), out = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      let lo = cuts[i], hi = cuts[i + 1];
      if (i > 0 && ys[i] === 0) out.push(lo);
      if (ys[i] === 0 || ys[i + 1] === 0 || (ys[i] < 0) === (ys[i + 1] < 0)) continue;
      for (let k = 0; k < 100; k++) {
        const m = (lo + hi) / 2, y = polyValue(c, m);
        if (!(m > lo && m < hi)) break;
        if (y === 0) { lo = hi = m; break; }
        if ((y < 0) === (ys[i] < 0)) lo = m; else hi = m;
      }
      out.push((lo + hi) / 2);
    }
    return out;
  }
  function turningPoints(c, a, b) { return signChanges(c.slice(1).map((k, i) => k * (i + 1)), a, b); }

  /* The roots of f, given ascending points xs between which f only rises or only falls. Each change of sign
     between two neighbours then holds exactly one root, and bisection finds it. A value within tol of zero
     at a point is a root at that point: the function touches zero there, or two roots lie closer together
     than the arithmetic can separate. Points where f has no value are skipped.
     limit: the first point is then outside the range. f has no value there, and limit is the value that f
     approaches just inside the range (it can be Infinity). That point is never a root. A root can lie at
     any distance above it, and bisection finds that root too.
     The result has flat = true when f is zero at every point: f is then zero along the whole range,
     each value in the range is a root, and a count of roots has no meaning. */
  function roots(f, xs, tol, limit) {
    const sign = y => y > tol ? 1 : y < -tol ? -1 : 0, open = limit !== undefined, found = [];
    const signs = xs.map((x, i) => { const y = open && i === 0 ? limit : f(x); return Number.isNaN(y) ? null : sign(y); });
    for (let i = 0; i < xs.length; i++) {
      if (signs[i] === null) continue;
      if (signs[i] === 0) { if (!(open && i === 0)) found.push(xs[i]); continue; }
      if (i + 1 === xs.length || signs[i + 1] !== -signs[i]) continue;
      // Bisection ends when the bracket is narrow and the value is inside the tolerance. A steep function needs
      // a bracket far narrower than 1e-13 for that, and a flat one reaches the tolerance long before the bracket is narrow.
      let a = xs[i], b = xs[i + 1];
      for (let k = 0; k < 400; k++) {
        const m = (a + b) / 2, fm = f(m);
        if (!finite(fm) || !(m > a && m < b)) break;
        if (fm === 0) { a = b = m; break; }
        if ((fm < 0) === (signs[i] < 0)) a = m; else b = m;
        if (b - a <= 1e-13 && Math.abs(fm) <= tol) break;
      }
      found.push((a + b) / 2);
    }
    // Roots that agree to nine decimals are one root.
    const out = found.filter((x, i) => i === 0 || x - found[i - 1] > 1e-9);
    out.flat = signs.length > 1 && signs.every(s => s === 0);
    return out;
  }
  const inside = (points, low, high) => [low, ...points.filter(x => x > low && x < high), high];

  /* Enterprise value as a polynomial in x = 1 + growth, without its constant term.
     The growth of each forecast year is a straight-line function of the opening growth rate, so the revenue of
     each year is a polynomial in x. Enterprise value is a weighted sum of the ten revenues. The weights come
     from the engine: a forecast with level revenue that doubles in year k gives the value of the revenue from year k on. */
  function growthPolynomial(p) {
    const level = path({ ...p, growth: 0 }), unit = path({ ...p, growth: 1 });
    const runs = Array.from({ length: 11 }, (_, k) =>
      dcf({ ...p, growth: 0, forecast: level.map((year, i) => ({ ...year, growth: i + 1 === k ? 1 : 0 })) }));
    if (!runs.every(v => v.ok)) return null;
    const poly = Array(11).fill(0);
    let revenue = [1];
    for (let t = 1; t <= 10; t++) {
      const slope = unit[t - 1].growth - level[t - 1].growth;
      revenue = polyTimes(revenue, [1 + level[t - 1].growth - slope, slope]);
      const weight = runs[t].enterprise - runs[t < 10 ? t + 1 : 0].enterprise;
      revenue.forEach((k, j) => { poly[j] += weight * k; });
    }
    return poly;
  }

  // The growth rate of years 1–5 at which the forecast is worth the target enterprise value.
  // A result is given only when it is the single solution in the search range.
  function reverse(p, target, low = -0.5, high = 1) {
    if (!finite(target) || target <= 0) return fail('Reverse DCF needs a positive enterprise value.');
    if (p.forecast) return fail('Reverse DCF requires the generated growth path. Remove annual overrides first.');
    const f = g => { const v = dcf({ ...p, growth: g }); return v.ok ? v.enterprise - target : NaN; };
    const value = growthPolynomial(p);
    const turns = value ? turningPoints(value, 1 + low, 1 + high).map(x => x - 1) : [];
    const found = roots(f, inside(turns, low, high), Math.max(1, target) * 1e-12);
    if (found.flat) return { ...fail('Each growth rate in the search range gives this value. The forecast value does not depend on growth.'), solutions: [...found] };
    if (found.length === 1) return { ok: true, growth: found[0] };
    // A failed search lists what it found: no solution, or more than one.
    return { ...fail(found.length ? 'More than one growth solution exists.' : 'No growth solution within -50% to 100%.'), solutions: [...found] };
  }

  // The single discount rate at which the forecast is worth the entered price per share.
  // Capital weights are not solved again: this is the rate that the price implies for the stated cash flows.
  // Cash flows that change sign can give several such rates. Then no rate is reported.
  // The search range is every rate that the engine accepts, up to the limit `high` (100%).
  function impliedRate(p, bridge, shares, price, high = 1) {
    if (!finite(price) || price <= 0) return fail('The implied discount rate needs a positive price.');
    if (!p || !finite(p.terminalGrowth)) return fail('The implied discount rate needs a complete forecast.');
    const tracks = !!p.terminalRocTracksWacc;
    const at = rate => tracks ? { ...p, rate, terminalRoc: rate } : { ...p, rate };
    const gap = rate => {
      const d = dcf(at(rate)), e = d.ok ? equity(d.enterprise, bridge, shares) : d;
      return e.ok ? e.perShare - price : NaN;
    };
    // The engine needs a rate above terminal growth. When the terminal return follows the rate, it also needs a rate above zero.
    // So the range is open at its low end: `low` itself is not a rate, and every rate above it is.
    const floor = tracks ? 0 : p.terminalGrowth, low = Math.max(p.terminalGrowth, floor);
    if (!(high > low)) return fail('The implied discount rate needs terminal growth below the search limit.');
    /* With u = 1 + rate, the price is met where  sum(FCFF_t / u^t) + K / ((rate − floor) × u^10) = V.
       V is the enterprise value that the price needs: net claims + price × shares.
       K / (rate − floor) is the terminal value: the terminal cash flow over (rate − terminal growth). When the terminal
       return follows the rate, it is the terminal profit after tax over the rate, so floor is 0.
       Multiply by (rate − floor) × u^10, which is positive in the search range:
       (u − 1 − floor) × (sum(FCFF_t × u^(10 − t)) − V × u^10) + K = 0. K is a constant, so it does not move a turning point. */
    const base = dcf(at(high)), c = claims(bridge);
    const flows = base.ok && c.ok && finite(shares) && shares > 0 ? [...base.rows.map(row => row.fcff).reverse(), -(c.net + price * shares)] : null;
    const turns = flows ? turningPoints(polyTimes(flows, [-1 - floor, 1]), 1 + low, 1 + high).map(u => u - 1) : [];
    /* The value that the gap approaches just above the low end. Where the low end is the floor of a positive
       terminal cash flow, the terminal value has no upper limit there: the forecast is worth more than any price.
       In the other cases the value has a limit, which is the same sum taken at the low end. */
    let edge;
    if (flows) {
      const K = tracks ? base.terminalNopat : base.terminalCash, u = 1 + low;
      edge = low === floor && K > 0 ? Infinity :
        (polyValue(flows, u) + (low > floor ? K / (low - floor) : 0)) / Math.pow(u, 10) / shares;
    }
    const xs = inside(turns, low, high), found = roots(gap, xs, Math.max(1, price) * 1e-12, edge);
    // No forecast or terminal cash flow: the value is the net claims at each rate, so the price says nothing about the rate.
    if (found.flat) return fail('Each discount rate in the search range gives this price. The forecast has no cash flow that the rate changes.');
    if (found.length === 1) return { ok: true, rate: found[0] };
    if (found.length > 1) return { ...fail('More than one discount rate gives this price, because the forecast cash flows change sign.'), solutions: [...found] };
    const first = xs.map(gap).find(finite);
    if (!finite(first)) return fail('The forecast gives no value in the rate search.');
    return fail(first < 0 ? 'No discount rate above terminal growth supports this price for the stated forecast.' : 'The price is below the value at a 100% discount rate.');
  }

  function sensitivity(p, bridge, shares) {
    return [-0.01, 0, 0.01].map(dr => [-0.005, 0, 0.005].map(dg => {
      const q = { ...p, rate: p.rate + dr, terminalGrowth: p.terminalGrowth + dg };
      if (p.terminalRocTracksWacc) q.terminalRoc = q.rate;
      const v = dcf(q), e = v.ok ? equity(v.enterprise, bridge, shares) : v;
      return { rate: q.rate, terminalGrowth: q.terminalGrowth, value: e.ok ? e.perShare : null,
        reason: e.ok ? null : e.errors.join(' ') };
    }));
  }

  // Cash flows have one initial outflow, optional later outflows, then one terminal inflow.
  function investorIrr(flows) {
    if (!Array.isArray(flows) || flows.length < 2 || !flows.every(finite) || flows[0] >= 0 ||
        flows.slice(1, -1).some(x => x > 0)) return null;
    if (flows[flows.length - 1] <= 0) return null;
    const npv = rate => flows.reduce((s, c, t) => s + c / Math.pow(1 + rate, t), 0);
    let lo = -0.999999, hi = 1;
    while (npv(hi) > 0 && hi < 1e8) hi *= 2;
    if (npv(hi) > 0) return null;
    for (let i = 0; i < 220; i++) {
      const m = (lo + hi) / 2;
      if (npv(m) > 0) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  function lbo(p) {
    const activeRates = p.rateType === 'fixed' ? ['fixedRate'] : ['baseRate','spread','rateFloor'];
    const keys = ['revenue', 'margin', 'growth', 'daRatio', 'capexRatio', 'wcRatio', 'taxRate',
      'entryMultiple', 'exitMultiple', 'leverage', 'feeRate', 'financeFeeRate', 'minimumCash',
      'revolverLimit', 'amortization', 'sweep', 'years', 'maturity',
      ...activeRates];
    const errors = required(p, keys);
    if (errors.length) return fail(errors);
    if (p.revenue <= 0 || p.margin <= 0 || p.margin > 1 || p.growth <= -1 || p.taxRate < 0 || p.taxRate >= 1 ||
        !Number.isInteger(p.years) || p.years < 1 || p.years > 10 || !Number.isInteger(p.maturity) || p.maturity < 1 ||
        ['daRatio','capexRatio','entryMultiple','exitMultiple','leverage','feeRate','financeFeeRate','minimumCash',
          'revolverLimit','amortization','sweep',...activeRates.filter(k=>k!=='baseRate')].some(k => p[k] < 0) ||
        p.amortization > 1 || p.sweep > 1 || !['fixed','floating'].includes(p.rateType)) return fail('Invalid buyout inputs.');
    const ebitda0 = p.revenue * p.margin, entryEv = ebitda0 * p.entryMultiple, debt0 = p.leverage * ebitda0;
    const fees = entryEv * p.feeRate + debt0 * p.financeFeeRate;
    const uses = entryEv + fees + p.minimumCash, equityIn = uses - debt0;
    if (equityIn <= 0) return fail('Initial equity must be positive. Reduce acquisition debt.');
    const rate = p.rateType === 'fixed' ? p.fixedRate : Math.max(p.baseRate, p.rateFloor) + p.spread;
    let revenue = p.revenue, term = debt0, revolver = 0, cash = p.minimumCash, wc = revenue * p.wcRatio;
    let lossCarry = 0, contributions = equityIn;
    const rows = [], flows = [-equityIn];
    for (let t = 1; t <= p.years; t++) {
      revenue *= 1 + p.growth;
      const ebitda = revenue * p.margin, da = revenue * p.daRatio, ebit = ebitda - da;
      const openingTerm = term, openingRevolver = revolver, openingCash = cash;
      const interest = (term + revolver) * rate, pretax = ebit - interest;
      const lossUsed = Math.min(lossCarry, Math.max(0, pretax));
      const taxable = Math.max(0, pretax - lossUsed), tax = taxable * p.taxRate;
      lossCarry = lossCarry - lossUsed + Math.max(0, -pretax);
      const capex = revenue * p.capexRatio, nextWc = revenue * p.wcRatio, deltaWc = nextWc - wc;
      const cashFlow = ebitda - interest - tax - capex - deltaWc;
      // At exit the sale settles the remaining balances through the equity bridge.
      const maturesBeforeExit = t >= p.maturity && t < p.years;
      const mandatory = maturesBeforeExit ? term : Math.min(term, debt0 * p.amortization);
      cash += cashFlow - mandatory; term -= mandatory;
      let draw = 0, extraEquity = 0, shortfall = Math.max(0, p.minimumCash - cash);
      // Revolving debt also matures. No automatic refinance or fresh draws after maturity.
      const maturityRevolver = maturesBeforeExit ? revolver : 0;
      if (maturesBeforeExit) { cash -= maturityRevolver; revolver = 0; shortfall = Math.max(0, p.minimumCash - cash); }
      if (shortfall && t < p.maturity) {
        draw = Math.min(shortfall, Math.max(0, p.revolverLimit - revolver)); revolver += draw; cash += draw;
        shortfall = Math.max(0, p.minimumCash - cash);
      }
      if (shortfall > 1e-7 && p.allowEquity) { extraEquity = shortfall; cash += extraEquity; contributions += extraEquity; shortfall = 0; }
      const excess = Math.max(0, cash - p.minimumCash), sweepBudget = excess * p.sweep;
      const revolverPay = Math.min(revolver, sweepBudget), termPay = Math.min(term, sweepBudget - revolverPay);
      revolver -= revolverPay; term -= termPay; cash -= revolverPay + termPay;
      rows.push({ t, revenue, ebitda, da, ebit, interest, taxable, tax, capex, deltaWc, cashFlow,
        openingTerm, openingRevolver, openingCash, mandatory, maturityRevolver, draw, extraEquity, revolverPay, termPay,
        term, revolver, cash, shortfall, lossCarry });
      flows.push(-extraEquity); wc = nextWc;
      if (shortfall > 1e-7) return { ok: false, errors: ['Funding shortfall in year ' + t + '. Enter more capacity or approve additional equity.'],
        rows, shortfall, year: t, sourcesUses: { entryEv, fees, minimumCash: p.minimumCash, uses, debt0, equityIn } };
    }
    const last = rows[rows.length - 1], exitEv = last.ebitda * p.exitMultiple;
    const residual = exitEv - term - revolver + cash, proceeds = Math.max(0, residual);
    flows[flows.length - 1] += proceeds;
    if (![proceeds, contributions, ...flows].every(finite)) return fail('The buyout exceeds the numeric range.');
    const irr = proceeds === 0 ? -1 : investorIrr(flows);
    return { ok: true, rows, rate, cashFlows: flows, contributions, proceeds, residual, exitEv,
      moic: proceeds / contributions, irr,
      irrReason: proceeds === 0 ? 'Total loss: −100% is a return convention, not an IRR root.' :
        irr == null ? 'No positive net investor cash flow remains after the final equity contribution. No IRR root exists.' : null,
      sourcesUses: { entryEv, fees, minimumCash: p.minimumCash, uses, debt0, equityIn } };
  }
  return { finite, claims, wacc, path, dcf, equity, multiples, reverse, impliedRate, sensitivity, lbo, investorIrr };
});
