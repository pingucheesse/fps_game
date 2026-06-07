// Movement
export const MOVE_SPEED    = 5;       // m/s
export const GRAVITY       = 16;      // m/s²
export const JUMP_SPEED    = 7;       // m/s
export const BASE_SENSITIVITY = 0.002; // rad/px at sensitivity=5

// Wall destruction
export const SIGMA             = 0.14;  // Gaussian hole radius (m)
export const BULLET_STRENGTH   = 0.65;  // damage per shot at centre
export const DAMAGE_THRESHOLD  = 0.85;  // vertex damage to cull triangle
export const MAX_DISPLACEMENT  = 0.03;  // very subtle deform — holes do the work
export const WALL_SUBDIVISIONS = 20;    // segments per metre

// Player geometry
export const PLAYER_HEIGHT = 1.7;  // m
export const PLAYER_RADIUS = 0.3;  // m
export const EYE_HEIGHT    = 1.6;  // m from feet

// Network
export const SYNC_MS = 16; // ~60 fps state broadcast
