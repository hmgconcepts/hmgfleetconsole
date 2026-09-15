/* =============================================================================
   HMG FLEET CONSOLE — Google Drive backup & restore (V1.3)
   -----------------------------------------------------------------------------
   THE BLUEPRINT (as requested): no extra Supabase project needed. Register
   projects → they are backed up to YOUR Google Drive automatically; sign in
   on any other phone/laptop → Connect Google Drive → 📥 Restore → continue
   monitoring. The OAuth Client ID ships in the repo (gdrive-config.js) so no
   device ever needs it typed in.

   HOW IT WORKS (expert notes):
   • Google Identity Services token flow (the current, non-deprecated way for
     pure browser apps — no client secret exists or is needed).
   • Scope is ONLY "drive.appdata": a hidden folder, private to this app,
     inside the signed-in Google account's own Drive. The console can never
     see real Drive files; nothing is shared with HMG or anyone else.
   • AUTO-BACKUP: after any fleet change (~20 s debounce) the full state
     (projects + incidents + history + settings) is uploaded as
     hmg-fleet-backup-<timestamp>.json; the newest N generations are kept
     (rotation), so even a bad day has yesterday's copy.
   • RESTORE = MERGE: downloading the newest backup unions it with whatever
     is on the device (projects deduped by URL, incidents by id, history by
     timestamp — the same battle-tested merge as Cloud Sync). Restoring can
     never delete or overwrite local work.
   • OPTIONAL PASSPHRASE: tick "encrypt" and backups are sealed with
     AES-GCM-256 before upload (same engine as Cloud Sync). Without it,
     backups are plain JSON — still private to your own Google account.
   • Both Cloud Sync (Supabase vault) and Drive backup can run together;
     each is a complete, independent answer to "same fleet on every device".
   ============================================================================= */
'use strict';
const GDrive = {
  K: 'hmg-fleet-gdrive',            // { connected:1, email, auto:1, pass:'' }
  API: 'https://www.googleapis.com/drive/v3',
  UPLOAD: 'https://www.googleapis.com/upload/drive/v3',
  _token: null, _tokenExp: 0, _tokenClient: null, _gisLoading: null,

  cfg(){ try{ return JSON.parse(localStorage.getItem(this.K) || '{}') || {}; }catch(_){ return {}; } },
  saveCfg(patch){ const c = Object.assign(this.cfg(), patch || {}); try{ localStorage.setItem(this.K, JSON.stringify(c)); }catch(_){ } return c; },
  clientId(){ return String((window.FLEET_GDRIVE || {}).CLIENT_ID || '').trim(); },
  ready(){ return !!this.clientId(); },
  connected(){ return !!this.cfg().connected; },

  /* ---------------- Google Identity Services loader ---------------- */
  loadGis(){
    if(window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if(this._gisLoading) return this._gisLoading;
    this._gisLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => res();
      s.onerror = () => { this._gisLoading = null; rej(new Error('Could not load Google Sign-In (network/adblock?). Try again online.')); };
      document.head.appendChild(s);
    });
    return this._gisLoading;
  },

  /* ---------------- token management ---------------- */
  async token(interactive){
    // cached in memory + sessionStorage (Google access tokens last ~1 h)
    if(this._token && Date.now() < this._tokenExp - 60000) return this._token;
    try{
      const c = JSON.parse(sessionStorage.getItem('hmg-fleet-gtok') || 'null');
      if(c && c.t && Date.now() < c.e - 60000){ this._token = c.t; this._tokenExp = c.e; return c.t; }
    }catch(_){ }
    await this.loadGis();
    return new Promise((resolve, reject) => {
      try{
        this._tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: this.clientId(),
          scope: (window.FLEET_GDRIVE || {}).SCOPE || 'https://www.googleapis.com/auth/drive.appdata',
          callback: (resp) => {
            if(resp && resp.access_token){
              this._token = resp.access_token;
              this._tokenExp = Date.now() + (Number(resp.expires_in || 3500) * 1000);
              try{ sessionStorage.setItem('hmg-fleet-gtok', JSON.stringify({ t:this._token, e:this._tokenExp })); }catch(_){ }
              resolve(this._token);
            }else reject(new Error((resp && resp.error) || 'Google did not return a token.'));
          },
          error_callback: (err) => reject(new Error((err && (err.message || err.type)) || 'Google sign-in was closed.'))
        });
        // Previously-consented users get a silent refresh (prompt:''); first
        // time (or interactive) shows the account chooser + consent once.
        this._tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      }catch(e){ reject(e); }
    });
  },

  async _fetch(url, opts, tok){
    const r = await fetch(url, Object.assign({}, opts, {
      headers: Object.assign({ Authorization: 'Bearer ' + tok }, (opts && opts.headers) || {})
    }));
    if(r.status === 401){ this._token = null; try{ sessionStorage.removeItem('hmg-fleet-gtok'); }catch(_){ } throw new Error('Google session expired — click Connect again.'); }
    return r;
  },

  /* ---------------- connect / disconnect ---------------- */
  async connect(){
    if(!this.ready()){ Shell.toast('No Google Client ID configured yet — see the setup guide in Settings → Google Drive backup.', 'bad'); return false; }
    try{
      const tok = await this.token(true);
      // whoami (needs no extra scope: about.user is included with drive scopes)
      let email = '';
      try{
        const r = await this._fetch(this.API + '/about?fields=user(emailAddress,displayName)', {}, tok);
        if(r.ok){ const j = await r.json(); email = (j.user && j.user.emailAddress) || ''; }
      }catch(_){ }
      this.saveCfg({ connected: 1, email, auto: this.cfg().auto == null ? 1 : this.cfg().auto });
      Shell.toast('✅ Google Drive connected' + (email ? ' as ' + email : '') + '. Auto-backup is ON.', 'ok');
      document.dispatchEvent(new CustomEvent('gdrive:changed'));
      this.backup(false);   // first backup immediately
      return true;
    }catch(e){ Shell.toast('Google Drive: ' + (e.message || e), 'bad'); return false; }
  },
  disconnect(){
    this._token = null;
    try{ sessionStorage.removeItem('hmg-fleet-gtok'); }catch(_){ }
    this.saveCfg({ connected: 0 });
    Shell.toast('Google Drive disconnected on this device. Backups already in Drive are kept.', 'ok');
    document.dispatchEvent(new CustomEvent('gdrive:changed'));
  },

  /* ---------------- backup (upload + rotation) ---------------- */
  fileName(){ return String((window.FLEET_GDRIVE || {}).FILE_NAME || 'hmg-fleet-backup.json').replace(/\.json$/i, ''); },
  /* Pure helper (unit-tested): which file ids to delete to keep N newest. */
  pruneList(files, keep){
    let k = Number(keep);
    if(!isFinite(k)) k = 5;      // unset → default 5 generations
    if(k < 1) k = 1;             // never delete the newest backup
    return (files || [])
      .slice()
      .sort((a, b) => String(b.createdTime || '').localeCompare(String(a.createdTime || '')))
      .slice(k)
      .map(f => f.id);
  },
  async listBackups(tok){
    const q = encodeURIComponent("name contains '" + this.fileName() + "' and trashed=false");
    const r = await this._fetch(this.API + "/files?spaces=appDataFolder&q=" + q + "&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=50", {}, tok);
    if(!r.ok) throw new Error('Drive list failed: HTTP ' + r.status);
    return (await r.json()).files || [];
  },
  async payload(){
    const data = Store.exportAll();
    const pass = this.cfg().pass || '';
    if(pass && window.SyncVault){
      return JSON.stringify({ kind:'hmg-fleet-gdrive-encrypted', blob: await SyncVault.encrypt(data, pass) });
    }
    return JSON.stringify(data);
  },
  async parsePayload(text){
    let j;
    try{ j = JSON.parse(text); }catch(_){ throw new Error('Backup file is not valid JSON.'); }
    if(j && j.kind === 'hmg-fleet-gdrive-encrypted'){
      const pass = this.cfg().pass || prompt('This backup is encrypted. Enter the backup passphrase:') || '';
      if(!pass) throw new Error('Passphrase required for this backup.');
      try{ return await SyncVault.decrypt(j.blob, pass); }
      catch(_){ throw new Error('Wrong passphrase for this backup.'); }
    }
    return j;
  },
  _busy: false,
  async backup(manual){
    if(!this.connected() || this._busy) return null;
    this._busy = true;
    try{
      const tok = await this.token(false);
      const name = this.fileName() + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      const body = await this.payload();
      const boundary = 'hmgfleet' + Date.now();
      const multipart =
        '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify({ name, parents: ['appDataFolder'] }) +
        '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' +
        body + '\r\n--' + boundary + '--';
      const r = await this._fetch(this.UPLOAD + '/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: multipart
      }, tok);
      if(!r.ok) throw new Error('Drive upload failed: HTTP ' + r.status);
      // rotation: keep newest N generations
      try{
        const files = await this.listBackups(tok);
        for(const id of this.pruneList(files, (window.FLEET_GDRIVE || {}).KEEP_GENERATIONS)){
          await this._fetch(this.API + '/files/' + id, { method:'DELETE' }, tok).catch(() => {});
        }
      }catch(_){ }
      this.saveCfg({ lastBackup: Date.now() });
      Store.saveSettings({ lastBackup: Date.now() });   // also feeds the 14-day reminder
      if(manual) Shell.toast('☁️ Backed up to Google Drive (' + name + ').', 'ok');
      document.dispatchEvent(new CustomEvent('gdrive:changed'));
      return name;
    }catch(e){
      if(manual) Shell.toast('Drive backup: ' + (e.message || e), 'bad');
      return null;
    }finally{ this._busy = false; }
  },

  /* ---------------- restore (download newest + MERGE) ---------------- */
  async restore(){
    if(!this.connected()){ Shell.toast('Connect Google Drive first.', 'bad'); return; }
    try{
      const tok = await this.token(false);
      const files = await this.listBackups(tok);
      if(!files.length){ Shell.toast('No fleet backups found in this Google account yet — click 💾 Back up now on the device that has your projects.', 'warn'); return; }
      const newest = files[0];
      const r = await this._fetch(this.API + '/files/' + newest.id + '?alt=media', {}, tok);
      if(!r.ok) throw new Error('Drive download failed: HTTP ' + r.status);
      const data = await this.parsePayload(await r.text());
      // MERGE (union — never deletes local work). SyncVault.merge is the
      // battle-tested engine; fall back to Store.importAll if absent.
      let msg;
      if(window.SyncVault && SyncVault.merge){
        const res = SyncVault.merge(data);
        msg = 'restored ' + res.projects + ' project(s) and ' + res.incidents + ' incident(s)';
      }else{
        msg = 'restored ' + Store.importAll(data) + ' project(s)';
      }
      Shell.toast('📥 Google Drive restore complete — ' + msg + ' (from ' + new Date(newest.createdTime).toLocaleString() + '). Existing local data was merged, not overwritten.', 'ok');
      document.dispatchEvent(new CustomEvent('fleet:changed'));
      document.dispatchEvent(new CustomEvent('gdrive:changed'));
    }catch(e){ Shell.toast('Drive restore: ' + (e.message || e), 'bad'); }
  },

  /* ---------------- auto-backup wiring ---------------- */
  _timer: null,
  scheduleBackup(){
    const c = this.cfg();
    if(!c.connected || !c.auto) return;
    if(this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.backup(false), 20000);
  },
  init(){
    if(!this.ready()) return;
    document.addEventListener('fleet:changed', () => this.scheduleBackup());
    // Silent token refresh for already-connected devices (no popup unless needed).
    if(this.connected() && navigator.onLine){
      this.token(false).catch(() => { /* user will click Connect when next needed */ });
    }
  }
};
window.GDrive = GDrive;
