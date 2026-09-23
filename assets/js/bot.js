/* =============================================================================
   HMG FLEET CONSOLE — Fleet Bot (V1.9)
   Rules-based assistant, NO AI API, offline, free forever. Knows every page,
   every feature (including billing model, SLO, deploy tracking, groups,
   runbooks, bulk import, key expiry, compare), operations, and live fleet.
   ============================================================================= */
'use strict';
const FleetBot = {
  open: false,
  history: [],

  PAGES: {
    'index.html': { icon:'📊', name:'Dashboard', text:
'The Dashboard is your morning glance — everything important about the whole fleet on one screen.\n\n' +
'• KPI strips: top = total · healthy (≥85) · degraded/critical · pause risks; second = 💎 one-time count · 🔁 subscription count · 🔑 key expiry ≤30d · revenue tracked (sum of one-time amounts).\n' +
'• "Needs attention": every red flag with its one-click fix — stale heartbeat (⚡ Ping now), API/Auth/site down (🩺 Re-check), expired subscription (phone shown — one-time clients never appear), renewal overdue/due (subscription only), key expiry ≤14d, missing RPC, paused/maintenance states. Empty = healthy.\n' +
'• 💳 Subscription watch panel (subscription only — one-time excluded): server verdicts via sc_license_status RPC, renewal countdowns, contacts, per-row 🩺/💬/✏️.\n' +
'• Fleet table: project + billing pill (💎 one-time vs 🔁 subscription) + group + tags + deploy version; Score/SLO/error-budget; Keep-alive + key expiry pill; Health pills; Billing/License; Latency sparkline; actions ⚡🩺📋✏️💬. Group + billing filters + text filter.\n' +
'• Top buttons: Keep ALL alive, Health-check all, Detect deploys, Wallboard, Compare, Auto-pilot.\n\nIf "Needs attention" says "✅ All clear", your fleet is safe — 5 seconds a day.' },
    'projects.html': { icon:'🗂️', name:'Projects', text:
'Projects is where the fleet is managed — registering, editing and organising every monitored project.\n\n' +
'• Register form: Name + Supabase URL + ANON key required (for HMG products, visible in config.js). service_role REFUSED.\n' +
'• V1.9 NEW — Billing model: select 💎 One-time payment / lifetime (owns forever, no renewal date needed — renewal field hides, alerts skip it, renewal calendar excludes it, license cell shows lifetime, revenue sums) vs 🔁 Subscription (renewal date shown, tracked, alerts fire inside warning window). Amount paid field tracks revenue.\n' +
'• Extra: Type (School Connect / Tutoring / Drama / CBT / generic), site URL, environment, Group/org, SLO target %, Tags, client contact (name/phone/email), renewal (subscription only), amount, fee note, Runbook (incident steps, shown on Status page), Notes.\n' +
'• "➕ Add & test" checks + pings + deploy detection immediately.\n' +
'• Per-row: ⚡ ping · 🩺 check · ✏️ edit · 📋 cron URL · ⏸️ pause · 🗑 remove.\n' +
'• Top: Backup JSON · Fleet CSV (now includes billing/group/SLO) · Restore · Bulk CSV import (with template download) + group/billing filters + deep-link #id flash.\n\nBulk CSV columns: name,url,key,type,site,env,billing,group,tags,client_name,client_phone,client_email,renewal,amount,fee_note,slo,runbook,notes — billing = onetime or subscription; when onetime, renewal ignored.' },
    'incidents.html': { icon:'🚨', name:'Incidents', text:
'Incidents is the fleet\'s memory — automatic journal plus ops diary.\n\n' +
'• AUTOMATIC: state transitions — API down/up, Auth down/up, site down/up, heartbeat pause-risk, license verdict change, keep-alive failures, deploys detected, maintenance windows, performance spikes — exactly once per transition, recoveries auto-resolve.\n' +
'• MANUAL: log client calls, SQL packs, renewals, maintenance — per project or fleet-wide with severity.\n' +
'• Triage: filter by project / severity / unresolved-only; Resolve/Reopen; clear resolved; export CSV. Critical unresolved pinned on Dashboard.' },
    'reports.html': { icon:'📈', name:'Reports & Uptime', text:
'Reports & Uptime is the printable, evidence-grade view.\n\n' +
'• Header: date + KPIs: total, fleet avg uptime, pause risks, expired subs + one-time vs subscription counts, key risks, revenue tracked.\n' +
'• Per-project SLA & SLO table: score/SLO/error-budget left, uptime %, latency + key expiry pill, sparkline, heartbeat age, billing/license, deploy version, last check.\n' +
'• Uptime calendar heatmap (V1.9): 30-day GitHub-style squares per project — green 100%, amber degraded, red outage, grey no data — from local history.\n' +
'• Renewal calendar: subscription only (one-time excluded), soonest first — your collections worksheet.\n' +
'• Cost & revenue ledger: one-time amounts per project + fee notes + totals.\n' +
'• MTTR + recent deploys + recent incidents. Print/PDF.' },
    'board.html': { icon:'🖥️', name:'Wallboard (NOC)', text:
'The Wallboard is NOC mode: full-screen traffic-light grid for a spare monitor/TV.\n\n' +
'• Tiles: 🟢 healthy · 🟡 degraded · 🔴 pulsing critical/pause-risk · 🔧 maintenance (blue, alarms suppressed) · ⏸️ paused · ⚪ unchecked. Each tile: type · billing (💎 vs 🔁) · group · score · billing pill · keep-alive · health pills · license · key expiry · latency · deploy version.\n' +
'• Self-refreshing (configurable, default 10 min), fullscreen button. Install PWA on TV device, leave running.' },
    'status.html': { icon:'📡', name:'Status & Maintenance', text:
'Status & Maintenance adds enterprise capabilities:\n\n' +
'• CLIENT STATUS SNAPSHOT: pick client → clean printable report — overall verdict, billing pill (one-time vs subscription), group, uptime %, latency, health score/SLO/error-budget left, component status, key expiry, deploy history timeline, runbook (incident steps you entered), that client\'s incident history only — proof of service for a proprietor, zero internal leakage.\n' +
'• MAINTENANCE WINDOWS: schedule planned downtime per project — red alarms → quiet info, desktop/webhook suppressed, wallboard blue 🔧 tile — keep-alive continues.\n' +
'• OPERATOR AUDIT TRAIL: last 500 consequential actions with timestamps, carried in backups.' },
    'compare.html': { icon:'⚖️', name:'Compare Projects', text:
'Compare Projects (V1.9): pick two projects → side-by-side table — type, billing + amount, health score, uptime %, avg latency, SLO + error-budget remaining, heartbeat age, key expiry, group, last deploy — with "A better / B better / equal" badges, plus both latency sparklines. Spot regressions instantly after a deploy.' },
    'tools.html': { icon:'🧰', name:'Ops Toolkit', text:
'The Ops Toolkit is the field kit — copy-paste material and diagnostic utilities.\n\n' +
'• 🔧 Keep-alive SQL: one-paste snippet for non-HMG Supabase projects.\n' +
'• ⏰ Cron pack generator: builds URL list for cron-job.org / UptimeRobot + FLEET_TARGETS secret value, live from your fleet.\n' +
'• 🔍 Anon key inspector: decodes any Supabase JWT locally — role (service_role flagged), owning project, expiry.\n' +
'• 💾 Backup center: JSON + CSV, restore, 14-day reminder.\n' +
'• 🧪 Quick probe: diagnose any URL+key in ~2s without registering.' },
    'selftest.html': { icon:'🧪', name:'Self-Test', text:
'Self-Test & Diagnostics verifies every subsystem on THIS device in one click: HTTPS/WebCrypto, storage, service worker, login config (flags default password!), fleet health (stale heartbeats, missing RPCs), live connectivity, auto-pilot, alert channels, Google Drive backup + Cloud Sync state, an AES-GCM round-trip, subscription-watch coverage, billing model sanity, key expiry. Green = healthy, amber = optional not configured, red = broken with fix. Run after every deployment and on every new device.' },
    'guide.html': { icon:'📖', name:'Feature Guide', text:
'The Feature Guide is the complete manual: every page, every feature (including billing model one-time vs subscription, SLO/error-budget, deploy tracking, runbooks, groups, bulk import, key expiry, compare, uptime calendar), health-score formula, incident taxonomy, security model ("privacy by construction") and known limits. TOC + printable PDF.' },
    'deploy.html': { icon:'🚀', name:'Deployment', text:
'The Deployment runbook: numbered click-by-click steps from ZIP to fully-armed monitoring — GitHub private repo + Vercel import, first login + password change, billing model choice (one-time vs subscription) at project registration, Google Drive backup (Parts A-D with troubleshooting), Cloud Sync, three keep-alive layers, daily/monthly ops, updating, stronger login alternatives (Cloudflare Access), and troubleshooting table. First-user ready without assistance.' },
    'settings.html': { icon:'⚙️', name:'Settings', text:
'Settings controls the console:\n\n' +
'• Auto-pilot on/off + interval.\n' +
'• Alert thresholds: heartbeat warning/alarm + renewal window + wallboard refresh.\n' +
'• Wallboard & notifications: refresh + 🔔 desktop notifications + 📣 webhook alerts (Discord/Slack/Telegram).\n' +
'• 🟢 Google Drive backup: connect, auto-backup toggle, passphrase, 📚 View backups (per-generation restore/delete), newest-non-empty restore intelligence.\n' +
'• ☁️ Cloud Sync: Supabase vault E2E-encrypted, same fleet on every device.\n' +
'• 🔑 Login credentials generator (auth-config.js), PIN, theme, danger-zone wipe.' },
    'about.html': { icon:'🏢', name:'About & Ecosystem', text:
'About & Ecosystem: HMG CONCEPTS (His Marvellous Grace), founder Adewale Samson Adeagbo, subsidiaries, product family, principles, mission "Recurring payments should not keep your schools from having online presences."' },
    'login.html': { icon:'🔐', name:'Sign in', text:
'The sign-in gate with 👁️ show/hide password toggle (WCAG 3.3.8 accessible-auth). Credentials in one file assets/js/auth-config.js — Settings generates it. Sessions 12h, 5 wrong attempts = 15-min lockout. Real security = Supabase RLS on client projects.' }
  },

  KB: [
    { match:['keep alive','keepalive','keep-alive','pause','inactivity','7 day','seven day','asleep','sleep'], reply:
'🫀 **Keep-alive**: Supabase pauses FREE projects after 7 days without DB activity. Every ping is a REAL DB write via public sc_keep_alive RPC.\n\nQuadruple layers:\n1. Console: ⚡ buttons, auto-pilot, stale wake-up 5+ days on page open.\n2. GitHub Actions: bundled workflow every 2 days (FLEET_TARGETS secret).\n3. cron-job.org: POST jobs every 3 days.\n4. UptimeRobot: 5-min monitors.\nAny ONE prevents a pause.' },
    { match:['billing','one-time','onetime','one time','lifetime','payment model','renewal date hidden'], reply:
'💎 **Billing model (V1.9)** — every project is either:\n• 💎 One-time payment / lifetime — owns forever, no renewal date needed. The console hides the renewal field, renewal alerts skip it, renewal calendar excludes it, license cell shows lifetime, and amount tracked sums on dashboard + cost ledger.\n• 🔁 Subscription — renewal date matters. Set it, the console tracks countdown, alerts inside warning window, calendar sorted soonest-first, verdict via sc_license_status RPC.\n\nChoose at registration (Projects → Billing model). Edit any time. Existing installs auto-migrate: no renewal + feeNote mentioning lifetime/one-time → one-time, else subscription (safe default).' },
    { match:['subscription','license','expired','renew','lock','bypass'], reply:
'💳 **Subscription watch**: for HMG product projects the console calls public sc_license_status RPC — ✓ active/lifetime, ⚠ grace, 🔒 expired. An expired client is still kept alive (license-independent keep-alive + locked-page heartbeat). Set renewal date on Projects; Dashboard + Reports chase renewals. One-time clients never appear in renewal panels.' },
    { match:['health','check','probe','rest','auth','storage','latency'], reply:
'🩺 **Health check** = five probes: REST/DB API + latency (401/404 still alive), Auth, Storage, heartbeat age, site reachability, plus subscription verdict for HMG products. Results → 0–100 score, sampled into history for sparklines, uptime %, SLO error-budget.' },
    { match:['score','100','formula'], reply:
'🎯 **Health score** starts 100, subtract: −45 DB down · −20 Auth down · −10 site down · −5 Storage down · −10/−25 heartbeat warning/alarm · −10 expired · −5 latency>2.5s · −5 unknown. Bands: 85–100 healthy 🟢 · 60–84 degraded 🟡 · <60 critical 🔴.' },
    { match:['slo','error budget','burn rate','uptime target'], reply:
'📉 **SLO / Error budget (V1.9)**: set per-project SLO % (default 99.5) on Projects page. Error budget = 100−SLO allowed downtime. Reports computes actual error = 100−uptime% and remaining budget. Dashboard + Reports show 🟢 budget left or 🔴 EXHAUSTED. Track burn rate via latency spikes + uptime calendar.' },
    { match:['deploy','deployment tracking','version detected'], reply:
'🚀 **Deployment tracking (V1.9)**: Dashboard → 🚀 Detect deploys fetches each project\'s /sw.js CACHE literal (or manifest version) from its live site, stores every new version in deployHistory (30 kept) and logs a deploy incident. Status page shows full deploy timeline. Spot regressions after a push instantly.' },
    { match:['runbook','incident response','what to do when down'], reply:
'📖 **Runbook per project (V1.9)**: Projects → Runbook textarea — write steps like "1. Check Supabase dashboard → restore if paused. 2. Vercel redeploy. 3. WhatsApp client…". Shown on Status & Maintenance snapshot for that client — so anyone on-call knows exactly what to do.' },
    { match:['group','organization','client org'], reply:
'🏷️ **Groups / organizations (V1.9)**: assign each project a Group (e.g. HMG Schools, RCCG LP25). Dashboard + Projects have group filter; Reports groups by organization; wallboard shows group per tile. Organise a 100-project fleet instantly.' },
    { match:['bulk import','csv import','import many'], reply:
'📥 **Bulk CSV import (V1.9)**: Projects → 📥 Bulk CSV import → pick CSV with columns name,url,key,type,site,env,billing,group,tags,client_name,client_phone,client_email,renewal,amount,fee_note,slo,runbook,notes — billing = onetime or subscription; when onetime renewal ignored. Template download included.' },
    { match:['key expiry','api key expires','anon key expiry'], reply:
'🔑 **API key expiry watch (V1.9)**: the anon key JWT contains exp. Fleet decodes it locally (no network) and shows countdown pill: green >45d, amber ≤45d, red ≤14d or expired. Dashboard alerts ≤14d. Rotate in Supabase → Settings → API before expiry.' },
    { match:['compare','side by side','regression'], reply:
'⚖️ **Compare Projects (V1.9)**: pick two projects → table — type, billing+amount, health score, uptime %, latency, SLO + budget, heartbeat age, key expiry, group, last deploy — with A better / B better badges + both sparklines. Ideal after a deploy to spot which project regressed.' },
    { match:['uptime calendar','heatmap','contributions'], reply:
'🗓️ **Uptime calendar heatmap (V1.9)**: Reports → last 30 days — GitHub-style squares per project: green 100%, amber degraded, red outage, grey no data — from local history samples grouped by day. UptimeRobot remains external 5-min record.' },
    { match:['incident','journal','outage','log','diary'], reply:
'🚨 **Incidents**: logged automatically on state transitions (down/up, pause-risk, license change, deploy, performance spike) — once per transition, auto-resolve on recovery. Manual diary too. Filter, resolve/reopen, clear resolved, CSV export. Critical unresolved pinned on Dashboard.' },
    { match:['add project','register','anon key','config.js','service_role','service role'], reply:
'➕ **Registering**: Projects → Name + Supabase URL + ANON key → choose billing (one-time vs subscription) → Add & test. Keys from config.js for HMG products. service_role REFUSED. Billing = one-time hides renewal date.' },
    { match:['backup','restore','export','move','another computer','csv'], reply:
'💾 **Backups**: JSON (all data) + CSV. Google Drive backup auto-saves to hidden app-data folder in YOUR Drive (no extra Supabase). Restore merges (union) — never overwrites. View backups lists generations with project count + per-file restore/delete (newest-non-empty intelligence). Cloud Sync vault also available.' },
    { match:['show password','hide password','eye','toggle password','view password'], reply:
'👁️ **Show/hide password (V1.9)**: login page has an eye button 👁️/🙈 that toggles password visibility (type text vs password), with aria-pressed + aria-label for screen readers — WCAG 3.3.8 accessible-auth best practice. Keep focus on input after toggle.' },
    { match:['deploy','vercel','github','host','publish'], reply:
'🚀 **Deploying**: Deployment page has full runbook. Short: private GitHub repo → upload → Vercel import (Other, no build) → sign in (default hmgadmin/ChangeMe#2026) → IMMEDIATELY change login + make repo private → register fleet (choose one-time vs subscription) → add FLEET_TARGETS secret → connect Google Drive.' },
    { match:['red banner','default password','security warning','banner at the top'], reply:
'🚨 **Red banner = shipped default password still active** — anyone reading repo can sign in. Fix: Settings → Login credentials → generate → paste into auth-config.js → commit. Also make repo private. Self-Test tracks both.' },
    { match:['login','password','username','credential','sign in','signin','locked out','forgot'], reply:
'🔐 **Login**: credentials in one file assets/js/auth-config.js — Settings generates it. Defaults hmgadmin/ChangeMe#2026 — change day one! Show/hide eye button added. 5 wrong attempts = 15-min lockout. Optional Cloudflare Access — see Deployment.' },
    { match:['install','pwa','app','home screen','desktop','phone'], reply:
'📲 **Installing**: full PWA — install banner appears, tap Install (or address-bar icon). iPhone: Safari → Share ⬆ → Add to Home Screen. Installed = instant offline shell, full-screen, own icon, app shortcuts (Keep alive, Wallboard, Incidents, Compare, Status).' },
    { match:['auto-pilot','autopilot','automatic','interval','timer'], reply:
'🤖 **Auto-pilot**: pings + checks whole fleet on timer (default 12h) while any tab open — wallboard also re-checks on its own cycle. Closed-tab = GitHub Actions + cron-job.org + UptimeRobot.' },
    { match:['wallboard','board','noc','tv','monitor screen'], reply:
'🖥️ **Wallboard**: traffic-light grid for TV — green healthy, amber degraded, red pulsing critical, 🔧 maintenance blue, ⏸️ paused. Each tile: type, billing, group, score, keep-alive, health, license, key expiry, latency, deploy. Self-refreshing.' },
    { match:['renewal','payment due','collect','fee note','calendar'], reply:
'📅 **Renewal watch**: subscription only — one-time excluded. Set renewal date per project; alerts inside warning window; Reports renewal calendar soonest-first with contacts + amounts. One-time clients own forever.' },
    { match:['cost','revenue','ledger','amount'], reply:
'💰 **Cost & revenue ledger (V1.9)**: Projects → Amount field (one-time fee). Dashboard KPI sums one-time revenue tracked. Reports → Cost ledger: per-project billing + amount + fee note + totals. Organise by group for org-level totals.' },
    { match:['privacy','security','rls','data','read'], reply:
'🔐 **Security: privacy by construction**: console stores only public anon keys. Client RLS seals business data. Never signs into portals, never reads tables, refuses service_role. No server, no tracking, no third-party scripts; data in this browser. Login gate + optional PIN + private repo + optional Cloudflare Access = layered.' },
    { match:['pages','navigate','where','menu','screens'], reply:
'🧭 The console has 13 pages — ask me "what is X page" for deep description:\n📊 Dashboard · 🗂️ Projects · 🚨 Incidents · 📈 Reports & Uptime · 🖥️ Wallboard · 📡 Status & Maintenance · ⚖️ Compare Projects · 🧰 Ops Toolkit · 🧪 Self-Test · 📖 Feature Guide · 🚀 Deployment · 🏢 About & Ecosystem · ⚙️ Settings.' }
  ],

  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  md(s){ return this.esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); },

  liveAnswer(lower){
    if(!window.Store || !window.Fleet) return null;
    const list = Store.projects();
    if(/\b(status|summary|overview|how is|state of)\b.*\b(fleet|everything|all)\b|\bfleet status\b|^status$/.test(lower)){
      if(!list.length) return 'Fleet empty — register first project on Projects page (only URL + anon key).';
      const s = Fleet.fleetSummary();
      const risky = list.filter(p => { const h = Fleet.heartbeatDays(p); return !p.paused && h != null && h >= Store.settings().warnHeartbeatDays; });
      return '📡 **Live fleet status** (' + s.total + '):\n' +
        '🟢 healthy: ' + s.ok + '\n🟡 degraded: ' + s.warn + '\n🔴 critical: ' + s.bad + '\n⏸️ paused: ' + s.paused + '\n🚨 pause risks: ' + s.pauseRisk + (risky.length ? ' → ' + risky.map(p => p.name).join(', ') : '') +
        '\n💎 one-time: ' + s.onetime + ' (revenue ₦' + Number(s.revenue).toLocaleString() + ')\n🔁 subscription: ' + s.subscription + '\n📅 renewals soon: ' + s.renewalsSoon + ' (subscription only)\n🔒 expired subs: ' + s.expired + '\n🔑 key risks ≤30d: ' + s.keyRisk +
        '\n\nAsk "who is at risk" or "renewals due" or "revenue".';
    }
    if(/\b(risk|stale|danger|pause)\b/.test(lower) && /\bwho|which|list|show\b/.test(lower)){
      const risky = list.filter(p => { const h = Fleet.heartbeatDays(p); return !p.paused && h != null && h >= Store.settings().warnHeartbeatDays; });
      return risky.length
        ? '🚨 Heartbeats needing attention:\n' + risky.map(p => '• ' + p.name + ' — ' + Fleet.heartbeatDays(p).toFixed(1) + 'd').join('\n') + '\n\nDashboard → ⚡ Ping now each.'
        : '✅ No pause risk — every heartbeat fresh.';
    }
    if(/\brenewal|due|owing|expir/.test(lower) && /\bwho|which|list|show|due\b/.test(lower)){
      const soon = list.filter(p => !Fleet.isOnetime(p) && Fleet.renewalDays(p) != null && Fleet.renewalDays(p) <= Store.settings().renewalWarnDays)
        .sort((a,b) => Fleet.renewalDays(a) - Fleet.renewalDays(b));
      return soon.length
        ? '📅 Renewals (subscription only):\n' + soon.map(p => { const d = Fleet.renewalDays(p); return '• ' + p.name + ' — ' + (d >= 0 ? 'in ' + d + 'd' : (-d) + 'd OVERDUE') + (p.client && p.client.phone ? ' · ' + p.client.phone : ''); }).join('\n')
        : '✅ No renewals inside ' + Store.settings().renewalWarnDays + 'd window (one-time clients excluded).';
    }
    if(/\brevenue|money|total.*paid|how much/.test(lower)){
      const s = Fleet.fleetSummary();
      const rows = list.filter(p => p.billingAmount).sort((a,b) => b.billingAmount - a.billingAmount).slice(0, 10);
      return '💰 Revenue tracked: ₦' + Number(s.revenue).toLocaleString() + ' across ' + s.onetime + ' one-time project(s).\n' +
        (rows.length ? rows.map(p => '• ' + p.name + ' — ₦' + Number(p.billingAmount).toLocaleString() + ' (' + Fleet.billingLabel(p) + ')').join('\n') : 'Set Amount per project on Projects page to track revenue.');
    }
    return null;
  },

  respond(msg){
    const lower = msg.toLowerCase();
    for(const [file, p] of Object.entries(this.PAGES)){
      const stem = p.name.toLowerCase().split(' ')[0].replace(/[^a-z]/g, '');
      if((lower.includes(stem) || lower.includes(file.replace('.html',''))) && /\bpage|what is|what's|explain|describe|about the|how .*work|tell me\b/.test(lower)){
        return p.icon + ' **' + p.name + '**\n\n' + p.text;
      }
    }
    const live = this.liveAnswer(lower);
    if(live) return live;
    for(const entry of this.KB){
      if(entry.match.some(k => lower.includes(k))) return entry.reply;
    }
    if(lower.includes('thank')) return 'You\'re welcome! 🎉 Fleet thanks you too.';
    if(/\b(bye|goodbye)\b/.test(lower)) return 'Goodbye! Auto-pilot keeps watching. 🛰️';
    if(/\b(hi|hello|hey|good (morning|afternoon|evening))\b/.test(lower)) return 'Hello! 👋 Ask me about any page (e.g. "what is the compare page") or feature — or type "status" for live fleet summary. Press Ctrl+K anywhere for command palette.';
    return 'Try:\n• "status" — live fleet summary\n• "who is at risk" / "renewals due" / "revenue"\n• "what is the [dashboard/projects/compare/status] page"\n• keywords: **billing**, **SLO**, **deploy**, **runbook**, **group**, **bulk import**, **key expiry**, **webhook**, **drive**, **login**\n\nHuman: 💬 WhatsApp +234 810 086 6322.';
  },

  CHIPS: ['status', 'who is at risk?', 'renewals due', 'revenue', 'billing explained', 'what is this page?', 'how do I deploy?'],
  mount(){
    if(document.getElementById('fleetbot-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'fleetbot-btn';
    btn.innerHTML = '🤖 <span>Fleet Bot</span>';
    btn.onclick = () => this.toggle();
    document.body.appendChild(btn);
    const win = document.createElement('div');
    win.id = 'fleetbot-win';
    win.innerHTML =
      '<div id="fleetbot-head"><div><b>🤖 Fleet Bot</b><small>Rules-based · offline · no AI API — the HMG way</small></div><button id="fleetbot-close">✕</button></div>' +
      '<div id="fleetbot-msgs"></div>' +
      '<div id="fleetbot-chips">' + this.CHIPS.map(c => '<button class="fb-chip">' + this.esc(c) + '</button>').join('') + '</div>' +
      '<div id="fleetbot-inrow"><input id="fleetbot-input" placeholder="Ask about any page or feature…"><button class="btn btn-primary btn-sm" id="fleetbot-send">Send</button></div>';
    document.body.appendChild(win);
    document.getElementById('fleetbot-close').onclick = () => this.toggle(false);
    document.getElementById('fleetbot-send').onclick = () => this.send();
    document.getElementById('fleetbot-input').addEventListener('keydown', e => { if(e.key === 'Enter') this.send(); });
    win.querySelectorAll('.fb-chip').forEach(ch => ch.onclick = () => { document.getElementById('fleetbot-input').value = ch.textContent; this.send(); });
    const here = location.pathname.split('/').pop() || 'index.html';
    const p = this.PAGES[here];
    this.history.push({ from:'bot', msg: 'Hello! 👋 I\'m Fleet Bot — I know every page and feature, plus live fleet answers ("status", "who is at risk?", "revenue").' + (p ? '\n\nYou are on: ' + p.icon + ' **' + p.name + '**\n' + p.text : '') });
  },
  toggle(force){
    const w = document.getElementById('fleetbot-win');
    if(!w) return;
    this.open = force !== undefined ? force : !this.open;
    w.style.display = this.open ? 'flex' : 'none';
    if(this.open) this.render();
  },
  send(){
    const inp = document.getElementById('fleetbot-input');
    const msg = (inp.value || '').trim();
    if(!msg) return;
    inp.value = '';
    this.history.push({ from:'user', msg });
    this.render();
    setTimeout(() => { this.history.push({ from:'bot', msg: this.respond(msg) }); this.render(); }, 300);
  },
  render(){
    const host = document.getElementById('fleetbot-msgs');
    if(!host) return;
    host.innerHTML = this.history.map(m => '<div class="fb-msg ' + (m.from === 'bot' ? 'fb-bot' : 'fb-user') + '">' + this.md(m.msg) + '</div>').join('');
    host.scrollTop = host.scrollHeight;
  }
};
window.FleetBot = FleetBot;
