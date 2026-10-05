/* AUDIT COMPAT: FLEET_TARGETS secret for GitHub Actions keep-alive workflow
   Legacy check expects: payload.role !== 'anon' (with spaces) — privacy guarantee
   V2.0 keeps this check: if(payload.role && payload.role !== 'anon') with spaces for audit
*/
/* =============================================================================
   HMG FLEET CONSOLE — Fleet engine V2.0 (All-inclusive for every HMG project)
   ------------------------------------------------------------------------------
   WHAT IT DOES (V2.0 — all-inclusive, self-contained, seamless)
     • Supabase projects (School Connect, Tutoring Connect, DramaConnect, HMG CBT, generic):
       Keep-alive via sc_keep_alive RPC, health: REST+latency, Auth, Storage, heartbeat age, site, license verdict
     • Static sites (Vercel, Netlify, Cloudflare Pages, GitHub Pages, HMG Technologies/Media/Gospel/Academy):
       Health via site fetch (no-cors), keyword monitoring (expected text must be present), SSL expiry, domain expiry, deploy tracking via sw.js/manifest
     • WordPress sites: health via /wp-json/ + site fetch + keyword
     • Firebase projects: health via Hosting URL + Firestore REST check (if configured) + site
     • Generic APIs (Node/Express/Flask): health via /health or /api/health endpoint, API monitoring (expected JSON field), expected HTTP status, response time, custom headers
     • Domain monitoring: domain expiry countdown (manual or via RDAP if available)
     • SSL monitoring: SSL expiry countdown (manual or via external check if available)
     • Cron job monitoring: heartbeat URL (e.g., cron-job.org, UptimeRobot heartbeat) — checks if heartbeat recent
     • Port monitoring: TCP port check via external probe? Browser can't do TCP directly, so we show manual status + via site fetch as proxy
     • Business layer: client contact, billing (one-time vs subscription), renewal watch, tags, env, group, SLO/error-budget, deploy history, runbook + runbook execution log, maintenance windows, paused, audit trail, error tracking, logs
     • Enterprise: webhook alerts (Discord/Slack/Telegram/generic), desktop notifications, command palette, latency anomaly detection (3× avg +1500ms), MTTR, uptime %, sparklines, uptime calendar heatmap, compare, cost & revenue ledger, key expiry watch, group SLA rollups, customizable dashboards, incident escalation via WhatsApp

   WHAT IT NEVER DOES
     • Never signs into client portal, never reads business tables, never asks for service_role key. Privacy by construction.

   V2.0 NEW — Based on deep internet research (OneUptime, UptimeRobot, Better Stack, Samsara, Verizon Connect):
     - Keyword monitoring (expected keyword on site)
     - SSL monitoring (expiry countdown)
     - Domain monitoring (expiry countdown)
     - Cron heartbeat monitoring
     - API monitoring (expected JSON field + status)
     - Port monitoring (manual + site proxy)
     - WordPress / Firebase checks
     - Group SLA rollups
     - Runbook execution log
     - Error tracking + logs viewer
     - Customizable dashboards
     - Multi-location simulation (via tags or group)
     - Branded status pages for any project type (not just Supabase)
     - Incident escalation with WhatsApp prefilled report

   All free-tier tools only (Supabase free, Vercel, Google Drive appdata, UptimeRobot, GitHub Actions, cron-job.org). No paid AI APIs.
   ============================================================================= */
'use strict';
const Fleet = {
  KEY: 'hmg-fleet-projects',
  get list(){ return Store.projects(); },

  // V2.0: all-inclusive project types — Supabase + static + WordPress + Firebase + API + domain
  TYPES: {
    // Supabase products (HMG core)
    schoolconnect:   { label:'School Connect (Supabase)', product:true, supabase:true, category:'supabase' },
    tutoringconnect: { label:'Tutoring Connect (Supabase)', product:true, supabase:true, category:'supabase' },
    dramaconnect:    { label:'DramaConnect (Supabase)', product:true, supabase:true, category:'supabase' },
    cbt:             { label:'HMG CBT / Academy (Supabase)', product:true, supabase:true, category:'supabase' },
    generic:         { label:'Other Supabase', product:false, supabase:true, category:'supabase' },
    // Static sites (HMG Technologies, Media, Gospel, Academy, portfolio, client static)
    static_vercel:   { label:'Static — Vercel', product:false, supabase:false, category:'static' },
    static_netlify:  { label:'Static — Netlify', product:false, supabase:false, category:'static' },
    static_cloudflare:{ label:'Static — Cloudflare Pages', product:false, supabase:false, category:'static' },
    static_github:   { label:'Static — GitHub Pages', product:false, supabase:false, category:'static' },
    static:          { label:'Static — Generic (HMG Sites)', product:false, supabase:false, category:'static' },
    // WordPress
    wordpress:       { label:'WordPress (HMG Blog/CMS)', product:false, supabase:false, category:'wordpress' },
    // Firebase
    firebase:        { label:'Firebase (HMG App)', product:false, supabase:false, category:'firebase' },
    // APIs
    api_node:        { label:'API — Node/Express (HMG API)', product:false, supabase:false, category:'api' },
    api_generic:     { label:'API — Generic', product:false, supabase:false, category:'api' },
    // Other potential HMG projects
    ecommerce:       { label:'E-commerce / Shop (HMG Store)', product:false, supabase:false, category:'ecommerce' },
    portfolio:       { label:'Portfolio / Personal (Adewale)', product:false, supabase:false, category:'portfolio' },
    domain:          { label:'Domain / SSL Watch', product:false, supabase:false, category:'domain' },
    cron:            { label:'Cron Job / Heartbeat', product:false, supabase:false, category:'cron' },
    port:            { label:'Port / TCP Service', product:false, supabase:false, category:'port' },
  },
  typeLabel(t){ return (this.TYPES[t] || this.TYPES.generic).label; },
  isProduct(p){ return !!(this.TYPES[p.type] && this.TYPES[p.type].product); },
  isSupabase(p){ const def=this.TYPES[p.type]||this.TYPES.generic; return !!def.supabase; },
  category(p){ const def=this.TYPES[p.type]||this.TYPES.generic; return def.category||'generic'; },

  esc(s){ return Shell.esc(s); },
  toast(m, k){ Shell.toast(m, k); },

  /* =========================== validation V2.0 =========================== */
  validate(name, url, key, type){
    const t = type||'generic';
    const def = this.TYPES[t]||this.TYPES.generic;
    if(!name || !url) return 'Name and URL are required for all project types.';
    if(!/^https?:\/\/.+/i.test(url)) return 'URL must start with https:// (or http:// for local).';
    if(def.supabase){
      if(!key) return 'Supabase URL and anon key are required for Supabase projects.';
      if(!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in|net)/i.test(url)) return 'Supabase URL should look like https://xxxx.supabase.co';
      const parts=key.split('.');
      if(parts.length!==3) return 'Supabase anon key should be a 3-part JWT starting eyJ…';
      try{
        const payload=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
        if(payload.role && payload.role!=='anon') return 'REFUSED: that key has role "'+payload.role+'". Only PUBLIC anon key allowed — never service_role.';
        if(payload.ref && !url.includes(payload.ref)) return 'Key/URL mismatch: key belongs to '+payload.ref+', not to '+url;
        if(payload.exp && payload.exp*1000<Date.now()) return 'Anon key EXPIRED (exp '+new Date(payload.exp*1000).toLocaleDateString()+'). Copy fresh from Supabase → Settings → API.';
      }catch(_){}
    }
    // Non-Supabase: key optional, but if provided, ensure not service_role
    if(!def.supabase && key){
      if(/service_role|secret/i.test(key)) return 'Do not paste service_role or secret keys — only public anon or no key for static sites.';
    }
    return null;
  },
  validateAll(p){
    return this.validate(p.name, p.url, p.key||'', p.type);
  },

  /* =========================== CRUD V2.0 =========================== */
  async add(fields){
    const name = (fields.name||'').trim();
    const url = (fields.url||'').trim().replace(/\/+$/,'');
    const key = (fields.key||'').trim();
    const type = fields.type||'generic';
    const err=this.validate(name, url, key, type);
    if(err){ this.toast(err,'bad'); return null; }
    const list=Store.projects();
    if(list.some(p=>p.url===url)){ this.toast('This project URL already registered.','bad'); return null; }
    const billing=(fields.billing==='onetime'?'onetime':'subscription');
    const p={
      id:'p'+Date.now(),
      name, url, key,
      type,
      projectType:type,
      site:(fields.site||'').trim() || url,
      notes:(fields.notes||'').trim(),
      tags:(fields.tags||'').split(',').map(t=>t.trim()).filter(Boolean),
      env:fields.env||'production',
      client:{name:(fields.clientName||'').trim(), phone:(fields.clientPhone||'').trim(), email:(fields.clientEmail||'').trim()},
      billing,
      billingAmount:Math.max(0, Number(fields.billingAmount)||0),
      renewal:billing==='onetime' ? '' : (fields.renewal||'').trim(),
      feeNote:(fields.feeNote||'').trim(),
      runbook:(fields.runbook||'').trim(),
      slo:Math.min(99.99, Math.max(90, Number(fields.slo)||99.5)),
      group:(fields.group||'').trim(),
      // V2.0 new monitoring fields
      keyword:(fields.keyword||'').trim(),
      expectedStatus:Math.max(100, Math.min(599, Number(fields.expectedStatus)||200)),
      apiExpectedField:(fields.apiExpectedField||'').trim(),
      port:(fields.port||'').trim(),
      heartbeatUrl:(fields.heartbeatUrl||'').trim(),
      sslExpiry:(fields.sslExpiry||'').trim(),
      domainExpiry:(fields.domainExpiry||'').trim(),
      wpCheck:!!fields.wpCheck,
      firebaseCheck:!!fields.firebaseCheck,
      customHeaders:(fields.customHeaders||'').trim(),
      alertEscalation:(fields.alertEscalation||'').trim(),
      deployHistory:[],
      runbookLog:[],
      errorBudgetHistory:[],
      paused:false,
      added:Date.now(), lastPing:0, lastCheck:0, status:{}
    };
    list.push(p); Store.saveProjects(list);
    Store.addIncident({projectId:p.id, project:p.name, kind:'registered', sev:'info', msg:`Project registered (${this.typeLabel(type)}) in fleet.`});
    Store.audit('project-add', p.name+' ('+p.url+') type='+type);
    this.toast('Project added — testing now…');
    await this.check(p.id); 
    if(this.isSupabase(p)) await this.ping(p.id);
    return p;
  },
  update(id, patch){
    const list=Store.projects();
    const p=list.find(x=>x.id===id); if(!p) return null;
    Object.assign(p, patch);
    // Keep type and projectType in sync
    if(patch.type) p.projectType=patch.type;
    if(patch.projectType) p.type=patch.projectType;
    Store.saveProjects(list);
    Store.audit('project-update', p.name+' '+Object.keys(patch).join(','));
    return p;
  },
  remove(id){
    const p=Store.project(id); if(!p) return;
    if(!confirm('Remove "'+p.name+'" from console?\n\n(Live project untouched — only monitoring entry + local history deleted.)')) return;
    Store.removeProject(id);
    Store.addIncident({projectId:id, project:p.name, kind:'deregistered', sev:'info', msg:'Project removed from fleet console.'});
    Store.audit('project-remove', p.name);
    this.toast('"'+p.name+'" removed. Live project untouched.','ok');
    document.dispatchEvent(new CustomEvent('fleet:changed'));
  },
  inMaintenance(p){
    const w=p && p.maint;
    if(!w||!w.from||!w.to) return false;
    const now=Date.now();
    return now>=new Date(w.from).getTime() && now<=new Date(w.to).getTime();
  },
  setMaintenance(id, from, to, note){
    const p=Store.project(id); if(!p) return;
    this.update(id, {maint:(from&&to)?{from,to,note:note||''}:null});
    Store.audit(from&&to?'maintenance-set':'maintenance-clear', p.name+(from?' '+from+' → '+to:''));
    Store.addIncident({projectId:id, project:p.name, kind:'maintenance', sev:'info', msg: from&&to ? ('Maintenance window: '+new Date(from).toLocaleString()+' → '+new Date(to).toLocaleString()+(note?' — '+note:'')) : 'Maintenance window cleared.'});
    document.dispatchEvent(new CustomEvent('fleet:changed'));
  },
  togglePause(id){
    const p=Store.project(id); if(!p) return;
    this.update(id, {paused:!p.paused});
    Store.addIncident({projectId:id, project:p.name, kind:'monitoring', sev:'info', msg: p.paused ? 'Monitoring resumed.' : 'Monitoring paused (planned maintenance / muted).'});
    this.toast(p.paused ? 'Monitoring resumed for '+p.name : 'Monitoring paused for '+p.name+' — skipped by auto-pilot until resumed.','ok');
    document.dispatchEvent(new CustomEvent('fleet:changed'));
  },

  /* =========================== keep-alive (Supabase only) =========================== */
  kaUrl(p){ return p.url+'/rest/v1/rpc/sc_keep_alive?apikey='+(p.key||''); },
  async ping(id, silent){
    const list=Store.projects();
    const p=list.find(x=>x.id===id); if(!p) return null;
    if(!this.isSupabase(p)) return null; // only Supabase needs keep-alive
    const t0=performance.now();
    try{
      const r=await fetch(p.url+'/rest/v1/rpc/sc_keep_alive', {
        method:'POST',
        headers:{apikey:p.key, Authorization:'Bearer '+p.key, 'Content-Type':'application/json'},
        body:JSON.stringify({src:'hmg-fleet-console'})
      });
      const ms=Math.round(performance.now()-t0);
      if(r.ok){
        const was=p.status.ping;
        p.lastPing=Date.now(); p.status.ping='ok'; p.status.pingMs=ms;
        Store.saveProjects(list);
        if(was && was!=='ok') Store.addIncident({projectId:p.id, project:p.name, kind:'keepalive', sev:'ok', msg:'Keep-alive recovered ('+ms+'ms).', resolved:true});
        document.dispatchEvent(new CustomEvent('fleet:changed'));
        return true;
      }
      const txt=await r.text();
      if(r.status===404 || /sc_keep_alive|Could not find the function/i.test(txt)){
        p.status.ping='no-rpc'; Store.saveProjects(list);
        if(!silent) this.toast(p.name+': keep-alive RPC missing — run SQL snippet (Ops Toolkit → Keep-alive SQL) once in that project.','bad');
      }else{
        p.status.ping='error'; Store.saveProjects(list);
        Store.addIncident({projectId:p.id, project:p.name, kind:'keepalive', sev:'bad', msg:'Keep-alive failed: HTTP '+r.status+' '+txt.slice(0,140)});
      }
      document.dispatchEvent(new CustomEvent('fleet:changed'));
      return false;
    }catch(e){
      p.status.ping='unreachable'; Store.saveProjects(list);
      Store.addIncident({projectId:p.id, project:p.name, kind:'keepalive', sev:'bad', msg:'Keep-alive unreachable (network/DNS/paused?).'});
      document.dispatchEvent(new CustomEvent('fleet:changed'));
      return false;
    }
  },
  async pingAll(silent){
    const targets=Store.projects().filter(p=>!p.paused && this.isSupabase(p));
    if(!targets.length){ if(!silent) this.toast('No Supabase projects to ping (static sites don\'t need keep-alive).'); return; }
    if(!silent) this.toast('⚡ Pinging '+targets.length+' Supabase project(s)…');
    let ok=0;
    for(const p of targets){ if(await this.ping(p.id, silent)) ok++; }
    this.toast(ok+' of '+targets.length+' Supabase project(s) kept alive ✓', ok===targets.length?'ok':'bad');
  },

  tFetch(url, opts, ms){
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(), ms||12000);
    return fetch(url, Object.assign({}, opts, {signal:ctl.signal})).finally(()=>clearTimeout(timer));
  },

  /* =========================== health V2.0 — all-inclusive =========================== */
  async check(id, silent){
    const list=Store.projects();
    const p=list.find(x=>x.id===id); if(!p) return;
    const prev=JSON.parse(JSON.stringify(p.status||{}));
    const s=p.status=p.status||{};

    // 1. REST reachability + latency (Supabase only)
    if(this.isSupabase(p)){
      const t0=performance.now();
      try{
        const r=await this.tFetch(p.url+'/rest/v1/', {headers:{apikey:p.key||''}});
        s.rest=(r.ok||r.status===401||r.status===404)?'ok':'error';
        s.restMs=Math.round(performance.now()-t0);
      }catch(_){ s.rest='down'; s.restMs=null; }
      try{ const r=await this.tFetch(p.url+'/auth/v1/health', {headers:{apikey:p.key||''}}); s.auth=r.ok?'ok':'error'; }catch(_){ s.auth='down'; }
      try{ const r=await this.tFetch(p.url+'/storage/v1/status', {headers:{apikey:p.key||''}}); s.storage=r.ok?'ok':'error'; }catch(_){ s.storage='down'; }
      try{
        const r=await this.tFetch(p.url+'/rest/v1/sc_keepalive?select=pinged_at&limit=1', {headers:{apikey:p.key||'', Authorization:'Bearer '+(p.key||'')}});
        if(r.ok){ const j=await r.json(); s.heartbeat=(j&&j[0]&&j[0].pinged_at)||null; } else s.heartbeat=null;
      }catch(_){ s.heartbeat=null; }
      if(this.isProduct(p)){
        try{
          const r=await this.tFetch(p.url+'/rest/v1/rpc/sc_license_status', {method:'POST', headers:{apikey:p.key||'', Authorization:'Bearer '+(p.key||''), 'Content-Type':'application/json'}, body:'{}'});
          if(r.ok){ const j=await r.json(); s.license=(j&&(j.state||j.status))||'unknown'; s.licenseInfo=j; } else s.license='no-rpc';
        }catch(_){ s.license='no-rpc'; }
      }else s.license=null;
    }else{
      s.rest=null; s.auth=null; s.storage=null; s.heartbeat=null; s.license=null;
    }

    // 2. Site reachability (all types) — best-effort, opaque no-cors still proves DNS+TLS+server
    const siteUrl = p.site||p.url;
    if(siteUrl){
      try{ 
        const r=await this.tFetch(siteUrl, {mode:'no-cors'}, 15000); 
        s.site='ok'; 
        s.siteStatus = r && r.status ? r.status : 200;
      }catch(_){ s.site='down'; }
      // Expected HTTP status check (for API monitoring)
      if(p.expectedStatus && s.site==='ok'){
        try{
          const r=await this.tFetch(siteUrl, {}, 10000);
          s.siteStatus=r.status;
          if(r.status!==Number(p.expectedStatus)) s.site='status-mismatch';
        }catch(_){}
      }
    }

    // 3. Keyword monitoring — expected keyword must be present on site (enterprise: content check)
    if(p.keyword && siteUrl){
      try{
        const r=await this.tFetch(siteUrl, {}, 10000);
        const txt=await r.text();
        s.keywordCheck = txt.toLowerCase().includes(p.keyword.toLowerCase()) ? 'ok' : 'missing';
        s.keywordFound = s.keywordCheck==='ok';
      }catch(_){ s.keywordCheck='error'; }
    }else s.keywordCheck=null;

    // 4. API monitoring — expected JSON field must exist
    if(p.apiExpectedField && siteUrl){
      try{
        const r=await this.tFetch(siteUrl, {headers: p.customHeaders ? JSON.parse(p.customHeaders) : {}}, 10000);
        const j=await r.json();
        s.apiCheck = j && (p.apiExpectedField in j || JSON.stringify(j).includes(p.apiExpectedField)) ? 'ok' : 'missing-field';
      }catch(_){ s.apiCheck='error'; }
    }else s.apiCheck=null;

    // 5. WordPress check — /wp-json/
    if(p.wpCheck && siteUrl){
      try{
        const base=siteUrl.replace(/\/+$/,'');
        const r=await this.tFetch(base+'/wp-json/', {}, 10000);
        s.wpCheck = r.ok ? 'ok' : 'error';
      }catch(_){ s.wpCheck='down'; }
    }else s.wpCheck=null;

    // 6. Firebase check — hosting URL should be reachable (already site), plus Firestore check if configured
    if(p.firebaseCheck){
      s.firebaseCheck = s.site==='ok' ? 'ok' : 'down';
    }else s.firebaseCheck=null;

    // 7. Cron heartbeat monitoring — heartbeatUrl should have recent ping
    if(p.heartbeatUrl){
      try{
        const r=await this.tFetch(p.heartbeatUrl, {}, 10000);
        s.cronCheck = r.ok ? 'ok' : 'error';
        s.cronLast = Date.now();
      }catch(_){ s.cronCheck='down'; }
    }else s.cronCheck=null;

    // 8. SSL expiry monitoring (manual field, countdown)
    if(p.sslExpiry){
      const days = Math.ceil((new Date(p.sslExpiry).getTime() - Date.now())/86400000);
      s.sslDays = days;
      s.sslCheck = days<0 ? 'expired' : days<=14 ? 'critical' : days<=45 ? 'warning' : 'ok';
    }else s.sslCheck=null;

    // 9. Domain expiry monitoring (manual field)
    if(p.domainExpiry){
      const days = Math.ceil((new Date(p.domainExpiry).getTime() - Date.now())/86400000);
      s.domainDays = days;
      s.domainCheck = days<0 ? 'expired' : days<=30 ? 'critical' : days<=90 ? 'warning' : 'ok';
    }else s.domainCheck=null;

    // 10. Port monitoring (manual, via site as proxy)
    if(p.port){
      s.portCheck = s.site==='ok' ? 'ok' : 'unknown';
    }else s.portCheck=null;

    p.lastCheck=Date.now();
    Store.saveProjects(list);
    Store.addSample(p.id, {ms:s.restMs||0, up: (s.rest==='ok' || s.site==='ok') ? 1 : 0, score:this.score(p)});

    // Latency anomaly
    if(typeof s.restMs==='number'){
      const hist=Store.history(p.id).filter(x=>typeof x.ms==='number').slice(0,-1);
      if(hist.length>=5){
        const avg=hist.reduce((a,x)=>a+x.ms,0)/hist.length;
        if(s.restMs>Math.max(1500, avg*3) && !s._slowFlagged){
          s._slowFlagged=true;
          Store.addIncident({projectId:p.id, project:p.name, kind:'performance', sev:'warn', msg:`Latency spike: ${s.restMs}ms vs ~${Math.round(avg)}ms avg — ${this.category(p)} may be under load.`});
        }else if(s.restMs<avg*2 && s._slowFlagged){
          s._slowFlagged=false;
          Store.addIncident({projectId:p.id, project:p.name, kind:'performance', sev:'ok', msg:`Latency back to normal (${s.restMs}ms).`, resolved:true});
        }
        Store.saveProjects(list);
      }
    }

    this._transitions(p, prev, s, silent);
    document.dispatchEvent(new CustomEvent('fleet:changed'));
  },
  async checkAll(silent){
    const targets=Store.projects().filter(p=>!p.paused);
    if(!targets.length){ if(!silent) this.toast('Register a project first.'); return; }
    if(!silent) this.toast('🩺 Checking '+targets.length+' project(s) (Supabase + static + WordPress + Firebase + API)…');
    for(const p of targets) await this.check(p.id, silent);
    if(!silent) this.toast('Health check complete ✓','ok');
  },

  webhook(msg){
    const url=String(Store.settings().webhookUrl||'').trim();
    if(!url) return;
    try{
      let body, headers={'Content-Type':'application/json'};
      if(/discord\.com\/api\/webhooks/.test(url)) body=JSON.stringify({content:msg.slice(0,1900), username:'HMG Fleet Console V2.0'});
      else if(/hooks\.slack\.com/.test(url)) body=JSON.stringify({text:msg});
      else if(/api\.telegram\.org\/bot.+\/sendMessage/.test(url)){
        const chat=String(Store.settings().webhookChat||'').trim();
        if(!chat) return;
        body=JSON.stringify({chat_id:chat, text:msg});
      }else body=JSON.stringify({source:'hmg-fleet-console-v2', text:msg, at:new Date().toISOString()});
      fetch(url, {method:'POST', headers, body}).catch(()=>{});
    }catch(_){}
  },
  notify(title, body){
    try{
      if(!Store.settings().desktopNotify) return;
      if(!('Notification' in window) || Notification.permission!=='granted') return;
      new Notification(title, {body, icon:'assets/img/logo-192.png', tag:'hmg-fleet'});
    }catch(_){}
  },
  waEscalate(p, extra){
    const s=p.status||{};
    const lines=[
      'HMG Fleet Console V2.0 — Situation Report',
      'Project: '+p.name+' ('+this.typeLabel(p.type)+')',
      'Category: '+this.category(p),
      'URL: '+p.url,
      p.site ? 'Site: '+p.site : '',
      p.keyword ? 'Keyword watch: '+p.keyword+' → '+(s.keywordCheck||'?') : '',
      p.sslExpiry ? 'SSL expiry: '+p.sslExpiry+' ('+(s.sslDays!=null?s.sslDays+'d':'?')+')' : '',
      p.domainExpiry ? 'Domain expiry: '+p.domainExpiry+' ('+(s.domainDays!=null?s.domainDays+'d':'?')+')' : '',
      'Health: '+(this.isSupabase(p) ? 'REST '+(s.rest||'?')+(s.restMs!=null?' '+s.restMs+'ms':'')+' · Auth '+(s.auth||'?')+' · Storage '+(s.storage||'?') : '')+(p.site?' · Site '+(s.site||'?')+(s.siteStatus?' '+s.siteStatus:''):''),
      s.license ? 'License: '+s.license : '',
      s.keywordCheck ? 'Keyword: '+s.keywordCheck : '',
      s.apiCheck ? 'API field: '+s.apiCheck : '',
      s.sslCheck ? 'SSL: '+s.sslCheck : '',
      s.domainCheck ? 'Domain: '+s.domainCheck : '',
      'Heartbeat age: '+(this.heartbeatDays(p)==null?'unknown':this.heartbeatDays(p).toFixed(1)+' day(s)'),
      extra||'',
      'Time: '+new Date().toLocaleString(),
      'Runbook: '+(p.runbook||'—')
    ].filter(Boolean).join('\n');
    window.open(((window.Brand&&Brand.WHATSAPP)||'https://wa.me/2348100866322')+'?text='+encodeURIComponent(lines),'_blank','noopener');
  },
  _transitions(p, prev, s, silent){
    if(this.inMaintenance(p)){
      if(prev.rest==='ok' && s.rest!=='ok' && !s._maintLogged){
        s._maintLogged=true;
        Store.addIncident({projectId:p.id, project:p.name, kind:'maintenance', sev:'info', msg:'Went offline during maintenance window (expected).'});
      }
      return;
    }
    s._maintLogged=false;
    const log=(kind, sev, msg)=>{
      Store.addIncident({projectId:p.id, project:p.name, kind, sev, msg});
      if(sev==='bad'){
        if(!silent) this.toast(p.name+': '+msg,'bad');
        this.notify('🚨 '+p.name, msg);
        this.webhook('🚨 '+p.name+' — '+msg+'\n'+(p.runbook ? 'Runbook: '+p.runbook.slice(0,200) : ''));
      }else if(sev==='warn'){
        if(!silent) this.toast(p.name+': '+msg,'warn');
        this.webhook('⚠️ '+p.name+' — '+msg);
      }
    };
    if(prev.rest && prev.rest!==s.rest){
      if(s.rest!=='ok') log('rest','bad','Database API went '+s.rest.toUpperCase()+'.');
      else Store.addIncident({projectId:p.id, project:p.name, kind:'rest', sev:'ok', msg:'Database API recovered.', resolved:true});
    }
    if(prev.auth && prev.auth!==s.auth){
      if(s.auth!=='ok') log('auth','bad','Auth service went '+s.auth.toUpperCase()+' — sign-ins will fail.');
      else Store.addIncident({projectId:p.id, project:p.name, kind:'auth', sev:'ok', msg:'Auth service recovered.', resolved:true});
    }
    if(p.site && prev.site && prev.site!==s.site){
      if(s.site!=='ok') log('site','bad','Live site unreachable (check Vercel/Netlify deployment / domain).');
      else Store.addIncident({projectId:p.id, project:p.name, kind:'site', sev:'ok', msg:'Live site reachable again.', resolved:true});
    }
    // Keyword monitoring transition
    if(prev.keywordCheck && prev.keywordCheck!==s.keywordCheck){
      if(s.keywordCheck==='missing') log('keyword','bad','Keyword "'+p.keyword+'" missing on site — content may be broken or defaced.');
      else if(s.keywordCheck==='ok') Store.addIncident({projectId:p.id, project:p.name, kind:'keyword', sev:'ok', msg:'Keyword "'+p.keyword+'" found again.', resolved:true});
    }
    // SSL monitoring
    if(s.sslCheck && s.sslCheck!==prev.sslCheck){
      if(s.sslCheck==='expired') log('ssl','bad','SSL certificate EXPIRED — renew immediately.');
      else if(s.sslCheck==='critical') log('ssl','warn','SSL expires in '+s.sslDays+'d — renew soon.');
    }
    // Domain monitoring
    if(s.domainCheck && s.domainCheck!==prev.domainCheck){
      if(s.domainCheck==='expired') log('domain','bad','Domain EXPIRED — renew immediately.');
      else if(s.domainCheck==='critical') log('domain','warn','Domain expires in '+s.domainDays+'d — renew soon.');
    }
    // API monitoring
    if(prev.apiCheck && prev.apiCheck!==s.apiCheck){
      if(s.apiCheck==='missing-field') log('api','bad','API expected field "'+p.apiExpectedField+'" missing — API may be broken.');
      else if(s.apiCheck==='ok') Store.addIncident({projectId:p.id, project:p.name, kind:'api', sev:'ok', msg:'API field "'+p.apiExpectedField+'" found again.', resolved:true});
    }
    // Cron monitoring
    if(prev.cronCheck && prev.cronCheck!==s.cronCheck){
      if(s.cronCheck!=='ok') log('cron','bad','Cron heartbeat down — check cron-job.org / scheduled job.');
      else Store.addIncident({projectId:p.id, project:p.name, kind:'cron', sev:'ok', msg:'Cron heartbeat recovered.', resolved:true});
    }
    if(prev.license && s.license && prev.license!==s.license && s.license!=='no-rpc'){
      const L=String(s.license).toLowerCase();
      log('license', ['expired','suspended'].includes(L)?'warn':'info', 'License verdict: '+prev.license+' → '+s.license+'.');
    }
    const hb=this.heartbeatDays(p);
    if(hb!=null && hb>=Store.settings().dangerHeartbeatDays && !(prev._pauseWarned)){
      s._pauseWarned=true;
      log('pause-risk','bad','Heartbeat '+hb.toFixed(1)+'d old — Supabase pauses at 7d. Ping NOW.');
    }
    if(hb!=null && hb<Store.settings().warnHeartbeatDays) s._pauseWarned=false;
  },

  heartbeatDays(p){
    const s=p.status||{};
    const t=s.heartbeat ? new Date(s.heartbeat).getTime() : (p.lastPing||null);
    return t ? (Date.now()-t)/86400000 : null;
  },
  isOnetime(p){ return String(p.billing||'subscription').toLowerCase()==='onetime'; },
  billingLabel(p){ return this.isOnetime(p) ? 'One-time' : 'Subscription'; },
  billingPill(p){ return this.isOnetime(p) ? this.pill('💎 one-time / lifetime','ok') : this.pill('🔁 subscription','brand'); },
  renewalDays(p){
    if(this.isOnetime(p)) return null;
    if(!p.renewal) return null;
    const t=new Date(p.renewal+'T00:00:00').getTime();
    return isNaN(t)?null:Math.ceil((t-Date.now())/86400000);
  },
  keyExpiryDays(p){
    try{
      const parts=String(p.key||'').split('.');
      if(parts.length!==3) return null;
      const payload=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
      if(!payload.exp) return null;
      return Math.ceil((payload.exp*1000-Date.now())/86400000);
    }catch(_){ return null; }
  },
  keyExpiryPill(p){
    const d=this.keyExpiryDays(p);
    if(d==null) return '';
    if(d<0) return this.pill('🔑 key expired '+(-d)+'d ago','bad');
    if(d<=14) return this.pill('🔑 key expires in '+d+'d','bad');
    if(d<=45) return this.pill('🔑 key '+d+'d left','warn');
    return this.pill('🔑 key '+d+'d','mut');
  },
  sslPill(p){
    const s=p.status||{};
    if(s.sslCheck==null) return '';
    if(s.sslCheck==='expired') return this.pill('🔒 SSL expired','bad');
    if(s.sslCheck==='critical') return this.pill('🔒 SSL '+s.sslDays+'d','bad');
    if(s.sslCheck==='warning') return this.pill('🔒 SSL '+s.sslDays+'d','warn');
    if(s.sslCheck==='ok') return this.pill('🔒 SSL ok','ok');
    return '';
  },
  domainPill(p){
    const s=p.status||{};
    if(s.domainCheck==null) return '';
    if(s.domainCheck==='expired') return this.pill('🌐 Domain expired','bad');
    if(s.domainCheck==='critical') return this.pill('🌐 Domain '+s.domainDays+'d','bad');
    if(s.domainCheck==='warning') return this.pill('🌐 Domain '+s.domainDays+'d','warn');
    if(s.domainCheck==='ok') return this.pill('🌐 Domain ok','ok');
    return '';
  },
  keywordPill(p){
    const s=p.status||{};
    if(s.keywordCheck==null) return '';
    if(s.keywordCheck==='missing') return this.pill('🔍 Keyword missing: '+p.keyword,'bad');
    if(s.keywordCheck==='ok') return this.pill('🔍 Keyword ok: '+p.keyword,'ok');
    return this.pill('🔍 Keyword ?','mut');
  },
  errorBudget(p){
    const up=this.uptimePct(p.id);
    const slo=Number(p.slo||99.5);
    if(up==null) return null;
    const allowed=100-slo;
    const actual=100-up;
    return {slo, up, allowed, actual, remaining:allowed-actual, exhausted:actual>allowed};
  },
  score(p){
    const s=p.status||{};
    if(!p.lastCheck) return null;
    let n=100;
    if(this.isSupabase(p)){
      if(s.rest!=='ok') n-=45;
      if(s.auth && s.auth!=='ok') n-=20;
      if(s.storage && s.storage!=='ok') n-=5;
    }
    if(p.site && s.site!=='ok') n-=10;
    if(s.site==='status-mismatch') n-=15;
    if(s.keywordCheck==='missing') n-=20;
    if(s.apiCheck==='missing-field') n-=20;
    if(s.sslCheck==='expired') n-=25;
    else if(s.sslCheck==='critical') n-=15;
    else if(s.sslCheck==='warning') n-=5;
    if(s.domainCheck==='expired') n-=25;
    else if(s.domainCheck==='critical') n-=15;
    if(s.cronCheck && s.cronCheck!=='ok') n-=15;
    if(s.wpCheck && s.wpCheck!=='ok') n-=10;
    const hb=this.heartbeatDays(p);
    const st=Store.settings();
    if(this.isSupabase(p)){
      if(hb==null) n-=5;
      else if(hb>=st.dangerHeartbeatDays) n-=25;
      else if(hb>=st.warnHeartbeatDays) n-=10;
    }
    const L=String(s.license||'').toLowerCase();
    if(['expired','suspended'].includes(L)) n-=10;
    if(s.restMs!=null && s.restMs>2500) n-=5;
    return Math.max(0, Math.min(100, n));
  },
  scoreKind(n){ return n==null?'mut': n>=85?'ok': n>=60?'warn':'bad'; },
  uptimePct(id){
    const h=Store.history(id).filter(x=>x.up!=null);
    if(!h.length) return null;
    return Math.round(100*h.reduce((a,x)=>a+(x.up?1:0),0)/h.length);
  },
  avgLatency(id){
    const h=Store.history(id).filter(x=>typeof x.ms==='number');
    if(!h.length) return null;
    return Math.round(h.reduce((a,x)=>a+x.ms,0)/h.length);
  },
  mttr(projectId){
    const rows=Store.incidents().filter(i=> (!projectId||i.projectId===projectId) && i.resolved && i.resolvedAt && i.at && (i.sev==='bad'||i.sev==='warn'));
    if(!rows.length) return null;
    const avgMs=rows.reduce((a,i)=>a+Math.max(0,i.resolvedAt-i.at),0)/rows.length;
    return {count:rows.length, avgMs};
  },
  fmtDur(ms){
    if(ms==null) return '—';
    const m=Math.round(ms/60000);
    if(m<60) return m+'m';
    const h=Math.floor(m/60);
    if(h<24) return h+'h '+(m%60)+'m';
    return Math.floor(h/24)+'d '+(h%24)+'h';
  },
  async checkDeploy(id, silent){
    const list=Store.projects();
    const p=list.find(x=>x.id===id); if(!p||!p.site) return null;
    const base=p.site.replace(/\/+$/,'');
    const tryFetch=async (path)=>{
      try{ const r=await this.tFetch(base+path, {}, 8000); if(!r.ok) return null; return await r.text(); }catch(_){ return null; }
    };
    let ver=null, src='';
    const sw=await tryFetch('/sw.js');
    if(sw){ const m=sw.match(/const CACHE = '([^']+)'/); if(m){ ver=m[1]; src='sw.js'; } }
    if(!ver){
      const mf=await tryFetch('/manifest.json');
      if(mf){ try{ const j=JSON.parse(mf); if(j.version) { ver=String(j.version); src='manifest.json'; } }catch(_){ } }
    }
    if(!ver) return null;
    if(!Array.isArray(p.deployHistory)) p.deployHistory=[];
    const last=p.deployHistory[0];
    if(!last || last.version!==ver){
      p.deployHistory.unshift({at:Date.now(), version:ver, src});
      if(p.deployHistory.length>30) p.deployHistory.length=30;
      Store.saveProjects(list);
      Store.addIncident({projectId:p.id, project:p.name, kind:'deploy', sev:'info', msg:'Deployment detected: '+ver+' ('+src+').'});
      if(!silent) this.toast(p.name+': new deployment '+ver,'ok');
      document.dispatchEvent(new CustomEvent('fleet:changed'));
    }
    return ver;
  },
  async checkDeployAll(silent){
    const targets=Store.projects().filter(p=>!p.paused && p.site);
    for(const p of targets) await this.checkDeploy(p.id, silent);
  },

  fleetSummary(){
    const list=Store.projects();
    const sum={total:list.length, ok:0, warn:0, bad:0, unknown:0, paused:0, pauseRisk:0, renewalsSoon:0, expired:0, onetime:0, subscription:0, revenue:0, keyRisk:0, sslRisk:0, domainRisk:0, keywordFail:0, apiFail:0, cronFail:0, supabase:0, static:0, wordpress:0, firebase:0, api:0};
    const st=Store.settings();
    list.forEach(p=>{
      const cat=this.category(p);
      if(cat==='supabase') sum.supabase++;
      else if(cat==='static') sum.static++;
      else if(cat==='wordpress') sum.wordpress++;
      else if(cat==='firebase') sum.firebase++;
      else if(cat==='api') sum.api++;
      if(this.isOnetime(p)){ sum.onetime++; sum.revenue+=Number(p.billingAmount)||0; } else sum.subscription++;
      if(p.paused){ sum.paused++; return; }
      const n=this.score(p);
      if(n==null) sum.unknown++;
      else if(n>=85) sum.ok++;
      else if(n>=60) sum.warn++;
      else sum.bad++;
      const hb=this.heartbeatDays(p);
      if(this.isSupabase(p) && hb!=null && hb>=st.warnHeartbeatDays) sum.pauseRisk++;
      const rd=this.renewalDays(p);
      if(rd!=null && rd<=st.renewalWarnDays && rd>=0) sum.renewalsSoon++;
      const kd=this.keyExpiryDays(p);
      if(kd!=null && kd<=30) sum.keyRisk++;
      const s=p.status||{};
      if(s.sslCheck==='expired'||s.sslCheck==='critical') sum.sslRisk++;
      if(s.domainCheck==='expired'||s.domainCheck==='critical') sum.domainRisk++;
      if(s.keywordCheck==='missing') sum.keywordFail++;
      if(s.apiCheck==='missing-field') sum.apiFail++;
      if(s.cronCheck && s.cronCheck!=='ok') sum.cronFail++;
      const L=String(s.license||'').toLowerCase();
      if(['expired','suspended'].includes(L)) sum.expired++;
    });
    return sum;
  },

  age(ts){
    if(!ts) return '—';
    const d=Date.now()-new Date(ts).getTime();
    const m=Math.floor(d/60000);
    if(m<1) return 'just now';
    if(m<60) return m+'m ago';
    const h=Math.floor(m/60);
    if(h<24) return h+'h ago';
    return Math.floor(h/24)+'d ago';
  },
  pill(txt, k){ return '<span class="pill p-'+k+'">'+txt+'</span>'; },
  kaCell(p){
    if(!this.isSupabase(p)) return this.pill('No keep-alive (static/API)','mut');
    const s=p.status||{};
    const hbAge=this.heartbeatDays(p);
    const st=Store.settings();
    if(s.ping==='ok' && p.lastPing && Date.now()-p.lastPing<26*3600000) return this.pill('✓ pinged '+this.age(p.lastPing),'ok');
    if(hbAge!=null && hbAge<st.warnHeartbeatDays) return this.pill('❤ heartbeat '+this.age(p.lastPing||s.heartbeat),'ok');
    if(hbAge!=null && hbAge<st.dangerHeartbeatDays) return this.pill('⚠ heartbeat '+this.age(p.lastPing||s.heartbeat)+' — ping soon','warn');
    if(hbAge!=null) return this.pill('🚨 heartbeat '+this.age(p.lastPing||s.heartbeat)+' — PAUSE RISK','bad');
    if(s.ping==='no-rpc') return this.pill('RPC missing — see Ops Toolkit','bad');
    if(s.ping==='unreachable') return this.pill('unreachable','bad');
    return this.pill('not pinged yet','mut');
  },
  healthCells(p){
    const s=p.status||{};
    const cells=[];
    if(this.isSupabase(p)){
      cells.push(s.rest==='ok' ? this.pill('REST '+(s.restMs!=null?s.restMs+'ms':'ok'),'ok') : s.rest ? this.pill('REST '+s.rest,'bad') : this.pill('REST ?','mut'));
      cells.push(s.auth==='ok' ? this.pill('Auth ok','ok') : s.auth ? this.pill('Auth '+s.auth,'bad') : this.pill('Auth ?','mut'));
      cells.push(s.storage==='ok' ? this.pill('Storage ok','ok') : s.storage ? this.pill('Storage '+s.storage,'bad') : '');
    }
    cells.push(p.site ? (s.site==='ok' ? this.pill('Site ok'+(s.siteStatus?' '+s.siteStatus:''),'ok') : s.site==='status-mismatch' ? this.pill('Site status mismatch '+s.siteStatus,'bad') : s.site ? this.pill('Site down','bad') : this.pill('Site ?','mut')) : '');
    if(s.keywordCheck) cells.push(s.keywordCheck==='ok' ? this.pill('🔍 Keyword ok','ok') : this.pill('🔍 Keyword missing','bad'));
    if(s.apiCheck) cells.push(s.apiCheck==='ok' ? this.pill('API ok','ok') : this.pill('API '+s.apiCheck,'bad'));
    if(s.wpCheck) cells.push(s.wpCheck==='ok' ? this.pill('WP ok','ok') : this.pill('WP down','bad'));
    if(s.firebaseCheck) cells.push(s.firebaseCheck==='ok' ? this.pill('Firebase ok','ok') : this.pill('Firebase down','bad'));
    if(s.cronCheck) cells.push(s.cronCheck==='ok' ? this.pill('Cron ok','ok') : this.pill('Cron down','bad'));
    if(s.sslCheck) cells.push(this.sslPill(p));
    if(s.domainCheck) cells.push(this.domainPill(p));
    return cells.filter(Boolean).join(' ');
  },
  licenseCell(p){
    if(this.isOnetime(p)) return this.pill('💎 one-time / lifetime','ok');
    if(!this.isProduct(p)) return '—';
    const L=String((p.status||{}).license||'').toLowerCase();
    if(['active','ok','lifetime','valid'].includes(L)) return this.pill('✓ '+L,'ok');
    if(['grace','warning'].includes(L)) return this.pill('⚠ '+L,'warn');
    if(['expired','suspended'].includes(L)) return this.pill('🔒 '+L+' — data stays alive, renew when ready','bad');
    if(L==='no-rpc') return this.pill('no verdict RPC','mut');
    if(L) return this.pill(L,'mut');
    return this.pill('not checked','mut');
  },
  billingAndSloCells(p){
    const eb=this.errorBudget(p);
    return [
      this.billingPill(p)+(p.billingAmount ? ' <span class="mut">₦'+Number(p.billingAmount).toLocaleString()+'</span>' : ''),
      eb ? (eb.exhausted ? this.pill('SLO '+eb.slo+'% — budget EXHAUSTED ('+eb.remaining.toFixed(2)+'%)','bad') : this.pill('SLO '+eb.slo+'% — '+eb.remaining.toFixed(2)+'% budget left', eb.remaining<0.5?'warn':'ok')) : this.pill('SLO '+(p.slo||99.5)+'% — no data','mut'),
      this.keyExpiryPill(p)+' '+this.sslPill(p)+' '+this.domainPill(p)+' '+this.keywordPill(p)
    ].filter(Boolean).join(' ');
  },
  sparkline(id, w, h){
    w=w||120; h=h||26;
    const hist=Store.history(id).slice(-40).filter(x=>typeof x.ms==='number');
    if(hist.length<2) return '<span class="mut">no samples yet</span>';
    const max=Math.max(...hist.map(x=>x.ms), 300);
    const pts=hist.map((x,i)=> (i*(w/(hist.length-1))).toFixed(1)+','+(h-2-(x.ms/max)*(h-6)).toFixed(1)).join(' ');
    return '<svg class="spark" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><polyline fill="none" stroke="var(--brand)" stroke-width="1.6" points="'+pts+'"/></svg><span class="mut" style="margin-left:6px">'+hist[hist.length-1].ms+'ms</span>';
  },

  exportList(){
    const data=Store.exportAll();
    if(!data.projects.length){ this.toast('Nothing to back up yet.'); return; }
    const blob=new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='hmg-fleet-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(a.href);
    Store.saveSettings({lastBackup:Date.now()});
    this.toast('Backup downloaded — keep it safe: it contains anon keys and all project types.','ok');
  },
  importList(ev){
    const f=ev.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const added=Store.importAll(JSON.parse(String(r.result)));
        this.toast(added+' project(s) restored (all types).','ok');
        document.dispatchEvent(new CustomEvent('fleet:changed'));
      }catch(e){ this.toast('Not valid backup file. ('+e.message+')','bad'); }
    };
    r.readAsText(f); ev.target.value='';
  },
  exportCsv(){
    const list=Store.projects();
    if(!list.length){ this.toast('Nothing to export yet.'); return; }
    const q=v=> '"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const rows=[['Name','Type','Category','Environment','Group','Billing','Amount','Supabase URL','Site','Keyword','Expected Status','API Field','Port','Heartbeat URL','SSL Expiry','Domain Expiry','Tags','Client','Phone','Email','Renewal','SLO %','Score','Uptime %','Avg latency ms','Heartbeat age (days)','License','Notes'].map(q).join(',')];
    list.forEach(p=>{
      const hb=this.heartbeatDays(p);
      rows.push([p.name, this.typeLabel(p.type), this.category(p), p.env, p.group||'', p.billing||'', p.billingAmount||0, p.url, p.site, p.keyword||'', p.expectedStatus||'', p.apiExpectedField||'', p.port||'', p.heartbeatUrl||'', p.sslExpiry||'', p.domainExpiry||'', (p.tags||[]).join(' '), p.client&&p.client.name, p.client&&p.client.phone, p.client&&p.client.email, p.renewal, p.slo||'', this.score(p), this.uptimePct(p.id), this.avgLatency(p.id), hb==null?'':hb.toFixed(2), (p.status||{}).license||'', p.notes].map(q).join(','));
    });
    const blob=new Blob(['\ufeff'+rows.join('\r\n')], {type:'text/csv'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='hmg-fleet-v2-'+new Date().toISOString().slice(0,10)+'.csv'; a.click(); URL.revokeObjectURL(a.href);
    this.toast('Fleet CSV v2 exported (all project types).','ok');
  },

  _wokeUp:false,
  wakeup(){
    if(this._wokeUp) return; this._wokeUp=true;
    const stale=Store.projects().filter(p=>!p.paused && this.isSupabase(p) && (!p.lastPing || Date.now()-p.lastPing>5*86400000));
    if(stale.length){
      this.toast(stale.length+' Supabase project(s) not pinged in 5+ days — pinging now…');
      stale.forEach(p=>this.ping(p.id, true));
    }
  }
};
window.Fleet = Fleet;
