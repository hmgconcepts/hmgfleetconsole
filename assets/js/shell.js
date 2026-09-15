/* =============================================================================
   HMG FLEET CONSOLE — Shell (V1.0)
   -----------------------------------------------------------------------------
   Shared page chrome for the multi-page platform:
     • sidebar navigation (injected on every page — one place to maintain);
     • dark/light theme (persisted);
     • toast notifications;
     • optional console PIN (SHA-256 via WebCrypto — the PIN itself is never
       stored, only its hash; this is a courtesy screen-lock for shared
       machines, NOT cryptographic security: all real security still comes
       from Supabase RLS on the client projects);
     • cross-page AUTO-PILOT: whichever console page is open, the shared
       ticker pings + health-checks the whole fleet on the configured
       interval, and a stale-heartbeat wake-up fires on every page load;
     • backup reminder if the fleet changed and no export happened recently.
   ============================================================================= */
'use strict';
const Shell = {
  PAGES: [
    { href:'index.html',     icon:'📊', label:'Dashboard' },
    { href:'projects.html',  icon:'🗂️', label:'Projects' },
    { href:'incidents.html', icon:'🚨', label:'Incidents' },
    { href:'reports.html',   icon:'📈', label:'Reports & Uptime' },
    { href:'board.html',     icon:'🖥️', label:'Wallboard (NOC)' },
    { href:'tools.html',     icon:'🧰', label:'Ops Toolkit' },
    { sect:'Reference' },
    { href:'guide.html',     icon:'📖', label:'Feature Guide' },
    { href:'deploy.html',    icon:'🚀', label:'Deployment' },
    { href:'about.html',     icon:'🏢', label:'About & Ecosystem' },
    { href:'settings.html',  icon:'⚙️', label:'Settings' }
  ],

  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },

  toast(msg, kind){
    let host = document.getElementById('toast');
    if(!host){ host = document.createElement('div'); host.id = 'toast'; document.body.appendChild(host); }
    const d = document.createElement('div');
    d.className = 'tst' + (kind ? ' ' + kind : '');
    d.textContent = msg;
    host.appendChild(d);
    setTimeout(() => d.remove(), 6500);
  },

  copy(text, doneMsg){
    const finish = ok => this.toast(ok ? (doneMsg || 'Copied to clipboard.') : 'Copy failed — select and copy manually.', ok ? 'ok' : 'bad');
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(() => finish(true), () => finish(false));
    }else{
      try{
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove(); finish(ok);
      }catch(_){ finish(false); }
    }
  },

  /* ---------------- theme ---------------- */
  applyTheme(){
    document.documentElement.setAttribute('data-theme', Store.settings().theme === 'light' ? 'light' : 'dark');
  },
  toggleTheme(){
    const next = Store.settings().theme === 'light' ? 'dark' : 'light';
    Store.saveSettings({ theme: next });
    this.applyTheme();
  },

  /* ---------------- nav ---------------- */
  buildNav(active){
    const here = active || (location.pathname.split('/').pop() || 'index.html');
    const items = this.PAGES.map(p => {
      if(p.sect) return '<div class="sect">' + this.esc(p.sect) + '</div>';
      const on = p.href === here ? ' active' : '';
      return '<a class="item' + on + '" href="' + p.href + '">' + p.icon + ' ' + this.esc(p.label) + '</a>';
    }).join('');
    return '<div class="brand"><img src="assets/img/logo.svg" alt=""><span><b>HMG Fleet Console</b><small>every client project · one screen</small></span></div>' +
      items +
      '<div class="sect">Quick actions</div>' +
      '<a class="item" href="#" onclick="Fleet.pingAll();return false">⚡ Keep ALL alive</a>' +
      '<a class="item" href="#" onclick="Fleet.checkAll();return false">🩺 Health-check all</a>' +
      '<a class="item" href="#" onclick="Shell.toggleTheme();return false">🌓 Theme</a>' +
      '<a class="item" href="#" onclick="if(window.PWAInstall)PWAInstall.prompt();return false">📲 Install app</a>' +
      '<a class="item" href="#" onclick="Shell.openPalette();return false" title="Or press Ctrl+K anywhere">⌨️ Command palette <span class="mut" style="font-size:.62rem">Ctrl+K</span></a>' +
      '<a class="item" href="#" onclick="if(window.Auth)Auth.logout();return false">🚪 Sign out</a>' +
      '<div class="mut" style="padding:14px 10px 4px;font-size:.66rem">HMG CONCEPTS · His Marvellous Grace<br>Free-tier ops · No server · No tracking<br>Data stays in this browser</div>';
  },
  mountNav(){
    const aside = document.querySelector('aside.nav');
    if(aside) aside.innerHTML = this.buildNav();
    const burger = document.getElementById('nav-burger');
    if(burger) burger.onclick = () => { const a = document.querySelector('aside.nav'); if(a) a.classList.toggle('open'); };
  },

  /* ---------------- optional PIN lock ---------------- */
  async sha256(text){
    if(!(window.crypto && crypto.subtle)) return null; // http:// or very old browser — PIN silently unavailable
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async gate(){
    const s = Store.settings();
    if(!s.pinHash) return true;
    if(sessionStorage.getItem('hmg-fleet-unlocked') === s.pinHash) return true;
    return new Promise(resolve => {
      const veil = document.createElement('div');
      veil.id = 'lockveil';
      veil.innerHTML =
        '<div class="card"><h3 style="margin:0 0 8px">🔐 Console locked</h3>' +
        '<p class="mut" style="margin:0 0 12px">Enter the console PIN. (Forgot it? Clear this site\'s data in the browser — the fleet list is in your latest backup file.)</p>' +
        '<input id="lv-pin" type="password" inputmode="numeric" placeholder="PIN" autocomplete="off" style="text-align:center;font-size:1.1rem">' +
        '<button class="btn btn-primary" id="lv-go" style="margin-top:12px;width:100%;justify-content:center">Unlock</button>' +
        '<p class="mut" id="lv-err" style="margin:10px 0 0"></p></div>';
      document.body.appendChild(veil);
      const tryIt = async () => {
        const h = await this.sha256(document.getElementById('lv-pin').value);
        if(h === s.pinHash){
          sessionStorage.setItem('hmg-fleet-unlocked', s.pinHash);
          veil.remove(); resolve(true);
        }else{
          document.getElementById('lv-err').textContent = 'Wrong PIN.';
          document.getElementById('lv-pin').value = '';
        }
      };
      document.getElementById('lv-go').onclick = tryIt;
      document.getElementById('lv-pin').addEventListener('keydown', e => { if(e.key === 'Enter') tryIt(); });
      document.getElementById('lv-pin').focus();
    });
  },

  /* ---------------- cross-page auto-pilot ---------------- */
  _apTimer: null,
  startAutoPilot(){
    if(this._apTimer){ clearInterval(this._apTimer); this._apTimer = null; }
    const s = Store.settings();
    if(!s.autoPilot) return;
    const ms = Math.max(1, Number(s.autoHours) || 12) * 3600000;
    this._apTimer = setInterval(() => { Fleet.pingAll(true); Fleet.checkAll(true); }, ms);
  },

  /* ---------------- backup reminder ---------------- */
  backupReminder(){
    const s = Store.settings();
    if(!Store.projects().length) return;
    const days = (Date.now() - (s.lastBackup || 0)) / 86400000;
    if(days > 14){
      this.toast('💾 It has been ' + (s.lastBackup ? Math.floor(days) + ' days' : 'forever') + ' since your last fleet backup. Ops Toolkit → Backup.', 'warn');
    }
  },

  /* ---------------- command palette (V1.3, Ctrl/Cmd+K) ---------------- */
  openPalette(){
    if(document.getElementById('cmdk')) { document.getElementById('cmdk-in').focus(); return; }
    const wrap = document.createElement('div');
    wrap.id = 'cmdk';
    wrap.setAttribute('style', 'position:fixed;inset:0;z-index:10000;background:rgba(2,6,23,.6);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh');
    wrap.innerHTML =
      '<div style="width:min(560px,92vw);background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden">' +
      '<input id="cmdk-in" placeholder="Type a page, project or action…  (Esc to close)" style="border:0;border-bottom:1px solid var(--line);border-radius:0;padding:14px 16px;font-size:1rem">' +
      '<div id="cmdk-list" style="max-height:46vh;overflow:auto"></div></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => { if(e.target === wrap) wrap.remove(); });
    const input = document.getElementById('cmdk-in');
    const items = () => {
      const cmds = [];
      this.PAGES.forEach(p => { if(p.href) cmds.push({ label: p.icon + ' Go to ' + p.label, run: () => location.href = p.href }); });
      cmds.push({ label: '⚡ Keep ALL alive now', run: () => { Fleet.pingAll(); } });
      cmds.push({ label: '🩺 Health-check all', run: () => { Fleet.checkAll(); } });
      cmds.push({ label: '🌓 Toggle theme', run: () => this.toggleTheme() });
      if(window.GDrive && GDrive.connected()){
        cmds.push({ label: '💾 Back up to Google Drive now', run: () => GDrive.backup(true) });
        cmds.push({ label: '📥 Restore from Google Drive', run: () => GDrive.restore() });
      }
      if(window.SyncVault && SyncVault.enabled()) cmds.push({ label: '☁️ Cloud Sync now', run: () => SyncVault.sync(true) });
      Store.projects().forEach(p => {
        cmds.push({ label: '🗂️ Open project: ' + p.name, run: () => location.href = 'projects.html#' + p.id });
        cmds.push({ label: '⚡ Keep alive: ' + p.name, run: () => Fleet.ping(p.id) });
        cmds.push({ label: '🩺 Check: ' + p.name, run: () => Fleet.check(p.id) });
      });
      return cmds;
    };
    const all = items();
    const render = q => {
      const ql = q.toLowerCase();
      const hits = all.filter(c => c.label.toLowerCase().includes(ql)).slice(0, 12);
      document.getElementById('cmdk-list').innerHTML = hits.map((c, i) =>
        '<div class="cmdk-item" data-i="' + i + '" style="padding:10px 16px;cursor:pointer;font-size:.9rem;border-bottom:1px solid var(--line)' + (i === 0 ? ';background:rgba(129,140,248,.12)' : '') + '">' + c.label + '</div>').join('') ||
        '<div class="mut" style="padding:14px 16px">No match.</div>';
      document.querySelectorAll('.cmdk-item').forEach((el, i) => el.onclick = () => { wrap.remove(); hits[i].run(); });
      return hits;
    };
    let hits = render('');
    input.oninput = () => { hits = render(input.value); };
    input.onkeydown = e => {
      if(e.key === 'Escape') wrap.remove();
      if(e.key === 'Enter' && hits.length){ wrap.remove(); hits[0].run(); }
    };
    input.focus();
  },
  bindPalette(){
    document.addEventListener('keydown', e => {
      if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); this.openPalette(); }
    });
  },

  /* ---------------- brand footer (every page) ---------------- */
  mountFooter(){
    if(!window.Brand) return;
    const main = document.querySelector('main.page');
    if(main && !main.querySelector('.site-foot')) main.insertAdjacentHTML('beforeend', Brand.footerHtml());
  },

  /* ---------------- boot (call on every page) ---------------- */
  async init(opts){
    opts = opts || {};
    // LOGIN GATE first: nothing renders for unauthenticated visitors.
    if(window.Auth && !(await Auth.guard())) return;
    this.applyTheme();
    this.mountNav();
    this.mountFooter();
    await this.gate();
    if(window.FleetBot) FleetBot.mount();
    if(window.PWAInstall) PWAInstall.init();
    if(window.SyncVault) SyncVault.init();   // V1.2: cross-device fleet sync (pull on open, push on change)
    if(window.GDrive) GDrive.init();          // V1.3: Google Drive auto-backup (no extra Supabase needed)
    this.bindPalette();                       // V1.3: Ctrl/Cmd+K command palette
    if(!opts.skipWakeup && window.Fleet) Fleet.wakeup();
    if(window.Fleet) this.startAutoPilot();
    if(!opts.skipBackupNag) this.backupReminder();
    if(typeof opts.ready === 'function') opts.ready();
    // Register the offline service worker (best-effort; file:// has none).
    if('serviceWorker' in navigator && location.protocol.startsWith('http')){
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
};
window.Shell = Shell;
