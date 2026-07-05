# Changelog

Update log of notable changes. The game is live at https://fps-game-ruddy.vercel.app
(auto-deploys from `main`).

## 2026-07-05

### Added — Buy menu & economy
- Press **B** to open the buy menu (number keys purchase, B closes). Start with
  **$600**; earn **$400 per kill** and **$150 per round**.
- Items: **Dart Launcher $600** (required before you can equip weapon 2),
  **Armor refill $300**, **Health refill $250**. Money shows above the HP bar.

### Changed — Dart launcher
- **New model:** chunky triple-tube launcher (tubes arranged in a triangle to
  match the 3-dart special) with glowing blue energy strips.
- **Exact alignment:** darts now launch along the camera/reticle rays, so they
  land precisely on the predicted rings (single + all three triangle darts).

### Fixed — Bug sweep
- Electrifying the triangle repeatedly (spam right-click during the discharge
  flash) no longer re-deals damage each click.
- Pistol shots now hit the **nearest** player on the ray, not an arbitrary one,
  when two players line up.

### Multiplayer fairness
- Your deployed dart wires are now **visible to other players** (synced over the
  network, glow yellow when electrified) — no more invisible-wire damage.
- Other players now see which weapon you're holding (pistol vs dart launcher).

### Performance
- Pistol particle cloud (~3.4k instances) skips per-frame updates once fully
  settled; dart wires reuse a preallocated buffer; minimap only redraws when you
  move; renderer requests the high-performance GPU.

## 2026-06-28

### Changed — Dart gun (single dart)
- The single (left-click) dart now **shocks where it lands** instead of at fire
  time: it discharges **50** along the wire the instant it sticks to a wall — or
  burns out its range and discharges in mid-air. It no longer silently vanishes,
  and a spark burst makes the discharge clearly visible.
- This also fixes the dart appearing to "disappear" when you walk forward after
  firing — it always lands and shocks now.

### Added — Dart landing reticle
- A predictive **blue ring reticle** appears in the world while the dart gun is
  equipped, marking exactly where the dart will land (raycast to the nearest wall
  within range, lying flat against the surface it would hit).
- Plus **three smaller rings** previewing where the right-click **triangle** darts
  would land (same spread as the actual shot).

### Fixed — Dart wire + sticking
- The wire is now **anchored to the launch point** (frozen at fire time) instead
  of the live muzzle, so the line no longer shrinks/disappears when you walk
  forward — darts travel a fixed distance regardless of your movement.
- Darts now **stick to the floor**, not just walls (the ground was previously
  excluded from dart collisions).
- Darts are now **aimed at the crosshair**: they launch from the off-centre
  muzzle but converge on the camera-centred reticle target (single + all three
  triangle darts), instead of flying parallel out of the gun model and landing
  off to the side. The wire may look slightly angled as a result — that's
  expected, the accuracy matters more.

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
