# Thunder Tank V1 Plan

## Summary

Build a local-only browser game in `/Users/cainus/thunder-tank`: Vite + React + TypeScript for app/editor UI, Phaser 3 for gameplay, and a Node/Express TypeScript API backed by existing local Postgres. The game is a modern overhead tank shooter with local couch play only, gamepad-first gameplay/menus, keyboard fallback, no online play, and no generated art/audio.

Use third-party CC0 assets only: Kenney [Top-down Tanks Remastered](https://kenney.nl/assets/top-down-tanks-remastered), [Impact Sounds](https://kenney.nl/assets/impact-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds), and [Digital Audio](https://kenney.nl/assets/digital-audio). Vendor license/credit files with the assets.

## Key Changes

- Implement three modes:
  - **1P Campaign**: 20 authored maps, target-score deathmatch vs respawning AI; player loses if AI reaches its score limit first.
  - **2P Deathmatch**: local 1v1, score-limit respawns, shared scrolling camera.
  - **Co-op Campaign**: same campaign as 1P; P1 drives the hull, P2 rotates the turret left/right and shoots.
- Gameplay rules:
  - Twin-stick controls for solo/PvP; co-op turret uses rotate-left/right plus fire.
  - Projectiles explode on obstacle impact; no ricochet.
  - Pickups: speed boost, rapid fire, shield. All tanks can collect them; AI only collects opportunistically.
  - AI difficulty ramps by enemy count plus light/standard/heavy archetypes.
  - Shared scrolling camera follows human players, zooms out to a cap, then applies a distance leash.
- Level editor:
  - Freeform object editor with optional grid/angle snap.
  - Palette for obstacles, spawns, pickups, and map metadata.
  - Validation for spawn clearance, required spawn points, bounds, and obvious blocked starts.
  - Built-in campaign maps are read-only; editor maps are standalone arenas playable in 1P, PvP, or co-op.

## Interfaces And Data

- Backend API:
  - `GET /api/maps` list custom map summaries.
  - `GET /api/maps/:id` load full custom map JSON.
  - `POST /api/maps` publish a validated custom map.
  - `PUT /api/maps/:id` overwrite a custom map.
  - `DELETE /api/maps/:id` delete a custom map.
  - `POST /api/dev/log` for development-only frontend log capture per the webapp logging baseline.
- Postgres:
  - Use `DATABASE_URL`; provide `.env.example` with a default local `thunder_tank` database URL.
  - `maps` table stores `id`, `title`, `author_label`, `map_data jsonb`, `created_at`, `updated_at`.
  - No auth in v1; anonymous public map library is acceptable because deployment target is local machine only.
- Map JSON:
  - Versioned schema validated with Zod.
  - Freeform world coordinates, map width/height, object list, spawn points, pickup points, collision metadata, and optional campaign metadata for built-in maps.

## Test Plan

- Unit test map validation, input mapping, score rules, pickup effects, AI target selection, and projectile obstacle impact.
- API test map create/list/load/update/delete against a local test Postgres URL.
- Playwright test app boot, menu navigation, canvas nonblank render, keyboard fallback gameplay, editor create/save/load, and custom map launch.
- Manual Chrome/Edge smoke test with connected gamepads for 1P, 2P deathmatch, and co-op split controls.
- Run `typecheck`, unit tests, API tests, Playwright, and production build before handoff.

## Assumptions

- Target browsers are modern desktop Chrome/Edge/Firefox/Safari; Chrome/Edge are primary for gamepad verification.
- Menus and gameplay are gamepad-controllable; the level editor uses mouse/keyboard.
- Existing local Postgres is available, but `DATABASE_URL` is currently unset and must be configured.
- No music, mobile touch controls, online multiplayer, user accounts, generated sprites, or generated sounds in v1.
- Create `CONTEXT.md` when implementation starts, capturing resolved project terms; add a short ADR for the deliberately local anonymous Postgres map library because that choice is surprising for a couch arcade game.
