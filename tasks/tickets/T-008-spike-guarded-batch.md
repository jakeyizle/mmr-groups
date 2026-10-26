# T-008: Spike — guarded-batch optimistic concurrency in D1
Status: ready
Milestone: M0
Scenarios: —
Depends on: T-004, T-005

## Notes
- PLAN §5 "Optimistic concurrency". Verify in the API harness (local D1) that within one `db.batch()`:
  - `UPDATE matches … WHERE id = ? AND version = ?` followed by `INSERT INTO audit_events … SELECT … WHERE changes() = 1` and `UPDATE groups SET version = version + 1 WHERE id = ? AND <guard>` writes nothing when the version is stale, and everything when it's current.
  - Note `changes()` refers to the immediately preceding statement — design the guard chain accordingly (or guard each statement by re-checking `matches.version = ? + 1`).
  - Same for DELETE.
- Fallback if `changes()` doesn't behave: a trigger that `RAISE(ABORT)`s on mismatch (aborts the whole batch), or re-check by version predicate.
- Also confirm claim race: `UPDATE players SET user_id = ? WHERE id = ? AND user_id IS NULL` + unique index behaves as first-wins.
- Output: a small reusable helper (e.g. `guardedBatch`) with tests, and update PLAN §5 only if the chosen pattern differs.

## Done when
- Tests demonstrate stale writes change nothing and current writes apply atomically; helper is ready for M2/M3
