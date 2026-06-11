// Movement
export const MOVE_SPEED       = 5;      // m/s standing
export const GRAVITY          = 16;     // m/s²
export const JUMP_SPEED       = 7;      // m/s
export const BASE_SENSITIVITY = 0.002;  // rad/px at sensitivity=5

// Player geometry
export const PLAYER_HEIGHT     = 1.7;
export const PLAYER_RADIUS     = 0.3;
export const EYE_HEIGHT        = 1.6;
export const CROUCH_EYE_HEIGHT = 0.72;  // crouched camera level (m)
export const CROUCH_SPEED_MULT = 0.5;

// Network
export const SYNC_MS = 16; // ~60 fps state broadcast

// ── Wall types ──────────────────────────────────────────────────────────────
//   sigma:         Gaussian hit radius (m) — controls hole size
//   strength:      damage per shot at dead-centre
//   threshold:     vertex damage to cull a triangle (999 = never)
//   maxDisplace:   how far vertices are pushed by damage
//   segsPerM:      geometry subdivisions per metre (higher = smoother holes)
//   color:         mesh colour
//   passThreshold: fraction of triangles culled before collision is removed
export const WALL_TYPES = {
  thin: {
    sigma:         0.09,
    strength:      1.5,    // one shot punches through at centre
    threshold:     0.85,
    maxDisplace:   0.005,  // barely deforms
    segsPerM:      40,     // high-poly → smooth hole edges
    color:         0xf0dfc0,
    passThreshold: 0.12,   // 12% triangles culled → walk through
  },
  medium: {
    sigma:         0.11,
    strength:      0.38,   // ~3 shots to create a hole
    threshold:     0.85,
    maxDisplace:   0.004,
    segsPerM:      24,
    color:         0xb89060,
    passThreshold: 0.20,
  },
  concrete: {
    sigma:         0.20,   // wide spread — visible surface damage
    strength:      0.05,   // barely damages per shot
    threshold:     999,    // holes never form
    maxDisplace:   0.08,   // deep crater / chip deform
    segsPerM:      12,     // lower poly — no fine holes needed
    color:         0x8c8c8c,
    passThreshold: 999,    // never passable
  },
};
