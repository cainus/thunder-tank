# Auto

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

**Debug requests, questions, and investigations:** answer or investigate first. Do not create a plan upfront — the user needs an answer, not a plan. A plan may become relevant later once the investigation reveals what needs to change.

**For all other tasks**, before writing any code, assess the scope of the actual change (not the prompt length — a one-sentence prompt can describe a large feature). Scale your approach:

- **Trivial** (typo, config tweak, single obvious change): implement directly, no plan needed.
- **Small** (a few files, clear what to do): write 2–3 sentences in `plan.md` describing what and why, then implement. No substeps.
- **Medium** (multiple components, design decisions, edge cases): write a plan in `plan.md` with requirements, affected files, key decisions, verification. Break into 3–5 steps.
- **Large** (new feature, cross-cutting, unclear scope): gather requirements and write a technical spec first (`requirements.md`, `spec.md` in `{@artifacts_path}/`). Then write `plan.md` with concrete steps referencing the spec.

**Skip planning and implement directly when** the task is trivial, or the user explicitly asks to "just do it" / gives a clear direct instruction.

To reflect the actual purpose of the first step, you can rename it to something more relevant (e.g., Planning, Investigation). Do NOT remove meta information like comments for any step.

Rule of thumb for step size: each step = a coherent unit of work (component, endpoint, test suite). Not too granular (single function), not too broad (entire feature). Unit tests are part of each step, not separate.

Update `{@artifacts_path}/plan.md` if it makes sense to have a plan and task has more than 1 big step.

### [x] Step: Investigate how obstacles are rendered today

Reviewed the rendering and asset pipeline to answer the question accurately.

- **The game is 2D, not 3D.** Thunder Tank runs on **Phaser 3** with a top-down (overhead) camera and renders everything as flat PNG sprites. There is no 3D scene graph, no WebGL model loader, and no `.glb`/`.gltf`/`.obj`/`.fbx` pipeline anywhere in the project (`PLAN.md`, `src/game/CampaignScene.ts`, `src/game/assets.ts`). So "3D models" cannot be dropped in as-is — a model would have to be pre-rendered to a top-down sprite first.
- **Obstacle types** are defined in `src/game/types.ts:21` (`ObstacleKind = "crate" | "barrel" | "barricade" | "sandbag" | "lightPost"`) and the editor set in `src/game/map-schema.ts:17` (`crate`, `barrel`, `barricade`, `sandbag`).
- **Obstacle sprites** are wired in `src/game/assets.ts:15-18` and drawn in `CampaignScene.addObstacle()` at `src/game/CampaignScene.ts:608` as `Phaser.Physics.Arcade.Image` static bodies.
- **A square obstacle already exists:** the **crate** (`crateMetal.png`), which reads as a top-down metal box. Its collider is the sprite's rectangular static body.

### [x] Step: Answer the question

**Short answer: no true 3D models, and none are needed — the game is 2D, and a square obstacle already ships (the crate).**

Details and options:

1. **Square obstacle already available today.** The `crate` obstacle (`crateMetal.png`) is square and is placeable from the level editor and in campaign maps. If the goal is simply "a square obstacle," it is already there — no new asset required.

2. **Other square-footprint art in the existing CC0 set** (already vendored under
   `public/assets/kenney/top-down-tanks/PNG/Retina/`, so free to add without new
   downloads or licensing work):
   - `crateWood.png`, `crateMetal_side.png`, `crateWood_side.png` — additional crate looks.
   - `tileGrass1/2.png`, `tileSand1/2.png` and the road/transition tiles — square ground tiles (decorative, not collidable by default).
   These are all part of Kenney *Top-down Tanks Remastered*, matching the project's **CC0-only, no-generated-art** asset policy (`PLAN.md`).

3. **About actual 3D models.** The project deliberately uses a 2D Phaser renderer, so importing a 3D model (Three.js `.glb`, Kenney's 3D kits, etc.) would be a large architecture change, not an asset swap. If a "3D look" is wanted, the practical, in-style path is a pre-rendered top-down sprite that reads as a chamfered/beveled box (the crate already does this), kept as a square PNG with a rectangular collider.

**Recommendation:** treat this as answered — use the existing **crate** for square obstacles, and optionally add the wood-crate variants above if more visual variety is desired. If the user actually wants a full 3D renderer, that is a separate, much larger effort and should be scoped as its own task before any code changes.

_No code changes were required for this investigation/question task._
