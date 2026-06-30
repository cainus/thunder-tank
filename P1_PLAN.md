# Thunder Tank P1-First Plan

## Summary

Build the first playable single-player vertical slice before editor, backend, PvP, or co-op work. This milestone proves the core game: one human tank vs AI tanks across three bundled campaign maps, using real third-party Kenney assets, gamepad-first controls, keyboard fallback, scoring, respawns, pickups, SFX, and minimal menus.

## Scope

- Create `P1_PLAN.md`; leave `PLAN.md` as the full V1 roadmap.
- Defer the level editor, Postgres map library, custom maps, PvP, and co-op.
- Use Vite + React + TypeScript for the shell/menus and Phaser 3 for gameplay.
- Vendor CC0 Kenney assets now:
  - Top-down Tanks Remastered
  - Impact Sounds
  - Interface Sounds
  - Digital Audio

## Gameplay Slice

- Three handcrafted bundled maps.
- Linear progression: Map 1 -> Map 2 -> Map 3.
- Winning advances to the next map; losing restarts the current map.
- Match rule: player side and AI side race to score limits.
- Player tank uses twin-stick gamepad controls, with keyboard fallback.
- AI tanks respawn and ramp over maps using light, standard, and heavy archetypes.
- Projectiles explode on obstacle impact; no ricochet.
- Pickups included now:
  - speed boost
  - rapid fire
  - shield
- All tanks can collect pickups; AI only picks them up opportunistically.

## UI

- Minimal gamepad-usable shell:
  - title screen
  - start/continue
  - pause/restart
  - win screen
  - lose screen
  - next-map flow
- Do not show disabled future mode/editor/backend entries yet.

## Acceptance Criteria

- App boots locally and starts Map 1 from the title screen.
- A connected gamepad can drive, aim, shoot, pause, restart, and advance menus.
- Keyboard fallback can complete the same flow.
- The player can win Map 1, advance to Map 2, then Map 3.
- Losing restarts the current map.
- AI tanks move, aim, shoot, die, respawn, and score.
- Pickups visibly affect tank behavior.
- Kenney sprites/SFX are used in-game; no generated assets.
- Build, typecheck, unit tests, and a basic Playwright smoke test pass.
