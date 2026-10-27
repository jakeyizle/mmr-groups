# T-036: Public group access end-to-end

Status: ready
Milestone: M6
Scenarios: VIS-001, VIS-002, VIS-003, VIS-004, VIS-008
Depends on: —

## Notes

- Mostly verification: API tests that every `/groups/:gid/*` endpoint returns the identical 404 body for a private group (signed out, non-member) and a missing id (VIS-001); non-member mutations on a public group get 403 (VIS-003); flipping to private cuts access on the next request (VIS-004; the ETag varies by audience, so no stale 200 from cache).
- E2E signed out on a public group: leaderboard, history, profile, stats and team generator render; no Record/Edit/Settings controls (VIS-002/003). Hide the Settings and Audit tabs for non-members.
- VIS-008: demo groups (`is_demo`) can't be joined (`claim` 403) and only site admins can change them. Non-members already can't; add the claim guard and a test.

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check green
