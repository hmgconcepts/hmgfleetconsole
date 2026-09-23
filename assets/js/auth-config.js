/* =============================================================================
   HMG FLEET CONSOLE — LOGIN CREDENTIALS (THE ONLY FILE YOU EDIT FOR LOGIN)
   =============================================================================
   ⚠️ FIRST THING AFTER DEPLOYING: change these credentials!
   The shipped defaults are:  username  hmgadmin
                              password  ChangeMe#2026

   HOW TO SET YOUR OWN PASSWORD (2 minutes, no tools needed):
     1. Deploy the console and sign in once with the defaults above.
     2. Go to  Settings → 🔑 Login credentials  — type your new username +
        password there. It generates the EXACT text of this file for you.
     3. In GitHub: open assets/js/auth-config.js → ✏️ Edit → replace the
        whole file with the generated text → Commit. Vercel redeploys
        automatically and the new login is live in ~1 minute.

   WHAT IS STORED HERE: never the password itself — only its SHA-256 hash,
   salted with the SALT below. Someone reading this file cannot see your
   password; with a STRONG password (12+ characters, not a dictionary word)
   they cannot practically reverse it either.

   HONEST SECURITY NOTE (read once): this login is a strong access gate for a
   static site — it keeps out anyone who stumbles on the URL. It is not a
   server: a determined attacker who obtains this file could try passwords
   against the hash offline. That is why (a) use a strong password, (b) keep
   the GitHub repo PRIVATE, and (c) remember the REAL safety net — the console
   only ever stores public anon keys, and Supabase RLS keeps every client's
   business data unreadable regardless. For an even stronger free option, see
   the "Stronger alternatives" section on the Deployment page (Cloudflare
   Access, free for up to 50 users).
   ============================================================================= */
window.FLEET_AUTH = {
  USERNAME: 'hmgadmin',

  /* SHA-256 hex of  (password + '::' + SALT).
     Default below = ChangeMe#2026 — CHANGE IT via Settings → Login credentials. */
  PASS_HASH: '9b540556113abc00d1930fefdd1acb3c9e06f63f81aff19666eea7af3d514de4',

  /* Salt makes precomputed hash tables useless. You may change it (Settings
     regenerates everything consistently), but never to an empty string. */
  SALT: 'hmg-fleet-v1',

  /* How long a sign-in lasts before the console asks again (hours). */
  SESSION_HOURS: 12,

  /* Brute-force throttle: after MAX_ATTEMPTS wrong tries, the login form
     locks for LOCK_MINUTES on this browser. */
  MAX_ATTEMPTS: 5,
  LOCK_MINUTES: 15
};
