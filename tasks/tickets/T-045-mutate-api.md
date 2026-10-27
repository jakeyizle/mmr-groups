# T-045: Add api to the mutation check

Status: ready
Milestone: M8
Scenarios: —
Depends on: T-044

## Notes

- Use the runner T-043 chose. Run only related test files per mutated file (e.g. `vitest related` or a sibling-test map); `timeoutMS` above workerd boot + migrations.

## Done when

- `mutate:changed` covers `packages/api/src`; job time measured on a typical diff.
