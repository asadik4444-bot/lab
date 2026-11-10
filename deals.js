/* Deals page: header sentence and four figures, then four tabs (Filings, Sponsors, Fundraising, Buyout maths).
   Every number comes from deals_room.json, macro_room.json (SOFR) or lbo_math.js. The only typed values are the
   stated assumption defaults of SPEC-buyout.md and UI limits, both labelled below. */
(function () {
  'use strict';
  var L = Lab, el = L.el, sv = L.sv, $ = L.$, C = L.C, MINUS = L.MINUS, LBO = window.LboMath;
  L.shell({ page: 'deals' });

  var TABS = [{ id: 'filings', name: 'Filings' }, { id: 'sponsors', name: 'Sponsors' }, { id: 'fundraising', name: 'Fundraising' }, { id: 'buyout', name: 'Buyout maths' }];
  var LEVEL = 0.02; /* a change under 2% reads "level with" (design brief, statement rules) */
  var D = null, MAC = null, SOFR = null, P = {};

  /* ---------- buyout: stated ASSUMPTIONS (SPEC-buyout.md), not data. Display units: x, pp, %. ---------- */
  var EBITDA0 = 100, YEARS = 5; /* fixed and labelled: a generic company with $100m of EBITDA, five years */
  function lev(v) { return L.num(v, (v * 10) % 1 ? 2 : 1) + '×'; }
  var CT = [
    { k: 'entry', name: 'Entry multiple', min: 6, max: 16, step: 0.5, def: 10, big: 1, fmt: function (v) { return L.mult(v); } },
    { k: 'leverage', name: 'Debt at entry', min: 0, max: 7, step: 0.25, def: 5, big: 1, fmt: function (v) { return lev(v); } },
    { k: 'spread', name: 'Spread over SOFR', min: 2, max: 8, step: 0.25, def: 4.5, big: 1, fmt: function (v) { return L.num(v, 2) + ' pp'; } },
    { k: 'growth', name: 'EBITDA growth a year', min: -5, max: 15, step: 0.5, def: 5, big: 1, fmt: function (v) { return L.pct(v / 100); } },
    { k: 'conversion', name: 'Cash conversion', min: 20, max: 80, step: 5, def: 50, big: 10, fmt: function (v) { return L.pct(v / 100, 0); } },
    { k: 'exit', name: 'Exit multiple', min: 6, max: 16, step: 0.5, def: 10, big: 1, fmt: function (v) { return L.mult(v); } }
  ];
  var S = {};
  CT.forEach(function (c) { S[c.k] = c.def; });

  /* ---------- helpers ---------- */
  function qLabel(q) { var m = /^(\d{4})Q(\d)$/.exec(q || ''); return m ? 'Q' + m[2] + ' ' + m[1] : String(q || ''); }
  function qShort(q) { var m = /^(\d{4})Q(\d)$/.exec(q || ''); return m ? 'Q' + m[2] + ' ' + m[1].slice(2) : String(q || ''); }
  function bn(v) { return L.isNum(v) ? L.usd(v) : 'n/a'; }
  function fm(v) { return L.isNum(v) ? (v < 0 ? MINUS : '') + '$' + L.num(Math.abs(v), 0) + 'm' : 'n/a'; }
  function fms(v) { return L.isNum(v) && Math.round(v) === 0 ? '$0m' : L.isNum(v) ? (v < 0 ? MINUS : '+') + '$' + L.num(Math.abs(v), 0) + 'm' : 'n/a'; }
  function ym(s) { return L.month(s); }
  function monthSpan(a, b) { var x = /^(\d{4})-(\d{2})/.exec(a), y = /^(\d{4})-(\d{2})/.exec(b); return (+y[1] - +x[1]) * 12 + (+y[2] - +x[2]) + 1; }
  function totOf(m) { return m.proxies + m.tenders; }
  function spacOf(m) { return m.proxies_spac + m.tenders_spac; }
  function sumRange(key, from, to) { return D.monthly.filter(function (m) { return m.month >= from && m.month <= to; }).reduce(function (a, m) { return a + (typeof key === 'function' ? key(m) : m[key]); }, 0); }
  function relWord(cur, prev) { if (!(prev > 0)) return 'flat'; var ch = cur / prev - 1; return Math.abs(ch) < LEVEL ? 'level' : (ch > 0 ? 'up' : 'down'); }
  function partial() {
    var last = D.monthly[D.monthly.length - 1].month, end = D.window && D.window[1], m = /^(\d{4})-(\d{2})-(\d{2})/.exec(end || '');
    if (!m || m[1] + '-' + m[2] !== last) return null;
    var dim = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
    return +m[3] < dim ? { month: last, end: end } : null;
  }
  function spec(o) { return { title: o.title, def: o.def, formula: o.formula || null, working: o.working || null, source: o.source || null, href: o.href || null, hrefText: o.hrefText, caution: o.caution || null, more: o.more || 'method.html#deals' }; }
  function nt(text, s) { return L.tipLabel(text, s); }
  function srcFilings() { return 'SEC EDGAR full-text search: merger proxies (DEFM14A) and third-party tender offers (SC TO-T), by filing date, ' + ym(D.window[0]) + ' to ' + L.date(D.window[1]) + '.'; }
  function srcAdv() { return 'SEC Form ADV roster, ' + L.date(D.roster_date) + '.'; }
  function srcFormD() { return 'SEC Form D data sets, ' + qLabel(D.formd_quarters[0]) + ' to ' + qLabel(D.formd_quarters[D.formd_quarters.length - 1]) + '.'; }
  function srcLine(t) { return el('p', { 'class': 'cap src' }, 'Source: ' + t); }
  var liveT = null;
  function announce(text) { clearTimeout(liveT); liveT = setTimeout(function () { if (P.live) P.live.textContent = text; }, 400); }
  function svgRoot(w, h, label) { return sv('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': label }); }
  function hit(svg, x, y, w, h, label, s) {
    var r = sv('rect', { x: x, y: y, width: w, height: h, fill: 'transparent' });
    svg.appendChild(r); L.tip(r, s); r.setAttribute('aria-label', label); return r;
  }

  /* ---------- header ---------- */
  function renderHeader() {
    var h = D.headline, n = monthSpan(h.from, h.to), ch = h.change, word = relWord(h.last, h.year_earlier), rel;
    if (word === 'level') rel = 'level with last year';
    else if (word === 'flat') rel = 'against none a year earlier';
    else rel = (word === 'up' ? 'up ' : 'down ') + L.pct(Math.abs(ch), Math.abs(ch) < 0.1 ? 1 : 0) + ' on last year';
    $('h1').textContent = L.num(h.last) + ' US merger filings in ' + L.word(n) + ' months, ' + rel + '.';
    $('lede').textContent = h.text;
    var f = $('figs'); f.textContent = '';
    function fig(label, s, value, sub) { f.appendChild(el('div', { 'class': 'fig' }, [el('span', { 'class': 'fl' }, nt(label, s)), el('span', { 'class': 'fv' }, value), el('span', { 'class': 'fs' }, sub || '')])); }
    var pr = sumRange('proxies', h.from, h.to), te = sumRange('tenders', h.from, h.to), pr0 = sumRange('proxies', h.compare_from, h.compare_to), te0 = sumRange('tenders', h.compare_from, h.compare_to);
    var okSum = pr + te === h.last && pr0 + te0 === h.year_earlier;
    fig('Filings, last six full months', spec({ title: 'Merger filings in the last ' + L.word(n) + ' full months', def: 'Merger proxies (DEFM14A) and third-party tender offers (SC TO-T) filed with the SEC, ' + ym(h.from) + ' to ' + ym(h.to) + '. SPAC filings are left out. These are filings, not announcements.', formula: 'proxies + tender offers, SPACs excluded', working: okSum ? L.num(pr) + ' proxies + ' + L.num(te) + ' tender offers = ' + L.num(h.last) + '. A year earlier, ' + ym(h.compare_from) + ' to ' + ym(h.compare_to) + ': ' + L.num(pr0) + ' + ' + L.num(te0) + ' = ' + L.num(h.year_earlier) + '.' : L.num(h.last) + ' now; ' + L.num(h.year_earlier) + ' a year earlier.', source: srcFilings(), caution: 'A proxy is filed weeks or months after a deal is announced.', more: 'method.html#deal-filings' }),
      L.num(h.last), [L.chg(ch, L.pctS(ch)), ' vs ' + L.num(h.year_earlier) + ' a year earlier']);
    var spacMonths = D.monthly.length;
    fig('SPAC filings', spec({ title: 'SPAC filings', def: 'Merger filings by blank-check companies (SPACs): flagged by industry code, “… Acquisition Corp” names and warrant or unit tickers. They are shown as a separate series and are never added to the filings total.', formula: 'SPAC proxies + SPAC tender offers', working: L.num(sumRange('proxies_spac', D.monthly[0].month, D.monthly[spacMonths - 1].month)) + ' proxies + ' + L.num(sumRange('tenders_spac', D.monthly[0].month, D.monthly[spacMonths - 1].month)) + ' tender offers = ' + L.num(D.spac_filings) + ', ' + ym(D.window[0]) + ' to ' + L.date(D.window[1]) + '. All filings with SPACs: ' + L.num(D.filings_total) + '.', source: srcFilings(), more: 'method.html#spac' }),
      L.num(D.spac_filings), 'since ' + ym(D.window[0]) + ', not in the total');
    var ranked = D.sponsors.filter(function (s) { return s.rank != null; });
    fig('Sponsors ranked', spec({ title: 'Sponsors ranked', def: 'Private-equity and alternative-asset firms ranked by the gross assets of their private funds, from each firm’s own SEC-registered advisers.', formula: 'count of sponsors with a rank', working: ranked.map(function (s) { return s.name; }).join(', ') + '.', source: srcAdv(), caution: 'Non-US sponsors (EQT, CVC, Partners Group) are largely not SEC-registered.', more: 'method.html#sponsors' }),
      L.num(ranked.length), 'Form ADV roster ' + L.date(D.roster_date));
    var q = D.fundraising[D.fundraising.length - 1], q0 = D.fundraising[D.fundraising.length - 2], qch = q0 ? q.new_notices / q0.new_notices - 1 : null;
    fig('PE fund notices, latest quarter', spec({ title: 'New private-equity fund notices', def: 'New Form D notices filed by private-equity funds in ' + qLabel(q.quarter) + ': a fund telling the SEC it is raising money under an exemption. Not every fund files.', formula: 'count of new Form D notices, fund type Private Equity Fund', working: L.num(q.new_notices) + ' new notices in ' + qLabel(q.quarter) + (q0 ? '; ' + L.num(q0.new_notices) + ' in ' + qLabel(q0.quarter) + '.' : '.'), source: srcFormD(), caution: 'Form D covers US exempt-offering notices only.', more: 'method.html#form-d' }),
      L.num(q.new_notices), [qLabel(q.quarter) + ' ', qch == null ? null : L.chg(qch, L.pctS(qch)), qch == null ? null : ' vs ' + qLabel(q0.quarter)]);
  }

  /* ---------- tabs ---------- */
  function buildTabs() {
    var tl = $('tablist'), pn = $('panels'); tl.textContent = ''; pn.textContent = '';
    TABS.forEach(function (t, i) {
      var b = el('button', { type: 'button', 'class': 'tab', role: 'tab', id: 'tab-' + t.id, 'aria-controls': 'panel-' + t.id, 'aria-selected': 'false', tabindex: '-1' }, t.name);
      b.addEventListener('click', function () { selectTab(t.id, true); });
      b.addEventListener('keydown', function (e) {
        var k = e.key, n = TABS.length, j = null;
        if (k === 'ArrowRight') j = (i + 1) % n; else if (k === 'ArrowLeft') j = (i + n - 1) % n; else if (k === 'Home') j = 0; else if (k === 'End') j = n - 1;
        if (j != null) { e.preventDefault(); selectTab(TABS[j].id, true); $('tab-' + TABS[j].id).focus(); }
      });
      tl.appendChild(b);
      pn.appendChild(el('section', { 'class': 'panel', role: 'tabpanel', id: 'panel-' + t.id, 'aria-labelledby': 'tab-' + t.id, hidden: true }));
    });
  }
  function selectTab(id, push) {
    TABS.forEach(function (t) { var on = t.id === id, b = $('tab-' + t.id); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; $('panel-' + t.id).hidden = !on; });
    if (push) history.replaceState(null, '', location.pathname + location.search + '#' + id);
    L.note.close(false);
  }

  /* ---------- Filings ---------- */
  var FORMS = {
    DEFM14A: ['DEFM14A: definitive merger proxy', 'The proxy statement a public company sends its shareholders before they vote on a merger. It is filed weeks or months after the deal is announced.'],
    'SC TO-T': ['SC TO-T: third-party tender offer', 'The statement a bidder files when it offers to buy a company’s shares directly from its shareholders. Amendments (SC TO-T/A) are not counted.']
  };
  function monthSpec(m, part) {
    return spec({ title: ym(m.month), def: 'Merger proxies and tender offers filed in the month, SPACs shown apart.', formula: 'proxies + tender offers; SPAC filings are not added', working: L.num(m.proxies) + ' proxies + ' + L.num(m.tenders) + ' tender offers = ' + L.num(totOf(m)) + ' filings. SPAC filings, not in the total: ' + L.num(spacOf(m)) + '.', source: srcFilings(), caution: part ? 'Partial month: filings to ' + L.date(part.end) + ' only.' : null, more: 'method.html#deal-filings' });
  }
  function drawFlow(host) {
    var ms = D.monthly, n = ms.length, part = partial();
    L.chart(host, function (h, w) {
      var small = w < 520, H = small ? 210 : 250, padT = 24, padB = 26;
      var max = Math.max.apply(null, ms.map(function (m) { return Math.max(totOf(m), spacOf(m)); })), y = L.scale(0, max, H - padB, padT), step = w / n, gw = step * 0.84, sw = gw * 0.62, pw = gw * 0.3;
      var svg = svgRoot(w, H, 'Monthly merger filings, ' + ym(ms[0].month) + ' to ' + ym(ms[n - 1].month) + ': proxies and tender offers stacked, SPAC filings as a separate outlined bar. Tab to read each month.');
      var base = y(0), peak = 0, lastFull = part ? n - 2 : n - 1;
      ms.forEach(function (m, i) { if (totOf(m) > totOf(ms[peak])) peak = i; });
      svg.appendChild(sv('line', { x1: 0, x2: w, y1: base, y2: base, stroke: C.hair }));
      ms.forEach(function (m, i) {
        var x0 = i * step + (step - gw) / 2, isP = part && i === n - 1, op = isP ? 0.4 : 1;
        var ph = base - y(m.proxies), th = base - y(totOf(m)) - ph;
        if (m.proxies) svg.appendChild(sv('rect', { x: x0, y: y(m.proxies), width: sw, height: ph, fill: C.ink, 'fill-opacity': op, stroke: isP ? C.ink : 'none', 'stroke-dasharray': isP ? '3 2' : null }));
        if (m.tenders) svg.appendChild(sv('rect', { x: x0, y: y(totOf(m)), width: sw, height: th, fill: C.soft, 'fill-opacity': isP ? 0.6 : 1, stroke: isP ? C.mark : 'none', 'stroke-dasharray': isP ? '3 2' : null }));
        if (spacOf(m)) svg.appendChild(sv('rect', { x: x0 + sw + gw * 0.08, y: y(spacOf(m)), width: pw, height: base - y(spacOf(m)), fill: 'none', stroke: C.grey, 'stroke-width': 1.25 }));
      });
      [peak, lastFull].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i) {
        svg.appendChild(sv('text', { x: i * step + (step - gw) / 2 + sw / 2, y: y(totOf(ms[i])) - 6, 'text-anchor': i > n - 3 ? 'end' : 'middle', 'font-size': 13, 'font-weight': 600, fill: C.ink }, String(totOf(ms[i]))));
      });
      if (part) svg.appendChild(sv('text', { x: w, y: 12, 'text-anchor': 'end', 'font-size': 13, fill: C.ink2 }, (small ? L.monthName(part.month) : ym(part.month)) + ' is partial: to ' + L.date(part.end).replace(/ \d{4}$/, '')));
      [[0, 'start'], [Math.floor((n - 1) / 2), 'middle'], [n - 1, 'end']].forEach(function (p) {
        var cx = p[1] === 'start' ? 0 : (p[1] === 'end' ? w : p[0] * step + step / 2);
        svg.appendChild(sv('text', { x: cx, y: H - 7, 'text-anchor': p[1], 'font-size': 13, fill: C.ink2 }, ym(ms[p[0]].month)));
      });
      ms.forEach(function (m, i) { hit(svg, i * step, 0, step, H - padB + 6, ym(m.month) + ': ' + totOf(m) + ' filings, ' + spacOf(m) + ' SPAC', monthSpec(m, part && i === n - 1 ? part : null)); });
      h.appendChild(svg);
    });
  }
  function renderFilings() {
    var p = $('panel-filings'); p.textContent = '';
    p.appendChild(el('div', { 'class': 'panel-head' }, el('h2', { 'class': 'statement' }, D.flow_title)));
    p.appendChild(el('h3', { 'class': 'vsub' }, 'Filings per month, by filing date'));
    var host = el('div', { 'class': 'chart flow' }); p.appendChild(host); drawFlow(host);
    p.appendChild(el('p', { 'class': 'key' }, [
      el('span', null, [el('i', { 'class': 'sw ink' }), 'Merger proxies']), el('span', null, [el('i', { 'class': 'sw tan' }), 'Tender offers']),
      el('span', null, [el('i', { 'class': 'sw out' }), 'SPAC filings, separate and not in the total'])
    ]));
    p.appendChild(el('p', { 'class': 'cap' }, L.num(D.amendments_skipped['SC TO-T']) + ' tender-offer amendments (SC TO-T/A) are not new deals and are not counted. These are filings by filing date, not announcements.'));
    p.appendChild(srcLine(srcFilings()));
    p.appendChild(el('h3', { 'class': 'vsub lat' }, 'Latest ' + L.word(D.recent.length) + ' filings'));
    var ul = el('ul', { 'class': 'flist' });
    D.recent.forEach(function (r) {
      var f = FORMS[r.form] || [r.form, r.form_label || ''], chips = (r.tickers || []).map(function (t) { return el('span', { 'class': 'chip' }, t); });
      ul.appendChild(el('li', null, [
        el('span', { 'class': 'fn' }, [el('b', null, L.niceName(r.name)), chips.length ? ' ' : null].concat(chips)),
        el('span', { 'class': 'fb' }, L.tipLabel(r.form, spec({ title: f[0], def: f[1], source: 'SEC EDGAR form type, ' + (r.form_label || r.form) + '.', more: 'method.html#deal-filings' }), 'badge')),
        el('span', { 'class': 'fd' }, L.tipLabel(L.date(r.file_date), spec({ title: 'Filing date', def: 'The date the filing reached the SEC, for ' + L.niceName(r.name) + '.', source: 'SEC EDGAR, ' + (r.form_label || r.form) + '.', href: r.url, hrefText: 'Open the filing', more: 'method.html#deal-filings' }))),
        el('a', { 'class': 'fl2', href: r.url, target: '_blank', rel: 'noopener', 'aria-label': 'Filing on EDGAR: ' + L.niceName(r.name) + ', ' + r.form + ', filed ' + L.date(r.file_date) }, 'Filing on EDGAR →')
      ]));
    });
    p.appendChild(ul);
    p.appendChild(srcLine('SEC EDGAR, newest first; the list holds the latest ' + L.word(D.recent.length) + ' of ' + L.num(D.filings_total) + ' filings since ' + ym(D.window[0]) + '. Not investment advice.'));
  }

  /* ---------- Sponsors ---------- */
  function mono(name) { return name === name.toUpperCase() ? name.slice(0, 3) : name.slice(0, 2); }
  function sponsorSpec(s, what) {
    var d = { gross: ['Private-fund gross assets', 'The gross assets of the private funds the sponsor’s SEC-registered advisers manage: the ranking basis.', bn(s.private_fund_gross_assets)], raum: ['Regulatory assets under management', 'Assets the advisers manage, as reported on Form ADV. Summed across related advisers, so it can overlap.', bn(s.raum)], funds: ['Private funds', 'The number of private funds the advisers report on Form ADV.', L.num(s.private_fund_count)], adv: ['Advisers counted', 'How many of the sponsor’s own SEC-registered advisers are added up. Joint ventures and unrelated name matches are left out.', L.num(s.advisers)] }[what];
    return spec({ title: s.name + ': ' + d[0].toLowerCase(), def: d[1], formula: 'sum over the advisers counted for ' + s.name, working: d[0] + ': ' + d[2] + '. ' + s.advisers + ' advisers counted.', source: srcAdv(), caution: s.note, more: 'method.html#sponsors' });
  }
  function renderSponsors() {
    var p = $('panel-sponsors'); p.textContent = '';
    var sp = D.sponsors.filter(function (s) { return s.rank != null; }).sort(function (a, b) { return a.rank - b.rank; }), top = sp[0];
    p.appendChild(el('div', { 'class': 'panel-head' }, el('h2', { 'class': 'statement' }, top.name + ' manages the most private-fund assets of the ' + L.word(sp.length) + ' tracked sponsors: ' + bn(top.private_fund_gross_assets) + '.')));
    p.appendChild(el('h3', { 'class': 'vsub' }, 'Private-fund gross assets, USD bn'));
    var host = el('div', { 'class': 'chart' }); p.appendChild(host);
    L.hbars(host, sp.map(function (s) { return { label: s.name, v: s.private_fund_gross_assets, text: bn(s.private_fund_gross_assets), kind: 'hi', spec: sponsorSpec(s, 'gross') }; }), { name: 'Private-fund gross assets by sponsor' });
    p.appendChild(el('p', { 'class': 'cap' }, 'Private-fund gross assets, Form ADV roster ' + L.date(D.roster_date) + '. Sum of each firm’s own SEC-registered advisers; joint ventures and unrelated name matches are excluded.'));
    p.appendChild(srcLine(srcAdv()));
    var t = el('table', { 'class': 'dtable mt sptable' });
    t.appendChild(el('thead', null, el('tr', null, [el('th', { scope: 'col' }, 'Sponsor'), el('th', { scope: 'col', 'class': 'r' }, 'Private-fund gross assets'), el('th', { scope: 'col', 'class': 'r' }, 'RAUM (can overlap)'), el('th', { scope: 'col', 'class': 'r' }, 'Private funds'), el('th', { scope: 'col', 'class': 'r' }, 'Advisers')])));
    var tb = el('tbody');
    sp.forEach(function (s) {
      tb.appendChild(el('tr', { 'class': 'sp' }, [
        el('th', { scope: 'row', 'class': 'nm' }, [el('span', { 'class': 'mono', 'aria-hidden': 'true' }, mono(s.name)), el('span', { 'class': 'rk' }, s.rank + '. '), s.name]),
        el('td', { 'class': 'r g', 'data-l': '' }, nt(bn(s.private_fund_gross_assets), sponsorSpec(s, 'gross'))),
        el('td', { 'class': 'r', 'data-l': 'RAUM' }, nt(bn(s.raum), sponsorSpec(s, 'raum'))),
        el('td', { 'class': 'r', 'data-l': 'Funds' }, nt(L.num(s.private_fund_count), sponsorSpec(s, 'funds'))),
        el('td', { 'class': 'r', 'data-l': 'Advisers' }, nt(L.num(s.advisers), sponsorSpec(s, 'adv')))
      ]));
      tb.appendChild(el('tr', { 'class': 'nrow' }, el('td', { colspan: 5 }, el('details', { 'class': 'how' }, [el('summary', null, 'How ' + s.name + ' is counted'), el('p', null, s.note)]))));
    });
    t.appendChild(tb); p.appendChild(t);
    p.appendChild(el('p', { 'class': 'cap' }, 'RAUM is regulatory assets under management; summed RAUM can overlap between related advisers, so the ranking uses private-fund gross assets. Not investment advice.'));
  }

  /* ---------- column charts (fundraising) ---------- */
  function colChart(host, items, o) {
    L.chart(host, function (h, w) {
      var H = o.h || 190, padT = 24, padB = 26, n = items.length, step = w / n, bw = Math.min(step * 0.6, 56);
      var max = Math.max.apply(null, items.map(function (i) { return i.v; })), y = L.scale(0, max, H - padB, padT), base = y(0);
      var svg = svgRoot(w, H, o.name + ': ' + items.map(function (i) { return i.label + ' ' + i.text; }).join('; ') + '.');
      svg.appendChild(sv('line', { x1: 0, x2: w, y1: base, y2: base, stroke: C.hair }));
      items.forEach(function (it, i) {
        var x = i * step + (step - bw) / 2, last = o.lastMark && i === n - 1;
        svg.appendChild(sv('rect', { x: x, y: y(it.v), width: bw, height: Math.max(1, base - y(it.v)), rx: 2, fill: o.grey ? C.greySoft : (last ? C.mark : C.ink) }));
        svg.appendChild(sv('text', { x: x + bw / 2, y: y(it.v) - 6, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': last ? 600 : 400, fill: o.grey ? C.ink2 : C.ink }, it.text));
        svg.appendChild(sv('text', { x: x + bw / 2, y: H - 7, 'text-anchor': 'middle', 'font-size': 13, fill: C.ink2 }, it.short));
        hit(svg, i * step, 0, step, H - padB + 6, it.label + ': ' + it.text, it.spec);
      });
      h.appendChild(svg);
    });
  }
  function renderFund() {
    var p = $('panel-fundraising'); p.textContent = '';
    var fr = D.fundraising, q = fr[fr.length - 1], q0 = fr[fr.length - 2], w = q0 ? relWord(q.new_notices, q0.new_notices) : 'flat';
    var title = L.num(q.new_notices) + ' new PE-fund notices in ' + qLabel(q.quarter) + (q0 ? ', ' + (w === 'level' ? 'about as many as ' : (w === 'up' ? 'up from ' : 'down from ')) + L.num(q0.new_notices) + ' in ' + qLabel(q0.quarter) + '.' : '.');
    p.appendChild(el('div', { 'class': 'panel-head' }, el('h2', { 'class': 'statement' }, title)));
    var cols = el('div', { 'class': 'gl' }), a = el('div'), b = el('div');
    var ha = el('div', { 'class': 'chart' }), hb = el('div', { 'class': 'chart' });
    a.appendChild(el('h3', { 'class': 'vsub' }, 'New private-equity fund notices')); a.appendChild(ha);
    b.appendChild(el('h3', { 'class': 'vsub' }, 'Amount sold in new notices, USD bn')); b.appendChild(hb);
    cols.appendChild(a); cols.appendChild(b); p.appendChild(cols);
    colChart(ha, fr.map(function (r) {
      return { label: qLabel(r.quarter), short: qShort(r.quarter), v: r.new_notices, text: L.num(r.new_notices), spec: spec({ title: 'New PE-fund notices, ' + qLabel(r.quarter), def: 'New Form D notices from private-equity funds. Amendments to earlier notices are counted apart.', formula: 'count of new notices, fund type Private Equity Fund', working: L.num(r.new_notices) + ' new notices; ' + L.num(r.amendments) + ' amendments.', source: srcFormD(), caution: 'Form D covers US exempt-offering notices only; not every fund files.', more: 'method.html#form-d' }) };
    }), { name: 'New PE-fund notices by quarter', lastMark: true });
    colChart(hb, fr.map(function (r) {
      return { label: qLabel(r.quarter), short: qShort(r.quarter), v: r.amount_sold_new, text: L.num(r.amount_sold_new / 1e9, 1), spec: spec({ title: 'Amount sold in new notices, ' + qLabel(r.quarter), def: 'The sum of the amount already sold, as stated in new notices. Offerings of indefinite size have no amount and are counted apart.', formula: 'sum of amount sold in new notices', working: bn(r.amount_sold_new) + ' across ' + L.num(r.new_notices - r.indefinite_new) + ' notices with a stated size; ' + L.num(r.indefinite_new) + ' of indefinite size.', source: srcFormD(), caution: 'Amount sold is what the notice states, not the fund’s final size.', more: 'method.html#form-d' }) };
    }), { name: 'Amount sold in new PE-fund notices by quarter, USD bn', lastMark: true });
    p.appendChild(el('p', { 'class': 'cap' }, 'Form D notices by quarter of filing, ' + qLabel(D.formd_quarters[0]) + ' to ' + qLabel(D.formd_quarters[D.formd_quarters.length - 1]) + '. Latest quarter in cashmere. “About as many” means within ' + L.pct(LEVEL, 0) + '.'));
    p.appendChild(srcLine(srcFormD()));
    /* table: indefinite offerings and amendments */
    var t = el('table', { 'class': 'dtable mt rtable' });
    t.appendChild(el('thead', null, el('tr', null, [el('th', { scope: 'col' }, 'Quarter'), el('th', { scope: 'col', 'class': 'r' }, 'New notices'), el('th', { scope: 'col', 'class': 'r' }, 'Amendments'), el('th', { scope: 'col', 'class': 'r' }, 'Amount sold'), el('th', { scope: 'col', 'class': 'r' }, 'Indefinite size')])));
    var tb = el('tbody');
    fr.slice().reverse().forEach(function (r) {
      var sp0 = function (title, def, working) { return spec({ title: title + ', ' + qLabel(r.quarter), def: def, working: working, source: srcFormD(), more: 'method.html#form-d' }); };
      tb.appendChild(el('tr', null, [
        el('th', { scope: 'row' }, qLabel(r.quarter)),
        el('td', { 'class': 'r', 'data-l': 'New' }, nt(L.num(r.new_notices), sp0('New notices', 'New Form D notices from private-equity funds.', L.num(r.new_notices)))),
        el('td', { 'class': 'r', 'data-l': 'Amendments' }, nt(L.num(r.amendments), sp0('Amendments', 'Updates to earlier notices. They are not new funds.', L.num(r.amendments)))),
        el('td', { 'class': 'r', 'data-l': 'Sold' }, nt(bn(r.amount_sold_new), sp0('Amount sold', 'Amount already sold, as stated in new notices.', bn(r.amount_sold_new)))),
        el('td', { 'class': 'r', 'data-l': 'Indefinite' }, nt(L.num(r.indefinite_new), sp0('Indefinite offerings', 'New notices where the offering has no fixed size, so they carry no amount.', L.num(r.indefinite_new) + ' of ' + L.num(r.new_notices) + ' new notices (' + L.pct(r.indefinite_new / r.new_notices, 0) + ').')))
      ]));
    });
    t.appendChild(tb); p.appendChild(el('div', { 'class': 'tblwrap' }, t));
    /* context: other fund types, quiet grey */
    p.appendChild(el('h3', { 'class': 'vsub ctxh' }, 'For context: new notices by other fund types'));
    var g3 = el('div', { 'class': 'ctx3' });
    [['Venture Capital Fund', 'Venture capital funds'], ['Hedge Fund', 'Hedge funds'], ['Other Investment Fund', 'Other investment funds']].forEach(function (ty) {
      var rows = D.fundraising_types[ty[0]]; if (!rows) return;
      var box = el('div'), hh = el('div', { 'class': 'chart' }); box.appendChild(el('p', { 'class': 'ctxt' }, ty[1])); box.appendChild(hh); g3.appendChild(box);
      colChart(hh, rows.map(function (r) {
        return { label: qLabel(r.quarter), short: qShort(r.quarter).replace(/^Q(\d) /, 'Q$1 '), v: r.new, text: L.num(r.new), spec: spec({ title: ty[1] + ', ' + qLabel(r.quarter), def: 'New Form D notices from this type of fund, shown for comparison with private equity.', working: L.num(r.new) + ' new notices.', source: srcFormD(), more: 'method.html#form-d' }) };
      }), { name: ty[1] + ': new notices by quarter', grey: true, h: 150 });
    });
    p.appendChild(g3);
    p.appendChild(el('p', { 'class': 'cap' }, 'New Form D notices by quarter, in grey because they are context for the private-equity series, not part of it.'));
    if ((D.formd_unavailable || []).length) p.appendChild(el('p', { 'class': 'cap miss' }, D.formd_unavailable.map(qLabel).join(', ') + ': not yet published by the SEC, so no figures are shown for ' + (D.formd_unavailable.length > 1 ? 'these quarters' : 'this quarter') + '.'));
    p.appendChild(srcLine(srcFormD() + ' Form D covers US exempt-offering notices only; not every fund files. Not investment advice.'));
  }

  /* ---------- Buyout maths ---------- */
  function params() {
    return { ebitda0: EBITDA0, entry: S.entry, leverage: S.leverage, rate: SOFR ? SOFR.value / 100 + S.spread / 100 : NaN, growth: S.growth / 100, conversion: S.conversion / 100, exit: S.exit, years: YEARS };
  }
  function sofrText() { return SOFR ? 'SOFR ' + L.num(SOFR.value, 2) + '% on ' + L.date(SOFR.period) : 'SOFR not available'; }
  function rateText() { return sofrText() + ' + ' + L.num(S.spread, 2) + ' pp spread (assumption)'; }
  var SRC_B = 'Hypothetical model on stated assumptions (lbo_math.js); no real company. SOFR: Federal Reserve Bank of New York.';
  function ctlSpec(ct) {
    var e = EBITDA0, y5 = LBO.lbo(params()), m = {
      entry: ['Entry multiple', 'The enterprise value paid for the company, as a multiple of its EBITDA.', 'entry price = entry multiple × EBITDA', L.mult(S.entry) + ' × ' + fm(e) + ' = ' + fm(S.entry * e)],
      leverage: ['Debt at entry', 'Borrowed money at the start, as a multiple of EBITDA. The rest of the price is the equity cheque.', 'debt = leverage × EBITDA; equity = price − debt', lev(S.leverage) + ' × ' + fm(e) + ' = ' + fm(S.leverage * e) + ' of debt; equity ' + fm((S.entry - S.leverage) * e) + '.'],
      spread: ['Spread over SOFR', 'The margin added to the SOFR base rate to give the interest rate on the debt. A stated assumption, not a quote.', 'interest rate = SOFR + spread', SOFR ? sofrText() + ' + ' + L.num(S.spread, 2) + ' pp = ' + L.num(SOFR.value + S.spread, 2) + '% a year.' : 'SOFR is not in the data.'],
      growth: ['EBITDA growth a year', 'How fast EBITDA grows each year of the holding period.', 'EBITDA(t) = EBITDA(t−1) × (1 + growth)', y5 ? fm(e) + ' becomes ' + fm(y5.years[y5.years.length - 1].ebitda) + ' in year ' + YEARS + '.' : null],
      conversion: ['Cash conversion', 'The share of EBITDA left as cash before interest, after capital spending, tax and working capital.', 'cash flow = conversion × EBITDA − interest; interest = rate × debt at the start of the year', y5 ? 'Year 1: ' + L.pct(S.conversion / 100, 0) + ' × ' + fm(y5.years[0].ebitda) + ' − ' + fm(y5.years[0].interest) + ' = ' + fm(y5.years[0].fcf) + '.' : null],
      exit: ['Exit multiple', 'The enterprise value the company is sold for at the end, as a multiple of its EBITDA that year.', 'exit price = exit multiple × EBITDA in year ' + YEARS, y5 ? L.mult(S.exit) + ' × ' + fm(y5.years[y5.years.length - 1].ebitda) + ' = ' + fm(y5.ev_out) + '.' : null]
    }[ct.k];
    return spec({ title: m[0], def: m[1], formula: m[2], working: m[3], source: 'Assumption: default ' + ct.fmt(ct.def) + ', range ' + ct.fmt(ct.min) + ' to ' + ct.fmt(ct.max) + '. ' + (ct.k === 'spread' ? 'SOFR from the Financing data.' : 'Not a forecast.'), caution: 'Hypothetical model on stated assumptions; not investment advice.', more: 'method.html#buyout' });
  }
  function snap(ct, v) { v = Math.max(ct.min, Math.min(ct.max, v)); return Math.round((v - ct.min) / ct.step) * ct.step + ct.min; }
  function buildCtl(ct) {
    var inp = el('input', { type: 'range', id: 'b-' + ct.k, min: ct.min, max: ct.max, step: ct.step, 'aria-label': ct.name }); inp.value = S[ct.k];
    var vin = el('input', { type: 'text', inputmode: 'decimal', 'class': 'vin', id: 'bv-' + ct.k, 'aria-label': ct.name + ', typed value', autocomplete: 'off' }); vin.value = ct.fmt(S[ct.k]);
    var box = el('div', { 'class': 'ctl' }, [el('div', { 'class': 'ctl-top' }, [L.tipLabel(ct.name, function () { return ctlSpec(ct); }), vin]), inp]);
    function set(v) { v = snap(ct, v); S[ct.k] = v; inp.value = v; vin.value = ct.fmt(v); refresh(); }
    inp.addEventListener('input', function () { S[ct.k] = parseFloat(inp.value); vin.value = ct.fmt(S[ct.k]); refresh(); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); set(S[ct.k] + (e.key === 'PageUp' ? ct.big : -ct.big)); } });
    function commit() { var n = parseFloat(vin.value.replace('−', '-').replace(/[^0-9.\-]/g, '')); if (isFinite(n)) set(n); else vin.value = ct.fmt(S[ct.k]); }
    vin.addEventListener('change', commit); vin.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); });
    box.__sync = function () { inp.value = S[ct.k]; vin.value = ct.fmt(S[ct.k]); };
    return box;
  }
  function tile(label, s, value, sub) { return el('div', { 'class': 'tile' }, [el('span', { 'class': 'tl' }, nt(label, s)), el('span', { 'class': 'tv' }, value), el('span', { 'class': 'ts' }, sub || '')]); }

  function renderBuyout() {
    var p = $('panel-buyout'); p.textContent = ''; P = {};
    P.title = el('h2', { 'class': 'statement', id: 'b-title' });
    P.sub = el('p', { 'class': 't-second second prompt' }, 'Hypothetical: a generic company with ' + fm(EBITDA0) + ' of EBITDA, held ' + L.word(YEARS) + ' years. No real company. Not investment advice.');
    P.live = el('p', { 'class': 'sr-only', 'aria-live': 'polite' });
    p.appendChild(el('div', { 'class': 'panel-head', style: 'margin-bottom:0' }, [P.title, P.sub, P.live]));
    P.tiles = el('div', { 'class': 'tiles t4 btiles' }); p.appendChild(P.tiles);
    var grid = el('div', { 'class': 'bgrid' });
    /* range box */
    P.psHost = el('div', { 'class': 'rbar' }); P.evline = el('p', { 'class': 'evline' });
    var rbox = el('div', { 'class': 'bsticky' }, [el('p', { 'class': 'vsub' }, 'Return a year (IRR), exit multiple ±1×'), P.psHost, P.evline]);
    /* controls */
    var left = el('div', { 'class': 'bleft' });
    left.appendChild(el('h3', { 'class': 'vsub' }, 'Assumptions'));
    P.boxes = CT.map(function (ct) {
      var b = buildCtl(ct); left.appendChild(b);
      if (ct.k === 'spread') { P.rate = el('p', { 'class': 'ratel' }); left.appendChild(P.rate); }
      return b;
    });
    left.appendChild(el('dl', { 'class': 'bfix' }, [
      el('dt', null, nt('EBITDA at entry', spec({ title: 'EBITDA at entry', def: 'Fixed for every case: a generic company that earns $100m of EBITDA in the year before the buyout. It is not any real company.', source: 'Assumption, fixed.', caution: 'Hypothetical model on stated assumptions.', more: 'method.html#buyout' }))), el('dd', null, fm(EBITDA0) + ', fixed'),
      el('dt', null, nt('Holding period', spec({ title: 'Holding period', def: 'Fixed at ' + L.word(YEARS) + ' years: cash flows at the end of each year, exit at the end of year ' + YEARS + '.', source: 'Assumption, fixed.', caution: 'Hypothetical model on stated assumptions.', more: 'method.html#buyout' }))), el('dd', null, L.word(YEARS) + ' years, fixed')
    ]));
    var reset = el('button', { type: 'button', 'class': 'btn' }, 'Reset to starting values');
    reset.addEventListener('click', function () { CT.forEach(function (c) { S[c.k] = c.def; }); P.boxes.forEach(function (b) { b.__sync(); }); refresh(); });
    left.appendChild(reset);
    /* bridge */
    P.bridgeHost = el('div', { 'class': 'chart' });
    var bbox = el('div', { 'class': 'bbridge' }, [el('h3', { 'class': 'vsub' }, 'Where the value comes from, $m'), P.bridgeHost, P.bnote = el('p', { 'class': 'cap' })]);
    grid.appendChild(rbox); grid.appendChild(left); grid.appendChild(bbox); p.appendChild(grid);
    /* year table fold-out */
    P.ytable = el('div', { 'class': 'tblwrap' });
    P.fold = el('details', { 'class': 'fold' }, [el('summary', null, ['Year by year', el('small', null, L.word(YEARS) + ' years, central case')]), el('div', { 'class': 'fold-body' }, [P.ytable, P.ynote = el('p', { 'class': 'cap' })])]);
    p.appendChild(el('div', { 'class': 'folds' }, P.fold));
    p.appendChild(el('p', { 'class': 'disc' }, 'Hypothetical model on stated assumptions, with no real company; not investment advice. ' + (SOFR ? 'Base rate: ' + sofrText() + ', Federal Reserve Bank of New York.' : '')));
    if (!SOFR) { P.title.textContent = 'The buyout maths needs the SOFR rate, and it is not in the data.'; return; }
    refresh();
  }

  function tileSpecs(r, pr) {
    var yN = r.years[r.years.length - 1];
    return [
      ['Return a year (IRR)', spec({ title: 'Return a year (IRR)', def: 'The yearly return on the equity cheque over the holding period, with no interim payouts.', formula: 'IRR = MOIC^(1 / years) − 1', working: L.num(r.moic, 2) + '× ^ (1 / ' + YEARS + ') − 1 = ' + L.pct(r.irr), source: SRC_B, caution: 'Hypothetical model on stated assumptions; not investment advice.', more: 'method.html#buyout' }), L.pct(r.irr), 'a year, ' + L.word(YEARS) + ' years'],
      ['Money multiple (MOIC)', spec({ title: 'Money multiple (MOIC)', def: 'Equity at exit divided by the equity put in.', formula: 'MOIC = equity at exit / equity at entry', working: fm(r.equity_out) + ' / ' + fm(r.equity_in) + ' = ' + L.num(r.moic, 2) + '×', source: SRC_B, caution: 'Hypothetical model on stated assumptions; not investment advice.', more: 'method.html#buyout' }), L.mult(r.moic), 'of the equity put in'],
      ['Equity at entry', spec({ title: 'Equity at entry', def: 'The cheque the buyer writes: the purchase price less the debt.', formula: 'equity = entry multiple × EBITDA − debt', working: fm(r.ev_in) + ' − ' + fm(r.debt0) + ' = ' + fm(r.equity_in), source: SRC_B, more: 'method.html#buyout' }), fm(r.equity_in), 'price ' + fm(r.ev_in) + ', debt ' + fm(r.debt0)],
      ['Equity at exit', spec({ title: 'Equity at exit', def: 'What the buyer receives at the end: the sale price, less the debt still owed, plus any cash built up.', formula: 'equity out = exit multiple × EBITDA − debt + cash', working: fm(r.ev_out) + ' − ' + fm(yN.debt) + ' + ' + fm(yN.cash) + ' = ' + fm(r.equity_out), source: SRC_B, more: 'method.html#buyout' }), fm(r.equity_out), 'price ' + fm(r.ev_out) + ', debt ' + fm(yN.debt)]
    ];
  }
  function drawBridge(r) {
    var yN = r.years[r.years.length - 1], b = r.bridge, ein = r.equity_in, e1 = ein + b.growth, e2 = e1 + b.multiple, e3 = e2 + b.deleveraging;
    var rows = [
      { label: 'Equity in', a: 0, b: ein, tot: true, text: fm(ein), s: spec({ title: 'Equity in', def: 'The equity cheque at entry.', formula: 'entry price − debt', working: fm(r.ev_in) + ' − ' + fm(r.debt0) + ' = ' + fm(ein), source: SRC_B, more: 'method.html#buyout' }) },
      { label: 'EBITDA growth', a: ein, b: e1, text: fms(b.growth), s: spec({ title: 'Value from EBITDA growth', def: 'The extra value from earnings growing, priced at the entry multiple.', formula: '(EBITDA in year ' + YEARS + ' − EBITDA at entry) × entry multiple', working: '(' + fm(yN.ebitda) + ' − ' + fm(EBITDA0) + ') × ' + L.mult(S.entry) + ' = ' + fms(b.growth), source: SRC_B, more: 'method.html#buyout' }) },
      { label: 'Multiple change', a: e1, b: e2, text: fms(b.multiple), s: spec({ title: 'Value from the change in multiple', def: 'The gain or loss from selling at a different multiple than the one paid. Zero when exit equals entry.', formula: '(exit multiple − entry multiple) × EBITDA in year ' + YEARS, working: '(' + L.mult(S.exit) + ' − ' + L.mult(S.entry) + ') × ' + fm(yN.ebitda) + ' = ' + fms(b.multiple), source: SRC_B, more: 'method.html#buyout' }) },
      { label: 'Debt paydown', a: e2, b: e3, text: fms(b.deleveraging), s: spec({ title: 'Value from debt paydown and cash', def: 'Cash the business generates after interest, used to repay debt and then kept as cash. If cash flow is negative, debt grows and this part is negative.', formula: '(debt at entry − debt in year ' + YEARS + ') + cash in year ' + YEARS, working: '(' + fm(r.debt0) + ' − ' + fm(yN.debt) + ') + ' + fm(yN.cash) + ' = ' + fms(b.deleveraging), source: SRC_B, more: 'method.html#buyout' }) },
      { label: 'Equity out', a: 0, b: r.equity_out, tot: true, text: fm(r.equity_out), s: spec({ title: 'Equity out', def: 'Equity at exit: the three parts above added to the equity put in.', formula: 'equity in + growth + multiple change + debt paydown', working: fm(ein) + ' ' + fms(b.growth) + ' ' + fms(b.multiple) + ' ' + fms(b.deleveraging) + ' = ' + fm(r.equity_out), source: SRC_B, more: 'method.html#buyout' }) }
    ];
    L.chart(P.bridgeHost, function (h, w) {
      var rh = 36, H = rows.length * rh + 4, labW = Math.min(132, w * 0.34), neg = rows.some(function (x) { return x.b < x.a; }), valW = 70;
      var lo = Math.min.apply(null, rows.map(function (x) { return Math.min(x.a, x.b); }).concat([0])), hi = Math.max.apply(null, rows.map(function (x) { return Math.max(x.a, x.b); }).concat([0]));
      var x = L.scale(lo, hi, labW + (neg ? valW : 0), w - valW), svg = svgRoot(w, H, 'Returns bridge in $m: ' + rows.map(function (q) { return q.label + ' ' + q.text; }).join('; ') + '.');
      svg.appendChild(sv('line', { x1: x(0), x2: x(0), y1: 0, y2: H, stroke: C.ink, 'stroke-width': 1 }));
      rows.forEach(function (q, i) {
        var cy = 2 + i * rh + rh / 2, g = sv('g'), x1 = Math.min(x(q.a), x(q.b)), x2 = Math.max(x(q.a), x(q.b)), right = q.b >= q.a;
        g.appendChild(sv('rect', { x: 0, y: cy - rh / 2, width: w, height: rh, fill: 'transparent' }));
        g.appendChild(sv('text', { x: 0, y: cy + 4.5, 'font-size': 14, fill: C.ink, 'font-weight': q.tot ? 600 : 400 }, q.label));
        g.appendChild(sv('rect', { x: x1, y: cy - 8, width: Math.max(2, x2 - x1), height: 16, rx: 2, fill: q.tot ? C.ink : C.ink2, 'fill-opacity': q.tot ? 1 : 0.55 }));
        g.appendChild(sv('text', { x: right ? x2 + 8 : x1 - 8, y: cy + 4.5, 'text-anchor': right ? 'start' : 'end', 'font-size': 14, 'font-weight': 600, fill: C.ink }, q.text));
        L.tip(g, q.s); g.setAttribute('aria-label', q.label + ' ' + q.text);
        svg.appendChild(g);
      });
      h.appendChild(svg);
    });
  }
  function renderYears(r, pr) {
    var rows = [{ t: 0, ebitda: EBITDA0, interest: null, fcf: null, debt: r.debt0, cash: 0 }].concat(r.years);
    var t = el('table', { 'class': 'dtable mt ytable' });
    t.appendChild(el('thead', null, el('tr', null, ['Year', 'EBITDA', 'Interest', 'Cash flow after interest', 'Debt', 'Cash'].map(function (hh, i) { return el('th', { scope: 'col', 'class': i ? 'r' : '' }, hh); }))));
    var tb = el('tbody');
    function cell(label, key, row, v) {
      if (v == null) return el('td', { 'class': 'r', 'data-l': label }, el('span', { 'class': 'rs' }, '–'));
      var w = {
        ebitda: ['EBITDA, year ' + row.t, 'EBITDA grown at ' + L.pct(S.growth / 100) + ' a year.', 'EBITDA(t) = EBITDA(t−1) × (1 + growth)'],
        interest: ['Interest, year ' + row.t, 'The interest rate on the debt at the start of the year.', 'interest = rate × debt at the start of the year'],
        fcf: ['Cash flow after interest, year ' + row.t, 'Cash conversion times EBITDA, less interest. It repays debt first; any surplus is kept as cash. If negative, debt grows.', 'cash flow = conversion × EBITDA − interest'],
        debt: ['Debt, end of year ' + row.t, 'Debt left after the year’s cash flow is applied.', 'debt = max(debt − cash flow, 0); debt grows if cash flow is negative'],
        cash: ['Cash, end of year ' + row.t, 'Cash kept once the debt is fully repaid.', 'cash = cash + cash flow left after repaying debt']
      }[key];
      return el('td', { 'class': 'r', 'data-l': label }, nt(fm(v), spec({ title: w[0], def: w[1], formula: w[2], working: fm(v) + ' at ' + L.pct(pr.rate, 2) + ' interest.', source: SRC_B, more: 'method.html#buyout' })));
    }
    rows.forEach(function (row) {
      tb.appendChild(el('tr', null, [el('th', { scope: 'row' }, row.t === 0 ? 'Entry' : 'Year ' + row.t), cell('EBITDA', 'ebitda', row, row.ebitda), cell('Interest', 'interest', row, row.interest), cell('Cash flow', 'fcf', row, row.fcf), cell('Debt', 'debt', row, row.debt), cell('Cash', 'cash', row, row.cash)]));
    });
    t.appendChild(tb); P.ytable.textContent = ''; P.ytable.appendChild(t);
    P.ynote.textContent = '$m, hypothetical. Interest is ' + L.pct(pr.rate, 2) + ' (' + rateText() + ') on the debt at the start of each year. Cash flow repays debt first; once debt is zero it builds as cash.';
  }

  function refresh() {
    if (!P.title || !SOFR) return;
    var pr = params(), r = LBO.lbo(pr), mid = L.mult(S.entry), debt = lev(S.leverage);
    P.rate.textContent = '';
    P.rate.appendChild(L.tipLabel(rateText() + ' = ' + L.num(SOFR.value + S.spread, 2) + '% a year', spec({ title: 'Interest rate on the debt', def: 'The base rate plus a spread. SOFR is the US overnight secured funding rate, read from the Financing data; the spread is a stated assumption.', formula: 'rate = SOFR + spread', working: sofrText() + ' + ' + L.num(S.spread, 2) + ' pp = ' + L.num(SOFR.value + S.spread, 2) + '% a year.', source: 'Federal Reserve Bank of New York, SOFR, ' + L.date(SOFR.period) + '. Spread: assumption.', more: 'method.html#sofr' })));
    CT.forEach(function (ct) { var i = $('b-' + ct.k); if (i) i.style.setProperty('--p', ((+i.value - +i.min) / (+i.max - +i.min) * 100) + '%'); });
    var title;
    P.tiles.textContent = ''; P.psHost.textContent = ''; P.evline.textContent = '';
    if (!r) {
      title = S.leverage >= S.entry ? 'Debt exceeds the purchase price, so this hypothetical buyout has no result.' : 'These inputs give no result for this hypothetical buyout.';
      P.title.textContent = title; P.bridgeHost.textContent = ''; P.ytable.textContent = ''; P.bnote.textContent = '';
      P.psHost.appendChild(el('p', { 'class': 'cap' }, 'No IRR range: there is no result at these inputs.'));
      announce(title); return;
    }
    if (r.irr == null) title = 'At ' + mid + ' entry and ' + debt + ' debt, the equity is wiped out in this hypothetical buyout.';
    else title = 'At ' + mid + ' entry and ' + debt + ' debt, this hypothetical buyout returns ' + L.pct(r.irr) + ' a year over ' + L.word(YEARS) + ' years (' + L.mult(r.moic) + ' money).';
    P.title.textContent = title; announce(title);
    if (r.irr != null) tileSpecs(r, pr).forEach(function (x) { P.tiles.appendChild(tile(x[0], x[1], x[2], x[3])); });
    else P.tiles.appendChild(tile('Equity at exit', spec({ title: 'Equity at exit', def: 'Sale price less debt plus cash; not above zero here, so there is no IRR.', working: fm(r.equity_out), source: SRC_B }), fm(r.equity_out), 'the equity is wiped out'));
    var rg = LBO.lboRange(pr);
    if (rg && rg.low != null && rg.high != null && rg.mid != null) {
      var rs = spec({ title: 'The range, not a point', def: 'The bar spans the IRR if the company is sold one turn of EBITDA below the exit multiple (low) and one turn above (high). The pale tick is the exit multiple you set.', formula: 'IRR at exit − 1×, exit, exit + 1×', working: 'Exit ' + L.mult(rg.exits[0]) + ': ' + L.pct(rg.low) + '; ' + L.mult(rg.exits[1]) + ': ' + L.pct(rg.mid) + '; ' + L.mult(rg.exits[2]) + ': ' + L.pct(rg.high) + '.', source: SRC_B, caution: 'Hypothetical model on stated assumptions; not investment advice.', more: 'method.html#buyout' });
      L.range(P.psHost, { name: 'IRR', low: rg.low, mid: rg.mid, high: rg.high, fmt: function (v) { return L.pct(v); }, spec: rs });
      P.evline.appendChild(L.tipLabel('Exit ' + L.mult(rg.exits[0]) + ' to ' + L.mult(rg.exits[2]), rs));
      P.evline.appendChild(document.createTextNode(', central ' + L.mult(rg.exits[1]) + '. One turn is one times EBITDA.'));
    } else {
      P.psHost.appendChild(el('p', { 'class': 'cap' }, 'No IRR range: at one end of the exit multiple the equity is wiped out.'));
    }
    drawBridge(r);
    P.bnote.textContent = 'The three parts add up exactly to equity out less equity in: ' + fms(r.bridge.growth) + ' ' + fms(r.bridge.multiple) + ' ' + fms(r.bridge.deleveraging) + ' = ' + fms(r.equity_out - r.equity_in) + '. Hypothetical.';
    renderYears(r, pr);
  }

  /* ---------- notes and provenance ---------- */
  function renderNotes() {
    var ul = el('ul', { 'class': 'list' });
    D.notes.forEach(function (t) { if (/^Source: SEC EDGAR/.test(t)) return; ul.appendChild(el('li', null, t)); });
    ul.appendChild(el('li', null, 'Buyout maths: hypothetical and generic, with $' + L.num(EBITDA0) + 'm of EBITDA and no real company. The model is in lbo_math.js; its defaults are stated assumptions, not forecasts. The base rate is SOFR from the Financing data' + (SOFR ? ', ' + L.date(SOFR.period) + '.' : '.')));
    if (MAC && MAC.series) { var s = MAC.series.filter(function (x) { return x.id === 'us_sofr'; })[0]; if (s && s.credit) ul.appendChild(el('li', null, s.credit)); }
    ul.appendChild(el('li', null, 'Refreshed ' + L.date(D.as_of) + ' from SEC EDGAR (full-text search, Form ADV roster ' + L.date(D.roster_date) + ', Form D data sets ' + qLabel(D.formd_quarters[0]) + ' to ' + qLabel(D.formd_quarters[D.formd_quarters.length - 1]) + '). Not investment advice.'));
    $('notes').appendChild(el('div', { 'class': 'folds' }, el('details', { 'class': 'fold' }, [el('summary', null, ['Notes and sources', el('small', null, 'how the deal figures are built')]), el('div', { 'class': 'fold-body' }, ul)])));
    $('notes').appendChild(el('p', { 'class': 'disc' }, 'Not investment advice. Filings are counted by filing date; they are not announcements.'));
  }

  /* ---------- page ---------- */
  buildTabs();
  Promise.all([L.load('deals_room'), L.load('macro_room').catch(function () { return null; })]).then(function (r) {
    D = r[0]; MAC = r[1];
    var s = MAC && MAC.series && MAC.series.filter(function (x) { return x.id === 'us_sofr'; })[0];
    SOFR = s && s.latest && L.isNum(s.latest.value) ? { value: s.latest.value, period: s.latest.period } : null;
    var src = [{ key: 'deals', name: 'Deal filings and sponsors (SEC)', stamp: D.as_of }];
    if (MAC && MAC.export) src.push({ key: 'macro', name: 'SOFR (New York Fed)', stamp: MAC.export.exported_at });
    L.status(src);
    renderHeader(); renderFilings(); renderSponsors(); renderFund(); renderBuyout(); renderNotes();
    var tab = (location.hash || '').replace('#', '');
    selectTab(TABS.some(function (t) { return t.id === tab; }) ? tab : 'filings', false);
    window.addEventListener('hashchange', function () { var h = location.hash.replace('#', ''); if (TABS.some(function (t) { return t.id === h; })) selectTab(h, false); });
  }).catch(L.fail);
})();
