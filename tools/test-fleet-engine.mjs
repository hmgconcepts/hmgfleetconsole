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
  fetch: (...a) => fetch(...a),
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
  ok('bot describes all 10 protected pages + login', Object.keys(B.PAGES).length === 11);
  ok('bot answers page questions', /morning glance|Dashboard/i.test(B.respond('what is the dashboard page')));
  ok('bot answers keep-alive', /sc_keep_alive|QUADRUPLE|7 day/i.test(B.respond('explain keep alive')));
  ok('bot answers login changes', /auth-config\.js/.test(B.respond('how do I change my password')));
  ok('bot live fleet status works', /Live fleet status|fleet is empty/i.test(B.respond('status')));
  ok('bot fallback lists suggestions', /status|keep alive/i.test(B.respond('xyzzy quux')));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
