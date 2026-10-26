# T-007: GitHub Actions CI/CD
Status: ready
Milestone: M0
Scenarios: AUTH-008
Depends on: T-003, T-005, T-006

## Notes
- PLAN §11. Workflows: `ci.yml` on PRs (lint, typecheck, test, `scenarios:check`, E2E, preview deploy) and `deploy.yml` on `main` (same checks → migrate production, then preview → deploy production → smoke test).
- Smoke test after production deploy: `/api/health` is 200 and `POST /api/test/login` is 404 (AUTH-008, tag it).
- Cache pnpm store and Playwright browsers.
- Use `cloudflare/wrangler-action`; secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Needs the user: GitHub repo + remote, the API token (scopes: Pages edit, D1 edit), repository secrets. Ask before creating the repo or pushing.
- Branch protection on `main` requiring CI (optional; ask).

## Done when
- A PR runs all checks and gets a preview URL; merging to `main` deploys production and the smoke test passes
