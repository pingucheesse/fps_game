# Changelog

Update log of notable changes. The game is live at https://fps-game-ruddy.vercel.app
(auto-deploys from `main`).

## 2026-06-14

### Added — Dart gun (new weapon)
- New "chunky shotgun" dart launcher. Switch weapons with **1** (pistol) / **2** (dart gun).
- **Left click:** fire one slow dart trailing a wire; the wire shocks instantly for
  **50** damage to anything along the line. Left click again retracts it.
- **Right click:** with all 3 darts, fire them in a triangle, all wired back to the
  gun (a pyramid). Right click again **electrifies** it (wires glow yellow):
  **40** to anyone inside the triangle, **+40** to anyone touching a wire.
- Darts move slowly and retract automatically if they fly too far without sticking.

### Earlier today
- Round system: every death **resets the same map** (clears damage) with a 10s
  intermission; the map splits into halves (2 players) / quadrants (3-4) behind
  opaque dividing walls — players spawn in separate sections and move freely until
  the walls drop. Firing is disabled during the intermission.
- Passive ammo regen restores **3 rounds at a time at 15+** (1 below that).
- Particle gun polish: gun is a black→blue particle cloud, smooth per-round
  transitions, working slide, blue-particle shell casings, reload converges
  particles back into the barrel.
- Deployed to Vercel (fps-game-ruddy.vercel.app).
