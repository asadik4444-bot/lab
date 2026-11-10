/* Company room (SPEC-company.md). Every figure comes from data/company_room.json or from company_math.js computed on it.
   The only constants below are UI settings: slider ranges, the grid's step sizes and the +/- discount-rate step the spec asks for. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var CM = window.CompanyMath;
  var D, LOGOS = null, MK = null, DL = null, MAC = null;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) document.documentElement.classList.add('js');
  var MINUS = '−', UP = '▲', DOWN = '▼';

  /* UI settings (not data): control ranges, grid steps (SPEC section 6), discount-rate step (SPEC section 4), reverse-DCF search range. */
  var SLIDER = { margin: { min: 0.01, max: 0.6, step: 0.001 }, rate: { min: 0.04, max: 0.16, step: 0.0005 }, terminal: { min: 0, max: 0.04, step: 0.0005 }, growth: { step: 0.001 } };
  var GRID_G = [-0.10, -0.05, 0, 0.05, 0.10], GRID_M = [-0.10, -0.05, 0, 0.05, 0.10];
  var RANGE_PP = 0.01, SEARCH = [-0.5, 1.0];
  var INK = '#14213d', CASH = '#a9825a', GREYBAR = '#8d95a3', GREYPRIOR = '#b3a58f';

  var S = { co: null, p: null, def: null, claims: null, shares: null, mkt: false };
  var drawers = new Map(), ro = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function sv(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function nfd(min, max) { return new Intl.NumberFormat('en-GB', { minimumFractionDigits: min, maximumFractionDigits: max }); }
  var nf0 = nfd(0, 0), nf1 = nfd(1, 1), nf2 = nfd(2, 2);
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dateLong(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3 || !/^\d+$/.test(p[2])) return iso;
    return +p[2] + ' ' + MONL[+p[1] - 1] + ' ' + p[0];
  }
  function dateShort(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3 || !/^\d+$/.test(p[2])) return iso;
    return +p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0];
  }

  /* ---------- formatting ---------- */
  /* Money rule: USD, shown as $tn from 1,000bn up (2 decimals), $bn below (0 decimals from 100bn, 1 from 10bn, 2 below), $m under 1bn. */
  function usd(v) {
    if (v == null || !isFinite(v)) return '—';
    var a = Math.abs(v) / 1e9, s = v < 0 ? MINUS : '';
    if (a >= 1000) return s + '$' + nf2.format(a / 1000) + 'tn';
    if (a >= 100) return s + '$' + nf0.format(a) + 'bn';
    if (a >= 10) return s + '$' + nf1.format(a) + 'bn';
    if (a >= 1) return s + '$' + nf2.format(a) + 'bn';
    if (a >= 0.001) return s + '$' + nf0.format(a * 1000) + 'm';
    return '$0';
  }
  function usdSigned(v) { return (v < 0 ? MINUS : '+') + usd(Math.abs(v)); }
  function usdRange(lo, hi) {
    var a = Math.abs(hi) / 1e9, sg = function (v) { return v < 0 ? MINUS : ''; };
    if (a >= 1000) return '$' + sg(lo) + nf1.format(Math.abs(lo) / 1e12) + '–' + sg(hi) + nf1.format(Math.abs(hi) / 1e12) + 'tn';
    var f = a >= 100 ? nf0 : (a >= 10 ? nf1 : nf2);
    return '$' + sg(lo) + f.format(Math.abs(lo) / 1e9) + '–' + sg(hi) + f.format(Math.abs(hi) / 1e9) + 'bn';
  }
  function ps(v) {
    if (v == null || !isFinite(v)) return '—';
    var a = Math.abs(v), f = a >= 100 ? nf0 : (a >= 10 ? nf1 : nf2);
    return (v < 0 ? MINUS : '') + '$' + f.format(a);
  }
  function psRange(lo, hi) {
    var a = Math.abs(hi), f = a >= 100 ? nf0 : (a >= 10 ? nf1 : nf2);
    var sg = function (v) { return v < 0 ? MINUS : ''; };
    return '$' + sg(lo) + f.format(Math.abs(lo)) + '–' + sg(hi) + f.format(Math.abs(hi));
  }
  function pct(v, d) { return v == null ? '—' : (v < 0 && Math.abs(v) * 100 >= (d === 2 ? 0.005 : 0.05) ? MINUS : '') + (d === 2 ? nf2 : nf1).format(Math.abs(v) * 100) + '%'; }
  function pctS(v) { return v == null ? '—' : (v < 0 ? MINUS : '+') + nf1.format(Math.abs(v) * 100) + '%'; }
  function mult(v) { return nf1.format(v) + '×'; }
  function shares(v) { return v >= 1e9 ? nf2.format(v / 1e9) + 'bn' : (v >= 1e6 ? nf2.format(v / 1e6) + 'm' : nf0.format(v)); }
  function days(v) { return (v < 0 ? MINUS : '') + nf1.format(Math.abs(v)); }
  function minus(s) { return String(s).replace(/ - /g, ' ' + MINUS + ' ').replace(/-(\d)/g, MINUS + '$1'); }
  function secUrl(u) { return typeof u === 'string' && /^https:\/\/www\.sec\.gov\//.test(u) ? u : null; }
  function val(o) { return o && o.value != null ? o.value : null; }
  function reasonOf(o, fin) {
    if (o && o.not_comparable || fin) return 'not comparable for banks and insurers';
    if (!o) return 'not available';
    return o.reason || 'not available';
  }

  /* ---------- load ---------- */
  function load(url, optional) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) { if (optional) return null; throw new Error(url + ' ' + r.status); }
      return r.json();
    }).catch(function (e) { if (optional) return null; throw e; });
  }
  Promise.all([load('../data/company_room.json', false), load('assets/logos/logos.json', true), load('../data/markets.json', true), load('../data/deals_room.json', true), load('../data/macro_room.json', true)]).then(function (res) {
    D = res[0]; LOGOS = res[1]; MK = res[2]; DL = res[3]; MAC = res[4];
    start();
  }).catch(function (e) {
    var er = $('error'); er.hidden = false;
    er.textContent = 'Could not load data/company_room.json (' + e.message + '). Serve this folder over HTTP, for example: python -m http.server 5230';
  });

  function findCo(q) {
    if (!q) return null;
    var k = String(q).toUpperCase().replace(/\./g, '-'), hit = null;
    D.companies.forEach(function (c) { if (c.ticker.toUpperCase() === k) hit = c; });
    return hit;
  }

  function start() {
    S.mkt = D.private === true;
    document.documentElement.setAttribute('data-ready', '1');
    var sel = $('co-select');
    D.companies.forEach(function (c) { sel.appendChild(el('option', { value: c.ticker }, c.rank + ' · ' + c.name + ' (' + c.ticker + ')')); });
    var q = new URLSearchParams(location.search).get('c'), co = findCo(q), note = null;
    if (!co) { if (q) note = 'No company “' + q + '” in this dataset; showing ' + D.companies[0].name + '.'; co = D.companies[0]; }
    sel.addEventListener('change', function () {
      var c = findCo(sel.value); if (!c) return;
      history.replaceState(null, '', '?c=' + encodeURIComponent(c.ticker) + location.hash);
      show(c, null);
    });
    ro = window.ResizeObserver ? new ResizeObserver(function (es) { es.forEach(function (e) { var f = drawers.get(e.target); if (f) f(); }); }) : null;
    window.addEventListener('resize', function () { drawers.forEach(function (f) { f(); }); });
    buildControls();
    $('reset').addEventListener('click', function () { resetDcf(); });
    renderRail(); setupChrome();
    show(co, note);
    setupReveal();
  }

  function reg(wrap, fn) {
    drawers.set(wrap, fn);
    if (ro) ro.observe(wrap);
    fn();
  }

  function show(co, note) {
    S.co = co;
    if (ro) ro.disconnect();
    drawers.clear();
    $('co-select').value = co.ticker;
    document.title = co.name + ' · The Company Room · Asadbek Abdurashidov';
    var n = $('co-notice'); n.hidden = !note; n.textContent = note || '';
    renderHero(); renderBridge(); renderEarn(); setupDcf(); renderWc(); renderSources();
  }

  /* ---------- chrome ---------- */
  function setupChrome() {
    var btn = document.querySelector('.menu-btn'), menu = $('menu');
    function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Open menu'); }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.hidden;
      menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    document.addEventListener('click', function (e) { if (!menu.hidden && !e.target.closest('#menu')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
    var darks = [].slice.call(document.querySelectorAll('.dark')), tick = false;
    function flip() {
      tick = false;
      var on = darks.some(function (d) { var r = d.getBoundingClientRect(); return r.top <= 34 && r.bottom > 34; });
      document.body.classList.toggle('on-dark', on);
    }
    window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(flip); } }, { passive: true });
    flip();
  }
  function setupReveal() {
    var items = [].slice.call(document.querySelectorAll('[data-reveal]'));
    if (reduced || !('IntersectionObserver' in window)) { items.forEach(function (i) { i.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    items.forEach(function (i) { io.observe(i); });
  }

  /* ---------- rail ---------- */
  function renderRail() {
    var ul = $('rail'); ul.textContent = '';
    var HREF = { Markets: 'index.html', Macro: 'macro.html', Deals: 'deals.html', Company: 'company.html' };
    ['Markets', 'Macro', 'Deals', 'Company'].forEach(function (room) {
      var li = el('li'), name = el('span', { 'class': 'room' }, room), meta = el('span', { 'class': 'meta' });
      if (room === 'Markets') meta.textContent = MK ? MK.counts.ranked + ' ranked · ' + dateShort(MK.as_of) : 'open the room';
      else if (room === 'Macro') meta.textContent = MAC ? MAC.export.series + ' series · ' + MAC.built : 'open the room';
      else if (room === 'Deals') meta.textContent = DL ? DL.filings_total + ' filings · ' + DL.sponsors.filter(function (x) { return x.rank != null; }).length + ' sponsors' : 'open the room';
      else meta.textContent = D.companies.length + ' companies · DCF';
      var a = el('a', { href: HREF[room], 'class': 'rail-link' });
      if (room === 'Company') { a.setAttribute('aria-current', 'page'); li.setAttribute('aria-current', 'page'); }
      a.appendChild(name); a.appendChild(meta); li.appendChild(a);
      ul.appendChild(li);
    });
  }

  /* ---------- hero ---------- */
  function mono(c) { var t = String(c.ticker).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4); return t || '?'; }
  function logoBadge(c) {
    var b = el('span', { 'class': 'lg big', 'aria-hidden': 'true' });
    var L = LOGOS && LOGOS[c.ticker];
    if (L && L.file) {
      var i = el('i'), u = 'url("' + L.file + '")';
      i.style.webkitMaskImage = u; i.style.maskImage = u;
      if (L.hex && /^[0-9a-fA-F]{6}$/.test(L.hex)) i.style.background = '#' + L.hex;
      b.appendChild(i);
    } else { var m = mono(c); b.appendChild(el('b', { 'class': 'mono l' + m.length }, m)); }
    return b;
  }
  function disclaimer() {
    var t = null;
    (D.notes || []).forEach(function (n) { if (/^Hypothetical model/.test(n)) t = n; });
    return t || 'Hypothetical model on stated assumptions; not investment advice; no price targets.';
  }
  function mktReason(derivedReason) {
    if (derivedReason) return derivedReason;
    var t = null;
    (D.notes || []).forEach(function (n) { if (/private until/i.test(n)) t = n; });
    return t || 'market values are not shown in this version';
  }
  function fig(label, v, sub, nc, subExtra) {
    var f = el('div', { 'class': 'fig' });
    f.appendChild(el('span', { 'class': 'l' }, label));
    f.appendChild(el('span', { 'class': 'v' + (nc ? ' nc' : (v === '—' ? ' nil' : '')) }, v));
    if (sub) f.appendChild(el('span', { 'class': 'sub' }, sub));
    if (subExtra) f.appendChild(el('span', { 'class': 'sub' }, subExtra));
    return f;
  }
  function renderHero() {
    var c = S.co, m = c.market || {}, dv = c.derived || {}, fin = c.financial, mkt = S.mkt && m.market_cap != null;
    var eb = $('eyebrow'); eb.textContent = 'AUTOMATED · SEC EDGAR · ' + (D.price_source || '').toUpperCase();
    if (D.private === true) eb.appendChild(el('span', { 'class': 'priv' }, 'PRIVATE · prices not for publication'));
    $('co-logo').textContent = ''; $('co-logo').appendChild(logoBadge(c));
    $('co-name').textContent = c.name; $('co-tk').textContent = c.ticker;
    var deck = 'Fiscal year to ' + dateLong(c.fy.end) + ' (FY' + c.fy.fy + ') from the 10-K';
    deck += mkt ? '; market value on ' + dateLong(m.price_date) + '.' : '.';
    $('deck').textContent = deck;
    var box = $('figures'); box.textContent = '';
    var why = mktReason(null);
    // 1 market cap
    if (mkt) box.appendChild(fig('Market cap', usd(m.market_cap), (m.price_symbol || c.ticker) + ' close ' + ps(m.close) + ' · ' + dateShort(m.price_date)));
    else box.appendChild(fig('Market cap', '—', why));
    // 2 enterprise value
    if (fin) box.appendChild(fig('Enterprise value', 'n/c', reasonOf(null, true), true));
    else if (mkt && dv.ev != null) box.appendChild(fig('Enterprise value', usd(dv.ev), 'Market cap + debt + leases + NCI − cash'));
    else box.appendChild(fig('Enterprise value', '—', mkt ? (dv.ev_reason || 'not available') : mktReason(dv.ev_reason)));
    // 3 EV / EBITDA
    var eb3 = val(c.valuation && c.valuation.ebitda);
    if (fin) box.appendChild(fig('EV / EBITDA', 'n/c', reasonOf(null, true), true));
    else if (mkt && dv.ev_ebitda != null) box.appendChild(fig('EV / EBITDA', mult(dv.ev_ebitda), eb3 != null ? 'EBITDA ' + usd(eb3) : null, false, (dv.ev_caveats || []).length ? 'See caveat under the bridge below.' : null));
    else box.appendChild(fig('EV / EBITDA', '—', mkt ? (dv.ev_ebitda_reason || 'not available') : mktReason(dv.ev_ebitda_reason)));
    // 4 P/E
    if (mkt && dv.pe != null) box.appendChild(fig('P/E (diluted)', mult(dv.pe), dv.pe_basis));
    else box.appendChild(fig('P/E (diluted)', '—', mkt ? (dv.pe_reason || 'not available') : mktReason(dv.pe_reason)));
    $('disc-hero').textContent = disclaimer();
  }

  /* ---------- svg helpers ---------- */
  function halo(attrs, text) { attrs['paint-order'] = 'stroke'; attrs.stroke = 'var(--bone)'; attrs['stroke-width'] = 3; attrs['stroke-linejoin'] = 'round'; return sv('text', attrs, text); }
  function wrapText(text, maxChars) {
    var words = String(text).split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function svgBase(wrap, W, H, label) {
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': label });
    wrap.textContent = ''; wrap.appendChild(svg);
    return svg;
  }
  function tickStep(max, n) {
    var raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    var nice = f <= 1 ? 1 : (f <= 2 ? 2 : (f <= 2.5 ? 2.5 : (f <= 5 ? 5 : 10)));
    return nice * p;
  }

  /* ---------- 2. bridge ---------- */
  function renderBridge() {
    var c = S.co, dv = c.derived || {}, fin = c.financial, vl = c.valuation || {}, mkt = S.mkt && c.market && c.market.market_cap != null;
    var title = $('bridge-title'), why = $('bridge-why'), body = $('bridge-body');
    if (fin) {
      title.textContent = 'Enterprise value and EV / EBITDA are n/c for ' + c.name.replace(/\.$/, '') + ': ' + reasonOf(null, true) + '.';
      why.hidden = false; why.textContent = 'Deposits, trading liabilities and insurance reserves are the business itself rather than financing, so a debt-and-cash bridge and an EBITDA multiple would mislead. The bridge, DCF, reverse DCF, growth × margin grid and working-capital days are skipped for these companies.';
      body.hidden = true; return;
    }
    if (!mkt || !dv.bridge) {
      title.textContent = 'Enterprise value is not shown for ' + c.name + ': ' + mktReason(dv.ev_reason) + '.';
      why.hidden = true; body.hidden = true; return;
    }
    why.hidden = true; body.hidden = false;
    title.textContent = 'Enterprise value ' + usd(dv.ev) + (dv.ev_ebitda != null ? ': ' + mult(dv.ev_ebitda) + ' EBITDA of ' + usd(val(vl.ebitda)) + '.' : '. ' + (dv.ev_ebitda_reason || '') );
    var steps = [], run = 0;
    dv.bridge.forEach(function (b) {
      var s = { key: b.key, label: b.label, v: b.value };
      if (b.key === 'market_cap') { s.kind = 'total'; s.a = 0; s.b = b.value; run = b.value; s.text = usd(b.value); }
      else if (b.key === 'ev') { s.kind = 'total'; s.a = 0; s.b = b.value; s.text = usd(b.value); }
      else if (b.value == null) { s.kind = 'null'; s.a = run; s.b = run; s.text = 'n/a'; }
      else if (b.value === 0) { s.kind = 'zero'; s.a = run; s.b = run; s.text = 'none'; }
      else if (b.value > 0) { s.kind = 'add'; s.a = run; s.b = run + b.value; run = s.b; s.text = usdSigned(b.value); }
      else { s.kind = 'sub'; s.b = run; s.a = run + b.value; run = s.a; s.text = usdSigned(b.value); }
      steps.push(s);
    });
    var wrap = $('bridge-chart');
    reg(wrap, function () { drawBridge(wrap, steps); });
    $('bridge-unit').textContent = 'USD. Bars share one scale. Balance-sheet items at fiscal year-end ' + dateShort(c.fy.end) + '; market value at ' + dateShort(c.market.price_date) + '. n/a = not reported (reason in the table below).';
    var cv = $('bridge-cav'); cv.textContent = '';
    (dv.ev_caveats || []).forEach(function (t) { cv.appendChild(el('li', null, 'Caveat: ' + t + '.')); });
    var ol = val(vl.operating_leases);
    $('bridge-memo').textContent = ol != null
      ? 'Operating leases ' + usd(ol) + ' are not added: under US GAAP, EBITDA is already after rent.'
      : 'Operating leases are not added: under US GAAP, EBITDA is already after rent.' + (vl.operating_leases && vl.operating_leases.reason ? ' (Operating lease liability: ' + vl.operating_leases.reason + '.)' : '');
    renderBridgeTable(steps);
  }
  function drawBridge(wrap, steps) {
    var W = Math.round(wrap.clientWidth); if (W < 240) return;
    var narrow = W < 520, labW = narrow ? 112 : 190, rm = narrow ? 76 : 96, rowH = narrow ? 42 : 40, fs = narrow ? 11.5 : 13, t = 6;
    var H = t + rowH * steps.length + 4, pw = W - labW - rm, max = 0;
    steps.forEach(function (s) { max = Math.max(max, s.a, s.b); });
    function x(v) { return labW + v / max * pw; }
    var alt = steps.map(function (s) { return s.label + ': ' + s.text; }).join('; ');
    var svg = svgBase(wrap, W, H, 'Waterfall from market value of equity to enterprise value. ' + alt + '.');
    steps.forEach(function (s, i) {
      var y = t + i * rowH, cy = y + rowH / 2, total = s.kind === 'total';
      svg.appendChild(sv('line', { x1: 0, x2: W, y1: y + rowH, y2: y + rowH, stroke: 'var(--grey)', 'stroke-opacity': .55 }));
      wrapText(s.label, narrow ? 15 : 28).forEach(function (ln, k, arr) {
        svg.appendChild(sv('text', { x: 2, y: cy + 4 + (k - (arr.length - 1) / 2) * (fs + 1.5), 'font-size': fs, 'font-weight': total ? 700 : 500, fill: 'var(--ink)' }, ln));
      });
      var x0 = x(Math.min(s.a, s.b)), x1 = x(Math.max(s.a, s.b)), w = Math.max(x1 - x0, 2.5);
      var fill = total ? INK : (s.kind === 'add' ? CASH : GREYBAR);
      if (s.kind === 'null' || s.kind === 'zero') {
        svg.appendChild(sv('line', { x1: x0, x2: x0, y1: cy - 8, y2: cy + 8, stroke: 'var(--ink-2)', 'stroke-width': 1.5, 'stroke-dasharray': '2 2' }));
      } else {
        svg.appendChild(sv('rect', { x: x0, y: cy - 9, width: w, height: 18, rx: 3, fill: fill }));
      }
      svg.appendChild(sv('text', { x: x0 + w + 8, y: cy + 4.5, 'font-size': fs, 'font-weight': total ? 800 : 700, fill: s.kind === 'null' || s.kind === 'zero' ? 'var(--ink-2)' : 'var(--ink)' }, s.text));
      // connector to next row
      if (i < steps.length - 1 && steps[i + 1].kind !== 'total') {
        var lvl = x(s.kind === 'sub' ? s.a : s.b);
        svg.appendChild(sv('line', { x1: lvl, x2: lvl, y1: cy + 9, y2: cy + rowH - 9, stroke: 'var(--ink-2)', 'stroke-opacity': .5, 'stroke-dasharray': '2 3' }));
      }
    });
    svg.appendChild(sv('line', { x1: labW, x2: labW, y1: t, y2: H - 4, stroke: 'var(--ink-2)' }));
  }
  function renderBridgeTable(steps) {
    var c = S.co, vl = c.valuation || {}, tb = $('bridge-table'); tb.textContent = '';
    var cap = el('caption', { 'class': 'sr-only' }, 'Enterprise value bridge: each step with its formula, rule and the SEC facts behind it.'); tb.appendChild(cap);
    var hd = el('tr'); ['Step', 'Value', 'Formula / rule', 'Source facts'].forEach(function (h, i) { hd.appendChild(el('th', { scope: 'col', 'class': i === 1 ? 'num' : '' }, h)); });
    var th = el('thead'); th.appendChild(hd); tb.appendChild(th);
    var tbd = el('tbody');
    steps.forEach(function (s) {
      var tr = el('tr'); tr.appendChild(el('th', { scope: 'row' }, s.label));
      tr.appendChild(el('td', { 'class': 'num' }, s.text));
      var f = el('td'), srcs = el('td'), o = vl[s.key];
      if (s.key === 'market_cap') {
        f.textContent = 'close × shares (' + String(c.shares_for_per_share && c.shares_for_per_share.basis || '').replace(/_/g, ' ') + ')';
        srcs.textContent = (c.market.price_symbol || c.ticker) + ' close ' + ps(c.market.close) + ' on ' + dateShort(c.market.price_date) + '; ' + shares(c.market.shares) + ' shares at ' + dateShort(c.market.shares_end) + '.';
      } else if (s.key === 'ev') {
        f.textContent = (D.definitions && D.definitions.ev) || 'market cap + debt + finance leases + NCI − cash − short-term investments';
        srcs.textContent = 'Sum of the steps above.';
      } else if (o) {
        var t = [];
        if (o.formula) t.push(o.formula); if (o.rule) t.push('rule: ' + o.rule);
        if (o.value == null && o.reason) t.push(o.reason);
        f.textContent = t.join(' · ') || '—';
        var ul = el('ul', { 'class': 'src-l' });
        (o.inputs || []).forEach(function (n) {
          var li = el('li'); li.appendChild(el('code', null, n.concept));
          li.appendChild(document.createTextNode(' at ' + dateShort(n.period_end) + ': ' + usd(n.value) + ' '));
          var u = secUrl(n.filing_url);
          if (u) li.appendChild(el('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, 'filing'));
          ul.appendChild(li);
        });
        if (ul.children.length) srcs.appendChild(ul); else srcs.textContent = '—';
      }
      tr.appendChild(f); tr.appendChild(srcs); tbd.appendChild(tr);
    });
    tb.appendChild(tbd);
  }

  /* ---------- 3. earnings ---------- */
  function tile(label, main, subs, cls) {
    var d = el('div', { 'class': 'et ' + (cls || '') });
    d.appendChild(el('span', { 'class': 'etl' }, label));
    d.appendChild(el('span', { 'class': 'etv' + (main === '—' ? ' nil' : (main === 'n/c' ? ' nc' : '')) }, main));
    (subs || []).forEach(function (s) { if (s) d.appendChild(typeof s === 'string' ? el('span', { 'class': 'ets' }, s) : s); });
    return d;
  }
  function chgPill(v, label) {
    if (Math.abs(v) * 100 < 0.05) v = 0;
    var cls = v > 0 ? 'up' : (v < 0 ? 'down' : 'flat');
    var p = el('span', { 'class': 'chg ' + cls, title: label });
    p.appendChild(el('span', { 'class': 'ar', 'aria-hidden': 'true' }, v > 0 ? UP : (v < 0 ? DOWN : '')));
    p.appendChild(document.createTextNode(v === 0 ? pct(0) : pctS(v)));
    p.appendChild(el('span', { 'class': 'sr-only' }, ' ' + label + (v > 0 ? ', up' : (v < 0 ? ', down' : ', unchanged'))));
    return p;
  }
  function partialOf(c) { var v = c.valuation || {}; return (c.derived && c.derived.partial) || (v.ebitda && v.ebitda.partial) || (v.da && v.da.partial) || null; }
  function renderEarn() {
    var c = S.co, f = c.fundamentals || {}, dv = c.derived || {}, vl = c.valuation || {}, fin = c.financial, fy = c.fy.fy;
    var rev = val(f.revenue), gr = val(f.growth_yoy), om = val(f.operating_margin), fcf = val(f.fcf);
    var parts = [];
    if (rev != null) parts.push(usd(rev) + ' of revenue' + (gr != null ? ' (' + pctS(gr) + ' on the year)' : ''));
    if (om != null) parts.push('a ' + pct(om) + ' operating margin');
    if (fcf != null) parts.push(usd(fcf) + ' of free cash flow');
    $('earn-title').textContent = parts.length ? 'In FY' + fy + ' ' + c.name + ' earned ' + parts.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.' : 'FY' + fy + ' earnings are not available for ' + c.name + '.';
    var bx = $('etiles'); bx.textContent = '';
    function nil(o) { return fin || (o && o.not_comparable) ? ['n/c', reasonOf(o, true)] : ['—', reasonOf(o, false)]; }
    var n;
    // revenue
    if (rev != null) {
      var subs = [];
      if (gr != null) { var g = el('span', { 'class': 'ets egr' }); g.appendChild(chgPill(gr, 'Revenue growth y/y')); g.appendChild(document.createTextNode(' vs FY' + (fy - 1) + (val(f.revenue_prior) != null ? ' (' + usd(val(f.revenue_prior)) + ')' : ''))); subs.push(g); }
      else subs.push(reasonOf(f.growth_yoy));
      bx.appendChild(tile('Revenue', usd(rev), subs));
    } else { n = nil(f.revenue); bx.appendChild(tile('Revenue', n[0], [n[1]])); }
    // EBITDA
    var eb = val(vl.ebitda);
    if (eb != null) bx.appendChild(tile('EBITDA', usd(eb), [dv.ebitda_margin != null ? pct(dv.ebitda_margin) + ' margin' : null, vl.ebitda.formula ? minus(vl.ebitda.formula.replace(/_/g, ' ')) : null, partialOf(c) ? el('span', { 'class': 'ets partial' }, 'partial: ' + partialOf(c)) : null]));
    else { n = nil(vl.ebitda); bx.appendChild(tile('EBITDA', n[0], [n[1]])); }
    // operating margin
    if (om != null) bx.appendChild(tile('Operating margin', pct(om), ['Operating income ' + usd(val(f.operating_income))]));
    else { n = nil(f.operating_margin); bx.appendChild(tile('Operating margin', n[0], [n[1]])); }
    // FCF
    if (fcf != null) bx.appendChild(tile('Free cash flow', usd(fcf), [val(f.fcf_margin) != null ? pct(val(f.fcf_margin)) + ' of revenue' : null, 'Cash from operations − capex']));
    else { n = nil(f.fcf); bx.appendChild(tile('Free cash flow', n[0], [n[1]])); }
    // unlevered FCF
    if (dv.ufcf != null) bx.appendChild(tile('Unlevered FCF', usd(dv.ufcf), [dv.ufcf_margin != null ? pct(dv.ufcf_margin) + ' of revenue' : null, dv.ufcf_formula ? 'Formula: ' + minus(dv.ufcf_formula.replace(/\bcfo\b/, 'CFO')) : null]));
    else bx.appendChild(tile('Unlevered FCF', fin ? 'n/c' : '—', [dv.ufcf_reason || reasonOf(null, fin)]));

    // pairs
    var pr = c.prior || {}, px = $('pairs'); px.textContent = '';
    [['Revenue', f.revenue, pr.revenue], ['Operating income', f.operating_income, pr.operating_income], ['Free cash flow', f.fcf, pr.fcf]].forEach(function (d) {
      var box = el('figure', { 'class': 'pair' }); box.appendChild(el('figcaption', null, d[0]));
      var w = el('div', { 'class': 'pair-plot' }); box.appendChild(w); px.appendChild(box);
      var cur = val(d[1]), pri = val(d[2]);
      if (cur == null) { w.appendChild(el('p', { 'class': 'pair-na' }, (fin || (d[1] && d[1].not_comparable) ? 'n/c: ' : '— ') + reasonOf(d[1], fin))); return; }
      reg(w, function () { drawPair(w, d[0], pri, cur, fy - 1, fy); });
      if (pri == null) box.appendChild(el('p', { 'class': 'pair-note' }, 'Prior year not available' + (d[2] && d[2].reason ? ': ' + d[2].reason : '') + '.'));
    });
    $('earn-unit').textContent = 'USD. Fiscal years to ' + dateShort(c.fy.end) + ' (FY' + fy + ') and the year before, from the 10-K. EBITDA = ' + minus(((D.definitions && D.definitions.ebitda) || 'operating income + D&A').split(';')[0]) + '.';
    var u = f.revenue && f.revenue.inputs && f.revenue.inputs[0] && secUrl(f.revenue.inputs[0].filing_url), sp = $('earn-src'); sp.textContent = '';
    sp.appendChild(document.createTextNode('Source: SEC EDGAR 10-K, fiscal year to ' + dateShort(c.fy.end) + '. '));
    if (u) sp.appendChild(el('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, 'Open the filing'));
  }
  function drawPair(wrap, name, pri, cur, fyP, fyC) {
    var W = Math.round(wrap.clientWidth); if (W < 150) return;
    var vals = [cur]; if (pri != null) vals.push(pri);
    var H = 190, m = { l: 6, r: 6, t: 30, b: Math.min.apply(null, vals) < 0 ? 54 : 30 }, ph = H - m.t - m.b, pw = W - m.l - m.r;
    var mn = Math.min.apply(null, vals.concat([0])), mx = Math.max.apply(null, vals.concat([0])), rg = (mx - mn) || 1;
    function y(v) { return m.t + (mx - v) / rg * ph; }
    var svg = svgBase(wrap, W, H, name + ': FY' + fyC + ' ' + usd(cur) + (pri != null ? ', FY' + fyP + ' ' + usd(pri) : ', prior year not available') + '.');
    var items = pri != null ? [[fyP, pri, GREYPRIOR, false], [fyC, cur, INK, true]] : [[fyC, cur, INK, true]];
    var slot = pw / 2, bw = Math.min(slot * 0.62, 84);
    items.forEach(function (it, i) {
      var cx = m.l + (pri != null ? i : 0.5) * slot + slot / 2 - (pri != null ? 0 : slot / 2) ;
      if (pri == null) cx = m.l + pw / 2;
      var y0 = y(0), y1 = y(it[1]), top = Math.min(y0, y1), h = Math.max(Math.abs(y1 - y0), 1.5);
      svg.appendChild(sv('rect', { x: cx - bw / 2, y: top, width: bw, height: h, rx: 3, fill: it[2] }));
      var neg = it[1] < 0;
      svg.appendChild(sv('text', { x: cx, y: neg ? top + h + 15 : top - 7, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': it[3] ? 800 : 600, fill: it[3] ? 'var(--ink)' : 'var(--ink-2)' }, usd(it[1])));
      svg.appendChild(sv('text', { x: cx, y: H - 8, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': it[3] ? 700 : 500, fill: it[3] ? 'var(--ink)' : 'var(--ink-2)' }, 'FY' + it[0]));
    });
    svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: 'var(--ink-2)' }));
  }

  /* ---------- 4. DCF ---------- */
  var CTL = [
    { key: 'growth', dec: 1 }, { key: 'margin', dec: 1 }, { key: 'rate', dec: 2 }, { key: 'terminal', dec: 2 }
  ];
  function buildControls() {
    var host = $('ctl-list'); host.textContent = '';
    var names = {
      growth: 'Revenue growth, years 1–' + CM.STAGE1,
      margin: 'Unlevered FCF margin',
      rate: 'Discount rate',
      terminal: 'Terminal growth'
    };
    CTL.forEach(function (c) {
      var d = el('div', { 'class': 'ctl' });
      var top = el('div', { 'class': 'ctl-top' });
      top.appendChild(el('label', { 'for': 'in-' + c.key }, names[c.key]));
      top.appendChild(el('output', { id: 'out-' + c.key, 'for': 'in-' + c.key }));
      d.appendChild(top);
      d.appendChild(el('input', { type: 'range', id: 'in-' + c.key, 'aria-describedby': 'def-' + c.key }));
      d.appendChild(el('p', { 'class': 'ctl-def', id: 'def-' + c.key }));
      host.appendChild(d);
      $('in-' + c.key).addEventListener('input', function (e) {
        S.p[c.key] = parseFloat(e.target.value);
        $('out-' + c.key).textContent = pct(S.p[c.key], c.dec);
        updateDcf();
      });
    });
  }
  function setupDcf() {
    var c = S.co, dd = c.dcf && c.dcf.defaults, none = $('dcf-none'), body = $('dcf-body');
    $('disc-dcf').textContent = disclaimer();
    $('rev').hidden = true; $('gridsec').hidden = true;
    if (!dd) {
      $('dcf-title').textContent = 'No DCF for ' + c.name + '.';
      none.hidden = false; none.textContent = (c.dcf && c.dcf.reason ? c.dcf.reason.charAt(0).toUpperCase() + c.dcf.reason.slice(1) : 'not available') + '.';
      body.hidden = true; S.p = null; return;
    }
    none.hidden = true; body.hidden = false;
    var v = c.valuation || {};
    S.claims = { debt: val(v.debt), finance_leases: val(v.finance_leases), nci: val(v.nci), cash: val(v.cash), short_term_investments: val(v.short_term_investments) };
    S.shares = c.shares_for_per_share.value;
    S.def = { revenue: c.dcf.revenue, growth: dd.growth, margin: dd.margin, rate: dd.rate, terminal: dd.terminal };
    var gb = D.defaults.growth_bounds, span = (gb[1] - gb[0]) / 2;
    var rng = {
      growth: [Math.min(gb[0] - span, dd.growth), Math.max(gb[1] + span, dd.growth), SLIDER.growth.step],
      margin: [Math.min(SLIDER.margin.min, dd.margin), Math.max(SLIDER.margin.max, dd.margin), SLIDER.margin.step],
      rate: [Math.min(SLIDER.rate.min, dd.rate), Math.max(SLIDER.rate.max, dd.rate), SLIDER.rate.step],
      terminal: [Math.min(SLIDER.terminal.min, dd.terminal), Math.max(SLIDER.terminal.max, dd.terminal), SLIDER.terminal.step]
    };
    var srcs = {
      growth: 'last fiscal year’s revenue growth, kept within ' + pct(gb[0]) + ' to ' + pctS(gb[1]) + '. Fades linearly to terminal growth by year ' + CM.YEARS + '.',
      margin: 'last fiscal year’s unlevered FCF margin (FY' + c.fy.fy + ').',
      rate: D.defaults.discount_rate_text + '.',
      terminal: 'assumption.'
    };
    CTL.forEach(function (ct) {
      var i = $('in-' + ct.key), r = rng[ct.key];
      i.min = r[0]; i.max = r[1]; i.step = r[2];
      $('def-' + ct.key).textContent = 'Default ' + pct(S.def[ct.key], ct.dec) + ': ' + srcs[ct.key];
    });
    resetDcf();
  }
  function resetDcf() {
    if (!S.def) return;
    S.p = Object.assign({}, S.def);
    CTL.forEach(function (ct) { $('in-' + ct.key).value = S.p[ct.key]; $('out-' + ct.key).textContent = pct(S.p[ct.key], ct.dec); });
    updateDcf();
  }
  function updateDcf() {
    if (!S.p) return;
    var c = S.co, p = S.p, vr = CM.valueRange(p, S.claims, S.shares, RANGE_PP), dv = c.derived || {};
    var mkt = S.mkt && dv.ev != null;
    var evW = $('ev-range'), psW = $('ps-range'), uW = $('ufcf-chart');
    if (!vr) {
      $('dcf-title').textContent = 'These inputs give no value: the discount rate must be above terminal growth.';
      [evW, psW, uW].forEach(function (w) { drawers.delete(w); w.textContent = ''; });
      $('ps-note').textContent = ''; $('tv-note').textContent = ''; $('ufcf-table').textContent = ''; $('ufcf-unit').textContent = '';
      $('rev').hidden = true; $('gridsec').hidden = true;
      return;
    }
    $('dcf-title').textContent = 'On these assumptions the business is worth ' + usdRange(vr.ev.low, vr.ev.high) + ', ' + psRange(vr.perShare.low, vr.perShare.high) + ' a share.';
    reg(evW, function () { drawRange(evW, { low: vr.ev.low, mid: vr.ev.mid, high: vr.ev.high, today: mkt ? dv.ev : null, fmt: usd, name: 'Enterprise value' }); });
    reg(psW, function () { drawRange(psW, { low: vr.perShare.low, mid: vr.perShare.mid, high: vr.perShare.high, today: null, fmt: ps, name: 'Value per share' }); });
    var net = CM.netClaims(S.claims), miss = [], labs = { debt: 'debt', finance_leases: 'finance leases', nci: 'non-controlling interest', cash: 'cash', short_term_investments: 'short-term investments' };
    Object.keys(labs).forEach(function (k) { if (S.claims[k] == null) miss.push(labs[k] + ' (' + ((c.valuation[k] && c.valuation[k].reason) || 'not reported') + ')'); });
    $('ps-note').textContent = 'Equity value = enterprise value − net claims of ' + usd(net) + ' (debt + finance leases + non-controlling interest − cash − short-term investments), divided by ' + shares(S.shares) + ' shares (' + String(c.shares_for_per_share.basis).replace(/_/g, ' ') + ').' + (miss.length ? ' Not reported, counted as zero: ' + miss.join('; ') + '.' : '');
    var lowR = p.rate + RANGE_PP, highR = p.rate - RANGE_PP;
    $('ufcf-unit').textContent = 'Range: discount rate ± ' + nf0.format(RANGE_PP * 100) + ' pp (low value at ' + pct(lowR, 2) + ', high value at ' + pct(highR, 2) + '); the central case uses ' + pct(p.rate, 2) + '. Projected cash flow below is the central case, USD, from FY' + (c.fy.fy + 1) + '.';
    reg(uW, function () { drawUfcf(uW, vr.central, p); });
    var cen = vr.central;
    $('tv-note').textContent = 'Terminal value at year ' + CM.YEARS + ': ' + usd(cen.terminalValue) + ' (Gordon growth on year-' + CM.YEARS + ' cash flow at ' + pct(p.terminal, 2) + ' terminal growth), worth ' + usd(cen.pvTerminal) + ' today, ' + pct(cen.pvTerminal / cen.ev) + ' of the central enterprise value. It is a note here, not a bar, because it would dwarf the ten years.';
    renderUfcfTable(cen, c.fy.fy);
    renderReverse(); renderGrid();
  }
  function drawRange(wrap, o) {
    var W = Math.round(wrap.clientWidth); if (W < 220) return;
    var narrow = W < 420, fs = narrow ? 12 : 13, m = { l: 34, r: 34 }, hasT = o.today != null;
    var d0 = Math.min(o.low, hasT ? o.today : o.low), d1 = Math.max(o.high, hasT ? o.today : o.high);
    if (d1 === d0) d1 = d0 + 1;
    function x(v) { return m.l + (v - d0) / (d1 - d0) * (W - m.l - m.r); }
    var top = hasT ? 50 : 14, bh = 16, H = top + bh + 62;
    var svg = svgBase(wrap, W, H, o.name + ' range: low ' + o.fmt(o.low) + ', central ' + o.fmt(o.mid) + ', high ' + o.fmt(o.high) + (hasT ? '; market value today ' + o.fmt(o.today) : '') + '.');
    var cy = top + bh / 2;
    svg.appendChild(sv('line', { x1: 0, x2: W, y1: cy, y2: cy, stroke: 'var(--grey)', 'stroke-opacity': .7 }));
    svg.appendChild(sv('rect', { x: x(o.low), y: top, width: Math.max(x(o.high) - x(o.low), 2), height: bh, rx: 3, fill: CASH }));
    svg.appendChild(sv('line', { x1: x(o.mid), x2: x(o.mid), y1: top - 5, y2: top + bh + 5, stroke: INK, 'stroke-width': 3 }));
    function lab(xx, yy, anchor, t, w) {
      svg.appendChild(halo({ x: xx, y: yy, 'text-anchor': anchor, 'font-size': fs, 'font-weight': w, fill: 'var(--ink)' }, t));
    }
    var tw = 42;
    function clampX(xx) { return Math.max(tw, Math.min(W - tw, xx)); }
    lab(clampX(x(o.low)), top + bh + 22, 'middle', o.fmt(o.low), 700);
    svg.appendChild(sv('text', { x: clampX(x(o.low)), y: top + bh + 36, 'text-anchor': 'middle', 'font-size': fs - 1, fill: 'var(--ink-2)' }, 'low'));
    lab(clampX(x(o.high)), top + bh + 22, 'middle', o.fmt(o.high), 700);
    svg.appendChild(sv('text', { x: clampX(x(o.high)), y: top + bh + 36, 'text-anchor': 'middle', 'font-size': fs - 1, fill: 'var(--ink-2)' }, 'high'));
    lab(x(o.mid), top + bh + 55, 'middle', 'central ' + o.fmt(o.mid), 800);
    if (hasT) {
      var tx = x(o.today), anc = tx < W * 0.25 ? 'start' : (tx > W * 0.75 ? 'end' : 'middle');
      svg.appendChild(sv('line', { x1: tx, x2: tx, y1: 22, y2: cy, stroke: INK, 'stroke-width': 1.5 }));
      svg.appendChild(sv('circle', { cx: tx, cy: cy, r: 7, fill: 'var(--bone)', stroke: INK, 'stroke-width': 2.5 }));
      lab(anc === 'start' ? Math.max(2, tx - 6) : (anc === 'end' ? Math.min(W - 2, tx + 6) : tx), 12, anc, 'market value today ' + o.fmt(o.today), 700);
    }
  }
  function drawUfcf(wrap, r, p) {
    var W = Math.round(wrap.clientWidth); if (W < 240) return;
    var narrow = W < 520, fs = narrow ? 11 : 12, m = { l: narrow ? 58 : 66, r: 6, t: 26, b: 64 }, H = narrow ? 270 : 310;
    var ph = H - m.t - m.b, pw = W - m.l - m.r, n = r.ufcf.length, max = Math.max.apply(null, r.ufcf);
    var step = tickStep(max, 3), top = Math.ceil(max / step) * step;
    function y(v) { return m.t + (1 - v / top) * ph; }
    var slot = pw / n, bw = slot * 0.62;
    var svg = svgBase(wrap, W, H, 'Projected unlevered free cash flow, years 1 to ' + n + ': ' + r.ufcf.map(function (v, i) { return 'year ' + (i + 1) + ' ' + usd(v); }).join('; ') + '.');
    for (var t = 0; t <= top + 1e-6; t += step) {
      svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: 'var(--grey)', 'stroke-opacity': .55 }));
      svg.appendChild(sv('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', 'font-size': fs, fill: 'var(--ink-2)' }, t === 0 ? '$0' : usd(t)));
    }
    r.ufcf.forEach(function (v, i) {
      var cx = m.l + slot * i + slot / 2;
      svg.appendChild(sv('rect', { x: cx - bw / 2, y: y(v), width: bw, height: Math.max(y(0) - y(v), 1), rx: 2, fill: INK }));
      svg.appendChild(sv('text', { x: cx, y: m.t + ph + 16, 'text-anchor': 'middle', 'font-size': fs, fill: 'var(--ink-2)' }, 'Y' + (i + 1)));
      if (i === 0 || i === CM.STAGE1 - 1 || i === n - 1) svg.appendChild(halo({ x: cx, y: y(v) - 7, 'text-anchor': i === n - 1 ? 'end' : (i === 0 ? 'start' : 'middle'), 'font-size': fs, 'font-weight': 700, fill: 'var(--ink)' }, usd(v)));
    });
    var by = m.t + ph + 30, s1 = m.l + 4, e1 = m.l + slot * CM.STAGE1 - 4, s2 = e1 + 8, e2 = W - m.r - 2;
    [[s1, e1, 'growth held at ' + pct(p.growth)], [s2, e2, 'fades to ' + pct(p.terminal) + ' by Y' + n]].forEach(function (b) {
      svg.appendChild(sv('path', { d: 'M' + b[0] + ' ' + (by - 4) + 'V' + by + 'H' + b[1] + 'V' + (by - 4), fill: 'none', stroke: 'var(--ink-2)', 'stroke-width': 1 }));
      svg.appendChild(sv('text', { x: (b[0] + b[1]) / 2, y: by + 17, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 600, fill: 'var(--ink-2)' }, b[2]));
    });
    svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: 'var(--ink-2)' }));
  }
  function renderUfcfTable(r, fy) {
    var tb = $('ufcf-table'); tb.textContent = '';
    tb.appendChild(el('caption', { 'class': 'sr-only' }, 'Projected unlevered free cash flow by year, central case.'));
    var h = el('tr'); ['Year', 'Revenue growth', 'Unlevered FCF', 'Present value'].forEach(function (t, i) { h.appendChild(el('th', { scope: 'col', 'class': i ? 'num' : '' }, t)); });
    var th = el('thead'); th.appendChild(h); tb.appendChild(th);
    var b = el('tbody');
    r.ufcf.forEach(function (v, i) {
      var tr = el('tr'); tr.appendChild(el('th', { scope: 'row' }, 'Year ' + (i + 1) + ' (FY' + (fy + i + 1) + ')'));
      tr.appendChild(el('td', { 'class': 'num' }, pct(r.growthPath[i]))); tr.appendChild(el('td', { 'class': 'num' }, usd(v))); tr.appendChild(el('td', { 'class': 'num' }, usd(r.pv[i])));
      b.appendChild(tr);
    });
    var tr = el('tr'); tr.appendChild(el('th', { scope: 'row' }, 'Terminal value')); tr.appendChild(el('td', { 'class': 'num' }, '—')); tr.appendChild(el('td', { 'class': 'num' }, usd(r.terminalValue))); tr.appendChild(el('td', { 'class': 'num' }, usd(r.pvTerminal)));
    b.appendChild(tr); tb.appendChild(b);
  }

  /* ---------- 5. reverse DCF ---------- */
  function renderReverse() {
    var c = S.co, dv = c.derived || {}, sec = $('rev');
    if (!S.mkt || dv.ev == null || !S.p) { sec.hidden = true; return; }
    sec.hidden = false;
    var p = S.p, g = CM.reverseGrowth(p, dv.ev, SEARCH[0], SEARCH[1]), last = val(c.fundamentals && c.fundamentals.growth_yoy);
    $('rev-n').textContent = g == null ? '—' : pct(g);
    if (g == null) {
      $('rev-title').textContent = 'No growth rate reproduces today’s enterprise value on these inputs.';
      $('rev-k').textContent = 'The solver found no ' + CM.STAGE1 + '-year revenue growth between ' + pctS(SEARCH[0]) + ' and ' + pctS(SEARCH[1]) + ' that makes the DCF equal today’s enterprise value of ' + usd(dv.ev) + ' at a ' + pct(p.margin) + ' margin, ' + pct(p.rate, 2) + ' discount rate and ' + pct(p.terminal, 2) + ' terminal growth.';
    } else {
      $('rev-title').textContent = 'Today’s price implies revenue growth of ' + pct(g) + ' a year for ' + CM.STAGE1 + ' years.';
      $('rev-k').textContent = CM.STAGE1 + '-year revenue growth that makes the DCF equal today’s enterprise value of ' + usd(dv.ev) + ', at a ' + pct(p.margin) + ' unlevered FCF margin, ' + pct(p.rate, 2) + ' discount rate and ' + pct(p.terminal, 2) + ' terminal growth (the settings above).';
    }
    $('rev-c').textContent = last != null ? 'Last fiscal year: ' + pct(last) + '.' : 'Last fiscal year: — ' + reasonOf(c.fundamentals && c.fundamentals.growth_yoy) + '.';
    $('rev-unit').textContent = 'Solved by bisection over ' + pctS(SEARCH[0]) + ' to ' + pctS(SEARCH[1]) + ' for years 1–' + CM.STAGE1 + ', fading to terminal growth by year ' + CM.YEARS + '. Market value from ' + D.price_source + ' on ' + dateShort(c.market.price_date) + '.';
  }

  /* ---------- 6. grid ---------- */
  function ppLabel(d) { return d === 0 ? 'base' : (d < 0 ? MINUS : '+') + nf0.format(Math.abs(d) * 100) + ' pp'; }
  function renderGrid() {
    var c = S.co, dv = c.derived || {}, sec = $('gridsec');
    if (!S.p) { sec.hidden = true; return; }
    sec.hidden = false;
    var g = CM.grid(S.p, S.claims, S.shares, GRID_G, GRID_M);
    var mid = (GRID_G.length - 1) / 2, midM = (GRID_M.length - 1) / 2;
    var near = null, mkt = S.mkt && dv.ev != null;
    var lo = Infinity, hi = -Infinity;
    g.forEach(function (row, i) { row.forEach(function (cl, j) {
      if (!cl) return;
      if (cl.perShare != null) { lo = Math.min(lo, cl.perShare); hi = Math.max(hi, cl.perShare); }
      if (mkt && (near == null || Math.abs(cl.ev - dv.ev) < Math.abs(g[near[0]][near[1]].ev - dv.ev))) near = [i, j];
    }); });
    $('grid-title').textContent = isFinite(lo) ? 'Across these growth and margin cases, value per share runs from ' + ps(lo) + ' to ' + ps(hi) + '.' : 'No value per share for these inputs.';
    var tb = $('gtable'); tb.textContent = '';
    tb.appendChild(el('caption', { 'class': 'sr-only' }, 'Value per share in dollars. Rows: ' + CM.STAGE1 + '-year revenue growth. Columns: unlevered FCF margin.'));
    var thd = el('thead'), hr = el('tr');
    var corner = el('th', { scope: 'col', 'class': 'corner' });
    corner.appendChild(el('span', null, 'Growth ↓'));
    corner.appendChild(el('span', null, 'Margin →'));
    hr.appendChild(corner);
    GRID_M.forEach(function (dm, j) {
      var colv = null; g.forEach(function (row) { if (row[j]) colv = row[j].margin; });
      var th = el('th', { scope: 'col', 'class': 'num' + (j === midM ? ' ctr-h' : '') });
      th.appendChild(el('b', null, colv != null ? pct(colv) : '—')); th.appendChild(el('span', null, ppLabel(dm)));
      hr.appendChild(th);
    });
    thd.appendChild(hr); tb.appendChild(thd);
    var tbd = el('tbody');
    g.forEach(function (row, i) {
      var tr = el('tr'), rowv = null; row.forEach(function (cl) { if (cl) rowv = cl.growth; });
      var th = el('th', { scope: 'row', 'class': i === mid ? 'ctr-h' : '' });
      th.appendChild(el('b', null, rowv != null ? pct(rowv) : '—')); th.appendChild(el('span', null, ppLabel(GRID_G[i])));
      tr.appendChild(th);
      row.forEach(function (cl, j) {
        var isC = i === mid && j === midM, isN = near && near[0] === i && near[1] === j;
        var td = el('td', { 'class': 'num' + (isC ? ' ctr' : '') + (isN ? ' near' : '') });
        td.appendChild(el('span', { 'class': 'gv' }, cl && cl.perShare != null ? ps(cl.perShare) : '—'));
        if (isN) td.appendChild(el('span', { 'class': 'gt' }, '≈ today'));
        if (isC) td.appendChild(el('span', { 'class': 'sr-only' }, ' (base case)'));
        if (isN) td.appendChild(el('span', { 'class': 'sr-only' }, ' (enterprise value closest to today’s)'));
        tr.appendChild(td);
      });
      tbd.appendChild(tr);
    });
    tb.appendChild(tbd);
    $('grid-unit').textContent = 'USD a share, central discount rate ' + pct(S.p.rate, 2) + ' and terminal growth ' + pct(S.p.terminal, 2) + '. Steps from the base case (filled): growth and margin in percentage points; margin is floored at the model’s minimum.' + (near ? ' “≈ today” (outlined) marks the case whose enterprise value is closest to today’s ' + usd(dv.ev) + '.' : '');
  }

  /* ---------- 7. working capital ---------- */
  function renderWc() {
    var c = S.co, v = c.valuation || {}, sec = $('wc');
    if (c.financial) { sec.hidden = true; return; }
    var dio = val(v.dio), dso = val(v.dso), dpo = val(v.dpo), ccc = val(v.ccc);
    sec.hidden = false;
    var wrap = $('wc-chart');
    if (ccc == null) {
      $('wc-title').textContent = 'The cash conversion cycle is not available for ' + c.name.replace(/\.$/, '') + '.';
      wrap.textContent = ''; wrap.appendChild(el('p', { 'class': 'offchart' }, '— ' + (v.ccc && v.ccc.reason ? v.ccc.reason : 'not available') + '.'));
      $('wc-unit').textContent = '';
      return;
    }
    var eq = days(dio) + ' in inventory + ' + days(dso) + ' waiting for customers ' + MINUS + ' ' + days(dpo) + ' of supplier credit';
    $('wc-title').textContent = ccc < 0 ? 'Suppliers fund the cycle: ' + eq + ' = ' + days(ccc) + ' days.' : 'Cash is tied up for ' + days(ccc) + ' days: ' + eq + '.';
    var rows = [['Inventory days (DIO)', dio, GREYBAR, v.dio], ['Receivable days (DSO)', dso, GREYBAR, v.dso], ['Payable days (DPO)', dpo, GREYBAR, v.dpo], ['Cash conversion cycle (CCC)', ccc, INK, v.ccc]];
    reg(wrap, function () { drawWc(wrap, rows); });
    $('wc-unit').textContent = 'Days. Convention: ' + String(D.definitions && D.definitions.working_capital_days || 'fiscal-year-end balances / annual flow x 365').replace(' x ', ' × ').replace(/\s*\/\s*/g, ' / ') + '. CCC = DIO + DSO ' + MINUS + ' DPO.';
  }
  function drawWc(wrap, rows) {
    var W = Math.round(wrap.clientWidth); if (W < 240) return;
    var narrow = W < 520, labW = narrow ? 120 : 200, rm = 100, rowH = 42, fs = narrow ? 11.5 : 13, H = rowH * rows.length + 6;
    var mn = 0, mx = 0; rows.forEach(function (r) { mn = Math.min(mn, r[1]); mx = Math.max(mx, r[1]); });
    var pw = W - labW - rm - (mn < 0 ? rm * 1.15 : 0), x0 = labW + (mn < 0 ? rm * 1.15 : 0);
    function x(v) { return x0 + (v - mn) / ((mx - mn) || 1) * pw; }
    var svg = svgBase(wrap, W, H, 'Working capital days. ' + rows.map(function (r) { return r[0] + ': ' + days(r[1]); }).join('; ') + '.');
    rows.forEach(function (r, i) {
      var y = 3 + i * rowH, cy = y + rowH / 2, total = i === rows.length - 1;
      svg.appendChild(sv('line', { x1: 0, x2: W, y1: y + rowH, y2: y + rowH, stroke: 'var(--grey)', 'stroke-opacity': .55 }));
      wrapText(r[0], narrow ? 16 : 34).forEach(function (ln, k, arr) { svg.appendChild(sv('text', { x: 2, y: cy + 4 + (k - (arr.length - 1) / 2) * (fs + 1.5), 'font-size': fs, 'font-weight': total ? 700 : 500, fill: 'var(--ink)' }, ln)); });
      var a = x(Math.min(0, r[1])), b = x(Math.max(0, r[1]));
      svg.appendChild(sv('rect', { x: a, y: cy - 9, width: Math.max(b - a, 2.5), height: 18, rx: 3, fill: r[2] }));
      var neg = r[1] < 0;
      svg.appendChild(sv('text', { x: neg ? a - 8 : b + 8, y: cy + 4.5, 'text-anchor': neg ? 'end' : 'start', 'font-size': fs, 'font-weight': total ? 800 : 700, fill: 'var(--ink)' }, (i === 2 ? MINUS + ' ' : '') + days(r[1]) + ' days'));
    });
    svg.appendChild(sv('line', { x1: x(0), x2: x(0), y1: 3, y2: H - 3, stroke: 'var(--ink-2)' }));
  }

  /* ---------- 8. notes, provenance ---------- */
  function renderSources() {
    var c = S.co, nl = $('cnotes'); nl.textContent = '';
    (D.notes || []).forEach(function (n) { nl.appendChild(el('li', null, n)); });
    $('disc-end').textContent = disclaimer();
    var u = D.defaults && D.defaults.ust10y;
    $('prov').textContent = 'SEC EDGAR 10-K facts (FY to ' + dateShort(c.fy.end) + ') via the lab data hub; market values ' + D.price_source + (c.market && c.market.price_date ? ' ' + dateShort(c.market.price_date) : '') + (D.private === true ? ' (private)' : '') + '; US Treasury 10-year ' + (u ? dateShort(u.date) : '—') + '. Built ' + (D.built || '') + '.';
  }
})();
