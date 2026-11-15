/* Detailed models use reported inputs as references and visitor assumptions only in this browser. */
(function () {
  'use strict';
  const M = window.DetailedMath, L = window.Lab, el = L.el;
  const value = n => n && M.finite(n.value) ? n.value : null;
  const pct = x => M.finite(x) ? (x * 100).toFixed(2) + '%' : '—';
  const number = x => M.finite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
  const money = x => M.finite(x) ? '$' + number(x) + 'm' : '—';
  const valText = x => M.finite(x) ? String(+x.toPrecision(12)) : '';
  function table(headers, rows) {
    const t = el('table', { class: 'dtable' }, [
      el('thead', null, el('tr', null, headers.map(h => el('th', { scope: 'col' }, h)))),
      el('tbody', null, rows.map(r => el('tr', null, r.map((c, i) => el(i ? 'td' : 'th', i ? null : { scope: 'row' }, c)))))
    ]);
    return el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': headers.join(', ') }, t);
  }
  function formPanel(host, title, intro) {
    host.replaceChildren(el('h2', { class: 'statement' }, title), el('p', { class: 'lede' }, intro));
    const form = el('form', { class: 'model-form', novalidate: '' }), output = el('div', { class: 'model-output', 'aria-live': 'polite' });
    const fields = {}, metadata = [];
    function group(name, open = true) {
      const grid = el('div', { class: 'model-grid' });
      const box = el('details', { class: 'fold' }, [el('summary', null, name), grid]);
      box.open = open; form.append(box); return grid;
    }
    function input(parent, key, label, v, note, opts = {}) {
      const node = el('input', { type: opts.type || 'number', id: 'model-' + key, name: key, step: 'any' });
      if (node.type === 'number') node.value = valText(v); else node.value = v || '';
      if (opts.required !== false) node.required = true;
      if (opts.min != null) node.min = opts.min;
      if (opts.max != null) node.max = opts.max;
      const small = el('small', { id: 'model-note-' + key }, note || 'Visitor assumption. Required before calculation.');
      node.setAttribute('aria-describedby', small.id);
      parent.append(el('label', { class: 'model-field', for: node.id }, [el('span', null, label), node, small]));
      fields[key] = node; metadata.push({ key, label, note });
      return node;
    }
    function check(parent, key, text, checked = false) {
      const n = el('input', { type: 'checkbox', id: 'model-' + key }); n.checked = checked;
      parent.append(el('label', { class: 'model-check', for: n.id }, [n, el('span', null, text)]));
      fields[key] = n; return n;
    }
    function read() {
      return Object.fromEntries(Object.entries(fields).map(([k, n]) => [k,
        n.type === 'checkbox' ? n.checked : n.type === 'number' ? (n.value.trim() === '' ? null : Number(n.value)) : n.value]));
    }
    const button = el('button', { class: 'btn', type: 'submit' }, 'Calculate with these assumptions');
    const reset = el('button', { class: 'btn', type: 'button' }, 'Reset inputs');
    reset.addEventListener('click', () => { form.reset(); output.replaceChildren(el('p', null, 'Inputs reset. Calculate again to update the result.')); });
    function finish(calculate) {
      form.append(el('div', { class: 'model-actions' }, [button, reset]));
      host.append(form, output);
      // Assign explicit reset defaults after all fields exist.
      Object.values(fields).forEach(n => { if (n.type === 'checkbox') n.defaultChecked = n.checked; else n.defaultValue = n.value; });
      const changed = () => { if (output.dataset.calculated) { output.replaceChildren(el('p', { class: 'model-warning' }, 'Inputs changed. Calculate again to update the result.')); delete output.dataset.calculated; } };
      form.addEventListener('input', changed);
      form.addEventListener('submit', e => {
        e.preventDefault();
        if (!form.checkValidity()) {
          const bad = Array.from(form.querySelectorAll(':invalid'));
          bad.forEach(n => { const d = n.closest('details'); if (d) d.open = true; });
          output.replaceChildren(el('p', {class:'model-warning',role:'alert'}, 'Complete the required inputs and confirmations.'));
          if (bad[0]) { bad[0].focus(); bad[0].reportValidity(); }
          return;
        }
        const q=read();
        if(q.shareDate && q.valuationDate && q.shareDate>q.valuationDate){
          output.replaceChildren(el('p',{class:'model-warning',role:'alert'},'The share-count date cannot follow the valuation date.'));return;
        }
        output.replaceChildren(); output.dataset.calculated = '1';
        calculate(q, output);
      });
      const gaps = Object.values(fields).filter(n => n.required && (n.type === 'checkbox' ? !n.checked : !n.value)).length;
      output.append(el('p', { class: 'model-warning' }, gaps ? gaps + ' required inputs need an assumption. Reported facts remain visible above.' : 'Review the assumptions, then calculate.'));
      host.append(el('p', { class: 'disc' }, 'Hypothetical model on stated assumptions. Not investment advice. No price targets. Inputs stay in this browser tab.'));
    }
    return { form, fields, metadata, group, input, check, finish, output };
  }
  function errors(out, r) {
    out.append(el('p', { class: 'model-warning', role: 'alert' }, r.errors.join(' ')));
  }
  function factNote(n, c) {
    if (!n || value(n) == null) return 'Missing reported input. Enter an explicit assumption. ' + ((n && n.reason) || '');
    const dates = [...new Set((n.inputs || []).map(i => i.period_end).filter(Boolean))];
    return 'Reported reference ' + (dates.join(', ') || (c.fy && c.fy.end) || 'date unavailable') +
      (n.partial ? '. Partial: ' + n.partial : '') + '. Editing this value creates an assumption.';
  }

  /* The P/E form of a financial company. Every other company uses the valuation workspace (valuation.html),
     so this form has no enterprise DCF. */
  function company(host, c, data, market) {
    const v = c.valuation || {};
    const panel = formPanel(host, 'What could this business be worth?',
      'Generic enterprise DCF and EV/EBITDA do not apply to banks and insurers. A class-matched P/E is available below.');
    const { group, input, check } = panel;
    if ((c.quality_flags || []).length) host.append(el('details',{class:'fold'},[
      el('summary',null,'Source checks to review · '+c.quality_flags.length),
      el('p',{class:'cap'},'These checks did not pass. Invalid candidates can be excluded from the data. Review the filing before using the related assumption. Annual weighted-average shares are not used as current shares.'),
      el('ul',null,c.quality_flags.map(t=>el('li',null,t)))
    ]));
    const g1 = group('01 · Price and current shares');
    input(g1, 'price', 'Your share price · USD', null, 'Visitor input. No market price is fetched.', { min: 0.000001 });
    const sh = c.shares_for_per_share || {};
    const reliable = sh.basis === 'dei_cover' && sh.value > 0;
    const legacyCover = market && market.shares_basis === 'dei_cover' && market.shares > 0;
    const shares = reliable ? sh.value : legacyCover ? market.shares : null;
    const shareDate = reliable ? sh.date : legacyCover ? market.shares_end : sh.date || null;
    input(g1, 'shares', 'Current equivalent shares · millions', shares == null ? null : shares / 1e6,
      shares == null ? (sh.basis==='filing_class_equivalent' && sh.value>0 ?
        'Filing reference: '+number(sh.value/1e6)+' million class-equivalent shares at '+shareDate+'. This may use a different class from the ticker price. Convert and enter the price-compatible count explicitly.' :
        'Current shares unavailable. Enter a share count and verify the share class. '+(sh.reason||'')) :
        'SEC cover count at ' + shareDate + '. Check subsequent splits, issuance, and share-class equivalents.', { min: 0.000001 });
    input(g1, 'valuationDate', 'Valuation date', new Date().toISOString().slice(0, 10), 'Forecast year 1 ends one year after this date.', { type: 'date' });
    input(g1, 'shareDate', 'Share count date', shareDate, 'Date of the share count or your assumption.', { type: 'date' });
    const shareCheck = check(g1, 'shareVerified', 'I verified that the current count and the entered price use the same share-class equivalent.');
    shareCheck.required = true;
    check(g1, 'epsVerified', 'I verified that the entered EPS and price refer to the same share class.');
    input(g1,'eps','Diluted earnings per share · USD',value(v.eps_diluted),
      factNote(v.eps_diluted,c)+' Optional. Enter adjusted EPS to use your own assumption. P/E needs positive, class-matched EPS.',{required:false});
    const inputs = c.model_inputs || {};
    if (inputs.current_shares && inputs.current_shares.source) {
      g1.append(el('a', { href: inputs.current_shares.source, target: '_blank', rel: 'noopener' }, 'Open share-count filing ↗'));
    }
    panel.finish((q, out) => {
      const r = M.multiples({ ...q, financial: true, epsClassVerified: q.epsVerified }, {});
      if (!r.ok) return errors(out, r);
      out.append(table(['Measure', 'Value'], [['Equity at your price', money(r.marketEquity)], ['P/E · entered EPS', r.pe == null ? 'Needs positive, class-matched EPS' : number(r.pe) + '×']]));
    });
  }

  function buyout(host, sofr) {
    const panel = formPanel(host, 'A detailed hypothetical buyout.',
      'A debt-free, cash-free business. The example starts with $100m EBITDA. All company inputs are assumptions.');
    const g = panel.group('Operating assumptions');
    [['revenue','Opening revenue · USD millions',500],['margin','EBITDA margin · %',20],['growth','Annual revenue growth · %',5],
      ['daRatio','D&A / revenue · %',3],['capexRatio','Capex / revenue · %',4],['wcRatio','Operating WC / revenue · %',10],
      ['taxRate','Cash tax rate · %',25],['years','Holding period · years',5]].forEach(x=>panel.input(g,...x,'Hypothetical assumption.'));
    const deal = panel.group('Sources and uses', false);
    [['entryMultiple','Entry EV / EBITDA · ×',10],['exitMultiple','Exit EV / EBITDA · ×',10],['leverage','Initial debt / EBITDA · ×',5],
      ['feeRate','Transaction fees / entry EV · %',2],['financeFeeRate','Financing fees / initial debt · %',2],
      ['minimumCash','Minimum operating cash · USD millions',10]].forEach(x=>panel.input(deal,...x,'Hypothetical assumption.',{min:0}));
    const debt = panel.group('Debt facilities', false);
    const fixed = panel.check(debt,'fixed','Use a fixed borrowing rate. Otherwise use the reference rate plus spread.');
    [['baseRate','SOFR reference · %',sofr ? sofr.value : null],['spread','Spread · percentage points',4.5],
      ['fixedRate','Fixed rate · %',8],['rateFloor','Reference-rate floor · %',0],['revolverLimit','Revolver limit · USD millions',50],
      ['amortization','Mandatory annual repayment / original debt · %',5],['sweep','Cash sweep · %',100],
      ['maturity','Debt maturity · year',7]].forEach(x=>panel.input(debt,...x,x[0]==='baseRate' && sofr ?
        'New York Fed SOFR at '+sofr.period+'. Assumed constant during the hold.' : 'Hypothetical assumption.'));
    const setRateFields = () => {
      ['baseRate','spread','rateFloor'].forEach(k=>{panel.fields[k].required=!fixed.checked;panel.fields[k].disabled=fixed.checked;});
      panel.fields.fixedRate.required=fixed.checked;panel.fields.fixedRate.disabled=!fixed.checked;
    };
    fixed.addEventListener('change',setRateFields);
    panel.form.addEventListener('reset',()=>queueMicrotask(setRateFields));setRateFields();
    panel.check(debt,'allowEquity','Provide additional equity whenever a funding gap remains. Include each contribution in investor returns.');
    debt.append(el('p',{class:'cap'},'Interest uses opening debt. Repayments occur at year-end. Tax losses carry forward without expiry in this simplified tax schedule. No interest-deduction limits, tax refunds, commitment fees, or automatic refinancing are assumed.'));
    panel.finish((q,out)=>{
      const p = {...q,rateType:q.fixed?'fixed':'floating'};
      ['margin','growth','daRatio','capexRatio','wcRatio','taxRate','feeRate','financeFeeRate','baseRate','spread','fixedRate','rateFloor','amortization','sweep'].forEach(k=>p[k]=q[k]==null?null:q[k]/100);
      const r = M.lbo(p);
      if (!r.ok) errors(out,r);
      if (r.sourcesUses) {
        const s=r.sourcesUses;
        out.append(table(['Sources and uses','USD millions'],[['Purchase enterprise value',number(s.entryEv)],['Fees',number(s.fees)],['Minimum cash',number(s.minimumCash)],
          ['Total uses',number(s.uses)],['Debt funding',number(s.debt0)],['Initial equity',number(s.equityIn)]]));
      }
      if (r.ok) {
        if(ValueVisuals.buyout){const chartHost=el('div');ValueVisuals.buyout(chartHost,r,p);out.prepend(chartHost);}
        out.prepend(el('h3',{class:'statement'},pct(r.irr)+' investor IRR · '+number(r.moic)+'× money invested.'));
        if(r.irrReason)out.append(el('p',{class:'model-warning'},r.irrReason));
        out.append(table(['Exit and returns','Value'],[['Exit EV',money(r.exitEv)],['Equity contributions',money(r.contributions)],
          ['Equity proceeds',money(r.proceeds)],['Borrowing rate',pct(r.rate)]]));
        const ranges=[-1,0,1].map(dx=>{const a=M.lbo({...p,exitMultiple:p.exitMultiple+dx});return [number(p.exitMultiple+dx)+'×',a.ok?pct(a.irr):'Funding gap / invalid'];});
        out.append(table(['Exit EV / EBITDA','Investor IRR'],ranges));
      }
      if (r.rows) out.append(table(['Year','EBITDA','Interest','Tax','Capex','Δ WC','Cash flow','Term debt','Revolver','Cash','Extra equity','Gap'],
        r.rows.map(a=>[String(a.t),...['ebitda','interest','tax','capex','deltaWc','cashFlow','term','revolver','cash','extraEquity','shortfall'].map(k=>number(a[k]))])));
      if(r.rows)out.append(el('details',{class:'fold'},[el('summary',null,'Debt and cash reconciliation · USD millions'),
        table(['Year','Opening term','Opening revolver','Opening cash','Cash flow','Mandatory term','Revolver maturity','New borrowing','New equity','Term sweep','Revolver sweep','Closing term','Closing revolver','Closing cash'],
          r.rows.map(a=>[String(a.t),...['openingTerm','openingRevolver','openingCash','cashFlow','mandatory','maturityRevolver','draw','extraEquity','termPay','revolverPay','term','revolver','cash'].map(k=>number(a[k]))]))]));
      out.append(el('p',{class:'cap'},'All table amounts are USD millions. Negative exit residuals produce zero investor proceeds. A funding gap has no return result.'));
    });
  }
  window.DetailedModels = { company, buyout };
})();
