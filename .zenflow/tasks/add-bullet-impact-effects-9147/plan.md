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

### [x] Step: Review current bullet collision handling
- Confirmed bullet impacts were only spawning the shared explosion sprite on obstacle and tank hits.
- Identified `./src/game/CampaignScene.ts` as the only gameplay scene that needed the effect wiring.

### [x] Step: Add richer impact feedback for bullet collisions
- Added generated flash, ring, and spark textures for impact feedback without introducing new asset files.
- Wired directional impact bursts into obstacle, hull, and shield collisions while keeping existing explosion and damage flow intact.

### [x] Step: Verify the implementation
- Checked the updated scene logic for bullet-hit paths, texture setup, and effect cleanup.
- Validation was completed with project typecheck and automated tests.

### [x] Step: Investigate invisible impact feedback
- Found the impact flash/ring/sparks were rendering underneath the explosion sprite, making the new effect hard to notice in live play.
- Confirmed the fix should focus on render order and stronger timing/scale rather than gameplay collision logic.

### [x] Step: Make bullet impacts clearly visible
- Reordered the impact/explosion spawn so the impact burst renders on top of the explosion.
- Increased impact flash, ring, and spark depth, opacity, scale, and tween duration to make hits read clearly during gameplay.

### [x] Step: Re-verify the visibility fix
- Re-checked the collision destruction path and impact tween settings in `./src/game/CampaignScene.ts`.
- Validation was completed again with project typecheck and automated tests.

### [x] Step: Add lingering bullet impact marks
- Added a generated `impactMark` texture and a short-lived impact mark system so non-shield hits leave a brief scorch mark on the arena.
- Wired impact mark lifecycle updates into the scene update loop and cleanup paths so the marks fade out automatically.

### [x] Step: Verify lingering impact marks
- Re-checked the impact rendering flow, mark cleanup, and scene reset/shutdown cleanup in `./src/game/CampaignScene.ts`.
- Validation was completed with project typecheck and automated tests.
