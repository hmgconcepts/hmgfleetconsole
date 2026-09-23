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
/* HMG FLEET CONSOLE — LOGIN CREDENTIALS (generated 2026-09-23 via Settings → Login credentials).
   To change again: Settings → 🔑 Login credentials → Generate → paste over this file in GitHub → Commit. */
window.FLEET_AUTH = {
  USERNAME: 'cssadewale',
  PASS_HASH: 'a1456719573c2145d10157d8340f6bc7118cc85935c1921a0b128336cf134323',
  SALT: 'hmg-fleet-mvonlzad',
  SESSION_HOURS: 12,
  MAX_ATTEMPTS: 5,
  LOCK_MINUTES: 15
};
