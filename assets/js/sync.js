/* =============================================================================
   HMG FLEET CONSOLE — Cloud Sync vault (V1.2)  ·  "same fleet on every device"
   -----------------------------------------------------------------------------
   THE PROBLEM IT SOLVES: the console is local-first (everything in this
   browser). Signing in on a new phone/laptop used to start with an empty
   fleet. Now every device that unlocks the same vault sees the same projects,
   incidents, history and settings — automatically.

   HOW (industry best practice for local-first apps, zero extra cost):
   • One FREE Supabase project owned by HMG acts as a dumb storage locker
     ("the vault"). One tiny table, one row per vault. 2-minute one-time setup
     (SQL snippet below, shown in Settings too).
   • END-TO-END ENCRYPTED — zero knowledge: before anything leaves the
     browser it is encrypted with AES-GCM-256, the key derived from your sync
     passphrase via PBKDF2 (210,000 iterations, SHA-256, random salt per
     write). The vault only ever stores ciphertext; whoever looks at the
     database sees noise. The passphrase itself is NEVER uploaded.
   • Tamper-proof: AES-GCM authenticates the ciphertext — a modified blob
     simply fails to decrypt, it can never inject data silently.
   • MERGE, not overwrite: on sync the remote fleet and the local fleet are
     united — projects deduped by Supabase URL (freshest status wins),
     incidents deduped by id, history samples united per project and
     time-sorted. Two devices can both work all day and both end up complete.
   • Auto-sync: pull on page open, debounced push ~8 s after any change,
     plus a manual "Sync now" button. Offline? No problem — next open syncs.

   Setup (Settings → ☁️ Cloud Sync): paste the vault project's URL + anon key,
   click 🎲 to generate a vault ID, choose a STRONG passphrase, Save & test.
   Repeat the same four values on every device. Done forever.
   ============================================================================= */
'use strict';
const SyncVault = {
  K: 'hmg-fleet-sync',        // local sync configuration (passphrase kept only if "remember" ticked)
  K_LAST: 'hmg-fleet-sync-last',
  TABLE: 'fleet_vault',

  SQL: `-- HMG Fleet Console — cloud sync vault (run ONCE in HMG's own Supabase project)
create table if not exists public.fleet_vault(
  id         text primary key,
  ciphertext text not null,          -- AES-GCM-256 blob; the server never sees plaintext
  updated_at timestamptz not null default now(),
  device     text
);
alter table public.fleet_vault enable row level security;
drop policy if exists fleet_vault_rw on public.fleet_vault;
create policy fleet_vault_rw on public.fleet_vault
  for all using (true) with check (true); -- blob is E2E-encrypted; vault IDs are long random secrets
grant select, insert, update on public.fleet_vault to anon;`,

  cfg(){
    try{ return JSON.parse(localStorage.getItem(this.K) || '{}') || {}; }catch(_){ return {}; }
  },
  saveCfg(patch){
    const c = Object.assign(this.cfg(), patch || {});
    try{ localStorage.setItem(this.K, JSON.stringify(c)); }catch(_){ }
    return c;
  },
  enabled(){
    const c = this.cfg();
    return !!(c.url && c.key && c.vault && (c.pass || this._sessionPass));
  },
  _sessionPass: null,
  pass(){ return this.cfg().pass || this._sessionPass || ''; },

  /* ------------------------- crypto (WebCrypto only) ------------------------- */
  _te: new TextEncoder(), _td: new TextDecoder(),
  _b64(buf){ let s = ''; new Uint8Array(buf).forEach(b => s += String.fromCharCode(b)); return btoa(s); },
  _unb64(str){ const bin = atob(str); const u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; },
  async _key(pass, salt){
    const base = await crypto.subtle.importKey('raw', this._te.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:210000, hash:'SHA-256' }, base, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
  },
  async encrypt(obj, pass){
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this._key(pass, salt);
    const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, this._te.encode(JSON.stringify(obj)));
    return 'hfv1.' + this._b64(salt) + '.' + this._b64(iv) + '.' + this._b64(ct);
  },
  async decrypt(blob, pass){
    const parts = String(blob || '').split('.');
    if(parts.length !== 4 || parts[0] !== 'hfv1') throw new Error('Not a fleet vault blob.');
    const key = await this._key(pass, this._unb64(parts[1]));
    const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv:this._unb64(parts[2]) }, key, this._unb64(parts[3]));
    return JSON.parse(this._td.decode(pt));
  },

  /* ------------------------- transport ------------------------- */
  _headers(c){ return { apikey:c.key, Authorization:'Bearer ' + c.key, 'Content-Type':'application/json' }; },
  async fetchRemote(){
    const c = this.cfg();
    const r = await fetch(c.url.replace(/\/+$/, '') + '/rest/v1/' + this.TABLE + '?id=eq.' + encodeURIComponent(c.vault) + '&select=ciphertext,updated_at', { headers:this._headers(c) });
    if(r.status === 404) throw new Error('Vault table missing — run the one-time SQL (Settings → Cloud Sync → 🔧 SQL).');
    if(!r.ok) throw new Error('Vault fetch failed: HTTP ' + r.status);
    const j = await r.json();
    return (j && j[0]) || null;
  },
  async pushRemote(blob){
    const c = this.cfg();
    const dev = (navigator.platform || 'device') + ' · ' + (navigator.userAgent.match(/(Chrome|Safari|Firefox|Edg)\/[\d.]+/) || ['browser'])[0];
    const r = await fetch(c.url.replace(/\/+$/, '') + '/rest/v1/' + this.TABLE, {
      method:'POST',
      headers: Object.assign({ Prefer:'resolution=merge-duplicates' }, this._headers(c)),
      body: JSON.stringify([{ id:c.vault, ciphertext:blob, updated_at:new Date().toISOString(), device:dev }])
    });
    if(!r.ok) throw new Error('Vault push failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
  },

  /* ------------------------- merge (union, never lose) ------------------------- */
  merge(remote){
    if(!remote || typeof remote !== 'object') return { projects:0, incidents:0 };
    let addedP = 0;
    // Projects: dedupe by URL; when both sides know a project, the fresher one wins.
    const local = Store.projects();
    (Array.isArray(remote.projects) ? remote.projects : []).forEach(rp => {
      if(!rp || !rp.url || !rp.key) return;
      const i = local.findIndex(lp => lp.url === rp.url);
      if(i < 0){ local.push(rp); addedP++; }
      else{
        const fresh = x => Math.max(x.lastCheck || 0, x.lastPing || 0, x.added || 0);
        if(fresh(rp) > fresh(local[i])) local[i] = Object.assign({}, local[i], rp);
      }
    });
    Store.saveProjects(local);
    // Incidents: union by id, newest first, cap 800.
    let addedI = 0;
    const inc = Store.incidents();
    const seen = new Set(inc.map(x => x.id));
    (Array.isArray(remote.incidents) ? remote.incidents : []).forEach(ri => {
      if(ri && ri.id && !seen.has(ri.id)){ inc.push(ri); seen.add(ri.id); addedI++; }
    });
    inc.sort((a, b) => (b.at || 0) - (a.at || 0));
    if(inc.length > 800) inc.length = 800;
    Store._set(Store.K_INCIDENTS, inc);
    // History: union per project, time-sorted, cap 96 each.
    const lh = Store._get(Store.K_HISTORY, {});
    const rh = (remote.history && typeof remote.history === 'object') ? remote.history : {};
    Object.keys(rh).forEach(pid => {
      const a = Array.isArray(lh[pid]) ? lh[pid] : [];
      const b = Array.isArray(rh[pid]) ? rh[pid] : [];
      const ts = new Set(a.map(x => x.t));
      b.forEach(x => { if(x && x.t && !ts.has(x.t)) a.push(x); });
      a.sort((x, y) => (x.t || 0) - (y.t || 0));
      lh[pid] = a.slice(-96);
    });
    Store._set(Store.K_HISTORY, lh);
    // Settings: never import a PIN; keep the freshest lastBackup stamp.
    if(remote.settings && typeof remote.settings === 'object'){
      const s = Object.assign({}, remote.settings); delete s.pinHash;
      if((s.lastBackup || 0) < (Store.settings().lastBackup || 0)) s.lastBackup = Store.settings().lastBackup;
      Store.saveSettings(s);
    }
    return { projects:addedP, incidents:addedI };
  },

  /* ------------------------- high-level ops ------------------------- */
  _busy: false,
  async sync(manual){
    if(!this.enabled() || this._busy) return null;
    if(!(globalThis.crypto && globalThis.crypto.subtle)){ if(manual) Shell.toast('Cloud sync needs HTTPS (WebCrypto).', 'bad'); return null; }
    this._busy = true;
    try{
      const row = await this.fetchRemote();
      let merged = { projects:0, incidents:0 };
      if(row && row.ciphertext){
        let remote;
        try{ remote = await this.decrypt(row.ciphertext, this.pass()); }
        catch(_){ throw new Error('Wrong sync passphrase for this vault (or the blob was tampered with — AES-GCM refused it).'); }
        merged = this.merge(remote);
      }
      // push the merged truth back up
      const blob = await this.encrypt(Store.exportAll(), this.pass());
      await this.pushRemote(blob);
      try{ localStorage.setItem(this.K_LAST, String(Date.now())); }catch(_){ }
      if(merged.projects || merged.incidents){
        Shell.toast('☁️ Sync: pulled ' + merged.projects + ' project(s) and ' + merged.incidents + ' incident(s) from your other devices.', 'ok');
        document.dispatchEvent(new CustomEvent('fleet:changed'));
      }else if(manual){
        Shell.toast('☁️ Vault in sync — this device is up to date.', 'ok');
      }
      return merged;
    }catch(e){
      if(manual) Shell.toast('Cloud sync: ' + (e.message || e), 'bad');
      return null;
    }finally{ this._busy = false; }
  },
  _pushTimer: null,
  schedulePush(){
    if(!this.enabled()) return;
    if(this._pushTimer) clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(async () => {
      try{
        const blob = await this.encrypt(Store.exportAll(), this.pass());
        await this.pushRemote(blob);
        try{ localStorage.setItem(this.K_LAST, String(Date.now())); }catch(_){ }
      }catch(_){ /* next change or page-open retries */ }
    }, 8000);
  },
  lastSync(){
    try{ return Number(localStorage.getItem(this.K_LAST) || 0); }catch(_){ return 0; }
  },
  makeVaultId(){
    const u = crypto.getRandomValues(new Uint8Array(18));
    return 'vault-' + Array.from(u).map(b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  },
  init(){
    // Configured but passphrase not remembered → ask once per session (skippable).
    const c = this.cfg();
    if(c.url && c.key && c.vault && !c.pass && !this._sessionPass){
      try{
        const cached = sessionStorage.getItem('hmg-fleet-sync-pass');
        if(cached) this._sessionPass = cached;
        else{
          const p = prompt('☁️ Cloud Sync passphrase for this session (Cancel = stay offline on this device):');
          if(p){ this._sessionPass = p; sessionStorage.setItem('hmg-fleet-sync-pass', p); }
        }
      }catch(_){ }
    }
    if(!this.enabled()) return;
    // pull on open (slight delay so the page paints first), then push-on-change
    setTimeout(() => this.sync(false), 2500);
    document.addEventListener('fleet:changed', () => this.schedulePush());
  }
};
window.SyncVault = SyncVault;
