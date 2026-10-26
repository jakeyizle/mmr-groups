# T-010: Sessions, /me, logout, CSRF, auth middleware

Status: ready
Milestone: M1
Scenarios: AUTH-003, AUTH-004, AUTH-007
Depends on: —

## Notes

- PLAN §7. Extend `packages/api/src/auth/session.ts` (from T-006): `validateSession` (hash cookie token, look up, reject expired, extend only when < 15 days remain), `invalidateSession`, clear cookie.
- Middleware: resolve `user` (or null) on every request; `requireUser` → 401. CSRF guard on all non-GET: require `Content-Type: application/json` and `X-Requested-With: fetch`, else 403 (test login too; the E2E helper already sends the header).
- `GET /api/me` → `{ user: { id, name, email, isSiteAdmin } | null }`. Only /me returns an email.
- `POST /api/auth/logout`.
- Error helper producing `{ error: { code, message, details? } }` (PLAN §8), shared by later routes.
- Tests sign in via `createSession` directly; add an authenticated request helper to `packages/api/test/helpers.ts`.

## Done when

- Listed scenarios have passing tagged API tests; lint, typecheck, scenarios:check green
