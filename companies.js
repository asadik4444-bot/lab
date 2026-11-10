/* Companies: the 50 largest US companies by SEC public float, every v1 column, sortable, plus a "who grew" view. */
(function () {
  'use strict';
  var L = Lab, el = L.el, $ = L.$;
  L.shell({ page: 'companies' });
  function basis(k) { return /cover/.test(k) ? 'cover' : (/dilut/.test(k) ? 'diluted avg' : String(k).replace(/_/g, ' ')); }
  function sh(v) { return v >= 1e9 ? L.num(v / 1e9, 2) + 'bn' : L.num(v / 1e6, 0) + 'mn'; }
  var FLAG = { shares_proxy: 'Shares: avg', shares_stale: 'Shares: old', float_stale: 'Float: old', float_scale_suspect: 'Float: scale?' };
  function f(r, k) { return r.fundamentals && !r.fundamentals.financial && !r.fundamentals.not_comparable ? r.fundamentals[k] : null; }
  function fa(r, k) { return r.fundamentals ? r.fundamentals[k] : null; }
  function pc(v) { return L.pct(v); }
  var COLS = [
    { k: 'rank', t: '#', get: function (r) { return r.rank; }, def: 'Position by SEC public float, largest first. The float is reported once a year, so the order is not a market-cap ranking.', formula: 'rank of dei:EntityPublicFloat' },
    { k: 'name', t: 'Company', get: function (r) { return r.name; } },
    { k: 'float', t: 'Public float', r: 1, get: function (r) { return r.public_float; }, def: 'The value of shares held by outsiders, as reported on the cover of the annual report at the end of the second fiscal quarter.', formula: 'EntityPublicFloat' },
    { k: 'shares', t: 'Shares', r: 1, get: function (r) { return r.shares; }, def: 'The share count, with the filing it comes from. When there is no cover count, the diluted average is used and flagged.', formula: 'cover share count, else diluted average' },
        { k: 'rev', t: 'Revenue', r: 1, bar: 1, get: function (r) { return fa(r, 'revenue'); }, fmt: L.usd, def: 'Sales for the latest fiscal year.', formula: 'as filed' },
    { k: 'g', t: 'Growth', r: 1, bar: 1, get: function (r) { return fa(r, 'growth_yoy'); }, chip: 1, def: 'Revenue against the fiscal year before. Fiscal years end on different dates.', formula: 'revenue / revenue_prior − 1' },
    { k: 'om', t: 'Op. margin', r: 1, bar: 1, get: function (r) { return f(r, 'operating_margin'); }, fmt: pc, def: 'Operating income as a share of revenue. Not comparable for banks and insurers.', formula: 'operating_income / revenue' },
    { k: 'fcf', t: 'Free cash flow', r: 1, bar: 1, get: function (r) { return f(r, 'fcf'); }, fmt: L.usd, def: 'Cash from operations less capital spending. Not comparable for banks and insurers.', formula: 'cash from operations − capex' },
    { k: 'fm', t: 'FCF margin', r: 1, bar: 1, get: function (r) { return f(r, 'fcf_margin'); }, fmt: pc, def: 'Free cash flow as a share of revenue.', formula: 'free cash flow / revenue' },
    { k: 'cx', t: 'Capex / revenue', r: 1, bar: 1, get: function (r) { return f(r, 'capex_to_revenue'); }, fmt: pc, def: 'Capital spending as a share of revenue.', formula: 'capex / revenue' }
  ];
  var S = { key: 'rank', dir: 1, q: '', view: 'table' }, M, LOGOS = {};

  function lg(r) {
    var b = el('span', { 'class': 'lg', 'aria-hidden': 'true' }), g = LOGOS[r.ticker];
    if (g && g.file) { var i = el('i'); i.style.setProperty('--lg', 'url("' + g.file + '")'); if (/^[0-9a-fA-F]{6}$/.test(g.hex || '')) i.style.background = '#' + g.hex; b.appendChild(i); }
    else b.appendChild(el('b', null, String(r.ticker).replace(/[^A-Za-z]/g, '').slice(0, 4)));
    return b;
  }
  function src(r) { return 'SEC EDGAR, as of ' + L.date(M.as_of) + (r.fundamentals ? '; 10-K fiscal year to ' + L.date(r.fundamentals.fy_end) : '') + '.'; }

  function render() {
    var q = S.q.toLowerCase();
    var rows = M.rows.filter(function (r) { return !q || r.ticker.toLowerCase().indexOf(q) >= 0 || L.niceName(r.name).toLowerCase().indexOf(q) >= 0; });
    var col = COLS.filter(function (c) { return c.k === S.key; })[0];
    rows.sort(function (a, b) { var x = col.get(a), y = col.get(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return typeof x === 'string' ? S.dir * x.localeCompare(y) : S.dir * (x - y); });
    $('ct-count').textContent = rows.length + ' of ' + M.rows.length + ' companies';
    var host = $('ct-wrap'); host.textContent = '';
    if (!rows.length) { host.appendChild(el('p', { 'class': 'lede' }, 'No company matches “' + S.q + '”. The Lab covers ' + M.rows.length + ' large US companies. Clear the search to see the list.')); return; }
    var maxv = col.bar ? Math.max.apply(null, rows.map(function (r) { return Math.abs(col.get(r) || 0); })) || 1 : 1;
    var t = el('table', { 'class': 'cotable' }), hr = el('tr');
    COLS.forEach(function (c) {
      var b = el('button', { type: 'button' }, [c.t, c.k === S.key ? el('span', { 'aria-hidden': 'true' }, S.dir < 0 ? '▼' : '▲') : null]);
      b.addEventListener('click', function () { if (S.key === c.k) S.dir = -S.dir; else { S.key = c.k; S.dir = c.k === 'name' || c.k === 'rank' ? 1 : -1; } render(); });
      if (c.def) L.tip(b, { title: c.t, def: c.def, formula: c.formula, source: 'SEC EDGAR, as of ' + L.date(M.as_of) + '.', href: null, more: 'method.html#glossary' }, { noClick: true });
      hr.appendChild(el('th', { scope: 'col', 'class': c.r ? 'r' : '', 'aria-sort': c.k === S.key ? (S.dir < 0 ? 'descending' : 'ascending') : null }, b));
    });
    t.appendChild(el('thead', null, hr));
    var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', { 'data-l': 'Rank', 'class': 'rk' }, '#' + r.rank));
      var nmc = el('td', { 'class': 'nmc' }, el('div', { 'class': 'nm' }, [lg(r), el('div', null, [el('div', null, [el('a', { href: 'company.html?c=' + encodeURIComponent(r.ticker) }, L.shortName(r.name)), ' ', el('span', { 'class': 'muted' }, r.ticker)]), el('div', { 'class': 'flags' })])]));
      tr.appendChild(nmc);
      tr.appendChild(el('td', { 'class': 'r', 'data-l': 'Float' }, [L.usd(r.public_float), el('span', { 'class': 'sub2' }, 'at ' + L.date(r.float_end))]));
      tr.appendChild(el('td', { 'class': 'r', 'data-l': 'Shares' }, [sh(r.shares), el('span', { 'class': 'sub2' }, basis(r.shares_basis) + ' ' + L.date(r.shares_end))]));
      var fl = nmc.querySelector('.flags');
      (r.badges || []).forEach(function (k) { fl.appendChild(L.tip(el('button', { type: 'button', 'class': 'flag' }, FLAG[k] || k), { title: FLAG[k] || k, def: M.badges[k] || '', source: src(r), href: null, more: 'method.html#data-quality' })); });
      if (r.ticker_source === 'override') fl.appendChild(L.tip(el('button', { type: 'button', 'class': 'flag' }, 'Ticker by hand'), { title: 'Ticker added by hand', def: 'SEC lists no ticker for this company, so one was added by hand.', source: src(r), href: null }));
      COLS.slice(4).forEach(function (k) {
        var v = k.get(r), td = el('td', { 'class': 'r', 'data-l': k.t });
        if (v == null) td.appendChild(el('span', { 'class': 'muted' }, 'n/a'));
        else { td.appendChild(k.chip ? L.chg(v, L.pctS(v)) : document.createTextNode(k.fmt(v))); if (k.k === S.key && k.bar) td.appendChild(el('span', { 'class': 'cbar', style: 'width:' + Math.max(2, Math.abs(v) / maxv * 100) + '%' })); }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); host.appendChild(t);
  }

  function growth() {
    var rows = M.rows.filter(function (r) { return L.isNum(fa(r, 'growth_yoy')); }).sort(function (a, b) { return fa(b, 'growth_yoy') - fa(a, 'growth_yoy'); });
    var host = $('ct-growth'); host.textContent = '';
    host.appendChild(el('h2', { 'class': 'vsub', style: 'margin-top:8px' }, 'Revenue growth, latest fiscal year, from highest to lowest'));
    var ch = el('div', { 'class': 'chart' }); host.appendChild(ch);
    L.diverge(ch, rows.map(function (r) { var v = fa(r, 'growth_yoy'); return { v: v, title: L.shortName(r.name) + ' ' + L.pctS(v), def: 'Revenue growth in the fiscal year to ' + L.date(r.fundamentals.fy_end) }; }), { name: 'Revenue growth by company', axis: function (t) { return L.pct(t, 0); } });
    host.appendChild(el('p', { 'class': 'cap' }, 'Revenue growth, latest fiscal year against the year before. Navy bars grew, grey bars shrank. Fiscal years end on different dates. Bars beyond the axis are clipped and marked in cashmere; hover or use the arrow keys for the true value and the company. Source: SEC EDGAR 10-K filings, as of ' + L.date(M.as_of) + '.'));
  }

  Promise.all([L.load('markets'), L.load('assets/logos/logos.json')]).then(function (r) {
    M = r[0]; LOGOS = r[1] || {}; L.status();
    var g = M.rows.map(function (x) { return fa(x, 'growth_yoy'); }).filter(L.isNum), up = g.filter(function (v) { return v > 0; }).length, down = g.filter(function (v) { return v < 0; }).length;
    $('ct-title').textContent = up + ' of the ' + M.rows.length + ' largest US companies by public float grew revenue; ' + down + ' shrank' + (g.length - up - down ? ' and ' + (g.length - up - down) + ' were flat.' : '.');
    var fa_ = M.facts;
    $('ct-second').textContent = 'The top three, ' + fa_.top3_names.map(L.shortName).join(', ') + ', hold ' + L.usd(fa_.top3_float) + ' of public float' + (fa_.top3_exceeds_bottom25 ? ', more than the bottom 25 together at ' + L.usd(fa_.bottom25_float) + '.' : '; the bottom 25 hold ' + L.usd(fa_.bottom25_float) + '.');
    var lead = $('leaders'); lead.textContent = '';
    [['Highest revenue growth', 'growth_yoy', L.pctS], ['Highest operating margin', 'operating_margin', pc], ['Highest FCF margin', 'fcf_margin', pc]].forEach(function (x) {
      var best = null; M.rows.forEach(function (rw) { var v = f(rw, x[1]); if (L.isNum(v) && (!best || v > f(best, x[1]))) best = rw; });
      if (best) lead.appendChild(el('li', null, [el('span', { 'class': 'lk' }, x[0]), el('span', { 'class': 'lrow' }, [lg(best), el('b', null, best.ticker), el('span', null, x[2](f(best, x[1])))])]));
    });
    var c = M.counts, ul = el('ul', { 'class': 'list' });
    [c.ranked + ' companies are ranked by SEC public float, from a pool of ' + c.pool + ' filings.', M.excluded.length + ' filings were excluded: ' + c.impossible_figures + ' with impossible figures and ' + c.other_exclusions + ' for other reasons (no listed ticker or no share count). The list is on the Method page.', c.rows_with_badges + ' of the ranked rows carry a data-quality flag.', M.cross_check.overlap + ' of ' + M.cross_check.of + ' match ' + String(M.cross_check.source).split(',')[0] + ', checked ' + L.date(M.cross_check.checked) + '.', 'The list is by SEC public float, which is reported once a year, so it is not a market-cap ranking. Source: ' + M.source + '.'].forEach(function (t) { ul.appendChild(el('li', null, t)); });
    var b = $('ct-built'); b.appendChild(el('summary', null, ['How this list is built', el('small', null, 'counts, exclusions and the cross-check'), ])); b.appendChild(el('div', { 'class': 'fold-body' }, [ul, el('a', { href: 'method.html#catches', style: 'color:var(--cash-ink);font-weight:600' }, 'See the data-quality catches on Method')]));
    document.querySelectorAll('.seg button').forEach(function (btn) { btn.addEventListener('click', function () { S.view = btn.dataset.v; document.querySelectorAll('.seg button').forEach(function (o) { o.setAttribute('aria-pressed', o === btn ? 'true' : 'false'); }); $('ct-growth').hidden = S.view !== 'growth'; $('ct-wrap').hidden = S.view !== 'table'; $('q').parentNode.hidden = false; if (S.view === 'growth') growth(); }); });
    $('q').addEventListener('input', function (e) { S.q = e.target.value.trim(); render(); });
    render();
  }).catch(L.fail);
})();
