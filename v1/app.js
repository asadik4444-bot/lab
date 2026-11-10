(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var M, MAC = null, DEALS = null;
  var state = { pts: [], active: -1, geom: null };
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) document.documentElement.classList.add('js');

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
  var nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function dateLong(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3 || !/^\d+$/.test(p[2])) return iso;
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])));
  }
  function usd(v) {
    var a = Math.abs(v);
    if (a >= 1e12) return '$' + (v / 1e12).toLocaleString('en-GB', { maximumFractionDigits: a >= 1e14 ? 0 : 1 }) + 'tn';
    if (a >= 1e9) return '$' + (v / 1e9).toLocaleString('en-GB', { maximumFractionDigits: a >= 1e11 ? 0 : 1 }) + 'bn';
    if (a >= 1e6) return '$' + (v / 1e6).toLocaleString('en-GB', { maximumFractionDigits: 0 }) + 'm';
    return '$' + nf0.format(v);
  }
  function bn1(v) { return (v < 0 ? '\u2212' : '') + '$' + nf1.format(Math.abs(v) / 1e9) + 'bn'; }
  function pct(v, sign) { return (v < 0 ? '\u2212' : (sign && v > 0 ? '+' : '')) + nf1.format(Math.abs(v) * 100) + '%'; }
  function tickLabel(e) {
    var v = Math.pow(10, e);
    if (e >= 12) return '$' + nf0.format(v / 1e12) + 'tn';
    if (e >= 9) return '$' + nf0.format(v / 1e9) + 'bn';
    return '$' + nf0.format(v / 1e6) + 'm';
  }
  function ratioTxt(r) { return r >= 100 ? nf0.format(r) + '×' : nf1.format(r) + '×'; }
  function human(s) { return String(s).replace(/_/g, ' '); }
  function secUrl(u) { return /^https:\/\/www\.sec\.gov\//.test(String(u || '')) ? u : null; }

  var UP = '▲', DOWN = '▼', MINUS = '−';
  // Direction follows the value as displayed (one decimal of a percent): +0.003% shows as a flat 0.0%, not ▲.
  function dir(v) { var r = Math.round(v * 1000); return r > 0 ? 1 : (r < 0 ? -1 : 0); }
  function sgn(v, dec) { // signed percent from a fraction, with true minus
    var d = dir(v), t = nf1.format(d === 0 ? 0 : Math.abs(v) * 100) + '%';
    return d > 0 ? '+' + t : (d < 0 ? MINUS + t : t);
  }
  function chg(v, label) {
    var d = dir(v);
    var c = el('span', { 'class': 'chg ' + (d > 0 ? 'up' : (d < 0 ? 'down' : 'flat')) });
    c.appendChild(el('span', { 'class': 'ar', 'aria-hidden': 'true' }, d > 0 ? UP : (d < 0 ? DOWN : '')));
    c.appendChild(document.createTextNode(sgn(v)));
    c.title = (label || 'Change') + ': ' + (d > 0 ? 'up' : (d < 0 ? 'down' : 'unchanged'));
    return c;
  }
  function sgEl(v, plus) {
    var d = dir(v);
    var c = el('span', { 'class': 'sg ' + (d > 0 ? 'up' : (d < 0 ? 'down' : 'flat')) });
    if (d !== 0) c.appendChild(el('span', { 'class': 'ar', 'aria-hidden': 'true' }, d > 0 ? UP : DOWN));
    c.appendChild(document.createTextNode(plus ? sgn(v) : (v < 0 ? MINUS + nf1.format(Math.abs(v) * 100) + '%' : pct(v))));
    return c;
  }
  function mono(r) { var t = String(r.ticker).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4); return t || '?'; }
  function logoBadge(r, size, brand) {
    var b = el('span', { 'class': 'lg' + (size > 30 ? ' big' : ''), 'aria-hidden': 'true' });
    if (r.logo) {
      var i = el('i');
      var u = 'url("' + r.logo + '")';
      i.style.webkitMaskImage = u; i.style.maskImage = u;
      if (brand && r.brand_hex && /^[0-9a-fA-F]{6}$/.test(r.brand_hex)) i.style.background = '#' + r.brand_hex;
      b.appendChild(i);
    } else {
      var m = mono(r); b.appendChild(el('b', { 'class': 'mono l' + m.length }, m));
    }
    return b;
  }
  function load(url, optional) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) { if (optional) return null; throw new Error(url + ' ' + r.status); }
      return r.json();
    }).catch(function (e) { if (optional) return null; throw e; });
  }
  var BASE = document.documentElement.getAttribute('data-base') || '';
  Promise.all([load(BASE + '../data/markets.json', false), Promise.resolve(null)]).then(function (res) {
    M = res[0]; MAC = res[1];
    build();
  }).catch(function (e) {
    var er = $('error'); er.hidden = false;
    er.textContent = 'Could not load data/markets.json (' + e.message + '). Serve this folder over HTTP, for example: python -m http.server 5230';
  });

  function build() {
    document.documentElement.setAttribute('data-ready', '1');
    renderRail(); renderHero(); renderLeaders(); renderProv(); setupSort(); renderTable(); renderExcluded(); setupChart(); renderGrowth();
    setupChrome(); setupReveal(); setupDrill();
  }

  /* ---------- chrome: menu, topbar colour ---------- */
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

  /* ---------- reveal + count-up ---------- */
  function setupReveal() {
    var items = [].slice.call(document.querySelectorAll('[data-reveal]'));
    var counts = [].slice.call(document.querySelectorAll('[data-count]'));
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (i) { i.classList.add('in'); }); return;
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    items.forEach(function (i) { io.observe(i); });
    var io2 = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io2.unobserve(e.target);
        var to = +e.target.getAttribute('data-count'), t0 = performance.now();
        (function step(now) {
          var k = Math.min(1, (now - t0) / 900), v = 1 - Math.pow(1 - k, 3);
          e.target.textContent = nf0.format(Math.round(to * v));
          if (k < 1) requestAnimationFrame(step); else e.target.textContent = nf0.format(to);
        })(t0);
      });
    }, { threshold: 0.5 });
    counts.forEach(function (c) { io2.observe(c); });
  }

  /* ---------- rail ---------- */
  function renderRail() {
    var ul = $('rail'); ul.textContent = '';
    var macroRail = (MAC && MAC.rail) || [];
    var HREF = { Markets: 'index.html', Macro: 'macro.html', Deals: 'deals.html', Company: 'company.html' };
    ['Markets', 'Macro', 'Deals', 'Company'].forEach(function (room) {
      var li = el('li');
      var meta = el('span', { 'class': 'meta' });
      if (room === 'Markets') {
        meta.textContent = nf0.format(M.counts.ranked) + ' ranked \u00b7 ' + dateLong(M.as_of);
      } else {
        var hit = null;
        macroRail.forEach(function (r) { if (String(r.room).toLowerCase() === room.toLowerCase()) hit = r; });
        if (room === 'Deals' && DEALS) meta.textContent = nf0.format(DEALS.filings_total) + ' filings \u00b7 ' + DEALS.sponsors.filter(function (x) { return x.rank != null; }).length + ' sponsors';
        else if (hit) meta.textContent = nf0.format(hit.count) + ' ' + hit.unit + (hit.refreshed ? ' \u00b7 ' + dateLong(hit.refreshed) : '');
        else if (room === 'Company') { meta.textContent = 'open the room'; fetch(BASE + '../data/company_room.json').then(function (r) { return r.json(); }).then(function (j) { meta.textContent = j.companies.length + ' companies · DCF'; }).catch(function () {}); }
        else meta.textContent = HREF[room] ? 'open the room' : 'coming';
      }
      var name = el('span', { 'class': 'room' }, room);
      if (HREF[room]) {
        var a = el('a', { href: HREF[room], 'class': 'rail-link' });
        if (room === 'Markets') a.setAttribute('aria-current', 'page');
        a.appendChild(name); a.appendChild(meta); li.appendChild(a);
        if (room === 'Markets') li.setAttribute('aria-current', 'page');
      } else {
        li.className = 'soon'; li.setAttribute('aria-disabled', 'true');
        li.appendChild(name); li.appendChild(meta);
      }
      ul.appendChild(li);
    });
  }

  /* ---------- hero ---------- */
  function renderHero() {
    var c = M.counts, x = M.cross_check;
    $('finding').textContent = 'The ' + c.ranked + ' largest US companies by public float, and the ' +
      c.impossible_figures + ' filings we caught with impossible figures.';
    var box = $('figures'); box.textContent = '';
    function fig(v, l, cls, tip, sub, count) {
      var f = el('div', { 'class': 'fig ' + (cls || '') });
      f.appendChild(el('span', { 'class': 'l' }, l));
      var vv = el('span', { 'class': 'v' }, v);
      if (count != null) vv.setAttribute('data-count', count);
      f.appendChild(vv);
      if (sub) f.appendChild(el('span', { 'class': 'sub' }, sub));
      if (tip) {
        f.setAttribute('tabindex', '0');
        var id = 'ft-' + Math.random().toString(36).slice(2, 7);
        f.setAttribute('aria-describedby', id);
        f.appendChild(el('span', { 'class': 'ft', id: id, role: 'tooltip' }, tip));
      }
      box.appendChild(f);
    }
    fig(nf0.format(c.impossible_figures), 'filings excluded for impossible figures', 'big', null, null, c.impossible_figures);
    fig(nf0.format(c.ranked), 'companies ranked', '', null, null, c.ranked);
    fig(nf0.format(c.rows_with_badges), 'rows with a data-quality badge', '', null, null, c.rows_with_badges);
    fig(x.overlap + '/' + x.of, 'match ' + String(x.source).split(',')[0], '', x.source + ', checked ' + dateLong(x.checked), 'checked ' + x.checked);
  }

  function renderProv() {
    var fs = M.fundamentals_summary, t;
    if (fs) t = 'Refreshed ' + fs.built + ' from SEC EDGAR (company facts + submissions) · ' + nf0.format(fs.checks) +
      ' automated checks (' + nf0.format(fs.passed) + ' passed) · ' + nf0.format(fs.companies) + ' companies. Figures in USD, as reported. Definitions match the main site’s Company Monitor (25/25 values cross-checked).';
    else t = 'Company fundamentals not computed yet. Public float and total assets: ' + M.source + ', as of ' + dateLong(M.as_of) + '.';
    ['prov-table', 'prov-drill', 'prov-grow'].forEach(function (id) { var e = $(id); if (e) e.textContent = t; });
  }

  /* ---------- leaders strip ---------- */
  function renderLeaders() {
    var box = $('leaders'); box.textContent = '';
    var rows = M.rows.filter(function (r) { return r.fundamentals && !r.fundamentals.financial && !r.fundamentals.not_comparable; });
    function top(key) {
      var best = null;
      rows.forEach(function (r) { var v = r.fundamentals[key]; if (v != null && (best === null || v > best.fundamentals[key])) best = r; });
      return best;
    }
    var items = [['Highest revenue growth', 'growth_yoy', function (v) { return sgn(v); }],
      ['Highest operating margin', 'operating_margin', function (v) { return pct(v); }],
      ['Highest FCF margin', 'fcf_margin', function (v) { return pct(v); }]];
    var any = false;
    items.forEach(function (it) {
      var r = top(it[1]); if (!r) return; any = true;
      var li = el('li');
      li.appendChild(el('span', { 'class': 'lk' }, it[0]));
      var row = el('span', { 'class': 'lrow' });
      row.appendChild(logoBadge(r, 28)); row.appendChild(el('b', null, r.ticker)); row.appendChild(el('span', { 'class': 'lv' }, it[2](r.fundamentals[it[1]])));
      li.appendChild(row); box.appendChild(li);
    });
    box.hidden = !any;
  }

  /* ---------- growth chart ---------- */
  function renderGrowth() {
    var rows = M.rows.filter(function (r) { return r.fundamentals && r.fundamentals.growth_yoy != null; })
      .sort(function (a, b) { return b.fundamentals.growth_yoy - a.fundamentals.growth_yoy; });
    var n = rows.length, sec = $('grew');
    if (!n) { sec.hidden = true; return; }
    var up = rows.filter(function (r) { return dir(r.fundamentals.growth_yoy) > 0; }).length;
    var down = rows.filter(function (r) { return dir(r.fundamentals.growth_yoy) < 0; }).length;
    var flat = n - up - down;
    $('grow-title').textContent = up + ' of ' + n + ' companies grew revenue in their latest fiscal year; ' + down + ' shrank'
      + (flat ? '; ' + flat + (flat === 1 ? ' was' : ' were') + ' flat.' : '.');
    var abs = rows.map(function (r) { return Math.abs(r.fundamentals.growth_yoy) * 100; }).sort(function (a, b) { return a - b; });
    var pos = 0.95 * (abs.length - 1), lo = Math.floor(pos), p95 = abs[lo] + (abs[Math.min(abs.length - 1, lo + 1)] - abs[lo]) * (pos - lo);
    var step = [5, 10, 20, 25, 50, 100].filter(function (t) { return t >= p95 / 4; })[0] || 100;
    var cap = Math.ceil(p95 / step) * step;
    var worst = Math.max(0, -Math.min.apply(null, rows.map(function (r) { return r.fundamentals.growth_yoy * 100; })));
    var low = worst > 0 ? Math.min(cap, Math.ceil(worst / step) * step) : 0;   // negative extent of the axis
    var span = low + cap, zero = low / span * 100;                               // zero line position (%)
    var clipped = rows.filter(function (r) { var q = r.fundamentals.growth_yoy * 100; return q > cap || q < -low; });
    $('grow-unit').textContent = 'Revenue growth, latest fiscal year vs the year before (%). Fiscal years end on different dates.';
    $('grow-clip').textContent = clipped.length ? 'Bars beyond ' + cap + '% are clipped; labels show the true value.' : '';
    var wrap = $('grow-chart'); wrap.textContent = '';
    var lines = el('div', { 'class': 'glines', 'aria-hidden': 'true' });
    for (var t = -low; t <= cap; t += step) {
      var ln = el('span', { 'class': 'gl' + (t === 0 ? ' zero' : '') }); ln.style.left = ((t + low) / span * 100) + '%';
      ln.appendChild(el('em', null, (t > 0 ? '+' : (t < 0 ? MINUS : '')) + Math.abs(t) + '%')); lines.appendChild(ln);
    }
    wrap.appendChild(lines);
    var ul = el('ul', { 'class': 'grows', role: 'list', 'aria-label': 'Revenue growth by company, largest first' });
    var btns = [];
    rows.forEach(function (r, i) {
      var v = r.fundamentals.growth_yoy, p = v * 100, d = dir(v), isClip = p > cap || p < -low;
      var w = (p >= 0 ? Math.min(p, cap) : Math.min(-p, low)) / span * 100;
      var li = el('li');
      var b = el('button', { type: 'button', 'class': 'grow-row', tabindex: i === 0 ? '0' : '-1',
        'aria-label': r.name + ' (' + r.ticker + '): revenue growth ' + sgn(v) + (isClip ? ', bar clipped' : '') + '. Press Enter for details.' });
      var lab = el('span', { 'class': 'gl-lab' }); lab.appendChild(logoBadge(r, 28)); lab.appendChild(el('b', null, r.ticker)); b.appendChild(lab);
      var plot = el('span', { 'class': 'gl-plot' });
      var bar = el('span', { 'class': 'gbar ' + (d > 0 ? 'up' : (d < 0 ? 'down' : 'flat')) + (isClip ? ' clip' : '') });
      bar.style.width = w + '%'; if (p >= 0) bar.style.left = zero + '%'; else bar.style.right = (100 - zero) + '%';
      if (isClip) bar.appendChild(el('i', { 'class': 'brk' }, '\u27e9'));
      plot.appendChild(bar);
      var val = el('span', { 'class': 'gval ' + (d > 0 ? 'up' : (d < 0 ? 'down' : 'flat')) });
      val.appendChild(el('span', { 'class': 'ar', 'aria-hidden': 'true' }, d > 0 ? UP : (d < 0 ? DOWN : '')));
      val.appendChild(document.createTextNode(sgn(v) + (isClip ? ' \u2192' : '')));
      if (p >= 0) val.style.left = (zero + w) + '%'; else { val.style.left = (zero - w) + '%'; val.style.transform = 'translateX(-100%)'; }
      plot.appendChild(val); b.appendChild(plot);
      b.addEventListener('click', function () { var cb = document.querySelector('tr[data-rank="' + r.rank + '"] .co-btn'); if (cb) openDrill(r, cb); });
      function tip() {
        var f = r.fundamentals, tp = $('gtip'); tp.textContent = '';
        tp.appendChild(el('b', null, r.name + ' (' + r.ticker + ')'));
        var dl = el('dl');
        [['FY ends', dateLong(f.fy_end)], ['Revenue', f.revenue != null ? bn1(f.revenue) : '\u2014'], ['Prior year', f.revenue_prior != null ? bn1(f.revenue_prior) : '\u2014'], ['Growth', sgn(v)]]
          .forEach(function (x) { dl.appendChild(el('dt', null, x[0])); dl.appendChild(el('dd', null, x[1])); });
        tp.appendChild(dl); tp.hidden = false;
        var host = $('grow-chart');
        tp.style.top = Math.min(li.offsetTop + li.offsetHeight + 4, host.scrollHeight - tp.offsetHeight) + 'px';
        tp.style.left = Math.max(0, Math.min(host.clientWidth - tp.offsetWidth, 170)) + 'px';
      }
      b.addEventListener('mouseenter', tip); b.addEventListener('focus', tip);
      b.addEventListener('mouseleave', function () { if (document.activeElement !== b) $('gtip').hidden = true; });
      b.addEventListener('blur', function () { $('gtip').hidden = true; });
      b.addEventListener('keydown', function (e) {
        var k = e.key, j = btns.indexOf(b), nj = null;
        if (k === 'ArrowDown' || k === 'ArrowRight') nj = Math.min(btns.length - 1, j + 1);
        else if (k === 'ArrowUp' || k === 'ArrowLeft') nj = Math.max(0, j - 1);
        else if (k === 'Home') nj = 0; else if (k === 'End') nj = btns.length - 1;
        else if (k === 'Escape') $('gtip').hidden = true;
        if (nj != null) { e.preventDefault(); btns[j].tabIndex = -1; btns[nj].tabIndex = 0; btns[nj].focus(); }
      });
      btns.push(b); li.appendChild(b); ul.appendChild(li);
    });
    wrap.appendChild(ul);
    wrap.appendChild(el('div', { 'class': 'tip', id: 'gtip', role: 'presentation', hidden: '' }));
  }

  /* ---------- table ---------- */
  var sortKey = 'rank', sortDir = 1;
  var SORT = {
    rank: function (r) { return r.rank; },
    float: function (r) { return r.public_float; },
    revenue: function (r) { return r.fundamentals && r.fundamentals.revenue != null ? r.fundamentals.revenue : null; },
    growth: function (r) { return r.fundamentals && r.fundamentals.growth_yoy != null ? r.fundamentals.growth_yoy : null; },
    margin: function (r) { return r.fundamentals && r.fundamentals.operating_margin != null ? r.fundamentals.operating_margin : null; },
    fcf: function (r) { return r.fundamentals && r.fundamentals.fcf_margin != null ? r.fundamentals.fcf_margin : null; }
  };
  function setupSort() {
    [].forEach.call(document.querySelectorAll('th[data-sort] button'), function (b) {
      b.addEventListener('click', function () {
        var k = b.parentNode.getAttribute('data-sort');
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = (k === 'rank') ? 1 : -1; }
        renderTable();
        var nb = document.querySelector('th[data-sort="' + k + '"] button'); if (nb) nb.focus();
      });
    });
  }
  function sortedRows() {
    var f = SORT[sortKey], rows = M.rows.slice();
    rows.sort(function (a, b) {
      var x = f(a), y = f(b);
      if (x == null && y == null) return a.rank - b.rank;
      if (x == null) return 1; if (y == null) return -1;
      return (x - y) * sortDir || a.rank - b.rank;
    });
    return rows;
  }
  function dash(reason) {
    var s = el('span', { 'class': 'nil', title: reason }, '—');
    s.appendChild(el('span', { 'class': 'sr-only' }, ' (' + reason + ')'));
    return s;
  }
  function fcell(r, metric, fmt, cls) {
    var td = el('td', { 'class': 'num ' + (cls || '') }), f = r.fundamentals;
    if (!f) { td.appendChild(dash('Fundamentals not computed yet')); return td; }
    var v = f[metric];
    if (v == null) {
      if (f.not_comparable && (metric === 'operating_margin' || metric === 'fcf_margin')) {
        var nc = el('span', { 'class': 'nil', title: 'not comparable: ' + String(f.not_comparable).replace(/^not comparable:\s*/i, '') }, 'n/c');
        nc.appendChild(el('span', { 'class': 'sr-only' }, ' (not comparable: ' + String(f.not_comparable).replace(/^not comparable:\s*/i, '') + ')'));
        td.appendChild(nc);
      } else td.appendChild(dash((f.reasons && f.reasons[metric]) || 'not available'));
      return td;
    }
    if (metric === 'growth_yoy') { td.appendChild(chg(v, 'Revenue growth y/y')); return td; }
    if (metric === 'operating_margin' || metric === 'fcf_margin') {
      var neg = v < 0;
      var tx = el('span', { 'class': 'mv' + (neg ? ' neg' : '') });
      if (neg) tx.appendChild(el('span', { 'class': 'ar', 'aria-hidden': 'true' }, DOWN));
      tx.appendChild(document.createTextNode(neg ? MINUS + nf1.format(Math.abs(v) * 100) + '%' : fmt(v)));
      td.appendChild(tx);
      var bar = el('span', { 'class': 'mbar' + (neg ? ' neg' : ''), 'aria-hidden': 'true' });
      var fill = el('i'); fill.style.width = Math.min(100, Math.abs(v) * 100) + '%'; bar.appendChild(fill);
      td.appendChild(bar);
      return td;
    }
    td.textContent = fmt(v);
    return td;
  }
  function renderTable() {
    var tb = document.querySelector('#table tbody'); tb.textContent = '';
    [].forEach.call(document.querySelectorAll('th[data-sort]'), function (th) {
      th.setAttribute('aria-sort', th.getAttribute('data-sort') === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none');
    });
    sortedRows().forEach(function (r) {
      var tr = el('tr', { 'data-rank': r.rank });
      tr.appendChild(el('td', { 'class': 'num rk' }, String(r.rank)));
      var c = el('td', { 'class': 'co' });
      var btn = el('button', { type: 'button', 'class': 'co-btn', 'aria-expanded': 'false', 'aria-controls': 'drill' });
      btn.appendChild(logoBadge(r, 28));
      btn.appendChild(el('span', { 'class': 'nm' }, r.name));
      btn.appendChild(el('span', { 'class': 'chip' }, r.ticker));
      btn.addEventListener('click', function (e) { e.stopPropagation(); openDrill(r, btn); });
      c.appendChild(btn); tr.appendChild(c);
      var fl = el('td', { 'class': 'num' }, nf1.format(r.public_float / 1e9));
      fl.appendChild(el('span', { 'class': 'sub' }, r.float_end));
      tr.appendChild(fl);
      tr.appendChild(fcell(r, 'revenue', function (v) { return nf1.format(v / 1e9); }));
      tr.appendChild(fcell(r, 'growth_yoy', function (v) { return pct(v, true); }));
      tr.appendChild(fcell(r, 'operating_margin', function (v) { return pct(v); }));
      tr.appendChild(fcell(r, 'fcf_margin', function (v) { return pct(v); }));
      var b = el('td', { 'class': 'bd' });
      (r.badges || []).forEach(function (k) {
        var pb = el('button', { type: 'button', 'class': 'pill-b', 'aria-expanded': 'false' }, human(k));
        pb.addEventListener('click', function (e) { e.stopPropagation(); togglePop(pb, M.badges[k] || k); });
        b.appendChild(pb);
      });
      if (r.ticker_source === 'override') b.appendChild(el('span', { 'class': 'pill-b static' }, 'ticker added by hand: SEC lists none'));
      tr.appendChild(b);
      tr.addEventListener('click', function () { openDrill(r, btn); });
      tb.appendChild(tr);
    });
    if (state.openRank) { var cur = tb.querySelector('tr[data-rank="' + state.openRank + '"]'); if (cur) cur.classList.add('sel'); }
  }
  var popFor = null;
  function hidePop() {
    var p = $('pop'); p.hidden = true;
    if (popFor) popFor.setAttribute('aria-expanded', 'false');
    popFor = null;
  }
  function togglePop(btn, text) {
    if (popFor === btn) { hidePop(); return; }
    hidePop();
    var p = $('pop'); p.textContent = text; p.hidden = false;
    var r = btn.getBoundingClientRect();
    var left = Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - p.offsetWidth - 8);
    p.style.left = Math.max(8, left) + 'px';
    p.style.top = (r.bottom + window.scrollY + 6) + 'px';
    btn.setAttribute('aria-expanded', 'true'); popFor = btn;
  }
  document.addEventListener('click', function (e) { if (!e.target.closest('#pop')) hidePop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && popFor) { var b = popFor; hidePop(); b.focus(); } });

  function renderExcluded() {
    $('excl-title').textContent = M.excluded.length + ' filings we caught';
    var ul = $('excl'); ul.textContent = '';
    M.excluded.forEach(function (x) {
      var li = el('li');
      li.appendChild(el('span', { 'class': 'n' }, x.name));
      li.appendChild(el('span', { 'class': 'r' }, human(x.reason)));
      li.appendChild(el('span', { 'class': 'w' }, x.why));
      ul.appendChild(li);
    });
  }

  /* ---------- drill-down ---------- */
  var MET = { revenue: 'revenue', revenue_prior: 'prior revenue', growth_yoy: 'growth', operating_income: 'operating income', operating_margin: 'operating margin',
    cfo: 'operating cash flow', capex: 'capex', fcf: 'free cash flow', fcf_margin: 'FCF margin', capex_to_revenue: 'capex / revenue' };
  var FORM = { '10-K': 'Annual report (10-K)', '10-Q': 'Quarterly report (10-Q)', '8-K': 'Current report (8-K)', '20-F': 'Annual report (20-F)', '40-F': 'Annual report (40-F)' };
  var drillBtn = null;
  function setupDrill() {
    $('drill-close').addEventListener('click', closeDrill);
    $('drill').addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closeDrill(); } });
  }
  function closeDrill() {
    var d = $('drill'); d.hidden = true;
    if (drillBtn) { drillBtn.setAttribute('aria-expanded', 'false'); drillBtn.focus(); }
    state.openRank = null;
    [].forEach.call(document.querySelectorAll('#table tr.sel'), function (t) { t.classList.remove('sel'); });
    drillBtn = null;
  }
  function srcFor(f, keys) {
    for (var i = 0; i < keys.length; i++) { var s = f.sources && f.sources[keys[i]]; if (s && secUrl(s.url)) return s; }
    return null;
  }
  function kpi(label, value, src, big, note, why, tag) {
    var d = el('div', { 'class': big ? 'k big' : 'k' });
    d.appendChild(el('dt', null, label));
    var dd = el('dd', null, typeof value === 'string' ? value : null);
    if (typeof value !== 'string') dd.appendChild(value);
    if (note) dd.className = 'nc';
    if (tag) { var row = el('div', { 'class': 'dd-row' }); row.appendChild(dd); row.appendChild(tag); d.appendChild(row); } else d.appendChild(dd);
    if (why) d.appendChild(el('p', { 'class': 'why' }, why));
    if (src) {
      var a = el('a', { 'class': 'src', href: src.url, target: '_blank', rel: 'noopener noreferrer' }, 'source');
      a.setAttribute('aria-label', label + ': source filing ' + src.form + ', filed ' + src.filed);
      a.title = src.form + ', filed ' + dateLong(src.filed);
      d.appendChild(a);
    }
    return d;
  }
  function openDrill(r, btn) {
    hidePop();
    if (drillBtn && drillBtn !== btn) drillBtn.setAttribute('aria-expanded', 'false');
    drillBtn = btn; btn.setAttribute('aria-expanded', 'true');
    state.openRank = r.rank;
    [].forEach.call(document.querySelectorAll('#table tr.sel'), function (t) { t.classList.remove('sel'); });
    var tr = btn.closest('tr'); if (tr) tr.classList.add('sel');
    var f = r.fundamentals, d = $('drill');
    d.hidden = false;
    $('drill-name').textContent = r.name;
    var oc = $('drill-open'); if (!oc) { oc = el('a', { id: 'drill-open', 'class': 'drill-open' }); $('drill-fy').parentNode.appendChild(oc); }
    oc.href = 'company.html?c=' + encodeURIComponent(r.ticker); oc.textContent = 'Open in the Company room →';
    var dl0 = $('drill-logo'); dl0.textContent = ''; dl0.appendChild(logoBadge(r, 48, true));
    var fy = $('drill-fy'), kp = $('drill-kpis'), ch = $('drill-chart'), fl = $('drill-filings'), dq = $('drill-dq');
    kp.textContent = ''; ch.textContent = ''; fl.textContent = ''; dq.textContent = '';
    var bodyEl = d.querySelector('.drill-body');
    // data quality (always available)
    dq.appendChild(el('p', { 'class': 'mon-k' }, 'DATA QUALITY'));
    var dl = el('dl', { 'class': 'dqdl' });
    [['Public float', usd(r.public_float) + ' at ' + r.float_end],
     ['Share count', nf0.format(r.shares) + ' at ' + r.shares_end + ' (' + human(r.shares_basis) + ')'],
     ['Total assets', usd(r.assets) + ' at ' + r.assets_end]].forEach(function (p) {
      dl.appendChild(el('dt', null, p[0])); dl.appendChild(el('dd', null, p[1]));
    });
    dq.appendChild(dl);
    var bu = el('ul', { 'class': 'dqb' });
    (r.badges || []).forEach(function (k) { var li = el('li'); li.appendChild(el('b', null, human(k))); li.appendChild(document.createTextNode(': ' + (M.badges[k] || ''))); bu.appendChild(li); });
    if (r.ticker_source === 'override') { var l2 = el('li'); l2.appendChild(el('b', null, 'ticker added by hand')); l2.appendChild(document.createTextNode(': SEC lists none')); bu.appendChild(l2); }
    if (!bu.children.length) bu.appendChild(el('li', null, 'No data-quality badges on this row.'));
    dq.appendChild(bu);

    if (!f) {
      fy.textContent = r.ticker + ' · ' + 'ranked #' + r.rank;
      bodyEl.classList.add('empty');
      kp.appendChild(el('p', { 'class': 'empty-msg' }, 'Fundamentals not computed yet'));
    } else {
      bodyEl.classList.remove('empty');
      fy.textContent = 'FY' + f.fy + ' · year to ' + dateLong(f.fy_end);
      var nc = f.not_comparable ? 'Not comparable: financial company' : null;
      var dlk = el('dl');
      var rs = f.reasons || {};
      function tile(label, key, fmt, srcKeys, big, extra, tagv) {
        var v = f[key];
        if (v == null) return kpi(label, '—', null, big, false, rs[extra || key] || rs[key] || 'not available');
        return kpi(label, fmt(v), srcFor(f, srcKeys), big, false, null, tagv != null ? chg(tagv, 'Revenue growth y/y') : null);
      }
      dlk.appendChild(tile('Revenue', 'revenue', bn1, ['revenue'], true, null, f.growth_yoy));
      dlk.appendChild(tile('Growth y/y', 'growth_yoy', function (v) { return sgEl(v, true); }, ['growth_yoy', 'revenue']));
      if (nc) {
        ['Operating margin', 'Free cash flow', 'Capex / revenue'].forEach(function (l) { dlk.appendChild(kpi(l, nc, null, false, true)); });
      } else {
        dlk.appendChild(tile('Operating margin', 'operating_margin', function (v) { return v < 0 ? sgEl(v) : pct(v); }, ['operating_margin', 'operating_income']));
        dlk.appendChild(tile('Free cash flow', 'fcf', bn1, ['fcf', 'cfo']));
        dlk.appendChild(tile('Capex / revenue', 'capex_to_revenue', function (v) { return pct(v); }, ['capex_to_revenue', 'capex']));
      }
      kp.appendChild(dlk);
      drawDrillChart(ch, r, f, !!nc);
      // filings
      fl.appendChild(el('p', { 'class': 'mon-k' }, 'SOURCE FILINGS'));
      var ul = el('ul'), seen = {};
      Object.keys(f.sources || {}).forEach(function (m) {
        var s = f.sources[m]; if (!s || !secUrl(s.url)) return;
        var key = s.accession || s.url;
        if (!seen[key]) { seen[key] = { s: s, m: [] }; }
        seen[key].m.push(MET[m] || human(m));
      });
      var keys = Object.keys(seen);
      keys.forEach(function (k) {
        var o = seen[k], li = el('li');
        li.appendChild(el('span', { 'class': 'form' }, o.s.form));
        var a = el('a', { href: o.s.url, target: '_blank', rel: 'noopener noreferrer' }, FORM[o.s.form] || o.s.form);
        li.appendChild(a);
        li.appendChild(el('time', null, 'Filed ' + dateLong(o.s.filed) + ' · ' + o.m.filter(function (x, i, arr) { return arr.indexOf(x) === i; }).join(', ')));
        ul.appendChild(li);
      });
      if (!keys.length) ul.appendChild(el('li', null, 'No filing links available.'));
      fl.appendChild(ul);
    }
    d.hidden = false;
    $('drill-live').textContent = f ? r.name + ': FY' + f.fy + ' revenue ' + (f.revenue != null ? bn1(f.revenue) : 'not available') + '.' : r.name + ': fundamentals not computed yet.';
    d.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    $('drill-name').focus({ preventScroll: true });
  }

  function drawDrillChart(host, r, f, finOnly) {
    var years = [], notes = [];
    var hasPrior = f.prior && f.prior.revenue != null;
    if (hasPrior) years.push({ fy: f.fy - 1, rev: f.prior.revenue, oi: f.prior.operating_income, fcf: f.prior.fcf });
    else notes.push('Prior year not available' + ((f.reasons && f.reasons.revenue_prior) ? ' (' + f.reasons.revenue_prior + ')' : '') + ', so only the current year is shown.');
    years.push({ fy: f.fy, rev: f.revenue, oi: f.operating_income, fcf: f.fcf });
    years = years.filter(function (y) { return y.rev != null; });
    if (!years.length) {
      host.appendChild(el('p', { 'class': 'empty-msg' }, 'Nothing to chart: revenue is not available.'));
      host.appendChild(el('p', { 'class': 'why', style: 'margin-top:10px' }, (f.reasons && f.reasons.revenue) || ''));
      return;
    }
    var showOi = !finOnly && years.every(function (y) { return y.oi != null; });
    var showFcf = !finOnly && years.every(function (y) { return y.fcf != null; });
    if (!finOnly && !showOi) notes.push('Operating income not shown: ' + (years.length > 1 ? 'not available for both years' : 'not available') + '.');
    if (!finOnly && !showFcf) notes.push('Free cash flow not shown: ' + (years.length > 1 ? 'not available for both years' : 'not available') + '.');
    var W = Math.max(280, host.clientWidth || 420), H = Math.round(Math.min(340, Math.max(250, W * 0.62)));
    var base = H - 34, top = 30, gw = W / years.length;
    var nb = 1 + (showOi ? .75 : 0) + (showFcf ? .5 : 0), bw = Math.min(64, (gw - 28) / (nb + .4 + (showOi ? .1 : 0))), fs = W < 380 ? 10.5 : 12;
    var max = Math.max.apply(null, years.map(function (y) { return y.rev; })) * 1.04;
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });
    var parts = [];
    svg.appendChild(sv('line', { x1: 0, x2: W, y1: base + .5, y2: base + .5, stroke: 'rgba(244,239,230,.25)' }));
    function h(v) { return Math.max(0, v / max * (base - top)); }
    function lab(x, y, t, col, wgt) { svg.appendChild(sv('text', { x: x, y: y, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': wgt || 700, fill: col }, t)); }
    years.forEach(function (y, i) {
      var cx = gw * i + gw / 2, hr = h(y.rev);
      var startX = cx - (bw + (showOi ? 6 + bw * .75 : 0) + (showFcf ? 4 + bw * .5 : 0)) / 2;
      svg.appendChild(sv('rect', { x: startX, y: base - hr, width: bw, height: hr, fill: 'none', stroke: '#f4efe6', 'stroke-width': 1.5 }));
      lab(startX + bw / 2, base - hr - 7, bn1(y.rev), '#f4efe6');
      parts.push('FY' + y.fy + ' revenue ' + bn1(y.rev));
      {
        var ox = startX + bw + 6, ow = bw * .75, fx = (showOi ? ox + ow + 4 : startX + bw + 6), fw = bw * .5;
        if (showOi) {
          var ho = h(Math.max(y.oi, 0));
          svg.appendChild(sv('rect', { x: ox, y: base - ho, width: ow, height: ho, fill: '#c9a77c' }));
          lab(ox + ow / 2, base - ho - 7, nf1.format(y.oi / y.rev * 100) + '%', '#c9a77c');
          parts.push('operating margin ' + nf1.format(y.oi / y.rev * 100) + '%');
        }
        if (showFcf) {
          var hf = h(Math.max(y.fcf, 0));
          svg.appendChild(sv('rect', { x: fx, y: base - hf, width: fw, height: hf, fill: 'rgba(244,239,230,.82)' }));
          svg.appendChild(sv('text', { transform: 'translate(' + (fx + fw / 2 + fs * .35) + ',' + (base - hf - 7) + ') rotate(-90)', 'text-anchor': 'start', 'font-size': fs, 'font-weight': 600, fill: 'rgba(244,239,230,.9)' }, bn1(y.fcf)));
          parts.push('free cash flow ' + bn1(y.fcf));
        }
      }
      svg.appendChild(sv('text', { x: cx, y: base + 20, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 600, fill: 'rgba(244,239,230,.7)' }, 'FY' + y.fy));
    });
    svg.setAttribute('aria-label', r.name + ': ' + parts.join(', ') + '.');
    host.appendChild(svg);
    var lg = el('p', { 'class': 'mon-legend' });
    function li(cls, t) { var sp = el('span'); sp.appendChild(el('i', { 'class': cls })); sp.appendChild(document.createTextNode(t)); lg.appendChild(sp); }
    li('lg-rev', 'Revenue');
    if (showOi) li('lg-oi', 'Operating income (margin)');
    if (showFcf) li('lg-fcf', 'Free cash flow');
    host.appendChild(lg);
    notes.forEach(function (n) { host.appendChild(el('p', { 'class': 'why' }, n)); });
  }

  /* ---------- chart ---------- */
  function setupChart() {
    var ranked = M.rows.filter(function (r) { return r.assets > 0 && r.public_float > 0; }).map(function (r) {
      return { kind: 'ranked', name: r.name, label: r.ticker, rank: r.rank, x: r.assets, y: r.public_float, ratio: r.float_to_assets };
    });
    var excl = M.excluded.filter(function (e) { return e.assets > 0 && e.public_float > 0; }).map(function (e) {
      return { kind: 'excluded', name: e.name, label: e.name, x: e.assets, y: e.public_float, ratio: e.float_to_assets, why: e.why, rule: e.rule };
    });
    state.pts = ranked.concat(excl);
    state.nRanked = ranked.length; state.nExcl = excl.length;
    var limit = M.facts.assets_limit;
    var over = state.pts.filter(function (p) { return p.y > limit * p.x; }).length;

    var nA = excl.filter(function (p) { return p.rule === 'assets'; }).length;
    var nP = excl.filter(function (p) { return p.rule === 'price'; }).length;
    $('chart-title').textContent = M.counts.excluded_over_assets_limit + ' filings reported a public float above ' +
      limit + '× their total assets. None made the list.';
    var lg = $('legend'); lg.textContent = '';
    [['ranked', 'Ranked (' + state.nRanked + ')'], ['assets', 'Excluded: float above ' + limit + '× assets (' + nA + ')'],
     ['price', 'Excluded: impossible share price (' + nP + ')']].forEach(function (s) {
      var li = el('li'); var i = el('i', { 'class': 'k-' + s[0] });
      li.appendChild(i); li.appendChild(document.createTextNode(s[1])); lg.appendChild(li);
    });
    var big = M.excluded.filter(function (e) { return e.rule === 'size'; });
    var note = $('offchart');
    if (big.length) {
      var lim2 = Math.min.apply(null, big.map(function (e) { return e.public_float; }));
      var tn = function (v) { return nf0.format(v / 1e12) + 'tn'; };
      note.textContent = 'Not shown: ' + big.length + ' filings reporting floats above $1,000tn (' +
        big.map(function (e) { return e.name + ', $' + tn(e.public_float); }).join('; ') + ').';
    } else note.hidden = true;
    $('unit').textContent = 'USD, log scales';
    $('source').textContent = 'Source: ' + M.source + '. As of ' + dateLong(M.as_of) + '.';
    $('chart-alt').textContent = 'Scatter plot on logarithmic axes of total assets (horizontal) against public float (vertical) for ' +
      state.nRanked + ' ranked companies and ' + state.nExcl + ' excluded filings. A dashed line marks float equal to ' + limit +
      ' times assets; ' + over + ' plotted points lie above it. The Table tab lists every ranked company and every exclusion.';
    state.sorted = state.pts.map(function (p, i) { return i; }).sort(function (a, b) { return state.pts[a].x - state.pts[b].x; });

    var wrap = $('chart-wrap');
    if (window.ResizeObserver) new ResizeObserver(function () { drawChart(); }).observe(wrap);
    else window.addEventListener('resize', drawChart);
    wrap.addEventListener('keydown', onKey);
    wrap.addEventListener('blur', function () { setActive(-1); });
    var svg = $('chart');
    wrap.addEventListener('pointermove', function (e) {
      var g = state.geom; if (!g) return;
      var rc = svg.getBoundingClientRect();
      var mx = (e.clientX - rc.left) * (g.W / rc.width), my = (e.clientY - rc.top) * (g.H / rc.height);
      var best = -1, bd = 18 * 18;
      for (var i = 0; i < state.pts.length; i++) {
        var p = state.pts[i], dx = g.px(p.x) - mx, dy = g.py(p.y) - my, d = dx * dx + dy * dy;
        if (d < bd || (d === bd && p.kind === 'excluded')) { bd = d; best = i; }
      }
      setActive(best, true);
    });
    wrap.addEventListener('pointerleave', function () { if (document.activeElement !== wrap) setActive(-1); });
    drawChart();
  }

  function onKey(e) {
    var s = state.sorted, pos = s.indexOf(state.active);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setActive(s[pos < 0 ? 0 : Math.min(s.length - 1, pos + 1)], false, true); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setActive(s[pos < 0 ? s.length - 1 : Math.max(0, pos - 1)], false, true); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(s[0], false, true); }
    else if (e.key === 'End') { e.preventDefault(); setActive(s[s.length - 1], false, true); }
    else if (e.key === 'Escape') setActive(-1);
  }

  function describe(p) {
    return (p.kind === 'ranked' ? 'Ranked #' + p.rank + ', ' : 'Excluded, ') + p.name + '. Public float ' + usd(p.y) +
      ', total assets ' + usd(p.x) + ', float is ' + ratioTxt(p.ratio) + ' assets.' + (p.why ? ' ' + p.why : '');
  }

  function setActive(i, fromPointer, announce) {
    state.active = i;
    var tip = $('tip'), g = state.geom;
    var ring = document.getElementById('ring');
    if (i < 0 || !g) { tip.hidden = true; if (ring) ring.setAttribute('visibility', 'hidden'); return; }
    var p = state.pts[i];
    tip.textContent = '';
    tip.appendChild(el('b', null, (p.kind === 'ranked' ? '#' + p.rank + ' ' : '') + p.name));
    var dl = el('dl');
    [['Public float', usd(p.y)], ['Total assets', usd(p.x)], ['Float / assets', ratioTxt(p.ratio)]].forEach(function (r) {
      dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1]));
    });
    tip.appendChild(dl);
    if (p.why) tip.appendChild(el('p', null, p.why));
    tip.hidden = false;
    var svg = $('chart'), sc = svg.getBoundingClientRect().width / g.W;
    var cx = g.px(p.x) * sc, cy = g.py(p.y) * sc, tw = tip.offsetWidth, th = tip.offsetHeight, cw = $('chart-wrap').clientWidth;
    var left = cx + 14; if (left + tw > cw) left = cx - tw - 14; if (left < 0) left = 0;
    var top = cy - th / 2; top = Math.max(0, Math.min(top, svg.getBoundingClientRect().height - th));
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
    if (ring) { ring.setAttribute('cx', g.px(p.x)); ring.setAttribute('cy', g.py(p.y)); ring.setAttribute('visibility', 'visible'); }
    if (announce) $('live').textContent = describe(p);
  }

  function drawChart() {
    var wrap = $('chart-wrap'), svg = $('chart');
    if (!M) return;
    var W = Math.round(wrap.clientWidth); if (W < 200) return;
    var narrow = W < 560;
    var H = narrow ? Math.round(W * 1.05) : Math.round(Math.min(560, W * 0.58));
    var m = narrow ? { l: 50, r: 10, t: 10, b: 40 } : { l: 70, r: 20, t: 12, b: 48 };
    var fs = narrow ? 11 : 12;
    var pts = state.pts, lim = M.facts.assets_limit;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    var x0 = Math.floor(Math.log10(minX)), x1 = Math.ceil(Math.log10(maxX));
    var y0 = Math.floor(Math.log10(minY)), y1 = Math.ceil(Math.log10(maxY));
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    function px(v) { return m.l + (Math.log10(v) - x0) / (x1 - x0) * pw; }
    function py(v) { return m.t + (1 - (Math.log10(v) - y0) / (y1 - y0)) * ph; }
    state.geom = { W: W, H: H, px: px, py: py };
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.textContent = '';
    var defs = sv('defs'); var cp = sv('clipPath', { id: 'clip' });
    cp.appendChild(sv('rect', { x: m.l, y: m.t, width: pw, height: ph })); defs.appendChild(cp); svg.appendChild(defs);

    var grid = sv('g');
    var e, fill = 'var(--ink-2)';
    for (e = x0; e <= x1; e++) {
      var gx = px(Math.pow(10, e));
      grid.appendChild(sv('line', { x1: gx, x2: gx, y1: m.t, y2: m.t + ph, stroke: 'var(--grey)', 'stroke-opacity': .55, 'stroke-width': 1 }));
      if (!(narrow && (e - x0) % 2)) grid.appendChild(sv('text', { x: gx, y: m.t + ph + 16, 'text-anchor': e === x0 ? 'start' : 'middle', 'font-size': fs, fill: fill }, tickLabel(e)));
    }
    for (e = y0; e <= y1; e++) {
      var gy = py(Math.pow(10, e));
      grid.appendChild(sv('line', { x1: m.l, x2: m.l + pw, y1: gy, y2: gy, stroke: 'var(--grey)', 'stroke-opacity': .55, 'stroke-width': 1 }));
      grid.appendChild(sv('text', { x: m.l - 8, y: gy + 4, 'text-anchor': 'end', 'font-size': fs, fill: fill }, tickLabel(e)));
    }
    grid.appendChild(sv('line', { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph, stroke: 'var(--ink-2)', 'stroke-width': 1 }));
    grid.appendChild(sv('text', { x: m.l + pw / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': fs, fill: fill }, 'Total assets'));
    var yt = sv('text', { transform: 'translate(' + (narrow ? 11 : 14) + ',' + (m.t + ph / 2) + ') rotate(-90)', 'text-anchor': 'middle', 'font-size': fs, fill: fill }, 'Public float');
    grid.appendChild(yt);
    svg.appendChild(grid);

    // reference line: float = lim x assets (clipped)
    var ls = Math.pow(10, x0), le = Math.pow(10, x1);
    var lx1 = px(ls), ly1 = py(lim * ls), lx2 = px(le), ly2 = py(lim * le);
    var line = sv('line', { x1: lx1, y1: ly1, x2: lx2, y2: ly2, stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-dasharray': '6 5', 'clip-path': 'url(#clip)' });
    svg.appendChild(line);
    // label along the line, placed below it (clear of the excluded cluster above)
    // visible part of the line inside the plot
    var vy0 = m.t, vy1 = m.t + ph;
    var tA = Math.max(0, Math.min(1, (vy1 - ly1) / (ly2 - ly1))), tB = Math.max(0, Math.min(1, (vy0 - ly1) / (ly2 - ly1)));
    var tl = Math.min(tA, tB), th2 = Math.max(tA, tB);
    var ang = Math.atan2(ly2 - ly1, lx2 - lx1) * 180 / Math.PI;
    var tfrac = tl + (th2 - tl) * 0.5;
    var tx = lx1 + (lx2 - lx1) * tfrac, ty = ly1 + (ly2 - ly1) * tfrac;
    var lab = sv('text', { transform: 'translate(' + tx + ',' + ty + ') rotate(' + ang + ') translate(0,' + (fs + 6) + ')', 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 600, fill: 'var(--ink)', 'paint-order': 'stroke', stroke: 'var(--bone)', 'stroke-width': 4, 'stroke-linejoin': 'round' }, narrow ? lim + '× assets' : lim + '× assets: our unit-error line');
    svg.appendChild(lab);

    // points: ranked first, excluded on top
    var dots = sv('g');
    function dot(p, i) {
      var hollow = p.rule === 'price';
      var c = sv('circle', { cx: px(p.x), cy: py(p.y), r: p.kind === 'ranked' ? 4 : (hollow ? 5.5 : 5),
        fill: p.kind === 'ranked' ? 'var(--ink)' : (hollow ? 'none' : 'var(--accent)'), 'fill-opacity': p.kind === 'ranked' ? .5 : .95,
        stroke: hollow ? 'var(--accent)' : 'var(--bone)', 'stroke-width': hollow ? 2 : 1.5 });
      dots.appendChild(c);
    }
    pts.forEach(function (p, i) { if (p.kind === 'ranked') dot(p, i); });
    pts.forEach(function (p, i) { if (p.kind === 'excluded') dot(p, i); });
    svg.appendChild(dots);

    // direct labels: top 3 ranked, 3 most extreme excluded
    var picks = [];
    pts.filter(function (p) { return p.kind === 'ranked'; }).sort(function (a, b) { return a.rank - b.rank; }).slice(0, 3).forEach(function (p) { picks.push(p); });
    pts.filter(function (p) { return p.kind === 'excluded'; }).sort(function (a, b) { return b.ratio - a.ratio; }).slice(0, 3).forEach(function (p) { picks.push(p); });
    var boxes = [];
    // The leftmost of the top-3 ranked points takes its label on the left, so leader lines never cross.
    var leftmostRanked = Math.min.apply(null, picks.filter(function (p) { return p.kind === 'ranked'; })
      .map(function (p) { return px(p.x); }));
    picks.forEach(function (p) {
      var t = p.kind === 'ranked' ? p.label : (p.label.length > 30 ? p.label.slice(0, 29) + '…' : p.label);
      var w = t.length * (fs * 0.6) + 4, cx = px(p.x), cy = py(p.y);
      var right = (p.kind === 'ranked' && cx === leftmostRanked) ? false : cx + 14 + w < m.l + pw;
      var bx = right ? cx + 14 : cx - 14 - w, by = cy - 14;
      var guard = 0;
      while (guard++ < 10 && boxes.some(function (b) { return bx < b.x + b.w && bx + w > b.x && by - fs < b.y && by > b.y - fs; })) by -= fs + 3;
      if (by - fs < m.t) by = m.t + fs;
      if (bx < m.l + 2) bx = m.l + 2;
      boxes.push({ x: bx, y: by, w: w });
      svg.appendChild(sv('line', { x1: cx, y1: cy, x2: right ? bx - 2 : bx + w + 2, y2: by - fs / 2 + 1, stroke: 'var(--ink-2)', 'stroke-width': 1 }));
      svg.appendChild(sv('text', { x: right ? bx : bx + w, y: by, 'text-anchor': right ? 'start' : 'end', 'font-size': fs, 'font-weight': 600,
        fill: 'var(--ink)', 'paint-order': 'stroke', stroke: 'var(--bone)', 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, t));
    });

    svg.appendChild(sv('circle', { id: 'ring', r: 9, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2, visibility: 'hidden' }));
    if (state.active >= 0) setActive(state.active);
  }
})();
