export class HUD {
  constructor() {
    this._peerEl    = document.getElementById('peer-count');
    this._hitEl     = document.getElementById('hit-flash');
    this._hpFill    = document.getElementById('hp-fill');
    this._hpNum     = document.getElementById('hp-num');
    this._armorFill = document.getElementById('armor-fill');
    this._armorNum  = document.getElementById('armor-num');
    this._armorRow  = document.getElementById('armor-row');
    this._roomEl    = document.getElementById('room-code-hud');
    this._notifEl   = document.getElementById('notification');
    this._hitAlpha  = 0;
    this._notifTimer = null;
  }

  setPeerCount(n) {
    if (this._peerEl) this._peerEl.textContent = n > 0 ? `● ${n + 1} players` : '';
  }

  setHealth(hp, armor) {
    if (!this._hpFill) return;
    const hpPct = Math.max(0, hp / 100);
    this._hpFill.style.width      = (hpPct * 100) + '%';
    this._hpNum.textContent       = Math.ceil(hp);
    this._hpFill.style.background =
      hpPct > 0.6 ? '#4caf50' : hpPct > 0.3 ? '#f5a623' : '#e53935';

    const armorPct = Math.max(0, armor / 50);
    this._armorFill.style.width  = (armorPct * 100) + '%';
    this._armorNum.textContent   = Math.ceil(armor);
    this._armorRow.style.opacity = armor > 0 ? '1' : '0.35';
  }

  // Show room code at top centre (host only)
  setRoomCode(code) {
    if (!this._roomEl) return;
    this._roomEl.textContent   = `ROOM  ${code}`;
    this._roomEl.style.display = 'block';
  }

  // Brief notification that fades out after 3 s
  showNotification(text) {
    if (!this._notifEl) return;
    this._notifEl.textContent  = text;
    this._notifEl.style.opacity = '1';
    clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => {
      if (this._notifEl) this._notifEl.style.opacity = '0';
    }, 3000);
  }

  showHitFlash() {
    this._hitAlpha = 1.0;
    if (this._hitEl) this._hitEl.style.opacity = '1';
  }

  update(dt) {
    if (this._hitAlpha <= 0) return;
    this._hitAlpha = Math.max(0, this._hitAlpha - dt * 1.6);
    if (this._hitEl) this._hitEl.style.opacity = this._hitAlpha.toFixed(3);
  }
}
