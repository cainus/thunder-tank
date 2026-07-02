# Plan

### [x] Step: Inspect tank movement and existing ground effects
Confirmed tank movement is handled in `./src/game/CampaignScene.ts` and that tread marks already spawn from the rear of moving tanks, making that scene the right place to add a matching dust effect.

### [x] Step: Add dust puffs behind moving tanks
Implemented a lightweight dust trail in `./src/game/CampaignScene.ts` that spawns small fading dust puffs behind each moving tank based on actual velocity, with scaling that matches larger tanks and resets cleanly on destroy/respawn.

### [x] Step: Verify the change
Verified the change with `npm run typecheck`, `npm test`, and `npm run build`.
