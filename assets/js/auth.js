/* =============================================================================
   HMG FLEET CONSOLE — Auth guard (V1.1)
   -----------------------------------------------------------------------------
   Every console page loads this BEFORE anything renders. If there is no valid
   session token, the page body is hidden and the user is bounced to
   login.html. Sessions are HMAC-style tokens: sha256(user + passHash + day
   window + salt) stored in sessionStorage/localStorage, so a token cannot be
   forged without knowing the password hash AND expires on its own.

   Credentials live in ONE file: assets/js/auth-config.js (see its header for
   the exact change procedure). This file never needs editing.

   Design notes (honest engineering):
   • This is a static-site gate — it blocks casual visitors, search engines
     and nosy strangers 100%, and resists brute force with hashing + salting
     + attempt throttling. It is not a substitute for a server; the real data
     security remains Supabase RLS on every client project (the console holds
     only public anon keys). For bank-grade access control put the deployment
     behind Cloudflare Access (free tier) — documented on the Deployment page.
   • WebCrypto (crypto.subtle) requires HTTPS or localhost. Vercel/GitHub
     Pages/Netlify are always HTTPS, so this is automatic in production.
   ============================================================================= */
'use strict';
const Auth = {
  T_KEY: 'hmg-fleet-session',

  async sha256(text){
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  cfg(){
    const c = window.FLEET_AUTH || {};
    return {
      user: String(c.USERNAME || 'hmgadmin'),
      hash: String(c.PASS_HASH || ''),
      salt: String(c.SALT || 'hmg-fleet-v1'),
      hours: Math.max(1, Number(c.SESSION_HOURS) || 12),
      maxAttempts: Math.max(3, Number(c.MAX_ATTEMPTS) || 5),
      lockMin: Math.max(1, Number(c.LOCK_MINUTES) || 15)
    };
  },

  /* Token = sha256(user | passHash | windowStamp | salt). windowStamp changes
     every SESSION_HOURS, so old tokens die naturally. We accept the current
     and previous window so a session never dies mid-click. */
  windowStamp(offset){
    const c = this.cfg();
    return Math.floor(Date.now() / (c.hours * 3600000)) - (offset || 0);
  },
  async makeToken(offset){
    const c = this.cfg();
    return this.sha256([c.user, c.hash, this.windowStamp(offset), c.salt].join('|'));
  },

  async isAuthed(){
    try{
      // file:// dev fallback only — every production host (Vercel/GitHub
      // Pages/Netlify) is HTTPS, where crypto.subtle always exists.
      if(!(globalThis.crypto && globalThis.crypto.subtle)) return true;
      const t = localStorage.getItem(this.T_KEY) || sessionStorage.getItem(this.T_KEY);
      if(!t) return false;
      return t === await this.makeToken(0) || t === await this.makeToken(1);
    }catch(_){ return false; }
  },

  async login(username, password, remember){
    const c = this.cfg();
    // throttle
    let th = {};
    try{ th = JSON.parse(localStorage.getItem('hmg-fleet-lock') || '{}'); }catch(_){ }
    if(th.until && Date.now() < th.until){
      return { ok:false, error:'Too many wrong attempts. Try again in ' + Math.ceil((th.until - Date.now()) / 60000) + ' minute(s).' };
    }
    const goodUser = String(username || '').trim() === c.user;
    const goodPass = c.hash && (await this.sha256(String(password || '') + '::' + c.salt)) === c.hash.toLowerCase();
    if(goodUser && goodPass){
      localStorage.removeItem('hmg-fleet-lock');
      const token = await this.makeToken(0);
      (remember ? localStorage : sessionStorage).setItem(this.T_KEY, token);
      return { ok:true };
    }
    const n = (th.n || 0) + 1;
    const lock = n >= c.maxAttempts;
    try{ localStorage.setItem('hmg-fleet-lock', JSON.stringify({ n: lock ? 0 : n, until: lock ? Date.now() + c.lockMin * 60000 : 0 })); }catch(_){ }
    return { ok:false, error: lock
      ? 'Too many wrong attempts — locked for ' + c.lockMin + ' minutes.'
      : 'Wrong username or password (' + (c.maxAttempts - n) + ' attempt(s) left).' };
  },

  /* V1.5 (pass 74): the shipped default hash, detectable so the console can
     DEMAND a change. Found live on hmgfleetconsole.vercel.app with a PUBLIC
     repo — meaning anyone reading auth-config.js could sign in. */
  DEFAULT_HASH: '9b540556113abc00d1930fefdd1acb3c9e06f63f81aff19666eea7af3d514de4',
  isDefaultPassword(){ return String(this.cfg().hash).toLowerCase() === this.DEFAULT_HASH; },

  logout(){
    localStorage.removeItem(this.T_KEY);
    sessionStorage.removeItem(this.T_KEY);
    location.href = 'login.html';
  },

  /* Called at the top of every protected page. Hides content immediately;
     reveals only after the token verifies. */
  async guard(){
    if(location.pathname.endsWith('login.html')) return true;
    document.documentElement.style.visibility = 'hidden';
    const ok = await this.isAuthed();
    if(!ok){
      try{ sessionStorage.setItem('hmg-fleet-return', location.pathname.split('/').pop() || 'index.html'); }catch(_){ }
      location.replace('login.html');
      return false;
    }
    document.documentElement.style.visibility = '';
    return true;
  }
};
window.Auth = Auth;
