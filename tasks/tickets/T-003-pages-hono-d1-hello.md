# T-003: Pages + Hono + D1 "hello", deployed
Status: ready
Milestone: M0
Scenarios: —
Depends on: T-001

## Notes
- PLAN §4. `apps/web`: Vite + React + TS minimal page that calls `/api/health` and shows the result.
- `packages/api`: Hono app exporting `app` and `type AppType`; `GET /api/health` runs `select 1` on D1 and returns `{ ok: true }`.
- `apps/web/functions/api/[[route]].ts` → `handle(app)` from `hono/cloudflare-pages`.
- `apps/web/wrangler.toml`: `pages_build_output_dir`, D1 binding `DB` for production and a separate preview database.
- Needs the user: Cloudflare account + `wrangler login`, and creating the Pages project and both D1 databases (`wrangler d1 create`). Ask before running account-level commands.
- Local dev: `pnpm dev` runs Vite with the API reachable (via `wrangler pages dev` proxying Vite, or Vite proxy to `wrangler pages dev`; pick the simpler one that works).

## Done when
- `https://<project>.pages.dev` shows the page and `/api/health` returns `{ ok: true }` from D1
- Same works locally with `pnpm dev`
