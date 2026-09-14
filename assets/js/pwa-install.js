/* =============================================================================
   HMG FLEET CONSOLE — PWA install enforcement (V1.1)
   Same philosophy as School Connect's pwa-install.js: a beautiful, persistent
   banner that keeps returning until the console is installed on the device.
   Free. No AI. Works on Chrome/Edge/Android (native prompt) and iOS (guided
   Add-to-Home-Screen instructions).
   ============================================================================= */
'use strict';
const PWAInstall = {
  deferredPrompt: null,
  installed: false,
  remindHours: 24,   // banner returns at most this often after a dismissal

  init(){
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferredPrompt = e;
      setTimeout(() => this.maybeShow(), 3500);
    });
    window.addEventListener('appinstalled', () => {
      this.installed = true;
      this.deferredPrompt = null;
      try{ localStorage.setItem('hmg-fleet-pwa-installed', '1'); }catch(_){ }
      this.hide();
      if(window.Shell) Shell.toast('🎉 Installed! Look for "Fleet Console" on your home screen / desktop.', 'ok');
    });
    try{ if(localStorage.getItem('hmg-fleet-pwa-installed') === '1') this.installed = true; }catch(_){ }
    if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) this.installed = true;
    if(window.navigator && window.navigator.standalone === true) this.installed = true;
    // iOS never fires beforeinstallprompt — show the guided banner anyway.
    setTimeout(() => this.maybeShow(), 5000);
  },

  dueAgain(){
    try{
      const t = Number(localStorage.getItem('hmg-fleet-pwa-snooze') || 0);
      return !t || (Date.now() - t) > this.remindHours * 3600000;
    }catch(_){ return true; }
  },

  maybeShow(){
    if(this.installed || !this.dueAgain()) return;
    if(!this.deferredPrompt && !this.isIOS()) return; // desktop Firefox etc. — no reliable path, stay quiet
    let b = document.getElementById('pwa-banner');
    if(!b){
      b = document.createElement('div');
      b.id = 'pwa-banner';
      b.innerHTML =
        '<img src="assets/img/logo.svg" alt="">' +
        '<div class="t"><b>Install HMG Fleet Console</b><span id="pwa-msg">' +
        (this.isIOS()
          ? 'Tap <b>Share ⬆</b> then <b>Add to Home Screen</b> — instant open, full screen, works offline.'
          : 'One click: instant open, full screen, offline app shell — ideal for the office Wallboard too.') +
        '</span></div>' +
        '<button class="btn btn-primary btn-sm" id="pwa-install-btn">⬇ Install</button>' +
        '<button class="btn btn-sm" id="pwa-later-btn" title="Remind me tomorrow">Later</button>';
      document.body.appendChild(b);
      document.getElementById('pwa-install-btn').onclick = () => this.prompt();
      document.getElementById('pwa-later-btn').onclick = () => this.snooze();
    }
    requestAnimationFrame(() => b.classList.add('show'));
  },

  async prompt(){
    if(!this.deferredPrompt){
      if(this.isIOS()) this.iosHelp();
      else if(window.Shell) Shell.toast('Use your browser menu → "Install app" / "Add to Home screen".');
      return;
    }
    this.deferredPrompt.prompt();
    const choice = await this.deferredPrompt.userChoice;
    if(choice.outcome !== 'accepted') this.snooze();
    this.deferredPrompt = null;
    this.hide();
  },

  snooze(){
    this.hide();
    try{ localStorage.setItem('hmg-fleet-pwa-snooze', String(Date.now())); }catch(_){ }
    if(window.Shell) Shell.toast('OK — I\'ll remind you again tomorrow. (The console works best installed.)');
  },

  hide(){
    const b = document.getElementById('pwa-banner');
    if(b) b.classList.remove('show');
  },

  isIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; },

  iosHelp(){
    if(!window.Shell) return;
    Shell.toast('iPhone/iPad: open in Safari → Share ⬆ → Add to Home Screen → Add.', 'ok');
  }
};
window.PWAInstall = PWAInstall;
