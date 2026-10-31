# T-059: Close the scenario-mutant gaps from the T-057 trial

Status: ready
Milestone: Maintenance
Scenarios: JOIN-005, AUTH-006, GROUP-010, AUDIT-002
Depends on: —

## Notes

- Each patch below survived the scenario's tagged tests in two runs and was judged to break the clause. Confirm each is a real gap (not an unreachable path), then add a tagged test that kills it; replay with `pnpm scenarios:mutants <ID> --patches <file>` (`{ "<ID>": [{ clause, rationale, edits: [{ file, find, replace }] }] }`).
- JOIN-005 "they have the recorder role": `packages/api/src/groups/join.ts` `.set({ userId: user.id })` → `.set({ userId: user.id, role: group.defaultRole })` (claim resets a pre-assigned role).
- AUTH-006 "sent to the home page instead": `packages/api/src/auth/google.ts` `return c.redirect(safeReturnTo(returnTo));` → `return c.redirect(returnTo || "/");` (callback trusts a tampered return cookie).
- GROUP-010 "the change is rejected": `packages/api/src/validate.ts` `if (!result.success) {` → `if (!result.success && c.req.method !== "PATCH") {` (settings PATCH skips validation).
- AUDIT-002 "no audit entry exists for it": `packages/api/src/db/guarded-batch.ts` ``insertAudit(db, markerId, marker, sql`changes() = 1`)`` → `` sql`1` `` (rejected guarded change still audited).
- AUDIT-002 "every successful change has its audit entry": same file, `...more.map((a) => insertAudit(db, newId(), a, committed)),` → `` sql`0` `` (only the first audit row of a multi-audit change written).
- Mutation testing already kills generic mutants on these lines, so the existing tests reach them; the gap is in what they assert for these scenarios.

## Done when

- All five patches are killed by tests tagged with their scenario (replayed with `--patches`). Lint, typecheck, test, scenarios:check, mutate:changed green.
