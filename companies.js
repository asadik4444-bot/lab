/* Companies: the 50 largest US companies by SEC public float, plus a "who grew" view.
   Wave 1 (28 Nov 2026): the default columns are the ones a banker reads first (sector, revenue, growth, EBITDA margin,
   FCF margin, net debt / EBITDA); "More columns" shows the float, the shares, the operating margin, free cash flow and
   capex. A sector filter with a median row, and a CSV download of the rows in view. The rows come from
   companies_model.js, which only reads the published files. */
(function () {
  'use strict';
  var L = Lab, el = L.el, $ = L.$, CM = window.CompaniesModel, X = window.LabExport, DEFS = window.LabGlossary ? window.LabGlossary.DEFS : {};
  L.shell({ page: 'companies' });
  function basis(k) { return /cover/.test(k) ? 'cover' : (/dilut/.test(k) ? 'diluted avg' : String(k).replace(/_/g, ' ')); }
  function sh(v) { return v >= 1e9 ? L.num(v / 1e9, 2) + 'bn' : L.num(v / 1e6, 0) + 'mn'; }
  function def(key, fallback) { return DEFS[key] ? DEFS[key][1] : fallback; }
  var FLAG = { shares_proxy: 'Average share count', shares_stale: 'Older share count', float_stale: 'Older float figure', float_scale_suspect: 'Float may be mis-scaled' };
  function pc(v) { return L.pct(v); }
  /* below zero the company holds more cash than debt: say so, instead of a multiple such as "−0.0×" */
  function lev(v) { return v < 0 ? 'net cash' : L.mult(v); }
  /* old sort keys (rev, g, om, fcf, fm, cx, float, shares) stay valid, so that shared links keep their sort */
  var COLS = [
    { k: 'rank', t: '#', get: function (r) { return r.rank; }, def: 'Position by SEC public float, largest first. The float is reported once a year, so the order is not a market-cap ranking.', formula: 'rank of dei:EntityPublicFloat' },
    { k: 'name', t: 'Company', get: function (r) { return L.shortName(r.name); } },
    { k: 'sec', t: 'Sector', get: function (r) { return r.sector ? r.sectorShort : null; }, def: 'Our own grouping by each company’s main business, close to the usual sector lists. It is not an official classification.' },
    { k: 'rev', f: 'revenue', t: 'Revenue', r: 1, bar: 1, fmt: L.usd, def: 'Sales for the latest fiscal year.', formula: 'as filed' },
    { k: 'g', f: 'growth', t: 'Growth', r: 1, bar: 1, chip: 1, def: 'Revenue against the fiscal year before. Fiscal years end on different dates.', formula: 'revenue / revenue_prior − 1' },
    { k: 'em', f: 'ebitdaMargin', t: 'EBITDA margin', r: 1, bar: 1, fmt: pc, def: 'EBITDA as a share of revenue. ' + def('ebitda', '') + ' ≈ marks an approximate EBITDA. Not comparable for banks and insurers.', formula: 'EBITDA / revenue' },
    { k: 'fm', f: 'fcfMargin', t: 'FCF margin', r: 1, bar: 1, fmt: pc, ph: 1, def: 'Free cash flow as a share of revenue. Not comparable for banks and insurers.', formula: 'free cash flow / revenue' },
    { k: 'lev', f: 'leverage', t: 'Net debt / EBITDA', r: 1, fmt: lev, ph: 1, def: def('net_debt_to_ebitda', 'Net debt divided by EBITDA.') + ' Not comparable for banks and insurers.', formula: 'net debt / EBITDA' },
    { k: 'float', f: 'float', t: 'Public float (10-K cover)', r: 1, more: 1, def: 'The value of shares held by outsiders, as reported on the cover of the annual report at the end of the second fiscal quarter.', formula: 'EntityPublicFloat' },
    { k: 'shares', f: 'shares', t: 'Shares', r: 1, more: 1, def: 'The share count, with the filing it comes from. When there is no cover count, the diluted average is used and flagged.', formula: 'cover share count, else diluted average' },
    { k: 'om', f: 'opMargin', t: 'Op. margin', r: 1, bar: 1, more: 1, fmt: pc, def: 'Operating income as a share of revenue. Not comparable for banks and insurers.', formula: 'operating_income / revenue' },
    { k: 'fcf', f: 'fcf', t: 'Free cash flow', r: 1, bar: 1, more: 1, fmt: L.usd, def: 'Cash from operations less capital spending. Not comparable for banks and insurers.', formula: 'cash from operations − capex' },
    { k: 'cx', f: 'capexToRevenue', t: 'Capex / revenue', r: 1, bar: 1, more: 1, fmt: pc, def: 'Capital spending as a share of revenue.', formula: 'capex / revenue' }
  ];
  COLS.forEach(function (c) { if (c.f) c.get = function (r) { return r[c.f].v; }; });
  var S = { key: 'rank', dir: 1, q: '', view: 'table', sector: 'all', more: false }, M, ROOM, SEC, ROWS = [], LOGOS = {};

  function lg(r) {
    var b = el('span', { 'class': 'lg', 'aria-hidden': 'true' }), g = LOGOS[r.ticker];
    if (g && g.file) { var i = el('i'); i.style.setProperty('--lg', 'url("' + g.file + '")'); if (/^[0-9a-fA-F]{6}$/.test(g.hex || '')) i.style.background = '#' + g.hex; b.appendChild(i); }
    else b.appendChild(el('b', null, String(r.ticker).replace(/[^A-Za-z]/g, '').slice(0, 4)));
    return b;
  }
  function src(r) { return 'SEC EDGAR, as of ' + L.date(M.as_of) + (r.fyEnd ? '; 10-K fiscal year to ' + L.date(r.fyEnd) : '') + '.'; }
  function cols() { return COLS.filter(function (c) { return S.more || !c.more; }); }
  function sectorName(id) { var s = (SEC.sectors || []).filter(function (x) { return x.id === id; })[0]; return s ? s.name : 'Not grouped'; }
  function inSector() { return ROWS.filter(function (r) { return S.sector === 'all' || r.sector === S.sector || (S.sector === 'none' && !r.sector); }); }

  /* one figure cell: the value, "n/c" for banks and insurers, "n/a" with its reason when missing; "≈" when approximate */
  function figCell(c, r) {
    var x = r[c.f], td = el('td', { 'class': 'r' + (c.ph ? ' ph-off' : '') + (c.more ? ' more-col' : ''), 'data-l': c.t });
    if (x.v == null) {
      td.appendChild(r.financial && x.why === CM.NC ? el('span', { 'class': 'muted', title: 'Not comparable for banks and insurers' }, 'n/c') : el('span', { 'class': 'muted', title: x.why }, 'n/a'));
      return td;
    }
    if (c.f === 'float') { td.append(L.usd(x.v), el('span', { 'class': 'sub2' }, 'at ' + L.date(r.floatEnd))); return td; }
    if (c.f === 'shares') { td.append(sh(x.v), el('span', { 'class': 'sub2' }, basis(r.sharesBasis) + ' ' + L.date(r.sharesEnd))); return td; }
    if (x.approx) td.append(el('span', { 'class': 'approx', title: 'Approximate: ' + CM.approxWhy(x.approx) }, '≈'), el('span', { 'class': 'sr-only' }, 'approximately '));
    td.appendChild(c.chip ? L.chg(x.v, L.pctS(x.v)) : document.createTextNode(c.fmt(x.v)));
    if (c.f === 'leverage' && x.v < 0) td.title = 'More cash than debt: net debt / EBITDA is ' + L.mult(x.v) + '.';
    return td;
  }

  function noteButton(r) {
    var words = r.badges.map(function (k) { return [FLAG[k] || k, (M.badges && M.badges[k]) || '']; });
    if (r.tickerManual) words.push(['Ticker added manually', 'SEC lists no ticker for this company, so one was added by hand.']);
    if (!words.length) return null;
    var label = words.length === 1 ? 'Data note' : words.length + ' data notes';
    return L.tip(el('button', { type: 'button', 'class': 'flag' }, label), { title: 'Data notes: ' + L.shortName(r.name), def: words.map(function (w) { return w[0] + (w[1] ? ': ' + w[1] : '.'); }).join(' '), source: src(r), href: null, more: 'method.html#data-quality' });
  }

  function medianRow(list, shown) {
    var m = CM.medians(list), label = S.sector === 'all' ? 'Median of the ' + list.length : sectorName(S.sector) + ' median';
    var working = CM.MEDIAN_KEYS.map(function (k) {
      var x = m[k], name = CM.LABELS[k];
      return name + ': ' + (x.v == null ? 'none, ' + x.why : 'median of ' + x.n + ' (' + x.used.join(', ') + ')') + (x.left.length ? '; left out ' + x.left.map(function (l) { return l.ticker; }).join(', ') : '') + '.';
    }).join(' ');
    var tr = el('tr', { 'class': 'medrow' });
    tr.appendChild(el('td', { 'class': 'rk', 'data-l': 'Rank' }, ''));
    tr.appendChild(el('td', { 'class': 'nmc' }, L.tipLabel(label, { title: label, def: 'The middle value of the companies in view. Only exact values count: banks and insurers are left out of every median, and so are missing figures and approximate EBITDA figures. A figure with fewer than three values has no median.', working: working, source: 'SEC EDGAR, as of ' + L.date(M.as_of) + '.', href: null, more: 'method.html#glossary' })));
    shown.forEach(function (c) {
      if (c.k === 'rank' || c.k === 'name') return;
      if (c.k === 'sec') { tr.appendChild(el('td', { 'class': 'sec' }, '')); return; }
      var x = c.f && m[c.f], td = el('td', { 'class': 'r' + (c.ph ? ' ph-off' : '') + (c.more ? ' more-col' : ''), 'data-l': c.t });
      if (!x) { tr.appendChild(td); return; }
      if (x.v == null) td.appendChild(el('span', { 'class': 'muted', title: x.why }, '–'));
      else td.appendChild(document.createTextNode(c.chip ? L.pctS(x.v) : c.fmt(x.v)));
      td.title = x.v == null ? 'No median: ' + x.why : 'Median of ' + x.n + ' companies';
      tr.appendChild(td);
    });
    return tr;
  }

  function visibleRows() {
    var q = S.q.toLowerCase();
    var rows = inSector().filter(function (r) { return !q || r.ticker.toLowerCase().indexOf(q) >= 0 || L.niceName(r.name).toLowerCase().indexOf(q) >= 0; });
    var col = COLS.filter(function (c) { return c.k === S.key; })[0] || COLS[0];
    rows.sort(function (a, b) { var x = col.get(a), y = col.get(b); if (x == null && y == null) return a.rank - b.rank; if (x == null) return 1; if (y == null) return -1; return typeof x === 'string' ? S.dir * x.localeCompare(y) : S.dir * (x - y); });
    return { rows: rows, col: col };
  }

  function render() {
    var vr = visibleRows(), rows = vr.rows, col = vr.col, shown = cols();
    var scope = S.sector === 'all' ? ROWS.length : inSector().length;
    $('ct-count').textContent = rows.length + ' of ' + scope + ' compan' + (scope === 1 ? 'y' : 'ies') + (S.sector === 'all' ? '' : ' in ' + sectorName(S.sector));
    var host = $('ct-wrap'); host.textContent = '';
    if (!rows.length) { host.appendChild(el('p', { 'class': 'lede' }, 'No company matches “' + S.q + '”' + (S.sector === 'all' ? '' : ' in ' + sectorName(S.sector)) + '. The Lab covers ' + ROWS.length + ' large US companies. Clear the search to see the list.')); return; }
    var maxv = col.bar ? Math.max.apply(null, rows.map(function (r) { return Math.abs(col.get(r) || 0); })) || 1 : 1;
    var t = el('table', { 'class': 'cotable' + (S.more ? ' with-more' : '') }), hr = el('tr');
    shown.forEach(function (c) {
      var b = el('button', { type: 'button' }, [c.t, c.k === S.key ? el('span', { 'aria-hidden': 'true' }, S.dir < 0 ? '▼' : '▲') : null]);
      b.addEventListener('click', function () { if (S.key === c.k) S.dir = -S.dir; else { S.key = c.k; S.dir = c.k === 'name' || c.k === 'rank' || c.k === 'sec' ? 1 : -1; } save(); render(); });
      if (c.def) L.tip(b, { title: c.t, def: c.def, formula: c.formula, source: 'SEC EDGAR, as of ' + L.date(M.as_of) + '.', href: null, more: 'method.html#glossary' }, { noClick: true });
      hr.appendChild(el('th', { scope: 'col', 'class': (c.r ? 'r' : '') + (c.ph ? ' ph-off' : '') + (c.more ? ' more-col' : ''), 'aria-sort': c.k === S.key ? (S.dir < 0 ? 'descending' : 'ascending') : null }, b));
    });
    t.appendChild(el('thead', null, hr));
    var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', { 'data-l': 'Rank', 'class': 'rk' }, '#' + r.rank));
      /* the whole row opens the company report; banks and insurers have no valuation model, so no "Value" link */
      var vl = r.financial ? null : el('a', { 'class': 'vlink', href: 'valuation.html?c=' + encodeURIComponent(r.ticker), 'aria-label': 'Value ' + L.shortName(r.name) }, 'Value');
      tr.appendChild(el('td', { 'class': 'nmc' }, el('div', { 'class': 'nm' }, [lg(r), el('div', null, [el('div', null, [el('a', { href: 'company.html?c=' + encodeURIComponent(r.ticker) }, L.shortName(r.name)), ' ', el('span', { 'class': 'muted' }, r.ticker)]), el('div', { 'class': 'flags' }, [vl, noteButton(r), el('span', { 'class': 'sec-m' }, r.sectorShort)])])])));
      shown.forEach(function (c) {
        if (c.k === 'rank' || c.k === 'name') return;
        if (c.k === 'sec') { tr.appendChild(el('td', { 'class': 'sec', 'data-l': 'Sector' }, r.sectorShort)); return; }
        var td = figCell(c, r);
        if (c.k === S.key && c.bar && r[c.f].v != null) td.appendChild(el('span', { 'class': 'cbar', style: 'width:' + Math.max(2, Math.abs(r[c.f].v) / maxv * 100) + '%' }));
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    t.appendChild(el('tfoot', null, medianRow(inSector(), shown)));
    host.appendChild(t);
  }

  function growth() {
    var rows = inSector().filter(function (r) { return r.growth.v != null; }).sort(function (a, b) { return b.growth.v - a.growth.v; });
    var host = $('ct-growth'); host.textContent = '';
    host.appendChild(el('h2', { 'class': 'vsub', style: 'margin-top:8px' }, 'Revenue growth, latest fiscal year, from highest to lowest' + (S.sector === 'all' ? '' : ': ' + sectorName(S.sector))));
    var ch = el('div', { 'class': 'chart' }); host.appendChild(ch);
    L.diverge(ch, rows.map(function (r) { var v = r.growth.v; return { v: v, title: L.shortName(r.name) + ' ' + L.pctS(v), def: 'Revenue growth in the fiscal year to ' + L.date(r.fyEnd) }; }), { name: 'Revenue growth by company', axis: function (t) { return L.pct(t, 0); } });
    host.appendChild(el('p', { 'class': 'cap' }, 'Revenue growth, latest fiscal year against the year before. Navy bars grew, grey bars shrank. Fiscal years end on different dates. Bars beyond the axis are clipped and marked in cashmere; hover or use the arrow keys for the true value and the company. Source: SEC EDGAR 10-K filings, as of ' + L.date(M.as_of) + '.'));
  }

  /* sector filter: buttons on a wide screen, one menu on a phone; both write the same state */
  function sectorBar() {
    var host = $('ct-sectors'); host.textContent = '';
    var counts = {}; ROWS.forEach(function (r) { var k = r.sector || 'none'; counts[k] = (counts[k] || 0) + 1; });
    var opts = [{ id: 'all', name: 'All', n: ROWS.length }].concat((SEC.sectors || []).filter(function (s) { return counts[s.id]; }).map(function (s) { return { id: s.id, name: s.short || s.name, full: s.name, n: counts[s.id] }; }));
    if (counts.none) opts.push({ id: 'none', name: 'Not grouped', n: counts.none });
    var bar = el('div', { 'class': 'secbar', role: 'group', 'aria-label': 'Sector' });
    var pick = el('select', { id: 'sec-pick' });
    opts.forEach(function (o) {
      var b = el('button', { type: 'button', 'class': 'chip', 'data-s': o.id, 'aria-pressed': S.sector === o.id ? 'true' : 'false', title: o.full || null }, [o.name, ' ', el('span', { 'class': 'n' }, String(o.n))]);
      b.addEventListener('click', function () { setSector(o.id); });
      bar.appendChild(b);
      pick.appendChild(el('option', { value: o.id }, (o.full || o.name) + ' (' + o.n + ')'));
    });
    pick.value = S.sector;
    pick.addEventListener('change', function () { setSector(pick.value); });
    host.append(bar, el('label', { 'class': 'sec-pick' }, [el('span', null, 'Sector'), pick]));
  }
  function setSector(id) {
    S.sector = id;
    document.querySelectorAll('.secbar .chip').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.s === id ? 'true' : 'false'); });
    if ($('sec-pick')) $('sec-pick').value = id;
    save(); render(); if (S.view === 'growth') growth();   /* the table is redrawn too, so that it is right when the visitor returns to it */
  }

  /* the CSV holds the companies of the view on screen: the table with its search and sort, or the Growth chart (the
     sector, highest growth first; the search does not apply there, as on screen) */
  function download() {
    var rows = S.view === 'growth' ? inSector().slice().sort(function (a, b) { var x = a.growth.v, y = b.growth.v; if (x == null && y == null) return a.rank - b.rank; if (x == null) return 1; if (y == null) return -1; return y - x; }) : visibleRows().rows;
    var t = CM.csvTable(rows, { asOf: M.as_of, name: L.niceName, badges: FLAG });
    X.save(X.fileName('lab-companies' + (S.sector === 'all' ? '' : '-' + sectorName(S.sector)), M.as_of), X.csv(t.header, t.rows));
  }

  /* the view, the search, the sort, the sector and the extra columns live in the address */
  function show(v) {
    S.view = v === 'growth' ? 'growth' : 'table';
    document.querySelectorAll('.seg button').forEach(function (o) { o.setAttribute('aria-pressed', o.dataset.v === S.view ? 'true' : 'false'); });
    $('ct-growth').hidden = S.view !== 'growth'; $('ct-wrap').hidden = S.view !== 'table';
    $('q').closest('.ct-find').hidden = S.view !== 'table'; /* the search filters the table only */
    $('ct-more').hidden = S.view !== 'table';
    if (S.view === 'growth') growth();
  }
  function load() {
    var p = new URLSearchParams(location.search);
    if (p.get('view') === 'growth') S.view = 'growth';
    if (p.get('q')) S.q = p.get('q').trim().slice(0, 60);
    var k = p.get('sort'); if (k && COLS.some(function (c) { return c.k === k; })) { S.key = k; S.dir = p.get('dir') === 'desc' ? -1 : 1; }
    var s = p.get('sector'); if (s && (s === 'none' || (SEC.sectors || []).some(function (x) { return x.id === s; }))) S.sector = s;
    S.more = p.get('cols') === 'more';
    if (!S.more && (COLS.filter(function (c) { return c.k === S.key; })[0] || {}).more) S.more = true; /* a link sorted by a hidden column shows it */
  }
  function save() {
    var p = new URLSearchParams(location.search);
    ['view', 'q', 'sort', 'dir', 'sector', 'cols'].forEach(function (k) { p.delete(k); });
    if (S.view !== 'table') p.set('view', S.view);
    if (S.q) p.set('q', S.q);
    if (S.sector !== 'all') p.set('sector', S.sector);
    if (S.more) p.set('cols', 'more');
    if (S.key !== 'rank' || S.dir !== 1) { p.set('sort', S.key); p.set('dir', S.dir < 0 ? 'desc' : 'asc'); }
    var s = p.toString();
    try { history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) { /* a file:// page may refuse; the view still works */ }
  }

  Promise.all([L.load('markets'), L.load('assets/logos/logos.json'), L.load('company_room'), L.load('./sectors.json')]).then(function (r) {
    M = r[0]; LOGOS = r[1] || {}; ROOM = r[2]; SEC = r[3] || {}; L.status();
    ROWS = CM.rows(M, ROOM, SEC);
    var g = ROWS.map(function (x) { return x.growth.v; }).filter(L.isNum), up = g.filter(function (v) { return v > 0; }).length, down = g.filter(function (v) { return v < 0; }).length;
    $('ct-title').textContent = up + ' of the ' + ROWS.length + ' largest US companies by public float grew revenue; ' + down + ' shrank' + (g.length - up - down ? ' and ' + (g.length - up - down) + ' were flat.' : '.');
    var fa_ = M.facts;
    $('ct-second').textContent = 'The top three, ' + fa_.top3_names.map(L.shortName).join(', ') + ', hold ' + L.usd(fa_.top3_float) + ' of public float' + (fa_.top3_exceeds_bottom25 ? ', more than the bottom 25 together at ' + L.usd(fa_.bottom25_float) + '.' : '; the bottom 25 hold ' + L.usd(fa_.bottom25_float) + '.');
    var lead = $('leaders'); lead.textContent = '';
    /* revenue growth applies to every company (as in the title count); margins do not apply to banks and insurers */
    [['Highest revenue growth', 'growth', L.pctS], ['Highest operating margin', 'opMargin', pc], ['Highest FCF margin', 'fcfMargin', pc]].forEach(function (x) {
      var best = null; ROWS.forEach(function (rw) { var v = rw[x[1]].v; if (L.isNum(v) && (!best || v > best[x[1]].v)) best = rw; });
      if (best) lead.appendChild(el('li', null, [el('span', { 'class': 'lk' }, x[0]), el('span', { 'class': 'lrow' }, [lg(best), el('b', null, best.ticker), el('span', null, x[2](best[x[1]].v))])]));
    });
    var c = M.counts, ul = el('ul', { 'class': 'list' });
    [c.ranked + ' companies are ranked by SEC public float, from a pool of ' + c.pool + ' filings.', M.excluded.length + ' filings were excluded: ' + c.impossible_figures + ' with impossible figures and ' + c.other_exclusions + ' for other reasons (no listed ticker or no share count). The list is on the Method page.', c.rows_with_badges + ' of the ranked rows carry a data-quality flag.', M.cross_check.overlap + ' of ' + M.cross_check.of + ' match ' + String(M.cross_check.source).split(',')[0] + ', checked ' + L.date(M.cross_check.checked) + '.', 'The list is by SEC public float, which is reported once a year, so it is not a market-cap ranking. Source: ' + M.source + '.', 'Sectors are our own grouping by main business (' + (SEC.updated ? 'updated ' + L.date(SEC.updated) : 'hand-made') + '). A median uses only exact values and needs at least three companies.'].forEach(function (t) { ul.appendChild(el('li', null, t)); });
    var b = $('ct-built'); b.appendChild(el('summary', null, ['How this list is built', el('small', null, 'counts, exclusions, sectors and the cross-check')])); b.appendChild(el('div', { 'class': 'fold-body' }, [ul, el('a', { href: 'method.html#catches', style: 'color:var(--cash-ink);font-weight:600' }, 'See the data-quality catches on Method')]));
    document.querySelectorAll('.seg button').forEach(function (btn) { btn.addEventListener('click', function () { show(btn.dataset.v); save(); }); });
    $('q').addEventListener('input', function (e) { S.q = e.target.value.trim(); save(); render(); });
    $('ct-more').addEventListener('click', function () { S.more = !S.more; this.setAttribute('aria-pressed', S.more ? 'true' : 'false'); if (!S.more && (COLS.filter(function (x) { return x.k === S.key; })[0] || {}).more) { S.key = 'rank'; S.dir = 1; } save(); render(); });
    $('ct-csv').addEventListener('click', download);
    load();
    $('q').value = S.q;
    $('ct-more').setAttribute('aria-pressed', S.more ? 'true' : 'false');
    sectorBar();
    render();
    show(S.view);
  }).catch(L.fail);
})();
