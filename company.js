/* Company page: fixed header, four tabs (Earnings, Value, Cash & debt, Sources) and the price box.
   Valuation maths is company_math.js (unchanged). The price you type is used in this browser only. */
(function () {
  'use strict';
  var L = Lab, el = L.el, $ = L.$, CM = window.CompanyMath, MINUS = L.MINUS;
  L.shell({ page: 'companies' });

  /* UI settings, not data: slider limits, grid steps, range width, reverse-DCF search range */
  var LIMITS = { growth: null, margin: [0.01, 0.6], rate: [0.04, 0.16], terminal: [0, 0.04] }, STEP = 0.001, PAGE = 0.01;
  var GRID5 = [-0.10, -0.05, 0, 0.05, 0.10], GRID3 = [-0.05, 0, 0.05], RANGE_PP = 0.01, SEARCH = [-0.5, 1.0];
  var TABS = [{ id: 'earnings', name: 'Earnings' }, { id: 'value', name: 'Value' }, { id: 'cash', name: 'Cash & debt' }, { id: 'sources', name: 'Sources' }];
  var DISC = 'Hypothetical model on stated assumptions; not investment advice; no price targets.';

  var D, S = { co: null, price: null, p: null, def: null, claims: null, shares: null, tab: 'earnings', full: window.innerWidth > 620 };
  var P = {};

  /* ---------- data access ---------- */
  function val(n) { return n && L.isNum(n.value) ? n.value : null; }
  function F(c, k) { return c.fundamentals && c.fundamentals[k]; }
  function V(c, k) { return c.valuation && c.valuation[k]; }
  function usdOr(v, none) { return L.isNum(v) ? L.usd(v) : (none || 'n/a'); }
  /* never show SEC tag names: map reasons and formulas to plain words */
  var TAGS = [[/OperatingIncomeLoss/, 'No operating income line in this 10-K'], [/MinorityInterest/, 'No non-controlling interest in this 10-K'], [/MarketableSecurities|ShortTermInvestments|AvailableForSale/, 'No short-term investments in this 10-K'], [/InventoryNet/, 'No inventory line in this 10-K'], [/AccountsReceivable/, 'No receivables line in this 10-K'], [/AccountsPayable/, 'No payables line in this 10-K'], [/InterestExpense/, 'No interest expense line in this 10-K'], [/CostOfGoods|CostOfRevenue/, 'No cost of goods sold line in this 10-K']];
  function reasonText(r) {
    if (!r) return 'Not reported in this 10-K';
    if (/[a-z][A-Z]/.test(r)) { for (var i = 0; i < TAGS.length; i++) if (TAGS[i][0].test(r)) return TAGS[i][1]; return 'Not reported in this 10-K'; }
    return r.charAt(0).toUpperCase() + r.slice(1);
  }
  function why(n) { return reasonText(n && n.reason); }
  var WORDSF = { cfo: 'cash from operations', capex: 'capital spending', da: 'depreciation and amortisation', ufcf: 'unlevered FCF' };
  function plainFormula(f) {
    if (!f) return null;
    if (/^[A-Za-z]+$/.test(f) && /[a-z][A-Z]/.test(f)) return 'as filed';
    f = f.replace(/[A-Z][a-z]+(?:[A-Z][a-z]+)+/g, function (t) { return t.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(); });
    return f.replace(/[a-z_]+/g, function (w) { return WORDSF[w] || w.replace(/_/g, ' '); }).replace(/ - /g, ' \u2212 ');
  }
  function claims(c) { return { debt: val(V(c, 'debt')), finance_leases: val(V(c, 'finance_leases')), nci: val(V(c, 'nci')), cash: val(V(c, 'cash')), short_term_investments: val(V(c, 'short_term_investments')) }; }
  function missing(c) {
    var k = claims(c), o = [];
    [['finance_leases', 'finance leases'], ['nci', 'non-controlling interest'], ['short_term_investments', 'short-term investments']].forEach(function (x) { if (k[x[0]] == null) o.push(x[1]); });
    return o;
  }
  function priceTxt(v) { return L.num(v, v % 1 ? 2 : 0); }
  function sharesText() { return L.num(S.shares / 1e9, 2) + 'bn'; }
  function filedOf(c) { var i = c.prior && c.prior.revenue && c.prior.revenue.inputs && c.prior.revenue.inputs[0]; return i && i.filed || null; }

  /* ---------- plain-language definitions for the analyst note ---------- */
  var DEFS = LabGlossary.DEFS;
  function srcText(c) { return '10-K, fiscal year to ' + L.date(c.fy.end) + (filedOf(c) ? ', filed ' + L.date(filedOf(c)) + '.' : '.'); }
  function hrefOf(node) { var i = node && node.inputs && node.inputs[0]; return i && i.filing_url || null; }
  function note(c, key, node, o) {
    o = o || {};
    var d = DEFS[key] || [key, ''], s = { title: d[0], def: d[1], formula: plainFormula(o.formula || (node && node.formula) || null), working: o.working || null, source: o.source || srcText(c), href: o.href === undefined ? hrefOf(node) : o.href, more: 'method.html#' + key };
    if (node && !L.isNum(node.value)) s.caution = 'Not shown: ' + reasonText(node.reason).toLowerCase() + '.';
    if (o.caution) s.caution = o.caution;
    return s;
  }
  function inputsSum(node) { var a = (node && node.inputs || []).map(function (i) { return i.value; }); return a.length > 1 ? a.map(L.usd).join(' + ') + ' = ' + L.usd(node.value) : null; }
  function working(c, key, node) {
    var f = c.fundamentals, v = c.valuation, n = val(node);
    if (n == null) return null;
    if (key === 'growth_yoy') return L.usd(val(f.revenue)) + ' / ' + L.usd(val(f.revenue_prior)) + ' − 1 = ' + L.pctS(n);
    if (key === 'operating_margin') return L.usd(val(f.operating_income)) + ' / ' + L.usd(val(f.revenue)) + ' = ' + L.pct(n);
    if (key === 'fcf_margin') return L.usd(val(f.fcf)) + ' / ' + L.usd(val(f.revenue)) + ' = ' + L.pct(n);
    if (key === 'ebitda') return L.usd(val(f.operating_income)) + ' + ' + L.usd(val(v.da)) + ' = ' + L.usd(n);
    if (key === 'fcf') return L.usd(val(f.cfo)) + ' − ' + L.usd(val(f.capex)) + ' = ' + L.usd(n);
    if (key === 'debt') return inputsSum(node);
    if (key === 'ccc') return L.days(val(v.dio)) + ' + ' + L.days(val(v.dso)) + ' − ' + L.days(val(v.dpo)) + ' = ' + L.days(n) + ' days';
    return null;
  }
  function nodeNote(c, key, node) { return note(c, key, node, { working: working(c, key, node) }); }

  /* ---------- small builders ---------- */
  function logo(c) {
    var b = el('span', { 'class': 'lg', 'aria-hidden': 'true' });
    if (c.logo && c.logo.file) {
      var i = el('i'); i.style.setProperty('--lg', 'url("' + c.logo.file + '")');
      if (/^[0-9a-fA-F]{6}$/.test(c.logo.hex || '')) i.style.background = '#' + c.logo.hex;
      b.appendChild(i);
    } else b.appendChild(el('b', null, String(c.ticker).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4)));
    return b;
  }
  function tile(label, sp, value, sub, cls) {
    return el('div', { 'class': cls || 'tile' }, [el('span', { 'class': 'tl' }, L.tipLabel(label, sp)), el('span', { 'class': 'tv' }, value), el('span', { 'class': 'ts' }, sub || '')]);
  }
  function rangeText(lo, hi, fmt) {
    var a = fmt(lo), b = fmt(hi), m = /([a-z]+)$/.exec(a), n = /([a-z]+)$/.exec(b);
    if (m && n && m[1] === n[1]) a = a.slice(0, -m[1].length);
    return a + '–' + b.replace(/^\$/, '');
  }
  function growthChip(c) { var g = val(F(c, 'growth_yoy')); return g == null ? '' : L.chg(g, L.pctS(g) + ' vs FY' + (c.fy.fy - 1)); }
  var liveT = null;
  function announce(text) { clearTimeout(liveT); liveT = setTimeout(function () { if (P.live) P.live.textContent = text; }, 400); }
  function disc(txt) { return el('p', { 'class': 'disc' }, txt); }

  /* ---------- the price box maths: company_math.js plus simple arithmetic ---------- */
  function priceCalc() {
    var c = S.co, price = S.price, r = { price: price };
    if (price == null || !S.shares) return r;
    r.mcap = price * S.shares;
    var eps = val(V(c, 'eps_diluted')); r.eps = eps; r.pe = eps > 0 ? price / eps : null;
    if (c.financial) return r;
    r.net = CM.netClaims(S.claims); r.ev = r.mcap + r.net;
    r.ebitda = val(V(c, 'ebitda')); r.evEbitda = r.ebitda > 0 ? r.ev / r.ebitda : null;
    if (S.p && r.ev > 0) r.implied = CM.reverseGrowth(S.p, r.ev, SEARCH[0], SEARCH[1]);
    return r;
  }

  /* ---------- three kinds of company: industrial, bank (SIC 60-62), insurer (SIC 63-64) ---------- */
  function kindOf(c) {
    if (!c.financial) return 'industrial';
    return c.sic >= 6300 && c.sic < 6500 ? 'insurer' : 'bank';
  }
  function revenueOf(c) { return val(F(c, 'revenue')); }
  function netMargin(c) { var ni = val(V(c, 'net_income')), rev = revenueOf(c); return ni != null && rev > 0 ? ni / rev : null; }
  function netMarginNote(c) {
    var ni = val(V(c, 'net_income')), rev = revenueOf(c), m = netMargin(c);
    return { title: 'Net margin', def: 'The share of each revenue dollar left as profit after all costs, interest and tax.', formula: 'net income / revenue', working: m == null ? null : L.usd(ni) + ' / ' + L.usd(rev) + ' = ' + L.pct(m), source: srcText(c), href: hrefOf(V(c, 'net_income')), caution: m == null ? 'Not shown: net income or revenue is not reported.' : null, more: 'method.html#net_margin' };
  }
  function opMargin(c) { var m = val(F(c, 'operating_margin')); if (m != null) return m; var o = val(F(c, 'operating_income')), r = revenueOf(c); return o != null && r > 0 ? o / r : null; }
  function opMarginNote(c) {
    var m = opMargin(c), o = val(F(c, 'operating_income')), r = revenueOf(c);
    return { title: DEFS.operating_margin[0], def: DEFS.operating_margin[1], formula: 'operating income / revenue', working: m == null ? null : L.usd(o) + ' / ' + L.usd(r) + ' = ' + L.pct(m), source: srcText(c), href: hrefOf(F(c, 'operating_income')), caution: kindOf(c) === 'insurer' ? 'The Lab classes companies by SIC code and does not split business segments.' : null, more: 'method.html#operating_margin' };
  }
  function finCopy(kind) {
    return kind === 'insurer'
      ? 'Insurers hold customers’ premiums as reserves and investments, so net debt and free cash flow do not mean what they mean for an industrial company.'
      : 'For banks, deposits and trading liabilities are the business itself, not financing.';
  }

  /* ---------- header ---------- */
  function renderHeader(c) {
    var nm = L.niceName(c.name), kind = kindOf(c);
    $('logo').textContent = ''; $('logo').appendChild(logo(c));
    $('h1').textContent = ''; $('h1').appendChild(document.createTextNode(nm)); $('h1').appendChild(el('span', { 'class': 'tk' }, c.ticker));
    $('filed').textContent = 'FY' + c.fy.fy + ' · 10-K' + (filedOf(c) ? ' filed ' + L.date(filedOf(c)) : '') + ' · fiscal year to ' + L.date(c.fy.end);
    document.title = nm + ' · The Lab · Asadbek Abdurashidov';
    var f = $('figs'); f.textContent = '';
    function fig(label, sp, value, sub) { f.appendChild(el('div', { 'class': 'fig' }, [el('span', { 'class': 'fl' }, L.tipLabel(label, sp)), el('span', { 'class': 'fv' }, value), el('span', { 'class': 'fs' }, sub || '')])); }
    var rev = F(c, 'revenue'), om = F(c, 'operating_margin'), fcf = F(c, 'fcf'), eb = V(c, 'ebitda'), ni = V(c, 'net_income'), eps = V(c, 'eps_diluted'), nmg = netMargin(c);
    fig('Revenue', nodeNote(c, 'revenue', rev), usdOr(val(rev)), growthChip(c));
    if (kind === 'industrial') {
      fig('EBITDA', nodeNote(c, 'ebitda', eb), usdOr(val(eb)), L.isNum(c.derived && c.derived.ebitda_margin) ? L.pct(c.derived.ebitda_margin) + ' margin' : why(eb));
      fig('Operating margin', nodeNote(c, 'operating_margin', om), L.isNum(val(om)) ? L.pct(val(om)) : 'n/a', L.isNum(val(F(c, 'operating_income'))) ? 'operating income ' + L.usd(val(F(c, 'operating_income'))) : why(F(c, 'operating_income')));
      fig('Free cash flow', nodeNote(c, 'fcf', fcf), usdOr(val(fcf)), L.isNum(val(F(c, 'fcf_margin'))) ? L.pct(val(F(c, 'fcf_margin'))) + ' of revenue' : why(fcf));
      return;
    }
    var opm = kind === 'insurer' ? opMargin(c) : null;
    if (opm != null) fig('Operating margin', opMarginNote(c), L.pct(opm), 'operating income ' + L.usd(val(F(c, 'operating_income'))));
    fig('Net income', nodeNote(c, 'net_income', ni), usdOr(val(ni)), nmg != null ? L.pct(nmg) + ' of revenue' : why(ni));
    fig('Diluted EPS', nodeNote(c, 'eps_diluted', eps), L.isNum(val(eps)) ? '$' + L.num(val(eps), 2) : 'n/a', 'per diluted share');
    if (opm == null) fig('Net margin', netMarginNote(c), nmg == null ? 'n/a' : L.pct(nmg), 'net income / revenue');
  }

  /* ---------- tabs (shared component in lab.js) ---------- */
  var TABCTL = null;
  function selectTab(id, push) { S.tab = id; TABCTL.select(id, push); }

  /* ---------- Earnings: what the header does not show ---------- */
  function renderEarnings(c) {
    var p = $('panel-earnings'); p.textContent = '';
    var kind = kindOf(c), nm = L.shortName(c.name), fy = 'FY' + c.fy.fy, pfy = 'FY' + (c.fy.fy - 1);
    var rev = revenueOf(c), g = val(F(c, 'growth_yoy')), om = val(F(c, 'operating_margin')), ni = val(V(c, 'net_income')), eps = val(V(c, 'eps_diluted')), fcf = val(F(c, 'fcf')), opi = val(F(c, 'operating_income'));
    var title, growth = g != null ? ', ' + (g < 0 ? 'down ' : 'up ') + L.pct(Math.abs(g)) + ' on the year' : '';
    if (rev == null) title = 'Revenue for ' + nm + ' is not reported in the filing data.';
    else if (kind === 'industrial') title = nm + ' earned ' + L.usd(rev) + ' of revenue in ' + fy + growth + (om != null ? ', at a ' + L.pct(om) + ' operating margin.' : '.');
    else title = nm + ' earned ' + L.usd(rev) + ' of revenue in ' + fy + growth + (ni != null ? ', and ' + L.usd(ni) + ' of net income.' : '.');
    var hy = (c.history && c.history.years) || [], useH = hy.length >= 3, cg = c.history && c.history.revenue_cagr;
    var hasNI = useH && hy.some(function (y) { return L.isNum(y.net_income); });
    var head = el('div', { 'class': 'panel-head' }, el('h2', { 'class': 'statement' }, title));
    if (useH && cg && L.isNum(cg.value)) {
      var spanTxt = L.word(c.history.cagr_years) + ' year' + (c.history.cagr_years === 1 ? '' : 's');
      head.appendChild(el('p', { 'class': 't-second second' }, [L.tipLabel('Over ' + spanTxt, historyCagrNote(c)), ' (' + fyLabel(c, hy[0]) + '–' + fyLabel(c, hy[hy.length - 1]) + '), revenue ' + (cg.value < 0 ? 'fell ' + L.pct(-cg.value) : 'grew ' + L.pct(cg.value)) + ' a year.']));
    }
    p.appendChild(head);
    var dv = c.derived || {}, tiles = [];
    if (kind === 'industrial') {
      tiles.push(['Operating income', nodeNote(c, 'operating_income', F(c, 'operating_income')), usdOr(opi), L.isNum(om) ? L.pct(om) + ' of revenue' : why(F(c, 'operating_income'))]);
      tiles.push(['Unlevered FCF', { title: DEFS.ufcf[0], def: DEFS.ufcf[1], formula: plainFormula(dv.ufcf_formula), working: L.isNum(dv.ufcf) ? L.usd(dv.ufcf) : null, source: srcText(c), href: hrefOf(F(c, 'fcf')), caution: L.isNum(dv.ufcf) ? null : 'Not shown: ' + (dv.ufcf_reason || 'not available') + '.', more: 'method.html#ufcf' }, L.isNum(dv.ufcf) ? L.usd(dv.ufcf) : 'n/a', L.isNum(dv.ufcf_margin) ? L.pct(dv.ufcf_margin) + ' of revenue' : (dv.ufcf_reason || '')]);
      tiles.push(['Net income', nodeNote(c, 'net_income', V(c, 'net_income')), usdOr(ni), netMargin(c) != null ? L.pct(netMargin(c)) + ' net margin' : why(V(c, 'net_income'))]);
      tiles.push(['Diluted EPS', nodeNote(c, 'eps_diluted', V(c, 'eps_diluted')), L.isNum(eps) ? '$' + L.num(eps, 2) : 'n/a', 'per diluted share']);
    } else if (kind === 'insurer') {
      var nmg = netMargin(c);
      if (opMargin(c) != null) tiles.push(['Net margin', netMarginNote(c), nmg == null ? 'n/a' : L.pct(nmg), 'net income / revenue']);
      if (opMargin(c) != null) tiles.push(['Operating income', nodeNote(c, 'operating_income', F(c, 'operating_income')), usdOr(opi), L.pct(opMargin(c)) + ' of revenue']);
    }
    if (tiles.length) {
      var t = el('div', { 'class': 'tiles t' + Math.min(tiles.length, 4) });
      tiles.forEach(function (x) { t.appendChild(tile(x[0], x[1], x[2], x[3])); });
      p.appendChild(t);
    }
    var specs = [['Revenue', 'revenue', val(F(c, 'revenue_prior')), rev, F(c, 'revenue')]];
    if (kind !== 'bank') specs.push(['Operating income', 'operating_income', c.prior && val(c.prior.operating_income), opi, F(c, 'operating_income')]);
    if (kind === 'industrial') specs.push(['Free cash flow', 'fcf', c.prior && val(c.prior.fcf), fcf, F(c, 'fcf')]);
    else specs.push(['Net income', 'net_income', null, ni, V(c, 'net_income')]);
    specs = specs.filter(function (x) { return L.isNum(x[3]) && ((useH && (x[1] !== 'net_income' || hasNI)) || L.isNum(x[2])); });
    var cs = el('div', { 'class': 'charts3 n' + specs.length });
    specs.forEach(function (x) {
      var box = el('div'), host = el('div', { 'class': 'chart' }), multi = useH && (x[1] !== 'net_income' || hasNI);
      box.appendChild(el('h3', { 'class': 'box-t' }, x[0] + (multi ? ', ' + L.word(hy.length) + ' fiscal years' : (L.isNum(x[2]) ? ', two fiscal years' : ', ' + fy)))); box.appendChild(host); cs.appendChild(box);
      if (multi) {
        L.bars(host, { name: x[0], fmt: L.usd, items: hy.map(function (y) { return { label: fyLabel(c, y), short: "'" + fyLabel(c, y).slice(-2), v: L.isNum(y[x[1]]) ? y[x[1]] : null, spec: yearNote(c, x[1], x[4], y) }; }) });
        return;
      }
      L.pair(host, { name: x[0], prior: x[2], cur: x[3], priorLabel: pfy, curLabel: fy, fmt: L.usd,
        spec: function (which) { var n = nodeNote(c, x[1], x[4]); n.working = (which === 'cur' ? fy : pfy) + ': ' + L.usd(which === 'cur' ? x[3] : x[2]); return n; } });
    });
    p.appendChild(cs);
    /* table: the history years for revenue, operating income and FCF; EBITDA and net income for the latest year */
    var yrs = useH ? hy : [{ end: null, label: pfy }, { end: c.fy.end, label: fy }];
    function yl(y) { return y.label || fyLabel(c, y); }
    function hv(key, i) {
      if (useH) return L.isNum(hy[i][key]) ? hy[i][key] : null;
      if (i === 1) return val(key === 'revenue' ? F(c, 'revenue') : key === 'operating_income' ? F(c, 'operating_income') : F(c, 'fcf'));
      return key === 'revenue' ? val(F(c, 'revenue_prior')) : (c.prior && val(c.prior[key]));
    }
    var rows = [['Revenue', 'revenue', F(c, 'revenue'), true]];
    if (kind !== 'bank') rows.push(['Operating income', 'operating_income', F(c, 'operating_income'), true]);
    if (kind === 'industrial') { rows.push(['Free cash flow', 'fcf', F(c, 'fcf'), true]); if (!useH) rows.push(['EBITDA', 'ebitda', V(c, 'ebitda'), false]); }
    if (hasNI) rows.push(['Net income', 'net_income', V(c, 'net_income'), true]); else if (!useH) rows.push(['Net income', 'net_income', V(c, 'net_income'), false]);
    var tb = el('tbody'), last = yrs.length - 1;
    rows.forEach(function (x) {
      var cur = x[3] ? hv(x[1], last) : val(x[2]); if (cur == null) return;
      var pr = x[3] ? hv(x[1], last - 1) : null, ch = L.isNum(pr) && pr > 0 ? cur / pr - 1 : null;
      var cells = [el('th', { scope: 'row' }, L.tipLabel(x[0], nodeNote(c, x[1], x[2])))];
      yrs.forEach(function (y, i) {
        var v = i === last ? cur : (x[3] ? hv(x[1], i) : null);
        cells.push(el('td', { 'class': 'r' }, L.isNum(v) ? L.usd(v) : el('span', { 'class': 'rs' }, '–')));
      });
      cells.push(el('td', { 'class': 'r' }, ch == null ? el('span', { 'class': 'rs' }, '–') : L.chg(ch, L.pctS(ch))));
      tb.appendChild(el('tr', null, cells));
    });
    var tab = el('table', { 'class': 'dtable' });
    tab.appendChild(el('thead', null, el('tr', null, [el('th', { scope: 'col' }, 'USD')].concat(yrs.map(function (y) { return el('th', { scope: 'col', 'class': 'r' }, yl(y)); }), [el('th', { scope: 'col', 'class': 'r' }, 'Change')]))));
    tab.appendChild(tb);
    p.appendChild(el('div', { 'class': 'table-scroll', style: 'margin-top:20px', tabindex: '0', role: 'region', 'aria-label': 'Earnings, ' + L.word(yrs.length) + ' fiscal years. Scrolls sideways if narrow.' }, tab));
    var stop = c.history && c.history.stop;
    p.appendChild(el('p', { 'class': 'cap' }, useH
      ? 'USD. ' + L.word(hy.length).replace(/^./, function (s) { return s.toUpperCase(); }) + ' fiscal years back to back, each as last reported in a 10-K, so restated figures replace the originals. Latest year in navy. Change compares the last two years.' + (hy.length < 5 && stop ? ' Earlier years are not shown: ' + reasonText(stop).toLowerCase() + '.' : '') + ' Source: SEC EDGAR 10-K. Not investment advice.'
      : 'USD. Latest fiscal year in navy, the year before in grey, both from the same 10-K.' + (stop ? ' No longer history: ' + reasonText(stop).toLowerCase() + '.' : '') + ' Source: SEC EDGAR 10-K, fiscal year to ' + L.date(c.fy.end) + '. Not investment advice.'));
  }
  /* fiscal-year label for a history year: the company's FY number, offset from the year the period ends */
  function fyLabel(c, y) { var off = c.fy.fy - +String(c.fy.end).slice(0, 4); return 'FY' + (+String(y.end).slice(0, 4) + off); }
  function yearNote(c, key, node, y) {
    return function () {
      var n = nodeNote(c, key, node), v = y[key];
      n.working = fyLabel(c, y) + ' (to ' + L.date(y.end) + '): ' + (L.isNum(v) ? L.usd(v) : 'not reported');
      n.source = '10-K that last reported the fiscal year to ' + L.date(y.end) + '.';
      n.href = y.filing_url || null;
      n.caution = L.isNum(v) ? null : 'Not shown: ' + reasonText(y.reasons && y.reasons[key]).toLowerCase() + '.';
      if (key === 'fcf' && L.isNum(v)) n.formula = plainFormula('cfo - capex');
      return n;
    };
  }
  function historyCagrNote(c) {
    var g = c.history.revenue_cagr, hy = c.history.years, a = hy[0], b = hy[hy.length - 1];
    return { title: DEFS.revenue_cagr[0], def: DEFS.revenue_cagr[1], formula: DEFS.revenue_cagr[2], working: '(' + L.usd(b.revenue) + ' / ' + L.usd(a.revenue) + ')^(1/' + c.history.cagr_years + ') − 1 = ' + L.pctS(g.value), source: '10-K filings for ' + fyLabel(c, a) + ' and ' + fyLabel(c, b) + '.', href: b.filing_url || null, more: 'method.html#revenue_cagr' };
  }

  /* ---------- Value ---------- */
  function ctlNote(key) {
    var c = S.co, gb = D.defaults.growth_bounds, dp = key === 'rate' || key === 'terminal' ? 2 : 1;
    var m = {
      growth: ['Revenue growth, years 1–' + CM.STAGE1, 'How fast revenue grows each year for ' + L.word(CM.STAGE1) + ' years, then fades in a straight line to terminal growth by year ' + CM.YEARS + '.', 'revenue(t) = revenue(t−1) × (1 + growth)', 'Default: the last fiscal year’s growth, kept within ' + L.pct(gb[0]) + ' to ' + L.pctS(gb[1]) + '.'],
      margin: ['Unlevered FCF margin', 'The share of revenue that turns into free cash flow before financing costs.', 'cash flow = revenue × margin', 'Default: the last fiscal year’s unlevered FCF margin, FY' + c.fy.fy + '.'],
      rate: ['Discount rate', 'The yearly return used to bring future cash back to today. A higher rate gives a lower value.', 'present value = cash flow / (1 + rate)^year', 'Default: ' + D.defaults.discount_rate_text + '.'],
      terminal: ['Terminal growth', 'Yearly growth of cash flow after year ' + CM.YEARS + ', for ever. It must stay below the discount rate.', 'terminal value = last cash flow × (1 + g) / (rate − g)', 'Default: an assumption, not a forecast.']
    }[key];
    return { title: m[0], def: m[1], formula: m[2], working: 'Now ' + L.pct(S.p[key], dp) + '; default ' + L.pct(S.def[key], dp) + '.', source: m[3], href: null, more: 'method.html#dcf' };
  }
  var CTL = [{ key: 'growth', name: 'Revenue growth, years 1–5', dec: 1 }, { key: 'margin', name: 'Unlevered FCF margin', dec: 1 }, { key: 'rate', name: 'Discount rate', dec: 1 }, { key: 'terminal', name: 'Terminal growth', dec: 1 }];

  function aligned(def, lo, hi) { return [def - Math.floor((def - lo) / STEP + 1e-9) * STEP, def + Math.floor((hi - def) / STEP + 1e-9) * STEP]; }

  function renderValue(c) {
    var p = $('panel-value'); p.textContent = ''; P = {};
    var dd = c.dcf && c.dcf.defaults, nm = L.shortName(c.name);
    S.p = null; S.def = null; S.claims = claims(c); S.shares = val(c.shares_for_per_share);
    P.title = el('h2', { 'class': 'statement', id: 'v-title', style: 'max-width:none' });
    P.second = el('p', { 'class': 't-second second prompt' });
    P.live = el('p', { 'class': 'sr-only', 'aria-live': 'polite' });
    p.appendChild(el('div', { 'class': 'panel-head', style: 'margin-bottom:0' }, [P.title, P.second, P.live]));
    var grid = el('div', { 'class': 'vgrid' }); p.appendChild(grid);

    if (c.financial) {
      P.title.textContent = 'A cash-flow valuation does not describe ' + nm + '.';
      grid.style.display = 'block';
      p.insertBefore(el('div', { 'class': 'na', style: 'margin-top:20px' }, [el('p', null, finCopy(kindOf(c))), el('small', null, 'A DCF on free cash flow and an enterprise-value multiple would mislead, so the Lab does not compute them. Type a share price to see market value and the price-to-earnings ratio.')]), grid);
      grid.appendChild(buildPriceBox(c));
      p.appendChild(disc(DISC));
      refresh(); return;
    }
    if (!dd) {
      P.title.textContent = 'There is no DCF for ' + nm + '.';
      grid.style.display = 'block';
      p.insertBefore(el('div', { 'class': 'na', style: 'margin-top:20px' }, [el('p', null, why(c.dcf) + '.'), el('small', null, 'The enterprise value and multiples still work once you type a share price.')]), grid);
      grid.appendChild(buildPriceBox(c)); p.appendChild(buildFolds(c)); p.appendChild(disc(DISC)); refresh(); return;
    }
    S.def = { revenue: c.dcf.revenue, growth: dd.growth, margin: dd.margin, rate: dd.rate, terminal: dd.terminal };
    S.p = Object.assign({}, S.def);
    var gb = D.defaults.growth_bounds, span = (gb[1] - gb[0]) / 2, lim = { growth: [gb[0] - span, gb[1] + span], margin: LIMITS.margin, rate: LIMITS.rate, terminal: LIMITS.terminal };

    var left = el('div', { 'class': 'vleft' });
    left.appendChild(el('h3', { 'class': 'vsub' }, 'Assumptions'));
    CTL.forEach(function (ct) {
      var r = aligned(S.def[ct.key], Math.min(lim[ct.key][0], S.def[ct.key]), Math.max(lim[ct.key][1], S.def[ct.key]));
      var inp = el('input', { type: 'range', id: 'in-' + ct.key, min: r[0], max: r[1], step: STEP, 'aria-label': ct.name }); inp.value = S.p[ct.key];
      var vin = el('input', { type: 'text', inputmode: 'decimal', 'class': 'vin', id: 'v-' + ct.key, 'aria-label': ct.name + ', value in percent', autocomplete: 'off' });
      vin.value = L.pct(S.p[ct.key], ct.dec);
      var lab = L.tipLabel(ct.name, function () { return ctlNote(ct.key); });
      var box = el('div', { 'class': 'ctl' }, [el('div', { 'class': 'ctl-top' }, [lab, vin]), inp]);
      function set(v) { v = Math.max(+inp.min, Math.min(+inp.max, v)); S.p[ct.key] = v; inp.value = v; vin.value = L.pct(v, ct.dec); refresh(); }
      inp.addEventListener('input', function () { S.p[ct.key] = parseFloat(inp.value); vin.value = L.pct(S.p[ct.key], ct.dec); refresh(); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); set(S.p[ct.key] + (e.key === 'PageUp' ? PAGE : -PAGE)); } });
      function commit() { var n = parseFloat(vin.value.replace('−', '-').replace(/[%\s]/g, '')); if (isFinite(n)) set(n / 100); else vin.value = L.pct(S.p[ct.key], ct.dec); }
      vin.addEventListener('change', commit); vin.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); });
      left.appendChild(box);
    });
    var reset = el('button', { type: 'button', 'class': 'btn' }, 'Reset to starting values');
    reset.addEventListener('click', function () { CTL.forEach(function (ct) { S.p[ct.key] = S.def[ct.key]; $('in-' + ct.key).value = S.def[ct.key]; $('v-' + ct.key).value = L.pct(S.def[ct.key], ct.dec); }); refresh(); });
    left.appendChild(reset);

    P.rangebox = el('div', { 'class': 'rangebox' }, [el('p', { 'class': 'vsub' }, 'Value per share'), (P.psHost = el('div', { 'class': 'rbar' })), (P.evline = el('p', { 'class': 'evline' }))]);
    grid.appendChild(left); grid.appendChild(P.rangebox); grid.appendChild(buildPriceBox(c));

    var sens = el('div', { 'class': 'sens' });
    var sh = el('div', { 'class': 'sens-head' }, el('h3', { 'class': 'vsub', style: 'margin:0' }, 'Sensitivity: value per share, growth × margin'));
    P.gridToggle = el('button', { type: 'button', 'class': 'linkbtn' });
    P.gridToggle.addEventListener('click', function () { S.full = !S.full; refresh(); });
    sh.appendChild(P.gridToggle); sens.appendChild(sh);
    sens.appendChild(el('div', { 'class': 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Sensitivity grid, value per share. Scrolls sideways if narrow.' }, (P.gtable = el('table', { 'class': 'gtable' }))));
    sens.appendChild(P.gnote = el('p', { 'class': 'cap' }));
    p.appendChild(sens);
    p.appendChild(buildFolds(c));
    p.appendChild(disc(DISC));
    refresh();
  }

  function buildPriceBox(c) {
    var box = el('div', { 'class': 'pbox', role: 'group', 'aria-labelledby': 'pb-label' });
    box.appendChild(el('label', { id: 'pb-label', 'for': 'price' }, 'Type a share price (USD)'));
    var inp = el('input', { id: 'price', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': 'pb-note pb-err' });
    var clear = el('button', { type: 'button', hidden: true, 'aria-label': 'Clear the share price' }, 'Clear');
    box.appendChild(el('div', { 'class': 'pin' }, [el('span', { 'class': 'cur', 'aria-hidden': 'true' }, '$'), inp, clear]));
    P.err = el('p', { 'class': 'perr', id: 'pb-err', role: 'status' }); box.appendChild(P.err);
    box.appendChild(el('p', { 'class': 'pnote', id: 'pb-note' }, 'Calculated in your browser; nothing is stored.'));
    P.pres = el('div', { 'class': 'pres' }); box.appendChild(P.pres);
    inp.addEventListener('input', function () {
      var raw = inp.value.replace(/[$,\s]/g, ''); clear.hidden = !raw;
      if (!raw) { S.price = null; P.err.textContent = ''; } else {
        var n = Number(raw);
        if (!isFinite(n) || n <= 0) P.err.textContent = 'Type a price above 0.'; else { S.price = n; P.err.textContent = ''; }
      }
      refresh();
    });
    clear.addEventListener('click', function () { inp.value = ''; S.price = null; clear.hidden = true; P.err.textContent = ''; refresh(); inp.focus(); });
    return box;
  }

  function renderPrice(c) {
    var r = priceCalc(), has = r.price != null, host = P.pres; host.textContent = '';
    if (!has) {
      host.appendChild(el('span', { 'class': 'dash' }, c.financial ? 'Market cap and P/E appear here once you type a price.' : 'Market cap, enterprise value and multiples appear here once you type a price.'));
      P.second.className = 't-second second prompt'; P.second.textContent = 'Type today’s share price to see what it implies.';
      return r;
    }
    function pr(label, sp, value) { host.appendChild(el('span', { 'class': 'pr' }, [L.tipLabel(label, sp), el('b', null, value)])); }
    var k = S.claims, basis = c.shares_for_per_share && c.shares_for_per_share.basis || 'not stated';
    pr('Market cap', { title: 'Market cap', def: 'What the whole equity is worth at your price.', formula: 'price × diluted shares', working: '$' + priceTxt(r.price) + ' × ' + sharesText() + ' shares = ' + L.usd(r.mcap), source: 'Your price; shares: ' + basis + ', ' + srcText(c), href: hrefOf(F(c, 'revenue')), more: 'method.html#market_cap' }, L.usd(r.mcap));
    if (!c.financial) {
      var miss = missing(c);
      pr('EV', { title: 'Enterprise value', def: 'What the whole business is worth to shareholders and lenders together.', formula: 'market cap + debt + finance leases + non-controlling interest − cash − short-term investments', working: L.usd(r.mcap) + ' + ' + usdOr(k.debt) + ' + ' + usdOr(k.finance_leases, '$0') + ' + ' + usdOr(k.nci, '$0') + ' − ' + usdOr(k.cash) + ' − ' + usdOr(k.short_term_investments, '$0') + ' = ' + L.usd(r.ev), source: srcText(c), href: hrefOf(V(c, 'debt')), caution: miss.length ? 'Not reported, counted as 0: ' + miss.join(', ') + '.' : null, more: 'method.html#ev' }, L.usd(r.ev));
      pr('EV/EBITDA', { title: 'EV / EBITDA', def: 'How many years of EBITDA the enterprise value equals: a common yardstick in deal work.', formula: 'enterprise value / EBITDA', working: r.evEbitda != null ? L.usd(r.ev) + ' / ' + L.usd(r.ebitda) + ' = ' + L.mult(r.evEbitda) : 'EBITDA is not positive or not reported.', source: srcText(c), href: hrefOf(V(c, 'ebitda')), more: 'method.html#ev_ebitda' }, r.evEbitda != null ? L.mult(r.evEbitda) : 'n/a');
    }
    pr('P/E', { title: 'P/E', def: 'Dollars paid for one dollar of yearly earnings.', formula: 'price / diluted EPS', working: r.pe != null ? '$' + priceTxt(r.price) + ' / $' + L.num(r.eps, 2) + ' = ' + L.mult(r.pe) : 'Earnings per share are not positive or not reported.', source: 'Your price; EPS diluted, ' + srcText(c), href: hrefOf(V(c, 'eps_diluted')), more: 'method.html#pe' }, r.pe != null ? L.mult(r.pe) : 'n/a');
    P.second.className = 't-second second';
    if (!c.financial && S.p) {
      P.second.textContent = r.implied != null ? 'At $' + priceTxt(r.price) + ', the price needs ' + L.pct(r.implied) + ' revenue growth a year for ' + L.word(CM.STAGE1) + ' years.' : (r.ev > 0 ? 'At $' + priceTxt(r.price) + ', no growth rate between ' + L.pctS(SEARCH[0], 0) + ' and ' + L.pctS(SEARCH[1], 0) + ' matches the price.' : 'At $' + priceTxt(r.price) + ', the enterprise value is not positive.');
    } else if (!c.financial) {
      P.second.textContent = 'At $' + priceTxt(r.price) + ', enterprise value is ' + L.usd(r.ev) + (r.evEbitda != null ? ', ' + L.mult(r.evEbitda) + ' EBITDA.' : '.');
    } else {
      P.second.textContent = 'At $' + priceTxt(r.price) + ', the price is ' + (r.pe != null ? L.mult(r.pe) + ' diluted earnings.' : 'not comparable with earnings per share.');
    }
    return r;
  }

  function buildFolds(c) {
    var wrap = el('div', { 'class': 'folds' });
    P.bridgeBody = el('div', { 'class': 'fold-body' });
    var f1 = el('details', { 'class': 'fold' }, [el('summary', null, ['How enterprise value is built', el('small', null, 'market cap plus claims, less cash')]), P.bridgeBody]);
    f1.addEventListener('toggle', function () { if (f1.open) refresh(); });
    wrap.appendChild(f1);
    if (S.p) {
      P.uHost = el('div', { 'class': 'chart' }); P.utable = el('div', { 'class': 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Year-by-year projection' }); P.unote = el('p', { 'class': 'cap' });
      P.fold2 = el('details', { 'class': 'fold' }, [el('summary', null, ['Cash flows by year', el('small', null, 'ten years, central case')]), el('div', { 'class': 'fold-body' }, [P.uHost, P.utable, P.unote])]);
      P.fold2.addEventListener('toggle', function () { if (P.fold2.open) refresh(); });
      wrap.appendChild(P.fold2);
    }
    P.f1 = f1; return wrap;
  }

  function renderBridge(c, r) {
    var b = P.bridgeBody; if (!b || !P.f1.open) return; b.textContent = '';
    var k = S.claims, has = r.price != null;
    var rows = [['Market cap', has ? L.usd(r.mcap) : 'type a price', 'price × diluted shares', has ? '$' + priceTxt(r.price) + ' × ' + sharesText() : null, null, 'market_cap'],
      ['+ Debt', usdOr(k.debt), 'debt', null, V(c, 'debt'), 'debt'], ['+ Finance leases', usdOr(k.finance_leases), 'finance_leases', null, V(c, 'finance_leases'), 'finance_leases'], ['+ Non-controlling interest', usdOr(k.nci), 'nci', null, V(c, 'nci'), 'nci'],
      [MINUS + ' Cash', usdOr(k.cash), 'cash', null, V(c, 'cash'), 'cash'], [MINUS + ' Short-term investments', usdOr(k.short_term_investments), 'short_term_investments', null, V(c, 'short_term_investments'), 'short_term_investments'],
      ['= Enterprise value', has ? L.usd(r.ev) : 'type a price', null, null, null, 'ev']];
    var t = el('table', { 'class': 'dtable' });
    t.appendChild(el('thead', null, el('tr', null, [el('th', { scope: 'col' }, 'Step'), el('th', { scope: 'col', 'class': 'r' }, 'USD')])));
    var tb = el('tbody');
    rows.forEach(function (x) {
      var sp = x[4] ? nodeNote(c, x[2], x[4]) : { title: x[0].replace(/^[+=−] /, ''), def: x[5] === 'ev' ? 'Market cap plus net claims on the business.' : 'What the whole equity is worth at your price.', formula: x[2] || 'market cap + debt + finance leases + non-controlling interest − cash − short-term investments', working: x[3] || (has && x[5] === 'ev' ? L.usd(r.mcap) + ' + net claims of ' + L.usd(r.net) + ' = ' + L.usd(r.ev) : null), source: srcText(c), more: 'method.html#' + x[5] };
      tb.appendChild(el('tr', null, [el('th', { scope: 'row' }, L.tipLabel(x[0], sp)), el('td', { 'class': 'r' }, x[1])]));
    });
    t.appendChild(tb); b.appendChild(t);
    b.appendChild(el('p', { 'class': 'cap' }, 'Fiscal year end ' + L.date(c.fy.end) + '. Operating leases are not added: US GAAP EBITDA is already after rent.' + (missing(c).length ? ' Not reported, counted as zero: ' + missing(c).join(', ') + '.' : '')));
  }

  function refresh() {
    var c = S.co; if (!c || !P.pres) return;
    var r = renderPrice(c);
    CTL.forEach(function (ct) { var i = $('in-' + ct.key); if (i) i.style.setProperty('--p', ((+i.value - +i.min) / (+i.max - +i.min) * 100) + '%'); });
    renderBridge(c, r);
    if (!S.p) return;
    var vr = CM.valueRange(S.p, S.claims, S.shares, RANGE_PP);
    if (!vr) { P.title.textContent = 'These inputs give no value: the discount rate must be above terminal growth.'; P.psHost.textContent = ''; return; }
    var hasPs = vr.perShare.low != null, ref = vr.perShare.mid, psf = function (v) { return L.psz(v, ref); }, psr = function (v) { return L.ps(v, ref); };
    var title = 'On these assumptions the business is worth ' + (hasPs ? (vr.perShare.low < 0 ? 'up to ' + psr(vr.perShare.high) : rangeText(vr.perShare.low, vr.perShare.high, psr)) + ' a share.' : rangeText(vr.ev.low, vr.ev.high, L.usd) + '.');
    P.title.textContent = title; announce(title + ' ' + P.second.textContent);
    var rn = function (a, m, b, f) { return { title: 'The range, not a point', def: 'The bar spans the value at a discount rate one percentage point higher (low) and lower (high). The pale tick is the central case.', formula: 'low: rate + 1 pp; high: rate − 1 pp', working: 'Low ' + f(a) + ', central ' + f(m) + ', high ' + f(b) + '. Rates ' + L.pct(S.p.rate + RANGE_PP, 2) + ', ' + L.pct(S.p.rate, 2) + ', ' + L.pct(S.p.rate - RANGE_PP, 2) + '.', source: 'company_math.valueRange on SEC data for FY' + c.fy.fy + '.', href: hrefOf(F(c, 'revenue')), caution: 'Hypothetical model on stated assumptions; not investment advice.', more: 'method.html#dcf' }; };
    if (hasPs) L.range(P.psHost, { name: 'Value per share', low: vr.perShare.low, mid: vr.perShare.mid, high: vr.perShare.high, mark: r.price, markLabel: 'your price', fmt: psf, spec: rn(vr.perShare.low, vr.perShare.mid, vr.perShare.high, psf) });
    else L.range(P.psHost, { name: 'Enterprise value', low: vr.ev.low, mid: vr.ev.mid, high: vr.ev.high, mark: r.ev, markLabel: 'at your price', fmt: L.usd, spec: rn(vr.ev.low, vr.ev.mid, vr.ev.high, L.usd) });
    var nc = CM.netClaims(S.claims);
    P.evline.textContent = '';
    P.evline.appendChild(L.tipLabel('Enterprise value ' + rangeText(vr.ev.low, vr.ev.high, L.usd), { title: 'Enterprise value range', def: 'The value of the whole business at the same three discount rates; per share is this less net claims, divided by shares.', formula: 'per share = (enterprise value − net claims) / diluted shares', working: 'Central ' + L.usd(vr.ev.mid) + ' − ' + L.usd(nc) + ' = ' + L.usd(vr.ev.mid - nc) + '; / ' + sharesText() + ' ' + (c.shares_for_per_share.basis || '') + ' shares', source: 'company_math.valueRange, ' + srcText(c), href: hrefOf(V(c, 'debt')), caution: missing(c).length ? 'Not reported, counted as 0: ' + missing(c).join(', ') + '.' : null, more: 'method.html#ev' }));
    P.evline.appendChild(document.createTextNode(', central ' + L.usd(vr.ev.mid)));
    renderGrid(c, r);
    if (P.fold2 && P.fold2.open) renderFold(c, vr);
  }

  function renderGrid(c, r) {
    var steps = S.full ? GRID5 : GRID3, g = CM.grid(S.p, S.claims, S.shares, steps, steps), tb = P.gtable; tb.textContent = '';
    P.gridToggle.textContent = S.full ? 'Show 3 × 3' : 'Show 5 × 5';
    var near = null, best = Infinity, lo = Infinity, hi = -Infinity, has = r.price != null, gm = (steps.length - 1) / 2, ref = g[gm][gm] && g[gm][gm].perShare, psr = function (v) { return L.ps(v, ref); }, psf = function (v) { return L.psz(v, ref); };
    g.forEach(function (row, i) { row.forEach(function (cl, j) {
      if (!cl || cl.perShare == null) return;
      lo = Math.min(lo, cl.perShare); hi = Math.max(hi, cl.perShare);
      if (has && Math.abs(cl.perShare - r.price) < best) { best = Math.abs(cl.perShare - r.price); near = [i, j]; }
    }); });
    var inside = has && r.price >= lo && r.price <= hi;
    function lab(d) { return d === 0 ? 'base' : (d < 0 ? MINUS : '+') + L.num(Math.abs(d) * 100) + ' pp'; }
    tb.appendChild(el('caption', { 'class': 'sr-only' }, 'Value per share in dollars. Rows: revenue growth for years 1 to 5. Columns: unlevered FCF margin.'));
    var hr = el('tr', null, el('th', { scope: 'col', 'class': 'corner' }, 'Growth ↓ / margin →'));
    steps.forEach(function (dm, j) { var mv = null; g.forEach(function (row) { if (row[j]) mv = row[j].margin; }); hr.appendChild(el('th', { scope: 'col' }, [el('b', null, mv != null ? L.pct(mv) : 'n/a'), el('span', null, lab(dm))])); });
    tb.appendChild(el('thead', null, hr));
    var tbd = el('tbody'), mid = (steps.length - 1) / 2;
    g.forEach(function (row, i) {
      var tr = el('tr'), gv = null; row.forEach(function (cl) { if (cl) gv = cl.growth; });
      tr.appendChild(el('th', { scope: 'row' }, [el('b', null, gv != null ? L.pct(gv) : 'n/a'), el('span', null, lab(steps[i]))]));
      row.forEach(function (cl, j) {
        var base = i === mid && j === mid, isNear = inside && near && near[0] === i && near[1] === j;
        var td = el('td', { 'class': (base ? 'base ' : '') + (isNear ? 'near' : '') });
        var btn = el('button', { type: 'button', 'class': cl && cl.perShare < 0 ? 'neg' : null }, [cl && cl.perShare != null ? psf(cl.perShare) : 'n/a', isNear ? el('span', { 'class': 'gt' }, '≈ your price') : null, base ? el('span', { 'class': 'sr-only' }, ' (base case)') : null, isNear ? el('span', { 'class': 'sr-only' }, ' (nearest your price)') : null]);
        if (cl) L.tip(btn, { title: 'Growth ' + L.pct(cl.growth) + ', margin ' + L.pct(cl.margin), def: 'One case of the DCF with only growth and margin changed from your settings.', formula: 'DCF(growth, margin, rate, terminal growth)', working: (cl.perShare != null ? psf(cl.perShare) + ' a share; ' : '') + 'enterprise value ' + L.usd(cl.ev) + ' at ' + L.pct(S.p.rate, 2) + ' and ' + L.pct(S.p.terminal, 2) + '.', source: 'company_math.grid on SEC data for FY' + c.fy.fy + '.', href: null, caution: 'Hypothetical model on stated assumptions.', more: 'method.html#sensitivity' });
        td.appendChild(btn); tr.appendChild(td);
      });
      tbd.appendChild(tr);
    });
    tb.appendChild(tbd);
    P.gnote.textContent = 'USD a share, at your discount rate and terminal growth. Base case outlined in navy; steps are in percentage points; margin is floored at the model’s minimum.' + (has ? (inside ? ' The cell nearest your price is filled.' : ' Your price lies outside this grid, so no cell is filled.') : ' Type a price to fill the nearest cell.');
  }

  function renderFold(c, vr) {
    var res = vr.central, y0 = c.fy.fy;
    L.years(P.uHost, { name: 'Projected unlevered free cash flow', fmt: L.usd, hiIndex: CM.STAGE1,
      items: res.ufcf.map(function (v, i) { return { label: 'FY' + String(y0 + i + 1).slice(2), v: v, spec: { title: 'Projected cash flow, FY' + (y0 + i + 1), def: 'Revenue times the unlevered FCF margin in the central case.', formula: 'cash flow = revenue × margin; present value = cash flow / (1 + rate)^year', working: L.usd(v) + '; present value ' + L.usd(res.pv[i]) + ' (year ' + (i + 1) + ').', source: 'company_math.dcf', href: null, caution: 'Hypothetical model on stated assumptions.', more: 'method.html#dcf' } }; }) });
    var rev = S.p.revenue || c.dcf.revenue, rows = [];
    res.ufcf.forEach(function (v, i) { rev = rev * (1 + res.growthPath[i]); rows.push(['FY' + (y0 + i + 1), L.pctS(res.growthPath[i]), L.usd(rev), L.usd(v), L.usd(res.pv[i])]); });
    var t = el('table', { 'class': 'dtable' });
    t.appendChild(el('thead', null, el('tr', null, ['Year', 'Revenue growth', 'Revenue', 'Unlevered FCF', 'Present value'].map(function (h, i) { return el('th', { scope: 'col', 'class': i ? 'r' : '' }, h); }))));
    var tb = el('tbody'); rows.forEach(function (r2) { tb.appendChild(el('tr', null, r2.map(function (x, i) { return el(i ? 'td' : 'th', { 'class': i ? 'r' : '', scope: i ? null : 'row' }, x); }))); });
    tb.appendChild(el('tr', null, [el('th', { scope: 'row' }, 'Terminal value'), el('td', { 'class': 'r' }, ''), el('td', { 'class': 'r' }, ''), el('td', { 'class': 'r' }, L.usd(res.terminalValue)), el('td', { 'class': 'r' }, L.usd(res.pvTerminal))]));
    t.appendChild(tb); P.utable.textContent = ''; P.utable.appendChild(t);
    P.unote.textContent = 'USD. Growth holds for ' + L.word(CM.STAGE1) + ' years (navy bars), then fades to terminal growth by year ' + CM.YEARS + '. The terminal value is ' + L.pct(res.pvTerminal / res.ev, 0) + ' of the central enterprise value of ' + L.usd(res.ev) + '. Hypothetical model on stated assumptions.';
  }

  /* ---------- Cash & debt ---------- */
  /* bars only for rows with a value; the rest are named in one line with their reason */
  function shown(rows) { return rows.filter(function (r) { return r.text !== 'n/a'; }); }
  function notShown(rows, keys) {
    var c = S.co, groups = {}, order = [];
    rows.forEach(function (r, i) {
      if (r.text !== 'n/a') return;
      var w = plainWhy(V(c, keys[i]) && V(c, keys[i]).reason);
      if (!groups[w]) { groups[w] = []; order.push(w); }
      groups[w].push(r.label.toLowerCase());
    });
    function join(a) { return a.length < 2 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    return order.length ? 'Not shown: ' + order.map(function (w) { return join(groups[w]) + ' (' + w + ')'; }).join('; ') + '.' : '';
  }
  /* hub reasons in plain words for the one-line note */
  function plainWhy(r) {
    r = r || '';
    if (/^outside 0 to/.test(r)) return 'the cost-of-goods or balance line in this 10-K looks like a different item';
    if (/DIO, DSO or DPO unavailable/i.test(r)) return 'it needs all three day counts';
    var t = reasonText(r);
    if (/^No .*(10-K|tags)/i.test(t)) return 'not reported in this 10-K';
    return t.charAt(0).toLowerCase() + t.slice(1);
  }
  function renderCash(c) {
    var p = $('panel-cash'); p.textContent = '';
    var nm = L.shortName(c.name);
    if (c.financial) {
      p.appendChild(el('div', { 'class': 'panel-head' }, el('h2', { 'class': 'statement' }, kindOf(c) === 'insurer' ? 'A debt-to-cash bridge does not describe ' + nm + '.' : 'Banks have no meaningful debt-to-cash bridge.')));
      p.appendChild(el('div', { 'class': 'na' }, [el('p', null, finCopy(kindOf(c))), el('small', null, 'Debt less cash would not show how ' + nm + ' is funded, so the Lab leaves out the enterprise-value bridge and working-capital days. Earnings and the P/E on the Value tab still work.')]));
      p.appendChild(disc('Source: SEC EDGAR 10-K, fiscal year to ' + L.date(c.fy.end) + '. Not investment advice.'));
      return;
    }
    var k = claims(c), debt = k.debt == null ? null : k.debt + (k.finance_leases || 0), cash = k.cash == null ? null : k.cash + (k.short_term_investments || 0);
    /* net debt, net debt / EBITDA and interest cover come from the hub (same definition as the bridge); older data falls back to the sum here */
    var ndN = V(c, 'net_debt'), levN = V(c, 'net_debt_to_ebitda'), covN = V(c, 'interest_cover'), eb = val(V(c, 'ebitda'));
    var nd = ndN ? val(ndN) : (debt != null && cash != null ? debt - cash : null), lev = val(levN), cov = val(covN);
    var basis = covN && covN.formula ? plainFormula(covN.formula.replace(/^ebitda \/ /, '')) : 'interest expense';
    var title;
    if (nd == null) title = 'The debt and cash of ' + nm + ' cannot be netted from the filing.';
    else if (nd < 0) title = nm + ' has ' + L.usd(-nd) + ' more cash than debt' + (cov != null ? ', and its EBITDA covers interest ' + L.mult(cov) + '.' : '.');
    else title = nm + ' owes ' + L.usd(nd) + ' more than it holds in cash' + (lev != null ? ': ' + L.mult(lev) + ' its EBITDA' : '') + (cov != null ? ', with interest covered ' + L.mult(cov) + '.' : '.');
    p.appendChild(el('div', { 'class': 'panel-head' }, el('h2', { 'class': 'statement' }, title)));
    var tl = el('div', { 'class': 'tiles t4' });
    tl.appendChild(tile('Debt and finance leases', { title: 'Debt and finance leases', def: 'Borrowings plus lease obligations that work like borrowing.', formula: 'debt + finance leases', working: debt == null ? null : usdOr(k.debt) + ' + ' + usdOr(k.finance_leases, '$0 (not reported)') + ' = ' + L.usd(debt), source: srcText(c), href: hrefOf(V(c, 'debt')), more: 'method.html#debt' }, usdOr(debt), 'fiscal year end ' + L.date(c.fy.end)));
    tl.appendChild(tile('Cash and investments', { title: 'Cash and short-term investments', def: 'Cash plus liquid securities treated like cash.', formula: 'cash + short-term investments', working: cash == null ? null : usdOr(k.cash) + ' + ' + usdOr(k.short_term_investments, '$0 (not reported)') + ' = ' + L.usd(cash), source: srcText(c), href: hrefOf(V(c, 'cash')), more: 'method.html#cash' }, usdOr(cash), 'fiscal year end ' + L.date(c.fy.end)));
    var partial = (levN && levN.partial) || (ndN && ndN.partial);
    tl.appendChild(tile('Net debt / EBITDA', { title: DEFS.net_debt_to_ebitda[0], def: DEFS.net_debt_to_ebitda[1], formula: DEFS.net_debt_to_ebitda[2], working: lev == null ? null : L.usd(nd) + ' / ' + L.usd(eb) + ' = ' + L.mult(lev), source: srcText(c), href: hrefOf(V(c, 'debt')), caution: lev == null ? 'Not shown: ' + why(levN).toLowerCase() + '.' : (partial ? 'Partial: ' + reasonText(partial).toLowerCase() + '.' : null), more: 'method.html#net_debt_to_ebitda' },
      lev == null ? 'n/a' : L.mult(lev), nd == null ? 'debt or cash not reported' : (nd < 0 ? 'net cash ' + L.usd(-nd) : 'net debt ' + L.usd(nd))));
    var paid = covN && covN.inputs && covN.inputs.length ? Math.abs(covN.inputs.reduce(function (s, i) { return s + (i.value || 0); }, 0)) : null;
    tl.appendChild(tile('Interest cover', { title: DEFS.interest_cover[0], def: DEFS.interest_cover[1], formula: 'EBITDA / ' + basis, working: cov == null || paid == null ? null : L.usd(eb) + ' / ' + L.usd(paid) + ' = ' + L.mult(cov), source: srcText(c), href: hrefOf(covN), caution: cov == null ? 'Not shown: ' + why(covN).toLowerCase() + '.' : null, more: 'method.html#interest_cover' },
      cov == null ? 'n/a' : L.mult(cov), cov == null ? why(covN) : 'EBITDA / ' + basis));
    p.appendChild(tl);
    var cols = el('div', { 'class': 'gl', style: 'margin-top:24px' }), a = el('div'), b = el('div');
    a.appendChild(el('h3', { 'class': 'vsub' }, 'Claims on the business and cash'));
    var ah = el('div', { 'class': 'chart' }); a.appendChild(ah);
    function row(label, key, kind, sign) { var n = V(c, key), v = val(n); return { label: label, v: v == null || v === 0 ? null : sign * v, kind: kind, text: v == null ? 'n/a' : (v === 0 ? 'none' : (sign < 0 ? MINUS : '') + L.usd(v)), spec: nodeNote(c, key, n) }; }
    var claimRows = [row('Debt', 'debt', 'hi', 1), row('Finance leases', 'finance_leases', 'hi', 1), Object.assign(row('Non-controlling interest', 'nci', 'hi', 1), { short: 'Non-controlling int.' }), row('Cash', 'cash', 'ctx', -1), Object.assign(row('Short-term investments', 'short_term_investments', 'ctx', -1), { short: 'Short-term inv.' })];
    L.hbars(ah, shown(claimRows), { name: 'Claims and cash' });
    var missA = notShown(claimRows, ['debt', 'finance_leases', 'nci', 'cash', 'short_term_investments']);
    if (missA) a.appendChild(el('p', { 'class': 'cap' }, missA));
    a.appendChild(el('p', { 'class': 'cap' }, 'USD at ' + L.date(c.fy.end) + '. Claims in navy to the right, cash and investments in grey to the left. Operating leases (' + usdOr(val(V(c, 'operating_leases')), 'n/a') + ') are not added. The bridge to enterprise value is on the Value tab.'));
    b.appendChild(el('h3', { 'class': 'vsub' }, 'Does growth turn into cash? Working-capital days'));
    var bh = el('div', { 'class': 'chart' }); b.appendChild(bh);
    function wc(label, key, kind, sign) { var n = V(c, key), v = val(n); return { label: label, v: v == null || v === 0 ? null : sign * v, kind: kind, text: v == null ? 'n/a' : (v === 0 ? 'none' : (sign < 0 ? MINUS : '') + L.days(v) + ' d'), spec: nodeNote(c, key, n) }; }
    var wcRows = [wc('Inventory days', 'dio', 'ctx', 1), wc('Receivable days', 'dso', 'ctx', 1), wc('Payable days', 'dpo', 'ctx', -1), wc('Cash cycle', 'ccc', 'hi', 1)];
    if (shown(wcRows).length) L.hbars(bh, shown(wcRows), { name: 'Working-capital days' }); else bh.remove();
    var missB = notShown(wcRows, ['dio', 'dso', 'dpo', 'ccc']);
    if (missB) b.appendChild(el('p', { 'class': 'cap' }, missB));
    b.appendChild(el('p', { 'class': 'cap' }, 'Days. Fiscal-year-end balance divided by the annual flow, times a year. Cash cycle = inventory + receivable − payable days; below zero, suppliers fund the cycle.'));
    cols.appendChild(a); cols.appendChild(b); p.appendChild(cols);
    p.appendChild(disc('Source: SEC EDGAR 10-K, fiscal year to ' + L.date(c.fy.end) + '. Not investment advice.'));
  }

  /* ---------- Sources ---------- */
  var HUMAN = { dei_cover: 'from the filing cover', shares_proxy: 'diluted average, no cover count', shares_stale: 'share count older than 200 days', float_stale: 'public float older than about 21 months', float_scale_suspect: 'public float looks mis-scaled' };
  function humanBasis(k) { var t = HUMAN[k] || String(k).replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); }
  function renderSources(c) {
    var p = $('panel-sources'); p.textContent = '';
    var lists = [['Earnings facts', c.fundamentals, ['revenue', 'revenue_prior', 'growth_yoy', 'operating_income', 'operating_margin', 'cfo', 'capex', 'fcf', 'fcf_margin']],
      ['Valuation inputs', c.valuation, ['debt', 'finance_leases', 'nci', 'cash', 'short_term_investments', 'ebitda', 'eps_diluted', 'diluted_shares', 'net_debt', 'net_debt_to_ebitda', 'interest_cover']],
      ['Working-capital and other facts', c.valuation, ['operating_leases', 'inventory', 'receivables', 'payables', 'cogs', 'da', 'interest_expense', 'net_interest', 'interest_paid', 'net_income', 'dio', 'dso', 'dpo', 'ccc']]];
    var n = 0, urls = {};
    lists.forEach(function (l) { l[2].forEach(function (k) { var nd = l[1] && l[1][k]; if (nd && L.isNum(nd.value)) { n++; var u = hrefOf(nd); if (u) urls[u] = 1; } }); });
    var k = Object.keys(urls).length, filed = filedOf(c);
    p.appendChild(el('div', { 'class': 'panel-head' }, el('h2', { 'class': 'statement' }, n + ' figures on this page come from ' + L.word(k) + ' filing' + (k === 1 ? '' : 's') + (filed ? '; the latest was filed ' + L.date(filed) + '.' : '.'))));
    function fmtFact(nd) { var v = nd.value; if (nd.unit === 'ratio') return L.pct(v); if (nd.unit === 'multiple') return L.mult(v); if (nd.unit === 'days') return L.days(v) + ' days'; if (nd.unit === 'USD/shares') return '$' + L.num(v, 2); if (nd.unit === 'shares') return L.num(v / 1e9, 2) + 'bn'; return L.usd(v); }
    function table(keys, obj) {
      var t = el('table', { 'class': 'dtable' });
      t.appendChild(el('thead', null, el('tr', null, ['Figure', 'Value', 'Formula or rule', 'Period end', 'Filed', 'Filing'].map(function (h, i) { return el('th', { scope: 'col', 'class': i === 1 ? 'r' : '' }, h); }))));
      var tb = el('tbody');
      keys.forEach(function (key) {
        var nd = obj && obj[key]; if (!nd) return;
        var ok = L.isNum(nd.value), inp = (nd.inputs || [])[0], href = hrefOf(nd);
        tb.appendChild(el('tr', null, [
          el('th', { scope: 'row' }, (DEFS[key] ? DEFS[key][0] : key.replace(/_/g, ' '))),
          el('td', { 'class': 'r' }, ok ? fmtFact(nd) : 'n/a'),
          el('td', { 'class': 'fx', title: ok ? null : reasonText(nd.reason) }, ok ? (plainFormula(nd.formula || nd.rule) || 'as filed') : el('span', { 'class': 'rs' }, reasonText(nd.reason))),
          el('td', null, ok && inp && inp.period_end ? L.date(inp.period_end) : ''),
          el('td', null, ok && filed ? L.date(filed) : ''),
          el('td', null, ok && href ? el('a', { href: href, target: '_blank', rel: 'noopener' }, '10-K') : '')]));
      });
      t.appendChild(tb); return el('div', { 'class': 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Source facts. Scrolls sideways if narrow.' }, t);
    }
    p.appendChild(table(lists[0][2].concat(lists[1][2].map(function (k) { return k; })), Object.assign({}, lists[0][1], lists[1][1])));
    p.appendChild(el('details', { 'class': 'fold', style: 'margin-top:16px' }, [el('summary', null, [lists[2][0], el('small', null, lists[2][2].length + ' facts')]), el('div', { 'class': 'fold-body' }, table(lists[2][2], lists[2][1]))]));
    var mr = MROW[c.ticker];
    if (mr) {
      var dq = el('dl', { 'class': 'dqdl' });
      [['Public float', L.usd(mr.public_float) + ' at ' + L.date(mr.float_end)], ['Share count', L.num(mr.shares / 1e9, 2) + 'bn at ' + L.date(mr.shares_end) + ' (' + humanBasis(mr.shares_basis) + ')'], ['Total assets', L.usd(mr.assets) + ' at ' + L.date(mr.assets_end)], ['Rank by public float', '#' + mr.rank + ' of ' + MK.counts.ranked]].forEach(function (x) { dq.appendChild(el('dt', null, x[0])); dq.appendChild(el('dd', null, x[1])); });
      var bl = el('ul', { 'class': 'list', style: 'margin-top:12px' });
      (mr.badges || []).forEach(function (k) { bl.appendChild(el('li', null, [el('b', { style: 'color:var(--ink);font-weight:600' }, humanBasis(k) + '. '), MK.badges[k] || ''])); });
      if (mr.ticker_source === 'override') bl.appendChild(el('li', null, [el('b', { style: 'color:var(--ink);font-weight:600' }, 'Ticker added by hand. '), 'SEC lists none.']));
      if (!bl.children.length) bl.appendChild(el('li', null, 'No data-quality flags on this row.'));
      p.appendChild(el('details', { 'class': 'fold', style: 'margin-top:16px' }, [el('summary', null, ['Data quality', el('small', null, 'float, share count, total assets and flags')]), el('div', { 'class': 'fold-body' }, [dq, bl])]));
      var seen = {}, srcs = (mr.fundamentals && mr.fundamentals.sources) || {};
      Object.keys(srcs).forEach(function (m) { var s = srcs[m]; if (!s || !s.url) return; var k = s.accession || s.url; if (!seen[k]) seen[k] = { s: s, m: [] }; var w = DEFS[m] ? DEFS[m][0].toLowerCase() : m.replace(/_/g, ' '); if (seen[k].m.indexOf(w) < 0) seen[k].m.push(w); });
      var fl = el('ul', { 'class': 'list' });
      Object.keys(seen).forEach(function (k) { var o = seen[k]; fl.appendChild(el('li', null, [el('b', { style: 'color:var(--ink);font-weight:600' }, o.s.form + ' '), el('a', { href: o.s.url, target: '_blank', rel: 'noopener', style: 'color:var(--cash-ink)' }, 'Open the filing'), ' \u00b7 filed ' + L.date(o.s.filed) + ' \u00b7 ' + o.m.join(', ')])); });
      if (!fl.children.length) fl.appendChild(el('li', null, 'No filing links available.'));
      p.appendChild(el('details', { 'class': 'fold' }, [el('summary', null, ['Source filings', el('small', null, Object.keys(seen).length + ' filing' + (Object.keys(seen).length === 1 ? '' : 's') + ' behind the figures')]), el('div', { 'class': 'fold-body' }, fl)]));
    }
    var def = D.definitions || {}, ul = el('ul', { 'class': 'list' });
    [['EBITDA', def.ebitda], ['Enterprise value', def.ev_definition || def.ev], ['Working-capital days', def.working_capital_days]].forEach(function (x) { if (x[1]) ul.appendChild(el('li', null, [el('b', { style: 'color:var(--ink);font-weight:600' }, x[0] + '. '), x[1]])); });
    (D.notes || []).forEach(function (t) { if (/^Market values are not shown/.test(t) || /^Hypothetical model/.test(t)) return; ul.appendChild(el('li', null, t)); });
    ul.appendChild(el('li', null, 'Market values come only from the price you type, in your browser. The Lab keeps no prices.'));
    p.appendChild(el('details', { 'class': 'fold' }, [el('summary', null, ['Notes and definitions', el('small', null, 'how each figure is built')]), el('div', { 'class': 'fold-body' }, ul)]));
    p.appendChild(disc('Discount rate: ' + D.defaults.discount_rate_text + '. ' + DISC));
  }

  /* ---------- page ---------- */
  function load(ticker) {
    var c = D.companies.filter(function (x) { return x.ticker === ticker; })[0] || D.companies[0];
    S.co = c; S.price = null;
    $('pick').value = c.ticker;
    history.replaceState(null, '', '?c=' + encodeURIComponent(c.ticker) + (location.hash || ''));
    renderHeader(c); renderEarnings(c); renderValue(c); renderCash(c); renderSources(c);
  }
  TABCTL = L.tabs({ list: $('tablist'), panels: $('panels'), tabs: TABS, label: 'Company sections', minHeight: '1000px' });
  var MK = null, MROW = {};
  Promise.all([L.load('company_room'), L.load('markets')]).then(function (r) {
    D = r[0]; MK = r[1]; MK.rows.forEach(function (x) { MROW[x.ticker] = x; });
    L.status();
    var pick = $('pick'); pick.textContent = '';
    D.companies.forEach(function (c) { pick.appendChild(el('option', { value: c.ticker }, c.ticker + ' \u00b7 ' + L.shortName(c.name))); });
    pick.addEventListener('change', function () { load(pick.value); });
    var want = (new URLSearchParams(location.search).get('c') || 'AAPL').toUpperCase();
    load(want);
    TABCTL.initial();
    TABS.forEach(function (t) { $('panel-' + t.id).style.minHeight = ''; }); $('panels').style.minHeight = '0';
  }).catch(L.fail);
})();
