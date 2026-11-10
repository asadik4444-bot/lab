/* Buyout maths (SPEC-buyout.md). Pure functions, no DOM; tested in lbo_math.test.cjs.
   A hypothetical, generic company: annual model, end-of-year cash flows. Money is in $m.
   p = {ebitda0, entry, leverage, rate, growth, conversion, exit, years} (rate, growth, conversion as fractions). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LboMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function fin(v) { return typeof v === 'number' && isFinite(v); }

  /* Returns null when the inputs cannot give a result: non-finite, EBITDA <= 0, years < 1,
     or debt at entry that is not below the purchase price (leverage >= entry). */
  function lbo(p) {
    if (!p) return null;
    var keys = ['ebitda0', 'entry', 'leverage', 'rate', 'growth', 'conversion', 'exit', 'years'];
    for (var k = 0; k < keys.length; k++) if (!fin(p[keys[k]])) return null;
    var years = Math.round(p.years);
    if (!(p.ebitda0 > 0) || !(p.entry > 0) || !(p.exit >= 0) || p.leverage < 0 || years < 1 || p.leverage >= p.entry) return null;

    var evIn = p.entry * p.ebitda0, debt0 = p.leverage * p.ebitda0, equityIn = evIn - debt0;
    if (!(equityIn > 0)) return null;

    var rows = [], ebitda = p.ebitda0, debt = debt0, cash = 0, t;
    for (t = 1; t <= years; t++) {
      ebitda = ebitda * (1 + p.growth);
      var interest = p.rate * debt, fcf = p.conversion * ebitda - interest;
      if (fcf >= 0) {
        var repay = Math.min(fcf, debt);
        debt = debt - repay; cash = cash + (fcf - repay);
      } else {
        debt = debt - fcf;
      }
      rows.push({ t: t, ebitda: ebitda, interest: interest, fcf: fcf, debt: debt, cash: cash });
    }
    var last = rows[rows.length - 1];
    var evOut = p.exit * last.ebitda, equityOut = evOut - last.debt + last.cash;
    var moic = equityOut / equityIn;
    return {
      ev_in: evIn, debt0: debt0, equity_in: equityIn, years: rows,
      ev_out: evOut, equity_out: equityOut, moic: moic,
      irr: equityOut > 0 ? Math.pow(moic, 1 / years) - 1 : null,
      bridge: {
        growth: (last.ebitda - p.ebitda0) * p.entry,
        multiple: (p.exit - p.entry) * last.ebitda,
        deleveraging: (debt0 - last.debt) + last.cash
      }
    };
  }

  /* IRR at exit multiple minus one turn, the same exit, and plus one turn: {low, mid, high, exits}.
     Any end can be null (equity wiped out, or an exit multiple below zero). */
  function lboRange(p, turns) {
    var d = fin(turns) ? turns : 1;
    function at(x) { var r = lbo(Object.assign({}, p, { exit: x })); return r ? r.irr : null; }
    var mid = lbo(p);
    if (!mid) return null;
    return { low: at(p.exit - d), mid: mid.irr, high: at(p.exit + d), exits: [p.exit - d, p.exit, p.exit + d] };
  }

  return { lbo: lbo, lboRange: lboRange };
});
