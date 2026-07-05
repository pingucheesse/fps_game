// Top-left minimap: north-up, player-centred. Draws wall footprints around the
// player (who stays at the centre) plus a facing arrow. Destroyed (passable)
// walls drop off the map.
export class Minimap {
  constructor(canvas, wallManager) {
    this.cv  = canvas;
    this.ctx = canvas.getContext('2d');
    this.range = 22; // metres from player edge-to-centre shown

    // Precompute static world-space AABBs from each wall's collision box.
    this.rects = wallManager.allWalls.map((w) => {
      const b = w.getCollisionBox();
      return { x0: b.min.x, z0: b.min.z, x1: b.max.x, z1: b.max.z, wall: w, type: w.type };
    });
  }

  reload(wallManager) {
    this.rects = wallManager.allWalls.map((w) => {
      const b = w.getCollisionBox();
      return { x0: b.min.x, z0: b.min.z, x1: b.max.x, z1: b.max.z, wall: w, type: w.type };
    });
    this._dirty = true;
  }

  _color(type) {
    return type === 'concrete' ? 'rgba(150,150,158,0.95)'
         : type === 'medium'   ? 'rgba(176,138,96,0.95)'
         :                       'rgba(225,210,180,0.95)';
  }

  update(px, pz, yaw) {
    // Perf: only redraw when the player actually moved/turned (or every ~30
    // frames so destroyed walls still fall off the map).
    this._skip = (this._skip ?? 0) + 1;
    const moved = this._lx === undefined ||
      Math.abs(px - this._lx) > 0.01 || Math.abs(pz - this._lz) > 0.01 ||
      Math.abs(yaw - this._lyaw) > 0.005;
    if (!moved && !this._dirty && this._skip < 30) return;
    this._skip = 0; this._dirty = false;
    this._lx = px; this._lz = pz; this._lyaw = yaw;

    const { ctx, cv } = this;
    const W = cv.width, H = cv.height;
    const s = (W / 2) / this.range; // px per metre

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,12,16,0.6)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.translate(W / 2, H / 2); // player at centre; world +x → right, +z → down

    for (const r of this.rects) {
      if (r.wall._passable) continue;
      const x = (r.x0 - px) * s, y = (r.z0 - pz) * s;
      const w = Math.max(1, (r.x1 - r.x0) * s), h = Math.max(1, (r.z1 - r.z0) * s);
      if (x > W / 2 || y > H / 2 || x + w < -W / 2 || y + h < -H / 2) continue;
      ctx.fillStyle = this._color(r.type);
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();

    // Facing arrow (forward = (-sin yaw, -cos yaw) in world → canvas)
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const px0 = W / 2, py0 = H / 2;
    ctx.fillStyle = '#ffe14d';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px0 + fx * 8, py0 + fz * 8);              // tip
    ctx.lineTo(px0 - fx * 5 - fz * 5, py0 - fz * 5 + fx * 5); // back-left
    ctx.lineTo(px0 - fx * 5 + fz * 5, py0 - fz * 5 - fx * 5); // back-right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }
}
