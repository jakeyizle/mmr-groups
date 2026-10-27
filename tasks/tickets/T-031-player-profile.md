# T-031: Player profile UI

Status: ready
Milestone: M5
Scenarios: STATS-001, STATS-002, STATS-003, STATS-004, STATS-005
Depends on: T-030

## Notes

- `/g/$gid/players/$pid`, linked from leaderboard rows and history names. Sections: rating chart, record & streaks, best/worst partners, head-to-head, 10 recent matches (reuse the history card; link to `?player=` for all).
- Recharts (pin an older-than-a-day release), lazy-loaded with the route (autoCodeSplitting) so the leaderboard bundle stays small. Line chart sized for 375 px; dates on the x-axis.
- E2E: seeded history → profile shows record numbers, a partner, a head-to-head line, 10 recent items; chart renders an SVG path.

## Done when

- Listed scenarios have passing tagged E2E; lint, typecheck, scenarios:check green
