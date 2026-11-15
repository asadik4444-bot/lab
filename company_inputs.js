/* Filing references, public filing supplements and flagged provisional values. This module never fetches quotes.
   Kinds: reported / derived (filing), reference (market or Treasury), assumption (model choice),
   provisional (a flagged placeholder for an input the filing does not give), missing (the visitor must enter it). */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.CompanyInputs=factory();
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const val=n=>n&&finite(n.value)?n.value:null;
  const ratio=(a,b)=>finite(a)&&finite(b)&&b!==0?a/b:null;
  const date=n=>n?.inputs?.[0]?.period_end||null;
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // 2026-09-26 reads as 26 Sep 2026, the date form of the Lab. Other text stays as it is.
  const day=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?Number(m[3])+' '+MONTHS[Number(m[2])-1]+' '+m[1]:s;};
  const source=n=>n?.inputs?.find(x=>x.filing_url)?.filing_url||null;
  const STALE_DAYS=5,STATUTORY_TAX=21,FALLBACK_SPREAD=1,BETA_WEIGHT=.67;
  const MARKET_KEYS=['price','beta','peLow','peHigh','evLow','evHigh'];
  const SUPPLEMENT_KEYS=['nci','financeLeases','investments','wcRatio','costDebt'];
  const ACCEPTED_KINDS=['reference','derived','reported','assumption'];
  const usable=ref=>!!ref&&finite(ref.value)&&ACCEPTED_KINDS.includes(ref.kind)&&/^https:\/\//.test(ref.source||'');

  /* The limits of each model input, in the units of the form. The form takes its limits from this list, and the
     coverage check tests the same list. So the coverage check cannot accept a value that the page refuses. */
  const LIMITS={revenue:{min:.000001},growth:{min:-99.99},margin:{min:-100,max:100},targetMargin:{min:-100,max:100},
    taxRate:{min:0,max:99.99},daRatio:{min:0},capexRatio:{min:0},wcRatio:{},price:{min:.000001},shares:{min:.000001},
    riskFree:{},beta:{min:0},erp:{min:0},costDebt:{min:0},debtTaxRate:{min:0,max:99.99},debtWeightValue:{min:0},
    debt:{min:0},financeLeases:{min:0},nci:{min:0},cash:{min:0},investments:{min:0},terminalGrowth:{min:-99.99},terminalRoc:{min:.000001}};
  const DATES=['valuationDate','shareDate'];
  const isDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  /* What stops a result for the form values q, as [input, reason] pairs. The reasons are 'missing', 'out of range'
     and 'order'. followsWacc: the terminal return on capital comes from WACC, so it is not an input. */
  function problems(q,followsWacc=true){
    const out=[];
    for(const [key,limit] of Object.entries(LIMITS)){
      if(key==='terminalRoc'&&followsWacc)continue;
      const x=q?.[key];
      if(!finite(x))out.push([key,'missing']);
      else if((limit.min!=null&&x<limit.min)||(limit.max!=null&&x>limit.max))out.push([key,'out of range']);
    }
    for(const key of DATES)if(!isDay(q?.[key]))out.push([key,'missing']);
    // The share count cannot be dated after the valuation.
    if(DATES.every(key=>isDay(q?.[key]))&&q.shareDate>q.valuationDate)out.push(['shareDate','order']);
    return out;
  }

  /* market: the local, licence-restricted pack (price, beta, multiples). supplements: the public filing pack.
     options.provisional=false keeps every unsupported input blank. options.provisionalSpread is in percentage points. */
  function build(c,defaults={},today,market=null,supplements=null,options={}){
    if(!c||!c.ticker)return {eligible:false,error:'Company data is unavailable.',inputs:{}};
    const f=c.fundamentals||{},v=c.valuation||{},inputs={},rev=val(f.revenue),fy=c.fy?.end||'Unknown period';
    const percentageKeys=new Set(['margin','targetMargin','growth','taxRate','daRatio','capexRatio','wcRatio','riskFree','erp','debtTaxRate','costDebt']);
    const set=(key,value,kind,note,n)=>{
      // Seeded percentage inputs show two decimals. Filing amounts and share counts keep their precision.
      if(finite(value)&&percentageKeys.has(key))value=Number(value.toFixed(2));
      inputs[key]={value,kind:value==null?'missing':kind,note,source:source(n),date:date(n)};
    };
    const fact=(key,n,scale=1)=>set(key,val(n)==null?null:val(n)/scale,n?.formula?'derived':'reported',
      val(n)==null?'No accepted filing reference. Enter your own assumption.':
        'Filing reference at '+day(date(n)||fy)+(n?.partial?'. Partial reference: '+n.partial:'')+'. Editing it creates your assumption.',n);
    const assumption=(key,value,note,n)=>set(key,value,'assumption',note,n);
    fact('revenue',f.revenue,1e6);
    set('margin',ratio(val(f.operating_income),rev)==null?null:val(f.operating_income)/rev*100,'derived','Opening EBIT margin from the annual filing. Forecast margins may differ.',f.operating_income);
    // Normalised seeds from the multi-year history. One unusual year must not set a ten-year forecast,
    // and one restated or pre-spin-off year must not distort the growth rate. So: a median for growth, a short average for margin.
    const years=(c.history?.years||[]).filter(y=>finite(y.revenue)&&y.revenue>0).sort((a,b)=>String(a.end).localeCompare(String(b.end)));
    // A change between two fiscal years is annual growth only if the years follow each other: their ends are
    // 52 or 53 weeks or one calendar year apart. A change across a missing year is not used.
    const follows=(a,b)=>{const days=(Date.parse(b.end)-Date.parse(a.end))/86400000;return days>=350&&days<=380;};
    const changes=years.slice(1).map((y,i)=>follows(years[i],y)?{end:y.end,growth:y.revenue/years[i].revenue-1}:null);
    const yoy=changes.filter(Boolean).map(x=>x.growth),gaps=changes.length-yoy.length;
    // The margin average uses the unbroken run of years that ends at the latest year, three years at most.
    let run=years.length?1:0;
    while(run<3&&run<years.length&&follows(years[years.length-run-1],years[years.length-run]))run++;
    const recent=years.slice(years.length-run).filter(y=>finite(y.operating_income)).map(y=>y.operating_income/y.revenue);
    const bounds=Array.isArray(defaults.growth_bounds)&&defaults.growth_bounds.every(finite)?defaults.growth_bounds:[-.05,.2];
    const bounded=g=>Math.max(bounds[0],Math.min(bounds[1],g))*100;
    const pct1=x=>(x*100).toFixed(1)+'%';
    if(recent.length>=2&&inputs.margin.value!=null)assumption('targetMargin',recent.reduce((s,x)=>s+x,0)/recent.length*100,
      'Forecast assumption seeded from the average EBIT margin of '+(recent.length===run?'the last '+run:recent.length+' of the last '+run)+' fiscal years. Latest year: '+pct1(inputs.margin.value/100)+'. It is not guidance.',f.operating_income);
    else assumption('targetMargin',inputs.margin.value,'Forecast assumption seeded from the latest EBIT margin. It is not guidance.',f.operating_income);
    if(yoy.length>=3){
      const sorted=yoy.slice().sort((a,b)=>a-b),mid=sorted.length>>1,median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
      const last=changes[changes.length-1];
      assumption('growth',bounded(median),'Forecast assumption seeded from the median annual revenue growth of '+(gaps?'':'the last ')+yoy.length+' years ('+pct1(median)+
        '), bounded to '+pct1(bounds[0])+' through '+pct1(bounds[1])+'. '+(last?'Latest year: '+pct1(last.growth)+'. ':'')+
        (gaps?'The history has a missing year, and the change across it is not used. ':'')+'It is not consensus.',f.growth_yoy);
    }else assumption('growth',val(f.growth_yoy)==null?null:bounded(val(f.growth_yoy)),
      'Forecast assumption seeded from annual revenue growth, bounded to −5% through 20%. It is not consensus.',f.growth_yoy);
    assumption('taxRate',val(v.effective_tax_rate)==null?null:val(v.effective_tax_rate)*100,'Forecast tax assumption seeded from the annual effective rate. Review one-time items.',v.effective_tax_rate);
    // Depreciation holds its ratio in the generated forecast. Capex follows the capex rule, so its note states that rule.
    [['daRatio',v.da,'Constant unless you edit the annual forecast.'],
      ['capexRatio',f.capex,'With the capex rule on, capex above depreciation holds in years 1–5 and returns to the depreciation level in years 6–10. With the rule off, the ratio is constant. Annual inputs replace it.']]
      .forEach(([k,n,rule])=>assumption(k,ratio(val(n),rev)==null?null:val(n)/rev*100,'Forecast ratio seeded from the annual filing. '+rule,n));
    // Capex far above depreciation is growth investment. A forecast cannot charge its cost and leave out its growth.
    // So the seed is bounded: net capex (capex − depreciation) may not exceed revenue growth, both as a share of revenue.
    // Above that bound, one dollar of net investment would give less than one dollar of new revenue.
    if([inputs.capexRatio.value,inputs.daRatio.value,inputs.growth.value].every(finite)){
      const filed=inputs.capexRatio.value,bound=Number((inputs.daRatio.value+Math.max(0,inputs.growth.value)).toFixed(2));
      if(filed>bound)Object.assign(inputs.capexRatio,{value:bound,filingValue:filed,
        // The note names the two seeds with their figures. It is the arithmetic of the seeds, not a link that follows an edit.
        note:'Forecast ratio seeded from the annual filing ('+filed+'% of revenue), bounded to '+bound+'%: the depreciation seed ('+inputs.daRatio.value+
          '%) + the growth seed ('+(inputs.growth.value<0?inputs.growth.value+'%, counted as 0% because it is negative':inputs.growth.value+'%')+
          '). Capex above that bound would buy more growth than the growth seed assumes. Edit it to model your investment plan.'});
    }
    const wc=[val(v.receivables),val(v.inventory),val(v.payables)];
    assumption('wcRatio',wc.every(finite)&&finite(rev)&&rev>0?(wc[0]+wc[1]-wc[2])/rev*100:null,
      'Assumed operating working capital: receivables + inventory − payables, divided by revenue. Other operating balances are excluded.',v.receivables);
    [['debt','debt'],['financeLeases','finance_leases'],['nci','nci'],['cash','cash'],['investments','short_term_investments']].forEach(([k,raw])=>fact(k,v[raw],1e6));
    inputs.cash.note+=' The model assumes this cash is surplus to operations; adjust it if necessary.';
    inputs.investments.note+=' The model assumes these investments are non-operating; adjust them if necessary.';
    inputs.financeLeases.note+=' Include only leases not already included in debt. Operating leases remain in operating expenses.';
    assumption('debtWeightValue',null,'Seeded as book debt + additional finance leases, as a proxy for market debt. It is a separate input: it does not follow a later change of those two. Replace it with your own estimate.',v.debt);
    const sh=c.shares_for_per_share||{};
    set('shares',sh.basis==='dei_cover'&&finite(sh.value)&&sh.value>0?sh.value/1e6:null,'reported',
      'Current SEC cover count, not annual weighted-average shares. Review subsequent issuance, splits and the price share class.');
    inputs.shares.source=sh.source||null;inputs.shares.date=sh.date||null;
    if(inputs.shares.value==null)inputs.shares.note='The filing gives no single current share count. This is usual for a company with two or more share classes.';
    // Without a filing count the visitor enters one number; its date starts at the valuation date.
    if(inputs.shares.value==null)assumption('shareDate',today,'Date of the share count that you enter. Change it to the date of your source.');
    else set('shareDate',sh.date,'reported','Date of the current share reference.');
    assumption('valuationDate',today,'Your valuation date. Forecast year 1 ends one year later.');
    set('riskFree',val(defaults.ust10y)==null?null:val(defaults.ust10y)*100,'reference',defaults.ust10y?.credit||'USD Treasury reference.');
    inputs.riskFree.date=defaults.ust10y?.date||null;
    inputs.riskFree.source='https://home.treasury.gov/resource-center-data-chart-center/interest-rates';
    assumption('erp',finite(defaults.erp)?defaults.erp*100:null,'Selected equity risk premium. This is a model assumption.');
    assumption('debtTaxRate',val(v.effective_tax_rate)==null?null:val(v.effective_tax_rate)*100,'Interest tax-shield assumption seeded from the effective tax rate. Deductibility can differ.',v.effective_tax_rate);
    assumption('terminalGrowth',2.5,'Selected long-run growth assumption. Must remain below WACC.');
    assumption('terminalRoc',10,'Illustrative return used only if you disable the option to follow WACC.');
    fact('eps',v.eps_diluted);
    fact('ebitda',v.ebitda&&!v.ebitda.partial&&/operating_income/.test(v.ebitda.formula||'')?v.ebitda:null,1e6);
    assumption('earningsBasis','Fiscal year to '+day(fy)+' · reported diluted EPS · EBITDA = operating income + D&A',
      'Match the selected multiples to the earnings period, normalisation, lease treatment and share class.');
    [['price','Enter a price to compare. No current quote is fetched.'],['beta','Enter a levered equity beta.'],['costDebt','Enter a current marginal borrowing cost.'],
      ['peLow','Choose a lower P/E multiple.'],['peHigh','Choose an upper P/E multiple.'],['evLow','Choose a lower EV/EBITDA multiple.'],['evHigh','Choose an upper EV/EBITDA multiple.']].forEach(([k,n])=>assumption(k,null,n));
    Object.entries({waccStep:1,growthStep:2,marginStep:2,terminalStep:.5,capexStep:1,wcStep:2}).forEach(([k,value])=>
      assumption(k,value,'Selected change in percentage points. Sensitivity is not a probability estimate.'));

    // Public filing supplements. A pack for another company never enters this model, and the market pack cannot supply these keys.
    const accepted=[],own=p=>p&&p.ticker===c.ticker?p:null;
    for(const key of SUPPLEMENT_KEYS){
      const ref=own(supplements)?.fields?.[key];
      if(!usable(ref))continue;
      // A value from another fiscal year is not a reference for this filing. A balance carries the year in its date.
      // The borrowing-cost estimate carries the spread-table month in its date, and the year of its interest cover separately.
      if(c.fy?.end&&(key==='costDebt'?ref.fiscal_year_end:ref.date)!==c.fy.end)continue;
      if(['nci','financeLeases'].includes(key)&&inputs[key].value!=null)continue;
      inputs[key]={...ref,value:percentageKeys.has(key)?Number(ref.value.toFixed(2)):ref.value};accepted.push(key);
    }
    // Market references keep their date. An old reference stays visible and is marked stale; it never blanks the model.
    const stale=[];
    for(const key of MARKET_KEYS){
      const ref=own(market)?.fields?.[key];
      if(!usable(ref)||(key==='price'&&ref.value<=0))continue;
      if(['price','beta'].includes(key)){
        const age=(Date.parse(today)-Date.parse(ref.date))/86400000;
        if(!Number.isFinite(age)||age<0)continue;
        inputs[key]={...ref,ageDays:Math.floor(age),stale:age>STALE_DAYS};
        // A raw regression beta is noisy. The standard adjustment moves it one third of the way to the market beta of 1.
        if(key==='beta')Object.assign(inputs.beta,{raw:ref.value,value:Number((BETA_WEIGHT*ref.value+(1-BETA_WEIGHT)).toFixed(2)),
          note:'Adjusted beta = '+BETA_WEIGHT+' × raw + '+(1-BETA_WEIGHT).toFixed(2)+'. Raw beta '+ref.value+'. '+(ref.note||'')});
        if(age>STALE_DAYS)stale.push(key);
      }else inputs[key]={...ref};
      accepted.push(key);
    }
    inputs.price.note+=' The entered price also sets market equity for the WACC weights.';

    // Flagged placeholders for inputs that the filing does not give. Price and current shares are never assumed.
    const provisional=[];
    const assume=(key,value,note)=>{inputs[key]={value,kind:'provisional',note:note+' Replace it if you have a better figure.',source:null,date:null};provisional.push(key);};
    const why=n=>n?.reason?' Filing data: '+n.reason+'.':'';
    if(options.provisional!==false&&!c.financial){
      if(inputs.margin.value==null){
        const pre=val(v.pretax_income),interest=val(v.interest_expense);
        if(finite(pre)&&finite(rev)&&rev>0){
          assume('margin',Number(((pre+(finite(interest)?interest:0))/rev*100).toFixed(2)),
            'Assumed EBIT margin: pre-tax income'+(finite(interest)?' + interest expense':'')+', divided by revenue. The filing has no operating-income tag.'+
            (finite(interest)?'':' Interest is not tagged, so this proxy is after interest.')+' Non-operating items are inside this proxy.');
          if(inputs.targetMargin.value==null)assume('targetMargin',inputs.margin.value,'Assumed forecast margin: seeded with the assumed opening margin. The two are separate inputs.');
        }
      }
      if(inputs.taxRate.value==null)assume('taxRate',STATUTORY_TAX,'Assumed tax rate: the 21% US federal rate.'+why(v.effective_tax_rate));
      if(inputs.debtTaxRate.value==null)assume('debtTaxRate',STATUTORY_TAX,'Assumed interest tax shield: the 21% US federal rate.'+why(v.effective_tax_rate));
      if(inputs.wcRatio.value==null)assume('wcRatio',0,'Assumed 0%: the filing does not tag receivables, inventory and payables together, so the generated forecast models no working capital. Annual inputs can set a ratio for each year.');
      if(inputs.financeLeases.value==null)assume('financeLeases',0,'Assumed 0.'+why(v.finance_leases)+' Check the lease note.');
      if(inputs.nci.value==null)assume('nci',0,'Assumed 0.'+why(v.nci)+' Check the balance sheet.');
      if(inputs.investments.value==null)assume('investments',0,'Assumed 0.'+why(v.short_term_investments)+' Add non-operating investments if the company holds them.');
      if(inputs.beta.value==null)assume('beta',1,'Assumed market beta of 1.0. No published beta is loaded.');
      if(inputs.costDebt.value==null&&finite(inputs.riskFree.value)){
        const spread=finite(options.provisionalSpread)?options.provisionalSpread:FALLBACK_SPREAD;
        assume('costDebt',Number((inputs.riskFree.value+spread).toFixed(2)),'Assumed borrowing cost: seeded as the risk-free reference of '+inputs.riskFree.value+'% + '+spread.toFixed(2)+' points'+
          (options.spreadLabel?' ('+options.spreadLabel+')':'')+'. It is a separate input: it does not follow a later change of the risk-free rate. '+(inputs.debt.value===0?'The company reports no debt, so this rate has no effect while the debt weight is zero.':
            'The filing has no usable interest data for an estimate.'));
      }
    }
    if(finite(inputs.debt.value)&&finite(inputs.financeLeases.value)){
      inputs.debtWeightValue.value=inputs.debt.value+inputs.financeLeases.value;inputs.debtWeightValue.kind='assumption';
    }
    const priced=accepted.includes('price');
    return {eligible:!c.financial,company:c,inputs,marketSourced:priced,sourcedFields:accepted,provisionalFields:provisional,staleFields:stale,
      quoteDate:priced?inputs.price.date:null,sourceWarnings:own(market)?.warnings||[],
      // A company with two or more share classes has no cover count. The filing's diluted average is never
      // used as the current count on its own: the page offers it, and the visitor decides.
      shareSuggestion:inputs.shares.value==null&&finite(val(v.diluted_shares))&&val(v.diluted_shares)>0?
        {value:Number((val(v.diluted_shares)/1e6).toFixed(3)),date:date(v.diluted_shares)||fy,source:source(v.diluted_shares)}:null,
      bandHistory:{pe:own(market)?.pe_history?.length||0,ev:own(market)?.ev_history?.length||0},
      // One share class on the SEC cover: the filing's diluted EPS and the quoted price share one basis.
      epsClassVerified:priced&&sh.basis==='dei_cover'&&inputs.shares.value!=null,
      period:fy,source:source(f.revenue),referenceCount:Object.values(inputs).filter(x=>['reported','derived','reference'].includes(x.kind)).length,
      error:c.financial?'Banks and insurers need equity-based valuation methods. Generic enterprise DCF and EV/EBITDA are not applied.':null};
  }
  return {build,problems,LIMITS,STALE_DAYS};
});
