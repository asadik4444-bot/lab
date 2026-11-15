/* Shared valuation graphics: chart parts, the workspace views and the buyout view.
   Model amounts are in USD millions. The Lab formatters turn them into $bn and $tn. */
(function () {
  'use strict';
  const L = window.Lab, M = window.DetailedMath, el = L.el;
  // Navy is this forecast. Slate and tan are other series. Brass is kept for the share price and what it needs.
  const C = { ink: '#14213d', slate: '#7c8aa3', tan: '#c9b48f', brass: '#9c7345', line: '#d9d8d2', muted: '#59677b' };
  const num = x => M.finite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—';
  const money = x => M.finite(x) ? L.usd(x * 1e6) : '—';                      // USD millions in, "$2.96tn" out
  const usd = x => M.finite(x) ? '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  // Percentages print the same minus sign as the Lab formatters (U+2212).
  const pct1 = x => M.finite(x) ? (x * 100).toFixed(1).replace('-', '−') + '%' : '—';
  const pct2 = x => M.finite(x) ? (x * 100).toFixed(2).replace('-', '−') + '%' : '—';

  /* Round axis steps (1, 2, 2.5, 5 × a power of ten) from lo to hi. */
  function niceTicks(lo, hi, count = 4) {
    if (!(hi > lo)) hi = lo + 1;
    const raw = (hi - lo) / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    const min = Math.floor(lo / step + 1e-9) * step, max = Math.ceil(hi / step - 1e-9) * step, ticks = [];
    for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : Number(v.toPrecision(12)));
    return { ticks, min, max, step };
  }
  /* One unit for a whole axis of USD-million amounts, so the labels read $100bn, $200bn, $300bn. */
  function moneyAxis(maxAbs) {
    const [div, unit] = maxAbs >= 1e6 ? [1e6, 'tn'] : maxAbs >= 1e3 ? [1e3, 'bn'] : [1, 'mn'];
    return { unit: 'USD ' + unit, label: v => v === 0 ? '$0' : (v < 0 ? '−' : '') + '$' + Number((Math.abs(v) / div).toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 2 }) + unit };
  }
  const perShareAxis = v => (v < 0 ? '−' : '') + '$' + Number(Math.abs(v).toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 2 });

  function caption(title, sub) {
    return el('div', { class: 'vv-caption' }, el('div', null, [el('h3', null, title), el('p', null, sub)]));
  }
  function chartBox(title, sub, graphic) {
    return el('section', { class: 'vv-chart' }, [caption(title, sub), graphic]);
  }
  function legend(items) {
    return el('div', { class: 'vv-legend' }, items.map(([label, color]) =>
      el('span', null, [el('i', { style: 'background:' + color, 'aria-hidden': 'true' }), label])));
  }
  function stat(label, text, note) {
    return el('div', { class: 'vv-stat' }, [
      el('span', { class: 'vv-eyebrow' }, label), el('strong', null, text),
      ...(note ? [el('small', null, note)] : [])
    ]);
  }

  /* Bars for annual USD-million amounts. HTML labels stay legible at every size; the scale is linear with round steps.
     options.onSelect makes each year a button; options.selected is the index of the year that starts selected.
     options.label gives the name of a column; without it the columns are forecast years, Y1 to Y10.
     A value that is not a number is missing: it gets no bar, and its label says "not available". It is not a zero. */
  function barChart(rows, series, options = {}) {
    const onSelect = options.onSelect || null;
    const values = rows.flatMap(r => series.map(s => r[s.key])).filter(M.finite);
    const scale = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4), range = scale.max - scale.min || 1;
    const axisMoney = moneyAxis(Math.max(Math.abs(scale.min), Math.abs(scale.max)));
    const point = v => (scale.max - v) / range * 100, zero = point(0);
    const outer = el('div', { class: 'vv-bars-wrap' });
    const key = legend(series.map(s => [s.label, s.color]));
    key.append(el('span', { class: 'vv-unit' }, axisMoney.unit));
    outer.append(key);
    const chart = el('div', { class: 'vv-bars', role: 'group', 'aria-label': 'Annual values in ' + axisMoney.unit });
    const axis = el('div', { class: 'vv-yaxis', 'aria-hidden': 'true' });
    const area = el('div', { class: 'vv-plot' });
    scale.ticks.forEach(v => {
      axis.append(el('span', { style: 'top:' + point(v) + '%' }, axisMoney.label(v)));
      area.append(el('i', { class: 'vv-gridline', style: 'top:' + point(v) + '%', 'aria-hidden': 'true' }));
    });
    area.append(el('i', { class: 'vv-zero', style: 'top:' + zero + '%', 'aria-hidden': 'true' }));
    const columns = el('div', { class: 'vv-columns', style: '--years:' + rows.length });
    const selected = Math.min(Math.max(0, options.selected || 0), rows.length - 1), selectors = [];
    rows.forEach((r, index) => {
      const name = options.label ? options.label(r) : 'Y' + r.t;
      const summary = (options.label ? name : 'Year ' + r.t) + '. ' + series.map(s => s.label + ': ' + (M.finite(r[s.key]) ? money(r[s.key]) : 'not available')).join('. ');
      const column = el(onSelect ? 'button' : 'div', {
        class: 'vv-column', ...(onSelect ? { type: 'button', 'aria-pressed': String(index === selected) } : {}),
        'aria-label': summary, title: summary
      });
      const bars = el('span', { class: 'vv-bar-pair', 'aria-hidden': 'true' });
      series.forEach((s, seriesIndex) => {
        if (!M.finite(r[s.key])) return;
        const p = point(r[s.key]);
        bars.append(el('i', { style: 'background:' + s.color + ';top:' + Math.min(p, zero) + '%;height:' + Math.abs(p - zero) + '%;left:' + seriesIndex / series.length * 100 + '%;width:' + (100 / series.length - 8) + '%' }));
      });
      column.append(bars, el('span', { class: 'vv-xlabel', 'aria-hidden': 'true' }, name));
      if (onSelect) column.addEventListener('click', () => {
        selectors.forEach(b => b.setAttribute('aria-pressed', String(b === column)));
        onSelect(r, index);
      });
      selectors.push(column); columns.append(column);
    });
    area.append(columns); chart.append(axis, area); outer.append(chart);
    return outer;
  }
  /* Free cash flow and its present value for each year. ui.year keeps the selected year across redraws. */
  function cashChart(rows, ui) {
    const state = ui || {}, wrap = el('div', { class: 'vv-cash-chart' });
    const inspector = el('div', { class: 'vv-inspector', 'aria-live': 'polite', 'aria-atomic': 'true' });
    function inspect(r, index) {
      state.year = index;
      inspector.replaceChildren(
        el('div', { class: 'vv-inspector-title' }, [el('b', null, 'Year ' + r.t), el('span', null, 'From operating profit to free cash flow')]),
        el('div', { class: 'vv-cash-equation' }, [
          ['Operating profit', r.ebit, ''], ['Tax', r.tax, '−'], ['Depreciation', r.da, '+'],
          ['Capex', r.capex, '−'], ['Change in working capital', Math.abs(r.deltaWc), r.deltaWc < 0 ? '+' : '−'],
          ['Free cash flow', r.fcff, '=']
        ].map(([label, amount, op], i) => el('div', { class: i === 5 ? 'is-total' : '' }, [
          el('span', null, label), el('b', null, (op && op !== '=' ? op + ' ' : '') + money(amount))
        ]))),
        el('p', { class: 'vv-inspector-note' }, money(r.fcff) + ' in year ' + r.t + ' is worth ' + money(r.pv) + ' today.')
      );
    }
    const start = Math.min(Math.max(0, state.year || 0), rows.length - 1);
    wrap.append(barChart(rows, [
      { key: 'fcff', label: 'Free cash flow', color: C.slate },
      { key: 'pv', label: 'Its value today', color: C.ink }
    ], { onSelect: inspect, selected: start }), inspector);
    inspect(rows[start], start);
    return wrap;
  }
  /* Enterprise value to equity value to one share. */
  function bridgeChart(d, bridge, e, shares) {
    const claims = bridge.debt + bridge.financeLeases + bridge.nci;
    const cash = bridge.cash + bridge.investments;
    const entries = [
      ['Enterprise value', d.enterprise, C.ink, ''],
      ['Debt, leases and minority interests', claims, C.slate, '−'],
      ['Cash and non-operating assets', cash, C.tan, '+']
    ];
    if (e.residual < 0) entries.push(['Limited-liability floor', -e.residual, C.muted, '+']);
    entries.push(['Equity value', e.equity, C.ink, '=']);
    const max = Math.max(1, ...entries.map(x => Math.abs(x[1])));
    const box = el('div', { class: 'vv-bridge' });
    entries.forEach(([label, amount, color, operator], i) => {
      const row = el('div', { class: 'vv-bridge-row' + (i === entries.length - 1 ? ' is-total' : '') });
      row.append(el('span', { class: 'vv-bridge-name' }, [el('b', { 'aria-hidden': 'true' }, operator), label]),
        el('strong', null, money(amount)),
        el('span', { class: 'vv-bridge-track', 'aria-hidden': 'true' },
          el('i', { style: 'width:' + Math.abs(amount) / max * 100 + '%;background:' + color })));
      box.append(row);
    });
    if (M.finite(shares) && shares > 0) box.append(el('p', { class: 'vv-bridge-share' }, [
      money(e.equity) + ' ÷ ' + num(shares) + ' million shares = ', el('strong', null, usd(e.perShare)), ' a share']));
    if (e.residual < 0) box.append(el('p', { class: 'vv-fine' }, 'The claims are larger than the enterprise value by ' + money(-e.residual) + '. A share cannot be worth less than zero, so the model stops at zero.'));
    return box;
  }
  function valueStrip(d) {
    const simple = M.finite(d.terminalShare) && d.terminalShare >= 0 && d.terminalShare <= 1;
    return el('div', { class: 'vv-value-strip', 'aria-label': 'Enterprise value calculation' }, [
      stat('Ten years of cash flow', money(d.sumPv), simple ? pct1(1 - d.terminalShare) + ' of enterprise value' : 'Value today'),
      el('span', { class: 'vv-operator', 'aria-hidden': 'true' }, '+'),
      stat('Terminal value', money(d.pvTerminal), simple ? pct1(d.terminalShare) + ' of enterprise value' : 'Value today of the years after year 10'),
      el('span', { class: 'vv-operator', 'aria-hidden': 'true' }, '='),
      stat('Enterprise value', money(d.enterprise), 'Before debt and cash')
    ]);
  }
  /* The five steps of the detailed path, from one context. The step header above the view states the question
     of the step and its answer; the view shows the evidence.
     1 business: the filing · 2 forecast: ten years of cash flow · 3 value: from cash to one share ·
     4 range: cases, drivers and other methods · 5 price: what the share price needs. */
  function render(host, ctx, mode = 'value') {
    const V = window.AnalystVisuals, wrap = el('div', { class: 'value-visuals vv-view-' + mode });
    if (mode === 'business') {
      wrap.append(V.businessView(ctx));
    } else if (mode === 'forecast') {
      wrap.append(chartBox('Free cash flow of each year', 'The cash that the business produces, and what that cash is worth today. Select a year to see how it is built.', cashChart(ctx.d.rows, ctx.ui)),
        V.forecastTable(ctx));
    } else if (mode === 'range') {
      wrap.append(V.scenarioView(ctx), V.driverView(ctx), V.rangeView(ctx),
        el('details', { class: 'av-compact-controls', 'data-fold': 'heatmap' }, [el('summary', null, 'Table · value per share by discount rate and terminal growth'), V.heatmap(ctx)]));
    } else if (mode === 'price') {
      wrap.append(V.impliedView(ctx));
    } else {
      wrap.append(valueStrip(ctx.d),
        chartBox('From enterprise value to one share', 'Subtract the claims, add cash and non-operating assets, then divide by the share count.',
          bridgeChart(ctx.d, ctx.bridge, ctx.e, ctx.shares)),
        V.wacc(ctx, false), V.terminalChecks(ctx));
    }
    host.append(wrap); return wrap;
  }

  function buyout(host, result, params) {
    const wrap = el('div', { class: 'value-visuals vv-buyout' });
    if (result.ok) {
      wrap.append(el('div', { class: 'vv-desk-top' }, [
        el('div', { class: 'vv-desk-answer' }, [el('span', { class: 'vv-eyebrow' }, 'Investor return · hypothetical'), el('strong', { class: 'vv-value' }, pct1(result.irr)), el('span', null, 'Annual IRR over ' + params.years + ' years')]),
        stat('Money invested', num(result.moic) + '×', 'Proceeds / all contributions'),
        stat('Equity at exit', money(result.proceeds), 'After settling debt')
      ]));
    }
    const s = result.sourcesUses;
    if (s) {
      const sources = el('div', { class: 'vv-sources' }, [
        el('div', { class: 'vv-split-bar', 'aria-label': 'Acquisition funding' }, [
          el('span', { style: 'width:' + s.equityIn / s.uses * 100 + '%;background:' + C.ink }),
          el('span', { style: 'width:' + s.debt0 / s.uses * 100 + '%;background:' + C.slate })
        ]),
        el('div', { class: 'vv-split-labels' }, [
          stat('Initial equity', money(s.equityIn), pct1(s.equityIn / s.uses) + ' of total funding'),
          stat('Acquisition debt', money(s.debt0), pct1(s.debt0 / s.uses) + ' of total funding')
        ]),
        el('p', { class: 'vv-fine' }, 'Funding covers ' + money(s.entryEv) + ' purchase value, ' + money(s.fees) + ' fees, and ' + money(s.minimumCash) + ' minimum cash.')
      ]);
      wrap.append(chartBox('What funds the acquisition?', 'Sources equal uses at entry.', sources));
    }
    if (result.rows && result.rows.length) {
      const rows = result.rows.map(r => ({ ...r, debt: r.term + r.revolver }));
      wrap.append(chartBox('Follow the debt and the cash.', 'Year-end balances. Revolver capacity and funding gaps stay explicit.', barChart(rows, [
        { key: 'debt', label: 'Term debt + revolver', color: C.ink },
        { key: 'cash', label: 'Cash on hand', color: C.tan },
        { key: 'extraEquity', label: 'Extra equity required', color: C.slate }
      ])));
    }
    if (result.ok) wrap.append(el('p', { class: 'vv-fine' }, 'Investor cash flows include ' + money(result.contributions) + ' of total equity contributions and ' + money(result.proceeds) + ' of sale proceeds. This is an assumed transaction, not a forecast.'));
    host.append(wrap); return wrap;
  }
  window.ValueVisuals = { render, buyout, colors: C,
    format: { num, money, usd, pct1, pct2, niceTicks, moneyAxis, perShareAxis },
    charts: { chartBox, cashChart, barChart, bridgeChart, valueStrip, legend, stat } };
})();
