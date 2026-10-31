# T-056: scenarios:attribution from coveredBy

Status: ready
Milestone: M11
Scenarios: —
Depends on: —

## Notes

- PLAN §10 "Scenario fidelity", Attribution. `pnpm scenarios:attribution` reads `reports/mutation/mutation.json` from a full run (no `disableBail` needed) and writes per-scenario JSON to `reports/fidelity/`, for T-057.
- Stryker test IDs are `file#describe test name`; `includeTaskLocation` is on, so `testFiles` has locations. Map test → tags by location with `scanTestFile` (a `describe`'s tags apply to its tests; check table-driven `describe`s), or by a small Vitest reporter if that's simpler.
- Per scenario: covered source files, ranked by how few tests cover each (layout and shared components rank last). Mutants with no `coveredBy` (static) are ignored.
- Pure join/rank logic in `scripts/` with tests in the `scripts` project. `scripts/` isn't in the mutation scope, so mutate:changed checks nothing here.

## Done when

- For a handful of scenarios across core, api and web, the top-ranked files are the ones implementing them (spot-checked; listed in LOG). Lint, typecheck, test green.
