(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.LabFreshness=factory();
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function time(s){const n=Date.parse(s);return Number.isFinite(n)?n:null;}
  function assess(s,now=Date.now()){
    const built=time(s.run && s.run.built_at);
    const overdue=built==null || built>now+300000 || now-built>36*3600000;
    const sources=(s.sources||[]).map(x=>{
      let state=x.state;
      const until=time(x.fresh_until),checked=time(x.checked_at);
      if(state==='fresh' && (until==null ? checked==null || now-checked>36*3600000 : now>=until)) state='stale';
      return {...x,state};
    });
    return {...s,sources,overdue,fine:sources.filter(x=>x.state==='fresh').length};
  }
  return {assess};
});
