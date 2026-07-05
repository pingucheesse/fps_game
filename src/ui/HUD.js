export class HUD {
  constructor() {
    this._peerEl      = document.getElementById('peer-count');
    this._hitEl       = document.getElementById('hit-flash');
    this._hpFill      = document.getElementById('hp-fill');
    this._hpNum       = document.getElementById('hp-num');
    this._armorFill   = document.getElementById('armor-fill');
    this._armorNum    = document.getElementById('armor-num');
    this._armorRow    = document.getElementById('armor-row');
    this._roomEl      = document.getElementById('room-code-hud');
    this._notifEl     = document.getElementById('notification');
    this._hitMarkerEl = document.getElementById('hit-marker');
    this._scoreEl     = document.getElementById('score-display');
    this._ammoEl      = document.getElementById('ammo-display');
    this._intermEl    = document.getElementById('intermission');
    this._moneyEl     = document.getElementById('money-display');
    this._buyEl       = document.getElementById('buy-menu');
    this._hitAlpha    = 0;
    this._notifTimer  = null;
    this._hmTimer     = null;
  }

  setMoney(m) {
    if (this._moneyEl) { this._moneyEl.textContent = `$ ${m}`; this._moneyEl.style.display = 'block'; }
  }

  // items: [{ key, name, price, owned, affordable }]
  showBuyMenu(items, money) {
    if (!this._buyEl) return;
    const rows = items.map(i => {
      const cls   = i.owned ? 'owned' : i.affordable ? '' : 'poor';
      const right = i.owned ? 'OWNED' : `$${i.price}`;
      return `<div class="buy-row ${cls}"><span class="buy-key">${i.key}</span><span class="buy-name">${i.name}</span><span class="buy-price">${right}</span></div>`;
    }).join('');
    this._buyEl.innerHTML =
      `<div class="buy-title">BUY &nbsp;·&nbsp; $${money}</div>${rows}<div class="buy-hint">press number to buy · B to close</div>`;
    this._buyEl.style.display = 'block';
  }

  hideBuyMenu() {
    if (this._buyEl) this._buyEl.style.display = 'none';
  }

  setIntermission(seconds) {
    if (!this._intermEl) return;
    this._intermEl.innerHTML = `INTERMISSION<br><span class="big">${seconds}</span>`;
    this._intermEl.style.display = 'block';
  }

  hideIntermission() {
    if (this._intermEl) this._intermEl.style.display = 'none';
  }

  setAmmo(cur, max, reloading = false) {
    if (!this._ammoEl) return;
    this._ammoEl.textContent = reloading ? 'RELOAD' : `${cur} / ${max}`;
    this._ammoEl.style.color = reloading ? '#3aa0ff'
      : cur <= 2 ? '#e53935' : 'rgba(255,255,255,0.88)';
    this._ammoEl.style.display = 'block';
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

  // Kills / deaths score (shown top-centre when non-zero)
  setScore(kills, deaths) {
    if (!this._scoreEl) return;
    this._scoreEl.textContent   = `${kills}  ·  ${deaths}`;
    this._scoreEl.style.display = 'block';
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
    this._notifEl.textContent   = text;
    this._notifEl.style.opacity = '1';
    clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => {
      if (this._notifEl) this._notifEl.style.opacity = '0';
    }, 3000);
  }

  // Hit marker — X on crosshair; gold for headshot, red for body
  showHitMarker(isHeadshot) {
    if (!this._hitMarkerEl) return;
    const color = isHeadshot ? 'rgba(255, 210, 40, 0.95)' : 'rgba(255, 50, 50, 0.92)';
    this._hitMarkerEl.querySelectorAll('.hm').forEach(el => el.style.background = color);
    this._hitMarkerEl.style.display = 'block';
    this._hitMarkerEl.style.opacity = '1';
    clearTimeout(this._hmTimer);
    this._hmTimer = setTimeout(() => {
      if (this._hitMarkerEl) this._hitMarkerEl.style.opacity = '0';
    }, 220);
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
