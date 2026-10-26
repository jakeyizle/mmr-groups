# T-005: API test harness
Status: ready
Milestone: M0
Scenarios: —
Depends on: T-002, T-004

## Notes
- PLAN §10. Vitest ≥ 4.1 + `@cloudflare/vitest-pool-workers` ≥ 0.13, configured with the `cloudflareTest()` plugin (0.13 API — older `defineWorkersConfig` examples are outdated; follow current Cloudflare docs).
- Test-only wrangler config (e.g. `packages/api/wrangler.test.toml`) declaring the `DB` binding, since the Pages config has no `main`.
- Apply migrations per test file (`readD1Migrations` in config + `applyD1Migrations` in a setup file).
- Tests call `app.request(path, init, env)`.
- Include `scenarioTags()` from T-002 in this Vitest config.
- Small helpers: `seedUser`, `seedGroup`, authenticated request helper (can stub until M1 auth exists).
- First test: `/api/health` returns ok.

## Done when
- `pnpm test` runs core and API suites; the health test passes against local D1 with migrations applied
