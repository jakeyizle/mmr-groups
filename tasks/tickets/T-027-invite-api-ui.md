# T-027: Invite link API + settings UI

Status: ready
Milestone: M4
Scenarios: JOIN-001, JOIN-002, JOIN-003, AUDIT-009
Depends on: —

## Notes

- PLAN §8: `PUT /groups/:gid/invite { expiresInDays? }` (re)generates, `DELETE` revokes; `invite.manage`. Code: 10+ chars of `crypto.getRandomValues` base32 (unique column already exists). Audit `invite.created` / `invite.regenerated` / `invite.revoked` (never store the code itself in the audit row; store only expiry).
- Admin audience of the snapshot gains `invite: { code, expiresAt } | null` (the T-019 hook); ETag already varies by audience.
- Settings "Invite link" section: copy-link button (`navigator.clipboard`, fallback to selectable text), expiry select (never / 1 / 7 / 30 days), regenerate, revoke.
- Extend AUDIT-009 test (and `describeEvent`) to the invite events.

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check green
