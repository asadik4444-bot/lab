/* Companies list model (Wave 1, 28 Nov 2026): one row per company from markets.json (filings and the ranking) and
   company_room.json (EBITDA, net debt), the sector of each company (sectors.json), sector medians and the CSV rows.
   Pure functions, no DOM; tested in companies_model.test.cjs. It adds no new figure to a company: it only reads the
   published files. A value that does not apply (banks and insurers) or is missing carries its reason; an approximate
   value carries the reason from the filing data. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompaniesModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NC = 'not comparable for banks and insurers';
  var FIN_OUT = 'bank or insurer: left out of every median';
  var MIN_FOR_MEDIAN = 3;
  /* figures that do not apply to banks and insurers (as on the company page) */
  var FIN_NC = { opMargin: 1, fcf: 1, fcfMargin: 1, capexToRevenue: 1, ebitdaMargin: 1, netDebt: 1, leverage: 1 };
  var MEDIAN_KEYS = ['revenue', 'growth', 'ebitdaMargin', 'fcfMargin', 'leverage'];
  var LABELS = {
    revenue: 'Revenue', growth: 'Revenue growth', ebitdaMargin: 'EBITDA margin', fcfMargin: 'FCF margin',
    netDebt: 'Net debt', leverage: 'Net debt / EBITDA', opMargin: 'Operating margin', fcf: 'Free cash flow',
    capexToRevenue: 'Capex / revenue', float: 'Public float', shares: 'Shares'
  };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  /* the reason of an approximate value, without a leading "approximate:" (the data often starts with it) */
  function approxWhy(a) { return String(a || '').replace(/^approximate:\s*/i, ''); }
  /* one figure: its value, or the reason why there is none; "approx" holds the reason of an approximate value */
  function fig(value, why, approx) {
    var ok = isNum(value);
    return { v: ok ? value : null, why: ok ? null : (why || 'not reported in the 10-K'), approx: ok && approx ? String(approx) : null };
  }

  function sectorIndex(sectors) {
    var byId = {};
    ((sectors && sectors.sectors) || []).forEach(function (s) { byId[s.id] = s; });
    return { byId: byId, map: (sectors && sectors.companies) || {} };
  }

  function rows(markets, room, sectors) {
    var byTicker = {};
    ((room && room.companies) || []).forEach(function (c) { byTicker[c.ticker] = c; });
    var S = sectorIndex(sectors);
    return ((markets && markets.rows) || []).map(function (r) {
      var f = r.fundamentals || {}, c = byTicker[r.ticker] || null, val = (c && c.valuation) || {};
      var fin = !!(f.financial || (c && c.financial)), reasons = f.reasons || {};
      /* a filing figure from markets.json, with the same rule as the old table: banks and insurers are n/c */
      function filed(key, src) {
        if (fin && FIN_NC[key]) return fig(null, NC);
        if (f.not_comparable && FIN_NC[key]) return fig(null, 'not comparable: ' + f.not_comparable);
        return fig(f[src], reasons[src]);
      }
      function valued(key, node, value) {
        if (fin) return fig(null, NC);
        if (!c) return fig(null, 'no valuation inputs for this company');
        node = node || {};
        return fig(value, node.reason || node.not_comparable, node.partial);
      }
      var sid = S.map[r.ticker], s = sid && S.byId[sid];
      var eb = val.ebitda || {}, lev = val.net_debt_to_ebitda || {}, nd = val.net_debt || {};
      return {
        rank: r.rank, ticker: r.ticker, name: r.name, financial: fin,
        sector: s ? s.id : null, sectorName: s ? s.name : 'Not grouped', sectorShort: s ? (s.short || s.name) : 'Not grouped',
        fyEnd: f.fy_end || null,
        filing: (f.sources && f.sources.revenue && f.sources.revenue.url) || null,
        revenue: fig(f.revenue, reasons.revenue),
        growth: fig(f.growth_yoy, reasons.growth_yoy),
        ebitdaMargin: valued('ebitdaMargin', eb, c && c.derived ? c.derived.ebitda_margin : null),
        fcfMargin: filed('fcfMargin', 'fcf_margin'),
        netDebt: valued('netDebt', nd, nd.value),
        leverage: valued('leverage', lev, lev.value),
        opMargin: filed('opMargin', 'operating_margin'),
        fcf: filed('fcf', 'fcf'),
        capexToRevenue: filed('capexToRevenue', 'capex_to_revenue'),
        float: fig(r.public_float, 'no public float on the 10-K cover'), floatEnd: r.float_end || null,
        shares: fig(r.shares, 'no share count'), sharesBasis: r.shares_basis || null, sharesEnd: r.shares_end || null,
        badges: (r.badges || []).slice(), tickerManual: r.ticker_source === 'override'
      };
    });
  }

  function median(values) {
    var a = values.filter(isNum).slice().sort(function (x, y) { return x - y; }), n = a.length;
    if (!n) return null;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }

  /* the median of each figure over the given rows: only exact values of companies other than banks and insurers count
     (the approved rule, for every figure); a missing or approximate value is left out with its reason; fewer than
     three values give no median */
  function medians(list, keys, min) {
    min = min || MIN_FOR_MEDIAN;
    var out = {};
    (keys || MEDIAN_KEYS).forEach(function (k) {
      var used = [], left = [];
      list.forEach(function (r) {
        var x = r[k];
        if (r.financial) left.push({ ticker: r.ticker, why: FIN_OUT });
        else if (!x || x.v == null) left.push({ ticker: r.ticker, why: x ? x.why : 'not reported' });
        else if (x.approx) left.push({ ticker: r.ticker, why: 'approximate: ' + approxWhy(x.approx) });
        else used.push(r);
      });
      var m = { n: used.length, used: used.map(function (r) { return r.ticker; }), left: left };
      if (used.length >= min) m.v = median(used.map(function (r) { return r[k].v; }));
      else { m.v = null; m.why = 'fewer than ' + min + ' comparable companies (' + used.length + ')'; }
      out[k] = m;
    });
    return out;
  }

  /* the notes of one row, in words: missing and approximate figures, and the data-quality flags */
  function notes(r, badgeWords) {
    var out = [];
    ['revenue', 'growth', 'ebitdaMargin', 'fcfMargin', 'netDebt', 'leverage', 'opMargin', 'fcf', 'capexToRevenue'].forEach(function (k) {
      var x = r[k];
      if (x.v == null) out.push(LABELS[k] + ': ' + x.why);
      else if (x.approx) out.push(LABELS[k] + ': approximate (' + approxWhy(x.approx) + ')');
    });
    r.badges.forEach(function (b) { out.push((badgeWords && badgeWords[b]) || b); });
    if (r.tickerManual) out.push('Ticker added manually');
    if (!r.sector) out.push('Sector: not grouped yet');
    return out;
  }

  /* CSV columns: units in the header, ratios as fractions, money in US dollars; empty cell = see Notes */
  function round(v, d) { return isNum(v) ? Math.round(v * Math.pow(10, d)) / Math.pow(10, d) : null; }
  var CSV = [
    ['Rank by public float', function (r) { return r.rank; }],
    ['Ticker', function (r) { return r.ticker; }],
    ['Company', function (r, o) { return o.name ? o.name(r.name) : r.name; }],
    ['Sector (our grouping)', function (r) { return r.sectorName; }],
    ['Fiscal year end', function (r) { return r.fyEnd; }],
    ['Revenue (USD)', function (r) { return r.revenue.v; }],
    ['Revenue growth (fraction)', function (r) { return round(r.growth.v, 6); }],
    ['EBITDA margin (fraction)', function (r) { return round(r.ebitdaMargin.v, 6); }],
    ['FCF margin (fraction)', function (r) { return round(r.fcfMargin.v, 6); }],
    ['Net debt (USD)', function (r) { return r.netDebt.v; }],
    ['Net debt / EBITDA (x)', function (r) { return round(r.leverage.v, 4); }],
    ['Operating margin (fraction)', function (r) { return round(r.opMargin.v, 6); }],
    ['Free cash flow (USD)', function (r) { return r.fcf.v; }],
    ['Capex / revenue (fraction)', function (r) { return round(r.capexToRevenue.v, 6); }],
    ['Public float (USD)', function (r) { return r.float.v; }],
    ['Public float date', function (r) { return r.floatEnd; }],
    ['Shares', function (r) { return r.shares.v; }],
    ['Share count basis', function (r) { return r.sharesBasis; }],
    ['Share count date', function (r) { return r.sharesEnd; }],
    ['Notes', function (r, o) { return notes(r, o.badges).join('; '); }],
    ['10-K filing', function (r) { return r.filing; }],
    ['Data as of', function (r, o) { return o.asOf || null; }]
  ];
  function csvTable(list, o) {
    o = o || {};
    return { header: CSV.map(function (c) { return c[0]; }), rows: list.map(function (r) { return CSV.map(function (c) { return c[1](r, o); }); }) };
  }

  return { NC: NC, FIN_OUT: FIN_OUT, approxWhy: approxWhy, MIN_FOR_MEDIAN: MIN_FOR_MEDIAN, MEDIAN_KEYS: MEDIAN_KEYS, LABELS: LABELS, rows: rows, median: median,
    medians: medians, notes: notes, csvTable: csvTable };
});
