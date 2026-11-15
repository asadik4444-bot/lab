/* Analyst parts of the valuation workspace. Each part reads one context from the controller and calls the
   shared engines again only for its own cases. Selections live in ctx.ui, so a redraw after an edit keeps them.
   Fold-out sections carry data-fold; the controller keeps their open state. */
(function () {
  'use strict';
  const L = window.Lab, M = window.DetailedMath, A = window.AnalystMath, el = L.el;
  const { num, money, usd, pct1, pct2, niceTicks, moneyAxis, perShareAxis } = window.ValueVisuals.format;
  const charts = window.ValueVisuals.charts;
  // Slate, navy and tan for three series. Brass is kept for the share price and what it needs.
  const colors = ['#7c8aa3', '#14213d', '#c9b48f'], brass = '#9c7345';
  const num2 = x => M.finite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
  const times = x => M.finite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '×' : '—';
  const pp = x => M.finite(x) ? (x > 0 ? '+' : x < 0 ? '−' : '') + num2(Math.abs(x * 100)) + ' pp' : '—';
  const signedUsd = x => M.finite(x) ? (x > 0 ? '+' : x < 0 ? '−' : '') + usd(Math.abs(x)) : '—';
  // Whole dollars for large per-share values, cents for small ones.
  const usdShort = x => !M.finite(x) ? '—' : Math.abs(x) >= 100 ? '$' + Math.round(x).toLocaleString('en-US') : usd(x);
  const warning = text => el('p', { class: 'av-error' }, text);

  // data-edit names the input that the button opens. The drawer uses it to return the focus after a redraw.
  function editButton(ctx, key, label) {
    const b = el('button', { type: 'button', class: 'assumption-button', 'data-edit': key }, label);
    b.addEventListener('click', () => ctx.editAssumptions && ctx.editAssumptions(key));
    if (!ctx.editAssumptions) b.hidden = true;
    return b;
  }
  /* Each cell carries its column name, so a narrow screen can show a row as a short list. */
  function table(headers, rows, label) {
    const t = el('table', null, [
      el('thead', null, el('tr', null, headers.map(h => el('th', { scope: 'col' }, h)))),
      el('tbody', null, rows.map(r => el('tr', null, r.map((v, i) => el(i ? 'td' : 'th', i ? { 'data-label': headers[i] } : { scope: 'row' }, v)))))
    ]);
    return el('div', { class: 'av-table', tabindex: '0', role: 'region', 'aria-label': label }, t);
  }
  function metric(label, value, note) {
    return el('div', { class: 'vv-stat' }, [el('span', { class: 'vv-eyebrow' }, label), el('strong', null, value), el('small', null, note)]);
  }
  function title(heading, copy) {
    // The first part of a view has the view title above it, so it can pass no heading.
    return el('header', { class: 'av-title' }, [...(heading ? [el('h3', null, heading)] : []), el('p', null, copy)]);
  }
  /* A horizontal axis for a track that runs from scale.min to scale.max. Labels sit at their true positions. */
  const position = (v, scale) => (v - scale.min) / (scale.max - scale.min) * 100;
  function axisRow(scale, label, className) {
    return el('div', { class: 'av-axis-row ' + className, 'aria-hidden': 'true' }, [el('span'),
      el('span', { class: 'av-axis-track' }, scale.ticks.map(v => el('span', { style: 'left:' + position(v, scale) + '%' }, label(v)))), el('span')]);
  }
  const tickLines = scale => scale.ticks.map(v => el('i', { class: 'av-tick-line', style: 'left:' + position(v, scale) + '%' }));

  /* The result in one sentence. It states the value at the stated discount rate and what the entered price implies.
     It makes no buy or sell statement. ctx.sanity and ctx.implied come from the controller. */
  function headline(ctx) {
    const first = 'At a ' + pct1(ctx.p.rate) + ' discount rate, this forecast is worth ' + usdShort(ctx.e.perShare) + ' a share.';
    if (!M.finite(ctx.price) || ctx.price <= 0) return [first, ''];
    const x = A.priceImplies(ctx.implied, ctx.sanity), parts = [];
    if (x.kind === 'growth') parts.push(pct1(x.value) + ' revenue growth a year for five years');
    if (M.finite(x.rate)) parts.push('a ' + pct1(x.rate) + ' discount rate');
    return [first, parts.length ? 'The ' + usdShort(ctx.price) + ' price implies ' + parts.join(', or ') + '.' : noRate(x, 'the ' + usdShort(ctx.price) + ' price')];
  }
  /* The model shows neither figure for the price. Each of the two sentences that follow is the reason of its own search.
     A search that did not run is not stated as a search that found nothing (AnalystMath.priceImplies). */
  const noRate = (x, price) => 'The model shows no growth rate and no discount rate for ' + price + '. ' + x.growthSays + ' ' + x.rateSays;

  /* Two checks of the terminal value, for the step that turns cash into value. */
  function terminalChecks(ctx) {
    const s = ctx.sanity || {}, d = ctx.d, share = M.finite(s.terminalShare) && s.terminalShare >= 0 && s.terminalShare <= 1;
    // A share of the value has a meaning only when both parts are positive. Else the note names the part that is not.
    const noShare = !(d.enterprise > 0) ? 'The enterprise value is not above zero' : d.sumPv < 0 ? 'The ten forecast years have a negative value' : 'The years after year 10 have a negative value';
    return el('section', { class: 'av-panel' }, [title('Two checks of the years after year 10', 'A large share from those years, or a high multiple, means that the value rests on the far future.'),
      el('div', { class: 'av-kpis av-kpis-two' }, [
        metric('Value from the years after year 10', share ? pct1(s.terminalShare) : '—', share ? 'of enterprise value' : noShare),
        metric('Multiple of profit in year 10', M.finite(s.exitEvEbitda) ? times(s.exitEvEbitda) + ' EBITDA' : '—',
          M.finite(s.currentEvEbitda) ? 'At the share price today: ' + times(s.currentEvEbitda) : 'Enterprise value at year 10 / EBITDA')])]);
  }

  /* Step 1. The filing: sales and operating profit of the last years. Then the amounts that start the model.
     The chart shows filed amounts only. The list shows inputs of the model, which the visitor can change. */
  function businessView(ctx) {
    const c = ctx.company || {}, b = ctx.bridge;
    const years = ((c.history && c.history.years) || []).filter(y => M.finite(y.revenue)).slice().sort((x, y) => String(x.end).localeCompare(String(y.end)));
    const out = el('section', { class: 'av-panel av-business' });
    // Filing data without an operating-profit line gives no profit bars. A bar at zero would state a profit of zero.
    const profits = years.some(y => M.finite(y.operating_income));
    if (years.length >= 2) out.append(charts.chartBox(profits ? 'Sales and operating profit' : 'Sales',
      'The last ' + L.word(years.length) + ' fiscal years, from the annual filings.' + (profits ? '' : ' The filing data holds no operating-profit line for this company.'),
      charts.barChart(years.map(y => ({ t: String(y.end).slice(0, 4), sales: y.revenue / 1e6, profit: M.finite(y.operating_income) ? y.operating_income / 1e6 : null })),
        [{ key: 'sales', label: 'Sales', color: colors[1] }, ...(profits ? [{ key: 'profit', label: 'Operating profit', color: colors[0] }] : [])], { label: r => r.t })));
    // A note says so when the visitor changed an amount, or when an amount is provisional: a placeholder for a value
    // that the filing does not give. An amount can add several inputs; "Partly" says that only a part is concerned.
    const origin = (keys, note) => {
      const mine = keys.filter(k => ctx.edited && ctx.edited(k)).length, assumed = keys.filter(k => (ctx.assumed || []).includes(k)).length;
      const marks = [mine ? (mine < keys.length ? 'Partly your input' : 'Your input') : '', assumed ? (assumed < keys.length ? 'Partly provisional' : 'Provisional') + ', to review' : ''].filter(Boolean);
      return (marks.length ? marks.join('. ') + '. ' : '') + note;
    };
    const facts = [
      ['Opening sales', money(ctx.p.revenue), origin(['revenue'], 'The forecast starts here')],
      ['Opening operating margin', pct1(ctx.p.margin), origin(['margin'], 'Operating profit / sales')],
      ['Cash and investments', money(b.cash + b.investments), origin(['cash', 'investments'], 'The model counts them as surplus')],
      ['Debt, leases and minority interests', money(b.debt + b.financeLeases + b.nci), origin(['debt', 'financeLeases', 'nci'], 'They rank before the shares')],
      ['Shares', num(ctx.shares) + ' million', origin(['shares'], 'Count at ' + L.date(ctx.shareDate))]];
    out.append(el('div', { class: 'av-title' }, [el('h3', null, 'What the model starts from'), el('p', null, 'The inputs show where each amount comes from: a source with its date, a provisional value, or your own input. You can change each one.')]),
      el('dl', { class: 'av-facts' }, facts.map(([name, value, note]) => el('div', null, [el('dt', null, name), el('dd', null, [el('strong', null, value), el('small', null, note)])]))),
      editButton(ctx, 'revenue', 'See these inputs and their sources'));
    return out;
  }

  /* The ten forecast years as a table, behind a fold. */
  function forecastTable(ctx) {
    const rows = ctx.d.rows, axis = moneyAxis(Math.max(...rows.map(r => Math.abs(r.revenue))));
    return el('details', { class: 'av-compact-controls', 'data-fold': 'forecast-table' }, [el('summary', null, 'Table · the ten forecast years'),
      table(['Year', 'Sales', 'Growth', 'EBIT margin', 'Free cash flow', 'Value today'],
        rows.map(r => ['Year ' + r.t, axis.label(r.revenue), pct1(r.growth), pct1(r.margin), axis.label(r.fcff), axis.label(r.pv)]), 'The ten forecast years'),
      editButton(ctx, 'taxRate', 'Edit tax, capex and working capital')]);
  }

  /* The answer of each step in one sentence. The step header shows it under the question of the step. */
  function answer(ctx, mode) {
    const d = ctx.d, rows = d.rows, name = L.shortName((ctx.company || {}).name || 'The company');
    if (mode === 'business') {
      // This step is about the filing. Its sentence states the filed amounts, not the inputs that the visitor can change.
      const c = ctx.company || {}, f = c.fundamentals || {}, h = c.history || {}, g = h.revenue_cagr && h.revenue_cagr.value;
      const sales = f.revenue && f.revenue.value, profit = f.operating_income && f.operating_income.value;
      const filed = !(M.finite(sales) && sales > 0) ? ' filed its accounts for the year to ' + L.date(ctx.period) + '.' :
        ' sold ' + L.usd(sales) + ' in the year to ' + L.date(ctx.period) + (!M.finite(profit) ? '.' :
          profit < 0 ? ' and had an operating loss of ' + L.usd(-profit) + '.' : ' and kept ' + pct1(profit / sales) + ' of it as operating profit.');
      return name + filed + (M.finite(g) && h.cagr_years ? ' Over ' + L.word(h.cagr_years) + ' years its sales ' + (g < 0 ? 'fell ' + pct1(-g) : 'grew ' + pct1(g)) + ' a year.' : '');
    }
    if (mode === 'forecast') return (ctx.annual ? 'With your ten annual inputs' : 'With ' + pct1(ctx.p.growth) + ' growth for five years and a ' + pct1(ctx.p.targetMargin) + ' margin by year ten') +
      ', free cash flow goes from ' + money(rows[0].fcff) + ' in year 1 to ' + money(rows[rows.length - 1].fcff) + ' in year 10.';
    if (mode === 'value') return 'At a discount rate of ' + pct1(ctx.p.rate) + ', the forecast is worth ' + money(d.enterprise) + ' today. After debt and cash, that is ' + usd(ctx.e.perShare) + ' a share.';
    if (mode === 'range') {
      const cases = A.scenarios(ctx.p, ctx.bridge, ctx.shares, ctx.analysis), low = cases[0], high = cases[2];
      const top = A.drivers(ctx, ctx.analysis).rows.find(r => r.status !== 'unavailable');
      return (low.e && low.e.ok && high.e && high.e.ok ? 'From the low case to the high case, a share is worth ' + usd(low.e.perShare) + ' to ' + usd(high.e.perShare) + '.' :
        'The cases are not available with these inputs.') + (top ? ' ' + top.label + ' moves the value most.' : '');
    }
    const x = A.priceImplies(ctx.implied, ctx.sanity);
    if (x.kind === 'growth') return 'At ' + usd(ctx.price) + ', the price needs ' + pct1(x.value) + ' growth a year for five years. This forecast has ' + pct1(ctx.p.growth) + '.' +
      (M.finite(x.rate) ? ' Or the price needs a discount rate of ' + pct1(x.rate) + ', against ' + pct1(ctx.p.rate) + ' here.' : '');
    if (x.kind === 'rate') return 'At ' + usd(ctx.price) + ', the price needs a discount rate of ' + pct1(x.value) + ', against ' + pct1(ctx.p.rate) + ' here. For growth: ' + x.why + '.';
    return noRate(x, 'the price of ' + usd(ctx.price));
  }

  /* WACC: capital weights as one bar, then the arithmetic. */
  function wacc(ctx, open = false) {
    const { w, capital: c } = ctx;
    const fold = el('details', { class: 'av-wacc', 'data-fold': 'wacc' }, el('summary', null, [
      el('span', null, 'WACC · how the discount rate is built'), el('strong', null, pct2(w.rate))]));
    fold.open = open;
    const afterTaxDebt = c.costDebt * (1 - c.debtTaxRate);
    fold.append(el('div', { class: 'av-wacc-body' }, [
      el('div', { class: 'av-weights' }, [
        el('div', { class: 'av-weight-bar', role: 'img', 'aria-label': 'Equity weight ' + pct1(w.equityWeight) + ', debt weight ' + pct1(w.debtWeight) }, [
          el('span', { class: 'is-equity', style: 'width:' + w.equityWeight * 100 + '%' }), el('span', { class: 'is-debt', style: 'width:' + w.debtWeight * 100 + '%' })]),
        el('p', null, [el('i', { class: 'is-equity', 'aria-hidden': 'true' }), 'Equity ' + pct1(w.equityWeight) + ' · ' + money(c.equity) + ' at the share price']),
        el('p', null, [el('i', { class: 'is-debt', 'aria-hidden': 'true' }), 'Debt ' + pct1(w.debtWeight) + ' · ' + money(c.debtWeightValue)])
      ]),
      el('dl', { class: 'av-wacc-terms' }, [
        // Beta keeps four decimals here: the rate slider of the simple view sets it that exactly, and the line must add up.
        el('dt', null, 'Cost of equity'), el('dd', null, pct2(c.riskFree) + ' + ' + c.beta.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' × ' + pct2(c.erp) + ' = ' + pct2(w.equityCost)),
        el('dt', null, 'Cost of debt after tax'), el('dd', null, pct2(c.costDebt) + ' × (1 − ' + pct1(c.debtTaxRate) + ') = ' + pct2(afterTaxDebt)),
        el('dt', null, 'Equity part'), el('dd', null, pct1(w.equityWeight) + ' × ' + pct2(w.equityCost) + ' = ' + pct2(w.equityWeight * w.equityCost)),
        el('dt', null, 'Debt part'), el('dd', null, pct1(w.debtWeight) + ' × ' + pct2(afterTaxDebt) + ' = ' + pct2(w.debtWeight * afterTaxDebt)),
        el('dt', null, 'WACC'), el('dd', null, pct2(w.rate))
      ]),
      editButton(ctx, 'riskFree', 'Edit the WACC inputs')
    ]));
    return fold;
  }

  /* Value per share on the same nine WACC and terminal-growth cases as the DCF band of the Summary view. */
  function heatmap(ctx) {
    const cells = A.ranges(ctx, ctx.analysis).methods[0].cases;
    if (!cells.length) return el('div', null, [warning('Enter the WACC step and the terminal growth step to see this table.'), editButton(ctx, 'waccStep', 'Edit the steps')]);
    const values = cells.filter(c => c.ok).map(c => c.value), min = Math.min(...values), max = Math.max(...values);
    const rows = [0, 1, 2].map(r => cells.filter(c => c.row === r).sort((a, b) => a.column - b.column));
    const t = el('table', { class: 'vv-heatmap', 'aria-label': 'Value per share by WACC and terminal growth' });
    t.append(el('thead', null, el('tr', null, [el('th', { scope: 'col' }, 'WACC ↓ · growth →'), ...rows[0].map(c => el('th', { scope: 'col' }, pct1(c.terminalGrowth)))])));
    const body = el('tbody');
    rows.forEach(row => body.append(el('tr', null, [el('th', { scope: 'row' }, pct2(row[0].rate)), ...row.map(c => {
      const cell = el('td', { class: 'vv-heat' + (c.row === 1 && c.column === 1 ? ' vv-central' : '') }, c.ok ? usd(c.value) : '—');
      if (c.ok) cell.style.setProperty('--shade', String(.06 + .24 * (c.value - min) / Math.max(.001, max - min)));
      else cell.title = (c.errors || []).join(' ');
      return cell;
    })])));
    t.append(body);
    return el('div', { class: 'vv-heat-wrap' }, [t, el('p', { class: 'vv-fine' }, ctx.p.terminalRocTracksWacc ?
      'Terminal return on capital equals WACC in each case, so investment after year 10 earns only its cost and creates no extra value. Terminal growth still changes the value: it sets the profit of year 11' +
        (ctx.annual ? '.' : ', and growth fades to it in years 6–10.') :
      'Terminal return on capital stays at ' + pct1(ctx.p.terminalRoc) + ' in each case.'), editButton(ctx, 'waccStep', 'Edit the steps')]);
  }

  /* Three cases on one per-share scale. */
  function scenarioView(ctx) {
    const { p, bridge, shares, price } = ctx, cases = A.scenarios(p, bridge, shares, ctx.analysis), ui = ctx.ui || {};
    const out = el('section', { class: 'av-panel' }, title(null, cases[0].e.ok || cases[2].e.ok ?
      'Three cases on one scale. Growth, margin and WACC move together. No probability is attached. Select a bar to see its inputs.' :
      'The low case and the high case have no value with these inputs. Select one of them to see the reason.'));
    const amounts = cases.map(x => x.e.ok ? x.e.perShare : null);
    const scale = niceTicks(0, Math.max(1, price || 0, ...amounts.filter(M.finite)) * 1.08, 4);
    const plot = el('div', { class: 'av-scenario-plot' }), axis = el('div', { class: 'av-axis', 'aria-hidden': 'true' });
    const area = el('div', { class: 'av-scenario-area' }), grid = el('div', { class: 'av-bars-grid' }), buttons = [];
    scale.ticks.forEach(v => {
      axis.append(el('span', { style: 'bottom:' + position(v, scale) + '%' }, perShareAxis(v)));
      area.append(el('i', { class: 'av-gridline', style: 'bottom:' + position(v, scale) + '%', 'aria-hidden': 'true' }));
    });
    const detail = el('div', { class: 'av-inspector', 'aria-live': 'polite' });
    function select(index) {
      const x = cases[index], q = x.q || {};
      ui.scenario = index;
      buttons.forEach((b, n) => b.setAttribute('aria-pressed', String(n === index)));
      detail.replaceChildren(el('h4', null, x.name), el('div', { class: 'av-kpis' }, [
        metric('Revenue growth · years 1–5', pct1(q.growth), ''), metric('Year 10 EBIT margin', pct1(q.targetMargin), ''), metric('WACC', pct2(q.rate), '')]));
      if (!x.e.ok) { detail.append(warning((x.errors || x.e.errors || ['This case is unavailable.']).join(' '))); return; }
      const changes = x.id === 'base' ? 'Your current assumptions. ' :
        'Against the base case: growth ' + pp(q.growth - p.growth) + ', year 10 margin ' + pp(q.targetMargin - p.targetMargin) + ', WACC ' + pp(q.rate - p.rate) + '. ';
      detail.append(el('p', { class: 'vv-fine' }, changes + usd(x.e.perShare) + ' a share' +
        (x.id === 'base' ? '.' : ', ' + signedUsd(x.e.perShare - ctx.e.perShare) + ' against the base case.')));
      if (x.e.residual < 0) detail.append(warning('The claims are larger than the enterprise value. The model stops at zero.'));
    }
    cases.forEach((x, i) => {
      const amount = amounts[i];
      const b = el('button', { type: 'button', class: 'av-scenario-column', style: '--bar-height:' + (M.finite(amount) ? position(amount, scale) : 0) + '%;--case-color:' + colors[i],
        'aria-pressed': 'false', 'aria-label': x.name + ': ' + (amount == null ? 'unavailable' : usd(amount) + ' a share') }, [
        el('span', { class: 'av-scenario-bar', 'aria-hidden': 'true' }),
        el('strong', { class: 'av-scenario-value' }, usd(amount)), el('span', { class: 'av-scenario-label' }, x.name)
      ]);
      b.addEventListener('click', () => select(i)); buttons.push(b); grid.append(b);
    });
    area.append(grid);
    if (M.finite(price) && price > 0) area.append(el('div', { class: 'av-price-line', style: 'bottom:' + position(price, scale) + '%', 'aria-hidden': 'true' }));
    plot.append(axis, area);
    out.append(el('div', { class: 'av-chart-box av-scenario-chart' }, [plot,
      el('p', { class: 'av-scenario-key' }, 'Dashed line: the share price, ' + usd(price) + '.'), detail,
      editButton(ctx, 'waccStep', 'Edit the case steps')]));
    select(Math.min(Math.max(0, M.finite(ui.scenario) ? ui.scenario : 1), cases.length - 1));
    return out;
  }

  /* Football field: the DCF sensitivity and two multiple bands on one per-share scale. */
  function rangeView(ctx) {
    const result = A.ranges(ctx, ctx.analysis), methods = result.methods, origin = ctx.analysis.bandOrigin || {};
    const usable = methods.filter(r => M.finite(r.low) && M.finite(r.high));
    const scale = niceTicks(0, Math.max(1, ctx.price || 0, ...usable.map(r => r.high)) * 1.05, 4);
    const out = el('section', { class: 'av-panel' }, title('Three methods on one scale', 'The DCF across nine WACC and growth cases, and two multiple bands. USD per share.'));
    const chart = el('div', { class: 'av-football' });
    methods.forEach((r, i) => {
      const track = el('div', { class: 'av-range-track', 'aria-hidden': 'true' }, tickLines(scale));
      if (M.finite(r.low) && M.finite(r.high)) {
        track.append(el('span', { class: 'av-range-band', style: 'left:' + position(r.low, scale) + '%;width:' + (position(r.high, scale) - position(r.low, scale)) + '%;background:' + colors[i % 3] }));
        if (M.finite(r.central)) track.append(el('i', { class: 'av-range-central', style: 'left:' + position(r.central, scale) + '%' }));
      }
      if (M.finite(ctx.price)) track.append(el('i', { class: 'av-range-marker', style: 'left:' + position(ctx.price, scale) + '%' }));
      chart.append(el('div', { class: 'av-range-row' }, [
        el('div', null, [el('strong', null, r.label), el('small', null, r.status === 'partial' ? 'Valid cases only' : r.status === 'unavailable' ? 'Inputs needed' :
          origin[r.id] || (r.id === 'dcf' ? 'Nine sensitivity cases' : 'Selected band'))]),
        track, el('strong', null, M.finite(r.low) ? usd(r.low) + ' – ' + usd(r.high) : 'Not available')
      ]));
    });
    chart.append(axisRow(scale, perShareAxis, 'av-range-axis-row'));
    out.append(chart, el('p', { class: 'vv-fine' }, [el('i', { class: 'av-key-price', 'aria-hidden': 'true' }), 'Share price, ' + usd(ctx.price) + '. ',
      el('i', { class: 'av-key-central', 'aria-hidden': 'true' }), 'Base DCF value. The multiple bands are selected inputs, not a peer study.']),
      editButton(ctx, 'peLow', 'Edit earnings and multiple bands'));
    methods.forEach(r => {
      const fold = el('details', { class: 'av-compact-controls', 'data-fold': 'range-' + r.id }, el('summary', null, r.label + ' · inputs and calculation'));
      if (r.notes && r.notes.length) fold.append(el('p', { class: 'vv-fine' }, r.notes.join(' ')));
      if (r.errors && r.errors.length) fold.append(warning(r.errors.join(' ')));
      if (r.id === 'dcf') fold.append(table(['WACC', 'Terminal growth', 'Value per share'], r.cases.map(c =>
        [pct2(c.rate), pct1(c.terminalGrowth), c.ok ? usd(c.value) : 'Not valid: ' + c.errors.join(' ')]), 'DCF sensitivity cases'),
        editButton(ctx, 'waccStep', 'Edit the steps'));
      if (r.id === 'pe') fold.append(table(['Earnings per share', 'Lower P/E', 'Upper P/E'],
        [[usd(ctx.analysis.eps), times(ctx.analysis.peLow), times(ctx.analysis.peHigh)]], 'P/E band inputs'));
      if (r.id === 'ev_ebitda') fold.append(table(['EBITDA', 'Lower EV / EBITDA', 'Upper EV / EBITDA', 'Net claims', 'Shares'],
        [[money(ctx.analysis.ebitda), times(ctx.analysis.evLow), times(ctx.analysis.evHigh), money(ctx.e.netClaims), num(ctx.shares) + ' million']], 'EV/EBITDA band inputs'));
      out.append(fold);
    });
    if (ctx.earningsBasis) out.append(el('p', { class: 'vv-fine' }, 'Earnings basis: ' + ctx.earningsBasis + '.'));
    return out;
  }

  /* Tornado: one input changes at a time. */
  function driverView(ctx) {
    const result = A.drivers(ctx, ctx.analysis), base = ctx.e.perShare, ui = ctx.ui || {};
    const out = el('section', { class: 'av-panel' }, title('What moves the value most', 'One input changes at a time. The largest effect is first. The effects do not add up.'));
    const valid = result.rows.filter(r => r.status !== 'unavailable');
    const half = niceTicks(0, Math.max(.01, ...valid.map(r => r.impact || 0)) * 1.05, 2).max;
    const scale = { min: -half, max: half, ticks: [-half, -half / 2, 0, half / 2, half] };
    const chart = el('div', { class: 'av-tornado' }), detail = el('div', { class: 'av-inspector', 'aria-live': 'polite' }), buttons = new Map();
    function show(r) {
      ui.driver = r.id;
      buttons.forEach((b, id) => b.setAttribute('aria-pressed', String(id === r.id)));
      detail.replaceChildren(el('h4', null, r.label), table(['Input change', 'Value per share', 'Change'], [
        ['−' + num2(r.step * 100) + ' pp', r.minus.ok ? usd(r.minus.value) : 'Not valid', r.minus.ok ? signedUsd(r.minus.value - base) : '—'],
        ['Your input', usd(base), '$0.00'],
        ['+' + num2(r.step * 100) + ' pp', r.plus.ok ? usd(r.plus.value) : 'Not valid', r.plus.ok ? signedUsd(r.plus.value - base) : '—']
      ], r.label + ' sensitivity'), el('p', { class: 'vv-fine' }, (r.notes || []).join(' ')));
      if (r.errors && r.errors.length) detail.append(warning(r.errors.join(' ')));
    }
    result.rows.forEach(r => {
      if (r.status === 'unavailable') { chart.append(warning(r.label + ': ' + (r.errors || r.notes || ['Not available for this forecast.']).join(' '))); return; }
      const left = position(M.finite(r.low) ? r.low - base : 0, scale), right = position(M.finite(r.high) ? r.high - base : 0, scale);
      const track = el('span', { class: 'av-driver-track', 'aria-hidden': 'true' }, [...tickLines(scale),
        el('i', { class: 'av-driver-band', style: 'left:' + Math.min(left, right) + '%;width:' + Math.abs(right - left) + '%' })]);
      const b = el('button', { type: 'button', class: 'av-driver-row', 'aria-pressed': 'false' }, [
        el('span', null, [el('strong', null, r.label), el('small', null, '±' + num2(r.step * 100) + ' pp')]), track,
        el('span', null, signedUsd(r.low - base) + ' / ' + signedUsd(r.high - base) + (r.status === 'partial' ? ' · one side' : ''))
      ]);
      b.addEventListener('click', () => show(r)); buttons.set(r.id, b); chart.append(b);
    });
    chart.append(axisRow(scale, v => signedUsd(v).replace('.00', ''), 'av-driver-axis-row'));
    out.append(chart, el('p', { class: 'vv-fine' }, 'Change in value per share around ' + usd(base) + '. The centre line is your case.'),
      editButton(ctx, 'waccStep', 'Edit the steps'), detail);
    const first = valid.find(r => r.id === ui.driver) || valid[0];
    if (first) show(first);
    return out;
  }

  /* Reverse DCF: what the entered price needs. */
  function impliedView(ctx) {
    const r = ctx.implied || A.expectations(ctx), s = ctx.sanity || {};
    const out = el('section', { class: 'av-panel' }, title(null, ctx.annual ? 'All inputs stay fixed. With annual inputs the model solves only the discount rate that gives the share price.' :
      'All other inputs stay fixed. The model solves the revenue growth of years 1–5, or the discount rate, that gives the share price.'));
    const rate = metric('Discount rate that the price implies', M.finite(s.impliedRate) ? pct1(s.impliedRate) : '—',
      M.finite(s.impliedRate) ? 'Your WACC: ' + pct1(ctx.p.rate) + ', with your forecast' : s.impliedRateReason || 'Not available');
    if (!r.ok) {
      // The note says why no growth rate is shown: several fit, none in the range fits, or the search did not run.
      const why = A.priceImplies(r, s).why;
      out.append(el('div', { class: 'av-kpis av-expectations-kpis' }, [metric('Share price', usd(ctx.price), 'Your input'), metric('Growth that the price needs', '—', why.charAt(0).toUpperCase() + why.slice(1)), rate]),
        warning((r.errors && r.errors.length ? r.errors : [r.reason || 'The growth search gave no single growth rate.']).join(' ')), editButton(ctx, 'growth', 'Review the forecast inputs'));
      return out;
    }
    const axis = moneyAxis(Math.max(...r.comparison.map(x => Math.max(x.baseRevenue, x.impliedRevenue))));
    out.append(el('div', { class: 'av-kpis av-kpis-four av-expectations-kpis' }, [
      metric('Share price', usd(ctx.price), 'Your input'),
      metric('Growth that the price needs', pct1(r.growth), 'Each year in years 1–5'),
      metric('Against your growth', pp(r.deltaGrowth), 'Your growth: ' + pct1(ctx.p.growth)),
      rate
    ]),
      charts.chartBox('Revenue path that the price needs', 'Your forecast against the path that gives the share price.', charts.barChart(r.comparison.map(x => ({ ...x, t: x.year })), [
        { key: 'baseRevenue', label: 'Your forecast', color: colors[1] }, { key: 'impliedRevenue', label: 'Needed for the price', color: brass }])),
      el('details', { class: 'av-compact-controls', 'data-fold': 'implied-table' }, [el('summary', null, 'Show the yearly figures'),
        table(['Year', 'Your forecast', 'Needed for the price'], r.comparison.map(x => [String(x.year), axis.label(x.baseRevenue), axis.label(x.impliedRevenue)]), 'Revenue by year')]),
      el('p', { class: 'vv-fine' }, 'The price and the claims give a target enterprise value of ' + money(r.targetEnterprise) + '. WACC stays at ' + pct2(ctx.p.rate) +
        ' in the growth solve. A needed growth rate is not a forecast.'),
      editButton(ctx, 'price', 'Change the share price'));
    return out;
  }

  window.AnalystVisuals = { headline, answer, businessView, forecastTable, terminalChecks, wacc, heatmap, scenarioView, rangeView, driverView, impliedView };
})();
