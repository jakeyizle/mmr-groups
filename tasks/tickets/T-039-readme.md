# T-039: README

Status: ready
Milestone: M6
Scenarios: —
Depends on: T-037

## Notes

- PLAN §13: the only README. What it is (one paragraph), live + demo links, one mobile screenshot (`docs/`-free: put it in `apps/web/public/readme.png` or `.github/`), stack list, run/test/deploy commands (`pnpm dev`, `pnpm test`, `pnpm e2e`, `pnpm scenarios:check`), how requirements work (scenarios → tagged tests → `scenarios:check`), pointers to `PLAN.md` and `tasks/`.
- Local setup: `.dev.vars` keys (names only), `pnpm db:migrate:local`, the Google redirect URI for localhost.
- Keep it short; no duplicated spec.

## Done when

- README renders on GitHub with working links and screenshot
