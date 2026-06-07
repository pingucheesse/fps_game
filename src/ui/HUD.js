export class HUD {
  constructor() {
    this._peerEl = document.getElementById('peer-count');
    this._hitEl  = document.getElementById('hit-flash');
    this._hitAlpha = 0;
  }

  setPeerCount(n) {
    if (this._peerEl) {
      this._peerEl.textContent = n > 0 ? `● ${n + 1} players` : '';
    }
  }

  showHitFlash() {
    this._hitAlpha = 1.0;
    if (this._hitEl) this._hitEl.style.opacity = '1';
  }

  // Call once per frame with dt in seconds
  update(dt) {
    if (this._hitAlpha <= 0) return;
    this._hitAlpha = Math.max(0, this._hitAlpha - dt * 1.6); // ~0.6s fade
    if (this._hitEl) this._hitEl.style.opacity = this._hitAlpha.toFixed(3);
  }
}
