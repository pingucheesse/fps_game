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
//   depth:         physical thickness of the wall (m)
//   sigma:         Gaussian hit radius (m) — controls hole size
//   strength:      damage per shot at dead-centre
//   threshold:     vertex damage to cull a triangle (999 = never)
//   maxDisplace:   max vertex push on the front face
//   segsPerM:      front-face geometry subdivisions per metre
//   color:         front face colour
//   interiorColor: box body/interior colour (seen through holes and on sides)
//   passThreshold: fraction of triangles culled before collision is removed
export const WALL_TYPES = {
  thin: {
    depth:         0.04,   // 4 cm — flimsy drywall
    sigma:         0.05,   // each bullet ~10 cm diam hole; same spot = larger
    strength:      1.5,    // one shot punches through at centre
    threshold:     0.85,
    maxDisplace:   0.002,
    segsPerM:      80,     // very high poly — tight holes still look round
    color:         0xf0dfc0,
    interiorColor: 0xdecfaa,
    passThreshold: 0.10,
  },
  medium: {
    depth:         0.12,   // 12 cm — wood / plywood
    sigma:         0.18,   // larger holes (less resistance)
    strength:      0.38,   // ~3 shots to open a hole
    threshold:     0.85,
    maxDisplace:   0.005,
    segsPerM:      55,
    color:         0xb89060,
    interiorColor: 0x8a6040,
    passThreshold: 0.20,
  },
  concrete: {
    depth:         0.28,   // 28 cm — solid reinforced concrete
    sigma:         0.22,   // wide impact spread
    strength:      0.34,   // accumulates — sustained fire chips chunks loose
    threshold:     1.25,   // chunks pop out once enough damage piles up (~5+ focused hits)
    maxDisplace:   0.025,  // light cratering before the chunk lets go
    segsPerM:      20,     // low-poly → big faceted (chunky) breakage
    color:         0x8c8c8c,
    interiorColor: 0x5a5a5a,
    passThreshold: 0.45,   // tough to fully breach
    independentCull: true, // front/back chip separately → solid-looking interior
    chunky:        true,   // throw rock-chunk debris when hit
  },
};
