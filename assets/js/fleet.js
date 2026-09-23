/* =============================================================================
   HMG FLEET CONSOLE — Fleet engine (V1.0, grown from the School Connect
   single-file console V11.1 — every original capability preserved, then
   extended for the standalone multi-page platform).
   -----------------------------------------------------------------------------
   WHAT IT DOES
     • Keep-alive: a real database write via each project's public
       sc_keep_alive RPC so no free-tier Supabase ever pauses from the 7-day
       inactivity rule. One-click fleet-wide, per-project, auto-pilot, and
       stale-heartbeat wake-up on page open.
     • Health: REST reachability + latency, Auth service, Storage service,
       keep-alive heartbeat age, live-site reachability, and (for HMG product
       projects) the public subscription verdict RPC (sc_license_status).
     • Health score 0–100 per project, fleet-wide roll-up, latency history
       samples (sparklines + uptime %), automatic INCIDENT logging on every
       state transition (down→up, up→down, pause-risk, license change).
     • Business layer: client contact, renewal date watch, tags, environments,
       monitoring pause (mute a project during planned maintenance without
       deleting it).
   WHAT IT NEVER DOES
     • It never signs into a client portal, never reads business tables, and
       never asks for a service_role key. The anon key + RLS means student /
       fee / result / member data is cryptographically out of reach. Privacy
       by construction, not by promise.
   ============================================================================= */
'use strict';
const Fleet = {
  /* Kept for backward compatibility with the original console. */
  KEY: 'hmg-fleet-projects',
  get list(){ return Store.projects(); },

  TYPES: {
    schoolconnect:  { label:'School Connect',   product:true  },
    tutoringconnect:{ label:'Tutoring Connect', product:true  },
    dramaconnect:   { label:'DramaConnect',     product:true  },
    cbt:            { label:'HMG CBT / Academy',product:true  },
    generic:        { label:'Other Supabase',   product:false }
  },
  typeLabel(t){ return (this.TYPES[t] || this.TYPES.generic).label; },
  isProduct(p){ return !!(this.TYPES[p.type] && this.TYPES[p.type].product); },

  esc(s){ return Shell.esc(s); },
  toast(m, k){ Shell.toast(m, k); },

  /* =========================== validation =========================== */
  validate(name, url, key){
    if(!name || !url || !key) return 'Name, Supabase URL and anon key are all required.';
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in|net)/i.test(url)) return 'That does not look like a Supabase URL (https://xxxx.supabase.co).';
    // The anon key is a JWT — verify shape AND that its role really is "anon"
    // so a pasted service_role key is REJECTED (privacy guarantee).
    const parts = key.split('.');
    if(parts.length !== 3) return 'That does not look like a Supabase anon key (should be a 3-part JWT starting "eyJ…").';
    try{
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if(payload.role && payload.role !== 'anon') return 'REFUSED: that key has role "' + payload.role + '". The console only ever accepts the PUBLIC anon key — never paste a service_role key anywhere.';
      if(payload.ref && !url.includes(payload.ref)) return 'Key/URL mismatch: this key belongs to project "' + payload.ref + '", not to ' + url + '.';
      if(payload.exp && payload.exp * 1000 < Date.now()) return 'This anon key is EXPIRED (exp ' + new Date(payload.exp * 1000).toLocaleDateString() + '). Copy a fresh one from Supabase → Settings → API.';
    }catch(_){ /* non-JWT publishable keys (sb_publishable_…) pass through */ }
    return null;
  },

  /* =========================== CRUD =========================== */
  async add(fields){
    const name = fields.name.trim();
    const url  = fields.url.trim().replace(/\/+$/, '');
    const key  = fields.key.trim();
    const err = this.validate(name, url, key);
    if(err){ this.toast(err, 'bad'); return null; }
    const list = Store.projects();
    if(list.some(p => p.url === url)){ this.toast('This project URL is already registered.', 'bad'); return null; }
    const billing = (fields.billing === 'onetime' ? 'onetime' : 'subscription');
    const p = {
      id: 'p' + Date.now(), name, url, key,
      type: fields.type || 'generic',
      site: (fields.site || '').trim(),
      notes: (fields.notes || '').trim(),
      tags: (fields.tags || '').split(',').map(t => t.trim()).filter(Boolean),
      env: fields.env || 'production',
      client: { name:(fields.clientName||'').trim(), phone:(fields.clientPhone||'').trim(), email:(fields.clientEmail||'').trim() },
      billing,
      billingAmount: Math.max(0, Number(fields.billingAmount) || 0),
      renewal: billing === 'onetime' ? '' : (fields.renewal || '').trim(),
      feeNote: (fields.feeNote || '').trim(),
      runbook: (fields.runbook || '').trim(),
      slo: Math.min(99.99, Math.max(90, Number(fields.slo) || 99.5)),
      group: (fields.group || '').trim(),
      deployHistory: [],
      paused: false,
      added: Date.now(), lastPing: 0, lastCheck: 0, status: {}
    };
    list.push(p); Store.saveProjects(list);
    Store.addIncident({ projectId:p.id, project:p.name, kind:'registered', sev:'info', msg:'Project registered in the fleet.' });
    Store.audit('project-add', p.name + ' (' + p.url + ')');
    this.toast('Project added — testing now…');
    await this.check(p.id); await this.ping(p.id);
    return p;
  },
  update(id, patch){
    const list = Store.projects();
    const p = list.find(x => x.id === id); if(!p) return null;
    Object.assign(p, patch); Store.saveProjects(list); return p;
  },
  remove(id){
    const p = Store.project(id); if(!p) return;
    if(!confirm('Remove "' + p.name + '" from the console?\n\n(The client project itself is untouched — only this monitoring entry and its local history are deleted.)')) return;
    Store.removeProject(id);
    Store.addIncident({ projectId:id, project:p.name, kind:'deregistered', sev:'info', msg:'Project removed from the fleet console.' });
    Store.audit('project-remove', p.name);
    this.toast('"' + p.name + '" removed. The live project is untouched.', 'ok');
    document.dispatchEvent(new CustomEvent('fleet:changed'));
  },
  /* V1.6 MAINTENANCE WINDOWS (industry-standard: planned downtime must not
     alarm). A window = {from, to, note}. During it: no down-incidents are
     logged for that project, the wallboard shows a blue 🔧 tile, and alerts
     (desktop/webhook) are suppressed. Keep-alive pings CONTINUE (Supabase
     inactivity does not respect maintenance!). */
  inMaintenance(p){
    const w = p && p.maint;
    if(!w || !w.from || !w.to) return false;
    const now = Date.now();
    return now >= new Date(w.from).getTime() && now <= new Date(w.to).getTime();
  },
  setMaintenance(id, from, to, note){
    const p = Store.project(id); if(!p) return;
    this.update(id, { maint: (from && to) ? { from, to, note: note || '' } : null });
    Store.audit(from && to ? 'maintenance-set' : 'maintenance-clear', p.name + (from ? ' ' + from + ' → ' + to : ''));
    Store.addIncident({ projectId:id, project:p.name, kind:'maintenance', sev:'info',
      msg: from && to ? ('Maintenance window scheduled: ' + new Date(from).toLocaleString() + ' → ' + new Date(to).toLocaleString() + (note ? ' — ' + note : '')) : 'Maintenance window cleared.' });
    document.dispatchEvent(new CustomEvent('fleet:changed'));
  },

  togglePause(id){
    const p = Store.project(id); if(!p) return;
    this.update(id, { paused: !p.paused });
    Store.addIncident({ projectId:id, project:p.name, kind:'monitoring', sev:'info', msg: p.paused ? 'Monitoring resumed.' : 'Monitoring paused (planned maintenance / muted).' });
    this.toast(p.paused ? 'Monitoring resumed for ' + p.name : 'Monitoring paused for ' + p.name + ' — it is skipped by auto-pilot and fleet actions until resumed.', 'ok');
    document.dispatchEvent(new CustomEvent('fleet:changed'));
  },

  /* =========================== keep-alive =========================== */
  kaUrl(p){ return p.url + '/rest/v1/rpc/sc_keep_alive?apikey=' + p.key; },
  async ping(id, silent){
    const list = Store.projects();
    const p = list.find(x => x.id === id); if(!p) return null;
    const t0 = performance.now();
    try{
      const r = await fetch(p.url + '/rest/v1/rpc/sc_keep_alive', {
        method:'POST',
        headers:{ apikey:p.key, Authorization:'Bearer ' + p.key, 'Content-Type':'application/json' },
        body: JSON.stringify({ src:'hmg-fleet-console' })
      });
      const ms = Math.round(performance.now() - t0);
      if(r.ok){
        const was = p.status.ping;
        p.lastPing = Date.now(); p.status.ping = 'ok'; p.status.pingMs = ms;
        Store.saveProjects(list);
        if(was && was !== 'ok') Store.addIncident({ projectId:p.id, project:p.name, kind:'keepalive', sev:'ok', msg:'Keep-alive recovered (' + ms + 'ms).' , resolved:true });
        document.dispatchEvent(new CustomEvent('fleet:changed'));
        return true;
      }
      const txt = await r.text();
      if(r.status === 404 || /sc_keep_alive|Could not find the function/i.test(txt)){
        p.status.ping = 'no-rpc'; Store.saveProjects(list);
        if(!silent) this.toast(p.name + ': keep-alive RPC missing — run the SQL snippet (Ops Toolkit → Keep-alive SQL) once in that project.', 'bad');
      }else{
        p.status.ping = 'error'; Store.saveProjects(list);
        Store.addIncident({ projectId:p.id, project:p.name, kind:'keepalive', sev:'bad', msg:'Keep-alive failed: HTTP ' + r.status + ' ' + txt.slice(0, 140) });
      }
      document.dispatchEvent(new CustomEvent('fleet:changed'));
      return false;
    }catch(e){
      p.status.ping = 'unreachable'; Store.saveProjects(list);
      Store.addIncident({ projectId:p.id, project:p.name, kind:'keepalive', sev:'bad', msg:'Keep-alive unreachable (network/DNS/paused project?).' });
      document.dispatchEvent(new CustomEvent('fleet:changed'));
      return false;
    }
  },
  async pingAll(silent){
    const targets = Store.projects().filter(p => !p.paused);
    if(!targets.length){ if(!silent) this.toast('Register a project first.'); return; }
    if(!silent) this.toast('⚡ Pinging ' + targets.length + ' project(s)…');
    let ok = 0;
    for(const p of targets){ if(await this.ping(p.id, silent)) ok++; }
    this.toast(ok + ' of ' + targets.length + ' project(s) kept alive ✓', ok === targets.length ? 'ok' : 'bad');
  },

  /* V1.3 enterprise: every probe now has a hard timeout (12 s) via
     AbortController — a hanging network can no longer stall a fleet-wide
     check behind one dead project (best practice: fail fast, mark down). */
  tFetch(url, opts, ms){
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms || 12000);
    return fetch(url, Object.assign({}, opts, { signal: ctl.signal })).finally(() => clearTimeout(timer));
  },

  /* =========================== health =========================== */
  async check(id, silent){
    const list = Store.projects();
    const p = list.find(x => x.id === id); if(!p) return;
    const prev = JSON.parse(JSON.stringify(p.status || {}));
    const s = p.status = p.status || {};
    // 1. REST reachability + latency. NOTE: newer Supabase stacks answer 401
    //    on the bare REST root even with a valid anon key — 401/404 still
    //    PROVES PostgREST is up (DNS + TLS + gateway + service all alive).
    const t0 = performance.now();
    try{
      const r = await this.tFetch(p.url + '/rest/v1/', { headers:{ apikey:p.key } });
      s.rest = (r.ok || r.status === 401 || r.status === 404) ? 'ok' : 'error';
      s.restMs = Math.round(performance.now() - t0);
    }catch(_){ s.rest = 'down'; s.restMs = null; }
    // 2. Auth service (GoTrue health endpoint).
    try{ const r = await this.tFetch(p.url + '/auth/v1/health', { headers:{ apikey:p.key } }); s.auth = r.ok ? 'ok' : 'error'; }
    catch(_){ s.auth = 'down'; }
    // 3. Storage service (public status endpoint).
    try{ const r = await this.tFetch(p.url + '/storage/v1/status', { headers:{ apikey:p.key } }); s.storage = r.ok ? 'ok' : 'error'; }
    catch(_){ s.storage = 'down'; }
    // 4. Heartbeat age — via the RPC's own return value where possible.
    //    School Connect keeps its heartbeat table RPC-only (RLS), so we read
    //    the legacy public row IF it exists; otherwise the lastPing this
    //    console performed is the truth we track.
    try{
      const r = await this.tFetch(p.url + '/rest/v1/sc_keepalive?select=pinged_at&limit=1', { headers:{ apikey:p.key, Authorization:'Bearer ' + p.key } });
      if(r.ok){ const j = await r.json(); s.heartbeat = (j && j[0] && j[0].pinged_at) || null; }
      else s.heartbeat = null;
    }catch(_){ s.heartbeat = null; }
    // 5. Subscription verdict (HMG products ship this public RPC).
    if(this.isProduct(p)){
      try{
        const r = await this.tFetch(p.url + '/rest/v1/rpc/sc_license_status', { method:'POST', headers:{ apikey:p.key, Authorization:'Bearer ' + p.key, 'Content-Type':'application/json' }, body:'{}' });
        if(r.ok){ const j = await r.json(); s.license = (j && (j.state || j.status)) || 'unknown'; s.licenseInfo = j; }
        else s.license = 'no-rpc';
      }catch(_){ s.license = 'no-rpc'; }
    }else s.license = null;
    // 6. Site reachability (best-effort; an opaque no-cors response still
    //    proves DNS + TLS + a listening server).
    if(p.site){ try{ await this.tFetch(p.site, { mode:'no-cors' }, 15000); s.site = 'ok'; }catch(_){ s.site = 'down'; } }
    p.lastCheck = Date.now();
    Store.saveProjects(list);
    // History sample for sparklines + uptime %.
    Store.addSample(p.id, { ms: s.restMs, up: s.rest === 'ok' ? 1 : 0, score: this.score(p) });
    /* V1.2 enterprise (NOC best practice — early MTTD): latency anomaly
       detection. If this check's latency is 3× the project's rolling average
       AND above 1500 ms, flag a performance-degradation incident once per
       episode (cleared when latency returns under 2× average). */
    if(typeof s.restMs === 'number'){
      const hist = Store.history(p.id).filter(x => typeof x.ms === 'number').slice(0, -1);
      if(hist.length >= 5){
        const avg = hist.reduce((a, x) => a + x.ms, 0) / hist.length;
        if(s.restMs > Math.max(1500, avg * 3) && !s._slowFlagged){
          s._slowFlagged = true;
          Store.addIncident({ projectId:p.id, project:p.name, kind:'performance', sev:'warn', msg:'Latency spike: ' + s.restMs + 'ms vs ~' + Math.round(avg) + 'ms average — database may be under load or cold-starting.' });
        }else if(s.restMs < avg * 2 && s._slowFlagged){
          s._slowFlagged = false;
          Store.addIncident({ projectId:p.id, project:p.name, kind:'performance', sev:'ok', msg:'Latency back to normal (' + s.restMs + 'ms).', resolved:true });
        }
        Store.saveProjects(list);
      }
    }
    // Incident engine: log every meaningful transition exactly once.
    this._transitions(p, prev, s, silent);
    document.dispatchEvent(new CustomEvent('fleet:changed'));
  },
  async checkAll(silent){
    const targets = Store.projects().filter(p => !p.paused);
    if(!targets.length){ if(!silent) this.toast('Register a project first.'); return; }
    if(!silent) this.toast('🩺 Checking ' + targets.length + ' project(s)…');
    for(const p of targets) await this.check(p.id, silent);
    if(!silent) this.toast('Health check complete ✓', 'ok');
  },
  /* V1.1 enterprise: free desktop notifications (browser Notification API —
     no server, no service). Fired only for CRITICAL transitions and only when
     the operator enabled them in Settings. */
  /* V1.3 enterprise: WEBHOOK ALERTS — free push to Discord / Slack /
     Telegram / any webhook URL (Settings → Alerts). Critical incidents are
     POSTed as they happen, so the phone buzzes even with the console closed.
     Payload shapes auto-detected from the URL. Fire-and-forget: alert
     failures never break monitoring. */
  webhook(msg){
    const url = String(Store.settings().webhookUrl || '').trim();
    if(!url) return;
    try{
      let body, headers = { 'Content-Type':'application/json' };
      if(/discord\.com\/api\/webhooks/.test(url)) body = JSON.stringify({ content: msg.slice(0, 1900), username: 'HMG Fleet Console' });
      else if(/hooks\.slack\.com/.test(url)) body = JSON.stringify({ text: msg });
      else if(/api\.telegram\.org\/bot.+\/sendMessage/.test(url)){
        const chat = String(Store.settings().webhookChat || '').trim();
        if(!chat) return;
        body = JSON.stringify({ chat_id: chat, text: msg });
      }
      else body = JSON.stringify({ source:'hmg-fleet-console', text: msg, at: new Date().toISOString() });
      fetch(url, { method:'POST', headers, body }).catch(() => {});
    }catch(_){ }
  },
  notify(title, body){
    try{
      if(!Store.settings().desktopNotify) return;
      if(!('Notification' in window) || Notification.permission !== 'granted') return;
      new Notification(title, { body, icon:'assets/img/logo-192.png', tag:'hmg-fleet' });
    }catch(_){ }
  },
  /* V1.1 enterprise: one-click WhatsApp escalation with a prefilled situation
     report — free click-to-chat, no API. */
  waEscalate(p, extra){
    const s = p.status || {};
    const lines = [
      'HMG Fleet Console — situation report',
      'Project: ' + p.name + ' (' + this.typeLabel(p.type) + ')',
      'Supabase: ' + p.url,
      p.site ? 'Site: ' + p.site : '',
      'Health: REST ' + (s.rest || '?') + (s.restMs != null ? ' ' + s.restMs + 'ms' : '') + ' · Auth ' + (s.auth || '?') + ' · Storage ' + (s.storage || '?') + (p.site ? ' · Site ' + (s.site || '?') : ''),
      s.license ? 'Subscription: ' + s.license : '',
      'Heartbeat age: ' + (this.heartbeatDays(p) == null ? 'unknown' : this.heartbeatDays(p).toFixed(1) + ' day(s)'),
      extra || '',
      'Time: ' + new Date().toLocaleString()
    ].filter(Boolean).join('\n');
    window.open(((window.Brand && Brand.WHATSAPP) || 'https://wa.me/2348100866322') + '?text=' + encodeURIComponent(lines), '_blank', 'noopener');
  },
  _transitions(p, prev, s, silent){
    /* V1.6: planned maintenance — record a single quiet info line instead of
       red alarms; recoveries still log so the window's history is complete. */
    if(this.inMaintenance(p)){
      if(prev.rest === 'ok' && s.rest !== 'ok' && !s._maintLogged){
        s._maintLogged = true;
        Store.addIncident({ projectId:p.id, project:p.name, kind:'maintenance', sev:'info', msg:'Went offline during a scheduled maintenance window (expected).' });
      }
      return;
    }
    s._maintLogged = false;
    const log = (kind, sev, msg) => {
      Store.addIncident({ projectId:p.id, project:p.name, kind, sev, msg });
      if(sev === 'bad'){
        if(!silent) this.toast(p.name + ': ' + msg, 'bad');
        this.notify('🚨 ' + p.name, msg);
        this.webhook('🚨 ' + p.name + ' — ' + msg);
      }
    };
    if(prev.rest && prev.rest !== s.rest){
      if(s.rest !== 'ok') log('rest', 'bad', 'Database API went ' + s.rest.toUpperCase() + '.');
      else Store.addIncident({ projectId:p.id, project:p.name, kind:'rest', sev:'ok', msg:'Database API recovered.', resolved:true });
    }
    if(prev.auth && prev.auth !== s.auth){
      if(s.auth !== 'ok') log('auth', 'bad', 'Auth service went ' + s.auth.toUpperCase() + ' — sign-ins will fail.');
      else Store.addIncident({ projectId:p.id, project:p.name, kind:'auth', sev:'ok', msg:'Auth service recovered.', resolved:true });
    }
    if(p.site && prev.site && prev.site !== s.site){
      if(s.site !== 'ok') log('site', 'bad', 'Live site unreachable (check Vercel deployment / domain).');
      else Store.addIncident({ projectId:p.id, project:p.name, kind:'site', sev:'ok', msg:'Live site reachable again.', resolved:true });
    }
    if(prev.license && s.license && prev.license !== s.license && s.license !== 'no-rpc'){
      const L = String(s.license).toLowerCase();
      log('license', ['expired','suspended'].includes(L) ? 'warn' : 'info', 'Subscription verdict changed: ' + prev.license + ' → ' + s.license + '.');
    }
    const hb = this.heartbeatDays(p);
    if(hb != null && hb >= Store.settings().dangerHeartbeatDays && !(prev._pauseWarned)){
      s._pauseWarned = true;
      log('pause-risk', 'bad', 'Heartbeat is ' + hb.toFixed(1) + ' days old — Supabase pauses free projects at 7 days of inactivity. Ping NOW.');
    }
    if(hb != null && hb < Store.settings().warnHeartbeatDays) s._pauseWarned = false;
  },

  /* =========================== derived state =========================== */
  heartbeatDays(p){
    const s = p.status || {};
    const t = s.heartbeat ? new Date(s.heartbeat).getTime() : (p.lastPing || null);
    return t ? (Date.now() - t) / 86400000 : null;
  },
  /* V1.9: one-time vs subscription — one-time has no renewal concept */
  isOnetime(p){ return String(p.billing || 'subscription').toLowerCase() === 'onetime'; },
  billingLabel(p){ return this.isOnetime(p) ? 'One-time' : 'Subscription'; },
  billingPill(p){ return this.isOnetime(p) ? this.pill('💎 one-time / lifetime', 'ok') : this.pill('🔁 subscription', 'brand'); },
  renewalDays(p){
    if(this.isOnetime(p)) return null;
    if(!p.renewal) return null;
    const t = new Date(p.renewal + 'T00:00:00').getTime();
    return isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000);
  },
  /* V1.9: API key expiry countdown from the JWT itself (no network) */
  keyExpiryDays(p){
    try{
      const parts = String(p.key || '').split('.');
      if(parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if(!payload.exp) return null;
      return Math.ceil((payload.exp * 1000 - Date.now()) / 86400000);
    }catch(_){ return null; }
  },
  keyExpiryPill(p){
    const d = this.keyExpiryDays(p);
    if(d == null) return '';
    if(d < 0) return this.pill('🔑 key expired ' + (-d) + 'd ago', 'bad');
    if(d <= 14) return this.pill('🔑 key expires in ' + d + 'd', 'bad');
    if(d <= 45) return this.pill('🔑 key ' + d + 'd left', 'warn');
    return this.pill('🔑 key ' + d + 'd', 'mut');
  },
  /* V1.9: SLO / error-budget maths */
  errorBudget(p){
    const up = this.uptimePct(p.id);
    const slo = Number(p.slo || 99.5);
    if(up == null) return null;
    const allowed = 100 - slo;
    const actual = 100 - up;
    return { slo, up, allowed, actual, remaining: allowed - actual, exhausted: actual > allowed };
  },
  /* Health score 0–100: transparent, deterministic, explained in the guide. */
  score(p){
    const s = p.status || {};
    if(!p.lastCheck) return null;
    let n = 100;
    if(s.rest !== 'ok') n -= 45;
    if(s.auth && s.auth !== 'ok') n -= 20;
    if(s.storage && s.storage !== 'ok') n -= 5;
    if(p.site && s.site !== 'ok') n -= 10;
    const hb = this.heartbeatDays(p);
    const st = Store.settings();
    if(hb == null) n -= 5;
    else if(hb >= st.dangerHeartbeatDays) n -= 25;
    else if(hb >= st.warnHeartbeatDays) n -= 10;
    const L = String(s.license || '').toLowerCase();
    if(['expired','suspended'].includes(L)) n -= 10;
    if(s.restMs != null && s.restMs > 2500) n -= 5;
    return Math.max(0, Math.min(100, n));
  },
  scoreKind(n){ return n == null ? 'mut' : n >= 85 ? 'ok' : n >= 60 ? 'warn' : 'bad'; },
  uptimePct(id){
    const h = Store.history(id).filter(x => x.up != null);
    if(!h.length) return null;
    return Math.round(100 * h.reduce((a, x) => a + (x.up ? 1 : 0), 0) / h.length);
  },
  avgLatency(id){
    const h = Store.history(id).filter(x => typeof x.ms === 'number');
    if(!h.length) return null;
    return Math.round(h.reduce((a, x) => a + x.ms, 0) / h.length);
  },
  /* V1.2 enterprise: MTTR (mean time to resolve) from the incident journal —
     the KPI every NOC tracks. Computed over resolved critical/warning
     incidents that carry a resolvedAt stamp. */
  mttr(projectId){
    const rows = Store.incidents().filter(i =>
      (!projectId || i.projectId === projectId) && i.resolved && i.resolvedAt && i.at &&
      (i.sev === 'bad' || i.sev === 'warn'));
    if(!rows.length) return null;
    const avgMs = rows.reduce((a, i) => a + Math.max(0, i.resolvedAt - i.at), 0) / rows.length;
    return { count: rows.length, avgMs };
  },
  fmtDur(ms){
    if(ms == null) return '—';
    const m = Math.round(ms / 60000);
    if(m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if(h < 24) return h + 'h ' + (m % 60) + 'm';
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  },
  /* V1.9: deployment tracking — fetch public version markers from the live site.
     Tries sw.js CACHE literal, then manifest.json, then root HTML title — stores
     every new version in deployHistory (capped 30) and logs an incident. */
  async checkDeploy(id, silent){
    const list = Store.projects();
    const p = list.find(x => x.id === id); if(!p || !p.site) return null;
    const base = p.site.replace(/\/+$/, '');
    const tryFetch = async (path) => {
      try{ const r = await this.tFetch(base + path, {}, 8000); if(!r.ok) return null; return await r.text(); }catch(_){ return null; }
    };
    let ver = null, src = '';
    const sw = await tryFetch('/sw.js');
    if(sw){ const m = sw.match(/const CACHE = '([^']+)'/); if(m){ ver = m[1]; src = 'sw.js'; } }
    if(!ver){
      const mf = await tryFetch('/manifest.json');
      if(mf){ try{ const j = JSON.parse(mf); if(j.version) { ver = String(j.version); src = 'manifest.json'; } }catch(_){ } }
    }
    if(!ver) return null;
    if(!Array.isArray(p.deployHistory)) p.deployHistory = [];
    const last = p.deployHistory[0];
    if(!last || last.version !== ver){
      p.deployHistory.unshift({ at: Date.now(), version: ver, src });
      if(p.deployHistory.length > 30) p.deployHistory.length = 30;
      Store.saveProjects(list);
      Store.addIncident({ projectId:p.id, project:p.name, kind:'deploy', sev:'info', msg:'Deployment detected: ' + ver + ' (' + src + ').' });
      if(!silent) this.toast(p.name + ': new deployment ' + ver, 'ok');
      document.dispatchEvent(new CustomEvent('fleet:changed'));
    }
    return ver;
  },
  async checkDeployAll(silent){
    const targets = Store.projects().filter(p => !p.paused && p.site);
    for(const p of targets) await this.checkDeploy(p.id, silent);
  },

  fleetSummary(){
    const list = Store.projects();
    const sum = { total:list.length, ok:0, warn:0, bad:0, unknown:0, paused:0, pauseRisk:0, renewalsSoon:0, expired:0, onetime:0, subscription:0, revenue:0, keyRisk:0 };
    const st = Store.settings();
    list.forEach(p => {
      if(this.isOnetime(p)){ sum.onetime++; sum.revenue += Number(p.billingAmount) || 0; }
      else { sum.subscription++; }
      if(p.paused){ sum.paused++; return; }
      const n = this.score(p);
      if(n == null) sum.unknown++;
      else if(n >= 85) sum.ok++;
      else if(n >= 60) sum.warn++;
      else sum.bad++;
      const hb = this.heartbeatDays(p);
      if(hb != null && hb >= st.warnHeartbeatDays) sum.pauseRisk++;
      const rd = this.renewalDays(p);
      if(rd != null && rd <= st.renewalWarnDays && rd >= 0) sum.renewalsSoon++;
      const kd = this.keyExpiryDays(p);
      if(kd != null && kd <= 30) sum.keyRisk++;
      const L = String((p.status || {}).license || '').toLowerCase();
      if(['expired','suspended'].includes(L)) sum.expired++;
    });
    return sum;
  },

  /* =========================== render helpers =========================== */
  age(ts){
    if(!ts) return '—';
    const d = Date.now() - new Date(ts).getTime();
    const m = Math.floor(d / 60000);
    if(m < 1) return 'just now';
    if(m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if(h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  },
  pill(txt, k){ return '<span class="pill p-' + k + '">' + txt + '</span>'; },
  kaCell(p){
    const s = p.status || {};
    const hbAge = this.heartbeatDays(p);
    const st = Store.settings();
    if(s.ping === 'ok' && p.lastPing && Date.now() - p.lastPing < 26 * 3600000) return this.pill('✓ pinged ' + this.age(p.lastPing), 'ok');
    if(hbAge != null && hbAge < st.warnHeartbeatDays) return this.pill('❤ heartbeat ' + this.age(p.lastPing || s.heartbeat), 'ok');
    if(hbAge != null && hbAge < st.dangerHeartbeatDays) return this.pill('⚠ heartbeat ' + this.age(p.lastPing || s.heartbeat) + ' — ping soon', 'warn');
    if(hbAge != null) return this.pill('🚨 heartbeat ' + this.age(p.lastPing || s.heartbeat) + ' — PAUSE RISK', 'bad');
    if(s.ping === 'no-rpc') return this.pill('RPC missing — see Ops Toolkit', 'bad');
    if(s.ping === 'unreachable') return this.pill('unreachable', 'bad');
    return this.pill('not pinged yet', 'mut');
  },
  healthCells(p){
    const s = p.status || {};
    return [
      s.rest === 'ok' ? this.pill('REST ' + (s.restMs != null ? s.restMs + 'ms' : 'ok'), 'ok') : s.rest ? this.pill('REST ' + s.rest, 'bad') : this.pill('REST ?', 'mut'),
      s.auth === 'ok' ? this.pill('Auth ok', 'ok') : s.auth ? this.pill('Auth ' + s.auth, 'bad') : this.pill('Auth ?', 'mut'),
      s.storage === 'ok' ? this.pill('Storage ok', 'ok') : s.storage ? this.pill('Storage ' + s.storage, 'bad') : '',
      p.site ? (s.site === 'ok' ? this.pill('Site ok', 'ok') : s.site ? this.pill('Site down', 'bad') : this.pill('Site ?', 'mut')) : ''
    ].filter(Boolean).join(' ');
  },
  licenseCell(p){
    if(this.isOnetime(p)) return this.pill('💎 one-time / lifetime', 'ok');
    if(!this.isProduct(p)) return '—';
    const L = String((p.status || {}).license || '').toLowerCase();
    if(['active','ok','lifetime','valid'].includes(L)) return this.pill('✓ ' + L, 'ok');
    if(['grace','warning'].includes(L)) return this.pill('⚠ ' + L, 'warn');
    if(['expired','suspended'].includes(L)) return this.pill('🔒 ' + L + ' — data stays alive, renew when ready', 'bad');
    if(L === 'no-rpc') return this.pill('no verdict RPC', 'mut');
    if(L) return this.pill(L, 'mut');
    return this.pill('not checked', 'mut');
  },
  billingAndSloCells(p){
    const eb = this.errorBudget(p);
    return [
      this.billingPill(p) + (p.billingAmount ? ' <span class="mut">₦' + Number(p.billingAmount).toLocaleString() + '</span>' : ''),
      eb ? (eb.exhausted ? this.pill('SLO ' + eb.slo + '% — budget EXHAUSTED (' + eb.remaining.toFixed(2) + '%)', 'bad')
        : this.pill('SLO ' + eb.slo + '% — ' + eb.remaining.toFixed(2) + '% budget left', eb.remaining < 0.5 ? 'warn' : 'ok')) : this.pill('SLO ' + (p.slo || 99.5) + '% — no data', 'mut'),
      this.keyExpiryPill(p)
    ].filter(Boolean).join(' ');
  },
  sparkline(id, w, h){
    w = w || 120; h = h || 26;
    const hist = Store.history(id).slice(-40).filter(x => typeof x.ms === 'number');
    if(hist.length < 2) return '<span class="mut">no samples yet</span>';
    const max = Math.max(...hist.map(x => x.ms), 300);
    const pts = hist.map((x, i) => (i * (w / (hist.length - 1))).toFixed(1) + ',' + (h - 2 - (x.ms / max) * (h - 6)).toFixed(1)).join(' ');
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<polyline fill="none" stroke="var(--brand)" stroke-width="1.6" points="' + pts + '"/></svg>' +
      '<span class="mut" style="margin-left:6px">' + hist[hist.length - 1].ms + 'ms</span>';
  },

  /* =========================== backup / restore =========================== */
  exportList(){
    const data = Store.exportAll();
    if(!data.projects.length){ this.toast('Nothing to back up yet.'); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hmg-fleet-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); URL.revokeObjectURL(a.href);
    Store.saveSettings({ lastBackup: Date.now() });
    this.toast('Backup downloaded — keep it safe: it contains the anon keys.', 'ok');
  },
  importList(ev){
    const f = ev.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => {
      try{
        const added = Store.importAll(JSON.parse(String(r.result)));
        this.toast(added + ' project(s) restored.', 'ok');
        document.dispatchEvent(new CustomEvent('fleet:changed'));
      }catch(e){ this.toast('Not a valid backup file. (' + e.message + ')', 'bad'); }
    };
    r.readAsText(f); ev.target.value = '';
  },
  exportCsv(){
    const list = Store.projects();
    if(!list.length){ this.toast('Nothing to export yet.'); return; }
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['Name','Type','Environment','Group','Billing','Amount','Supabase URL','Site','Tags','Client','Phone','Email','Renewal','SLO %','Score','Uptime %','Avg latency ms','Heartbeat age (days)','License','Notes'].map(q).join(',')];
    list.forEach(p => {
      const hb = this.heartbeatDays(p);
      rows.push([p.name, this.typeLabel(p.type), p.env, p.group || '', p.billing || '', p.billingAmount || 0, p.url, p.site, (p.tags || []).join(' '), p.client && p.client.name, p.client && p.client.phone, p.client && p.client.email, p.renewal, p.slo || '', this.score(p), this.uptimePct(p.id), this.avgLatency(p.id), hb == null ? '' : hb.toFixed(2), (p.status || {}).license || '', p.notes].map(q).join(','));
    });
    const blob = new Blob(['\ufeff' + rows.join('\r\n')], { type:'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hmg-fleet-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click(); URL.revokeObjectURL(a.href);
    this.toast('Fleet CSV exported.', 'ok');
  },

  /* =========================== wake-up (every page load) =========================== */
  _wokeUp: false,
  wakeup(){
    if(this._wokeUp) return; this._wokeUp = true;
    const stale = Store.projects().filter(p => !p.paused && (!p.lastPing || Date.now() - p.lastPing > 5 * 86400000));
    if(stale.length){
      this.toast(stale.length + ' project(s) not pinged in 5+ days — pinging now…');
      stale.forEach(p => this.ping(p.id, true));
    }
  }
};
window.Fleet = Fleet;
