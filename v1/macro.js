(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var D, MK = null, DL = null, byId = {};
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) document.documentElement.classList.add('js');
  var MINUS = '−', UP = '▲', DOWN = '▼';

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
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateLong(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3 || !/^\d+$/.test(p[2])) return iso;
    return +p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0];
  }
  function period(p) {
    p = String(p);
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return dateLong(p);
    if (/^\d{4}-\d{2}$/.test(p)) return MON[+p.slice(5) - 1] + ' ' + p.slice(0, 4);
    if (/^\d{4}-Q\d$/.test(p)) return p.slice(5) + ' ' + p.slice(0, 4);
    return p;
  }
  function signed(v, dec, unit) {
    var r = nfd(dec, dec).format(Math.abs(v));
    var zero = +r === 0;
    return (zero ? '' : (v > 0 ? '+' : MINUS)) + r + (unit || '');
  }
  function fmtVal(s) {
    var v = s.latest.value, a = Math.abs(v);
    if (s.kind === 'rate' || s.kind === 'pct') return nfd(2, 2).format(v) + '%';
    if (s.kind === 'stress') return nfd(3, 3).format(v);
    if (s.kind === 'points') return nfd(1, 1).format(v);
    if (a < 10) return nfd(4, 4).format(v);
    if (a < 1000) return nfd(1, 1).format(v);
    return nfd(0, 0).format(v);
  }
  function fmtChange(c) {
    if (!c) return null;
    var u = c.unit, v = c.value;
    if (u === 'pp') return signed(v, 2, ' pp');
    // Unit '%' changes are fractions in macro_room.json (0.0374 = +3.7%), like ratios in markets.json.
    if (u === '%') return signed(v * 100, Math.abs(v * 100) < 0.1 ? 2 : 1, '%');
    if (u === 'points') return signed(v, 1, ' pts');
    if (u === 'index') return signed(v, 3, '');
    return signed(v, 2, ' ' + u);
  }
  // pill: arrow = real direction; colour = financing meaning (only when financing_sign is set)
  function pill(c, sign, withWord) {
    var txt = fmtChange(c);
    var v = c.value, mm = txt.match(/[\d.,]+/), zero = !!mm && parseFloat(mm[0].replace(/,/g, '')) === 0;
    var cls = 'flat', word = '';
    // Materiality: a rate move under 5 basis points (0.05 pp) is noise, shown as "little changed" in neutral.
    var minor = c.unit === 'pp' && Math.abs(v) < 0.05;
    if (!zero && minor && sign === 'lower_is_easier') { word = 'little changed'; }
    else if (!zero && sign === 'lower_is_easier') { cls = v < 0 ? 'up' : 'down'; word = v < 0 ? 'easier' : 'harder'; }
    var p = el('span', { 'class': 'chg ' + cls });
    p.appendChild(el('span', { 'class': 'ar', 'aria-hidden': 'true' }, zero ? '' : (v > 0 ? UP : DOWN)));
    p.appendChild(document.createTextNode(txt + (withWord && word ? ' · ' + word : '')));
    if (word) p.title = 'Financing: ' + word;
    if (word && !withWord) p.appendChild(el('span', { 'class': 'sr-only' }, ' (' + word + ' financing)'));
    return p;
  }

  function load(url, optional) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) { if (optional) return null; throw new Error(url + ' ' + r.status); }
      return r.json();
    }).catch(function (e) { if (optional) return null; throw e; });
  }
  Promise.all([load('../data/macro_room.json', false), load('../data/markets.json', true), load('../data/deals_room.json', true)]).then(function (res) {
    D = res[0]; MK = res[1]; DL = res[2];
    D.series.forEach(function (s) { byId[s.id] = s; });
    build();
  }).catch(function (e) {
    var er = $('error'); er.hidden = false;
    er.textContent = 'Could not load data/macro_room.json (' + e.message + '). Serve this folder over HTTP, for example: python -m http.server 5230';
  });

  function build() {
    document.documentElement.setAttribute('data-ready', '1');
    renderRail(); renderHero(); renderCurves(); renderGroups(); renderSources();
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
  function renderRail() {
    var ul = $('rail'); ul.textContent = '';
    ['Markets', 'Macro', 'Deals', 'Company'].forEach(function (room) {
      var li = el('li'), name = el('span', { 'class': 'room' }, room), meta = el('span', { 'class': 'meta' });
      if (room === 'Markets') meta.textContent = MK ? MK.counts.ranked + ' ranked · ' + dateLong(MK.as_of) : 'open the room';
      else if (room === 'Macro') meta.textContent = D.export.series + ' series · ' + D.built;
      else if (room === 'Deals') meta.textContent = DL ? DL.filings_total + ' filings \u00b7 ' + DL.sponsors.filter(function (x) { return x.rank != null; }).length + ' sponsors' : 'open the room';
      else { meta.textContent = 'open the room'; fetch('../data/company_room.json').then(function (r) { return r.json(); }).then(function (j) { meta.textContent = j.companies.length + ' companies · DCF'; }).catch(function () {}); }
      if (true) {
        var a = el('a', { href: room === 'Markets' ? 'index.html' : (room === 'Macro' ? 'macro.html' : (room === 'Deals' ? 'deals.html' : 'company.html')), 'class': 'rail-link' });
        if (room === 'Macro') { a.setAttribute('aria-current', 'page'); li.setAttribute('aria-current', 'page'); }
        a.appendChild(name); a.appendChild(meta); li.appendChild(a);
      } else {
        li.className = 'soon'; li.setAttribute('aria-disabled', 'true'); li.appendChild(name); li.appendChild(meta);
      }
      ul.appendChild(li);
    });
  }

  /* ---------- hero ---------- */
  function renderHero() {
    var h = D.headline;
    $('finding').textContent = h.text;
    var ds = byId[h.detail.series];
    if (ds) {
      $('finding-detail').textContent = ds.label + ': ' + nfd(0, 2).format(h.detail.latest.value) + '% in ' + period(h.detail.latest.period) + ', ' +
        signed(h.detail.change_1y_pp, 1, ' pp') + ' vs a year earlier (' + period(h.detail.from) + ').';
    }
    var box = $('figures'); box.textContent = '';
    D.key_figures.forEach(function (id) {
      var s = byId[id]; if (!s) return;
      var f = el('div', { 'class': 'fig' });
      f.appendChild(el('span', { 'class': 'l' }, s.label));
      f.appendChild(el('span', { 'class': 'v' }, fmtVal(s)));
      f.appendChild(el('span', { 'class': 'sub' }, period(s.latest.period)));
      if (s.change_1y) {
        var row = el('span', { 'class': 'pillrow' });
        row.appendChild(pill(s.change_1y, s.financing_sign, true));
        row.appendChild(el('span', { 'class': 'sub' }, 'vs 1 year earlier'));
        f.appendChild(row);
      }
      box.appendChild(f);
    });
    $('fig-legend').textContent = 'Green = easier deal financing, red = harder. Arrows show direction; rate moves under 0.05 pp count as little changed.';
  }

  /* ---------- curves ---------- */
  function mat(id) { var m = /_(\d+[my])$/.exec(id); return m ? m[1] : id; }
  function renderCurves() {
    var sp = D.spreads || [];
    function who(s) { return s.inputs && /^us_/.test(s.inputs[0]) ? 'US 10y ' + MINUS + ' 2y' : 'euro AAA'; }
    function state(v) { return v < 0 ? 'inverted' : 'upward'; }
    var title = '';
    if (sp.length === 2) {
      var vals = sp.map(function (s) { return who(s) + ' = ' + signed(s.value, 2, ' pp'); }).join(', ');
      if (state(sp[0].value) === state(sp[1].value))
        title = 'Both curves ' + (sp[0].value < 0 ? 'are inverted' : 'slope upward') + ': ' + vals + '.';
      else title = sp.map(function (s) { return who(s) + ' is ' + state(s.value); }).join(', ') + ': ' + vals + '.';
    } else title = sp.map(function (s) { return who(s) + ' = ' + signed(s.value, 2, ' pp') + (s.value < 0 ? ' (inverted)' : ''); }).join(', ') + '.';
    $('curve-title').textContent = title;
    var host = $('curves'); host.textContent = '';
    var defs = [['US Treasury', ['us_treasury_3m', 'us_treasury_2y', 'us_treasury_10y']], ['Euro-area AAA', ['ea_aaa_yield_2y', 'ea_aaa_yield_10y']]];
    defs.forEach(function (d, i) {
      var fig = el('figure', { 'class': 'curve' });
      fig.appendChild(el('figcaption', null, d[0]));
      var wrap = el('div', { 'class': 'curve-plot' });
      fig.appendChild(wrap); host.appendChild(fig);
      var ser = d[1].map(function (id) { return byId[id]; }).filter(Boolean);
      if (ser.length < 2) { wrap.textContent = 'Not enough data.'; return; }
      var draw = function () { drawCurve(wrap, d[0], ser); };
      if (window.ResizeObserver) new ResizeObserver(draw).observe(wrap); else { draw(); window.addEventListener('resize', draw); }
    });
    var per = sp.map(function (s) { return who(s) + ' as of ' + period(s.period); }).join('; ');
    $('curve-unit').textContent = 'Yield, % a year. One year ago = latest value minus its 1-year change. ' + per + '.';
  }
  function niceStep(range) {
    var steps = [0.1, 0.25, 0.5, 1, 2];
    for (var i = 0; i < steps.length; i++) if (range / steps[i] <= 6) return steps[i];
    return 2;
  }
  function drawCurve(wrap, name, ser) {
    var W = Math.round(wrap.clientWidth); if (W < 220) return;
    var narrow = W < 400, H = narrow ? 250 : 270;
    var m = { l: 44, r: narrow ? 84 : 96, t: 20, b: 32 }, fs = narrow ? 11 : 12;
    var today = ser.map(function (s) { return s.latest.value; });
    var ago = ser.map(function (s) { return s.latest.value - s.change_1y.value; });
    var all = today.concat(ago), mn = Math.min.apply(null, all), mx = Math.max.apply(null, all);
    var step = niceStep(mx - mn + 0.6);
    var y0 = Math.floor((mn - 0.25) / step) * step, y1 = Math.ceil((mx + 0.25) / step) * step;
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    function px(i) { return m.l + (i + 0.5) / ser.length * pw; }
    function py(v) { return m.t + (1 - (v - y0) / (y1 - y0)) * ph; }
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });
    var desc = name + ' yields. ' + ser.map(function (s, i) { return mat(s.id) + ': ' + nfd(2, 2).format(today[i]) + '% today, ' + nfd(2, 2).format(ago[i]) + '% a year ago'; }).join('; ') + '.';
    svg.setAttribute('aria-label', desc);
    var nd = nfd(0, 2);
    for (var t = y0; t <= y1 + 1e-9; t += step) {
      svg.appendChild(sv('line', { x1: m.l, x2: m.l + pw, y1: py(t), y2: py(t), stroke: 'var(--grey)', 'stroke-opacity': .55 }));
      svg.appendChild(sv('text', { x: m.l - 8, y: py(t) + 4, 'text-anchor': 'end', 'font-size': fs, fill: 'var(--ink-2)' }, nd.format(+t.toFixed(2)) + '%'));
    }
    svg.appendChild(sv('line', { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph, stroke: 'var(--ink-2)' }));
    ser.forEach(function (s, i) { svg.appendChild(sv('text', { x: px(i), y: H - 8, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 600, fill: 'var(--ink-2)' }, mat(s.id))); });
    function line(vals, col, w, dash) {
      svg.appendChild(sv('polyline', { points: vals.map(function (v, i) { return px(i) + ',' + py(v); }).join(' '), fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-dasharray': dash || '' }));
    }
    line(ago, '#a89a82', 2, '5 4');
    line(today, 'var(--ink)', 2.5);
    function pts(vals, fill, r) { vals.forEach(function (v, i) { svg.appendChild(sv('circle', { cx: px(i), cy: py(v), r: r, fill: fill, stroke: 'var(--bone)', 'stroke-width': 2 })); }); }
    pts(ago, '#a89a82', 4.5); pts(today, 'var(--accent)', 5.5);
    function lab(i, v, above, col, wgt) {
      svg.appendChild(sv('text', { x: px(i), y: py(v) + (above ? -11 : 19), 'text-anchor': 'middle', 'font-size': fs, 'font-weight': wgt, fill: col, 'paint-order': 'stroke', stroke: 'var(--bone)', 'stroke-width': 3, 'stroke-linejoin': 'round' }, nfd(2, 2).format(v) + '%'));
    }
    ser.forEach(function (s, i) {
      var tAbove = today[i] >= ago[i];
      lab(i, today[i], tAbove, 'var(--ink)', 700); lab(i, ago[i], !tAbove, 'var(--ink-2)', 500);
    });
    var li = ser.length - 1, ex = px(li) + 24;
    var ty = py(today[li]), ay = py(ago[li]);
    if (Math.abs(ty - ay) < 15) { if (ty <= ay) { ty -= 7; ay += 7; } else { ty += 7; ay -= 7; } }
    svg.appendChild(sv('text', { x: ex, y: ty + 4, 'font-size': fs, 'font-weight': 700, fill: 'var(--ink)' }, 'Today'));
    svg.appendChild(sv('text', { x: ex, y: ay + 4, 'font-size': fs, 'font-weight': 500, fill: 'var(--ink-2)' }, '1 year ago'));
    wrap.textContent = ''; wrap.appendChild(svg);
  }

  /* ---------- groups ---------- */
  function spark(s) {
    var pts = s.spark || [], W = 112, H = 30, p = 5;
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true', focusable: 'false' });
    if (pts.length < 2) return svg;
    var vs = pts.map(function (q) { return q.value; }), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs), rg = mx - mn || 1;
    function X(i) { return p + i / (pts.length - 1) * (W - 2 * p); }
    function Y(v) { return H - p - (v - mn) / rg * (H - 2 * p); }
    svg.appendChild(sv('polyline', { points: vs.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' '), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: .8 }));
    var li = pts.length - 1;
    svg.appendChild(sv('circle', { cx: X(li), cy: Y(vs[li]), r: 3.2, fill: 'var(--accent)', stroke: 'var(--bone)', 'stroke-width': 1.5 }));
    return svg;
  }
  function headWords(g) {
    var w = g.split(' '), last = w.pop(), h = el('h2', { 'class': 'gh' });
    if (w.length) { h.appendChild(el('span', { 'class': 'cap' }, w.join(' ').toUpperCase())); h.appendChild(document.createTextNode(' ')); h.appendChild(el('span', { 'class': 'serif' }, last)); }
    else h.appendChild(el('span', { 'class': 'cap' }, last.toUpperCase()));
    return h;
  }
  function renderGroups() {
    var host = $('groups'); host.textContent = '';
    D.groups.forEach(function (g, gi) {
      var rows = D.series.filter(function (s) { return s.group === g; });
      if (!rows.length) return;
      var sec = el('section', { 'class': 'block grp', 'aria-labelledby': 'g' + gi });
      var hd = el('div', { 'data-reveal': '' });
      var h = headWords(g); h.id = 'g' + gi; hd.appendChild(h); sec.appendChild(hd);
      var cols = el('div', { 'class': 'rcols', 'aria-hidden': 'true' });
      ['Series', 'Latest', 'Short change', '1-year change', '2 years'].forEach(function (t) { cols.appendChild(el('span', null, t)); });
      sec.appendChild(cols);
      var ul = el('ul', { 'class': 'rows' });
      rows.forEach(function (s) {
        var li = el('li', { 'class': 'row', tabindex: '0' });
        var cid = 'cr-' + s.id;
        li.setAttribute('aria-describedby', cid);
        var lab = el('div', { 'class': 'r-lab' }); lab.appendChild(el('b', null, s.label)); li.appendChild(lab);
        var val = el('div', { 'class': 'r-val' });
        val.appendChild(el('span', { 'class': 'rv' }, fmtVal(s)));
        val.appendChild(el('span', { 'class': 'rp' }, period(s.latest.period)));
        li.appendChild(val);
        var cs = el('div', { 'class': 'r-cs' });
        if (s.change_short) { cs.appendChild(pill(s.change_short, s.financing_sign, false)); cs.appendChild(el('span', { 'class': 'rp' }, s.change_short.label)); }
        li.appendChild(cs);
        var c1 = el('div', { 'class': 'r-c1' });
        if (s.change_1y) { c1.appendChild(pill(s.change_1y, s.financing_sign, false)); c1.appendChild(el('span', { 'class': 'rp' }, 'vs 1 year earlier')); }
        li.appendChild(c1);
        var sp = el('div', { 'class': 'r-sp' }); sp.appendChild(spark(s)); li.appendChild(sp);
        var tip = el('div', { 'class': 'r-tip', id: cid, role: 'tooltip' });
        tip.appendChild(el('b', null, s.title)); tip.appendChild(el('span', null, s.credit));
        li.appendChild(tip);
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      host.appendChild(sec);
    });
  }

  /* ---------- sources ---------- */
  function renderSources() {
    var ul = $('credits'); ul.textContent = '';
    D.series.forEach(function (s) {
      var li = el('li'); li.appendChild(el('b', null, s.label)); li.appendChild(el('span', null, s.credit)); ul.appendChild(li);
    });
    var nl = $('mnotes'); nl.textContent = '';
    (D.notes || []).forEach(function (n) { nl.appendChild(el('li', null, n)); });
    $('prov').textContent = 'Refreshed ' + D.built + ' from the hub’s cleared export (' + D.export.series + ' series; restricted benchmarks excluded: Euribor, SARON).';
  }
})();
