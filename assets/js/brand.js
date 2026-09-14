/* =============================================================================
   HMG FLEET CONSOLE — Brand & ecosystem identity (V1.1)
   -----------------------------------------------------------------------------
   One authoritative place for HMG CONCEPTS identity, exactly as embedded across
   School Connect and the rest of the ecosystem. shell.js injects the footer on
   every page from here; about.html renders the full ecosystem story from here.
   ============================================================================= */
'use strict';
const Brand = {
  COMPANY: 'HMG CONCEPTS',
  MEANING: 'His Marvellous Grace',
  FOUNDER: 'Adewale Samson Adeagbo',
  TAGLINE: 'We automate, innovate, and deploy robust institutional systems globally.',
  MISSION: 'Recurring payments should not keep your schools from having online presences.',
  LOCATION: 'Lagos, Nigeria',
  WHATSAPP: 'https://wa.me/2348100866322',
  PHONE: '+234 810 086 6322',
  SITES: {
    main:        { name:'HMG Concepts',      url:'https://hmgconcepts.pages.dev/',     desc:'Main ecosystem hub — every HMG platform, product and subsidiary in one place.' },
    academy:     { name:'HMG Academy',       url:'https://hmgacademy.pages.dev',       desc:'Education arm — training, tutorials and the HMG Academy CBT Pro platform.' },
    technologies:{ name:'HMG Technologies',  url:'https://hmgtechnologies.pages.dev',  desc:'Software engineering arm — builds and maintains School Connect, Tutoring Connect, DramaConnect, HMG CBT and this Fleet Console.' },
    media:       { name:'HMG Media',         url:'https://hmgmedia.pages.dev',         desc:'Media and creative arm — design, content and publishing.' },
    gospel:      { name:'HMG Gospel',        url:'https://hmggospel.pages.dev',        desc:'Faith arm — gospel content and church-facing platforms such as DramaConnect.' }
  },
  PRODUCTS: [
    { name:'School Connect',      desc:'Complete school management platform: results, report cards, CBT (20+ question types), fees, timetable engine, 90+ modules. Generated per school, owned by the school, ₦0/month to run.', live:'hmgschoolconnect.vercel.app' },
    { name:'Tutoring Connect',    desc:'Tutoring practice portal for 1:1 and group tutoring — parents see progress, learners take CBT practice, exams get registered.', live:'adewaleclassroom.vercel.app' },
    { name:'DramaConnect Enterprise', desc:'Theatre management for drama departments — casting, inventory, attendance, member profiling.', live:'rccglp25-dramaconnect.vercel.app' },
    { name:'HMG Academy CBT Pro', desc:'Free installable CBT/assessment platform — 20 question types, anti-cheat, analytics, verifiable certificates.', live:'hmgcbtsystem.vercel.app' },
    { name:'HMG Fleet Console',   desc:'This platform — the internal operations console that keeps every client project alive, healthy and renewable.', live:'(internal)' }
  ],
  PRINCIPLES: [
    ['🆓 Free tools only', 'Supabase free tier, Vercel, GitHub Actions, cron-job.org, UptimeRobot, Google Drive. Zero monthly infrastructure cost for clients and for HMG.'],
    ['🤖 No paid AI APIs', 'Every intelligent feature (bots, graders, generators) is rules-based and runs locally — cost-effective and dependable forever.'],
    ['🔐 Privacy by construction', 'Row-Level Security on every client database. This console holds only public anon keys and can never read business data.'],
    ['🏁 Clients own everything', 'Every generated platform lives in the client\'s own accounts. Even an expired subscription never takes their data hostage.']
  ],
  footerHtml(){
    return '<footer class="site-foot">' +
      '<div class="foot-grid">' +
        '<div><b>🛰️ HMG Fleet Console</b><br><span>Internal operations platform of ' + this.COMPANY + ' (' + this.MEANING + '). Built and maintained by HMG Technologies under the leadership of ' + this.FOUNDER + '.</span></div>' +
        '<div><b>Ecosystem</b><br>' + Object.values(this.SITES).map(s => '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.name + '</a>').join(' · ') + '</div>' +
        '<div><b>Support</b><br><a href="' + this.WHATSAPP + '" target="_blank" rel="noopener">💬 WhatsApp ' + this.PHONE + '</a><br><span>' + this.LOCATION + '</span></div>' +
      '</div>' +
      '<div class="foot-line">“' + this.MISSION + '” · © ' + new Date().getFullYear() + ' ' + this.COMPANY + ' · Free tools only · No AI API · No tracking</div>' +
    '</footer>';
  }
};
window.Brand = Brand;
