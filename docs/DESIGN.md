# Top-Down Zombie Survival — Design Doc

> Slice 1 design. The goal of this slice is the smallest playable survival loop:
> a player running around a bounded arena, swinging a melee weapon to kill
> zombies that chase and bite, with a HUD and a death state. Everything here
> is the contract the implementation has to satisfy.

## 1. Core Gameplay Loop

The player runs around a bounded arena with WASD, rotates to face the mouse
cursor (twin-stick feel), and swings a melee weapon on left-click to cut
through zombies that endlessly spawn and close in. Survive as long as possible;
each hit to a zombie is a kill on the scoreboard, each bite is HP gone, and
death ends the run and shows the final stats.

## 2. Player

- **Movement**: top-down, WASD relative to the world (W = forward / -Z).
  Movement is on the XZ plane; the player does not jump, and gravity is
  irrelevant.
- **Facing**: the character mesh rotates around the Y axis to face the cursor's
  world position on the ground plane. This gives the twin-stick feel: movement
  direction is independent from aim direction.
- **Primary attack (slice 1)**: left-click triggers a melee swing. The swing is
  an arc in front of the player, roughly a 90° cone out to a short radius
  (~2.0 units). Zombies hit by the swing die. The swing has a fixed cooldown
  (e.g. 0.4s) during which further clicks are ignored.
- **Stats**:
  - Health: `100` HP, single value, no regen in slice 1.
  - Move speed: ~5 units/second (tunable; see open questions).
  - Hit radius: ~0.5 unit sphere for collision.
  - No stamina, no ammo, no weapon swap in slice 1.

## 3. Camera

- Top-down with a fixed tilt of **~60° off vertical** (so ~30° down from the
  top). This sits in the requested 60–70° band and gives enough perspective to
  read depth without becoming isometric.
- **Follow**: the camera position is anchored to the player with a small offset
  (camera "up" along the world Z and Y based on the tilt) so it always sits
  behind-and-above the player.
- **Look-ahead**: the follow target is offset in the cursor direction by a
  short distance (~2–3 units) so the camera leans slightly toward where the
  player is aiming.
- **No manual camera rotation** in slice 1. The tilt and the world-up vector
  are constants.

## 4. Enemies — Zombies

- **Mesh**: upright capsule, muted green/grey, shambling walk cycle is out of
  scope (just slide forward for slice 1).
- **Behavior**:
  - Idle outside aggro range; once the player enters aggro range (~25 units),
    the zombie locks on and walks toward the player.
  - Walk speed: ~2 units/second (slower than the player so the player can
    kite).
  - On contact with the player, deals contact damage on a short cooldown
    (e.g. 10 HP every 1.0s as long as they overlap).
- **Death**: when a zombie's HP hits 0 (1 HP in slice 1 — one swing kills),
  it plays a brief flatten/sink animation (scale Y toward 0 over ~0.3s) and
  is then despawned and removed from the entity list.
- **Spawning (slice 1)**:
  - Ambient spawn around the player at intervals. Spawn point is a random
    position on a ring outside aggro range but inside the arena, clamped to
    the arena bounds and not inside an obstacle.
  - Spawn rate and target zombie count ramp slowly over time:
    - Start: 1 zombie every ~3.0s, soft cap ~10 concurrent zombies.
    - Ramp: every 30s of survival, halve the interval (floor at 0.5s) and
      raise the cap by 5.
  - No wave structure in slice 1. It's a single endless survival run.

## 5. World

- **Arena**: 50 × 50 unit square, centered on the origin.
- **Floor**: flat ground plane (single mesh, no terrain).
- **Walls**: 4 perimeter walls around the arena, treated as solid AABBs. Wall
  height ~3 units. They keep zombies and the player inside.
- **Obstacles**: a handful (8–12) of crate/barrel boxes scattered around the
  arena, also solid AABBs. They provide cover (zombies and player can route
  around them) and visual interest. Layout is deterministic per run (seeded)
  so the arena is recognizable.

## 6. HUD

DOM overlay on top of the canvas. Three pieces:

- **Health bar**: top-left, fixed width, fills left-to-right as a fraction of
  current/max HP. Color shifts from green to red as HP drops.
- **Kill count**: top-left under the health bar, plain number, "Kills: N".
- **Survival timer**: top-right, monospace, "MM:SS".

**Death state**: when the player's HP hits 0, the game transitions to DEAD.
The HUD dims, and a small centered game-over panel appears with:

- "You died"
- Final kill count
- Final survival time
- "Restart" button (resets the run, returns to PLAYING)

The panel is plain DOM; no styling framework.

## 7. Technical Choices

- **Rendering**: vanilla `three` meshes for everything in slice 1, including
  zombies. We switch to `InstancedMesh` only if profiling on slice 1 shows
  draw-call cost is actually a problem. No premature optimization.
- **Lighting**: ambient + a single directional light, shadows on the player
  and zombies, off for obstacles/walls in slice 1 if perf needs it.
- **Collision**:
  - Zombies vs player, zombie vs zombie: sphere-vs-sphere. Simple and
    cheap; resolves by pushing the smaller entity out along the contact
    normal.
  - Player vs walls, player vs obstacles, zombie vs walls, zombie vs
    obstacles: AABB-vs-sphere. Walls/obstacles are stationary AABBs.
  - No physics engine (no cannon, no rapier, no ammo.js).
- **Game loop**: fixed-timestep update with variable-timestep render.
  - Fixed update step: `1/60s` (~60 Hz).
  - Use a small accumulator pattern: accumulate `delta` from
    `requestAnimationFrame`, run as many fixed `update(dt)` ticks as fit,
    then call `render()`. Clamp the accumulator (e.g. max 0.25s) to avoid
    the spiral-of-death on tab switch.
  - Render uses the latest interpolated state (snapping is fine at 60 Hz).
- **Project structure**:

  ```
  src/
    main.js     # boot: scene, renderer, hooks game loop into rAF
    game.js     # game state machine (PLAYING/DEAD), entity lists,
                # spawn tick, score, timer, restart
    player.js   # player mesh, movement, facing, melee swing, HP
    zombie.js   # zombie entity: mesh, chase AI, contact damage, death anim
    world.js    # arena floor, walls, obstacles, deterministic layout
    input.js    # keyboard state, mouse buttons, screen-to-world raycast
                # for the cursor's ground position
    hud.js      # DOM HUD updates + game-over panel
    camera.js   # top-down follow camera with look-ahead
  ```

- **State**: a single `game` object holds:
  - `state`: `"PLAYING" | "DEAD"`
  - `player`, `zombies[]`, `obstacles[]`, `walls[]`
  - `score` (kills), `time` (survival seconds)
  - `spawnTimer`, `elapsed` for ramp
  No external state library, no Redux, no event bus beyond plain function
  calls.

- **Cursor → world**: `input.js` casts a ray from the camera through the
  mouse NDC onto the ground plane (Y = 0) and stores the hit point. Player
  facing and camera look-ahead both read this point.

## 8. Recommended First PR Scope (Slice 1)

Ship the minimum playable slice. Concretely, this PR-equivalent scope
includes:

- `src/main.js`, `game.js`, `player.js`, `zombie.js`, `world.js`,
  `input.js`, `hud.js`, `camera.js` per section 7.
- Player controller (WASD movement, cursor-facing, melee swing).
- Top-down follow camera with cursor look-ahead.
- Arena floor, 4 perimeter walls, 8–12 obstacle boxes.
- Zombie spawn loop with time-based ramp, chase AI, contact damage.
- Melee swing kills zombies in a front arc.
- Player HP and death state.
- DOM HUD: health bar, kill count, survival timer, game-over panel with
  restart.
- Fixed-timestep update + variable-timestep render loop.

### Explicitly out of scope for slice 1

- Audio (no SFX, no music).
- Models or assets beyond primitive geometry (no GLTF, no textures, no
  sprites).
- Pickups (health, weapons, ammo).
- Weapons beyond the basic melee swing.
- Day/night cycle, weather, fog tweaks.
- Multiplayer / networking.
- Save / load, persistent stats, leaderboards.
- Mobile / touch controls.

## 9. Sensible Defaults (where the spec leaves a choice)

These are the values the implementation will use unless we change them in
review:

- Player move speed: 5.0 u/s.
- Player hit radius: 0.5 u.
- Melee swing: 90° cone, 2.0 u range, 0.4s cooldown, 1-hit kill on zombie.
- Camera tilt: 60° off vertical.
- Camera follow height: derived from tilt so the player sits roughly in
  the lower-third of the viewport.
- Camera look-ahead distance: 2.5 u toward the cursor.
- Zombie move speed: 2.0 u/s.
- Zombie aggro range: 25 u.
- Zombie contact damage: 10 HP per 1.0s while overlapping.
- Zombie spawn: starts at 1 every 3.0s, cap 10; every 30s, interval ×0.5
  (floor 0.5s), cap +5.
- Arena size: 50 × 50 units, walls 3 u tall, 10 obstacle boxes seeded
  with `mulberry32(0xDEADBEEF)` so the layout is reproducible.
- Color palette: floor `#3a3a3a`, walls `#5a4a3a`, crates `#6b5a3a`,
  player `#d0d0d0`, zombies `#5a7a4a`, ambient light intensity 0.5,
  directional light intensity 0.8 from above-front.

## 10. Open Questions

- **Zombie health**: one-shot kill for slice 1, or 2–3 HP so the player
  sometimes has to swing twice? Right now the spec says "slice 1 melee
  kills zombies in front arc" which implies 1-hit, but a tiny bit of
  damage variance might feel better.
- **Player invulnerability frames**: should the player have a short i-frame
  window after taking damage to avoid being instakilled by a zombie
  pile-on? Slice 1 spec only says "deal contact damage on a short
  cooldown," not what the player does about it.
- **Camera distance / FOV**: how far back does the camera sit, and what
  FOV gives the best readability at 60° tilt? This affects how much of
  the arena is on-screen at once.
- **Obstacle destructibility**: are crates/barrels purely cover, or do
  they break? Slice 1 says cover and visual interest only, but worth
  pinning down before implementation.
- **Zombie pathing**: pure straight-line chase (gets stuck on corners) vs.
  simple obstacle avoidance (e.g. steering around AABBs). The latter is
  more polish but more work; can be deferred if it eats slice 1 scope.
- **Pause behavior**: does the survival timer freeze when the tab loses
  focus? Slice 1 doesn't say. The accumulator clamp will prevent update
  spiral, but the timer policy is a separate question.