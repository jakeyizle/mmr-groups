# T-054: Type stubApi handlers from AppType

Status: ready
Milestone: M11
Scenarios: —
Depends on: —

## Notes

- PLAN §10 "Scenario fidelity", E2E seam. `stubApi` (`apps/web/test/render.tsx`) handlers are `(body: unknown) => unknown`, so a stub can return a body the real API never sends and web tests still pass.
- Type each handler's return from `AppType` with the success status: `InferResponseType<…, 200>` (or 201 etc.). Without a status it's the union of every status's body, so error bodies would type-check as success.
- Keys are `"METHOD /path"` with concrete IDs; type by route pattern (`/api/groups/:gid`) and match paths with a small matcher (new helper logic: test it), or add typed per-route helpers. Pick what keeps call sites short.
- Keep a `Response` escape hatch for error and malformed-response tests.

## Done when

- A stub returning a body that doesn't match its route's success response fails typecheck. Stubs that had drifted are fixed and listed in LOG. Lint, typecheck, test, mutate:changed green.
