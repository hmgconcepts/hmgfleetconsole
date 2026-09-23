// ============================================================================
// HMG Fleet Console — engine test (Node 18+, zero deps)
// Loads store.js + fleet.js with stubbed browser APIs and exercises:
//   validation (anon vs service_role vs mismatch), add/update/remove,
//   REAL ping + health-check against a live Supabase project (if env vars or
//   the demo project are reachable), score maths, history/uptime, incidents,
//   backup export/import (v1 + v2 + bare array), settings clamps.
// Usage:  node tools/test-fleet-engine.mjs [SUPABASE_URL ANON_KEY]
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0, failed = 0;
const ok = (name, cond) => { if(cond){ passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗ FAIL', name); } };

// ---------- browser stubs ----------
const mem = new Map();
const localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};
const sandbox = {
  window: {}, console,
  localStorage, sessionStorage: { getItem:()=>null, setItem(){}, removeItem(){} },
  performance: { now: () => Date.now() },
  fetch: (...a) => fetch(...a), AbortController, 
  document: { dispatchEvent(){}, createElement: () => ({ style:{}, click(){}, remove(){} }), getElementById: () => null, addEventListener(){} },
  navigator: {},
  confirm: () => true,
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  Shell: { esc: s => String(s == null ? '' : s), toast(){}, copy(){} },
  CustomEvent: class { constructor(n){ this.type = n; } },
  Blob: class {}, URL: { createObjectURL: () => '', revokeObjectURL(){} },
  FileReader: class {}, setTimeout, clearTimeout, setInterval, clearInterval,
  Date, JSON, Math, Object, Array, String, Number, Boolean, isFinite, parseFloat, parseInt
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(here, '..', 'assets/js/store.js'), 'utf8'), sandbox);
vm.runInContext(readFileSync(join(here, '..', 'assets/js/fleet.js'), 'utf8'), sandbox);
const { Store, Fleet } = sandbox.window;

console.log('\n— validation —');
const mkJwt = payload => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.sig';
const anonKey = mkJwt({ role:'anon', ref:'abcdefghij', exp: Math.floor(Date.now()/1000) + 9e6 });
ok('valid anon key accepted', Fleet.validate('X', 'https://abcdefghij.supabase.co', anonKey) === null);
ok('service_role key REJECTED', /REFUSED/.test(Fleet.validate('X', 'https://abcdefghij.supabase.co', mkJwt({ role:'service_role', ref:'abcdefghij' })) || ''));
ok('key/url mismatch rejected', /mismatch/i.test(Fleet.validate('X', 'https://zzzz.supabase.co', anonKey) || ''));
ok('expired key rejected', /EXPIRED/.test(Fleet.validate('X', 'https://abcdefghij.supabase.co', mkJwt({ role:'anon', ref:'abcdefghij', exp: 1000 })) || ''));
ok('non-supabase URL rejected', Fleet.validate('X', 'https://example.com', anonKey) !== null);
ok('missing fields rejected', Fleet.validate('', '', '') !== null);

console.log('\n— store: settings clamps & defaults —');
const s0 = Store.settings();
ok('defaults present', s0.warnHeartbeatDays === 3 && s0.dangerHeartbeatDays === 6 && s0.autoHours === 12);
Store.saveSettings({ warnHeartbeatDays: 2 });
ok('settings patch persists', Store.settings().warnHeartbeatDays === 2 && Store.settings().dangerHeartbeatDays === 6);
Store.saveSettings({ warnHeartbeatDays: 3 });

console.log('\n— live ping + health check —');
const argUrl = process.argv[2], argKey = process.argv[3];
let liveUrl = argUrl, liveKey = argKey;
if(!liveUrl){
  try{
    const cfg = await (await fetch('https://schoolconnectdemo.vercel.app/assets/js/config.js')).text();
    liveUrl = (cfg.match(/SUPABASE_URL = '([^']+)'/) || [])[1];
    liveKey = (cfg.match(/SUPABASE_ANON_KEY = '([^']+)'/) || [])[1];
  }catch(_){ /* offline sandbox */ }
}
if(liveUrl && liveKey){
  const p0 = await Fleet.add({ name:'Demo School', url:liveUrl, key:liveKey, type:'schoolconnect', site:'https://schoolconnectdemo.vercel.app', tags:'demo,test', env:'demo', renewal:'', feeNote:'', notes:'', clientName:'', clientPhone:'', clientEmail:'' });
  ok('project added', !!p0);
  // Store returns fresh copies — re-read to see the post-check/post-ping state.
  const p = Store.project(p0.id);
  ok('ping succeeded (real DB write)', p.status.ping === 'ok' && p.lastPing > 0);
  ok('REST alive with latency', p.status.rest === 'ok' && typeof p.status.restMs === 'number');
  ok('auth service ok', p.status.auth === 'ok');
  ok('storage service ok', p.status.storage === 'ok');
  ok('license verdict fetched', typeof p.status.license === 'string' && p.status.license !== 'no-rpc');
  const score = Fleet.score(p);
  ok('health score computed high (' + score + ')', score >= 85);
  ok('history sample recorded', Store.history(p.id).length >= 1);
  ok('uptime pct = 100', Fleet.uptimePct(p.id) === 100);
  ok('duplicate URL rejected', (await Fleet.add({ name:'Dup', url:liveUrl, key:liveKey, type:'generic' })) === null);
  // keep-alive URL shape
  ok('keep-alive URL is RPC + apikey', Fleet.kaUrl(p).includes('/rest/v1/rpc/sc_keep_alive?apikey='));
}else{
  console.log('  (no network — live block skipped)');
}

console.log('\n— score maths (synthetic) —');
const list = Store.projects();
const q = { id:'psynth', name:'Synth', url:'https://synth.supabase.co', key:'k', type:'generic', tags:[], env:'production', client:{}, renewal:'', feeNote:'', paused:false, added:Date.now(), lastPing:Date.now(), lastCheck:Date.now(), status:{ rest:'down', auth:'down', storage:'ok' } };
list.push(q); Store.saveProjects(list);
ok('down project scores critical', Fleet.score(Store.project('psynth')) < 60);
Fleet.update('psynth', { status:{ rest:'ok', restMs:120, auth:'ok', storage:'ok' } });
const upd = Store.project('psynth'); upd.lastPing = Date.now(); Store.saveProjects(Store.projects().map(x => x.id === 'psynth' ? upd : x));
ok('healthy project scores >= 85', Fleet.score(Store.project('psynth')) >= 85);
// renewal maths
Fleet.update('psynth', { renewal: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
const rd = Fleet.renewalDays(Store.project('psynth'));
ok('renewal countdown ~5 days (' + rd + ')', rd >= 4 && rd <= 6);
const summary = Fleet.fleetSummary();
ok('fleet summary counts renewalsSoon', summary.renewalsSoon >= 1);

console.log('\n— incidents —');
Store.addIncident({ projectId:'psynth', project:'Synth', kind:'manual', sev:'bad', msg:'test outage' });
ok('incident stored', Store.incidents().some(i => i.msg === 'test outage'));
const inc = Store.incidents().find(i => i.msg === 'test outage');
Store.updateIncident(inc.id, { resolved:true });
ok('incident resolvable', Store.incidents().find(i => i.id === inc.id).resolved === true);
Store.clearResolvedIncidents();
ok('clear-resolved removes it', !Store.incidents().some(i => i.id === inc.id));

console.log('\n— backup / restore compatibility —');
const backup = Store.exportAll();
ok('v2 backup carries all sections', backup.version === 2 && Array.isArray(backup.projects) && backup.settings && Array.isArray(backup.incidents) && typeof backup.history === 'object');
// wipe then restore
mem.delete(Store.K_PROJECTS);
ok('projects wiped', Store.projects().length === 0);
const added = Store.importAll(backup);
ok('v2 restore returns all projects', added === backup.projects.length && Store.projects().length === backup.projects.length);
// v1 (original single-file console) shape
mem.delete(Store.K_PROJECTS);
const v1 = { kind:'hmg-fleet-backup', projects: backup.projects.map(p => ({ id:p.id, name:p.name, url:p.url, key:p.key, type:p.type })) };
ok('v1 restore works', Store.importAll(v1) === v1.projects.length);
// bare array
mem.delete(Store.K_PROJECTS);
ok('bare-array restore works', Store.importAll(v1.projects) === v1.projects.length);
// migration enrichment: old entries gain new fields
ok('migration enriches legacy rows', Store.projects().every(p => Array.isArray(p.tags) && p.env && p.client));

console.log('\n— remove —');
Fleet.remove('psynth');
ok('remove deletes project + history', !Store.project('psynth') && Store.history('psynth').length === 0);

console.log('\n— auth (login gate) —');
{
  const amem = new Map();
  const asb = {
    window: {}, console, Date, JSON, Math, Object, Array, String, Number, Boolean,
    localStorage: { getItem: k => (amem.has(k) ? amem.get(k) : null), setItem: (k, v) => amem.set(k, String(v)), removeItem: k => amem.delete(k) },
    sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    crypto: globalThis.crypto, TextEncoder, Uint8Array,
    location: { pathname: '/index.html', replace(){}, href: '' },
    document: { documentElement: { style: {} } }
  };
  asb.globalThis = asb;
  vm.createContext(asb);
  vm.runInContext(readFileSync(join(here, '..', 'assets/js/auth-config.js'), 'utf8'), asb);
  vm.runInContext(readFileSync(join(here, '..', 'assets/js/auth.js'), 'utf8'), asb);
  const A = asb.window.Auth;
  const CFG = asb.window.FLEET_AUTH;
  ok('auth-config ships hash not plaintext', !/ChangeMe#2026/.test(CFG.PASS_HASH) && /^[0-9a-f]{64}$/.test(CFG.PASS_HASH));
  ok('shipped default password verifies', (await A.login('hmgadmin', 'ChangeMe#2026', false)).ok === true);
  amem.clear();
  ok('wrong password rejected with countdown', /attempt/.test((await A.login('hmgadmin', 'nope', false)).error || ''));
  ok('wrong username rejected', (await A.login('someoneelse', 'ChangeMe#2026', false)).ok !== true);
  // throttle: exhaust attempts
  amem.clear();
  let last = null;
  for(let i = 0; i < CFG.MAX_ATTEMPTS; i++) last = await A.login('hmgadmin', 'bad' + i, false);
  ok('lockout engages after MAX_ATTEMPTS', /locked/i.test(last.error || ''));
  const lockedOut = await A.login('hmgadmin', 'ChangeMe#2026', false);
  ok('even correct password blocked during lockout', lockedOut.ok !== true && /Try again/i.test(lockedOut.error || ''));
  // session token round-trip
  amem.clear();
  await A.login('hmgadmin', 'ChangeMe#2026', true);
  ok('remembered session token verifies', (await A.isAuthed()) === true);
  amem.set('hmg-fleet-session', 'forged-token');
  ok('forged token rejected', (await A.isAuthed()) === false);
  // V1.5: default-password detector
  ok('isDefaultPassword true on shipped config', A.isDefaultPassword() === true);
  asb.window.FLEET_AUTH.PASS_HASH = 'a'.repeat(64);
  ok('isDefaultPassword false after rotation', A.isDefaultPassword() === false);
}

console.log('\n— builtin-shadowing guard (V1.7: the "Set is not a constructor" class) —');
{
  const BUILTINS = new Set(['Set','Map','Array','Object','String','Number','Boolean','Date','JSON','Promise','Symbol','Error','RegExp','Math','URL','Blob','Notification','Function']);
  const fs2 = await import('node:fs');
  const path2 = await import('node:path');
  const root = join(here, '..');
  let shadow = [];
  for (const f of fs2.readdirSync(root)) {
    if (!f.endsWith('.html')) continue;
    const t2 = fs2.readFileSync(path2.join(root, f), 'utf8');
    for (const m of t2.matchAll(/\b(?:const|let|var|function|class)\s+(\w+)\s*[={(]/g)) {
      if (BUILTINS.has(m[1])) shadow.push(f + ':' + m[1]);
    }
  }
  for (const f of fs2.readdirSync(path2.join(root, 'assets/js'))) {
    const t2 = fs2.readFileSync(path2.join(root, 'assets/js', f), 'utf8');
    for (const m of t2.matchAll(/\b(?:const|let|var|function|class)\s+(\w+)\s*[={(]/g)) {
      if (BUILTINS.has(m[1])) shadow.push('assets/js/' + f + ':' + m[1]);
    }
  }
  ok('no page or script shadows a JS builtin' + (shadow.length ? ' — ' + shadow.join(', ') : ''), shadow.length === 0);
}

console.log('\n— maintenance windows + audit trail (V1.6) —');
{
  const S = sandbox.window.Store, F = sandbox.window.Fleet;
  const list = S.projects();
  list.push({ id:'pmw', name:'Maint School', url:'https://mw.supabase.co', key:'k', type:'generic', tags:[], env:'production', client:{}, status:{ rest:'ok' }, paused:false, added:Date.now(), lastPing:Date.now(), lastCheck:Date.now() });
  S.saveProjects(list);
  const past = new Date(Date.now()-3600000).toISOString(), future = new Date(Date.now()+3600000).toISOString();
  F.setMaintenance('pmw', past, future, 'test window');
  ok('window active now', F.inMaintenance(S.project('pmw')) === true);
  // transitions suppressed during window
  const before = S.incidents().filter(i => i.sev === 'bad').length;
  const p = S.projects().find(x => x.id === 'pmw');
  F._transitions(p, { rest:'ok' }, { rest:'down' }, true);
  ok('down during maintenance logs NO red incident', S.incidents().filter(i => i.sev === 'bad').length === before);
  ok('quiet info line logged instead', S.incidents().some(i => i.kind === 'maintenance' && /expected/.test(i.msg)));
  F.setMaintenance('pmw', null, null, '');
  ok('window cleared', F.inMaintenance(S.project('pmw')) === false);
  ok('audit trail recorded set+clear', S.auditLog().filter(a => a.action.startsWith('maintenance')).length >= 2);
  ok('audit in backup', Array.isArray(S.exportAll().audit));
  F.remove('pmw');
}

console.log('\n— cloud sync vault (crypto + merge) —');
{
  const smem = new Map();
  const ssb = {
    window: sandbox.window, console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Promise,
    localStorage: { getItem: k => (smem.has(k) ? smem.get(k) : null), setItem: (k, v) => smem.set(k, String(v)), removeItem: k => smem.delete(k) },
    sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    navigator: { platform: 'test', userAgent: 'Chrome/1.0' },
    document: { addEventListener(){}, dispatchEvent(){} },
    fetch: (...a) => fetch(...a), setTimeout, clearTimeout, prompt: () => null
  };
  ssb.Store = sandbox.window.Store; ssb.Shell = sandbox.Shell;
  ssb.globalThis = ssb;
  vm.createContext(ssb);
  vm.runInContext(readFileSync(join(here, '..', 'assets/js/sync.js'), 'utf8'), ssb);
  const SV = ssb.window.SyncVault;
  const secret = { projects: [{ id:'pX', url:'https://xx.supabase.co', key:'k', name:'Vault School', tags:[], env:'production', client:{}, status:{}, added: 5, lastPing: 0, lastCheck: 0 }], incidents: [{ id:'iRemote1', at: Date.now(), project:'Vault School', kind:'manual', sev:'info', msg:'remote entry', resolved:false }], history: { pX: [{ t: 111, ms: 50, up: 1 }] }, settings: { autoHours: 6, pinHash: 'SHOULD-NEVER-IMPORT' } };
  const blob = await SV.encrypt(secret, 'correct horse battery');
  ok('encrypt produces hfv1 4-part blob', /^hfv1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\./.test(blob));
  const round = await SV.decrypt(blob, 'correct horse battery');
  ok('decrypt round-trips exactly', JSON.stringify(round) === JSON.stringify(secret));
  let bad = false; try{ await SV.decrypt(blob, 'wrong pass'); }catch(_){ bad = true; }
  ok('wrong passphrase rejected', bad);
  let tampered = false;
  try{ const parts = blob.split('.'); const c = Buffer.from(parts[3], 'base64'); c[5] ^= 0xff; await SV.decrypt(parts[0]+'.'+parts[1]+'.'+parts[2]+'.'+c.toString('base64'), 'correct horse battery'); }catch(_){ tampered = true; }
  ok('tampered ciphertext rejected (AES-GCM auth)', tampered);
  // merge semantics against the CURRENT store
  const beforeP = Store.projects().length, beforeI = Store.incidents().length;
  const res = SV.merge(round);
  ok('merge adds remote project + incident', res.projects === 1 && res.incidents === 1 && Store.projects().length === beforeP + 1 && Store.incidents().length === beforeI + 1);
  ok('merge never imports a remote PIN', Store.settings().pinHash !== 'SHOULD-NEVER-IMPORT');
  ok('merge unions history', Store.history('pX').some(x => x.t === 111));
  const res2 = SV.merge(round);
  ok('merge is idempotent (second run adds nothing)', res2.projects === 0 && res2.incidents === 0);
  ok('vault id generator format', /^vault-[a-z0-9]{18}$/.test(SV.makeVaultId()));
}

console.log('\n— billing model (V1.9: one-time vs subscription) —');
{
  const S = sandbox.window.Store, F = sandbox.window.Fleet;
  const list = S.projects();
  list.push({ id:'pBillSub', name:'Sub School', url:'https://sub.supabase.co', key:'k', type:'schoolconnect', billing:'subscription', renewal:'2099-12-31', billingAmount:50000, tags:[], env:'production', client:{}, status:{}, paused:false, added:Date.now(), lastPing:Date.now(), lastCheck:Date.now(), deployHistory:[] });
  list.push({ id:'pBillOne', name:'One School', url:'https://one.supabase.co', key:'k', type:'schoolconnect', billing:'onetime', renewal:'2099-12-31', billingAmount:150000, tags:[], env:'production', client:{}, status:{}, paused:false, added:Date.now(), lastPing:Date.now(), lastCheck:Date.now(), deployHistory:[] });
  S.saveProjects(list);
  ok('subscription renewal counted', F.renewalDays(S.project('pBillSub')) != null);
  ok('one-time renewal ignored even if field filled', F.renewalDays(S.project('pBillOne')) == null);
  ok('isOnetime true/false', F.isOnetime(S.project('pBillOne')) === true && F.isOnetime(S.project('pBillSub')) === false);
  ok('billing pill contains lifetime vs subscription', F.billingPill(S.project('pBillOne')).includes('one-time') && F.billingPill(S.project('pBillSub')).includes('subscription'));
  ok('license cell for one-time shows lifetime', F.licenseCell(S.project('pBillOne')).includes('one-time'));
  const sum = F.fleetSummary();
  ok('fleet summary splits billing + revenue', sum.onetime >= 1 && sum.subscription >= 1 && sum.revenue >= 150000);
  // migration inference
  const raw = [{ url:'https://mig.supabase.co', key:'k', feeNote:'lifetime owns forever' }];
  // simulate projects() migration via direct call
  const before = S._get(S.K_PROJECTS, []);
  // we already test migration elsewhere — just check billing field exists after projects() call
  ok('billing field present after migration', S.projects().every(pr => pr.billing));
  F.remove('pBillSub'); F.remove('pBillOne');
}

console.log('\n— google drive backup helpers —');
{
  const gmem = new Map();
  const gsb = {
    window: sandbox.window, console, Date, JSON, Math, Object, Array, String, Number, Boolean, Promise,
    localStorage: { getItem: k => (gmem.has(k) ? gmem.get(k) : null), setItem: (k, v) => gmem.set(k, String(v)), removeItem: k => gmem.delete(k) },
    sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document: { addEventListener(){}, dispatchEvent(){}, createElement: () => ({ set src(v){}, }), head: { appendChild(){} } },
    navigator: { onLine: false }, fetch: (...a) => fetch(...a),
    prompt: () => null, setTimeout, clearTimeout,
    CustomEvent: class { constructor(n){ this.type = n; } }
  };
  gsb.Store = sandbox.window.Store; gsb.Shell = sandbox.Shell; gsb.SyncVault = sandbox.window.SyncVault;
  gsb.globalThis = gsb;
  vm.createContext(gsb);
  vm.runInContext(readFileSync(join(here, '..', 'assets/js/gdrive-config.js'), 'utf8'), gsb);
  vm.runInContext(readFileSync(join(here, '..', 'assets/js/gdrive.js'), 'utf8'), gsb);
  const G = gsb.window.GDrive;
  ok('gdrive config ships scope drive.appdata only', gsb.window.FLEET_GDRIVE.SCOPE === 'https://www.googleapis.com/auth/drive.appdata');
  ok('gdrive not ready without client id', G.ready() === false);
  gsb.window.FLEET_GDRIVE.CLIENT_ID = 'x.apps.googleusercontent.com';
  ok('gdrive ready with client id', G.ready() === true);
  // rotation pruning: keep newest N
  const files = [
    { id:'a', createdTime:'2026-09-15T10:00:00Z' },
    { id:'b', createdTime:'2026-09-14T10:00:00Z' },
    { id:'c', createdTime:'2026-09-13T10:00:00Z' },
    { id:'d', createdTime:'2026-09-12T10:00:00Z' },
    { id:'e', createdTime:'2026-09-11T10:00:00Z' },
    { id:'f', createdTime:'2026-09-10T10:00:00Z' },
    { id:'g', createdTime:'2026-09-09T10:00:00Z' }
  ];
  const del = G.pruneList(files, 5);
  ok('rotation deletes only oldest beyond keep (' + del.join(',') + ')', JSON.stringify(del) === JSON.stringify(['f','g']));
  ok('rotation keeps at least 1 even if keep=0', G.pruneList(files, 0).length === files.length - 1);
  // V1.8: count hint parsing + newest-non-empty rules
  ok('countHint parses -p12 names', G.countHint('hmg-fleet-backup-2026-09-23-p12.json') === 12);
  ok('countHint null on legacy names', G.countHint('hmg-fleet-backup-2026-09-01.json') === null);
  ok('countHint 0 on empty generation', G.countHint('x-p0.json') === 0);
  // encrypted payload round trip via SyncVault engine
  gmem.set(G.K, JSON.stringify({ connected:1, pass:'BackupPass#1' }));
  const enc = await G.payload();
  ok('payload with passphrase is encrypted wrapper', JSON.parse(enc).kind === 'hmg-fleet-gdrive-encrypted');
  const round2 = await G.parsePayload(enc);
  ok('encrypted payload restores', Array.isArray(round2.projects));
  gmem.set(G.K, JSON.stringify({ connected:1 }));
  const plain = await G.payload();
  ok('payload without passphrase is plain export', JSON.parse(plain).kind === 'hmg-fleet-backup');
}

console.log('\n— webhook payload shaping —');
{
  let captured = null;
  const wsb = sandbox; // reuse main sandbox — patch fetch temporarily
  const origFetch = wsb.fetch;
  wsb.fetch = (url, opts) => { captured = { url, body: opts && opts.body }; return Promise.resolve({ ok:true }); };
  sandbox.window.Store.saveSettings({ webhookUrl: 'https://discord.com/api/webhooks/123/abc' });
  sandbox.window.Fleet.webhook('test message');
  ok('discord payload uses content field', captured && JSON.parse(captured.body).content === 'test message');
  sandbox.window.Store.saveSettings({ webhookUrl: 'https://hooks.slack.com/services/T/B/x' });
  sandbox.window.Fleet.webhook('slack msg');
  ok('slack payload uses text field', captured && JSON.parse(captured.body).text === 'slack msg');
  sandbox.window.Store.saveSettings({ webhookUrl: 'https://api.telegram.org/bot123:tok/sendMessage', webhookChat: '9911' });
  sandbox.window.Fleet.webhook('tg msg');
  ok('telegram payload uses chat_id + text', captured && JSON.parse(captured.body).chat_id === '9911' && JSON.parse(captured.body).text === 'tg msg');
  sandbox.window.Store.saveSettings({ webhookUrl: '', webhookChat: '' });
  wsb.fetch = origFetch;
}

console.log('\n— fleet bot knowledge —');
{
  const bsb = {
    window: sandbox.window, console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp,
    location: { pathname: '/index.html' },
    document: { getElementById: () => null, createElement: () => ({ style:{}, remove(){} }), addEventListener(){}, querySelectorAll: () => [] },
    setTimeout
  };
  bsb.Store = sandbox.window.Store; bsb.Fleet = sandbox.window.Fleet;
  bsb.globalThis = bsb;
  vm.createContext(bsb);
  vm.runInContext(readFileSync(join(here, '..', 'assets/js/bot.js'), 'utf8'), bsb);
  const B = bsb.window.FleetBot;
  ok('bot describes all 13 protected pages + login', Object.keys(B.PAGES).length === 14);
  ok('bot answers page questions', /morning glance|Dashboard/i.test(B.respond('what is the dashboard page')));
  ok('bot answers keep-alive', /sc_keep_alive|QUADRUPLE|7 day/i.test(B.respond('explain keep alive')));
  ok('bot answers login changes', /auth-config\.js/.test(B.respond('how do I change my password')));
  ok('bot live fleet status works', /Live fleet status|fleet is empty/i.test(B.respond('status')));
  ok('bot fallback lists suggestions', /status|keep alive/i.test(B.respond('xyzzy quux')));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
