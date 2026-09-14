# 🛰️ HMG Fleet Console

**HMG Concepts' internal operations platform** — one place to watch, protect and manage
every client project we build: School Connect schools, Tutoring Connect practices,
DramaConnect departments, HMG CBT deployments, and **any other Supabase-backed project**.

> Mission: *"Recurring payments should not keep your schools from having online presences."*
> Free Supabase projects pause after **7 days without database activity**. This console's
> first job is to make sure that never happens to any client — even one whose
> subscription has expired. Their data stays alive; they renew when ready.

100% free-tier. No server. No paid API. **No AI API.** No build step. Pure static files.

## Pages

| Page | What it does |
|---|---|
| `index.html` — **Dashboard** | KPIs, "Needs attention" panel, full fleet table (score, keep-alive, health, subscription, latency sparkline), auto-pilot toggle |
| `projects.html` — **Projects** | Register/edit projects: URL + anon key, type, environment, tags, client contact, renewal date, fee note, notes; pause/resume monitoring; backup/restore/CSV |
| `incidents.html` — **Incidents** | Automatic outage/recovery/pause-risk/license-change journal + manual ops diary; filters, resolve/reopen, CSV export |
| `reports.html` — **Reports & Uptime** | Printable SLA report: uptime %, average latency, heartbeat age, renewal calendar, recent incidents |
| `board.html` — **Wallboard (NOC)** | Full-screen traffic-light grid for a spare monitor/TV; self-refreshing |
| `tools.html` — **Ops Toolkit** | Keep-alive SQL for non-HMG projects, cron-job.org/GitHub-secret generators, anon-key inspector, backup center, quick probe |
| `guide.html` — **Feature Guide** | Detailed explanation of every feature and the security model |
| `deploy.html` — **Deployment** | Step-by-step deployment & operations runbook |
| `settings.html` — **Settings** | Thresholds, auto-pilot interval, wallboard refresh, theme, optional PIN, danger zone |

## Core capabilities

- **Keep-alive engine** — real database writes via each project's public `sc_keep_alive`
  RPC. Fleet-wide one click, per-project, auto-pilot (configurable interval), stale-heartbeat
  wake-up on page open, copyable per-project cron URLs, and a bundled **GitHub Actions
  workflow** (`.github/workflows/fleet-keepalive.yml`) that pings the whole fleet every
  2 days from one repository secret. Four independent layers; any one prevents a pause.
- **Health monitoring** — REST/database API + latency, Auth service, Storage service,
  heartbeat age, live-site reachability, and the public `sc_license_status` subscription
  verdict for HMG product projects. Transparent 0–100 health score.
- **History** — latency sparklines, sampled uptime % and average latency per project,
  fleet roll-up (kept locally, up to 96 samples per project).
- **Incident journal** — automatic state-transition logging (down/up, pause risk,
  license changes) + manual ops diary; CSV export.
- **Business layer** — client contacts, renewal-date watch with configurable warning
  window, fee notes, tags, environments, monitoring pause.
- **Platform** — installable PWA with offline shell, dark/light theme, optional
  SHA-256 PIN, JSON backup/restore (backwards-compatible with the original
  single-file console), CSV exports, print-ready reports.

## Security model (privacy by construction)

The console stores **only public anon keys** in the browser's localStorage. Because
every client project enforces Row-Level Security, an anon key can bump a heartbeat row
and read the public license verdict — nothing else. The console never signs into a
portal, never reads a business table, never requests a service_role key, and **rejects
one if pasted** (JWT role check on registration and in the key inspector).

## Deploy

See `deploy.html` (also readable as plain HTML in this repo) for the full
click-by-click runbook. Short version:

1. Push this folder to a private GitHub repo.
2. Import into Vercel (framework: Other, no build command) — done.
3. Register each client with its Supabase URL + anon key.
4. Add the `FLEET_TARGETS` repository secret (Ops Toolkit generates the value)
   so GitHub pings the fleet every 2 days even with every browser closed.
5. Optionally add cron-job.org / UptimeRobot on the per-project keep-alive URLs.

## Releasing updates

Bump `const CACHE` in `sw.js` on every change so installed copies refresh their
offline cache. User data is never touched by updates — it lives in the browser.

---
© HMG Concepts · internal tool · not for client distribution
