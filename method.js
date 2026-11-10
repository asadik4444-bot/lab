/* Method: how the Lab is built and checked. Pipeline status, data-quality catches, glossary, sources and licences. */
(function () {
  'use strict';
  var L = Lab, el = L.el, $ = L.$;
  L.shell({ page: 'method' });
  var HUMAN = { float_scale_suspect: 'Float looks mis-scaled', no_listed_ticker: 'No listed ticker', no_shares: 'No share count', shares_proxy: 'Shares: diluted average, no cover count', shares_stale: 'Shares: older than 200 days', float_stale: 'Float: older than about 21 months' };
  /* The newest observation as the series counts it: a quarter, a month or a year. A quarterly survey is dated by its
     survey round, so its end date can lie after today; a period label does not read as a future day. */
  function newest(s) {
    var d = L.parseDate(s.newest_data); if (!d) return L.date(s.newest_data);
    if (/quarterly/.test(s.id)) return 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + ' ' + d.getUTCFullYear();
    if (/monthly/.test(s.id)) return L.month(s.newest_data);
    if (/annual/.test(s.id)) return String(d.getUTCFullYear());
    return L.date(s.newest_data);
  }
  var RULE = { size: 'Size', assets: 'Float above the assets limit', price: 'Impossible share price', other: 'Other' };
  function human(k) { return HUMAN[k] || String(k).replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); }
  function row(cells, cls) { return el('tr', cls ? { 'class': cls } : null, cells); }
  function table(head, rows, rcols) {
    var t = el('table', { 'class': 'dtable' });
    t.appendChild(el('thead', null, el('tr', null, head.map(function (h, i) { return el('th', { scope: 'col', 'class': rcols && rcols.indexOf(i) >= 0 ? 'r' : '' }, h); }))));
    var tb = el('tbody'); rows.forEach(function (r) { tb.appendChild(r); }); t.appendChild(tb);
    return el('div', { 'class': 'table-scroll', tabindex: '0', role: 'region', 'aria-label': head.join(', ') + '. Scrolls sideways if narrow.' }, t);
  }
  function reasonCounts(ex) { var n = {}; ex.forEach(function (e) { n[e.reason] = (n[e.reason] || 0) + 1; }); return Object.keys(n).map(function (r) { return n[r] + ' ' + human(r).toLowerCase(); }).join(', '); }
  function h3(t, extra) { return el('h3', { 'class': 'vsub', style: 'margin-top:' + (extra || 24) + 'px' }, t); }

  Promise.all([L.load('status'), L.load('markets'), L.load('macro_room'), L.load('deals_room'), L.load('company_room')]).then(function (r) {
    var ST = r[0], M = r[1], MA = r[2], DL = r[3], CO = r[4], fs = M.fundamentals_summary;
    L.status();
    $('m-title').textContent = fs.checks + ' checks ran in the latest build; ' + fs.passed + ' passed.';
    var fine = ST.sources.filter(function (s) { return s.state === 'fresh'; }).length;
    $('m-second').textContent = 'The pipeline built these pages on ' + L.stamp(ST.run.built_at) + '; ' + fine + ' of ' + ST.sources.length + ' sources are fine. Every figure shows its date, formula and source; this page shows how.';
    var tabs = L.tabs({ list: $('tablist'), panels: $('panels'), label: 'Method', tabs: [{ id: 'pipeline', name: 'Pipeline status' }, { id: 'catches', name: 'Data-quality catches' }, { id: 'glossary', name: 'Glossary' }, { id: 'sources', name: 'Sources and licences' }] });

    /* ---------- pipeline ---------- */
    var p = $('panel-pipeline');
    p.appendChild(el('h3', { 'class': 'vsub' }, 'Sources: state and newest data'));
    p.appendChild(table(['Source', 'State', 'Newest data', 'Checked', 'Stale series'], ST.sources.map(function (s) {
      return row([el('th', { scope: 'row' }, L.tipLabel(s.label, { title: s.label, def: 'One input of the nightly run. It is fine while its state is fresh; otherwise the strip on every page names it.', formula: 'state = fresh when the newest data is within the source’s limit', working: 'State ' + s.state + '; newest data ' + newest(s) + '; checked ' + L.stamp(s.checked_at) + '.', source: 'status.json', more: 'method.html#pipeline' })), el('td', null, s.state === 'fresh' ? 'fine' : s.state), el('td', null, newest(s)), el('td', null, L.stamp(s.checked_at)), el('td', null, s.stale_series && s.stale_series.length ? s.stale_series.join(', ') : el('span', { 'class': 'rs' }, 'none'))]);
    })));
    p.appendChild(el('p', { 'class': 'cap' }, 'The pipeline last built these pages on ' + L.stamp(ST.run.built_at) + (ST.run.git_commit ? ', code version ' + ST.run.git_commit.slice(0, 7) : '') + (ST.run.github_run_id ? ', run ' + ST.run.github_run_id : '') + '. A quarterly survey is dated by its survey round, which can lie after today.'));
    p.appendChild(h3('What the company checks cover'));
    var cov = fs.coverage, names = { revenue: 'Revenue', revenue_prior: 'Revenue, prior year', growth_yoy: 'Revenue growth', operating_income: 'Operating income', operating_margin: 'Operating margin', cfo: 'Cash from operations', capex: 'Capital spending', fcf: 'Free cash flow', fcf_margin: 'FCF margin', capex_to_revenue: 'Capex / revenue' };
    p.appendChild(table(['Figure', 'Companies with a value', 'Out of'], Object.keys(cov).map(function (k) { return row([el('th', { scope: 'row' }, names[k] || human(k)), el('td', { 'class': 'r' }, String(cov[k])), el('td', { 'class': 'r' }, String(fs.companies))]); }), [1, 2]));
    p.appendChild(el('p', { 'class': 'cap' }, fs.checks + ' automated checks, ' + fs.passed + ' passed, over ' + fs.companies + ' companies; ' + fs.financial_companies + ' are banks or insurers, where operating margin and free cash flow do not apply. Fundamentals built ' + fs.built + ' from SEC EDGAR company facts and submissions.'));
    p.appendChild(el('details', { 'class': 'fold', style: 'margin-top:16px' }, [el('summary', null, ['Files in this build', el('small', null, ST.rooms.length + ' data files with checksums')]), el('div', { 'class': 'fold-body' }, table(['File', 'Bytes', 'SHA-256 (first 12)'], ST.rooms.map(function (f) { return row([el('th', { scope: 'row' }, f.file), el('td', { 'class': 'r' }, L.num(f.bytes)), el('td', null, f.sha256.slice(0, 12))]); }), [1]))]));

    /* ---------- catches ---------- */
    var c = $('panel-catches'), k = M.counts, x = M.cross_check, lim = M.facts.assets_limit;
    c.appendChild(el('div', { 'class': 'panel-head' }, el('h2', { 'class': 'title-sm statement', style: 'font-size:32px;line-height:38px' }, k.excluded_over_assets_limit + ' filings reported a public float above ' + lim + '× their total assets. None made the list.')));
    var chart = el('div', { 'class': 'chart' }); c.appendChild(chart);
    var pts = [];
    M.rows.forEach(function (rw) { if (rw.assets > 0 && rw.public_float > 0) pts.push({ x: rw.assets, y: rw.public_float, kind: 'ranked', title: '#' + rw.rank + ' ' + L.shortName(rw.name), def: 'Public float ' + L.usd(rw.public_float) + ', total assets ' + L.usd(rw.assets) + '.' }); });
    var shown = 0, big = [];
    M.excluded.forEach(function (e) { if (e.rule === 'size') { big.push(e); return; } if (e.assets > 0 && e.public_float > 0) { shown++; pts.push({ x: e.assets, y: e.public_float, kind: 'excluded', title: 'Excluded: ' + L.shortName(e.name), def: e.why }); } });
    L.scatter(chart, pts, { name: 'Public float against total assets, ranked and excluded filings', ratio: lim, ratioLabel: 'float = ' + lim + '× assets', xfmt: L.usd, yfmt: L.usd });
    c.appendChild(el('p', { 'class': 'cap' }, 'Total assets (across) against public float (up), USD, log scales. Navy dots are ranked companies; grey rings are excluded filings; the dashed cashmere line marks float equal to ' + lim + ' times assets. ' + (big.length ? 'Not shown: ' + big.length + ' filings reporting floats above $1,000tn (' + big.map(function (e) { return L.shortName(e.name) + ', ' + L.usd(e.public_float); }).join('; ') + '). ' : '') + 'Source: ' + M.source + '. As of ' + L.date(M.as_of) + '.'));
    c.appendChild(h3('What was checked, and what it caught'));
    var ul = el('ul', { 'class': 'list' });
    [k.ranked + ' companies ranked by public float, from a pool of ' + k.pool + ' filings.', M.excluded.length + ' filings were excluded: ' + reasonCounts(M.excluded) + '. Of these, ' + k.excluded_over_assets_limit + ' reported a float above ' + lim + '× their total assets and ' + k.excluded_price_rule_only + ' failed only the share-price rule.', k.rows_with_badges + ' ranked rows carry a data-quality flag (below).', 'The top three, ' + M.facts.top3_names.map(L.shortName).join(', ') + ', hold ' + L.usd(M.facts.top3_float) + ' of public float' + (M.facts.top3_exceeds_bottom25 ? ', more than the bottom 25 together at ' + L.usd(M.facts.bottom25_float) + '.' : '.'), 'The cross-check: ' + x.overlap + ' of ' + x.of + ' match ' + String(x.source).split(',')[0] + ' (' + x.source + '), checked ' + L.date(x.checked) + '. The rest are companies whose public float and market value rank differently.'].forEach(function (t) { ul.appendChild(el('li', null, t)); });
    c.appendChild(ul);
    c.appendChild(h3('Flags a ranked row can carry'));
    var bl = el('ul', { 'class': 'list' }); Object.keys(M.badges).forEach(function (b) { bl.appendChild(el('li', null, [el('b', { style: 'color:var(--ink);font-weight:600' }, human(b) + '. '), M.badges[b]])); }); c.appendChild(bl);
    var ex = el('details', { 'class': 'fold', style: 'margin-top:20px' }, [el('summary', null, [M.excluded.length + ' filings we caught', el('small', null, 'every excluded filing with its reason')]), el('div', { 'class': 'fold-body' }, table(['Company', 'Rule', 'Reason', 'Why'], M.excluded.map(function (e) { return row([el('th', { scope: 'row' }, e.name), el('td', null, RULE[e.rule] || human(e.rule)), el('td', null, human(e.reason)), el('td', null, e.why)]); })))]);
    c.appendChild(ex);

    /* ---------- glossary ---------- */
    var g = $('panel-glossary'), defs = LabGlossary.DEFS, built = CO.definitions || {};
    var more = { debt: built.debt_rule, ebitda: built.ebitda, ev: built.ev_definition, ev_ebitda: null,
      net_debt: built.leverage, net_debt_to_ebitda: built.leverage, interest_cover: built.leverage, history: built.history, revenue_cagr: built.history };
    var wcd = built.working_capital_days;
    var q = el('input', { type: 'search', id: 'gq', placeholder: 'Search the glossary', autocomplete: 'off', 'aria-label': 'Search the glossary', style: 'border:1px solid var(--ink);border-radius:var(--r);background:#fbf8f1;padding:0 12px;min-height:44px;min-width:260px;font-size:16px' });
    g.appendChild(el('div', { 'class': 'ctoolbar', style: 'margin-top:0' }, [q, el('span', { 'class': 'small', id: 'gcount' })]));
    var gl = el('dl', { 'class': 'gloss' }); g.appendChild(gl);
    var entries = Object.keys(defs).map(function (key) { var d = defs[key]; return { id: key, t: d[0], def: d[1], f: d[2], extra: more[key] || (/^(dso|dio|dpo|ccc)$/.test(key) ? wcd : null) }; });
    Object.keys(M.badges).forEach(function (b) { entries.push({ id: 'badge-' + b, t: 'Flag: ' + human(b), def: M.badges[b] }); });
    function drawG() {
      var s = q.value.trim().toLowerCase(); gl.textContent = ''; var n = 0;
      entries.forEach(function (e) {
        if (s && (e.t + ' ' + e.def + ' ' + (e.f || '')).toLowerCase().indexOf(s) < 0) return;
        n++; var dt = el('dt', { id: e.id }, e.t), dd = el('dd');
        dd.appendChild(el('p', { style: 'margin:0' }, e.def));
        if (e.f) dd.appendChild(el('p', { 'class': 'gf' }, [el('span', { 'class': 'muted' }, 'Formula '), e.f]));
        if (e.extra) dd.appendChild(el('p', { 'class': 'gf' }, [el('span', { 'class': 'muted' }, 'As built '), e.extra.replace(/\s+/g, ' ')]));
        gl.appendChild(dt); gl.appendChild(dd);
      });
      $('gcount').textContent = n + ' of ' + entries.length + ' terms';
      if (!n) gl.appendChild(el('p', { 'class': 'lede' }, 'No term matches “' + q.value + '”. Clear the search to see all terms.'));
    }
    q.addEventListener('input', drawG); drawG();
    var notes = el('ul', { 'class': 'list', id: 'notes' });
    (CO.notes || []).concat(MA.notes || [], DL.notes || []).forEach(function (t) { if (!/^Market values are not shown/.test(t)) notes.appendChild(el('li', null, t)); });
    g.appendChild(el('details', { 'class': 'fold', style: 'margin-top:20px' }, [el('summary', null, ['Notes from the data files', el('small', null, 'company, financing and deal notes, as written by the pipeline')]), el('div', { 'class': 'fold-body' }, notes)]));

    /* ---------- sources and licences ---------- */
    var s = $('panel-sources');
    s.appendChild(el('h3', { 'class': 'vsub' }, 'Company and deal data'));
    var sl = el('ul', { 'class': 'list' });
    [['SEC EDGAR, company facts and submissions', M.source + '. Public domain US government data.'], ['SEC EDGAR, deal filings and sponsors', 'Full-text search for DEFM14A and SC TO-T, Form ADV roster (as of ' + L.date(DL.roster_date) + '), Form D data sets.'], ['US Treasury', (CO.defaults.ust10y.credit || '').replace(/^Source: /, '') + ' Used for the discount rate: ' + CO.defaults.discount_rate_text + '.'], ['Cross-check', x.source + ', checked ' + L.date(x.checked) + '. Used only to compare, not republished.']].forEach(function (t) { sl.appendChild(el('li', null, [el('b', { style: 'color:var(--ink);font-weight:600' }, t[0] + '. '), t[1]])); });
    s.appendChild(sl);
    s.appendChild(h3('Financing series: credit and licence per series'));
    s.appendChild(table(['Series', 'Group', 'Source credit'], MA.series.map(function (sr) { return row([el('th', { scope: 'row' }, sr.label), el('td', null, sr.group), el('td', null, sr.credit.replace(/^Source: /, ''))]); })));
    s.appendChild(el('p', { 'class': 'cap' }, MA.export.series + ' series from the hub’s cleared export (' + L.stamp(MA.export.exported_at.replace('T', ' ')) + '); ' + MA.export.restricted_not_shown + ' restricted benchmarks are not shown: Euribor (EMMI) and SARON (SIX). US rates come from the original sources, not from FRED.'));
    s.appendChild(h3('Logos, type and code'));
    var cl = el('ul', { 'class': 'list' });
    [['Company logos', 'Simple Icons (CC0) and SVGL (MIT), used only to identify companies. Trademarks belong to their owners. ', [['assets/logos/SOURCES.md', 'sources'], ['assets/logos/LICENSE-simple-icons-CC0.md', 'CC0'], ['assets/logos/LICENSE-svgl-MIT.txt', 'MIT']]], ['Type', 'Mona Sans and Instrument Serif, both under the SIL Open Font License, served from this site. ', [['fonts/OFL-MonaSans.txt', 'Mona Sans licence'], ['fonts/OFL-InstrumentSerif.txt', 'Instrument Serif licence']]]].forEach(function (t) {
      var li = el('li', null, [el('b', { style: 'color:var(--ink);font-weight:600' }, t[0] + '. '), t[1]]);
      t[2].forEach(function (a, i) { if (i) li.appendChild(document.createTextNode(' · ')); li.appendChild(el('a', { href: a[0], style: 'color:var(--cash-ink)' }, a[1])); });
      cl.appendChild(li);
    });
    s.appendChild(cl);
    s.appendChild(el('p', { 'class': 'disc' }, 'Not investment advice. Hypothetical models on stated assumptions; no price targets.'));

    /* anchors from the analyst notes: open the right tab and scroll to the term */
    tabs.initial();
    var h = location.hash.replace('#', '');
    if (h && !$('tab-' + h)) { var target = $(h) || $('badge-' + h); if (h === 'pipeline') tabs.select('pipeline'); else if (h === 'data-quality') tabs.select('catches'); else if (target) { tabs.select(target.closest('[role=tabpanel]') ? target.closest('[role=tabpanel]').id.replace('panel-', '') : 'glossary'); target.scrollIntoView(); } else if (!$('tab-' + h)) { /* unknown anchor: stay on the first tab */ } }
  }).catch(L.fail);
})();
