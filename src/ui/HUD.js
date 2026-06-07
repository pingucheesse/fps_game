export class HUD {
  constructor() {
    this._peerEl = document.getElementById('peer-count');
  }

  setPeerCount(n) {
    if (this._peerEl) {
      this._peerEl.textContent = n > 0 ? `● ${n + 1} players` : '';
    }
  }
}
