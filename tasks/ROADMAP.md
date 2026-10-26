# Roadmap

## Process

- **Roadmap** (this file): milestones → work items. Tick items when done.
- **Tickets** (`tickets/T-NNN-slug.md`): open work only. Written in chunks: when fewer than ~3 tickets are `ready`, write the next chunk of ~5–8 from the unticked items below (may cross a milestone boundary). Link each item to its ticket (`→ T-012`).
- **Log** (`LOG.md`): one line per completed ticket.
- **IDs:** `T-NNN`, next = highest in `tickets/` or `LOG.md` + 1.
- **Tickets never restate requirements.** Reference scenario IDs and `PLAN.md` sections; add only approach, files, and gotchas. If needed behavior isn't in a scenario, add the scenario first.
- **Finishing a ticket**, in one commit (`T-012: <summary>`, see `CLAUDE.md`): delete the ticket file, append to `LOG.md`, tick the item here and drop its ticket link.

Ticket template:

```md
# T-012: <title>

Status: ready | in-progress
Milestone: M2
Scenarios: MATCH-001, MATCH-002
Depends on: T-010

## Notes

- <approach, files, gotchas>

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check green
```

Each milestone ends deployed, with its scenarios passing.

## M0 — Foundation

- [x] pnpm monorepo, TS config, ESLint, `packages/core` skeleton with Vitest
- [x] Scenario parser + `scenarios:check` + Vitest tag config
- [x] Worker (static assets) + Hono + D1 binding, deployed "hello"
- [x] Drizzle schema + first migration
- [x] API test harness (`@cloudflare/vitest-plugin`)
- [ ] Playwright harness + test-login route (AUTH-008) → T-006
- [ ] GitHub Actions: checks, preview + production deploy, migrations → T-007
- [x] Spike: guarded-batch optimistic concurrency in D1 (PLAN §5)

## M1 — Auth & groups (AUTH, GROUP, ROLE, PLAYER)

- [ ] Google OAuth, sessions, `/me`, site admin config
- [ ] Permissions module (core)
- [ ] Groups API: create, list, settings, delete, transfer
- [ ] Players API: add, rename, role, remove, unlink
- [ ] Web shell: router, layout, auth state, query client
- [ ] Group create + settings UI
- [ ] Players & roles UI

## M2 — Matches & ratings (MATCH, RATE, BOARD, AUDIT)

- [ ] Rating replay engine + default config (core)
- [ ] Match schemas + validation rules (core)
- [ ] Snapshot endpoint: audience serializers, ETag/304
- [ ] Batch match create API + audit
- [ ] Batch entry form
- [ ] Leaderboard
- [ ] Match history
- [ ] Audit log API + UI

## M3 — Editing (EDIT)

- [ ] Match edit/delete API with versions
- [ ] Match detail/edit UI, stale-edit handling

## M4 — Joining (JOIN)

- [ ] Invite link API + settings UI
- [ ] Claim/join API, leave
- [ ] Join flow UI

## M5 — Insights (STATS, TEAMS)

- [ ] Stats functions (core)
- [ ] Player profile UI
- [ ] Group stats UI
- [ ] Team generator (core) + perf benchmark
- [ ] Team generator UI
- [ ] Stretch: win probability preview (MATCH-016)

## M6 — Public & polish (VIS)

- [ ] Public group access end-to-end
- [ ] Demo seed script + deploy wiring
- [ ] PWA
- [ ] README
- [ ] `scenarios:check --strict` in CI
