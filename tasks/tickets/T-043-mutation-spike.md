# T-043: Spike: Stryker on core + api

Status: in-progress
Milestone: M8
Scenarios: —
Depends on: —

## Notes

- PLAN §10 "Mutation testing". Install `@stryker-mutator/core` + `vitest-runner` (check Vitest 4.1 support).
- Vitest runner only supports threads/forks/vm pools and forces perTest coverage: fine for `core`, not for the `cloudflareTest` pool.
- api: mutated code reads the active mutant from host `process.env`; inside workerd (no `nodejs_compat`) it likely can't. Try command runner first; if mutants never activate, inject the mutant id via a miniflare binding / `define` (fallback A). If nothing works, stop and report (fallback B: api off the strict gate).
- Measure per-mutant time for api; check `.wrangler/state` isn't shared between concurrent sandboxes.

## Done when

- A known mutant survives a deliberately weak test and dies against a strong one, in both core and api. Runner choice + timings recorded in LOG.
