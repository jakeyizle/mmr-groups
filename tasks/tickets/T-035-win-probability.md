# T-035: Stretch: win probability preview

Status: ready
Milestone: M5
Scenarios: MATCH-016
Depends on: T-033

## Notes

- In `MatchRowEditor`, when every slot is filled, show each team's predicted win probability (`ratingSystem(config).predictWin` on current ratings from `useReplay`). Small, muted text next to "Team N".
- E2E: fill a 2×2 row; both teams show a percentage and they sum to ~100%.

## Done when

- MATCH-016 has a passing tagged E2E; lint, typecheck, scenarios:check green
