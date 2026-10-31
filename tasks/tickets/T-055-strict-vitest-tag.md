# T-055: scenarios:check --strict requires a Vitest tag

Status: ready
Milestone: M11
Scenarios: —
Depends on: —

## Notes

- PLAN §10 "Scenario fidelity", E2E seam. `scripts/check-scenarios.ts` counts any tag as coverage, Playwright included; Stryker only sees Vitest. Today 0 of 158 required scenarios are E2E-only, so this only locks that in.
- Under `--strict`, a required scenario whose only tags are in `e2e/` is an error ("e2e-only"); without `--strict`, a warning, like "uncovered".
- Split the decision into a pure function in `scripts/scenarios.ts` and test it in `scripts/scenarios.test.ts`.

## Done when

- An E2E-only scenario fails `scenarios:check --strict`. Lint, typecheck, test, `scenarios:check --strict` green.
