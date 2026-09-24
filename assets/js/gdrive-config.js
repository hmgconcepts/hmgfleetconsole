/* =============================================================================
   HMG FLEET CONSOLE — Google Drive backup configuration (THE ONLY FILE TO
   EDIT for Drive backup). Safe to commit to GitHub — see "IS THIS SAFE?" below.
   =============================================================================
   ONE-TIME SETUP (≈5 minutes, once for the whole company):
     1. console.cloud.google.com → create (or pick) a project, e.g. "HMG Fleet".
     2. APIs & Services → Library → search "Google Drive API" → Enable.
     3. APIs & Services → OAuth consent screen → External → fill app name
        "HMG Fleet Console", your email → Save. Add yourself (and any HMG
        staff Gmail) under Test users — with test users the app works
        immediately and never needs Google verification.
     4. APIs & Services → Credentials → Create credentials → OAuth client ID →
        Application type: Web application → Name: "Fleet Console Web" →
        Authorized JavaScript origins: add EXACTLY your deployed URL, e.g.
            https://hmg-fleet-console.vercel.app
        (add http://localhost:3000 too if you ever develop locally) → Create.
     5. Copy the "Client ID" (ends in .apps.googleusercontent.com) and paste
        it below → commit → Vercel redeploys. Every device is now ready —
        nothing to enter on new phones, just tap "Connect Google Drive".

   IS THIS SAFE TO COMMIT? YES — by design:
     • A web OAuth *Client ID* is public information: it is embedded in the
       JavaScript of every site that uses Google Sign-In and is visible to
       anyone who opens DevTools there. Google's own docs treat it as public.
     • What protects you is the Authorized JavaScript Origins list (step 4):
       Google refuses the OAuth popup for any site not on that list, so a
       stranger who copies the ID cannot use it from their own site.
     • Even in the worst case, the only scope requested is
       "drive.appdata" — a hidden folder PRIVATE TO THIS APP inside the
       signed-in user's OWN Drive. It cannot see your real Drive files, and
       an attacker could at most talk Google into showing a consent screen
       for THEIR OWN Drive — never yours.
     • The rule that must never be broken: the client *SECRET* (a different
       value, used by server apps) is never committed anywhere. This console
       is a pure browser app and does not use or need a secret at all.
   ============================================================================= */
window.FLEET_GDRIVE = {
  /* Paste your OAuth Client ID here (…apps.googleusercontent.com). Empty =
     the Drive backup card shows the setup guide instead of the buttons. */
  CLIENT_ID: '790374824693-2lbqddn29q9396bp1qg24d0ulh00i7lr.apps.googleusercontent.com',

  /* Hidden app-data scope only — the console can NEVER read normal Drive
     files. Do not widen this. */
  SCOPE: 'https://www.googleapis.com/auth/drive.appdata',

  /* Name of the backup file kept in the hidden app folder. */
  FILE_NAME: 'hmg-fleet-backup.json',

  /* Keep this many rotated generations (newest first) in the app folder. */
  KEEP_GENERATIONS: 5
};
