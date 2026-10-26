# T-006: Playwright harness + test-login route

Status: ready
Milestone: M0
Scenarios: AUTH-008
Depends on: T-004, T-005

## Notes

- PLAN §7 (test login), §10 (E2E). `e2e/` with Playwright projects Pixel 7 (Chromium) and iPhone 14 (WebKit); `webServer` starts a production build under `vite preview` with a fresh local D1 (migrations applied) and `ENABLE_TEST_LOGIN=true`.
- `POST /api/test/login { name, email }`: upserts a user, creates an `auth_sessions` row, sets the session cookie (cookie format per PLAN §7 — put session helpers in `packages/api/src/auth/` so M1 reuses them).
- Exclusion from production: find a mechanism that removes the route from production builds (e.g. a Vite `define` in the Worker build). If none is clean, fall back to registering the route only when `env.ENABLE_TEST_LOGIN === 'true'` and rely on the post-deploy smoke test in T-007. Either way the handler also checks the env var.
- AUTH-008 is verified by an API test (route absent/404 without the flag) and the T-007 smoke test against production.
- One E2E smoke test: test-login, then load the home page.

## Done when

- `pnpm e2e` passes locally on both projects; AUTH-008 tagged test passes
