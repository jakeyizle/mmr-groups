# T-047: Mutation audit: api auth, db and misc

Status: ready
Milestone: M8
Scenarios: —
Depends on: T-046

## Notes

- Scope: packages/api/src/{auth,db}/**, packages/api/src/*.ts. Same rules as T-046. api ≈ 3.6 s/mutant at concurrency 4: run per subdirectory in the background.

## Done when

- 0 Survived / NoCoverage in scope; LOG has before/after score.
