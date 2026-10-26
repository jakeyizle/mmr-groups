# Log

`T-NNN | YYYY-MM-DD | one-line summary` (find the commit with `git log --grep T-NNN`)

- T-001 | 2026-10-25 | pnpm 12 monorepo, TS 6 strict base, ESLint type-aware + Prettier, core package with Vitest 4.1
- T-002 | 2026-10-25 | scenario parser, `scenarios:check` (`--strict`), root Vitest config with scenario tags + projects
- T-003 | 2026-10-25 | moved hosting Pages → Workers static assets; Hono `/api/health` on D1, single-process `vite dev`, deployed
- T-004 | 2026-10-25 | Drizzle schema + `0000_init` migration (local, preview, prod), core domain types + monotonic `newId`
- T-005 | 2026-10-25 | API tests in workerd via `@cloudflare/vitest-plugin` (renamed from pool-workers), per-file migrations, seed helpers
- T-008 | 2026-10-25 | `guardedBatch`: changes()-guarded audit row as commit marker; stale/concurrent writes, claim race, batch rollback verified
- T-006 | 2026-10-25 | Playwright (Pixel 7, iPhone 14) on `vite preview --mode e2e` with fresh D1; test login compiled out of prod; session helpers
- T-009 | 2026-10-25 | core `can()` / `validRoleFor()` over the role matrix; site admins as owner; table-driven tagged tests
- T-010 | 2026-10-25 | session validate/extend/invalidate, `/me`, logout, CSRF + mutations-need-user middleware, error helper
