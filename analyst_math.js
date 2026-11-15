/* Pure analyst comparisons. All amounts follow DetailedMath's consistent input units.
   Selected multiple bands are visitor assumptions, never observed comparables.
   Cases are recalculated from p; cached ctx.d/ctx.e are not trusted after an input edit. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./detailed_math.js'));
  else root.AnalystMath = factory(root.DetailedMath);
})(typeof window !== 'undefined' ? window : this, function (M) {
  'use strict';
  if (!M || typeof M.dcf !== 'function') throw new Error('Load DetailedMath before AnalystMath.');
  const finite = M.finite;
  const unique = values => [...new Set(values)];
  const bad = errors => ({ ok: false, errors: Array.isArray(errors) ? errors : [errors] });
  const isObject = value => value != null && typeof value === 'object' && !Array.isArray(value);
  const isAnnual = p => p && p.forecast != null;
  const financial = ctx => ctx && (ctx.financial === true || (ctx.p && ctx.p.financial === true));

  function parameters(p, changes) {
    const q = { ...(isObject(p) ? p : {}), ...(changes || {}) };
    if (Array.isArray(q.forecast)) q.forecast = q.forecast.map(row => isObject(row) ? { ...row } : row);
    if (q.terminalRocTracksWacc === true) q.terminalRoc = q.rate;
    return q;
  }

  function unavailableCase(id, name, errors, q = null) {
    const result = bad(errors);
    return { id, name, q, d: result, e: result, ok: false, value: null,
      errors: result.errors, reason: result.errors.join(' ') };
  }

  function calculate(p, bridge, shares, id, name, changes) {
    const q = parameters(p, changes);
    if (Array.isArray(q.forecast) && q.forecast.some(row => !isObject(row))) {
      return unavailableCase(id, name, 'Every annual forecast row must contain explicit numeric assumptions.', q);
    }
    const d = M.dcf(q);
    const e = d.ok ? M.equity(d.enterprise, isObject(bridge) ? bridge : {}, shares) : d;
    const errors = e.ok ? [] : e.errors;
    return { id, name, q, d, e, ok: e.ok, value: e.ok ? e.perShare : null,
      errors, reason: errors.length ? errors.join(' ') : null };
  }

  function stepError(a, key, label) {
    return !finite(a[key]) || a[key] < 0 ? 'Enter a valid ' + label + ' change of zero or more.' : null;
  }

  function baseCase(ctx) {
    ctx = ctx || {};
    if (financial(ctx)) return unavailableCase('base', 'Current assumptions', 'The generic enterprise DCF does not apply to financial companies.');
    return calculate(ctx.p, ctx.bridge, ctx.shares, 'base', 'Current assumptions');
  }

  // "Low" and "high" describe the growth and margin assumptions. Each case also moves WACC against them.
  // The names state inputs, not a guaranteed value ordering: a loss-making forecast can invert it.
  function scenarios(p, bridge, shares, shocks = {}) {
    shocks = isObject(shocks) ? shocks : {};
    const base = p && p.financial === true ?
      unavailableCase('base', 'Base case', 'The generic enterprise DCF does not apply to financial companies.') :
      calculate(p, bridge, shares, 'base', 'Base case');
    const names = ['Low case', 'High case'];
    const errors = [
      stepError(shocks, 'growthStep', 'growth'),
      stepError(shocks, 'marginStep', 'margin'),
      stepError(shocks, 'waccStep', 'WACC')
    ].filter(Boolean);
    if (!base.ok) errors.push(...base.errors);
    if (isAnnual(p)) errors.push('Generated growth and margin scenarios are disabled while annual overrides are active.');
    if (p && p.financial === true) errors.push('The generic enterprise DCF does not apply to financial companies.');
    if (errors.length) {
      return [unavailableCase('lower', names[0], errors), base, unavailableCase('higher', names[1], errors)];
    }
    return [-1, 0, 1].map(direction => {
      if (!direction) return base;
      return calculate(p, bridge, shares, direction < 0 ? 'lower' : 'higher', names[direction < 0 ? 0 : 1], {
        growth: p.growth + direction * shocks.growthStep,
        targetMargin: p.targetMargin + direction * shocks.marginStep,
        rate: p.rate - direction * shocks.waccStep
      });
    });
  }

  function method(id, label, cases, central, notes = [], errors = []) {
    const valid = cases.filter(c => c.ok && finite(c.value));
    const invalidCases = cases.filter(c => !c.ok || !finite(c.value));
    const allErrors = unique([...errors, ...invalidCases.flatMap(c => c.errors || [])]);
    const status = !valid.length ? 'unavailable' : invalidCases.length || errors.length ? 'partial' : 'available';
    return { id, label, status, unit: 'USD per share',
      low: valid.length ? Math.min(...valid.map(c => c.value)) : null,
      high: valid.length ? Math.max(...valid.map(c => c.value)) : null,
      central: finite(central) ? central : null, cases, invalidCases, errors: allErrors,
      reason: allErrors.length ? allErrors.join(' ') : null,
      notes: [...notes, ...(invalidCases.length ? [
        'This is an incomplete range: ' + valid.length + ' of ' + cases.length +
        ' cases are valid. Invalid cases are listed and are not clipped.'
      ] : [])] };
  }

  function bandErrors(a, lowKey, highKey, label) {
    if (!finite(a[lowKey]) || !finite(a[highKey])) return ['Enter both finite endpoints of the selected ' + label + ' band.'];
    if (a[lowKey] < 0 || a[highKey] < 0) return ['Selected ' + label + ' multiples cannot be negative.'];
    if (a[lowKey] > a[highKey]) return ['The selected ' + label + ' lower multiple must not exceed the upper multiple.'];
    return [];
  }

  function selectedMultiples(low, high) {
    return [{ id: 'lower_multiple', name: 'Lower selected multiple', multiple: low },
      { id: 'upper_multiple', name: 'Upper selected multiple', multiple: high }];
  }

  function ranges(ctx, a = {}) {
    ctx = ctx || {};
    a = isObject(a) ? a : {};
    const base = baseCase(ctx), p = ctx.p || {};
    const dcfNotes = ['DCF sensitivity, not a probability interval. WACC and terminal growth change together across nine cases.'];
    if (p.terminalRocTracksWacc === true) dcfNotes.push('Terminal return on capital follows the WACC in each case.');
    const errors = [stepError(a, 'waccStep', 'WACC'), stepError(a, 'terminalStep', 'terminal-growth')].filter(Boolean);
    if (financial(ctx)) errors.push('The generic enterprise DCF does not apply to financial companies.');
    const cells = [];
    if (!errors.length) {
      [-1, 0, 1].forEach(ri => [-1, 0, 1].forEach(gi => {
        const rate = p.rate + ri * a.waccStep, terminalGrowth = p.terminalGrowth + gi * a.terminalStep;
        cells.push({ ...calculate(p, ctx.bridge, ctx.shares, 'dcf_' + ri + '_' + gi, 'WACC / terminal-growth case', {rate, terminalGrowth}),
          row: ri + 1, column: gi + 1, rate, terminalGrowth });
      }));
    }
    const dcf = method('dcf', 'DCF · WACC and terminal growth', cells, base.value, dcfNotes, errors);

    const peErrors = bandErrors(a, 'peLow', 'peHigh', 'P/E');
    if (!finite(a.eps) || a.eps <= 0) peErrors.push('P/E needs positive, finite EPS in the price currency.');
    if (a.epsClassVerified !== true) peErrors.push('Confirm that EPS and the entered-price share class match.');
    const peCases = peErrors.length ? [] : selectedMultiples(a.peLow, a.peHigh).map(c => {
      const value = a.eps * c.multiple, ok = finite(value);
      return { ...c, ok, value: ok ? value : null, errors: ok ? [] : ['The selected P/E value exceeds the numeric range.'] };
    });
    const pe = method('pe', 'P/E band', peCases, null,
      ['Visitor-selected multiples, not observed peer comparables. EPS must match the entered-price class.'], peErrors);
    pe.selectedBand = {low: a.peLow ?? null, high: a.peHigh ?? null, unit: 'times'};

    const evErrors = bandErrors(a, 'evLow', 'evHigh', 'EV/EBITDA');
    if (!finite(a.ebitda) || a.ebitda <= 0) evErrors.push('EV/EBITDA needs positive, finite comparable operating EBITDA.');
    if (!finite(ctx.shares) || ctx.shares <= 0) evErrors.push('Enter positive current share equivalents.');
    const claims = M.claims(isObject(ctx.bridge) ? ctx.bridge : {});
    if (!claims.ok) evErrors.push(...claims.errors);
    if (financial(ctx)) evErrors.push('Generic EV/EBITDA does not apply to financial companies.');
    const evCases = evErrors.length ? [] : selectedMultiples(a.evLow, a.evHigh).map(c => {
      const enterprise = a.ebitda * c.multiple, e = M.equity(enterprise, ctx.bridge, ctx.shares);
      return { ...c, enterprise, e, ok: e.ok, value: e.ok ? e.perShare : null, errors: e.ok ? [] : e.errors };
    });
    const evNotes = ['Visitor-selected multiples, not observed peer comparables. The same debt, cash and other claims bridge is used.'];
    if (evCases.some(c => c.ok && c.e.residual < 0)) evNotes.push('Claims exceed asset value in at least one case. Limited liability floors equity at zero.');
    const ev = method('ev_ebitda', 'EV/EBITDA band', evCases, null, evNotes, evErrors);
    ev.selectedBand = {low: a.evLow ?? null, high: a.evHigh ?? null, unit: 'times'};
    return { base, methods: [dcf, pe, ev] };
  }

  function drivers(ctx, a = {}) {
    ctx = ctx || {};
    a = isObject(a) ? a : {};
    const base = baseCase(ctx), p = ctx.p || {};
    const definitions = [
      {id: 'wacc', label: 'WACC', key: 'rate', stepKey: 'waccStep', operating: false},
      {id: 'growth', label: 'Revenue growth · years 1–5', key: 'growth', stepKey: 'growthStep', operating: true},
      {id: 'margin', label: 'Year 10 EBIT margin', key: 'targetMargin', stepKey: 'marginStep', operating: true},
      {id: 'terminal', label: 'Terminal growth', key: 'terminalGrowth', stepKey: 'terminalStep', operating: false},
      {id: 'capex', label: 'Capex / revenue', key: 'capexRatio', stepKey: 'capexStep', operating: true},
      {id: 'working_capital', label: 'Working capital / revenue', key: 'wcRatio', stepKey: 'wcStep', operating: true}
    ];
    const rows = definitions.map(def => {
      const errors = [stepError(a, def.stepKey, def.label)].filter(Boolean);
      if (!base.ok) errors.push(...base.errors);
      if (isAnnual(p) && def.operating) errors.push('This generated operating driver is disabled while annual overrides are active.');
      const step = finite(a[def.stepKey]) ? a[def.stepKey] : null;
      const cases = [-1, 1].map(direction => {
        const id = direction < 0 ? 'minus' : 'plus', name = (direction < 0 ? 'Decrease ' : 'Increase ') + def.label;
        const result = errors.length ? unavailableCase(id, name, unique(errors)) :
          calculate(p, ctx.bridge, ctx.shares, id, name, {[def.key]: p[def.key] + direction * step});
        return { ...result, direction, inputKey: def.key,
          inputValue: errors.length ? null : p[def.key] + direction * step,
          delta: result.ok && base.ok ? result.value - base.value : null };
      });
      const valid = cases.filter(c => c.ok), invalid = cases.filter(c => !c.ok);
      const allErrors = unique([...errors, ...invalid.flatMap(c => c.errors)]);
      const notes = ['One input changes at a time. Minus and plus refer to the input, not to value direction.'];
      if (def.id === 'wacc' && p.terminalRocTracksWacc === true) notes.push('Terminal return on capital follows WACC under the selected stable-return assumption.');
      if (def.id === 'working_capital') notes.push('The ratio changes both opening working capital and the generated forecast. Only working-capital changes enter cash flow.');
      if (def.id === 'capex') notes.push(p.capexFade === true ? 'This changes the ratio of years 1–5. Capex above depreciation still returns to depreciation by year 10. Terminal reinvestment follows growth / return on capital.' : 'This changes the explicit forecast only. Terminal reinvestment still follows growth / return on capital.');
      if (invalid.length) notes.push('Invalid or disabled sides are retained without clipping their inputs.');
      const sorted = valid.slice().sort((x, y) => x.value - y.value);
      return {id: def.id, label: def.label, status: !valid.length ? 'unavailable' : invalid.length ? 'partial' : 'available',
        step, base: base.value, minus: cases[0], plus: cases[1],
        low: valid.length ? sorted[0].value : null, high: valid.length ? sorted[sorted.length - 1].value : null,
        lowCase: sorted[0] || null, highCase: sorted[sorted.length - 1] || null,
        deltaLow: valid.length ? Math.min(0, ...valid.map(c => c.delta)) : null,
        deltaHigh: valid.length ? Math.max(0, ...valid.map(c => c.delta)) : null,
        impact: valid.length ? Math.max(...valid.map(c => Math.abs(c.delta))) : null,
        errors: allErrors, reason: allErrors.length ? allErrors.join(' ') : null, notes};
    });
    rows.sort((x, y) => (y.impact == null ? -Infinity : y.impact) - (x.impact == null ? -Infinity : x.impact));
    return {base, rows};
  }

  function expectations(ctx) {
    ctx = ctx || {};
    const base = baseCase(ctx), p = ctx.p || {};
    const fail = errors => ({ok: false, errors: unique(errors), reason: unique(errors).join(' '),
      price: finite(ctx.price) ? ctx.price : null, targetEnterprise: null, base, implied: null,
      growth: null, deltaGrowth: null, comparison: []});
    if (!base.ok) return fail(base.errors);
    if (!finite(ctx.price) || ctx.price <= 0 || !finite(ctx.shares) || ctx.shares <= 0) return fail(['Enter positive price and current share equivalents.']);
    const claims = M.claims(isObject(ctx.bridge) ? ctx.bridge : {});
    if (!claims.ok) return fail(claims.errors);
    const targetEnterprise = ctx.price * ctx.shares + claims.net;
    if (!finite(targetEnterprise)) return fail(['The price and the claims exceed the numeric range.']);
    // The search needs a business value above zero. A price this low leaves none after the cash and investments.
    // A growth rate can still give such a price. The search does not look for it, and no view may say that none exists.
    if (targetEnterprise <= 0) return fail(['At this price the shares and the claims are not worth more than the cash and investments. The growth search needs a business value above zero.']);
    const q = parameters(p), result = M.reverse(q, targetEnterprise);
    // solutions is a list only when the search ran: empty for no growth rate in the range, longer for several.
    if (!result.ok) return {...fail(result.errors), targetEnterprise, solutions: result.solutions};
    const implied = calculate(q, ctx.bridge, ctx.shares, 'implied', 'Growth implied by the entered price', {growth: result.growth});
    if (!implied.ok) return {...fail(implied.errors), targetEnterprise};
    return {ok: true, errors: [], reason: null, price: ctx.price, targetEnterprise, base, implied,
      growth: result.growth, deltaGrowth: result.growth - q.growth,
      comparison: base.d.rows.map((r, i) => ({year: r.t, baseRevenue: r.revenue, impliedRevenue: implied.d.rows[i].revenue})),
      notes: ['The solver changes years 1–5 revenue growth only. All other assumptions remain fixed.',
        'The search range is −50% to 100% annual growth. This is an implied expectation, not a prediction.']};
  }

  // Cross-checks that a reader uses to judge a DCF: the weight of the terminal value, the multiple it implies,
  // the scale of the forecast, and the discount rate that the entered price implies.
  function sanity(ctx) {
    ctx = ctx || {};
    const base = baseCase(ctx), p = ctx.p || {};
    if (!base.ok) return {ok: false, errors: base.errors, reason: base.errors.join(' ')};
    const d = base.d, last = d.rows[d.rows.length - 1], exitEbitda = last.ebit + last.da;
    const out = {ok: true, errors: [], requiredRate: p.rate, terminalShare: d.terminalShare,
      exitEvEbitda: exitEbitda > 0 ? d.terminalValue / exitEbitda : null,
      revenueMultiple: last.revenue / p.revenue,
      currentEvEbitda: null, impliedRate: null, impliedRateReason: null};
    const claims = M.claims(isObject(ctx.bridge) ? ctx.bridge : {}), a = isObject(ctx.analysis) ? ctx.analysis : {};
    if (claims.ok && finite(ctx.price) && ctx.price > 0 && finite(ctx.shares) && ctx.shares > 0 && finite(a.ebitda) && a.ebitda > 0) {
      out.currentEvEbitda = (ctx.price * ctx.shares + claims.net) / a.ebitda;
    }
    const implied = M.impliedRate(parameters(p), ctx.bridge, ctx.shares, ctx.price);
    if (implied.ok) out.impliedRate = implied.rate; else out.impliedRateReason = implied.errors.join(' ');
    return out;
  }

  /* The one figure that the result strip shows for "the price implies": the growth rate, or failing that the
     discount rate. why says truthfully why no growth rate is shown.
     growthSays and rateSays give the same reasons as sentences, for a view that shows no figure. Each is null when
     its figure exists. A search that did not run is not a search that found nothing: only a completed growth search
     gives "no growth rate" or "more than one". The rate sentence is the reason of the rate search itself. */
  function priceImplies(implied, checks) {
    const rate = checks && checks.ok && finite(checks.impliedRate) ? checks.impliedRate : null;
    const rateSays = rate != null ? null : (checks && checks.ok && checks.impliedRateReason) || 'The discount-rate search did not run.';
    if (implied && implied.ok) return {kind: 'growth', value: implied.growth, rate, why: null, growthSays: null, rateSays};
    const found = implied && Array.isArray(implied.solutions) ? implied.solutions.length : null;
    const why = found > 1 ? 'more than one growth rate fits' : found === 0 ? 'no growth rate from −50% to 100% fits' : 'no growth rate is available';
    const growthSays = found > 1 ? 'More than one growth rate gives this price.' : found === 0 ? 'No growth rate from −50% to 100% gives this price.' : 'The growth search did not run.';
    return {kind: rate == null ? null : 'rate', value: rate, rate, why, growthSays, rateSays};
  }

  return {scenarios, ranges, drivers, expectations, sanity, priceImplies};
});
