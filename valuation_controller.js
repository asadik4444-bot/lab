/* Controller of the company valuation page.
   It builds the input form, reads it, runs the shared engines once for each redraw and gives one context to the views.
   The page has two levels. Simple is one view: one chart and three assumptions. Detailed is a path of five steps;
   each step answers one question and shows the inputs of that step only.
   Calculation stays in DetailedMath and AnalystMath. Company data and page chrome stay in CompanyWorkspace. */
(async function () {
  'use strict';
  const $ = id => document.getElementById(id), M = window.DetailedMath, A = window.AnalystMath, el = window.Lab.el;
  const workspace = window.CompanyWorkspace, {LIMITS, problems} = window.CompanyInputs;
  const profile = await workspace.load();
  if (!profile) return;

  const STEPS = ['business', 'forecast', 'value', 'range', 'price'];
  const STEP_NAMES = {business: 'The business', forecast: 'The forecast', value: 'The value', range: 'The range', price: 'The price'};
  // The input that "More inputs of this step" opens in the drawer.
  const STEP_FIELD = {forecast: 'taxRate', value: 'riskFree', price: 'price'};
  const MODES = ['simple', ...STEPS];
  // Links to the earlier view names open the step that now holds their content.
  const ALIASES = {summary: 'value', scenarios: 'range', implied: 'price', story: 'value', ranges: 'range', workbench: 'forecast', drivers: 'range', expectations: 'price'};
  // Field: [key, label, unit, options]. The value, note, source and date come from the company profile.
  // The limits of the model inputs come from CompanyInputs.LIMITS. The coverage check tests the same list.
  const GROUPS = [
    {id: 'business', title: 'The business · earnings and reinvestment', fields: [
      ['revenue', 'Opening revenue', 'USD millions', LIMITS.revenue],
      ['growth', 'Revenue growth · years 1–5', '%', LIMITS.growth],
      ['margin', 'Opening EBIT margin', '%', LIMITS.margin],
      ['targetMargin', 'Year 10 EBIT margin', '%', LIMITS.targetMargin],
      ['taxRate', 'Operating tax rate', '%', LIMITS.taxRate],
      ['daRatio', 'Depreciation / revenue', '%', LIMITS.daRatio],
      ['capexRatio', 'Capex / revenue', '%', LIMITS.capexRatio],
      ['wcRatio', 'Working capital / revenue', '%', LIMITS.wcRatio]
    ]},
    {id: 'share', title: 'The share · price, count and dates', fields: [
      ['price', 'Share price', 'USD', LIMITS.price],
      ['shares', 'Current shares', 'millions', LIMITS.shares],
      ['valuationDate', 'Valuation date', 'date', {type: 'date'}],
      ['shareDate', 'Share count date', 'date', {type: 'date'}]
    ]},
    {id: 'capital', title: 'Capital and risk · WACC', fields: [
      ['riskFree', 'Risk-free rate', '%', LIMITS.riskFree],
      ['beta', 'Equity beta', 'times market risk', LIMITS.beta],
      ['erp', 'Equity risk premium', '%', LIMITS.erp],
      ['costDebt', 'Borrowing cost', '%', LIMITS.costDebt],
      ['debtTaxRate', 'Debt tax shield rate', '%', LIMITS.debtTaxRate],
      ['debtWeightValue', 'Debt value for capital weights', 'USD millions', LIMITS.debtWeightValue]
    ]},
    {id: 'claims', title: 'From enterprise to equity · claims and surplus assets', fields: [
      ['debt', 'Debt', 'USD millions', LIMITS.debt],
      ['financeLeases', 'Additional finance leases', 'USD millions', LIMITS.financeLeases],
      ['nci', 'Non-controlling interest', 'USD millions', LIMITS.nci],
      ['cash', 'Surplus cash', 'USD millions', LIMITS.cash],
      ['investments', 'Non-operating investments', 'USD millions', LIMITS.investments]
    ]},
    {id: 'terminal', title: 'Beyond year 10 · terminal value', fields: [
      ['terminalGrowth', 'Terminal growth', '%', LIMITS.terminalGrowth],
      ['terminalRoc', 'Terminal return on capital', '%', LIMITS.terminalRoc]
    ]},
    {id: 'multiples', title: 'Multiples · earnings and bands', analysis: true, fields: [
      ['eps', 'Diluted earnings per share', 'USD', {required: false}],
      ['peLow', 'Lower P/E', 'times earnings', {min: 0, required: false}],
      ['peHigh', 'Upper P/E', 'times earnings', {min: 0, required: false}],
      ['ebitda', 'Operating EBITDA', 'USD millions', {required: false}],
      ['evLow', 'Lower EV / EBITDA', 'times EBITDA', {min: 0, required: false}],
      ['evHigh', 'Upper EV / EBITDA', 'times EBITDA', {min: 0, required: false}],
      ['earningsBasis', 'Earnings period and basis', '', {type: 'text', required: false}]
    ]},
    {id: 'steps', title: 'Steps · case and sensitivity changes', analysis: true, fields: [
      ['waccStep', 'WACC step', 'percentage points', {min: .000001, required: false}],
      ['growthStep', 'Revenue growth step', 'percentage points', {min: .000001, required: false}],
      ['marginStep', 'Year 10 margin step', 'percentage points', {min: .000001, required: false}],
      ['terminalStep', 'Terminal growth step', 'percentage points', {min: .000001, required: false}],
      ['capexStep', 'Capex step', 'percentage points', {min: .000001, required: false}],
      ['wcStep', 'Working capital step', 'percentage points', {min: .000001, required: false}]
    ]}
  ];
  const fields = {}, definitions = {}, defaults = {};
  // What the visitor selected in the views. A redraw after an edit keeps it.
  const ui = {scenario: 1, year: 0, driver: null, folds: {}, step: 'business'};
  /* The address names the view: no "design" for the simple view, the name of a step for the detailed path. */
  function modeOfAddress() {
    const named = new URLSearchParams(location.search).get('design') || 'simple', known = ALIASES[named] || named;
    return MODES.includes(known) ? known : 'simple';
  }
  let mode = modeOfAddress();
  if (mode !== 'simple') ui.step = mode;
  /* push: the visitor changed the view, so the address gets a new entry in the history, and the Back button of
     the browser returns to the view before. Without push (the first load) the address is only corrected. */
  function updateUrl(push) {
    const url = new URL(location.href);
    url.searchParams.delete('version');
    if (mode === 'simple') url.searchParams.delete('design'); else url.searchParams.set('design', mode);
    const next = url.pathname + url.search + url.hash;
    if (next !== location.pathname + location.search + location.hash) history[push ? 'pushState' : 'replaceState'](null, '', next);
  }
  /* Show another view. fromEnd: the visitor used a button below a view, so the page moves to the start of the new one. */
  function show(next, fromEnd) {
    mode = MODES.includes(next) ? next : 'simple';
    if (mode !== 'simple') ui.step = mode;
    updateUrl(true); draw();
    if (!fromEnd) return;
    document.querySelector(mode === 'simple' ? '.ws-bar' : '.ws-steps').scrollIntoView({block: 'start'});
    $(mode === 'simple' ? 'main' : 'workspace-chart').focus({preventScroll: true});
  }
  /* The parts of the page that depend on the view: the level, the step, the inputs of the step, back and next. */
  function chrome() {
    const detailed = mode !== 'simple', index = STEPS.indexOf(mode), host = $('design');
    host.className = 'ws-page ws-view-' + mode;
    host.dataset.level = detailed ? 'detailed' : 'simple';
    document.querySelectorAll('.ws-levels [data-level]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.level === 'detailed') === detailed)));
    document.querySelectorAll('.ws-steps [data-mode]').forEach(b => { if (b.dataset.mode === mode) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    let own = false;
    document.querySelectorAll('.ws-controls [data-step]').forEach(n => { n.hidden = n.dataset.step !== mode; own = own || !n.hidden; });
    document.querySelector('.ws-controls').hidden = !own;
    document.querySelector('.ws-main').classList.toggle('ws-main-wide', !own);
    $('step-inputs').hidden = !STEP_FIELD[mode];
    $('step-back').textContent = 'Back: ' + (index > 0 ? STEP_NAMES[STEPS[index - 1]] : 'Simple view');
    $('step-next').hidden = index < 0 || index === STEPS.length - 1;
    if (!$('step-next').hidden) $('step-next').textContent = 'Next: ' + STEP_NAMES[STEPS[index + 1]];
  }

  GROUPS.forEach(group => {
    const detail = el('details', {class: 'assumption-group', 'data-group': group.id}, el('summary', null, [el('span', null, group.title), el('small', {class: 'ws-group-count'})]));
    const grid = el('div', {class: 'assumption-grid'});
    group.fields.forEach(([key, label, unit, options]) => {
      const reference = profile.inputs[key], seed = reference ? reference.value : null;
      definitions[key] = {label, unit, ...options};
      defaults[key] = seed;
      const node = el('input', {id: 'assumption-' + key, name: key, type: options.type || 'number', step: 'any'});
      node.required = options.required !== false;
      if (group.analysis) node.dataset.analysis = 'true';
      node.value = seed == null ? '' : String(seed);
      if (options.min != null) node.min = options.min;
      if (options.max != null) node.max = options.max;
      node.setAttribute('aria-describedby', node.id + '-note');
      fields[key] = node;
      grid.append(el('label', {class: 'assumption-field', for: node.id}, [
        el('span', null, label), el('small', {class: 'assumption-unit'}, unit), node,
        el('small', {id: node.id + '-note'}, (reference && reference.note) || 'Enter your own assumption.')
      ]));
      if (reference) workspace.attach(node, reference);
    });
    detail.append(grid);
    if (group.id === 'business') {
      const fade = el('input', {type: 'checkbox', id: 'capex-fades'});
      fade.checked = true;
      detail.append(el('label', {class: 'assumption-check'}, [fade,
        el('span', null, 'In the generated forecast, capex above depreciation is growth investment: it returns to the depreciation level in years 6–10, as growth fades. Turn this off to hold the capex ratio for all ten years. Annual inputs replace this rule.')]));
    }
    if (group.id === 'terminal') {
      const track = el('input', {type: 'checkbox', id: 'terminal-tracks-wacc'});
      track.checked = true;
      detail.append(el('label', {class: 'assumption-check'}, [track,
        el('span', null, 'Use WACC as the terminal return on capital. Investment after year 10 then earns only its cost and creates no extra value. Terminal growth still sets the profit of year 11. Turn this off to enter your own return.')]));
    }
    if (group.id === 'multiples') {
      const check = el('input', {type: 'checkbox', id: 'range-eps-verified'});
      check.checked = profile.epsClassVerified;
      detail.append(el('label', {class: 'assumption-check'}, [check, el('span', null, '')]));
    }
    $('assumption-groups').append(detail);
  });

  const annualKeys = ['growth', 'margin', 'taxRate', 'daRatio', 'capexRatio', 'wcRatio'];
  const annualLabels = ['revenue growth', 'EBIT margin', 'tax rate', 'depreciation / revenue', 'capex / revenue', 'working capital / revenue'];
  const annualFields = Array.from({length: 10}, (_, i) => {
    const row = el('tr', null, el('th', {scope: 'row'}, 'Year ' + (i + 1))), inputs = {};
    annualKeys.forEach((key, j) => {
      const node = el('input', {type: 'number', step: 'any', id: 'annual-' + (i + 1) + '-' + key,
        'aria-label': 'Year ' + (i + 1) + ' ' + annualLabels[j] + ', percent'});
      node.disabled = true;
      if (key === 'growth') node.min = '-99.99';
      if (key === 'margin') { node.min = '-100'; node.max = '100'; }
      if (key === 'taxRate') { node.min = '0'; node.max = '99.99'; }
      if (key === 'daRatio' || key === 'capexRatio') node.min = '0';
      inputs[key] = node; row.append(el('td', null, node));
    });
    $('annual-inputs').append(row); return inputs;
  });

  const amount = node => node.value.trim() === '' ? null : Number(node.value);
  const fmt = n => Number(n.toFixed(2)).toLocaleString('en-US', {maximumFractionDigits: 2});
  const read = () => Object.fromEntries(Object.entries(fields).map(([key, node]) => [key, node.type === 'number' ? amount(node) : node.value]));
  function revealField(node) {
    workspace.open();
    let detail = node.closest('details');
    while (detail) { detail.open = true; detail = detail.parentElement.closest('details'); }
    node.scrollIntoView({behavior: 'instant', block: 'center'});
    node.focus({preventScroll: true});
  }
  // With a field key: open the drawer at that field. Without one: open it at its start.
  function openAssumptions(key) {
    if (typeof key === 'string' && fields[key]) revealField(fields[key]);
    else workspace.open(true);
  }
  function syncQuickControls(q) {
    [['growth', 'growth', -5, 20], ['margin', 'targetMargin', 10, 35], ['beta', 'beta', .5, 2]].forEach(([id, key, low, high]) => {
      const slider = $(id), n = q[key];
      slider.disabled = $('annual-overrides').checked && id !== 'beta';
      if (M.finite(n)) {
        // An exact field can leave the first slider interval. The slider follows it; it never clamps the input.
        slider.min = Math.min(low, n); slider.max = Math.max(high, n); slider.value = n;
      }
      // Beta shows up to four decimals: the rate slider of the simple view sets it that exactly.
      $(id + '-out').textContent = !M.finite(n) ? 'Required' : id === 'beta' ? n.toLocaleString('en-US', {maximumFractionDigits: 4}) : fmt(n) + '%';
    });
    const annual = $('annual-overrides').checked;
    $('quick-control-note').textContent = annual && mode === 'forecast' ? 'Annual inputs are active. Edit growth and margin in the ten-year table.' : '';
    // The notes of the two sliders describe the generated forecast. They say so when the ten annual rows replace it.
    $('growth-note').textContent = annual ? 'Not in use: the ten annual rows set the growth.' : 'Each year, years 1–5. Then it fades.';
    $('margin-note').textContent = annual ? 'Not in use: the ten annual rows set the margin.' : 'The share of sales left as operating profit.';
  }
  function seedAnnual() {
    const q = read();
    if (annualKeys.some(k => !M.finite(q[k])) || !M.finite(q.targetMargin) || !M.finite(q.terminalGrowth)) {
      $('assumption-status').textContent = 'Complete the operating and terminal assumptions before you copy the forecast.';
      return false;
    }
    // The same generated path as the engine. It is linear, so percent values go in and percent values come out.
    const rows = M.path({...q, capexFade: $('capex-fades').checked});
    annualFields.forEach((row, i) => annualKeys.forEach(key => { row[key].value = Number(rows[i][key].toPrecision(12)); }));
    return true;
  }
  function setAnnualMode() {
    const on = $('annual-overrides').checked;
    annualFields.forEach(row => Object.values(row).forEach(n => { n.disabled = !on; n.required = on; }));
    // The capex rule shapes the generated forecast only. With annual inputs its check box has no effect, so it is locked.
    $('capex-fades').disabled = on;
    $('annual-note').textContent = on ?
      'These ten rows replace the generated operating path. Opening revenue and opening working capital still come from the main inputs. The generated cases and the reverse growth solve need the generated path, so they show as unavailable.' :
      'The model generates the forecast from your operating assumptions. Turn on annual inputs to replace this path.';
  }
  /* No result: one card says what is missing and gives one way forward. Both levels of the page show the same card. */
  function invalid(message, nodes = [], prompt = null) {
    const q = read();
    $('design').dataset.state = 'blocked';
    workspace.update(null, q, mode, changedCount(q));
    const card = el('div', {class: 'assumption-error', role: 'alert'}, [
      el('h2', null, prompt ? prompt.title : 'Complete the assumptions to see a value.'), el('p', null, message)]);
    if (prompt && prompt.price) {
      // The share price is the one missing input. The visitor enters it in the card.
      const input = el('input', {id: 'prompt-price', type: 'number', min: LIMITS.price.min, step: 'any', inputmode: 'decimal', required: true});
      const form = el('form', {class: 'assumption-actions ws-prompt-price', novalidate: true}, [el('label', {for: 'prompt-price'}, 'Share price, USD'), input,
        el('button', {type: 'submit', class: 'assumption-button assumption-primary', 'data-prompt': 'price'}, 'Show the value')]);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (input.value.trim() !== '' && input.checkValidity()) { fields.price.value = input.value; draw(); } else input.reportValidity();
      });
      card.append(form);
    } else {
      const edit = el('button', {type: 'button', class: 'assumption-button', 'data-prompt': 'edit'}, prompt ? prompt.action : 'Edit the missing or invalid inputs');
      edit.addEventListener('click', () => { if (prompt && prompt.run) prompt.run(); else if (nodes[0]) revealField(nodes[0]); else openAssumptions(); });
      const offer = prompt && prompt.offer ? el('button', {type: 'button', class: 'assumption-button assumption-primary', 'data-prompt': 'offer'}, prompt.offer.label) : null;
      if (offer) offer.addEventListener('click', prompt.offer.run);
      card.append(el('div', {class: 'assumption-actions'}, [offer, edit]));
    }
    $('visual-output').replaceChildren(card);
    $('assumption-status').textContent = message;
    $('assumptions-summary').textContent = 'Check inputs';
    $('calculation-basis').textContent = 'No result is shown while a required input is missing or invalid.';
    $('full-input-basis').textContent = '';
  }
  function changedCount(q) {
    return Object.keys(fields).filter(k => k !== 'terminalRoc' && String(q[k] ?? '') !== String(defaults[k] ?? '')).length +
      ($('terminal-tracks-wacc').checked ? 0 : 1) + ($('annual-overrides').checked ? 1 : 0) + ($('capex-fades').checked ? 0 : 1) +
      ($('range-eps-verified').checked === profile.epsClassVerified ? 0 : 1);
  }
  // The views mark their fold-out sections with data-fold. An open section stays open after a redraw.
  function restoreFolds() {
    $('visual-output').querySelectorAll('details[data-fold]').forEach(d => {
      const key = d.dataset.fold;
      if (key in ui.folds) d.open = ui.folds[key];
      d.addEventListener('toggle', () => { ui.folds[key] = d.open; });
    });
  }
  // A lever of a view sets one input of the form. The form stays the single place that holds the inputs.
  function setInput(key, value) { fields[key].value = String(value); draw(); }
  function draw() {
    const q = read(), followsWacc = $('terminal-tracks-wacc').checked;
    fields.terminalRoc.disabled = followsWacc;
    fields.terminalRoc.required = !followsWacc;
    chrome();
    syncQuickControls(q);
    const bad = Array.from($('assumption-form').querySelectorAll('input')).filter(n => !n.disabled && !n.dataset.analysis && !n.checkValidity());
    if (bad.length) {
      // One missing market input is a prompt, not an error: the other inputs are already prefilled.
      const only = key => bad.every(n => n.name === key);
      if (only('price')) {
        invalid('The filing inputs are ready. The model compares its value with the price. It also uses the price for the market value of equity in WACC.', bad,
          {title: 'Enter the share price to start.', price: true});
      } else if (bad.every(n => n.name === 'shares' || n.name === 'price') && bad.some(n => n.name === 'shares')) {
        // No cover count: the company has two or more share classes. The visitor can start from the filing's
        // diluted average with one click. The page never takes it without that click.
        const s = profile.shareSuggestion, both = bad.length > 1;
        invalid(profile.inputs.shares.note + (s ? ' The filing gives a diluted average of ' + fmt(s.value) + ' million shares for the year to ' + window.Lab.date(s.date) +
            ', for all share classes. It is not the current count, but it is a fair start.' : ' Enter the current count that matches the price.'), [fields.shares],
          {title: both ? 'Enter the share count and the share price to start.' : 'Enter the current share count to start.', action: 'Enter the share count',
            offer: s ? {label: 'Use the diluted average: ' + fmt(s.value) + ' million', run: () => { fields.shares.value = String(s.value); fields.shareDate.value = s.date; draw(); }} : null});
      } else {
        const names = bad.slice(0, 4).map(n => definitions[n.name]?.label || n.getAttribute('aria-label') || 'Required input');
        invalid('Check ' + names.join(', ') + (bad.length > 4 ? ', and ' + (bad.length - 4) + ' more fields.' : '.'), bad);
      }
      return;
    }
    // The rules that the coverage check also applies. The limits of the form stop most of them before this point.
    const stop = problems(q, followsWacc)[0];
    if (stop) {
      invalid(stop[1] === 'order' ? 'The share count date cannot follow the valuation date.' : 'Check ' + definitions[stop[0]].label + '.', [fields[stop[0]]]);
      return;
    }
    const capital = {riskFree: q.riskFree / 100, beta: q.beta, erp: q.erp / 100, costDebt: q.costDebt / 100,
      debtTaxRate: q.debtTaxRate / 100, equity: q.price * q.shares, debtWeightValue: q.debtWeightValue};
    const w = M.wacc({...capital, taxRate: capital.debtTaxRate});
    if (!w.ok) { invalid(w.errors.join(' ')); return; }
    if (followsWacc) fields.terminalRoc.value = Number((w.rate * 100).toFixed(2));
    const p = {revenue: q.revenue, growth: q.growth / 100, margin: q.margin / 100, targetMargin: q.targetMargin / 100,
      taxRate: q.taxRate / 100, daRatio: q.daRatio / 100, capexRatio: q.capexRatio / 100, wcRatio: q.wcRatio / 100,
      rate: w.rate, terminalGrowth: q.terminalGrowth / 100, terminalRoc: followsWacc ? w.rate : q.terminalRoc / 100,
      terminalRocTracksWacc: followsWacc, capexFade: $('capex-fades').checked};
    if ($('annual-overrides').checked) {
      p.forecast = annualFields.map(row => Object.fromEntries(annualKeys.map(key => [key, amount(row[key]) / 100])));
    }
    const bridge = {debt: q.debt, financeLeases: q.financeLeases, nci: q.nci, cash: q.cash, investments: q.investments};
    const d = M.dcf(p), e = d.ok ? M.equity(d.enterprise, bridge, q.shares) : d;
    if (!e.ok) { invalid(e.errors.join(' ')); return; }
    const analysis = {eps: q.eps, peLow: q.peLow, peHigh: q.peHigh, ebitda: q.ebitda, evLow: q.evLow, evHigh: q.evHigh,
      epsClassVerified: $('range-eps-verified').checked, bandOrigin: workspace.bandOrigin(q)};
    ['waccStep', 'growthStep', 'marginStep', 'terminalStep', 'capexStep', 'wcStep'].forEach(k => { analysis[k] = q[k] == null ? null : q[k] / 100; });
    const changed = changedCount(q);
    const context = {p, d, e, bridge, shares: q.shares, w, price: q.price, capital, analysis, ui,
      valuationDate: q.valuationDate, shareDate: q.shareDate, earningsBasis: q.earningsBasis, editAssumptions: openAssumptions,
      company: profile.company, period: profile.period, annual: $('annual-overrides').checked, changed, setInput, showStep: step => show(step, true), reset: () => $('reset-assumptions').click(),
      // True when the visitor changed this input from the company default.
      edited: key => String(q[key] ?? '') !== String(defaults[key] ?? ''),
      // Placeholder values that the visitor did not replace.
      assumed: (profile.provisionalFields || []).filter(k => String(q[k] ?? '') === String(profile.inputs[k].value ?? ''))};
    // One reverse solve and one set of cross-checks for each redraw. The headline and the views use the same results.
    context.sanity = A.sanity(context);
    context.implied = A.expectations(context);
    $('design').dataset.state = 'ready';
    $('visual-output').replaceChildren();
    if (mode === 'simple') simple.update(context);
    else { window.ValueVisuals.render($('visual-output'), context, mode); restoreFolds(); }
    $('assumptions-summary').textContent = changed ? changed + (changed === 1 ? ' setting changed' : ' settings changed') : 'Company defaults';
    $('assumption-status').textContent = 'The DCF inputs are complete. The multiples check their own optional inputs.';
    $('calculation-basis').textContent = 'Valuation date ' + window.Lab.date(q.valuationDate) + ' · share count at ' + window.Lab.date(q.shareDate) +
      ' · ten model years · ' + ($('annual-overrides').checked ? 'annual inputs' : 'generated forecast');
    $('full-input-basis').textContent = 'Current inputs: ' + Object.entries(q)
      .filter(([k]) => k !== 'terminalRoc')
      .map(([k, v]) => definitions[k].label + ' ' + (typeof v === 'number' ? fmt(v) : v == null ? '—' : v) +
        (definitions[k].unit === 'date' || !definitions[k].unit ? '' : ' ' + definitions[k].unit)).join('; ') +
      '; terminal return on capital ' + fmt(p.terminalRoc * 100) + '% (' + (followsWacc ? 'equals WACC' : 'your assumption') +
      '); ' + ($('annual-overrides').checked ? 'annual inputs are active: the ten rows set growth, EBIT margin, tax, depreciation, capex and working capital of each forecast year.' :
        'capex above depreciation ' + (p.capexFade ? 'fades to depreciation in years 6–10.' : 'is held for ten years.'));
    workspace.update(context, q, mode, changed);
  }

  document.querySelectorAll('.ws-steps [data-mode]').forEach(b => b.addEventListener('click', () => show(b.dataset.mode)));
  document.querySelectorAll('.ws-levels [data-level]').forEach(b => b.addEventListener('click', () => show(b.dataset.level === 'simple' ? 'simple' : ui.step)));
  $('step-back').addEventListener('click', () => { const i = STEPS.indexOf(mode); show(i > 0 ? STEPS[i - 1] : 'simple', true); });
  $('step-next').addEventListener('click', () => { const i = STEPS.indexOf(mode); if (i >= 0 && i < STEPS.length - 1) show(STEPS[i + 1], true); });
  $('step-inputs').addEventListener('click', () => openAssumptions(STEP_FIELD[mode]));
  // The Back and Forward buttons of the browser move between the views of this visit.
  // An open inputs drawer closes, so the visitor sees the view that the address now names.
  window.addEventListener('popstate', () => {
    const next = modeOfAddress();
    if (next === mode) return;
    mode = next;
    if (mode !== 'simple') ui.step = mode;
    draw();
    if ($('workspace-inputs').open) $('close-inputs').click();
  });
  [['growth', 'growth'], ['margin', 'targetMargin'], ['beta', 'beta']].forEach(([id, key]) => {
    $(id).addEventListener('input', () => { fields[key].value = $(id).value; draw(); });
  });
  $('assumption-form').addEventListener('input', e => {
    if (e.target.id === 'annual-overrides') setAnnualMode();
    draw();
  });
  $('assumption-form').addEventListener('submit', e => {
    e.preventDefault(); draw();
    const bad = Array.from($('assumption-form').querySelectorAll('input')).find(n => !n.disabled && !n.checkValidity());
    if (bad) { revealField(bad); bad.reportValidity(); }
  });
  $('seed-annual').addEventListener('click', () => { if (seedAnnual()) draw(); });
  $('reset-assumptions').addEventListener('click', () => {
    Object.entries(defaults).forEach(([k, v]) => { fields[k].value = v == null ? '' : String(v); });
    $('terminal-tracks-wacc').checked = true; $('annual-overrides').checked = false; $('capex-fades').checked = true;
    $('range-eps-verified').checked = profile.epsClassVerified;
    seedAnnual(); setAnnualMode(); draw();
  });
  document.querySelectorAll('[data-open-assumptions]').forEach(b => b.addEventListener('click', () => openAssumptions()));
  const simple = window.ValuationSimple.mount($('simple-view'), {company: profile.company, period: profile.period});
  seedAnnual();
  workspace.setup(fields, draw, openAssumptions);
  setAnnualMode(); updateUrl(); draw();
})();
