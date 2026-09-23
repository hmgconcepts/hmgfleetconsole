/* =============================================================================
   HMG FLEET CONSOLE — Store (V1.0)
   -----------------------------------------------------------------------------
   Single storage layer for the whole platform. Everything lives in THIS
   browser's localStorage — no server, no tracking, no third-party calls.
   Keys:
     hmg-fleet-projects  — the fleet list (SAME key as the old single-file
                           console, so upgrading is automatic: old entries are
                           read as-is and enriched with the new fields).
     hmg-fleet-settings  — theme, thresholds, auto-pilot, PIN, board options.
     hmg-fleet-incidents — rolling incident/event journal (max 800 entries).
     hmg-fleet-history   — per-project latency/status samples (max 96 each,
                           enough for ~4 days of 1-hourly checks) powering
                           sparklines and uptime %.
   Every write is JSON, every read is defensive (corrupt data can never brick
   the console). Export/import produces one portable JSON file carrying ALL
   four keys, so moving machines is a two-click operation.
   ============================================================================= */
'use strict';
const Store = {
  K_PROJECTS : 'hmg-fleet-projects',
  K_SETTINGS : 'hmg-fleet-settings',
  K_INCIDENTS: 'hmg-fleet-incidents',
  K_HISTORY  : 'hmg-fleet-history',

  _get(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if(raw == null) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    }catch(_){ return fallback; }
  },
  _set(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e){
      // localStorage full or blocked — surface loudly, never silently lose data.
      if(window.Shell && Shell.toast) Shell.toast('Could not save (' + (e && e.name || 'storage error') + '). Export a backup now.', 'bad');
      return false;
    }
  },

  /* ---------------- projects ---------------- */
  projects(){
    const list = this._get(this.K_PROJECTS, []);
    if(!Array.isArray(list)) return [];
    // Migration/enrichment: old single-file console entries gain new fields
    // with safe defaults; nothing is ever dropped.
    let dirty = false;
    list.forEach(p => {
      if(p && typeof p === 'object'){
        if(p.tags === undefined){ p.tags = []; dirty = true; }
        if(p.env === undefined){ p.env = 'production'; dirty = true; }
        if(p.client === undefined){ p.client = { name:'', phone:'', email:'' }; dirty = true; }
        if(p.billing === undefined){
          /* V1.9: one-time vs subscription — infer from existing data so old
             installs upgrade truthfully: no renewal + feeNote containing
             lifetime/one-time → one-time, else subscription (safe default). */
          const hasRenewal = !!(p.renewal && String(p.renewal).trim());
          const fee = String(p.feeNote || p.notes || '').toLowerCase();
          const looksOnetime = !hasRenewal && /(lifetime|one.time|onetime|one-time|₦0.*forever|owns.*forever)/.test(fee);
          p.billing = looksOnetime ? 'onetime' : 'subscription';
          dirty = true;
        }
        if(p.renewal === undefined){ p.renewal = ''; dirty = true; }
        if(p.feeNote === undefined){ p.feeNote = ''; dirty = true; }
        if(p.billingAmount === undefined){ p.billingAmount = 0; dirty = true; }
        if(p.runbook === undefined){ p.runbook = ''; dirty = true; }
        if(p.slo === undefined){ p.slo = 99.5; dirty = true; }
        if(p.group === undefined){ p.group = ''; dirty = true; }
        if(p.deployHistory === undefined){ p.deployHistory = []; dirty = true; }
        if(p.paused === undefined){ p.paused = false; dirty = true; }
        if(!p.status || typeof p.status !== 'object'){ p.status = {}; dirty = true; }
      }
    });
    if(dirty) this._set(this.K_PROJECTS, list);
    return list.filter(p => p && p.url && p.key);
  },
  saveProjects(list){ return this._set(this.K_PROJECTS, list); },
  project(id){ return this.projects().find(p => p.id === id) || null; },
  upsertProject(p){
    const list = this.projects();
    const i = list.findIndex(x => x.id === p.id);
    if(i >= 0) list[i] = p; else list.push(p);
    return this.saveProjects(list) ? p : null;
  },
  removeProject(id){
    const list = this.projects().filter(p => p.id !== id);
    this.saveProjects(list);
    const h = this._get(this.K_HISTORY, {});
    delete h[id];
    this._set(this.K_HISTORY, h);
  },

  /* ---------------- settings ---------------- */
  DEFAULTS: {
    theme: 'dark',
    autoPilot: false,               // honoured on EVERY page while any tab is open
    autoHours: 12,                  // auto-pilot interval
    warnHeartbeatDays: 3,           // heartbeat age → ⚠ ping soon
    dangerHeartbeatDays: 6,         // heartbeat age → 🚨 PAUSE RISK (Supabase pauses at 7)
    renewalWarnDays: 14,            // subscription renewal approaching
    boardRefreshMin: 10,            // wallboard auto-refresh
    desktopNotify: false,           // free browser notifications on critical transitions
    webhookUrl: '',                 // Discord/Slack/Telegram/any webhook for critical alerts
    webhookChat: '',                // Telegram chat_id (only for Telegram URLs)
    pinHash: '',                    // optional SHA-256 console PIN ('' = off)
    lastBackup: 0                   // timestamp of last export (backup reminders)
  },
  settings(){
    const s = this._get(this.K_SETTINGS, {});
    return Object.assign({}, this.DEFAULTS, (s && typeof s === 'object') ? s : {});
  },
  saveSettings(patch){
    const s = Object.assign(this.settings(), patch || {});
    this._set(this.K_SETTINGS, s);
    return s;
  },

  /* ---------------- incidents ---------------- */
  incidents(){ const a = this._get(this.K_INCIDENTS, []); return Array.isArray(a) ? a : []; },
  addIncident(entry){
    const a = this.incidents();
    a.unshift(Object.assign({ id:'i' + Date.now() + Math.random().toString(36).slice(2,6), at: Date.now(), resolved:false, manual:false }, entry));
    if(a.length > 800) a.length = 800;
    this._set(this.K_INCIDENTS, a);
    return a[0];
  },
  updateIncident(id, patch){
    const a = this.incidents();
    const i = a.findIndex(x => x.id === id);
    if(i >= 0){ a[i] = Object.assign(a[i], patch); this._set(this.K_INCIDENTS, a); }
  },
  clearResolvedIncidents(){
    this._set(this.K_INCIDENTS, this.incidents().filter(x => !x.resolved));
  },

  /* ---------------- history (sparklines / uptime) ---------------- */
  history(projectId){
    const h = this._get(this.K_HISTORY, {});
    return Array.isArray(h[projectId]) ? h[projectId] : [];
  },
  addSample(projectId, sample){
    const h = this._get(this.K_HISTORY, {});
    if(!Array.isArray(h[projectId])) h[projectId] = [];
    h[projectId].push(Object.assign({ t: Date.now() }, sample));
    if(h[projectId].length > 96) h[projectId] = h[projectId].slice(-96);
    this._set(this.K_HISTORY, h);
  },

  /* ---------------- V1.6: operator audit trail ---------------- */
  K_AUDIT: 'hmg-fleet-audit',
  audit(action, detail){
    try{
      const a = this._get(this.K_AUDIT, []);
      a.unshift({ at: Date.now(), action: String(action), detail: String(detail || '') });
      if(a.length > 500) a.length = 500;
      this._set(this.K_AUDIT, a);
    }catch(_){ }
  },
  auditLog(){ const a = this._get(this.K_AUDIT, []); return Array.isArray(a) ? a : []; },

  /* ---------------- portable backup (all four keys) ---------------- */
  exportAll(){
    return {
      kind: 'hmg-fleet-backup',
      version: 2,
      exported: new Date().toISOString(),
      projects: this.projects(),
      settings: this.settings(),
      incidents: this.incidents(),
      history: this._get(this.K_HISTORY, {}),
      audit: this.auditLog()
    };
  },
  importAll(json){
    // Accepts: v2 backups, v1 backups ({kind,projects}) and bare arrays from
    // the original single-file console. Dedupe is by Supabase URL. Nothing
    // already registered is ever overwritten or lost.
    let rows = [];
    if(Array.isArray(json)) rows = json;
    else if(json && Array.isArray(json.projects)) rows = json.projects;
    else throw new Error('Not a fleet backup file.');
    const list = this.projects();
    let added = 0;
    rows.forEach(p => {
      if(p && p.url && p.key && !list.some(x => x.url === p.url)){
        if(!p.id) p.id = 'p' + Date.now() + Math.random().toString(36).slice(2,6);
        list.push(p); added++;
      }
    });
    this.saveProjects(list);
    if(json && json.version >= 2){
      if(json.settings && typeof json.settings === 'object'){
        // never import someone else's PIN silently
        const s = Object.assign({}, json.settings); delete s.pinHash;
        this.saveSettings(s);
      }
      if(Array.isArray(json.incidents) && !this.incidents().length) this._set(this.K_INCIDENTS, json.incidents.slice(0, 800));
      if(json.history && typeof json.history === 'object' && !Object.keys(this._get(this.K_HISTORY, {})).length) this._set(this.K_HISTORY, json.history);
      if(Array.isArray(json.audit) && !this.auditLog().length) this._set(this.K_AUDIT, json.audit.slice(0, 500));
    }
    return added;
  }
};
window.Store = Store;
