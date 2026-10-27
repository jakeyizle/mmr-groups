# T-037: Demo seed script + deploy wiring

Status: ready
Milestone: M6
Scenarios: VIS-005, VIS-008
Depends on: T-036

## Notes

- PLAN §12. `scripts/seed-demo.ts`: deterministic (mulberry32, fixed seed) "Demo Pickleball League": fixed group id `demo`, public, `is_demo`, no owner, 12 unlinked players with hidden true skill, 16 weeks of 2v2 (a few sessions a week, ~4–6 matches each, ending "last week" relative to a fixed anchor so tests are stable) with plausible 11-point scores. Outputs SQL (`INSERT … ON CONFLICT DO NOTHING`), chunked under D1's 100-variable limit.
- `pnpm db:seed:demo --local|--remote [--env preview]` writes the SQL to a temp file and runs `wrangler d1 execute --file`. Deploy workflow: seed preview and production after migrations (idempotent).
- Landing page links to `/g/demo`. E2E seeds the local DB in `serve.ts` and checks the link, 12 players, signed-out access (VIS-005).
- Unit-test the generator: same seed → identical output; 12 players; matches span 16 weeks; all 2v2.

## Done when

- Listed scenarios have passing tagged tests; demo visible on production; lint, typecheck, scenarios:check green
