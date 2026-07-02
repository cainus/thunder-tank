### [x] Step: Add tank tread mark rendering
Implement tread mark spawning in the gameplay scene so moving tanks leave paired ground tracks behind them. Keep the marks visually below tanks and obstacles and make each mark expire after one minute.

### [x] Step: Verify lifetime behavior
Add a focused regression test around tread-mark timing helpers and run the relevant test suite to confirm the one-minute lifetime behavior remains correct.
