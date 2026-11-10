(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var D, MK = null, MAC = null;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) document.documentElement.classList.add('js');
  var MINUS = '−';
  var INK = '#14213d', CASH = '#a9825a', GREY = '#b3a58f';

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
  function nfd(a, b) { return new Intl.NumberFormat('en-GB', { minimumFractionDigits: a, maximumFractionDigits: b }); }
  var nf0 = nfd(0, 0), nf1 = nfd(1, 1);
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthLab(m) { return MON[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4); }
  function monthLong(m) { return MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4); }
  function dateLong(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3 || !/^\d+$/.test(p[2])) return iso;
    return +p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0];
  }
  function qLab(q) { return 'Q' + q.slice(5) + ' ' + q.slice(2, 4); }
  function bnOf(v) { return '$' + nf0.format(v / 1e9) + 'bn'; }
  function bn1(v) { return '$' + nf1.format(v / 1e9) + 'bn'; }

  function load(url, optional) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) { if (optional) return null; throw new Error(url + ' ' + r.status); }
      return r.json();
    }).catch(function (e) { if (optional) return null; throw e; });
  }
  Promise.all([load('../data/deals_room.json', false), load('../data/markets.json', true), load('../data/macro_room.json', true)]).then(function (res) {
    D = res[0]; MK = res[1]; MAC = res[2];
    build();
  }).catch(function (e) {
    var er = $('error'); er.hidden = false;
    er.textContent = 'Could not load data/deals_room.json (' + e.message + '). Serve this folder over HTTP, for example: python -m http.server 5230';
  });

  function build() {
    document.documentElement.setAttribute('data-ready', '1');
    renderRail(); renderHero(); renderFlow(); renderFilings(); renderSponsors(); renderFormD(); renderNotes();
    setupChrome(); setupReveal();
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
  function ranked() { return D.sponsors.filter(function (s) { return s.rank != null; }); }
  function renderRail() {
    var ul = $('rail'); ul.textContent = '';
    var HREF = { Markets: 'index.html', Macro: 'macro.html', Deals: 'deals.html', Company: 'company.html' };
    ['Markets', 'Macro', 'Deals', 'Company'].forEach(function (room) {
      var li = el('li'), name = el('span', { 'class': 'room' }, room), meta = el('span', { 'class': 'meta' });
      if (room === 'Markets') meta.textContent = MK ? MK.counts.ranked + ' ranked · ' + dateLong(MK.as_of) : 'open the room';
      else if (room === 'Macro') meta.textContent = MAC ? MAC.export.series + ' series · ' + MAC.built : 'open the room';
      else if (room === 'Deals') meta.textContent = nf0.format(D.filings_total) + ' filings · ' + ranked().length + ' sponsors';
      else { meta.textContent = 'open the room'; fetch('../data/company_room.json').then(function (r) { return r.json(); }).then(function (j) { meta.textContent = j.companies.length + ' companies · DCF'; }).catch(function () {}); }
      if (HREF[room]) {
        var a = el('a', { href: HREF[room], 'class': 'rail-link' });
        if (room === 'Deals') { a.setAttribute('aria-current', 'page'); li.setAttribute('aria-current', 'page'); }
        a.appendChild(name); a.appendChild(meta); li.appendChild(a);
      } else { li.className = 'soon'; li.setAttribute('aria-disabled', 'true'); li.appendChild(name); li.appendChild(meta); }
      ul.appendChild(li);
    });
  }

  /* ---------- hero ---------- */
  function renderHero() {
    var h = D.headline;
    $('finding').textContent = h.text;
    var box = $('figures'); box.textContent = '';
    var fr = D.fundraising[D.fundraising.length - 1];
    function fig(label, value, sub) {
      var f = el('div', { 'class': 'fig' });
      f.appendChild(el('span', { 'class': 'l' }, label));
      f.appendChild(el('span', { 'class': 'v' }, value));
      if (sub) f.appendChild(el('span', { 'class': 'sub' }, sub));
      box.appendChild(f);
    }
    fig('Filings in the last 6 full months', nf0.format(h.last), 'vs ' + nf0.format(h.year_earlier) + ' a year earlier');
    fig('SPAC mergers flagged in the window', nf0.format(D.spac_filings), 'shown separately, never in the deal total');
    fig('PE sponsors ranked', String(ranked().length), 'Form ADV roster ' + dateLong(D.roster_date));
    fig('PE fund notices in the latest quarter', nf0.format(fr.new_notices), 'Form D, ' + fr.quarter);
  }

  /* ---------- deal flow chart ---------- */
  var FS = { active: -1, geom: null, partial: false };
  function renderFlow() {
    $('flow-title').textContent = D.flow_title || D.headline.text;
    var lg = $('flow-legend'); lg.textContent = '';
    [['k-p', 'Merger proxies (DEFM14A)'], ['k-t', 'Tender offers (SC TO-T)'], ['k-s', 'SPAC filings (shown separately, not in the total)'], ['k-h', 'Hatched: month in progress']].forEach(function (x) {
      var li = el('li'); li.appendChild(el('i', { 'class': x[0] })); li.appendChild(document.createTextNode(x[1])); lg.appendChild(li);
    });
    $('flow-unit').textContent = 'Filings per month by filing date';
    $('flow-note').textContent = nf0.format(D.amendments_skipped['SC TO-T']) + ' tender-offer amendments (SC TO-T/A) are not new deals and are not counted.';
    var last = D.monthly[D.monthly.length - 1].month, end = D.window[1];
    var dim = new Date(Date.UTC(+last.slice(0, 4), +last.slice(5, 7), 0)).getUTCDate();
    FS.partial = end.slice(0, 7) === last && +end.slice(8, 10) < dim;
    var tot = D.monthly.reduce(function (a, m) { return a + m.proxies + m.tenders; }, 0);
    $('flow-alt').textContent = 'Column chart of monthly filings from ' + monthLong(D.monthly[0].month) + ' to ' + monthLong(last) + '. ' +
      nf0.format(tot) + ' merger proxy and tender-offer filings in total, plus ' + nf0.format(D.spac_filings) + ' SPAC filings shown as a separate series.' + (FS.partial ? ' The last month is in progress.' : '');
    var wrap = $('flow-wrap');
    if (window.ResizeObserver) new ResizeObserver(drawFlow).observe(wrap); else { drawFlow(); window.addEventListener('resize', drawFlow); }
    wrap.addEventListener('keydown', function (e) {
      var n = D.monthly.length, i = FS.active;
      if (e.key === 'ArrowRight') { e.preventDefault(); setMonth(i < 0 ? 0 : Math.min(n - 1, i + 1), true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setMonth(i < 0 ? n - 1 : Math.max(0, i - 1), true); }
      else if (e.key === 'Home') { e.preventDefault(); setMonth(0, true); }
      else if (e.key === 'End') { e.preventDefault(); setMonth(n - 1, true); }
      else if (e.key === 'Escape') setMonth(-1);
    });
    wrap.addEventListener('blur', function () { setMonth(-1); });
    wrap.addEventListener('pointermove', function (e) {
      var g = FS.geom; if (!g) return;
      var rc = $('flow-chart').getBoundingClientRect(), x = (e.clientX - rc.left) * (g.W / rc.width);
      var i = Math.floor((x - g.m.l) / g.step);
      setMonth(i >= 0 && i < D.monthly.length ? i : -1);
    });
    wrap.addEventListener('pointerleave', function () { if (document.activeElement !== wrap) setMonth(-1); });
  }
  function monthDesc(i) {
    var m = D.monthly[i], part = FS.partial && i === D.monthly.length - 1;
    return monthLong(m.month) + (part ? ' (in progress to ' + dateLong(D.window[1]) + ')' : '') + ': ' + m.proxies + ' merger proxies, ' + m.tenders + ' tender offers, ' +
      (m.proxies_spac + m.tenders_spac) + ' SPAC filings (separate).';
  }
  function setMonth(i, announce) {
    FS.active = i;
    var tip = $('flow-tip'), g = FS.geom, hl = document.getElementById('flow-hl');
    if (i < 0 || !g) { tip.hidden = true; if (hl) hl.setAttribute('visibility', 'hidden'); return; }
    var m = D.monthly[i], part = FS.partial && i === D.monthly.length - 1;
    tip.textContent = '';
    tip.appendChild(el('b', null, monthLong(m.month) + (part ? ' (in progress)' : '')));
    var dl = el('dl');
    [['Merger proxies', m.proxies], ['Tender offers', m.tenders], ['Deal total', m.proxies + m.tenders], ['SPAC (separate)', m.proxies_spac + m.tenders_spac]].forEach(function (r) {
      dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, nf0.format(r[1])));
    });
    tip.appendChild(dl); tip.hidden = false;
    var sc = $('flow-chart').getBoundingClientRect().width / g.W, cx = (g.m.l + (i + 0.5) * g.step) * sc;
    var left = cx + 14; if (left + tip.offsetWidth > $('flow-wrap').clientWidth) left = cx - tip.offsetWidth - 14;
    tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
    if (hl) { hl.setAttribute('x', g.m.l + i * g.step); hl.setAttribute('visibility', 'visible'); }
    if (announce) $('flow-live').textContent = monthDesc(i);
  }
  function niceMax(v) {
    var steps = [5, 10, 20, 25, 50, 100], s = 5;
    for (var i = 0; i < steps.length; i++) { s = steps[i]; if (v / s <= 6) break; }
    return { max: Math.ceil(v / s) * s, step: s };
  }
  function drawFlow() {
    var wrap = $('flow-wrap'), svg = $('flow-chart'), W = Math.round(wrap.clientWidth); if (W < 240) return;
    var narrow = W < 560, H = narrow ? 280 : 340, m = { l: 38, r: 6, t: 24, b: 40 }, fs = narrow ? 10.5 : 12;
    var data = D.monthly, n = data.length, pw = W - m.l - m.r, ph = H - m.t - m.b, step = pw / n;
    var peak = Math.max.apply(null, data.map(function (d) { return Math.max(d.proxies + d.tenders, d.proxies_spac + d.tenders_spac); }));
    var nm = niceMax(peak);
    function y(v) { return m.t + (1 - v / nm.max) * ph; }
    FS.geom = { W: W, H: H, m: m, step: step };
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.textContent = '';
    var defs = sv('defs'), pat = sv('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.appendChild(sv('rect', { width: 6, height: 6, fill: 'var(--bone)' }));
    pat.appendChild(sv('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: INK, 'stroke-width': 2.2 }));
    defs.appendChild(pat); svg.appendChild(defs);
    for (var t = 0; t <= nm.max + 1e-9; t += nm.step) {
      svg.appendChild(sv('line', { x1: m.l, x2: m.l + pw, y1: y(t), y2: y(t), stroke: 'var(--grey)', 'stroke-opacity': .55 }));
      svg.appendChild(sv('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', 'font-size': fs, fill: 'var(--ink-2)' }, String(t)));
    }
    svg.appendChild(sv('line', { x1: m.l, x2: m.l + pw, y1: y(0), y2: y(0), stroke: 'var(--ink-2)' }));
    svg.appendChild(sv('rect', { id: 'flow-hl', x: 0, y: m.t, width: step, height: ph, fill: INK, 'fill-opacity': .07, visibility: 'hidden' }));
    var gw = step * 0.84, sw = gw * 0.62, spw = gw * 0.3, labelAll = sw >= 16;
    var maxI = 0; data.forEach(function (d, i) { if (d.proxies + d.tenders > data[maxI].proxies + data[maxI].tenders) maxI = i; });
    data.forEach(function (d, i) {
      var x0 = m.l + i * step + (step - gw) / 2, partial = FS.partial && i === n - 1;
      var hp = d.proxies / nm.max * ph, ht = d.tenders / nm.max * ph;
      svg.appendChild(sv('rect', { x: x0, y: y(0) - hp, width: sw, height: hp, fill: INK }));
      if (ht > 0) svg.appendChild(sv('rect', { x: x0, y: y(0) - hp - ht - 1, width: sw, height: ht, fill: CASH, stroke: 'var(--bone)', 'stroke-width': 0 }));
      var sp = d.proxies_spac + d.tenders_spac, hs = sp / nm.max * ph;
      if (sp > 0) svg.appendChild(sv('rect', { x: x0 + sw + 2, y: y(0) - hs, width: spw, height: hs, fill: GREY }));
      var top = y(0) - hp - ht - 1;
      if (partial) {
        svg.appendChild(sv('rect', { x: x0, y: top, width: sw, height: y(0) - top, fill: 'url(#hatch)', 'fill-opacity': .55 }));
        svg.appendChild(sv('text', { x: x0 + sw / 2, y: top - 17, 'text-anchor': 'middle', 'font-size': fs - 1, 'font-weight': 600, fill: 'var(--ink-2)' }, 'partial'));
      }
      var tot = d.proxies + d.tenders;
      if (labelAll || i === maxI || i === n - 1 || i === n - 2)
        svg.appendChild(sv('text', { x: x0 + sw / 2, y: top - 5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700, fill: 'var(--ink)' }, String(tot)));
      var every = narrow ? 3 : (step < 46 ? 2 : 1);
      if ((n - 1 - i) % every === 0) svg.appendChild(sv('text', { x: (narrow && i === n - 1) ? m.l + pw : x0 + gw / 2, y: y(0) + 17, 'text-anchor': (narrow && i === n - 1) ? 'end' : 'middle', 'font-size': fs, fill: 'var(--ink-2)' }, monthLab(d.month)));
    });
    if (FS.active >= 0) setMonth(FS.active);
  }

  /* ---------- latest filings ---------- */
  function renderFilings() {
    var ul = $('filings'); ul.textContent = '';
    D.recent.forEach(function (r) {
      var li = el('li');
      var nm = el('span', { 'class': 'f-name' }, r.name);
      (r.tickers || []).forEach(function (t) { nm.appendChild(document.createTextNode(' ')); nm.appendChild(el('span', { 'class': 'chip' }, t)); });
      li.appendChild(nm);
      li.appendChild(el('span', { 'class': 'form-b', title: r.form_label }, r.form));
      li.appendChild(el('span', { 'class': 'f-lab' }, r.form_label));
      li.appendChild(el('time', { datetime: r.file_date }, dateLong(r.file_date)));
      var a = el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, 'Filing on EDGAR');
      a.setAttribute('aria-label', 'Filing on EDGAR: ' + r.name + ', ' + r.form + ', filed ' + dateLong(r.file_date));
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  /* ---------- sponsors ---------- */
  function mono(name) { var n = String(name).replace(/[^A-Za-z]/g, ''); return n.length <= 4 ? n.toUpperCase() : n.charAt(0).toUpperCase(); }
  function badge(name) {
    var m = mono(name), b = el('span', { 'class': 'lg', 'aria-hidden': 'true' });
    b.appendChild(el('b', { 'class': 'mono l' + m.length }, m)); return b;
  }
  function renderSponsors() {
    var sp = ranked().sort(function (a, b) { return a.rank - b.rank; });
    var top = sp[0];
    $('sp-title').textContent = top.name + ' manages the most private-fund assets among the ' + sp.length + ' tracked sponsors: ' + bnOf(top.private_fund_gross_assets) + '.';
    $('sp-unit').textContent = 'Private-fund gross assets, USD bn, Form ADV roster ' + dateLong(D.roster_date) + '. Sum of each firm’s own SEC-registered advisers.';
    var mx = Math.max.apply(null, sp.map(function (s) { return s.private_fund_gross_assets; }));
    var ul = $('sbars'); ul.textContent = '';
    sp.forEach(function (s) {
      var li = el('li', { 'class': 'srow' });
      var lab = el('span', { 'class': 'sr-lab' }); lab.appendChild(badge(s.name)); lab.appendChild(el('b', null, s.name)); li.appendChild(lab);
      var plot = el('span', { 'class': 'sr-plot' });
      var bar = el('span', { 'class': 'sbar' }); bar.style.width = (s.private_fund_gross_assets / mx * 100) + '%';
      var val = el('span', { 'class': 'sval' }, bnOf(s.private_fund_gross_assets));
      bar.appendChild(val); plot.appendChild(bar); li.appendChild(plot); ul.appendChild(li);
    });
    var tb = document.querySelector('#sp-table tbody'); tb.textContent = '';
    sp.forEach(function (s) {
      var tr = el('tr');
      tr.appendChild(el('td', { 'class': 'num rk' }, String(s.rank)));
      var c = el('td', { 'class': 'co' });
      var row = el('span', { 'class': 'sp-name' }); row.appendChild(badge(s.name)); row.appendChild(el('b', null, s.name)); c.appendChild(row);
      var dt = el('details', { 'class': 'sp-note' }); dt.appendChild(el('summary', null, 'Which advisers are counted')); dt.appendChild(el('p', null, s.note)); c.appendChild(dt);
      tr.appendChild(c);
      tr.appendChild(el('td', { 'class': 'num' }, bn1(s.private_fund_gross_assets)));
      tr.appendChild(el('td', { 'class': 'num' }, bn1(s.raum)));
      tr.appendChild(el('td', { 'class': 'num' }, nf0.format(s.private_fund_count)));
      tr.appendChild(el('td', { 'class': 'num' }, nf0.format(s.advisers)));
      tb.appendChild(tr);
    });
  }

  /* ---------- Form D ---------- */
  function colChart(host, rows, opts) {
    var W = Math.round(host.clientWidth); if (W < 200) return;
    var narrow = W < 420, H = opts.sub ? 250 : 230, m = { l: 8, r: 8, t: 26, b: opts.sub ? 52 : 34 }, fs = narrow ? 10 : 11.5;
    var n = rows.length, pw = W - m.l - m.r, ph = H - m.t - m.b, step = pw / n, bw = Math.min(40, step * 0.62);
    var mx = Math.max.apply(null, rows.map(function (r) { return r.v; })) * 1.0;
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': opts.aria });
    svg.appendChild(sv('line', { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph, stroke: 'var(--ink-2)' }));
    rows.forEach(function (r, i) {
      var h = r.v / mx * ph, x = m.l + i * step + (step - bw) / 2;
      svg.appendChild(sv('rect', { x: x, y: m.t + ph - h, width: bw, height: h, fill: opts.color, 'fill-opacity': i === n - 1 ? 1 : .88 }));
      svg.appendChild(sv('text', { x: x + bw / 2, y: m.t + ph - h - 6, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700, fill: 'var(--ink)' }, r.lab));
      svg.appendChild(sv('text', { x: x + bw / 2, y: m.t + ph + 16, 'text-anchor': 'middle', 'font-size': fs, fill: 'var(--ink-2)' }, qLab(r.q)));
      if (r.sub) svg.appendChild(sv('text', { x: x + bw / 2, y: m.t + ph + 31, 'text-anchor': 'middle', 'font-size': fs - 1.5, fill: 'var(--ink-2)' }, r.sub));
    });
    host.textContent = ''; host.appendChild(svg);
  }
  function spark(rows, label) {
    var W = 120, H = 30, p = 5, vs = rows.map(function (r) { return r.new; }), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs), rg = mx - mn || 1;
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true', focusable: 'false' });
    var pts = vs.map(function (v, i) { return (p + i / (vs.length - 1) * (W - 2 * p)).toFixed(1) + ',' + (H - p - (v - mn) / rg * (H - 2 * p)).toFixed(1); });
    svg.appendChild(sv('polyline', { points: pts.join(' '), fill: 'none', stroke: GREY, 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    var l = pts[pts.length - 1].split(',');
    svg.appendChild(sv('circle', { cx: l[0], cy: l[1], r: 3, fill: GREY, stroke: 'var(--bone)', 'stroke-width': 1.5 }));
    return svg;
  }
  function renderFormD() {
    var fr = D.fundraising, last = fr[fr.length - 1], prev = fr[fr.length - 2];
    var ch = prev ? (last.new_notices - prev.new_notices) / prev.new_notices : 0;
    var rel = Math.abs(ch) < 0.05 ? 'about as many as' : (ch > 0 ? 'up from' : 'down from');
    $('fd-title').textContent = nf0.format(last.new_notices) + ' new PE-fund notices in ' + last.quarter + ', ' + rel + ' ' + nf0.format(prev.new_notices) + ' in ' + prev.quarter + '.';
    var host = $('fd-panels'); host.textContent = '';
    function panel(title, cls) { var f = el('figure', { 'class': 'curve fdp' }); f.appendChild(el('figcaption', null, title)); var w = el('div', { 'class': 'curve-plot' }); f.appendChild(w); host.appendChild(f); return { f: f, w: w }; }
    var A = panel('New PE-fund notices per quarter'), B = panel('Amount sold in new notices, USD bn');
    var drawA = function () { colChart(A.w, fr.map(function (r) { return { q: r.quarter, v: r.new_notices, lab: nf0.format(r.new_notices) }; }), { color: INK, aria: 'New PE-fund notices per quarter: ' + fr.map(function (r) { return qLab(r.quarter) + ' ' + nf0.format(r.new_notices); }).join(', ') + '.' }); };
    var drawB = function () { colChart(B.w, fr.map(function (r) { return { q: r.quarter, v: r.amount_sold_new, lab: bn1(r.amount_sold_new).replace('bn', ''), sub: nf0.format(r.indefinite_new) + ' indef.' }; }), { color: CASH, sub: true, aria: 'Amount sold in new PE-fund notices, USD bn, per quarter: ' + fr.map(function (r) { return qLab(r.quarter) + ' ' + bn1(r.amount_sold_new); }).join(', ') + '.' }); };
    [[A.w, drawA], [B.w, drawB]].forEach(function (p) { if (window.ResizeObserver) new ResizeObserver(p[1]).observe(p[0]); else p[1](); });
    var note = el('p', { 'class': 'offchart' }, 'Small text under each quarter on the right: offerings of indefinite size, counted separately because they have no amount.');
    B.f.appendChild(note);
    var ctx = el('ul', { 'class': 'ctx' });
    ctx.appendChild(el('li', { 'class': 'ctx-h' }, 'For comparison: new notices per quarter'));
    ['Venture Capital Fund', 'Hedge Fund'].forEach(function (k) {
      var rows = D.fundraising_types[k]; if (!rows || rows.length < 2) return;
      var li = el('li'); li.appendChild(el('span', { 'class': 'cl' }, k)); li.appendChild(spark(rows, k));
      li.appendChild(el('span', { 'class': 'cv' }, nf0.format(rows[0].new) + ' (' + qLab(rows[0].quarter) + ') → ' + nf0.format(rows[rows.length - 1].new) + ' (' + qLab(rows[rows.length - 1].quarter) + ')'));
      ctx.appendChild(li);
    });
    A.f.appendChild(ctx);
    $('fd-missing').textContent = (D.formd_unavailable || []).length ? D.formd_unavailable.join(', ') + ': not yet published by the SEC.' : '';
    $('fd-unit').textContent = 'Form D notices by quarter of filing, ' + D.formd_quarters[0] + '–' + D.formd_quarters[D.formd_quarters.length - 1] + '. "About as many" means within 5%.';
  }

  /* ---------- notes ---------- */
  function renderNotes() {
    var ul = $('dnotes'); ul.textContent = '';
    D.notes.forEach(function (n) { ul.appendChild(el('li', null, n)); });
    $('prov').textContent = 'Refreshed ' + D.built + ' from SEC EDGAR (full-text search, Form ADV roster ' + dateLong(D.roster_date) + ', Form D data sets ' +
      D.formd_quarters[0] + '–' + D.formd_quarters[D.formd_quarters.length - 1] + ').';
  }
})();
