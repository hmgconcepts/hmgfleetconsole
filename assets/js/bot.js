/* =============================================================================
   HMG FLEET CONSOLE — Fleet Bot (V1.1)
   -----------------------------------------------------------------------------
   Rules-based assistant, exactly in the spirit of the School Connect bot:
   NO AI API, fully offline, free forever. It knows:
     • every PAGE of the console (detailed, unambiguous descriptions so a
       first-time user understands each screen without assistance);
     • every FEATURE (keep-alive, health, score, incidents, renewals, board…);
     • OPERATIONS answers (deploy, backup, login, add project, pause risk…);
     • LIVE fleet answers ("status", "who is at risk", "renewals due") read
       straight from this browser's Store — the bot is an operator, not a
       brochure.
   Mounted automatically by shell.js on every authenticated page.
   ============================================================================= */
'use strict';
const FleetBot = {
  open: false,
  history: [],

  /* ---------------- page knowledge (deep descriptions) ---------------- */
  PAGES: {
    'index.html': { icon:'📊', name:'Dashboard', text:
'The Dashboard is your morning glance — everything important about the whole fleet on one screen.\n\n' +
'• KPI strip (top): total projects monitored · healthy (score ≥ 85) · degraded/critical · pause risks (heartbeat too old).\n' +
'• "Needs attention" panel: every red flag in the fleet, each with its one-click fix right beside it (⚡ ping a stale project, 🩺 re-check a down API, resume a paused project, renewal follow-ups with the client\'s phone number shown).\n' +
'• Fleet table: one row per project — health score /100, keep-alive traffic light, REST/Auth/Storage/site pills, subscription verdict, latency sparkline, and per-row actions (⚡ keep alive · 🩺 check · 📋 copy cron URL · ✏️ edit).\n' +
'• 🤖 Auto-pilot toggle: pings + checks the whole fleet on a timer while any console tab is open.\n' +
'• 🔍 Filter box: type any part of a name, tag, type or environment.\n\nIf "Needs attention" says "✅ All clear", your entire fleet is safe — that check takes 5 seconds a day.' },
    'projects.html': { icon:'🗂️', name:'Projects', text:
'Projects is where the fleet is managed — registering, editing and organising every monitored project.\n\n' +
'• Register form: Name + Supabase URL + ANON key are the only required fields (for HMG products, both are visible in the client site\'s assets/js/config.js). A pasted service_role key is REFUSED — the console only ever holds public keys.\n' +
'• Extra fields: Type (School Connect / Tutoring Connect / DramaConnect / HMG CBT / other), live site URL, environment (production/staging/demo), tags, client contact (name/phone/email), renewal date + fee note, free notes.\n' +
'• "➕ Add & test" immediately health-checks AND pings the new project so you know within seconds it is wired correctly.\n' +
'• Per-row actions: ⚡ keep alive · 🩺 check · ✏️ edit · 📋 copy keep-alive URL (for cron-job.org) · ⏸️ pause monitoring (mute during maintenance without deleting anything) · 🗑 remove (client project itself is untouched).\n' +
'• Top buttons: ⬇ Backup (JSON of everything) · ⬇ Fleet CSV (spreadsheet overview) · ⬆ Restore.' },
    'incidents.html': { icon:'🚨', name:'Incidents', text:
'Incidents is the fleet\'s memory — an automatic journal plus your own ops diary.\n\n' +
'• AUTOMATIC entries: whenever a health check sees a state change — API down/up, Auth down/up, site down/up, heartbeat entering pause-risk, subscription verdict change, keep-alive failure — one entry is logged (recoveries auto-resolve). You will never again wonder "when did that start?".\n' +
'• MANUAL entries: log client calls, SQL packs applied, renewals collected, deploys, planned maintenance — per project or fleet-wide, with a severity.\n' +
'• Triage: filter by project / severity / unresolved-only; ✓ Resolve or ↩ Reopen entries; 🧹 clear resolved in bulk; ⬇ export the journal to CSV.\n' +
'• Unresolved critical incidents also appear on the Dashboard\'s "Needs attention" panel until you resolve them.' },
    'reports.html': { icon:'📈', name:'Reports & Uptime', text:
'Reports & Uptime is the printable, evidence-grade view of the fleet.\n\n' +
'• Fleet status report header: date, projects, fleet average uptime %, pause risks, expired subscriptions.\n' +
'• Per-project SLA table: health score, uptime % and average latency (computed from up to 96 locally-stored health samples), latency trend sparkline, heartbeat age, subscription verdict, last check time.\n' +
'• Renewal calendar: every project with a renewal date, soonest first, with client contact and fee note — effectively your collections worksheet.\n' +
'• Recent incidents digest.\n' +
'• 🖨️ Print / Save as PDF renders a clean printable document — monthly ops records or proof for a client meeting.' },
    'board.html': { icon:'🖥️', name:'Wallboard (NOC)', text:
'The Wallboard is NOC mode: a full-screen, self-refreshing traffic-light grid designed for a spare monitor or TV in the office.\n\n' +
'• One tile per project: 🟢 green border = healthy · 🟡 amber = degraded · 🔴 red PULSING = critical or pause risk · ⏸️ paused · ⚪ not yet checked.\n' +
'• Each tile shows score, keep-alive state, health pills, subscription verdict and latency.\n' +
'• It re-checks the ENTIRE fleet by itself on a timer (default every 10 minutes — change in Settings), so the display is always current without anyone touching it.\n' +
'• ⛶ Fullscreen button for TV use. Leave it running: the office always knows the fleet state at a glance.' },
    'tools.html': { icon:'🧰', name:'Ops Toolkit', text:
'The Ops Toolkit is the field kit — copy-paste material and diagnostic utilities.\n\n' +
'• 🔧 Keep-alive SQL: the one-paste snippet that makes ANY non-HMG Supabase project monitorable (HMG products already ship the RPC).\n' +
'• ⏰ Cron pack generator: builds — from your live fleet list — (a) the URL list for cron-job.org / UptimeRobot and (b) the exact FLEET_TARGETS value for the GitHub Actions secret. Register a project → copy → paste. Done.\n' +
'• 🔍 Anon key inspector: decodes any Supabase key locally — role (service_role flagged blood-red), owning project, expiry.\n' +
'• 💾 Backup center: one JSON = projects + settings + incidents + history; restore in two clicks; 14-day staleness reminder; CSV export.\n' +
'• 🧪 Quick probe: diagnose any URL + key in ~2 seconds without registering it.' },
    'selftest.html': { icon:'🧪', name:'Self-Test', text:
'Self-Test & Diagnostics verifies every subsystem of THIS deployment on THIS device in one click: HTTPS/WebCrypto, storage, service worker, login config (flags an unchanged default password!), fleet health (stale heartbeats, missing keep-alive RPCs), live Supabase connectivity, auto-pilot, alert channels, Google Drive backup + Cloud Sync state, an AES-GCM encrypt/decrypt/tamper-reject round-trip, and subscription-watch coverage. Green = healthy, amber = optional not configured (with the exact next step), red = broken (with the fix). Run it after every deployment and on every new device.' },
    'guide.html': { icon:'📖', name:'Feature Guide', text:
'The Feature Guide is the complete manual: every feature explained in detail — what it does, why it exists, and exactly how to use it — plus the transparent health-score formula, the incident taxonomy, the security model ("privacy by construction") and an honest known-limits section. It has a clickable table of contents and prints to PDF. If you read one page fully, read this one.' },
    'deploy.html': { icon:'🚀', name:'Deployment', text:
'The Deployment page is the runbook: numbered, click-by-click steps from ZIP to fully-armed monitoring — GitHub repo creation, Vercel import, first login and password change, registering the fleet, the three hands-off keep-alive layers (GitHub Actions, cron-job.org, UptimeRobot), daily/monthly operations, updating the console, stronger login alternatives (Cloudflare Access), and a troubleshooting table. Written so a first-time user needs no assistance.' },
    'settings.html': { icon:'⚙️', name:'Settings', text:
'Settings controls the console\'s behaviour:\n\n' +
'• Auto-pilot on/off + interval (hours).\n' +
'• Alert thresholds: heartbeat warning (default 3 days) and pause-risk alarm (default 6 — always kept below Supabase\'s 7-day pause line) + renewal warning window (default 14 days).\n' +
'• Wallboard refresh interval.\n' +
'• 🔑 Login credentials: type a new username/password and it GENERATES the auth-config.js file text for you to paste into GitHub — the only file you ever edit for login.\n' +
'• Optional session PIN, dark/light theme, and the danger-zone wipe (double-confirmed).' },
    'about.html': { icon:'🏢', name:'About & Ecosystem', text:
'About & Ecosystem tells you who built this and where it fits: HMG CONCEPTS (His Marvellous Grace) and founder Adewale Samson Adeagbo; the subsidiaries (HMG Academy, HMG Technologies, HMG Media, HMG Gospel); every product in the ecosystem (School Connect, Tutoring Connect, DramaConnect, HMG CBT Pro, this console); the four engineering principles (free tools only · no paid AI APIs · privacy by construction · clients own everything); and the mission that drives the console: "Recurring payments should not keep your schools from having online presences."' },
    'login.html': { icon:'🔐', name:'Sign in', text:
'The sign-in gate. Credentials are set in ONE file (assets/js/auth-config.js — the Settings page generates its content for you). Sessions last 12 hours by default; 5 wrong attempts lock the form for 15 minutes. Real data security is Supabase RLS on every client project — the console itself only ever holds public anon keys.' }
  },

  /* ---------------- Q&A knowledge base (match → reply) ---------------- */
  KB: [
    { match:['keep alive','keepalive','keep-alive','pause','inactivity','7 day','seven day','asleep','sleep'], reply:
'🫀 **Keep-alive** is the console\'s first job. Supabase pauses FREE projects after 7 days without database activity. Every ping performs a REAL database write via the project\'s public sc_keep_alive RPC — the strongest possible "activity" signal.\n\nProtection is QUADRUPLE-layered:\n1. Console: ⚡ buttons, auto-pilot, and an automatic wake-up ping for anything stale 5+ days the moment any page opens.\n2. GitHub Actions: the bundled workflow pings the whole fleet every 2 days (one FLEET_TARGETS secret).\n3. cron-job.org: free POST jobs on each 📋 keep-alive URL every 3 days.\n4. UptimeRobot: 5-minute monitors double as activity.\nAny ONE layer alone prevents a pause.' },
    { match:['subscription','license','expired','renew','lock','bypass'], reply:
'💳 **Subscription watch**: for HMG product projects the console calls the public sc_license_status RPC and shows the verdict — ✓ active/lifetime, ⚠ grace, or 🔒 expired.\n\nKey principle: an EXPIRED client is still kept alive! The keep-alive layers are license-independent, and even the locked portal page pings the heartbeat. So the school\'s data survives untouched until they renew — "recurring payments should not keep your schools from having online presences."\n\nSet each project\'s renewal date on the Projects page and the Dashboard + Reports renewal calendar will chase renewals for you.' },
    { match:['health','check','probe','rest','auth','storage','latency'], reply:
'🩺 **Health check** = five probes per project:\n1. REST/database API + latency (401/404 on the bare root still counts as ALIVE — that is normal Supabase behaviour).\n2. Auth service (sign-ins).\n3. Storage service (files/images).\n4. Heartbeat age (keep-alive freshness).\n5. Live site reachability (optional URL).\nPlus the subscription verdict for HMG products. Results roll into the 0–100 health score and are sampled into local history for sparklines and uptime %.' },
    { match:['score','100','formula'], reply:
'🎯 **Health score** starts at 100 and subtracts: −45 database API down · −20 Auth down · −10 site down · −5 Storage down · −10/−25 heartbeat older than warning/alarm threshold · −10 subscription expired · −5 latency > 2.5 s · −5 heartbeat unknown.\nBands: 85–100 healthy 🟢 · 60–84 degraded 🟡 · below 60 critical 🔴. Fully deterministic — the same inputs always give the same score.' },
    { match:['incident','journal','outage','log','diary'], reply:
'🚨 **Incidents** are logged automatically on every state TRANSITION (down→up, up→down, pause-risk crossed, license verdict changed) — exactly once, with auto-resolve on recovery. You can also log manual entries (client calls, SQL packs, renewals, maintenance). Filter, resolve/reopen, export CSV. Unresolved criticals stay on the Dashboard until handled.' },
    { match:['add project','register','anon key','config.js','service_role','service role'], reply:
'➕ **Registering a project**: Projects page → Name + Supabase URL + ANON key → Add & test.\n\nWhere to find the key: for HMG products open the client site\'s /assets/js/config.js — SUPABASE_URL and SUPABASE_ANON_KEY are right there. For any other project: Supabase dashboard → Settings → API.\n\n⚠️ NEVER paste a service_role key — the console detects and REFUSES it. Anon keys are public by design; RLS keeps all business data sealed.' },
    { match:['backup','restore','export','move','another computer','csv'], reply:
'💾 **Backups**: Ops Toolkit → Download full backup = ONE JSON containing projects + settings + incident journal + latency history. Keep it in Google Drive. Restore on any machine: Ops Toolkit → Restore → pick the file. Old single-file-console backups restore too. The console reminds you if no backup happened for 14+ days. CSV export gives a spreadsheet overview for reporting.' },
    { match:['deploy','vercel','github','host','publish'], reply:
'🚀 **Deploying**: the Deployment page has the full numbered runbook. Short version: create a PRIVATE GitHub repo → upload the console files → import into Vercel (framework "Other", no build command) → sign in with the default credentials → IMMEDIATELY change them (Settings → Login credentials generates the file for you) → register the fleet → add the FLEET_TARGETS secret for the GitHub Actions keep-alive.' },
    { match:['red banner','default password','security warning','banner at the top'], reply:
'🚨 **That red banner means the console still uses the shipped default password** (hmgadmin / ChangeMe#2026) — anyone who reads auth-config.js in the repo can sign in.\n\nFix in 2 minutes: Settings → 🔑 Login credentials → type new username+password → Generate → copy → GitHub → assets/js/auth-config.js → Edit → paste → Commit. Test in an incognito window, then the banner disappears on the next load.\n\nALSO make the repo Private: GitHub → Settings → General → Danger Zone → Change visibility. The Self-Test page tracks both.' },
    { match:['login','password','username','credential','sign in','signin','locked out','forgot'], reply:
'🔐 **Login**: credentials live in ONE file — assets/js/auth-config.js. To change them: Settings → 🔑 Login credentials → type new username + password → it generates the complete file text → paste it over that file in GitHub → commit (Vercel redeploys in ~1 min).\n\nDefaults shipped: hmgadmin / ChangeMe#2026 — change them on day one!\nForgot the password? Edit auth-config.js in GitHub with a freshly generated block (use the generator on any other deployment, or ask HMG Technologies).\n5 wrong attempts = 15-minute lockout. For even stronger protection, put the deployment behind Cloudflare Access (free) — see Deployment page.' },
    { match:['install','pwa','app','home screen','desktop','phone'], reply:
'📲 **Installing**: the console is a full PWA. Chrome/Edge (desktop & Android): an install banner appears — tap ⬇ Install (or the install icon in the address bar). iPhone/iPad: Safari → Share ⬆ → Add to Home Screen. Installed, it opens instantly (offline app shell), full-screen, with its own icon — perfect for the Wallboard on an office TV.' },
    { match:['auto-pilot','autopilot','automatic','interval','timer'], reply:
'🤖 **Auto-pilot** pings + health-checks the entire fleet on a timer (default 12 h, configurable) while ANY console page is open — including the Wallboard, which additionally re-checks on its own refresh cycle. Closed-tab coverage comes from GitHub Actions + cron-job.org + UptimeRobot.' },
    { match:['wallboard','board','noc','tv','monitor screen'], reply:
'🖥️ **Wallboard** = full-screen traffic-light grid for a spare monitor/TV. Green = healthy, amber = degraded, red pulsing = critical/pause-risk. Self-refreshing (default 10 min). Use ⛶ Fullscreen, install the PWA on the TV device, and the office always sees fleet state live.' },
    { match:['renewal','payment due','collect','fee note','calendar'], reply:
'📅 **Renewal watch**: set a renewal date (+ optional fee note) per project. Dashboard alerts appear when a renewal is inside the warning window (default 14 days) and flag overdue ones. Reports has the full renewal calendar, soonest first, with client contacts — your collections worksheet.' },
    { match:['privacy','security','rls','data','read'], reply:
'🔐 **Security model — privacy by construction**: the console stores ONLY public anon keys. Every client project enforces Row-Level Security, so an anon key can bump a heartbeat row and read the public license verdict — nothing else. The console never signs into a portal, never reads business tables, never requests a service_role key, and refuses one on paste. Plus: no server, no tracking, no third-party scripts; everything lives in this browser.' },
    { match:['pause risk','stale','heartbeat','risk'], reply:
'🚨 **Pause risk** = a project\'s heartbeat is older than the alarm threshold (default 6 days; Supabase pauses at 7). Fix: press its ⚡ button — a real database write resets the clock instantly. Prevent recurrence: add its 📋 URL to cron-job.org and/or the FLEET_TARGETS GitHub secret. The console also auto-pings anything stale 5+ days whenever a page opens.' },
    { match:['sql','snippet','non-school','other project','generic'], reply:
'🔧 **Non-HMG projects**: they need the tiny keep-alive endpoint once. Ops Toolkit → Keep-alive SQL → 📋 Copy → that project\'s Supabase → SQL Editor → Run. It creates one heartbeat table + one SECURITY DEFINER RPC; RLS on real tables is untouched. Then the project is fully monitorable.' },
    { match:['uptime','sla','sparkline','history','report'], reply:
'📈 **Uptime & history**: every health check stores a sample (latency, up/down, score) — up to 96 per project, locally. Dashboards show latency sparklines; Reports computes per-project uptime % + average latency and a fleet-wide roll-up, printable to PDF. For audit-grade 5-minute external history, pair with free UptimeRobot monitors.' },
    { match:['cost','price','free','paid'], reply:
'🆓 **Cost: ₦0.** The console is static files (Vercel/GitHub Pages free), storage is your browser, keep-alive layers are GitHub Actions + cron-job.org + UptimeRobot free tiers, and there is deliberately NO AI API — rules-based intelligence only, cost-effective forever. That is the HMG way.' },
    { match:['hmg','ecosystem','adewale','concepts','who built','about'], reply:
'🏢 **HMG CONCEPTS** (His Marvellous Grace) — founded by Adewale Samson Adeagbo, Lagos, Nigeria — builds enterprise platforms on free tools: School Connect, Tutoring Connect, DramaConnect Enterprise, HMG Academy CBT Pro, and this Fleet Console (by HMG Technologies). Subsidiaries: HMG Academy · HMG Technologies · HMG Media · HMG Gospel. Full story: About & Ecosystem page. Human help: WhatsApp +234 810 086 6322.' },
    { match:['drive','google drive','backup to drive','restore button','oauth','client id'], reply:
'🟢 **Google Drive backup** (Settings → Google Drive backup): projects auto-back-up to YOUR OWN Google Drive — a hidden app-data folder only this console can access (scope drive.appdata; it can never see your real Drive files). New phone: sign in → Connect Google Drive (one popup) → 📥 Restore → the fleet merges in and you continue monitoring.\n\nThe OAuth **Client ID ships in the repo** (assets/js/gdrive-config.js) — that is SAFE: a web Client ID is public by design and Google locks it to your site\u2019s URL (Authorized JavaScript Origins), so nothing needs typing on new devices. The client SECRET is a different thing and is never used or committed. Auto-backup runs ~20 s after any change; the newest 5 generations are kept; restores MERGE (never overwrite); optional AES-GCM passphrase encryption.' },
    { match:['webhook','discord','slack','telegram','alert channel','phone alert'], reply:
'📣 **Webhook alerts** (Settings → Alerts): paste a Discord / Slack / Telegram (or any) webhook URL and critical incidents are PUSHED there the moment a health check detects them — your phone buzzes even with the console closed. Free on all three platforms; payload shape auto-detected; 🧪 test button included. Runs alongside desktop notifications and the three e-mail alarm channels (GitHub Actions, cron-job.org, UptimeRobot).' },
    { match:['palette','ctrl+k','ctrl k','shortcut','quick open','command'], reply:
'⌨️ **Command palette**: press **Ctrl+K** (Cmd+K on Mac) anywhere — type to jump to any page, open any project, ⚡ ping or 🩺 check a specific project, back up to Drive, sync, or toggle the theme. The fastest way to operate a big fleet.' },
    { match:['sync','another phone','other device','same fleet','vault','cross-device','multi device','new phone'], reply:
'☁️ **Cloud Sync** (Settings → Cloud Sync) gives you the SAME fleet on every device. One free HMG-owned Supabase project acts as the vault; everything is **end-to-end encrypted in your browser** (AES-GCM-256, key from your passphrase via PBKDF2 210k) before upload — the vault only ever stores unreadable ciphertext.\n\nSetup once: run the vault SQL (copy button in Settings), fill URL + anon key + vault ID (🎲) + passphrase → Save & test. Then enter the SAME four values on each device. Sync is automatic: pull on page open, push ~8 s after any change, plus ☁️ Sync now. Merging is a union — two devices can work all day and both end up complete; nothing is ever overwritten or lost.' },
    { match:['mttr','anomaly','latency spike','slow','performance'], reply:
'⏱️ **Performance intelligence**: every health check feeds latency history. If a check comes in at 3× the project\u2019s rolling average (and above 1.5 s), a performance-degradation incident is logged automatically — early warning before users complain (NOC MTTD practice). When latency normalises the incident auto-resolves. The Reports page also computes **MTTR** (mean time to resolve) across your resolved incidents — the classic NOC benchmark is under 4 hours for P1.' },
    { match:['pages','navigate','where','menu','screens'], reply:
'🧭 The console has ten pages — ask me "what is X page" for a deep description of any:\n📊 Dashboard · 🗂️ Projects · 🚨 Incidents · 📈 Reports & Uptime · 🖥️ Wallboard · 🧰 Ops Toolkit · 📖 Feature Guide · 🚀 Deployment · ⚙️ Settings · 🏢 About & Ecosystem.' }
  ],

  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  md(s){ return this.esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); },

  /* ---------------- live fleet answers ---------------- */
  liveAnswer(lower){
    if(!window.Store || !window.Fleet) return null;
    const list = Store.projects();
    if(/\b(status|summary|overview|how is|state of)\b.*\b(fleet|everything|all)\b|\bfleet status\b|^status$/.test(lower)){
      if(!list.length) return 'The fleet is empty so far — register the first project on the 🗂️ Projects page (only the Supabase URL + anon key are needed).';
      const s = Fleet.fleetSummary();
      const risky = list.filter(p => { const h = Fleet.heartbeatDays(p); return !p.paused && h != null && h >= Store.settings().warnHeartbeatDays; });
      return '📡 **Live fleet status** (' + s.total + ' project(s)):\n' +
        '🟢 healthy: ' + s.ok + '\n🟡 degraded: ' + s.warn + '\n🔴 critical: ' + s.bad + '\n⚪ not yet checked: ' + s.unknown + '\n⏸️ paused: ' + s.paused + '\n🚨 pause risks: ' + s.pauseRisk + (risky.length ? ' → ' + risky.map(p => p.name).join(', ') : '') + '\n📅 renewals soon: ' + s.renewalsSoon + '\n🔒 expired subscriptions: ' + s.expired +
        '\n\nWant details? Ask "who is at risk" or "renewals due".';
    }
    if(/\b(risk|stale|danger|pause)\b/.test(lower) && /\bwho|which|list|show\b/.test(lower)){
      const risky = list.filter(p => { const h = Fleet.heartbeatDays(p); return !p.paused && h != null && h >= Store.settings().warnHeartbeatDays; });
      return risky.length
        ? '🚨 Heartbeats needing attention:\n' + risky.map(p => '• ' + p.name + ' — ' + Fleet.heartbeatDays(p).toFixed(1) + ' days old').join('\n') + '\n\nGo to the Dashboard and press each ⚡ button — a real database write resets the 7-day clock instantly.'
        : '✅ No project is at pause risk right now — every heartbeat is fresh.';
    }
    if(/\brenewal|due|owing|expir/.test(lower) && /\bwho|which|list|show|due\b/.test(lower)){
      const soon = list.filter(p => { const d = Fleet.renewalDays(p); return d != null && d <= Store.settings().renewalWarnDays; })
        .sort((a, b) => Fleet.renewalDays(a) - Fleet.renewalDays(b));
      return soon.length
        ? '📅 Renewals in the window:\n' + soon.map(p => { const d = Fleet.renewalDays(p); return '• ' + p.name + ' — ' + (d >= 0 ? 'in ' + d + ' day(s)' : (-d) + ' day(s) OVERDUE') + ((p.client && p.client.phone) ? ' · ' + p.client.phone : ''); }).join('\n')
        : '✅ No renewals inside the ' + Store.settings().renewalWarnDays + '-day warning window.';
    }
    return null;
  },

  respond(msg){
    const lower = msg.toLowerCase();
    // page questions first ("what is the dashboard", "explain projects page"…)
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
    if(lower.includes('thank')) return 'You\'re welcome! 🎉 The fleet thanks you too.';
    if(/\b(bye|goodbye)\b/.test(lower)) return 'Goodbye! I\'ll be here — and auto-pilot keeps watching the fleet. 🛰️';
    if(/\b(hi|hello|hey|good (morning|afternoon|evening))\b/.test(lower)) return 'Hello! 👋 Ask me about any page (e.g. "what is the wallboard page") or feature — or type "status" for a live fleet summary.';
    return 'I\'m not sure about that one. Try:\n• "status" — live fleet summary\n• "who is at risk" / "renewals due"\n• "what is the [dashboard/projects/incidents/reports/wallboard/toolkit/settings] page"\n• keywords: **keep alive**, **health**, **score**, **backup**, **deploy**, **login**, **install**, **subscription**, **security**\n\nHuman help: 💬 WhatsApp +234 810 086 6322.';
  },

  /* ---------------- UI ---------------- */
  CHIPS: ['status', 'who is at risk?', 'renewals due', 'what is this page?', 'keep alive explained', 'how do I deploy?', 'change login'],
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
    // Greeting with THIS page's description — first-time users understand where they are.
    const here = location.pathname.split('/').pop() || 'index.html';
    const p = this.PAGES[here];
    this.history.push({ from:'bot', msg: 'Hello! 👋 I\'m Fleet Bot — I know every page and feature of this console, and I can answer live questions about your fleet ("status", "who is at risk?").' + (p ? '\n\nYou are on: ' + p.icon + ' **' + p.name + '**\n' + p.text : '') });
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
    setTimeout(() => {
      this.history.push({ from:'bot', msg: this.respond(msg) });
      this.render();
    }, 300);
  },
  render(){
    const host = document.getElementById('fleetbot-msgs');
    if(!host) return;
    host.innerHTML = this.history.map(m => '<div class="fb-msg ' + (m.from === 'bot' ? 'fb-bot' : 'fb-user') + '">' + this.md(m.msg) + '</div>').join('');
    host.scrollTop = host.scrollHeight;
  }
};
window.FleetBot = FleetBot;
