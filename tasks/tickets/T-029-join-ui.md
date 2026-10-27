# T-029: Join flow UI

Status: ready
Milestone: M4
Scenarios: JOIN-004, JOIN-005, JOIN-006, JOIN-008, JOIN-009, JOIN-010, GROUP-008, PLAYER-008, ROLE-005
Depends on: T-028

## Notes

- `/join/$code`: `requireUser` (returns here after sign-in, AUTH-005); list unclaimed players as big tap targets, "I'm not listed" → name input; existing members redirect to the group; invalid → friendly message.
- Leave group button in settings for non-owners (AlertDialog); owner sees "transfer ownership first".
- E2E with two browser contexts now that a second linked member is possible: join + claim, add self, leave; and the deferred M1 UI tests: transfer ownership (GROUP-008), unlink (PLAYER-008), grant/revoke admin (ROLE-005).

## Done when

- Listed scenarios have passing tagged E2E; lint, typecheck, scenarios:check green
