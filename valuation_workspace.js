/* Company bar, result line, step header and inputs drawer of the valuation page.
   Calculation stays in the shared engines. The controller owns the form and the redraw. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id),L=window.Lab,el=L.el,M=window.DetailedMath;
  let profile,fields,draw,storageKey,returnFocus,returnEdit=-1,drawerOpened=false;
  const EDIT='#visual-output [data-edit]';
  const labels={reported:'Filing reference',derived:'From filing data',reference:'Market reference',assumption:'Model assumption',
    provisional:'Assumed · review',missing:'Your input needed'};
  // The question that each step of the detailed path answers.
  const questions={business:name=>'What does '+name+' earn today?',forecast:()=>'What do you assume for the next ten years?',
    value:()=>'What is that cash worth today?',range:()=>'How much could the value change?',price:()=>'What does the share price assume?'};
  const usd=v=>M.finite(v)?'$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const pct1=v=>M.finite(v)?(v*100).toFixed(1).replace('-','−')+'%':'—';
  const same=(a,b)=>String(a??'')===String(b??'');
  // A page without a model shows one notice. The level switch, the result line and the steps are hidden.
  function notice(state,content){
    const host=$('design');host.dataset.level='detailed';host.dataset.state=state;
    $('visual-output').replaceChildren(content);
    document.querySelectorAll('[data-open-assumptions]').forEach(n=>n.hidden=true);
  }
  function loadError(message){
    $('company-name').textContent='Company unavailable';$('company-basis').textContent=message;
    notice('unavailable',el('p',{class:'av-error'},message));
  }
  // A select is as wide as its longest option. This one takes the width of the name that it shows.
  function fitPicker(picker){
    const style=getComputedStyle(picker),probe=el('span',{style:'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre'},picker.options[picker.selectedIndex]?.text||'');
    ['fontFamily','fontSize','fontWeight','fontStretch','letterSpacing'].forEach(k=>{probe.style[k]=style[k];});
    document.body.append(probe);picker.style.width=Math.ceil(probe.getBoundingClientRect().width)+34+'px';probe.remove();
  }
  async function load(){
    try{
      L.shell({page:'companies',crumb:['Companies','companies.html']});
      L.status().catch(()=>{});
      const data=await L.load('company_room');
      // Two packs: licence-restricted market data (local only) and public filing supplements.
      const market=await L.load('./valuation-inputs.json').catch(()=>({companies:{}}));
      const supplements=await L.load('./valuation-supplements.json').catch(()=>({companies:{}}));
      const spread=supplements.defaults?.provisional_spread;
      const selected=(new URLSearchParams(location.search).get('c')||'AAPL').toUpperCase();
      const c=data.companies.find(x=>x.ticker===selected);
      const picker=$('company-picker');picker.replaceChildren();
      data.companies.forEach(x=>picker.append(el('option',{value:x.ticker},L.shortName(x.name))));
      picker.value=c?c.ticker:'';picker.disabled=false;
      if(c){fitPicker(picker);if(document.fonts?.ready)document.fonts.ready.then(()=>fitPicker(picker));}
      picker.addEventListener('change',()=>{save();const url=new URL(location.href);url.searchParams.set('c',picker.value);location.assign(url.href);});
      if(!c){loadError('This ticker is not in the company data. Select an available company.');return null;}
      profile=window.CompanyInputs.build(c,data.defaults,new Date().toISOString().slice(0,10),market.companies?.[c.ticker],
        supplements.companies?.[c.ticker]||{ticker:c.ticker,fields:{}},
        {provisionalSpread:spread?.value,spreadLabel:spread?spread.rating+' band, spread table '+spread.table_date:null});
      storageKey='valuation-sourced-v3:'+c.ticker+':'+data.fundamentals_built+':'+data.valuation_built+':'+(market.built_at||'manual')+':'+(supplements.built_at||'none');
      $('company-name').textContent=L.niceName(c.name)+', valuation';$('company-symbol').textContent=c.ticker;
      $('company-period').textContent='Annual filing to '+L.date(profile.period);
      document.title=c.ticker+' · Valuation · The Lab';
      if(c.logo?.file)$('company-logo').replaceChildren(el('img',{src:c.logo.file,alt:''}));else $('company-logo').textContent=c.ticker;
      $('company-detail').href='company.html?c='+encodeURIComponent(c.ticker);
      $('company-filing').href=profile.source||$('company-detail').href;
      $('inputs-company').textContent=L.niceName(c.name)+' · '+c.ticker;
      $('company-basis').textContent=profile.marketSourced?
        'Market reference: '+L.date(profile.quoteDate)+(profile.staleFields.includes('price')?' (stale)':'')+'. Filing values are prefilled. Forecasts, borrowing-cost estimates and multiple bands are assumptions that you can change.':
        'Filing values are prefilled. No market price is loaded: enter a share price to start.';
      $('price-basis').textContent=priceBasis(false);
      $('workspace-price').textContent=usd(profile.inputs.price.value);
      if(!profile.eligible){
        notice('financial',el('div',{class:'av-error'},[el('h2',null,'Use an equity-based model.'),el('p',null,profile.error),
          el('a',{href:'company.html?c='+encodeURIComponent(c.ticker)+'#value'},'Open the company’s P/E inputs')]));
        document.querySelector('.ws-main').classList.add('ws-financial');
        return null;
      }
      return profile;
    }catch(error){loadError('The company data could not load. Reload the page.');return null;}
  }
  /* atStart: the visitor asked for the drawer, not for one field. The first time, show the legend and open
     the group that holds a value to review. Later, keep the groups as the visitor left them. */
  function open(atStart){
    const dialog=$('workspace-inputs');
    if(!dialog.open){
      returnFocus=document.activeElement;
      // A redraw replaces the buttons of a view. The position of the opening button finds its replacement later.
      returnEdit=returnFocus?.matches?.(EDIT)?[...document.querySelectorAll(EDIT)].indexOf(returnFocus):-1;
      dialog.showModal();
    }
    if(atStart&&!drawerOpened){
      const groups=[...dialog.querySelectorAll('#assumption-groups > details')];
      const review=groups.find(g=>g.querySelector('[data-origin=missing]'))||groups.find(g=>g.querySelector('[data-origin=provisional]'))||groups[0];
      groups.forEach(g=>{g.open=g===review;});
    }
    if(atStart)dialog.scrollTop=0;
    drawerOpened=true;
  }
  /* The focus returns to the control that opened the drawer. An edit in the drawer redraws the view, and that
     control can then be gone or hidden. Its replacement in the new view takes the focus, or else the
     inputs button of the page header, which is always there. */
  function close(){
    $('workspace-inputs').close();
    const usable=n=>!!n&&n.isConnected&&n.getClientRects().length>0;
    const again=returnEdit>=0?document.querySelectorAll(EDIT)[returnEdit]:null;
    const target=[returnFocus,again&&again.dataset.edit===returnFocus.dataset.edit?again:null,
      ...document.querySelectorAll('[data-open-assumptions]')].find(usable);
    if(target)target.focus({preventScroll:true});
  }
  const originLabel=ref=>labels[ref.kind]+(ref.stale?' · stale':'');
  function priceBasis(ownPrice){
    if(ownPrice)return 'your input';
    if(!profile.marketSourced)return 'your input is needed';
    return (profile.staleFields.includes('price')?'stale, from ':'at ')+L.date(profile.quoteDate);
  }
  // Where each multiple band comes from: the company's own trading history, or the visitor.
  function bandOrigin(q){
    const own=(low,high,n)=>profile.sourcedFields.includes(low)&&same(q[low],profile.inputs[low].value)&&same(q[high],profile.inputs[high].value)?
      'Own trading range · last '+n+' quarter-ends':'Your selected band';
    return {pe:own('peLow','peHigh',profile.bandHistory.pe),ev_ebitda:own('evLow','evHigh',profile.bandHistory.ev)};
  }
  function attach(input,ref){
    const label=input.closest('label');
    label.dataset.origin=ref.kind;
    if(ref.stale)label.dataset.stale='true';
    label.append(el('span',{class:'ws-origin'},originLabel(ref)));
    if(ref.source)label.append(el('a',{class:'ws-source',href:ref.source,target:'_blank',rel:'noopener'},
      (ref.date_basis==='retrieved'?'Source checked · ':'Source · ')+((ref.date&&ref.date.length===7?L.month(ref.date):L.date(ref.date))||L.date(profile.period))));
  }
  function save(){
    if(!fields||!storageKey)return;
    const state={values:Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,n.value])),
      annual:[...document.querySelectorAll('#annual-inputs input')].map(n=>n.value),
      annualOn:$('annual-overrides').checked,tracks:$('terminal-tracks-wacc').checked,eps:$('range-eps-verified').checked,fade:$('capex-fades').checked};
    try{sessionStorage.setItem(storageKey,JSON.stringify(state));}catch(_){/* Storage can be disabled. The live form stays usable. */}
  }
  function restore(){
    try{
      const s=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(!s||!s.values)return;
      Object.entries(s.values).forEach(([k,v])=>{if(fields[k]&&typeof v==='string')fields[k].value=v;});
      if(Array.isArray(s.annual))document.querySelectorAll('#annual-inputs input').forEach((n,i)=>{if(typeof s.annual[i]==='string')n.value=s.annual[i];});
      $('annual-overrides').checked=s.annualOn===true;$('terminal-tracks-wacc').checked=s.tracks!==false;$('capex-fades').checked=s.fade!==false;$('range-eps-verified').checked=s.eps===true;
    }catch(_){/* An invalid stored draft does not replace the filing defaults. */}
  }
  function setup(allFields,redraw,openField){
    fields=allFields;draw=redraw;
    $('provisional-flag').addEventListener('click',()=>openField($('provisional-flag').dataset.field));
    $('close-inputs').addEventListener('click',close);
    $('workspace-inputs').addEventListener('cancel',e=>{e.preventDefault();close();});
    $('workspace-reset').addEventListener('click',()=>$('reset-assumptions').click());
    document.querySelectorAll('[data-quick]').forEach(n=>n.addEventListener('input',()=>{fields[n.dataset.quick].value=n.value;draw();}));
    $('range-eps-verified').nextElementSibling.textContent=profile.epsClassVerified?
      'The SEC cover shows one share count. Diluted EPS and the '+profile.company.ticker+' price use the same share basis. Review this match when you replace the data.':
      'I checked that EPS and the entered price use the same share-class equivalent.';
    restore();
  }
  /* ctx is null while a required input is missing. */
  function update(ctx,q,mode,changed){
    // The step header: the question of the step, and its answer in one sentence.
    $('workspace-view-title').textContent=questions[mode]?questions[mode](L.shortName(profile.company.name)):'';
    $('step-answer').textContent=ctx&&questions[mode]?window.AnalystVisuals.answer(ctx,mode):'';
    $('workspace-value').textContent=ctx?usd(ctx.e.perShare):'—';
    $('workspace-price').textContent=usd(q?.price);
    $('price-basis').textContent=priceBasis(!same(q?.price,profile.inputs.price.value));
    // Without a market price the footer asks for one, until the visitor entered it.
    if(!profile.marketSourced)$('company-basis').textContent='Filing values are prefilled. No market price is loaded: '+(M.finite(q?.price)?'the share price is your input.':'enter a share price to start.');
    // What the entered price implies: the growth that it needs, or failing that the discount rate.
    const x=ctx?window.AnalystMath.priceImplies(ctx.implied,ctx.sanity):null;
    $('workspace-implied').textContent=x&&x.kind?pct1(x.value):'—';
    $('workspace-implied-note').textContent=!ctx?'Waiting for inputs':
      x.kind==='growth'?'growth a year for 5 years'+(M.finite(x.rate)?', or a '+pct1(x.rate)+' discount rate':''):
      x.kind==='rate'?'discount rate, because '+x.why:'The model shows no rate. The last step says why.';
    // The result in one sentence: the value at the stated rate, and what the entered price implies.
    const head=$('workspace-headline');
    head.hidden=!ctx;
    if(ctx){const [value,implied]=window.AnalystVisuals.headline(ctx);head.replaceChildren(el('span',null,value),implied?' '+implied:'');}
    // Provisional values that the visitor did not replace stay counted beside the result.
    const assumed=(profile.provisionalFields||[]).filter(k=>same(q?.[k],profile.inputs[k].value));
    const flag=$('provisional-flag');
    flag.hidden=!ctx||!assumed.length;flag.dataset.field=assumed[0]||'';
    flag.textContent=assumed.length+' provisional input'+(assumed.length===1?'':'s')+' to review';
    $('workspace-basis').textContent=!ctx?'waiting for inputs':'a share';
    document.querySelectorAll('[data-quick]').forEach(n=>{if(document.activeElement!==n)n.value=q&&q[n.dataset.quick]!=null?q[n.dataset.quick]:'';});
    $('workspace-draft').textContent=changed?changed+' setting'+(changed===1?'':'s')+' changed. Your draft stays in this tab.':'Company defaults. Change any assumption.';
    $('workspace-reset').hidden=!changed;
    Object.entries(fields||{}).forEach(([key,n])=>{
      const ref=profile.inputs[key],badge=n.closest('label').querySelector('.ws-origin');
      if(!ref||!badge)return;
      const followsWacc=key==='terminalRoc'&&$('terminal-tracks-wacc').checked;
      const custom=!followsWacc&&!same(q?.[key],ref.value);
      badge.textContent=followsWacc?'Calculated from WACC':custom?'Your input':originLabel(ref);
      badge.dataset.custom=String(custom||followsWacc);
    });
    // Each group of the drawer says how many of its inputs need a review.
    document.querySelectorAll('#assumption-groups > details').forEach(g=>{
      const inputs=[...g.querySelectorAll('.assumption-field input')];
      const review=inputs.filter(n=>profile.inputs[n.name]?.kind==='provisional'&&same(q?.[n.name],profile.inputs[n.name].value)).length;
      const missing=inputs.filter(n=>n.required&&!n.disabled&&n.value.trim()==='').length;
      g.querySelector('.ws-group-count').textContent=inputs.length+' inputs'+(review?' · '+review+' provisional':'')+(missing?' · '+missing+' missing':'');
    });
    save();
  }
  return window.CompanyWorkspace={load,open,attach,setup,update,save,bandOrigin};
})();
