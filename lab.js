/* Lab shared shell: top bar with five page links, freshness strip, formatters, ONE analyst note, small SVG chart helpers.
   Every helper is defined once, here; pages add only their own small file. No figure is typed as data: the numeric
   literals below are layout sizes, freshness limits and formatting rules. */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var MINUS = '\u2212', UP = '\u25B2', DOWN = '\u25BC';
  var C = { ink: '#14213d', mark: '#9c7345', soft: '#d9c4a3', grey: '#8f897a', greySoft: '#cfc6b4', hair: '#d6cbb6', ink2: '#4b5568', ink3: '#5f6878', bone: '#f4efe6' };
  var Lab = { C: C, MINUS: MINUS };

  /* ---------- dom helpers ---------- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
    add(e, kids); return e;
  }
  function sv(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
    add(e, kids); return e;
  }
  function add(e, kids) {
    if (kids == null) return;
    (Array.isArray(kids) ? kids : [kids]).forEach(function (k) {
      if (k == null || k === false) return;
      e.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
    });
  }
  Lab.el = el; Lab.sv = sv;
  Lab.$ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  Lab.reduced = reduced;

  /* ---------- data loading (the files are UTF-8; nothing to repair) ---------- */
  var cache = {};
  Lab.load = function (name) {
    if (!cache[name]) {
      cache[name] = fetch(name.indexOf('/') >= 0 ? name : 'data/' + name + '.json').then(function (r) {
        if (!r.ok) throw new Error(name + ' ' + r.status);
        return r.json();
      });
    }
    return cache[name];
  };
  /* the newest build date seen, kept only so a failed load can name the last good build */
  var LAST = 'lab:last-good-build';
  Lab.rememberBuild = function (stamp) { try { localStorage.setItem(LAST, stamp); } catch (e) { /* private mode */ } };
  Lab.lastBuild = function () { try { return localStorage.getItem(LAST); } catch (e) { return null; } };

  /* ---------- formatters ---------- */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function nfix(v, d) { return Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  Lab.isNum = isNum;
  Lab.word = function (n) { return WORDS[n] != null ? WORDS[n] : String(n); };
  Lab.num = function (v, d) { return isNum(v) ? (v < 0 ? MINUS : '') + nfix(v, d == null ? 0 : d) : ''; };
  Lab.usd = function (v) {
    if (!isNum(v)) return '';
    var a = Math.abs(v), s = v < 0 ? MINUS : '';
    if (a >= 1e12) return s + '$' + nfix(a / 1e12, 2) + 'tn';
    if (a >= 1e9) return s + '$' + nfix(a / 1e9, a >= 1e11 ? 0 : 1) + 'bn';
    if (a >= 1e6) return s + '$' + nfix(a / 1e6, 0) + 'mn';
    return s + '$' + nfix(a, 0);
  };
  Lab.ps = function (v, ref) { return isNum(v) ? (v < 0 ? MINUS : '') + '$' + nfix(v, Math.abs(isNum(ref) ? ref : v) >= 100 ? 0 : 2) : ''; };
  /* a share cannot be worth less than zero: show "below 0" */
  Lab.psz = function (v, ref) { return isNum(v) && v < 0 ? 'below 0' : Lab.ps(v, ref); };
  Lab.pct = function (v, d) { return isNum(v) ? (v < 0 ? MINUS : '') + nfix(v * 100, d == null ? 1 : d) + '%' : ''; };
  Lab.pctS = function (v, d) { return isNum(v) ? (v < 0 ? MINUS : '+') + nfix(v * 100, d == null ? 1 : d) + '%' : ''; };
  Lab.mult = function (v) { return isNum(v) ? (v < 0 ? MINUS : '') + nfix(v, 1) + '\u00d7' : ''; };
  Lab.days = function (v) { return isNum(v) ? (v < 0 ? MINUS : '') + nfix(v, 1) : ''; };
  Lab.pp = function (v) { return isNum(v) ? (v < 0 ? MINUS : '+') + nfix(v, 1) + ' pp' : ''; };
  function parseDate(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[ T](\d{2}):(\d{2}))?/.exec(s);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0));
  }
  Lab.parseDate = parseDate;
  Lab.date = function (s) { var d = parseDate(s); return d ? d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : ''; };
  Lab.stamp = function (s) {
    var d = parseDate(s); if (!d) return '';
    var t = /\d:\d/.test(s) ? ', ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC' : '';
    return Lab.date(s) + t;
  };
  Lab.month = function (s) { var d = parseDate(s); return d ? MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : ''; };
  Lab.monthName = function (s) { var d = parseDate(s); return d ? MON[d.getUTCMonth()] : ''; };
  /* a change chip: arrow and sign; colour follows direction only (up green, down red) */
  Lab.chg = function (value, text, o) {
    // Direction follows the DISPLAYED rounding (logic rule, KPIS_AND_FEEDS §6): "+0.0%" is flat, never a green arrow.
    var shownZero = /^[+−-]?0(?:[.,]0+)?\s*(?:%|pp|×)?$/.test(String(text == null ? '' : text).trim());
    var dir = !isNum(value) || value === 0 || shownZero ? 'flat' : (value > 0 ? 'up' : 'down');
    var arrow = dir === 'flat' ? '\u25AC' : (dir === 'up' ? UP : DOWN);
    return el('span', { 'class': 'chg ' + dir + (o && o.neutral && dir !== 'flat' ? ' neu' : '') }, [el('span', { 'aria-hidden': 'true' }, arrow), el('span', null, text)]);
  };
  var KEEP = { PLC: 1, IBM: 1, USA: 1, NVIDIA: 1 }, LOWER = { AND: 1, OF: 1, THE: 1 };
  Lab.niceName = function (n) {
    n = String(n || '').replace(/\u00a0/g, ' ').replace(/\s*\/[A-Z]+$/, '').replace(/\s+/g, ' ').trim();
    if (/[a-z]/.test(n)) return n;
    return n.replace(/[A-Z][A-Z0-9'&.]*/g, function (w, i) {
      var bare = w.replace(/[^A-Z]/g, '');
      if (KEEP[bare]) return w;
      if (LOWER[bare] && i > 0) return w.toLowerCase();
      return w.charAt(0) + w.slice(1).toLowerCase();
    });
  };
  Lab.shortName = function (n) {
    /* "Eli Lilly and Company" -> "Eli Lilly": a trailing "and" or "&" left by the cut goes too */
    return Lab.niceName(n).replace(/\s*&\s*Co\.?$/i, '').replace(/,?\s+(Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company|Plc|Ltd\.?)$/i, '').replace(/,?\s+(Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company)$/i, '').replace(/\s+(and|&)$/i, '');
  };

  /* ---------- guilloche hairline: three interlaced waves, the one ornament ---------- */
  Lab.guilloche = function (w, h) {
    h = h || 12; var svg = sv('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true', 'class': 'guil' });
    for (var k = 0; k < 3; k++) {
      var d = '';
      for (var x = 0; x <= w; x += 2) {
        var y = h / 2 + (h / 2 - 1) * Math.sin(x / 7 + k * 2.1) * (0.55 + 0.45 * Math.cos(x / 31 + k));
        d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(2) + ' ';
      }
      svg.appendChild(sv('path', { d: d, fill: 'none', stroke: C.mark, 'stroke-width': 0.8, opacity: k ? 0.7 : 1 }));
    }
    return svg;
  };

  /* ---------- the analyst note: one component for every figure ----------
     spec: {title, def, formula, working, source, href, hrefText, caution, more}. Opens 150 ms after hover, at once on
     focus or tap; closes 100 ms after the pointer leaves figure and card; Esc closes and returns focus; bottom sheet on touch. */
  var note = null, cur = null, hoverT = null, closeT = null, y0 = 0;
  var sheetMQ = window.matchMedia ? window.matchMedia('(hover: none), (max-width: 620px)') : { matches: false };
  function ensureNote() {
    if (note) return note;
    note = el('div', { id: 'lab-note', role: 'group', 'aria-label': 'Analyst note', hidden: true });
    note.addEventListener('mouseenter', function () { clearTimeout(closeT); });
    note.addEventListener('mouseleave', function () { if (cur && cur.how === 'hover') schedClose(); });
    note.addEventListener('focusout', function (e) {
      if (cur && cur.how !== 'pin' && !(e.relatedTarget && (note.contains(e.relatedTarget) || cur.node === e.relatedTarget))) close(false);
    });
    document.body.appendChild(note); return note;
  }
  function build(spec) {
    var n = ensureNote(); n.textContent = '';
    var head = el('div', { 'class': 'nh' }, el('h4', null, spec.title || ''));
    var x = el('button', { type: 'button', 'class': 'nx', 'aria-label': 'Close note' }, '\u00d7');
    x.addEventListener('click', function () { close(true); });
    head.appendChild(x); n.appendChild(head); n.appendChild(Lab.guilloche(280, 10));
    if (spec.def) n.appendChild(el('p', { 'class': 'nd' }, spec.def));
    var dl = el('dl');
    if (spec.formula) { dl.appendChild(el('dt', null, 'Formula')); dl.appendChild(el('dd', null, spec.formula)); }
    if (spec.working) { dl.appendChild(el('dt', null, 'This page')); dl.appendChild(el('dd', { 'class': 'w' }, spec.working)); }
    if (spec.source || spec.href) {
      var dd = el('dd', null, spec.source || '');
      if (spec.href) { dd.appendChild(document.createTextNode(' ')); dd.appendChild(el('a', { href: spec.href, target: '_blank', rel: 'noopener' }, (spec.hrefText || 'Open the filing') + ' \u2192')); }
      dl.appendChild(el('dt', null, 'Source')); dl.appendChild(dd);
    }
    if (dl.children.length) n.appendChild(dl);
    if (spec.caution) n.appendChild(el('p', { 'class': 'nc' }, spec.caution));
    n.appendChild(el('a', { 'class': 'nm', href: spec.more || 'method.html' }, 'More in Method \u2192'));
  }
  function place() {
    var n = ensureNote();
    if (cur.sheet) { n.style.left = n.style.top = ''; return; }
    var box = (cur.node.closest && cur.node.closest('.fig, .tile')) || cur.node;
    var r = box.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight, gap = 10;
    var w = n.offsetWidth, h = n.offsetHeight;
    var wrap = document.querySelector('.wrap'), wr = wrap ? wrap.getBoundingClientRect() : { left: 12, right: vw - 12 };
    var x = Math.max(wr.left, Math.min(r.left, wr.right - w)); x = Math.max(12, Math.min(x, vw - w - 12));
    var y = r.bottom + gap;
    if (y + h > vh - 8) { y = r.top - h - gap; if (y < 8) y = Math.max(8, vh - h - 8); }
    n.style.left = x + 'px'; n.style.top = y + 'px';
  }
  function open(node, getSpec, how) {
    clearTimeout(hoverT); clearTimeout(closeT);
    if (cur && cur.node === node) { cur.how = how; return; }
    if (cur) close(false);
    var n = ensureNote(), sheet = sheetMQ.matches;
    cur = { node: node, how: sheet ? 'pin' : how, sheet: sheet };
    build(getSpec());
    n.classList.toggle('sheet', sheet);
    var anchor = node.closest ? (node.closest('svg') || node) : node;
    if (anchor.parentNode && !sheet) anchor.parentNode.insertBefore(n, anchor.nextSibling); else document.body.appendChild(n);
    n.hidden = false; y0 = window.scrollY;
    node.setAttribute('aria-expanded', 'true'); node.setAttribute('aria-controls', 'lab-note');
    place(); n.classList.add('on');
  }
  function close(refocus) {
    clearTimeout(hoverT); clearTimeout(closeT);
    if (!cur) return;
    var node = cur.node; cur = null;
    if (note) { note.classList.remove('on'); note.hidden = true; }
    node.setAttribute('aria-expanded', 'false');
    if (refocus && node.focus) node.focus();
  }
  function schedClose() { clearTimeout(closeT); closeT = setTimeout(function () { close(false); }, 100); }
  Lab.note = { open: open, close: close };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && cur) { close(true); } });
  document.addEventListener('click', function (e) { if (cur && note && !note.contains(e.target) && !cur.node.contains(e.target)) close(false); });
  window.addEventListener('scroll', function () { if (cur && cur.how === 'hover' && Math.abs(window.scrollY - y0) > 24) close(false); }, { passive: true });
  window.addEventListener('resize', function () { if (cur) place(); });

  /* Lab.tip(node, spec | fn, opts): makes node open the note. opts.on = element whose keyboard focus opens it. */
  Lab.tip = function (node, spec, opts) {
    opts = opts || {};
    var getSpec = typeof spec === 'function' ? spec : function () { return spec; };
    var tag = node.tagName.toLowerCase();
    if (tag !== 'button' && tag !== 'input' && !node.hasAttribute('tabindex') && !opts.noFocus) { node.setAttribute('tabindex', '0'); if (!node.getAttribute('role')) node.setAttribute('role', 'button'); }
    node.setAttribute('aria-expanded', 'false');
    node.addEventListener('mouseenter', function () {
      if (sheetMQ.matches) return;
      clearTimeout(closeT); clearTimeout(hoverT);
      hoverT = setTimeout(function () { open(node, getSpec, 'hover'); }, 150);
    });
    node.addEventListener('mouseleave', function () { clearTimeout(hoverT); if (cur && cur.node === node && cur.how === 'hover') schedClose(); });
    var fnode = opts.on || node;
    fnode.addEventListener('focus', function () { if (fnode.matches(':focus-visible')) open(node, getSpec, 'focus'); });
    fnode.addEventListener('blur', function (e) { if (cur && cur.node === node && cur.how !== 'pin' && !(e.relatedTarget && note && note.contains(e.relatedTarget))) close(false); });
    if (!opts.noClick) {
      node.addEventListener('click', function (e) {
        e.stopPropagation();
        if (cur && cur.node === node && cur.how === 'pin') { close(false); return; }
        if (cur && cur.node === node) { cur.how = 'pin'; return; }
        open(node, getSpec, 'pin');
      });
      if (tag !== 'button') node.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    }
    return node;
  };
  Lab.tipLabel = function (text, spec, cls) {
    return Lab.tip(el('button', { type: 'button', 'class': 'tipt' + (cls ? ' ' + cls : '') }, text), spec);
  };

  /* A light read-out that follows a chart cursor; not interactive. */
  var read = null;
  function readout(pt, title, text) {
    if (!read) { read = el('div', { id: 'lab-read', 'aria-hidden': 'true' }); document.body.appendChild(read); }
    read.textContent = ''; read.appendChild(el('b', null, title)); if (text) read.appendChild(el('span', null, text));
    read.hidden = false;
    var vw = document.documentElement.clientWidth, w = read.offsetWidth, h = read.offsetHeight;
    var x = Math.max(8, Math.min(pt.x - w / 2, vw - w - 8)), y = pt.y - h - 12; if (y < 8) y = pt.y + 14;
    read.style.left = x + 'px'; read.style.top = y + 'px';
  }
  function unread() { if (read) read.hidden = true; }

  /* ---------- charts: redraw at real pixel width ---------- */
  Lab.chart = function (host, draw) {
    var st = host.__lab;
    if (!st) {
      st = host.__lab = { last: 0, draw: null };
      st.go = function () {
        var w = Math.floor(host.clientWidth);
        if (!w || w === st.last) return;
        st.last = w; host.textContent = ''; st.draw(host, w);
      };
      if (window.ResizeObserver) new ResizeObserver(st.go).observe(host); else window.addEventListener('resize', st.go);
    }
    st.draw = draw; st.last = 0; st.go();
  };
  function rootSvg(w, h, label) { return sv('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': label || '' }); }
  function scale(d0, d1, r0, r1) { return function (v) { return d1 === d0 ? r0 : r0 + (v - d0) * (r1 - r0) / (d1 - d0); }; }
  Lab.scale = scale;

  /* One tab stop; arrows or pointer move a cursor along n points and a light read-out names the point. */
  function scrub(svg, o) {
    var cur2 = null, idx = o.n - 1;
    function show(i) {
      idx = Math.max(0, Math.min(o.n - 1, i));
      if (cur2) cur2.remove();
      cur2 = sv('g', { 'aria-hidden': 'true', 'pointer-events': 'none' }); o.cursor(cur2, idx); svg.appendChild(cur2);
      var r = svg.getBoundingClientRect(), p = o.pos(idx), s = o.spec(idx);
      readout({ x: r.left + p[0], y: r.top + p[1] }, s.title, s.def);
    }
    function off() { if (cur2) cur2.remove(); cur2 = null; unread(); }
    svg.setAttribute('tabindex', '0');
    svg.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowLeft') show(idx - 1); else if (k === 'ArrowRight') show(idx + 1); else if (k === 'Home') show(0); else if (k === 'End') show(o.n - 1); else return;
      e.preventDefault();
    });
    svg.addEventListener('focus', function () { if (svg.matches(':focus-visible')) show(o.n - 1); });
    svg.addEventListener('blur', off);
    svg.addEventListener('mousemove', function (e) {
      var r = svg.getBoundingClientRect(), x = e.clientX - r.left, best = 0, bd = Infinity;
      for (var i = 0; i < o.n; i++) { var d = Math.abs(o.pos(i)[0] - x); if (d < bd) { bd = d; best = i; } }
      show(best);
    });
    svg.addEventListener('mouseleave', off);
  }

  function H0(o) { return o.h || 72; }
  /* Line: ink, one cashmere end point. pts: [{label, v}] */
  Lab.spark = function (host, pts, o) {
    o = o || {};
    Lab.chart(host, function (h, w) {
      var H = o.h || 72, pad = { l: 3, r: 8, t: H0(o) < 40 ? 5 : 10, b: H0(o) < 40 ? 5 : 10 };
      var vs = pts.map(function (p) { return p.v; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
      var x = scale(0, pts.length - 1, pad.l, w - pad.r), y = scale(lo, hi, H - pad.b, pad.t);
      var svg = rootSvg(w, H, (o.name || 'Trend') + ': from ' + o.fmt(vs[0]) + ' in ' + pts[0].label + ' to ' + o.fmt(vs[vs.length - 1]) + ' in ' + pts[pts.length - 1].label + '. Arrow keys read each point.');
      svg.appendChild(sv('path', { d: pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' '), fill: 'none', stroke: C.ink, 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      svg.appendChild(sv('circle', { cx: x(pts.length - 1), cy: y(vs[vs.length - 1]), r: 4.5, fill: C.mark, stroke: C.bone, 'stroke-width': 2 }));
      if (o.static) { svg.removeAttribute('tabindex'); h.appendChild(svg); return; }
      scrub(svg, {
        n: pts.length, pos: function (i) { return [x(i), y(pts[i].v)]; },
        cursor: function (g, i) { g.appendChild(sv('line', { x1: x(i), x2: x(i), y1: pad.t - 4, y2: H - pad.b + 4, stroke: C.grey, 'stroke-width': 1 })); g.appendChild(sv('circle', { cx: x(i), cy: y(pts[i].v), r: 4, fill: C.ink })); },
        spec: function (i) { return { title: o.fmt(pts[i].v), def: pts[i].label }; }
      });
      h.appendChild(svg);
    });
  };

  /* Columns: earlier grey, the window ink, the last one cashmere. cols: [{label, v, hi}] */
  Lab.columns = function (host, cols, o) {
    o = o || {};
    Lab.chart(host, function (h, w) {
      var H = o.h || 72, pad = { l: 1, r: 1, t: 6, b: 2 }, gap = 3, mob = o.mobileBars && window.innerWidth <= 620;
      if (mob) cols = cols.slice(-o.mobileBars);
      var n = cols.length;
      var max = Math.max.apply(null, cols.map(function (c) { return c.v; }));
      var bw = mob ? 6 : Math.max(1, (w - pad.l - pad.r - gap * (n - 1)) / n), y = scale(0, max, H - pad.b, pad.t);
      if (mob) w = Math.min(w, pad.l + pad.r + n * bw + (n - 1) * gap);
      var svg = rootSvg(w, H, (o.name || 'Monthly counts') + ': ' + n + ' months, ' + cols[0].label + ' to ' + cols[n - 1].label + '. Arrow keys read each month.');
      cols.forEach(function (c, i) {
        svg.appendChild(sv('rect', { x: pad.l + i * (bw + gap), y: y(c.v), width: bw, height: Math.max(1, H - pad.b - y(c.v)), rx: Math.min(2, bw / 2), fill: i === n - 1 ? C.mark : (c.hi ? C.ink : C.greySoft) }));
      });
      scrub(svg, {
        n: n, pos: function (i) { return [pad.l + i * (bw + gap) + bw / 2, y(cols[i].v)]; },
        cursor: function (g, i) { g.appendChild(sv('rect', { x: pad.l + i * (bw + gap) - 1.5, y: pad.t - 3, width: bw + 3, height: H - pad.b - pad.t + 3, rx: 3, fill: 'none', stroke: C.ink, 'stroke-width': 1 })); },
        spec: function (i) { return { title: o.fmt ? o.fmt(cols[i]) : String(cols[i].v), def: cols[i].label }; }
      });
      h.appendChild(svg);
    });
  };

  /* Dot grid: ink filled when flagged, grey outline when not. items: [{on, title, def}] */
  Lab.dots = function (host, items, o) {
    o = o || {};
    Lab.chart(host, function (h, w) {
      var rows = o.rows || 3, cols = Math.ceil(items.length / rows), H = o.h || 72;
      var pitch = Math.min((w - 2) / cols, H / rows, 26), r = Math.max(3.5, pitch * 0.34);
      var n = items.filter(function (i) { return i.on; }).length;
      var svg = rootSvg(w, H, (o.name || 'Companies') + ': ' + n + ' of ' + items.length + ' filled. Arrow keys read each company.');
      function pos(i) { return [pitch / 2 + 1 + Math.floor(i / rows) * pitch, pitch / 2 + (i % rows) * pitch]; }
      items.forEach(function (it, i) {
        var p = pos(i);
        svg.appendChild(it.on ? sv('circle', { cx: p[0], cy: p[1], r: r, fill: C.ink }) : sv('circle', { cx: p[0], cy: p[1], r: r - 1, fill: 'none', stroke: C.grey, 'stroke-width': 1.5 }));
      });
      scrub(svg, {
        n: items.length, pos: pos,
        cursor: function (g, i) { var p = pos(i); g.appendChild(sv('circle', { cx: p[0], cy: p[1], r: r + 3, fill: 'none', stroke: C.mark, 'stroke-width': 1.5 })); },
        spec: function (i) { return items[i]; }
      });
      h.appendChild(svg);
    });
  };

  /* Two-year pair: prior grey, latest ink. d: {name, prior, cur, priorLabel, curLabel, fmt, spec(which)} */
  Lab.pair = function (host, d) {
    Lab.chart(host, function (h, w) {
      var H = 150, padT = 26, padB = 26, bw = Math.min(84, (w - 40) / 2.6), gap = Math.min(40, w * 0.12), single = !isNum(d.prior);
      var vals = [d.prior, d.cur].filter(isNum), max = Math.max.apply(null, vals.concat([0])), min = Math.min.apply(null, vals.concat([0]));
      var y = scale(min, max, H - padB, padT), zero = y(0), x0 = single ? (w - bw) / 2 : (w - (2 * bw + gap)) / 2;
      var svg = rootSvg(w, H, d.name + ': ' + (isNum(d.prior) ? d.priorLabel + ' ' + d.fmt(d.prior) + ', ' : '') + d.curLabel + ' ' + (isNum(d.cur) ? d.fmt(d.cur) : 'not reported') + '.');
      svg.appendChild(sv('line', { x1: 0, x2: w, y1: zero, y2: zero, stroke: C.hair }));
      [[d.prior, d.priorLabel, C.greySoft, x0, 'prior'], [d.cur, d.curLabel, C.ink, single ? x0 : x0 + bw + gap, 'cur']].filter(function (b) { return !(single && b[4] === 'prior'); }).forEach(function (b) {
        var v = b[0], x = b[3];
        if (!isNum(v)) {
          svg.appendChild(sv('text', { x: x + bw / 2, y: zero - 8, 'text-anchor': 'middle', 'font-size': 14, fill: C.ink3 }, 'n/a'));
          if (d.spec) { var hit = sv('rect', { x: x, y: zero - 28, width: bw, height: 30, fill: 'transparent' }); svg.appendChild(hit); Lab.tip(hit, function () { return d.spec(b[4]); }); hit.setAttribute('aria-label', b[1] + ' not reported'); }
        } else {
          var top = Math.min(y(v), zero), ht = Math.max(2, Math.abs(y(v) - zero));
          var r = sv('rect', { x: x, y: top, width: bw, height: ht, rx: 3, fill: b[2] });
          svg.appendChild(r);
          svg.appendChild(sv('text', { x: x + bw / 2, y: (v >= 0 ? top : top + ht) + (v >= 0 ? -8 : 17), 'text-anchor': 'middle', 'font-size': 14, 'font-weight': b[4] === 'cur' ? 600 : 400, fill: C.ink }, d.fmt(v)));
          if (d.spec) Lab.tip(r, function () { return d.spec(b[4]); });
          r.setAttribute('aria-label', b[1] + ' ' + d.fmt(v));
        }
        svg.appendChild(sv('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 13, fill: C.ink2 }, b[1]));
      });
      h.appendChild(svg);
    });
  };

  /* Fiscal-year bars: earlier years grey, the latest ink, a zero line for losses, n/a for a missing year.
     d: {name, items: [{label, v, spec}], fmt} */
  Lab.bars = function (host, d) {
    Lab.chart(host, function (h, w) {
      var H = 170, padT = 26, padB = 26, n = d.items.length, gap = Math.max(6, Math.min(16, w * 0.03));
      var bw = Math.min(64, (w - gap * (n - 1)) / n), x0 = (w - (n * bw + (n - 1) * gap)) / 2, all = bw >= 52;
      var vals = d.items.map(function (i) { return i.v; }).filter(isNum), max = Math.max.apply(null, vals.concat([0])), min = Math.min.apply(null, vals.concat([0]));
      var y = scale(min, max, H - padB, padT), zero = y(0);
      var svg = rootSvg(w, H, d.name + ': ' + d.items.map(function (i) { return i.label + ' ' + (isNum(i.v) ? d.fmt(i.v) : 'not reported'); }).join(', ') + '.');
      svg.appendChild(sv('line', { x1: 0, x2: w, y1: zero, y2: zero, stroke: C.hair }));
      d.items.forEach(function (it, i) {
        var x = x0 + i * (bw + gap), last = i === n - 1, node;
        if (!isNum(it.v)) {
          svg.appendChild(sv('text', { x: x + bw / 2, y: zero - 8, 'text-anchor': 'middle', 'font-size': 13, fill: C.ink3 }, 'n/a'));
          node = sv('rect', { x: x, y: zero - 28, width: bw, height: 30, fill: 'transparent' });
          svg.appendChild(node); node.setAttribute('aria-label', it.label + ' not reported');
        } else {
          var top = Math.min(y(it.v), zero), ht = Math.max(2, Math.abs(y(it.v) - zero));
          node = sv('rect', { x: x, y: top, width: bw, height: ht, rx: 3, fill: last ? C.ink : C.greySoft });
          svg.appendChild(node); node.setAttribute('aria-label', it.label + ' ' + d.fmt(it.v));
          if (all || last || i === 0) svg.appendChild(sv('text', { x: x + bw / 2, y: it.v >= 0 ? top - 8 : top + ht + 17, 'text-anchor': 'middle', 'font-size': all ? 13 : 12, 'font-weight': last ? 600 : 400, fill: C.ink }, d.fmt(it.v)));
        }
        if (it.spec) Lab.tip(node, it.spec);
        svg.appendChild(sv('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 13, fill: C.ink2 }, bw < 56 && it.short ? it.short : it.label));
      });
      h.appendChild(svg);
    });
  };

  /* Horizontal bars on one scale with a zero line. rows: [{label, v, text, kind:'hi'|'ctx', spec}] */
  Lab.hbars = function (host, rows, o) {
    o = o || {};
    Lab.chart(host, function (h, w) {
      var rh = 36, labW = Math.min(168, w * 0.38), valW = 84, H = rows.length * rh + 4;
      var vals = rows.map(function (r) { return isNum(r.v) ? r.v : 0; }), max = Math.max.apply(null, vals.concat([0])), min = Math.min.apply(null, vals.concat([0]));
      var x = scale(min, max, labW + (min < 0 ? valW : 0), w - (max > 0 ? valW : 0)), zero = x(0);
      var svg = rootSvg(w, H, (o.name || 'Bars') + ': ' + rows.map(function (r) { return r.label + ' ' + (r.text || ''); }).join('; ') + '.');
      svg.appendChild(sv('line', { x1: zero, x2: zero, y1: 0, y2: H, stroke: C.ink, 'stroke-width': 1 }));
      rows.forEach(function (r, i) {
        var cy = 2 + i * rh + rh / 2, g = sv('g');
        g.appendChild(sv('rect', { x: 0, y: cy - rh / 2, width: w, height: rh, fill: 'transparent' }));
        g.appendChild(sv('text', { x: 0, y: cy + 4.5, 'font-size': 14, fill: C.ink }, r.short && w < 480 ? r.short : r.label));
        if (isNum(r.v)) {
          var xa = x(r.v), bx = Math.min(xa, zero), right = r.v >= 0;
          g.appendChild(sv('rect', { x: bx, y: cy - 8, width: Math.max(2, Math.abs(xa - zero)), height: 16, rx: 2, fill: r.kind === 'hi' ? C.ink : C.greySoft }));
          g.appendChild(sv('text', { x: right ? xa + 8 : xa - 8, y: cy + 4.5, 'text-anchor': right ? 'start' : 'end', 'font-size': 14, 'font-weight': 600, fill: C.ink }, r.text));
        } else g.appendChild(sv('text', { x: zero + 8, y: cy + 4.5, 'font-size': 14, fill: C.ink3 }, r.text || 'n/a'));
        if (r.spec) { Lab.tip(g, function () { return r.spec; }); g.setAttribute('aria-label', r.label + ' ' + (r.text || '')); }
        svg.appendChild(g);
      });
      h.appendChild(svg);
    });
  };

  /* Range bar: ink band, a bone tick for the central case, a cashmere diamond for the visitor's price. */
  Lab.range = function (host, d) {
    Lab.chart(host, function (h, w) {
      var H = 104, bandY = 46, bandH = 16, pad = 14;
      var vs = [d.low, d.mid, d.high].concat(isNum(d.mark) ? [d.mark] : []);
      var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), span = (hi - lo) || 1; lo -= span * 0.1; hi += span * 0.1;
      var x = scale(lo, hi, pad, w - pad), cy = bandY + bandH / 2;
      var svg = rootSvg(w, H, d.name + ': low ' + d.fmt(d.low) + ', central ' + d.fmt(d.mid) + ', high ' + d.fmt(d.high) + (isNum(d.mark) ? '; your price ' + d.fmt(d.mark) : '') + '.');
      svg.appendChild(sv('line', { x1: pad, x2: w - pad, y1: cy, y2: cy, stroke: C.hair }));
      var band = sv('rect', { x: x(d.low), y: bandY, width: Math.max(3, x(d.high) - x(d.low)), height: bandH, rx: 3, fill: C.ink });
      svg.appendChild(band);
      svg.appendChild(sv('line', { x1: x(d.mid), x2: x(d.mid), y1: bandY, y2: bandY + bandH, stroke: C.bone, 'stroke-width': 2 }));
      svg.appendChild(sv('text', { x: x(d.low), y: bandY + bandH + 20, 'text-anchor': x(d.low) < 40 ? 'start' : 'middle', 'font-size': 14, 'font-weight': 600, fill: C.ink }, d.fmt(d.low)));
      svg.appendChild(sv('text', { x: x(d.high), y: bandY + bandH + 20, 'text-anchor': x(d.high) > w - 40 ? 'end' : 'middle', 'font-size': 14, 'font-weight': 600, fill: C.ink }, d.fmt(d.high)));
      svg.appendChild(sv('text', { x: x(d.mid), y: bandY - 9, 'text-anchor': 'middle', 'font-size': 13, fill: C.ink2 }, 'central ' + d.fmt(d.mid)));
      if (isNum(d.mark)) {
        var mx = x(d.mark);
        svg.appendChild(sv('line', { x1: mx, x2: mx, y1: 14, y2: cy - 9, stroke: C.mark, 'stroke-width': 1.5 }));
        svg.appendChild(sv('path', { d: 'M' + mx + ' ' + (cy - 9) + ' l9 9 l-9 9 l-9 -9 z', fill: C.mark, stroke: C.bone, 'stroke-width': 1.5 }));
        svg.appendChild(sv('text', { x: mx, y: 10, 'text-anchor': mx > w - 80 ? 'end' : (mx < 80 ? 'start' : 'middle'), 'font-size': 13, 'font-weight': 600, fill: C.ink }, (d.markLabel || 'your price') + ' ' + d.fmt(d.mark)));
      }
      if (d.spec) { Lab.tip(band, d.spec); band.setAttribute('aria-label', d.name + ' range'); }
      h.appendChild(svg);
    });
  };

  /* Columns for a projected series: held-growth years ink, fade years grey. d: {name, items:[{label, v, spec}], fmt, hiIndex} */
  Lab.years = function (host, d) {
    Lab.chart(host, function (h, w) {
      var H = 170, padT = 24, padB = 26, n = d.items.length, gap = 8, bw = (w - gap * (n - 1)) / n;
      var max = Math.max.apply(null, d.items.map(function (i) { return i.v; })), y = scale(0, max, H - padB, padT);
      var svg = rootSvg(w, H, d.name + ': ' + d.items.map(function (i) { return i.label + ' ' + d.fmt(i.v); }).join(', ') + '.');
      d.items.forEach(function (it, i) {
        var x = i * (bw + gap), hi = d.hiIndex != null && i < d.hiIndex;
        var r = sv('rect', { x: x, y: y(it.v), width: bw, height: Math.max(2, H - padB - y(it.v)), rx: 2, fill: hi ? C.ink : C.greySoft });
        svg.appendChild(r); if (it.spec) { Lab.tip(r, it.spec); r.setAttribute('aria-label', it.label + ' ' + d.fmt(it.v)); }
        svg.appendChild(sv('text', { x: x + bw / 2, y: H - 7, 'text-anchor': 'middle', 'font-size': 13, fill: C.ink2 }, it.label));
        if (i === 0 || i === n - 1) svg.appendChild(sv('text', { x: x + bw / 2, y: y(it.v) - 7, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600, fill: C.ink }, d.fmt(it.v)));
      });
      h.appendChild(svg);
    });
  };

  /* Yield curve, today against a year ago. d: {name, labels, today, ago, fmt, src} */
  Lab.curve = function (host, d) {
    Lab.chart(host, function (h, w) {
      var H = 230, m = { l: 40, r: w < 400 ? 74 : 92, t: 22, b: 30 }, n = d.today.length;
      var all = d.today.concat(d.ago), lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * 0.25 + 0.15; lo -= pad; hi += pad;
      var pw = w - m.l - m.r, ph = H - m.t - m.b;
      function px(i) { return m.l + (i + 0.5) / n * pw; }
      var y = scale(lo, hi, m.t + ph, m.t);
      var svg = rootSvg(w, H, d.name + ': ' + d.labels.map(function (l, i) { return l + ' ' + d.fmt(d.today[i]) + ' today, ' + d.fmt(d.ago[i]) + ' a year ago'; }).join('; ') + '. Arrow keys read each maturity.');
      [lo + pad * 0.6, (lo + hi) / 2, hi - pad * 0.6].forEach(function (t) {
        svg.appendChild(sv('line', { x1: m.l, x2: m.l + pw, y1: y(t), y2: y(t), stroke: C.hair, 'stroke-width': 1 }));
        svg.appendChild(sv('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', 'font-size': 12, fill: C.ink2 }, d.fmt(t, 1)));
      });
      d.labels.forEach(function (l, i) { svg.appendChild(sv('text', { x: px(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600, fill: C.ink2 }, l)); });
      function line(vals, col, wd, dash) { svg.appendChild(sv('polyline', { points: vals.map(function (v, i) { return px(i) + ',' + y(v); }).join(' '), fill: 'none', stroke: col, 'stroke-width': wd, 'stroke-linejoin': 'round', 'stroke-dasharray': dash || null })); }
      line(d.ago, C.grey, 1.5, '5 4'); line(d.today, C.ink, 2);
      d.ago.forEach(function (v, i) { svg.appendChild(sv('circle', { cx: px(i), cy: y(v), r: 3.5, fill: C.greySoft, stroke: C.bone, 'stroke-width': 1.5 })); });
      d.today.forEach(function (v, i) { svg.appendChild(sv('circle', { cx: px(i), cy: y(v), r: i === n - 1 ? 5 : 4, fill: i === n - 1 ? C.mark : C.ink, stroke: C.bone, 'stroke-width': 1.5 })); });
      d.today.forEach(function (v, i) {
        var up = v >= d.ago[i];
        svg.appendChild(sv('text', { x: px(i), y: y(v) + (up ? -10 : 18), 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600, fill: C.ink, 'paint-order': 'stroke', stroke: C.bone, 'stroke-width': 3 }, d.fmt(v)));
        svg.appendChild(sv('text', { x: px(i), y: y(d.ago[i]) + (up ? 18 : -10), 'text-anchor': 'middle', 'font-size': 12, fill: C.ink2, 'paint-order': 'stroke', stroke: C.bone, 'stroke-width': 3 }, d.fmt(d.ago[i])));
      });
      var ty = y(d.today[n - 1]), ay = y(d.ago[n - 1]); if (Math.abs(ty - ay) < 16) { if (ty <= ay) { ty -= 8; ay += 8; } else { ty += 8; ay -= 8; } }
      svg.appendChild(sv('text', { x: px(n - 1) + 22, y: ty + 4, 'font-size': 13, 'font-weight': 600, fill: C.ink }, 'Today'));
      svg.appendChild(sv('text', { x: px(n - 1) + 22, y: ay + 4, 'font-size': 13, fill: C.ink2 }, '1 year ago'));
      scrub(svg, {
        n: n, pos: function (i) { return [px(i), y(d.today[i])]; },
        cursor: function (g, i) { g.appendChild(sv('line', { x1: px(i), x2: px(i), y1: m.t, y2: m.t + ph, stroke: C.grey, 'stroke-width': 1 })); },
        spec: function (i) { return { title: d.labels[i] + ': ' + d.fmt(d.today[i]), def: d.fmt(d.ago[i]) + ' a year ago' }; }
      });
      h.appendChild(svg);
    });
  };

  /* Sorted columns around zero (who grew). items: [{v, title, def}] sorted descending; bars beyond cap are clipped and flagged. */
  Lab.diverge = function (host, items, o) {
    o = o || {};
    Lab.chart(host, function (h, w) {
      var H = o.h || 220, pad = { l: 44, r: 4, t: 14, b: 14 }, n = items.length, gap = 2;
      var abs = items.map(function (i) { return Math.abs(i.v); }).sort(function (a, b) { return a - b; });
      var p95 = abs[Math.floor(0.95 * (abs.length - 1))] || abs[abs.length - 1] || 1, cap = o.cap || p95 * 1.15;
      var mx = Math.min(cap, Math.max.apply(null, items.map(function (i) { return i.v; }).concat([0.0001]))), mn = Math.max(-cap, Math.min.apply(null, items.map(function (i) { return i.v; }).concat([0])));
      var y = scale(mn, mx, H - pad.b, pad.t), zero = y(0), bw = Math.max(1, (w - pad.l - pad.r - gap * (n - 1)) / n);
      var svg = rootSvg(w, H, (o.name || 'Growth') + ': ' + n + ' companies sorted from highest to lowest. Arrow keys read each company.');
      [mx, 0, mn].forEach(function (t) { if (t === mn && mn === 0) return; svg.appendChild(sv('line', { x1: pad.l, x2: w - pad.r, y1: y(t), y2: y(t), stroke: t === 0 ? C.ink : C.hair })); svg.appendChild(sv('text', { x: pad.l - 6, y: y(t) + 4, 'text-anchor': 'end', 'font-size': 12, fill: C.ink2 }, o.axis ? o.axis(t) : String(t))); });
      items.forEach(function (it, i) {
        var v = Math.max(mn, Math.min(mx, it.v)), top = Math.min(y(v), zero), ht = Math.max(1, Math.abs(y(v) - zero));
        svg.appendChild(sv('rect', { x: pad.l + i * (bw + gap), y: top, width: bw, height: ht, fill: it.v >= 0 ? C.ink : C.grey }));
        if (v !== it.v) svg.appendChild(sv('rect', { x: pad.l + i * (bw + gap), y: v > 0 ? top - 4 : top + ht + 1, width: bw, height: 3, fill: C.mark }));
      });
      scrub(svg, {
        n: n, pos: function (i) { return [pad.l + i * (bw + gap) + bw / 2, y(Math.max(mn, Math.min(mx, items[i].v)))]; },
        cursor: function (g, i) { g.appendChild(sv('rect', { x: pad.l + i * (bw + gap) - 1, y: pad.t - 4, width: bw + 2, height: H - pad.t - pad.b + 8, fill: 'none', stroke: C.mark, 'stroke-width': 1.5 })); },
        spec: function (i) { return { title: items[i].title, def: items[i].def }; }
      });
      h.appendChild(svg);
    });
  };

  /* Log-log scatter with a ratio line. pts: [{x, y, kind:'ranked'|'excluded', title, def}]; o: {ratio, xfmt, yfmt, name} */
  Lab.scatter = function (host, pts, o) {
    Lab.chart(host, function (h, w) {
      var H = 300, m = { l: 56, r: 12, t: 12, b: 34 };
      var xs = pts.map(function (p) { return Math.log10(p.x); }), ys = pts.map(function (p) { return Math.log10(p.y); });
      var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs)), y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
      var X = scale(x0, x1, m.l, w - m.r), Y = scale(y0, y1, H - m.b, m.t);
      var svg = rootSvg(w, H, (o.name || 'Scatter') + ': ' + pts.length + ' points on logarithmic axes. Arrow keys read each point, in order of total assets.');
      [[x0, 'x'], [Math.round((x0 + x1) / 2), 'x'], [x1, 'x']].forEach(function (t, ti) { svg.appendChild(sv('text', { x: X(t[0]), y: H - 10, 'text-anchor': ti === 0 ? 'start' : (ti === 2 ? 'end' : 'middle'), 'font-size': 12, fill: C.ink2 }, o.xfmt(Math.pow(10, t[0])))); });
      [y0, Math.round((y0 + y1) / 2), y1].forEach(function (t) { svg.appendChild(sv('line', { x1: m.l, x2: w - m.r, y1: Y(t), y2: Y(t), stroke: C.hair })); svg.appendChild(sv('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', 'font-size': 12, fill: C.ink2 }, o.yfmt(Math.pow(10, t)))); });
      var lr = Math.log10(o.ratio), la = Math.max(x0, y0 - lr), lb = Math.min(x1, y1 - lr);
      if (lb > la) svg.appendChild(sv('line', { x1: X(la), y1: Y(lr + la), x2: X(lb), y2: Y(lr + lb), stroke: C.mark, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
      svg.appendChild(sv('text', { x: w - m.r - 4, y: m.t + 12, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 600, fill: C.ink }, o.ratioLabel));
      pts.forEach(function (p, i) { svg.appendChild(p.kind === 'ranked' ? sv('circle', { cx: X(xs[i]), cy: Y(ys[i]), r: 4, fill: C.ink }) : sv('circle', { cx: X(xs[i]), cy: Y(ys[i]), r: 3.5, fill: 'none', stroke: C.grey, 'stroke-width': 1.5 })); });
      var order = pts.map(function (p, i) { return i; }).sort(function (a, b) { return xs[a] - xs[b]; });
      scrub(svg, {
        n: pts.length, pos: function (k) { var i = order[k]; return [X(xs[i]), Y(ys[i])]; },
        cursor: function (g, k) { var i = order[k]; g.appendChild(sv('circle', { cx: X(xs[i]), cy: Y(ys[i]), r: 8, fill: 'none', stroke: C.mark, 'stroke-width': 1.5 })); },
        spec: function (k) { return pts[order[k]]; }
      });
      h.appendChild(svg);
    });
  };

  /* Generic tablist: o = {list, panels, tabs:[{id,name}], label, minHeight, onChange}. Hash and arrow keys supported. */
  Lab.tabs = function (o) {
    var api = { id: null }; o.list.setAttribute('role', 'tablist'); if (o.label) o.list.setAttribute('aria-label', o.label);
    o.list.textContent = ''; o.panels.textContent = '';
    o.tabs.forEach(function (t, i) {
      var b = el('button', { type: 'button', 'class': 'tab', role: 'tab', id: 'tab-' + t.id, 'aria-controls': 'panel-' + t.id, 'aria-selected': 'false', tabindex: '-1' }, t.name);
      b.addEventListener('click', function () { api.select(t.id, true); });
      b.addEventListener('keydown', function (e) {
        var k = e.key, n = o.tabs.length, j = null;
        if (k === 'ArrowRight') j = (i + 1) % n; else if (k === 'ArrowLeft') j = (i + n - 1) % n; else if (k === 'Home') j = 0; else if (k === 'End') j = n - 1;
        if (j != null) { e.preventDefault(); api.select(o.tabs[j].id, true); Lab.$('tab-' + o.tabs[j].id).focus(); }
      });
      o.list.appendChild(b);
      o.panels.appendChild(el('section', { 'class': 'panel', role: 'tabpanel', id: 'panel-' + t.id, 'aria-labelledby': 'tab-' + t.id, hidden: true, style: o.minHeight ? 'min-height:' + o.minHeight : null }));
    });
    api.select = function (id, push) {
      api.id = id;
      o.tabs.forEach(function (t) { var on = t.id === id, b = Lab.$('tab-' + t.id); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; Lab.$('panel-' + t.id).hidden = !on; });
      if (push) history.replaceState(null, '', location.pathname + location.search + '#' + id);
      close(false); if (o.onChange) o.onChange(id);
    };
    function fromHash() { var h = location.hash.replace('#', ''); return o.tabs.some(function (t) { return t.id === h; }) ? h : null; }
    window.addEventListener('hashchange', function () { var h = fromHash(); if (h) api.select(h, false); });
    api.initial = function () { api.select(fromHash() || o.tabs[0].id, false); };
    return api;
  };

  /* ---------- shell: top bar with five page links, freshness strip, footer ---------- */
  var PAGES = [
    { id: 'today', href: 'index.html', name: 'Today' },
    { id: 'companies', href: 'companies.html', name: 'Companies' },
    { id: 'financing', href: 'financing.html', name: 'Financing' },
    { id: 'deals', href: 'deals.html', name: 'Deals' },
    { id: 'method', href: 'method.html', name: 'Method' }
  ];
  Lab.PAGES = PAGES;
  var FRESH_DAYS = { company: 8, macro: 6, deals: 8 }; /* a source is fine while younger than this */

  Lab.shell = function (o) {
    var body = document.body;
    body.insertBefore(el('a', { 'class': 'skip', href: '#main' }, 'Skip to the content'), body.firstChild);
    var header = el('header', { 'class': 'topbar' });
    var nav = el('nav', { 'class': 'tnav', 'aria-label': 'Lab pages' });
    PAGES.forEach(function (p) { var a = el('a', { href: p.href }, p.name); if (p.id === o.page) a.setAttribute('aria-current', 'page'); nav.appendChild(a); });
    var left = el('div', { 'class': 'tb-left' });
    left.innerHTML = '<a class="logo" href="https://aabdurashidov.ch" aria-label="Asadbek Abdurashidov, main site"><span class="l1">Asadbek</span><span class="l2">ABDURASHIDOV</span></a><a class="seal-mark" href="index.html" aria-label="The Lab, home"><img src="assets/favicon.svg" alt="" width="32" height="32"></a>';
    var right = el('div', { 'class': 'tb-right' });
    right.innerHTML = '<a class="cvlink mainlink" href="https://aabdurashidov.ch">Main site</a><a class="cvlink" href="https://aabdurashidov.ch/cv.pdf">CV</a><button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu"><i><b></b><b></b></i><span>Menu</span></button>';
    header.appendChild(left); header.appendChild(nav); header.appendChild(right);
    var menu = el('nav', { id: 'menu', 'aria-label': 'Lab pages, menu', hidden: true });
    var ul = el('ul');
    PAGES.forEach(function (p) { var a = el('a', { href: p.href }, p.name); if (p.id === o.page) a.setAttribute('aria-current', 'page'); ul.appendChild(el('li', null, a)); });
    menu.appendChild(ul); menu.appendChild(el('hr'));
    menu.appendChild(el('div', { 'class': 'alt' }, [el('a', { href: 'https://aabdurashidov.ch' }, 'Main site'), el('a', { href: 'https://aabdurashidov.ch/cv.pdf' }, 'CV')]));
    var strip = el('div', { 'class': 'strip' }, el('div', { 'class': 'wrap' }, [
      el('span', { id: 'status-host' }, el('span', { 'class': 'status' }, [el('span', { 'class': 'dot', 'aria-hidden': 'true' }), el('span', null, 'Updated \u2013 \u00b7 \u2013 of \u2013 sources fine')])),
      o.crumb ? el('a', { 'class': 'crumb', href: o.crumb[1] }, o.crumb[0]) : null
    ]));
    var main = document.getElementById('main');
    body.insertBefore(header, main); body.insertBefore(menu, main); body.insertBefore(strip, main);
    body.appendChild(el('footer', { 'class': 'foot' }, el('div', { 'class': 'wrap' }, [
      el('div', { 'class': 'fl' }, [el('a', { href: 'method.html' }, 'Method and sources'), el('a', { href: 'https://aabdurashidov.ch' }, 'Main site'),
        /* the owner's way back: a frozen copy of the previous Lab in v1/ (tools/freeze_v1.py), on the same public data */
        el('a', { href: 'v1/', 'class': 'v1link' }, 'Previous version (v1)')]),
      el('span', null, 'Not investment advice. Figures come from public filings and official statistics, each with its date.')
    ])));
    var btn = right.querySelector('.menu-btn');
    function setMenu(open) { btn.setAttribute('aria-expanded', open ? 'true' : 'false'); menu.hidden = !open; }
    btn.addEventListener('click', function (e) { setMenu(menu.hidden); e.stopPropagation(); });
    document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); btn.focus(); } });
  };

  /* Freshness strip, driven by status.json: run.built_at and one row per source. Arguments are ignored (kept for old callers). */
  var STALE_WORDS = { fresh: 'fine', stale: 'stale', failed: 'failed' };
  Lab.status = function () {
    var host = Lab.$('status-host'); if (!host) return Promise.resolve();
    return Lab.load('status').then(function (s) {
      var built = String(s.run.built_at), srcs = s.sources, bad = srcs.filter(function (x) { return x.state !== 'fresh'; }), fine = srcs.length - bad.length;
      var d = parseDate(built), now = new Date(), fresh = d && (now - d) / 36e5 < 24;
      Lab.rememberBuild(built);
      var txt = ['Updated ', el('b', null, Lab.stamp(built)), ' · ' + fine + ' of ' + srcs.length + ' ', el('span', { 'class': 'w-src' }, 'sources '), 'fine'];
      if (bad.length) { var x = bad[0], nm = x.label.charAt(0).toLowerCase() + x.label.slice(1); txt.push(' · ' + nm + ' ' + (STALE_WORDS[x.state] || x.state) + (x.newest_data ? ' since ' + Lab.date(x.newest_data) : '')); }
      var b = el('button', { type: 'button', 'class': 'status' + (fresh && !reduced ? ' pulse' : '') }, [el('span', { 'class': 'dot', 'aria-hidden': 'true' }), el('span', null, txt)]);
      Lab.tip(b, { title: 'When each source was built', def: 'The nightly run writes status.json with one row per source: its state and the date of its newest data. A source is fine while its state is fresh; anything else is named in the strip and stays visible with its date.', working: srcs.map(function (x) { return x.label + ': ' + (STALE_WORDS[x.state] || x.state) + ', newest data ' + Lab.date(x.newest_data) + (x.stale_series && x.stale_series.length ? ', stale series ' + x.stale_series.join(', ') : ''); }).join('. ') + '.', source: 'status.json, run built ' + Lab.stamp(built) + (s.run.git_commit ? ', commit ' + s.run.git_commit.slice(0, 7) : '') + '.', more: 'method.html#pipeline' });
      host.textContent = ''; host.appendChild(b);
      return s;
    });
  };

  /* the failure state: names the last good build and offers a retry */
  Lab.fail = function (err) {
    var m = Lab.$('main'); if (!m) return;
    var last = Lab.lastBuild();
    m.textContent = '';
    var retry = el('button', { type: 'button', 'class': 'btn' }, 'Try again');
    retry.addEventListener('click', function () { location.reload(); });
    m.appendChild(el('div', { 'class': 'wrap empty', role: 'alert' }, [
      el('h1', { 'class': 'statement' }, 'The data did not load.'),
      el('p', { 'class': 'lede' }, (last ? 'Last good build: ' + Lab.stamp(last) + '. ' : 'No earlier build is remembered in this browser. ') + 'The data folder must be served next to this page.'),
      retry
    ]));
    var h = Lab.$('status-host'); if (h) h.textContent = last ? 'Last good build ' + Lab.stamp(last) : 'No build date available';
  };

  root.Lab = Lab;
})(window);
