[x] Step 1: Audit campaign maps for pickup/obstacle overlaps
Checked the authored campaign map data in `./src/game/maps.ts` and identified the pickup coordinates that were landing inside or too close to obstacle footprints.

[x] Step 2: Correct overlapping pickups and verify the map set
Adjusted the affected pickup positions, then added a regression test and ran targeted verification so campaign maps still satisfy the map rules.
