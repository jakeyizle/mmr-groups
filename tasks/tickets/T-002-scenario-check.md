# T-002: Scenario parser, scenarios:check, Vitest tag config

Status: ready
Milestone: M0
Scenarios: —
Depends on: T-001

## Notes

- PLAN §1 is the spec. `scripts/scenarios.ts` exports a parser returning `{ id, title, file, stretch }[]` from `scenarios/*.md`; used by both the check script and Vitest configs.
- Malformed = a `### ` heading not matching `^### [A-Z]+-\d{3}: .+$`, or an ID whose prefix differs from the file's other IDs.
- Coverage scan is static (regex over `**/*.test.ts` / `*.spec.ts`): Vitest `tags: [...]` and Playwright `tag: '@ID'` / `tag: ['@ID', ...]`.
- Shared helper for Vitest configs, e.g. `scenarioTags()` → `test.tags` entries. Check Vitest 4.1 docs for the exact `test.tags` shape; keep `strictTags` on.
- Output: errors (exit 1) vs uncovered warnings; `--strict` turns uncovered non-stretch into errors.
- Unit-test the parser and scanner (plain tests, no scenario tags).

## Done when

- `pnpm scenarios:check` runs against the current scenarios with 0 errors (all uncovered as warnings)
- A Vitest test tagged with an unknown ID fails the run
