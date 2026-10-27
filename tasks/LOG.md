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
- T-012 | 2026-10-25 | groups API (list/create/settings/delete/transfer), access middleware, core Zod schemas, `auditedBatch`
- T-013 | 2026-10-25 | players API (batch add with all-or-nothing 200 cap, rename/role, delete unless in matches, unlink); guarded writes throughout
- T-014 | 2026-10-25 | TanStack Router/Query shell, Tailwind 4 + shadcn, typed Hono RPC client (D1Database imported, not global), auth guard, `<Can>`; ROLE-008 tests land with T-015/T-016
- T-015 | 2026-10-25 | home group list, create form, group layout + tabs, settings with owner-only delete/transfer; typed `unwrap` over RPC responses
- T-016 | 2026-10-25 | players & roles settings: multi-add, rename, role (filtered by `can`/`validRoleFor`), remove, unlink; opaque header
- T-007 | 2026-10-26 | CI on PRs (checks, E2E, `pr-<n>` preview alias on preview Worker); main migrates, deploys preview + prod, smoke-tests AUTH-008 live
- T-011 | 2026-10-26 | Google sign-in (arctic, PKCE, flow cookies scoped to /api/auth/google); upsert by sub, site admin from verified email each login; safe returnTo; login error message
- T-017 | 2026-10-26 | core `replay()` over openskill (PL) with pre-match + as-of decay, `(playedAt, id)` order, display/provisional, `DEFAULT_RATING_CONFIG`
- T-018 | 2026-10-26 | core `matchInputSchema`/`batchSchema` (shape, limits) + `validateMatch` (format, duplicates, scoring mode, competition ranks from scores or chosen placements, ties, ≤24 h ahead, UTC)
- T-019 | 2026-10-26 | snapshot adds matches `(playedAt, id)`; public/member/admin serializers (public: names only, no recorders); ETag `"<version>-<audience>"` + 304
- T-020 | 2026-10-26 | `POST /groups/:gid/matches` batch: schema + `validateMatch` per match + group-player check, 400 with `matches.<i>…` paths, one `auditedBatch` with a `match.created` per match
