# Roadmap

## Process

- **Roadmap** (this file): milestones → work items. Tick items when done.
- **Tickets** (`tickets/T-NNN-slug.md`): open work only. Written in chunks: when fewer than ~3 tickets are `ready`, write the next chunk of ~5–8 from the unticked items below (may cross a milestone boundary). Link each item to its ticket (`→ T-012`).
- **Log** (`LOG.md`): one line per completed ticket.
- **IDs:** `T-NNN`, next = highest in `tickets/` or `LOG.md` + 1.
- **Tickets never restate requirements.** Reference scenario IDs and `PLAN.md` sections; add only approach, files, and gotchas. If needed behavior isn't in a scenario, add the scenario first.
- **Finishing a ticket**, in one commit (`T-012: <summary>`, see `CLAUDE.md`): delete the ticket file, append to `LOG.md`, tick the item here and drop its ticket link.
- **Scenario mutants** (advisory, PLAN §10): before finishing a ticket that lists scenarios, commit, then run `pnpm scenarios:mutants <its IDs>` (needs a logged-in `claude` CLI; ~1–5 min per scenario). A gap (a surviving patch judged to break its clause) gets a test in the ticket, or a Maintenance item.

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

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check, mutate:changed green
```

Each milestone ends deployed, with its scenarios passing.

## M0 — Foundation

- [x] pnpm monorepo, TS config, ESLint, `packages/core` skeleton with Vitest
- [x] Scenario parser + `scenarios:check` + Vitest tag config
- [x] Worker (static assets) + Hono + D1 binding, deployed "hello"
- [x] Drizzle schema + first migration
- [x] API test harness (`@cloudflare/vitest-plugin`)
- [x] Playwright harness + test-login route (AUTH-008)
- [x] GitHub Actions: checks, preview + production deploy, migrations
- [x] Spike: guarded-batch optimistic concurrency in D1 (PLAN §5)

## M1 — Auth & groups (AUTH, GROUP, ROLE, PLAYER)

- [x] Google OAuth, sessions, `/me`, site admin config
- [x] Permissions module (core)
- [x] Groups API: create, list, settings, delete, transfer
- [x] Players API: add, rename, role, remove, unlink
- [x] Web shell: router, layout, auth state, query client
- [x] Group create + settings UI
- [x] Players & roles UI

## M2 — Matches & ratings (MATCH, RATE, BOARD, AUDIT)

- [x] Rating replay engine + default config (core)
- [x] Match schemas + validation rules (core); also covers the match side of GROUP-003, GROUP-011
- [x] Snapshot endpoint: audience serializers, ETag/304
- [x] Batch match create API + audit
- [x] Batch entry form
- [x] Leaderboard
- [x] Match history
- [x] Audit log API + UI

## M3 — Editing (EDIT)

- [x] Match edit/delete API with versions
- [x] Match detail/edit UI, stale-edit handling

## M4 — Joining (JOIN)

- [x] Invite link API + settings UI
- [x] Claim/join API, leave
- [x] Join flow UI (+ E2E for UI that needs a second linked member: GROUP-008 transfer, PLAYER-008 unlink, ROLE-005 grant admin)

## M5 — Insights (STATS, TEAMS)

- [x] Stats functions (core)
- [x] Player profile UI
- [x] Group stats UI
- [x] Team generator (core) + perf benchmark
- [x] Team generator UI
- [x] Stretch: win probability preview (MATCH-016)

## M6 — Public & polish (VIS)

- [x] Public group access end-to-end
- [x] Demo seed script + deploy wiring
- [x] PWA
- [x] README
- [x] `scenarios:check --strict` in CI

## M7 — Public group index (VIS)

- [x] Index data + API: counters, hide flag, sorted/searchable/paged endpoint
- [x] Index UI, home links, site-admin hide control

## M8 — Mutation testing (PLAN §10)

- [x] Spike: Stryker on core + api (workerd mutant activation)
- [x] `mutate:changed` + PR CI job, core + api
- [x] Web Vitest project, lib extractions, first component tests, add web to the check
- [x] Audit: core
- [x] Audit: api auth + db
- [x] Audit: api groups
- [x] Audit: web

## M9 — Player profiles (STATS)

- [x] Profile links from player names, own-profile entry
- [x] Full match history on profile

## M10 — Observability (PLAN §12)

- [x] Request logs + Workers Logs, Web Analytics beacon

## M11 — Scenario fidelity (PLAN §10)

- [x] Type `stubApi` handlers from `AppType`; fix stubs that drifted
- [x] `scenarios:check --strict` requires a Vitest tag per required scenario
- [x] `scenarios:attribution`: scenario → source files, from `coveredBy`
- [x] Scenario mutants: patch generation, worktree runner (Vitest + Playwright), ticket-finish step
- [ ] Deferred: round-trip: stripped tests → Given/When/Then, clause comparison; needs ~20 hand-labelled scenarios to calibrate (ticket T-058 in git history)
- [x] Optional: sampled E2E strength: ~50 random Stryker mutants through the T-057 runner, Playwright only

## Maintenance

- [x] Fix flaky unsaved-batch e2e test
- [x] Close scenario-mutant gaps from the M11 trial (JOIN-005, AUTH-006, GROUP-010, AUDIT-002)
