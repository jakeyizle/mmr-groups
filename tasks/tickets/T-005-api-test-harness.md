# T-005: API test harness

Status: ready
Milestone: M0
Scenarios: —
Depends on: T-002, T-004

## Notes

- PLAN §10. Vitest ≥ 4.1 + `@cloudflare/vitest-pool-workers` ≥ 0.13, configured with the `cloudflareTest()` plugin (0.13 API — older `defineWorkersConfig` examples are outdated; follow current Cloudflare docs).
- Point `cloudflareTest()` at `apps/web/wrangler.jsonc` (it has `main` and the `DB` binding); no separate test config needed.
- Apply migrations per test file (`readD1Migrations` in config + `applyD1Migrations` in a setup file).
- Tests call `app.request(path, init, env)`.
- Add an `api` project (`extends: true`, so it inherits scenario tags) to the root `vitest.config.ts`; if the plugin can't live in an inline project, use a file project and pass `tags: scenarioTags()` there.
- Small helpers: `seedUser`, `seedGroup`, authenticated request helper (can stub until M1 auth exists).
- First test: `/api/health` returns ok.

## Done when

- `pnpm test` runs core and API suites; the health test passes against local D1 with migrations applied
