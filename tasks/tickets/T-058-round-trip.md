# T-058: Optional: round-trip clause check

Status: ready
Milestone: M11
Scenarios: —
Depends on: T-057

## Notes

- PLAN §10 "Scenario fidelity", Round-trip. `pnpm scenarios:roundtrip <IDs…>`; results to `reports/fidelity/`, read by `scenarios:mutants` to target flagged clauses first.
- Collect: `scanTests` gives each tag's file and line; extract the enclosing `test`/`describe` with the TypeScript compiler API, plus helpers it calls (`packages/api/test/helpers.ts`, `apps/web/test/render.tsx`, `e2e/auth.ts`, `e2e/seed.ts`). Strip test titles, `describe` names and comments (they restate the scenario), keeping placeholders.
- Call 1 (no scenario text): the Given/When/Then the tests verify, each Then citing an assertion's file:line. Call 2: each real Then/And clause → verified | partial | missing, with evidence. Structured output.
- Calibrate: hand-label ~20 scenarios (mix of levels, include a few known weak ones); run each 3×.
- Worth it only if it finds survivors T-057 alone missed or saves its runs; say which in LOG.

## Done when

- Command works for a list of IDs. False alarms, misses, run-to-run agreement and cost per scenario recorded in LOG, with a keep/drop verdict.
