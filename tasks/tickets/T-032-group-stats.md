# T-032: Group stats UI

Status: ready
Milestone: M5
Scenarios: STATS-006, STATS-007, STATS-008, STATS-009, STATS-010, STATS-011
Depends on: T-030, T-031

## Notes

- `/g/$gid/stats`: multi-line rating chart (top ~8 players by default, legend toggles the rest), weekly activity bars (12 weeks) + most active list, best duos, biggest upsets (link to match), longest streaks, rating histogram (buckets of 50).
- Reuse the chart setup from T-031. Empty states for small groups ("needs 3 shared matches" etc.).
- E2E: seeded history renders each section with expected first entries.

## Done when

- Listed scenarios have passing tagged E2E; lint, typecheck, scenarios:check green
