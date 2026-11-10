/* Financing: is deal financing getting easier or harder? One sentence, four figures, two curves, then two tabs of series. */
(function () {
  'use strict';
  var L = Lab, el = L.el, $ = L.$, MINUS = L.MINUS;
  L.shell({ page: 'financing' });
  var TIGHT_PP = 0.05; /* a rate move under 5 basis points is "little changed" */
  var PRICES = ['ecb_deposit_rate', 'estr', 'us_effr', 'us_sofr', 'ea_nfc_borrowing_cost', 'us_treasury_2y', 'us_treasury_10y', 'ea_aaa_yield_2y', 'ea_aaa_yield_10y', 'ea_bls_credit_standards_ent', 'ea_ciss'];
  var D, byId = {};

  function period(p) { p = String(p); return /^\d{4}-\d{2}$/.test(p) ? L.month(p) : (/^\d{4}-Q\d$/.test(p) ? p.slice(5) + ' ' + p.slice(0, 4) : (/^\d{4}-\d{2}-\d{2}$/.test(p) ? L.date(p) : p)); }
  function fmtVal(s) {
    var v = s.latest.value, a = Math.abs(v);
    if (s.kind === 'rate' || s.kind === 'pct') return L.num(v, 2) + '%';
    if (s.kind === 'stress') return L.num(v, 3);
    if (s.kind === 'points') return L.num(v, 1);
    return a < 10 ? L.num(v, 4) : (a < 1000 ? L.num(v, 1) : L.num(v, 0));
  }
  function signed(v, d, u) { var t = L.num(Math.abs(v), d); return (+t === 0 ? '' : (v > 0 ? '+' : MINUS)) + t + (u || ''); }
  function fmtChange(c) {
    if (c.unit === 'pp') return signed(c.value, 2, ' pp');
    if (c.unit === '%') return signed(c.value * 100, Math.abs(c.value * 100) < 0.1 ? 2 : 1, '%'); /* fractions in the file */
    if (c.unit === 'points') return signed(c.value, 1, ' pts');
    if (c.unit === 'index') return signed(c.value, 3, '');
    return signed(c.value, 2, ' ' + c.unit);
  }
  /* what a move means for deal financing, in words (colour follows direction only) */
  function meaning(c, sign) {
    if (!c || sign !== 'lower_is_easier') return '';
    if (c.unit === 'pp' && Math.abs(c.value) < TIGHT_PP) return 'little changed';
    return c.value < 0 ? 'easier' : (c.value > 0 ? 'harder' : 'little changed');
  }
  function chip(c, sign, withWord) {
    var t = fmtChange(c), w = meaning(c, sign), zero = !/[1-9]/.test(t), n = el('span', null, L.chg(zero ? 0 : c.value, t, { neutral: true }));
    if (withWord && w) n.appendChild(el('span', { 'class': 'mw' }, ' ' + w));
    return n;
  }
  function seriesNote(s) {
    var ch = s.change_1y;
    return { title: s.label, def: s.title + '.', formula: 'change = latest value − value a year earlier' + (s.financing_sign ? '; for this series a lower value means easier financing' : '; shown without a financing meaning'), working: fmtVal(s) + ' in ' + period(s.latest.period) + (ch ? '; ' + fmtChange(ch) + ' against ' + period(ch.from) + (meaning(ch, s.financing_sign) ? ', so ' + meaning(ch, s.financing_sign) : '') : '') + '.', source: s.credit, href: null, more: 'method.html#financing' };
  }

  function headline() {
    var signed_ = D.series.filter(function (s) { return s.financing_sign === 'lower_is_easier' && s.change_1y; });
    var tight = 0, eased = 0;
    signed_.forEach(function (s) { var m = meaning(s.change_1y, s.financing_sign); if (m === 'harder') tight++; else if (m === 'easier') eased++; });
    var K = signed_.length, state = tight / K >= 0.6 ? 'harder' : (eased / K >= 0.6 ? 'easier' : 'about the same');
    $('f-title').textContent = state === 'about the same'
      ? 'Deal financing is about the same as a year ago: ' + tight + ' of ' + K + ' measures tightened and ' + eased + ' eased.'
      : 'Deal financing is ' + state + ' than a year ago: ' + (state === 'harder' ? tight : eased) + ' of ' + K + ' measures ' + (state === 'harder' ? 'tightened' : 'eased') + '.';
    var h = D.headline, d = h.detail, ds = byId[d.series];
    $('f-second').textContent = h.text + (ds ? ' ' + L.num(d.latest.value, 1) + '% in ' + period(d.latest.period) + ', ' + signed(d.change_1y_pp, 1, ' pp') + ' against ' + period(d.from) + '.' : '');
    var rule = L.tipLabel('How "harder" is decided', { title: 'The rule behind the sentence', def: 'Each rate, yield, borrowing cost, lending standard and stress measure is compared with a year earlier. A rise of more than 0.05 pp counts as tighter, a fall as easier. Financing is called harder when at least 60% of the measures tightened, easier when at least 60% eased, otherwise about the same.', working: tight + ' tightened, ' + eased + ' eased, ' + (K - tight - eased) + ' little changed, of ' + K + '.', source: 'macro_room.json, financing_sign and change_1y of each series.', more: 'method.html#financing' });
    $('f-second').appendChild(document.createTextNode(' ')); $('f-second').appendChild(el('small', { style: 'font:400 14px/20px var(--sans);color:var(--ink-2)' }, rule));
  }
  function figures() {
    var f = $('figs'); f.textContent = '';
    D.key_figures.forEach(function (id) {
      var s = byId[id]; if (!s) return;
      f.appendChild(el('div', { 'class': 'fig' }, [el('span', { 'class': 'fl' }, L.tipLabel(s.label, seriesNote(s))), el('span', { 'class': 'fv' }, fmtVal(s)), el('span', { 'class': 'fs' }, s.change_1y ? [chip(s.change_1y, s.financing_sign, true), ' vs ' + period(s.change_1y.from)] : period(s.latest.period))]));
    });
  }
  function mat(id) { var m = /_(\d+[my])$/.exec(id); return m ? m[1] : id; }
  function curves() {
    var sp = D.spreads || [];
    function who(s) { return s.inputs && /^us_/.test(s.inputs[0]) ? 'US 10y ' + MINUS + ' 2y' : 'euro AAA 10y ' + MINUS + ' 2y'; }
    var state = function (v) { return v < 0 ? 'inverted' : 'upward'; };
    var vals = sp.map(function (s) { return who(s) + ' = ' + signed(s.value, 2, ' pp'); }).join(', ');
    $('curve-title').textContent = sp.length === 2 && state(sp[0].value) === state(sp[1].value) ? 'Both curves ' + (sp[0].value < 0 ? 'are inverted' : 'slope upward') + ': ' + vals + '.' : sp.map(function (s) { return who(s) + ' is ' + state(s.value); }).join(', ') + ': ' + vals + '.';
    var host = $('curves'); host.textContent = '';
    [['US Treasury yield curve', ['us_treasury_3m', 'us_treasury_2y', 'us_treasury_10y']], ['Euro-area AAA yield curve', ['ea_aaa_yield_2y', 'ea_aaa_yield_10y']]].forEach(function (d) {
      var ser = d[1].map(function (id) { return byId[id]; }).filter(Boolean), box = el('div'), ch = el('div', { 'class': 'chart' });
      box.appendChild(el('h3', { 'class': 'box-t' }, d[0] + ', today and a year ago')); box.appendChild(ch);
      var credits = ser.map(function (s) { return s.credit.replace(/^Source: /, ''); }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      box.appendChild(el('p', { 'class': 'cap' }, 'Yield, % a year. One year ago = latest value minus its 1-year change. As of ' + period(ser[ser.length - 1].latest.period) + '. Source: ' + credits.join('; ') + '.'));
      host.appendChild(box);
      L.curve(ch, { name: d[0], labels: ser.map(function (s) { return mat(s.id); }), today: ser.map(function (s) { return s.latest.value; }), ago: ser.map(function (s) { return s.latest.value - s.change_1y.value; }), fmt: function (v, dec) { return L.num(v, dec == null ? 2 : dec) + '%'; } });
    });
  }

  function table(rows, groups) {
    var t = el('table', { 'class': 'cotable stable' });
    t.appendChild(el('thead', null, el('tr', null, ['Series', 'Latest', 'Period', 'Short change', '1-year change', 'Trend, 2 years'].map(function (h, i) { return el('th', { scope: 'col', 'class': i === 1 || i === 3 || i === 4 ? 'r' : '' }, h); }))));
    var tb = el('tbody'), cur = null;
    rows.forEach(function (s) {
      if (groups && s.group !== cur) { cur = s.group; tb.appendChild(el('tr', { 'class': 'grp' }, el('th', { colspan: 6, scope: 'colgroup' }, cur))); }
      var sp = el('div', { 'class': 'sp' });
      var tr = el('tr', null, [
        el('th', { scope: 'row', 'class': 'sl' }, L.tipLabel(s.label, seriesNote(s))),
        el('td', { 'class': 'r', 'data-l': 'Latest' }, el('b', null, fmtVal(s))),
        el('td', { 'data-l': 'Period' }, period(s.latest.period)),
        el('td', { 'class': 'r', 'data-l': 'Short' }, s.change_short ? [chip(s.change_short, s.financing_sign, true), el('span', { 'class': 'muted sm' }, ' ' + s.change_short.label.replace('vs ', ''))] : el('span', { 'class': 'muted' }, 'n/a')),
        el('td', { 'class': 'r', 'data-l': '1 year' }, s.change_1y ? chip(s.change_1y, s.financing_sign, true) : el('span', { 'class': 'muted' }, 'n/a')),
        el('td', { 'class': 'tr', 'data-l': '' }, sp)]);
      tb.appendChild(tr);
      if (s.spark && s.spark.length > 1) L.spark(sp, s.spark.map(function (p) { return { label: period(p.period), v: p.value }; }), { name: s.label, h: 30, static: true, fmt: function () { return ''; } });
    });
    t.appendChild(tb); return t;
  }

  L.load('macro_room').then(function (d) {
    D = d; D.series.forEach(function (s) { byId[s.id] = s; });
    L.status();
    headline(); figures(); curves();
    var tabs = L.tabs({ list: $('tablist'), panels: $('panels'), label: 'Financing series', tabs: [{ id: 'prices', name: 'What prices a deal' }, { id: 'all', name: 'All series' }] });
    var p1 = $('panel-prices'), p2 = $('panel-all');
    p1.appendChild(el('p', { 'class': 'small', style: 'max-width:70ch;margin:0 0 12px' }, 'The eleven series a deal team reads first: policy rates, overnight rates, the cost of company borrowing, two- and ten-year yields, lending standards and the stress index. Colour follows direction (up green, down red); the words say what it means for financing.'));
    p1.appendChild(table(PRICES.map(function (id) { return byId[id]; }).filter(Boolean), false));
    p1.appendChild(el('p', { 'class': 'cap' }, 'Latest value, change against one month and one year earlier, and the last two years. Hover or focus a series for its definition, formula and source.'));
    p2.appendChild(el('p', { 'class': 'small', style: 'max-width:70ch;margin:0 0 12px' }, 'All ' + D.series.length + ' series, grouped. Activity, prices and FX carry no financing meaning, so their changes show direction only.'));
    p2.appendChild(table(D.groups.reduce(function (a, g) { return a.concat(D.series.filter(function (s) { return s.group === g; })); }, []), true));
    var nl = el('ul', { 'class': 'list' });
    (D.notes || []).forEach(function (n) { nl.appendChild(el('li', null, n)); });
    nl.appendChild(el('li', null, 'Data from the hub’s cleared export, ' + D.export.series + ' series, exported ' + L.stamp(D.export.exported_at.replace('T', ' ')) + '; ' + D.export.restricted_not_shown + ' restricted benchmarks are not shown. Full credits per series are on the Method page.'));
    p2.appendChild(el('details', { 'class': 'fold', style: 'margin-top:20px' }, [el('summary', null, ['Notes and credits', el('small', null, 'how to read this page')]), el('div', { 'class': 'fold-body' }, nl)]));
    tabs.initial();
  }).catch(L.fail);
})();
