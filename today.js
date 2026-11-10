/* Today: three sentences, each a door to its page. Sentences and headline figures come from today.json (written by the pipeline);
   the charts read the room files; nothing is recomputed here. */
(function () {
  'use strict';
  var L = Lab, el = L.el, $ = L.$;
  L.shell({ page: 'today' });

  var MH = window.innerWidth <= 620 ? 40 : 72;
  function fill(id, o) {
    var d = $(id);
    d.querySelector('.dsent').textContent = o.sentence;
    var fr = d.querySelector('.frow'); fr.textContent = '';
    fr.appendChild(el('span', { 'class': 'big' }, L.tipLabel(o.big, o.note)));
    if (o.chip) fr.appendChild(o.chip);
    if (o.of) fr.appendChild(el('span', { 'class': 'of' }, o.of));
    d.querySelector('.stamp').textContent = o.stamp;
    return d.querySelector('.dchart');
  }
  function figText(f) { return f.unit === '%' ? L.num(f.value, 1) + '%' : L.num(f.value); }
  function note(s, status, extra) {
    return { title: s.figure.label, def: s.text, formula: extra.formula, working: figText(s.figure) + (s.figure.unit && s.figure.unit !== '%' ? ' ' + s.figure.unit : '') + '. ' + extra.working, source: extra.source + ' Data as of ' + L.date(s.as_of) + '.', href: null, more: 'method.html#' + s.id };
  }

  Promise.all([L.load('today'), L.load('macro_room'), L.load('deals_room'), L.load('company_room')]).then(function (r) {
    var today = r[0], macro = r[1], deals = r[2], co = r[3], S = {};
    today.sentences.forEach(function (s) { S[s.id] = s; });
    L.status();

    /* Companies */
    var s1 = S.companies, g = co.companies.map(function (c) { return { c: c, v: c.fundamentals.growth_yoy.value }; }).filter(function (x) { return L.isNum(x.v); });
    var ends = co.companies.map(function (c) { return c.fy && c.fy.end; }).filter(Boolean).sort();
    var ch1 = fill('d-co', {
      sentence: s1.text, big: figText(s1.figure), of: s1.figure.label,
      note: note(s1, null, { formula: 'count of companies with revenue / revenue_prior − 1 above zero, among those with both years', working: 'Each dot below is one company, ranked by SEC public float.', source: 'SEC 10-K filings.' }),
      stamp: 'Fiscal years to ' + L.month(ends[0]) + '–' + L.month(ends[ends.length - 1]) + ' · SEC'
    });
    L.dots(ch1, g.map(function (x) { return { on: x.v > 0, title: L.shortName(x.c.name), def: 'Revenue ' + L.pctS(x.v) + ' in the fiscal year to ' + L.date(x.c.fy.end) }; }), { name: 'Companies whose revenue grew', rows: 3, h: MH });

    /* Financing */
    var s2 = S.financing, det = macro.headline.detail, dpp = det.change_1y_pp, ser = macro.series.filter(function (x) { return x.id === det.series; })[0];
    var ch2 = fill('d-fin', {
      sentence: s2.text, big: figText(s2.figure), chip: L.chg(dpp, L.pp(dpp)), of: 'vs a year ago',
      note: note(s2, null, { formula: 'change = latest value − value a year earlier', working: L.pp(dpp) + ' against ' + L.month(det.from) + '.', source: (ser ? ser.credit : 'ECB') + '.' }),
      stamp: s2.figure.label + ' · ECB'
    });
    if (ser && ser.spark) L.spark(ch2, ser.spark.map(function (p) { return { label: L.month(p.period), v: p.value }; }), { name: ser.label, h: MH, fmt: function (v) { return L.num(v, 2) + '%'; } });

    /* Deals */
    var s3 = S.deals, dh = deals.headline;
    var ch3 = fill('d-deals', {
      sentence: s3.text, big: figText(s3.figure), chip: L.chg(dh.change, L.pctS(dh.change)), of: 'vs ' + L.num(dh.year_earlier) + ' a year earlier',
      note: note(s3, null, { formula: 'proxies + tender offers in the window; change = this window / same window a year earlier − 1', working: L.pctS(dh.change) + ' against ' + L.num(dh.year_earlier) + ' in ' + L.month(dh.compare_from) + ' to ' + L.month(dh.compare_to) + '.', source: 'SEC EDGAR; SPAC mergers are shown separately.' }),
      stamp: L.month(dh.from).slice(0, 3) + '–' + L.month(dh.to) + ' · SEC'
    });
    var months = deals.monthly.filter(function (m) { return m.month <= dh.to; });
    L.columns(ch3, months.map(function (m) { return { label: L.month(m.month), v: m.proxies + m.tenders, hi: m.month >= dh.from }; }), { name: 'Merger proxies and tender offers filed per month', h: MH, mobileBars: 12, fmt: function (c) { return L.num(c.v) + ' filings'; } });

    var t = $('try');
    ['AAPL', 'MSFT', 'JPM'].forEach(function (tk) {
      var c = co.companies.filter(function (x) { return x.ticker === tk; })[0];
      if (c) t.appendChild(el('a', { href: 'company.html?c=' + tk + '#value' }, L.shortName(c.name) + ' →'));
    });
    t.appendChild(el('a', { href: 'companies.html' }, 'All ' + co.companies.length + ' →'));
  }).catch(L.fail);
})();
