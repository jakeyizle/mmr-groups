# T-028: Claim/join API, leave

Status: ready
Milestone: M4
Scenarios: JOIN-004, JOIN-005, JOIN-006, JOIN-007, JOIN-008, JOIN-009, JOIN-010, JOIN-011, JOIN-013, AUDIT-010
Depends on: T-027

## Notes

- PLAN §8: `GET /invites/:code` (signed-in; group name + unclaimed players, or `{ member: true, groupId }` for existing members, JOIN-008); `POST /invites/:code/claim { playerId } | { newPlayerName }`; `POST /groups/:gid/leave`.
- Invalid, revoked and expired codes all give the same 404 (JOIN-009).
- Claim: `guardedBatch` guarded by `UPDATE players SET user_id = ? WHERE id = ? AND user_id IS NULL` (JOIN-013: the loser gets 409 `claim_lost`). Claimed role stays as pre-assigned. New player: default role, name uniqueness (409 `name_taken`), 200-player cap like T-013. Both rely on `players_group_user_uq` against double membership.
- Leave: owner gets 409 `owner_must_transfer` (JOIN-011); admins reset to the default role (PLAN §3), same as unlink. Matches stay attached to the now-unclaimed player.
- Audit `player.claimed`, `player.joined`, `player.left`; extend AUDIT-010 test and `describeEvent`.

## Done when

- Listed scenarios have passing tagged API tests; lint, typecheck, scenarios:check green
