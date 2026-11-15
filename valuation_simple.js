/* The simple view of the valuation page: one statement, one chart and three assumptions.
   The chart shows the sales that the company reported, the path of this forecast, and the path that the share
   price needs. The view calculates nothing. It reads the context that the controller gives to each view, and its
   levers set inputs of the same form as the detailed steps (ctx.setInput). */
(function () {
  'use strict';
  const L = window.Lab, M = window.DetailedMath, el = L.el, sv = L.sv, finite = M.finite;
  const perShare = v => !finite(v) ? '—' : '$' + (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2));
  const pct = percent => L.pct(percent / 100, 1);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round = (v, step) => Number((Math.round(v / step) * step).toFixed(4));
  const axisMoney = v => L.usd(v).replace(/\.0+(?=[a-z])/, '');
  /* Round steps for an axis from 0 to hi with about n intervals. */
  function step(hi, n) {
    const raw = hi / Math.max(1, n), power = Math.pow(10, Math.floor(Math.log10(raw))), unit = raw / power;
    return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
  }
  /* The reported years of a company: sales, yearly growth and operating margin, in percent. */
  function history(company) {
    const years = ((company && company.history && company.history.years) || []).filter(y => finite(y.revenue) && y.revenue > 0)
      .slice().sort((a, b) => String(a.end).localeCompare(String(b.end)));
    // A yearly change counts only between two fiscal years that follow each other (year ends 350 to 380 days apart),
    // as in the growth seed of CompanyInputs. A change across a missing year is not annual growth.
    const follows = (a, b) => { const days = (Date.parse(b.end) - Date.parse(a.end)) / 864e5; return days >= 350 && days <= 380; };
    return {years, growths: years.slice(1).map((y, i) => follows(years[i], y) ? (y.revenue / years[i].revenue - 1) * 100 : null).filter(v => v != null),
      margins: years.filter(y => finite(y.operating_income)).map(y => y.operating_income / y.revenue * 100),
      lastYear: years.length ? Number(String(years[years.length - 1].end).slice(0, 4)) : new Date().getFullYear()};
  }

  /* An engraved band, as on a share certificate: sine lines of one family with shifted phases. Decoration only. */
  function engraving(width, height) {
    const svg = sv('svg', {class: 'vs-engraving', viewBox: '0 0 ' + width + ' ' + height, width, height, 'aria-hidden': 'true', focusable: 'false'});
    const lines = 26, points = Math.max(60, Math.round(width / 9)), mid = height * .46, wave = Math.max(320, width / 3.2);
    for (let k = 0; k < lines; k++) {
      const phase = k / lines * Math.PI * 2; let d = '';
      for (let i = 0; i <= points; i++) {
        const x = i / points * width, swell = .35 + .65 * Math.pow(Math.sin(Math.PI * x / width), 2);
        const y = mid + Math.sin(x / wave * Math.PI * 2 + phase) * height * .2 * swell + Math.sin(x / wave * Math.PI * 6 + phase * 2) * height * .035;
        d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      svg.append(sv('path', {d}));
    }
    return svg;
  }

  function mount(host, about) {
    const h = history(about.company), name = L.shortName(about.company.name);
    const says = el('h2', {class: 'vs-says'});
    // The chart takes the keyboard focus. The arrow keys then read one year at a time, as the pointer does.
    const plot = el('div', {class: 'vs-plot', tabindex: '0', role: 'group', 'aria-label': 'Sales by year. The left and right arrow keys read one year.'});
    const HINT = (window.matchMedia && window.matchMedia('(hover: none)').matches ? 'Tap a year' : 'Point at a year') + ' to read both paths. Pull the end of the white line, or move a slider.';
    const KEYS = 'Press the left or the right arrow key to read a year.';
    const readout = el('p', {class: 'vs-readout'});
    const inner = el('div', {class: 'ws-wrap'}, [says, plot, readout]), stage = el('div', {class: 'vs-stage'}, inner);
    const worth = el('p', {class: 'vs-worth'}), scale = el('div', {class: 'vs-scale', role: 'img'});
    const foot = el('p', null, 'From the annual filing to ' + L.date(about.period) + '. Not investment advice.');
    const button = (text, run, more) => { const b = el('button', {type: 'button', class: 'vs-link', ...more}, text); b.addEventListener('click', run); return b; };
    // These buttons stay in place across redraws, so the focus can return to the one that opened the inputs.
    const placeholder = button('', () => ctx.editAssumptions(ctx.assumed[0])), reset = button('Reset', () => ctx.reset());
    const links = el('div', {class: 'vs-links'}, [button('See how the value is built', () => ctx.showStep('business')),
      button('All inputs and sources', () => ctx.editAssumptions(), {'data-open-assumptions': 'simple'}), placeholder, reset]);
    let ctx = null, intro = !L.reduced, hover = -1, domain = null, geometry = null, tall = 0, fitted = '';

    /* One slider: its name, its value, what the last years gave (a band) and what the price needs (a brass mark). */
    function lever(spec) {
      const input = el('input', {class: 'vs-range', type: 'range', step: .1, 'aria-label': spec.label});
      const value = el('output', {class: 'vs-value'}), band = el('i', {class: 'vs-band', hidden: true}), need = el('i', {class: 'vs-need', hidden: true}), note = el('p', {class: 'vs-note'});
      const node = el('div', {class: 'vs-lever'}, [el('span', {class: 'vs-name'}, spec.name), value, el('div', {class: 'vs-track'}, [band, input, need]), note]);
      input.addEventListener('input', () => spec.set(Number(input.value)));
      return {node, show(v, o) {
        input.min = String(o.min); input.max = String(o.max); input.value = String(v); input.disabled = !!o.disabled;
        value.textContent = pct(v);
        const at = x => clamp((x - o.min) / (o.max - o.min), 0, 1), inside = finite(o.need) && o.need >= o.min && o.need <= o.max;
        need.hidden = !inside; if (inside) need.style.setProperty('--at', String(at(o.need)));
        band.hidden = !o.band; if (o.band) { band.style.setProperty('--from', String(at(o.band[0]))); band.style.setProperty('--to', String(at(o.band[1]))); }
        // A band that leaves the scale shows only a part of its range. It fades at that end, and the key line gives the range in figures.
        const cutLow = !!o.band && o.band[0] < o.min - 1e-9, cutHigh = !!o.band && o.band[1] > o.max + 1e-9;
        band.classList.toggle('is-cut-low', cutLow); band.classList.toggle('is-cut-high', cutHigh);
        note.textContent = o.note;
        return {mark: inside, cut: cutLow || cutHigh};
      }};
    }
    const growth = lever({name: 'Sales growth a year', label: 'Sales growth a year, years one to five, percent', set: v => ctx.setInput('growth', v)});
    const margin = lever({name: 'Operating margin in ten years', label: 'Operating margin in year ten, percent', set: v => ctx.setInput('targetMargin', v)});
    // The discount rate is not an input of its own. The lever moves beta, the one free term of the cost of equity.
    const weights = () => ({equity: ctx.w.equityWeight, debtPart: ctx.w.debtWeight * ctx.capital.costDebt * (1 - ctx.capital.debtTaxRate)});
    const rateAt = beta => { const w = weights(); return (w.equity * (ctx.capital.riskFree + beta * ctx.capital.erp) + w.debtPart) * 100; };
    const betaFor = rate => { const w = weights(); return ((rate / 100 - w.debtPart) / w.equity - ctx.capital.riskFree) / ctx.capital.erp; };
    const rate = lever({name: 'Return investors ask for', label: 'Return that investors ask for, percent a year',
      set: v => ctx.setInput('beta', Number(Math.max(0, betaFor(v)).toFixed(4)))});
    // One line names the two marks of the sliders. It states the condition of the brass mark once, so the notes stay short.
    const keyBandText = el('span'), keyBand = el('span', null, [el('i', {class: 'vs-key-band', 'aria-hidden': 'true'}), keyBandText]);
    const keyNeed = el('span', null, [el('i', {class: 'vs-key-need', 'aria-hidden': 'true'}), 'what the price needs, if the other two stay']);
    const key = el('p', {class: 'vs-key'}, [keyBand, keyNeed]);
    const levers = el('div', {class: 'vs-levers'}, [growth.node, margin.node, rate.node, el('div', {class: 'vs-result'}, [worth, scale]), key]);
    const below = el('div', {class: 'ws-wrap vs-below'}, [levers, el('div', {class: 'vs-foot'}, [foot, links])]);
    host.replaceChildren(stage, below);

    function drawEngraving() {
      const old = stage.querySelector('.vs-engraving'), width = stage.clientWidth, height = stage.clientHeight;
      if (!width || !height || (old && old.getAttribute('width') === String(width) && old.getAttribute('height') === String(height))) return;
      if (old) old.remove();
      stage.prepend(engraving(width, height));
    }

    /* The calendar year of forecast year t. The model discounts from the valuation date, and forecast year 1 ends one
       year after that date (the note of the valuation date says so). So the years of the forecast count from the
       valuation date, not from the last filing: a filing of last year leaves a gap of one year on the axis. */
    const forecastYear = t => { const start = Number(String(ctx.valuationDate || '').slice(0, 4)); return (Number.isInteger(start) && start > 0 ? start : h.lastYear) + t; };
    /* The height of the chart on a wide screen: a base height, plus the free height of the window while the sliders
       still end on the first screen. So a taller window shows a taller chart, up to a limit. The height is set when
       the view opens, when the window changes its size, and when the statement changes its number of lines (the chart
       then takes or gives that room, so the sliders stay in their place). A move of a slider alone does not set it
       again, so the chart does not change its size under the pointer. */
    const BASE = 300, MOST = 430, fitKey = () => window.innerWidth + 'x' + window.innerHeight + '|' + says.offsetHeight;
    function fit() {
      // The plot is never an empty box (it has a least height of 1 px), so its margins do not collapse before the first chart.
      const now = plot.offsetHeight, end = levers.getBoundingClientRect().bottom + window.scrollY - now + BASE;
      tall = Math.round(clamp(BASE + window.innerHeight - end - 16, BASE, MOST)); fitted = fitKey();
    }
    function chart() {
      const width = plot.clientWidth || 1000, phone = width < 620;
      if (!phone && fitted !== fitKey()) fit();
      const height = phone ? 250 : tall;
      const pad = {l: 0, r: phone ? 6 : 168, t: phone ? 46 : 26, b: 30}, w = width - pad.l - pad.r, ht = height - pad.t - pad.b;
      const past = h.years.map(y => ({year: Number(String(y.end).slice(0, 4)), value: y.revenue}));
      const mine = ctx.d.rows.map(r => r.revenue * 1e6), theirs = ctx.implied && ctx.implied.ok ? ctx.implied.comparison.map(r => r.impliedRevenue * 1e6) : null;
      const n = past.length, slots = n + mine.length, slot = w / slots, x = i => pad.l + (i + .5) * slot;
      const start = n ? past[n - 1].value : ctx.p.revenue * 1e6;
      const most = Math.max(start, ...past.map(p => p.value), ...mine, ...(theirs || [0])), unit = step(most, 3), hi = Math.ceil(most * 1.02 / unit) * unit;
      const y = v => pad.t + ht - v / hi * ht, firstForecast = forecastYear(1), yearAt = i => i < n ? past[i].year : firstForecast + (i - n);
      const svg = sv('svg', {viewBox: '0 0 ' + width + ' ' + height, width, height, role: 'img',
        'aria-label': 'Sales of ' + name + ': ' + (n ? n + ' reported years, then ' : '') + 'ten years of this forecast' + (theirs ? ', and the path that the share price needs.' : '.')});
      for (let v = unit; v <= hi + unit * 1e-6; v += unit) svg.append(sv('line', {class: 'vs-grid', x1: pad.l, x2: pad.l + w, y1: y(v), y2: y(v)}), sv('text', {class: 'vs-axis', x: pad.l, y: y(v) - 6}, axisMoney(v)));
      svg.append(sv('line', {class: 'vs-base', x1: pad.l, x2: pad.l + w, y1: y(0), y2: y(0)}));
      past.forEach((p, i) => svg.append(sv('rect', {class: 'vs-bar', x: x(i) - slot * .29, width: slot * .58, y: y(p.value), height: Math.max(1, y(0) - y(p.value))})));
      for (let i = 0; i < slots; i++) if (!phone || i === 0 || i === n - 1 || i === slots - 1) svg.append(sv('text', {class: 'vs-year', x: x(i), y: height - 8, 'text-anchor': 'middle'}, String(yearAt(i))));
      const origin = n ? [x(n - 1), y(start)] : null;
      const line = list => 'M' + [...(origin ? [origin] : []), ...list.map((v, i) => [x(n + i), y(v)])].map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
      const met = Math.abs(ctx.e.perShare / ctx.price - 1) <= .005;
      if (theirs && !met) svg.append(sv('path', {class: 'vs-gap', d: line(theirs) + 'L' + mine.map((v, i) => [x(n + i), y(v)]).reverse().map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z'}));
      if (theirs) svg.append(sv('path', {class: 'vs-line vs-theirs' + (intro ? ' vs-draw' : ''), d: line(theirs), pathLength: 1}));
      svg.append(sv('path', {class: 'vs-line vs-mine' + (intro ? ' vs-draw' : ''), d: line(mine), pathLength: 1}));
      mine.slice(0, -1).forEach((v, i) => svg.append(sv('circle', {class: 'vs-dot', cx: x(n + i), cy: y(v), r: 2.6})));
      // End labels keep apart when the two paths end close together.
      const ends = [{cls: 'vs-mine', value: mine[mine.length - 1], text: 'this forecast'}, ...(theirs ? [{cls: 'vs-theirs', value: theirs[theirs.length - 1], text: 'what the price needs'}] : [])].map(e => ({...e, at: y(e.value)}));
      if (phone) {
        /* On a narrow chart the labels sit over the plot, at the right edge. Each label looks at the part of the two
           lines that lies under its own width. The label of the upper end goes above that part. The label of the lower
           end goes below that part when there is room above the base line. Else the two labels stack above the lines
           when there is room, and else the lower label goes above its own end. */
        const reach = e => { const width = Math.max(L.usd(e.value).length * 10.5, e.text.length * 6.8) + 8, from = Math.max(0, mine.length - 1 - Math.ceil(width / slot));
          const ys = [...mine.slice(from), ...(theirs ? theirs.slice(from) : [])].map(y); return {top: Math.min(...ys), bottom: Math.max(...ys)}; };
        const order = ends.slice().sort((a, b) => a.at - b.at), upper = reach(order[0]);
        order[0].ly = Math.max(14, upper.top - 38);
        if (order[1]) {
          const lower = reach(order[1]), top = Math.min(upper.top, lower.top);
          if (lower.bottom + 48 <= y(0) - 4) order[1].ly = lower.bottom + 22;
          else if (top - 82 >= 14) { order[0].ly = top - 82; order[1].ly = top - 38; }
          else order[1].ly = Math.min(Math.max(order[1].at - 38, order[0].ly + 44), y(0) - 30);
        }
      } else {
        if (ends.length === 2 && Math.abs(ends[0].at - ends[1].at) < 44) { const middle = (ends[0].at + ends[1].at) / 2, upper = ends[0].at <= ends[1].at ? 0 : 1; ends[upper].at = middle - 22; ends[1 - upper].at = middle + 22; }
        ends.forEach(e => { e.ly = clamp(e.at, 14, height - 44); });
      }
      ends.forEach(e => { const lx = phone ? x(slots - 1) : x(slots - 1) + 18, anchor = phone ? 'end' : 'start';
        svg.append(sv('text', {class: 'vs-end ' + e.cls, x: lx, y: e.ly + 4, 'text-anchor': anchor}, L.usd(e.value)), sv('text', {class: 'vs-end-note', x: lx, y: e.ly + 22, 'text-anchor': anchor}, e.text)); });
      if (n) svg.append(sv('text', {class: 'vs-axis', x: x(n - 1) + slot * .29, y: pad.t - 10, 'text-anchor': 'end'}, 'reported'), sv('text', {class: 'vs-axis', x: x(n), y: pad.t - 10, 'text-anchor': 'start'}, 'forecast'));
      // The read-out of one year: a guide line and a mark on each path. The pointer moves them; nothing is drawn again.
      const guide = sv('line', {class: 'vs-guide', y1: pad.t, y2: y(0), visibility: 'hidden'}), markMine = sv('circle', {class: 'vs-mark vs-mine', r: 4.5, visibility: 'hidden'}), markTheirs = sv('circle', {class: 'vs-mark vs-theirs', r: 4.5, visibility: 'hidden'});
      // The handle at the end of this forecast. A pull up or down changes the growth rate.
      const end = {cx: x(slots - 1), cy: y(mine[mine.length - 1]), 'aria-hidden': 'true'};
      svg.append(guide, markTheirs, markMine, sv('circle', {...end, class: 'vs-handle' + (ctx.annual ? ' is-off' : ''), r: 18}), sv('circle', {...end, class: 'vs-knob', r: 7}));
      geometry = {svg, n, slots, slot, x, y, pad, past, mine, theirs, yearAt, guide, markMine, markTheirs, ht};
      plot.replaceChildren(svg); intro = false;
      point(hover);
    }
    /* Show the values of one year, or a hint when no year is selected. A screen reader skips the hint:
       the label of the chart already names the keys. */
    function point(index) {
      const g = geometry; hover = index;
      if (!g) return;
      const on = index >= 0 && index < g.slots, show = (node, yes) => node.setAttribute('visibility', yes ? 'visible' : 'hidden');
      show(g.guide, on);
      if (!on) { show(g.markMine, false); show(g.markTheirs, false); readout.replaceChildren(el('span', {'aria-hidden': 'true'}, plot.matches(':focus-visible') ? KEYS : HINT)); return; }
      g.guide.setAttribute('x1', g.x(index)); g.guide.setAttribute('x2', g.x(index));
      if (index < g.n) { show(g.markMine, false); show(g.markTheirs, false); readout.textContent = g.yearAt(index) + ': sales of ' + L.usd(g.past[index].value) + ', as reported.'; return; }
      const k = index - g.n, mine = g.mine[k], theirs = g.theirs ? g.theirs[k] : null;
      g.markMine.setAttribute('cx', g.x(index)); g.markMine.setAttribute('cy', g.y(mine)); show(g.markMine, true);
      show(g.markTheirs, theirs != null);
      if (theirs != null) { g.markTheirs.setAttribute('cx', g.x(index)); g.markTheirs.setAttribute('cy', g.y(theirs)); }
      readout.textContent = g.yearAt(index) + ': this forecast ' + L.usd(mine) + (theirs != null ? ', the price needs ' + L.usd(theirs) + '.' : '.');
    }
    const slotAt = event => { const box = plot.getBoundingClientRect(), index = Math.floor((event.clientX - box.left - geometry.pad.l) / geometry.slot); return index >= 0 && index < geometry.slots ? index : -1; };
    // A mouse reads the year under it. A finger that moves over the chart scrolls the page, so a tap selects the year.
    plot.addEventListener('pointermove', event => { if (geometry && !plot.dataset.pulling && event.pointerType !== 'touch') point(slotAt(event)); });
    plot.addEventListener('pointerleave', event => { if (!plot.dataset.pulling && event.pointerType !== 'touch') point(-1); });
    plot.addEventListener('click', event => { if (geometry && !plot.dataset.pulling) point(slotAt(event)); });
    // The keyboard: left and right move one year, Home and End go to the first and the last year, Escape clears.
    plot.addEventListener('keydown', event => {
      const g = geometry;
      if (!g || event.altKey || event.ctrlKey || event.metaKey || (event.key === 'Escape' && hover < 0)) return;
      const firstForecast = g.n < g.slots ? g.n : 0;
      const next = {ArrowRight: hover < 0 ? firstForecast : Math.min(hover + 1, g.slots - 1), ArrowLeft: hover < 0 ? g.slots - 1 : Math.max(hover - 1, 0),
        Home: 0, End: g.slots - 1, Escape: -1}[event.key];
      if (next === undefined) return;
      event.preventDefault(); point(next);
    });
    // A screen reader says the read-out while the chart has the focus. The pointer does not make it speak.
    plot.addEventListener('focus', () => { readout.setAttribute('aria-live', 'polite'); if (hover < 0) point(-1); });
    plot.addEventListener('blur', () => { readout.removeAttribute('aria-live'); point(-1); });
    plot.addEventListener('pointerdown', event => {
      if (!event.target.classList || !event.target.classList.contains('vs-handle') || ctx.annual || event.button) return;
      event.preventDefault();
      const startY = event.clientY, startValue = ctx.p.growth * 100, perPixel = (domain.growth[1] - domain.growth[0]) / (geometry.ht * 1.6);
      plot.dataset.pulling = 'true'; document.documentElement.dataset.pulling = 'true'; point(-1);
      const move = e => { const next = clamp(round(startValue + (startY - e.clientY) * perPixel, .1), domain.growth[0], domain.growth[1]); if (next !== round(ctx.p.growth * 100, .1)) ctx.setInput('growth', next); };
      const end = () => { delete plot.dataset.pulling; delete document.documentElement.dataset.pulling;
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    });

    function update(next) {
      ctx = next;
      const strong = (text, priced) => el('strong', priced ? {class: 'vs-priced'} : null, text);
      const value = ctx.e.perShare, price = ctx.price, year = forecastYear(ctx.d.rows.length), mineEnd = L.usd(ctx.d.rows[ctx.d.rows.length - 1].revenue * 1e6);
      const needs = ctx.implied && ctx.implied.ok ? ctx.implied.growth * 100 : null;
      // The growth search gives a list of solutions only when it ran: empty for none in its range, longer for several.
      // Without a list the search did not run, and the statement must not say that no growth rate exists.
      const searched = !!ctx.implied && Array.isArray(ctx.implied.solutions), several = searched && ctx.implied.solutions.length > 1;
      const impliedRate = ctx.sanity && ctx.sanity.ok && finite(ctx.sanity.impliedRate) ? ctx.sanity.impliedRate * 100 : null;
      // same: the forecast gives the price to the cent. close: within half a percent. A close forecast states both amounts.
      const same = Math.round(value * 100) === Math.round(price * 100), close = Math.abs(value / price - 1) <= .005;
      const exact = v => '$' + v.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      const apart = perShare(value) !== perShare(price), reach = ['It reaches sales of ', strong(mineEnd), ' in ' + year + '.'];
      says.replaceChildren(...(same ? ['This forecast gives the price of ', strong(perShare(price), true), ' a share. ', ...reach] :
        close ? ['This forecast gives ', strong(apart ? perShare(value) : exact(value)), ' a share, close to the price of ', strong(apart ? perShare(price) : exact(price), true), '. ', ...reach] :
        needs != null ? ['At ', strong(perShare(price), true), ' a share, the price needs sales of ', strong(L.usd(ctx.implied.comparison[ctx.implied.comparison.length - 1].impliedRevenue * 1e6), true), ' in ' + year + '. This forecast reaches ', strong(mineEnd), '.'] :
        ['This forecast reaches sales of ', strong(mineEnd), ' in ' + year + '. ', ctx.annual ? 'With annual inputs, the model does not solve the growth for the price of ' : several ? 'More than one growth rate gives the price of ' :
          searched ? 'No growth rate from −50% to 100% gives the price of ' : 'The model cannot solve the growth for the price of ', strong(perShare(price), true), '.']));
      /* The ranges of the growth and margin sliders. The first range holds the range of the last years, when that
         range is moderate (growth −30% to 60%, margin −40% to 80%); a wider past range leaves the scale.
         A range grows when a value of the model leaves it, and it does not shrink, so a slider stays steady. */
      const up = (v, s) => Math.ceil(v / s) * s, down = (v, s) => Math.floor(v / s) * s, g = ctx.p.growth * 100, m = ctx.p.targetMargin * 100;
      const span = list => list.length >= 2 ? [Math.min(...list), Math.max(...list)] : null, off = ctx.annual;
      const past = {growth: span(h.growths), margin: span(h.margins)};
      const first = (range, band, low, high, s) => band ? [Math.min(range[0], Math.max(low, down(band[0], s))), Math.max(range[1], Math.min(high, up(band[1], s)))] : range;
      domain = domain || {growth: first([-5, 40], past.growth, -30, 60, 5), margin: first([0, 60], past.margin, -40, 80, 10)};
      // The range also holds the growth that the price needs, with a little room, so that its brass mark is on the track.
      domain.growth = [Math.min(domain.growth[0], down(Math.min(g, needs == null ? g : Math.max(needs - 4, -50)), 5)), Math.max(domain.growth[1], up(Math.max(g, needs == null ? g : Math.min(needs + 4, 100)), 5))];
      domain.margin = [Math.min(domain.margin[0], down(m, 10)), Math.max(domain.margin[1], up(m + 5, 10))];
      // What the price needs is true while the other two sliders stay: the key line under the sliders says so.
      // When the growth search did not run, the note gives the reason of the model.
      const notRun = !off && ctx.implied && !ctx.implied.ok && !searched ? ctx.implied.reason || '' : '';
      const growthShown = growth.show(round(g, .1), {min: domain.growth[0], max: domain.growth[1], need: needs, band: past.growth, disabled: off,
        note: off ? 'The ten annual inputs are active. Change them in the inputs.' : 'For five years, then it fades. ' + (needs == null ? notRun : 'The price needs ' + pct(needs) + '.')});
      const marginShown = margin.show(round(m, .1), {min: domain.margin[0], max: domain.margin[1], band: past.margin, disabled: off,
        note: off ? 'The ten annual inputs are active.' : h.margins.length ? 'Last year it was ' + pct(h.margins[h.margins.length - 1]) + '.' : 'The share of sales left as operating profit.'});
      // The rate slider covers a beta from 0 to 3, and the rate of the model when that rate lies outside. Its range follows the model.
      const now = round(ctx.p.rate * 100, .1);
      const rateShown = rate.show(now, {min: Math.min(Math.ceil(rateAt(0) * 10) / 10, now), max: Math.max(Math.floor(rateAt(3) * 10) / 10, now), need: impliedRate,
        note: 'Each year. ' + (impliedRate == null ? '' : 'The price needs ' + pct(impliedRate) + '.')});
      // The key line. A band that leaves its scale is not the whole range, so the key then gives that range in figures.
      const beyond = [[growthShown.cut, 'growth', past.growth], [marginShown.cut, 'margin', past.margin]].filter(x => x[0]).map(x => x[1] + ' ' + pct(x[2][0]) + ' to ' + pct(x[2][1]));
      keyBandText.textContent = 'range of the last ' + L.word(h.years.length) + ' years' + (beyond.length ? ' (beyond this scale: ' + beyond.join(', ') + ')' : '');
      keyBand.hidden = !past.growth && !past.margin; keyNeed.hidden = !growthShown.mark && !rateShown.mark; key.hidden = keyBand.hidden && keyNeed.hidden;
      worth.replaceChildren('On this forecast one share is worth ', el('strong', null, perShare(value)), '.');
      // One small scale: where this forecast puts a share, and where the market puts it.
      const top = Math.max(value, price) * 1.12, at = v => clamp(v / top * 100, 0, 100);
      const mark = (cls, v, text) => el('div', {class: 'vs-mark-row ' + cls + (at(v) > 60 ? ' is-right' : ''), style: 'left:' + at(v) + '%'}, [el('b'), el('span', null, text)]);
      scale.replaceChildren(el('i', {class: 'vs-scale-gap', style: 'left:' + Math.min(at(value), at(price)) + '%;width:' + Math.abs(at(value) - at(price)) + '%'}),
        mark('is-worth', value, perShare(value) + ' this forecast'), mark('is-price', price, perShare(price) + ' the price'));
      scale.setAttribute('aria-label', 'This forecast puts a share at ' + perShare(value) + '. The price is ' + perShare(price) + '.');
      const assumed = (ctx.assumed || []).length;
      // The same words as the count beside the result of the detailed path.
      placeholder.hidden = !assumed; placeholder.textContent = assumed + ' provisional input' + (assumed === 1 ? '' : 's') + ' to review';
      reset.hidden = !ctx.changed;
      // The chart comes last: its height depends on where the sliders end, and the texts above are now in place.
      chart();
      drawEngraving();
    }
    // The stage has no size while the simple view is hidden. When the view opens again, the chart measures its height again:
    // the fonts or the statement can have changed in the meantime.
    let hidden = false;
    new ResizeObserver(() => {
      if (!host.offsetParent) { hidden = true; return; }
      const back = hidden; hidden = false;
      if (back) fitted = '';
      if (ctx && geometry && (back || Number(geometry.svg.getAttribute('width')) !== plot.clientWidth)) { chart(); drawEngraving(); }
    }).observe(stage);
    // The texts take their final size when the fonts are ready, and the window can change its height alone. The chart then fits itself again.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitted = ''; if (ctx && host.offsetParent) { chart(); drawEngraving(); } });
    window.addEventListener('resize', () => { if (ctx && host.offsetParent && fitted !== fitKey()) { chart(); drawEngraving(); } });
    return {update};
  }

  window.ValuationSimple = {mount, history};
})();
