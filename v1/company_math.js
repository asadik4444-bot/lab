/* Company room valuation maths (SPEC-company.md). Pure functions, no DOM; unit-tested in company_math.test.mjs.
   Two-stage DCF on unlevered FCF: revenue grows at g1 for years 1-5, fades linearly to terminal growth by year 10;
   UFCF = revenue x margin; Gordon terminal value on year-10 UFCF. A hypothetical model on stated assumptions. */
(function (root) {
  'use strict';
  var YEARS = 10, STAGE1 = 5;

  function growthPath(g1, terminal) {
    var path = [];
    for (var t = 1; t <= YEARS; t++) {
      path.push(t <= STAGE1 ? g1 : g1 + (terminal - g1) * (t - STAGE1) / (YEARS - STAGE1));
    }
    return path;
  }

  /* p = {revenue, growth, margin, rate, terminal}. Returns null when the inputs cannot give a value. */
  function dcf(p) {
    if (!(p.revenue > 0) || !isFinite(p.growth) || !isFinite(p.margin) || !(p.rate > p.terminal) || !(p.rate > -1)) {
      return null;
    }
    var path = growthPath(p.growth, p.terminal), revenue = p.revenue, ufcf = [], pv = [], sum = 0;
    for (var t = 1; t <= YEARS; t++) {
      revenue = revenue * (1 + path[t - 1]);
      var cash = revenue * p.margin, discounted = cash / Math.pow(1 + p.rate, t);
      ufcf.push(cash); pv.push(discounted); sum += discounted;
    }
    var tv = ufcf[YEARS - 1] * (1 + p.terminal) / (p.rate - p.terminal);
    var pvTv = tv / Math.pow(1 + p.rate, YEARS);
    return { growthPath: path, ufcf: ufcf, pv: pv, sumPv: sum, terminalValue: tv, pvTerminal: pvTv, ev: sum + pvTv };
  }

  /* Claims between enterprise and equity value; null items count as 0 and are listed by the caller. */
  function netClaims(b) {
    var v = function (x) { return x == null ? 0 : x; };
    return v(b.debt) + v(b.finance_leases) + v(b.nci) - v(b.cash) - v(b.short_term_investments);
  }

  function perShare(ev, bridge, shares) {
    if (ev == null || !(shares > 0)) return null;
    return (ev - netClaims(bridge)) / shares;
  }

  /* Discount rate +/- 1 pp gives the range; the central case sits inside it. */
  function valueRange(p, bridge, shares, step) {
    step = step == null ? 0.01 : step;
    var mid = dcf(p), low = dcf(Object.assign({}, p, { rate: p.rate + step })),
        high = dcf(Object.assign({}, p, { rate: p.rate - step }));
    if (!mid || !low || !high) return null;
    return {
      ev: { low: low.ev, mid: mid.ev, high: high.ev },
      perShare: { low: perShare(low.ev, bridge, shares), mid: perShare(mid.ev, bridge, shares),
                  high: perShare(high.ev, bridge, shares) },
      central: mid
    };
  }

  /* Years 1-5 growth that makes the DCF equal targetEv (bisection; EV rises with growth when margin > 0). */
  function reverseGrowth(p, targetEv, lo, hi) {
    lo = lo == null ? -0.5 : lo; hi = hi == null ? 1.0 : hi;
    if (!(targetEv > 0) || !(p.margin > 0)) return null;
    var f = function (g) { var r = dcf(Object.assign({}, p, { growth: g })); return r ? r.ev - targetEv : NaN; };
    var flo = f(lo), fhi = f(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo > 0 || fhi < 0) return null;
    for (var i = 0; i < 100; i++) {
      var mid = (lo + hi) / 2, fm = f(mid);
      if (Math.abs(fm) <= targetEv * 1e-9) return mid;
      if (fm < 0) { lo = mid; } else { hi = mid; }
    }
    return (lo + hi) / 2;
  }

  /* Growth x margin grid of value per share; steps in fractions; margins floored at 1%. */
  function grid(p, bridge, shares, growthSteps, marginSteps) {
    return growthSteps.map(function (dg) {
      return marginSteps.map(function (dm) {
        var q = Object.assign({}, p, { growth: p.growth + dg, margin: Math.max(0.01, p.margin + dm) });
        var r = dcf(q);
        return r ? { growth: q.growth, margin: q.margin, ev: r.ev, perShare: perShare(r.ev, bridge, shares) } : null;
      });
    });
  }

  var api = { YEARS: YEARS, STAGE1: STAGE1, growthPath: growthPath, dcf: dcf, netClaims: netClaims, perShare: perShare,
              valueRange: valueRange, reverseGrowth: reverseGrowth, grid: grid };
  if (typeof module === 'object' && module.exports) { module.exports = api; } else { root.CompanyMath = api; }
})(typeof window !== 'undefined' ? window : this);
