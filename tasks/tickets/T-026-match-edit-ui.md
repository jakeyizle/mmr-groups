# T-026: Match detail/edit UI, stale-edit handling

Status: ready
Milestone: M3
Scenarios: EDIT-010
Depends on: T-025

## Notes

- `/g/$gid/matches/$mid`: read view (teams, scores, rating changes, notes, recorded by, date) and, behind `can(match.edit)`, an edit form reusing the batch row editor (`MatchRowEditor`; extract it so it works on a single-row form) plus delete behind an AlertDialog.
- Send `If-Match` with the version the form was opened at; on 412 refetch the snapshot, show "This match changed while you were editing" with the current values, keep the user's edits available to re-apply (or simply reset; pick the simpler one and say so in the ticket log).
- History cards link to the detail page.
- E2E: edit a winner and see the leaderboard change; stale edit from a second context gets the conflict message (EDIT-010).

## Done when

- EDIT-010 has a passing tagged E2E; edit + delete covered by E2E; lint, typecheck, scenarios:check green
