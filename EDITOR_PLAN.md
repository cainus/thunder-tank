# Thunder Tank Editor Plan

## Goal

Build the level editor and local custom-map library as the next ambitious V1 milestone. This unlocks user-authored arenas for 1P first, then becomes the content pipeline for 2P deathmatch and co-op.

## Scope

- Add a versioned Zod map schema shared by editor, game launch, tests, and API validation.
- Build a mouse/keyboard editor canvas with freeform placement plus optional grid and angle snap.
- Add palette tools for obstacles, player spawn, enemy spawns, 2P spawns, co-op spawns, pickups, and map metadata.
- Make built-in campaign maps read-only templates.
- Save custom maps to a local Postgres-backed library through a Node/Express TypeScript API.
- Launch custom maps in 1P first; wire 2P and co-op custom-map launch after those modes exist.

## Editor UX

- Primary canvas uses the same world coordinate system as gameplay.
- Palette supports crates, barrels, barricades, sandbags, pickups, and spawn points.
- Inspector edits selected object position, rotation, type, and map metadata.
- Toolbar controls snap mode, duplicate, delete, undo, redo, test-play, save, and load.
- Validation panel lists blocking issues and warnings before save or playtest.

## Validation

- Map dimensions must be within supported bounds.
- Required spawn points must exist for the selected playable modes.
- Spawns must be clear of obstacles, bounds, and each other.
- Enemy/player starts must not be obviously trapped.
- Pickups and obstacles must stay inside map bounds.
- Object ids and schema versions must be stable.

## API And Storage

- `GET /api/maps` lists custom map summaries.
- `GET /api/maps/:id` loads full custom map JSON.
- `POST /api/maps` validates and creates a map.
- `PUT /api/maps/:id` validates and overwrites a map.
- `DELETE /api/maps/:id` deletes a map.
- `POST /api/dev/log` captures development-only frontend logs.
- Postgres table: `maps(id, title, author_label, map_data jsonb, created_at, updated_at)`.

## Delivery Plan

1. Add schema, validation helpers, and tests.
2. Add editor route/panel with static palette and canvas rendering.
3. Implement object placement, selection, move, rotate, delete, and snap.
4. Add validation panel and test-play handoff into 1P.
5. Add Express API, Postgres migration, `.env.example`, and API tests.
6. Add custom map list/load/save/delete UI.
7. Reuse custom maps from 2P and co-op once those modes are implemented.

## Acceptance Criteria

- A custom map can be created, validated, saved, loaded, edited, deleted, and launched in 1P.
- Invalid maps cannot be saved or launched without clear validation messages.
- Built-in maps remain playable and read-only.
- Build, typecheck, unit tests, API tests, and Playwright editor smoke tests pass.
