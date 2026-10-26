# T-011: Google OAuth sign-in + site admin config

Status: ready
Milestone: M1
Scenarios: AUTH-001, AUTH-002, AUTH-005, AUTH-006, ROLE-015
Depends on: T-010

## Notes

- PLAN §7. `arctic` Google provider with PKCE; `GET /api/auth/google?returnTo=` and `/api/auth/google/callback`. State, verifier and returnTo in 10-min HttpOnly cookies.
- Upsert user by `google_sub`; set `is_site_admin` at each login from `SITE_ADMIN_EMAILS` (comma-separated), only when `email_verified`.
- Tests stub Google's token/userinfo endpoints (`vi.spyOn(globalThis, "fetch")`); no real Google calls.
- **Needs the user:** a Google Cloud OAuth client (Web) with redirect URIs `https://mmr-groups.whiterbread.workers.dev/api/auth/google/callback` and `http://localhost:5173/api/auth/google/callback`; then `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SITE_ADMIN_EMAILS` as Worker secrets (`wrangler secret put`) and in `apps/web/.dev.vars`.

## Done when

- Listed scenarios have passing tagged API tests; sign-in works on production with a real Google account
