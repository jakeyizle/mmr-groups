# T-046: Mutation audit: core

Status: in-progress
Milestone: M8
Scenarios: —
Depends on: —

## Notes

- `pnpm mutate --mutate "packages/core/src/**/*.ts,!**/*.test.ts"` (2934 mutants). Per PLAN §10, each survivor → test (tag its scenario), reasoned disable, or delete dead code.
- `schemas.ts` is mostly static (module-level zod): each static mutant runs every test.

## Done when

- 0 Survived / NoCoverage in core; LOG has before/after score.
