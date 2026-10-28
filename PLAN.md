# MMR Groups — Plan

Track skill ratings for a recurring group of people (e.g. a pickleball crew). Create a group, add players, record matches (any number of teams of any size, with optional scores), and get ratings, leaderboards, stats, and balanced team suggestions.

Goals: genuinely useful for one real group, ~$0 to run, and a portfolio-quality codebase. Development is done almost entirely by LLMs, so **the scenarios are the source of truth** and everything is traceable to them.

---

## 1. Scenarios (requirements)

Behavior is specified as Given/When/Then scenarios in `scenarios/*.md`, one file per feature. Code and tests implement scenarios; if behavior changes, the scenario changes first.

### Conventions

- **One file per feature**, kept short. Each file has a unique ID prefix.
- **IDs:** `<PREFIX>-<NNN>` (e.g. `MATCH-007`). Never renumbered, never reused. A removed scenario's ID is retired. New scenarios take the next unused number in that file and may be placed next to related scenarios.
- **Behavior level, not UI level.** "An admin replaces Dave with Dan in M1", not "taps the pencil icon". Assert outcomes (resulting ratings), not mechanisms (how often something is computed).
- **One behavior per scenario.**
- **Strict template** (the check script parses it):

```md
### MATCH-007: Editing a match's participants recalculates ratings

- **Given** a group with matches M1, M2, M3 in that order
- **And** Dave played in M1
- **When** an admin replaces Dave with Dan in M1
- **Then** ratings equal replaying the corrected history
- **And** the audit log records the change
```

- Scenarios under a `## Stretch` heading are not required for MVP.

### Linking tests to scenarios (tags)

Every test that verifies a scenario carries the scenario ID as a tag. A test may cover several scenarios; a scenario may be covered at several levels. Tags must be string literals (the check scans source); for table-driven tests, tag the enclosing `describe`.

| Runner             | Syntax                                                       |
| ------------------ | ------------------------------------------------------------ |
| Playwright (≥1.42) | `test('edit recalcs', { tag: '@MATCH-007' }, async () => …)` |
| Vitest (≥4.1)      | `test('edit recalcs', { tags: ['MATCH-007'] }, () => …)`     |

Vitest requires tags to be declared in `test.tags` and rejects unknown tags by default (`strictTags`). `vitest.config.ts` builds the tag list by parsing `scenarios/*.md` (shared parser in `scripts/scenarios.ts`), so a test referencing a nonexistent ID fails. Filtering: `vitest --tags-filter=MATCH-007`, `playwright test --grep @MATCH-007`.

### `pnpm scenarios:check` (runs in CI)

`scripts/check-scenarios.ts`:

1. Parses scenario IDs from `scenarios/*.md`; **fails** on duplicate IDs or malformed headings.
2. Scans Playwright test files for `@ID` tags; **fails** on unknown IDs (Vitest already enforces this).
3. Reports scenarios with no tagged test (Vitest + Playwright) — `--strict` (used in CI) makes uncovered non-stretch scenarios an error.

### Scenario files

| File                | Prefix | Covers                                             |
| ------------------- | ------ | -------------------------------------------------- |
| `auth.md`           | AUTH   | Google sign-in, sessions, sign-out                 |
| `groups.md`         | GROUP  | Create group, settings, delete, transfer ownership |
| `roles.md`          | ROLE   | Role permissions, site admin                       |
| `players.md`        | PLAYER | Add/rename/remove/unlink players, assign roles     |
| `joining.md`        | JOIN   | Invite links, claiming players, leaving            |
| `match-entry.md`    | MATCH  | Batch match entry, validation, ordering            |
| `match-editing.md`  | EDIT   | Editing/deleting matches                           |
| `ratings.md`        | RATE   | Rating engine, decay, provisional, display         |
| `leaderboard.md`    | BOARD  | Leaderboard, match history with deltas             |
| `stats.md`          | STATS  | Player and group stats                             |
| `team-generator.md` | TEAMS  | Balanced team generation                           |
| `audit.md`          | AUDIT  | Audit log                                          |
| `visibility.md`     | VIS    | Public vs private groups, data exposure, demo      |

---

## 2. Scope

**MVP**

- Google sign-in
- Groups with fixed per-group roles (owner ⊇ admin ⊇ recorder ⊇ viewer)
- Players (rated entities; optionally linked to a user)
- Invite link + claim-your-player join flow
- Batch match entry (N matches per submit), any team format, optional scores
- Edit/delete matches; ratings always reflect corrected history
- openskill ratings with inactivity decay, provisional badge
- Leaderboard, match history with per-match rating deltas
- Player stats and group stats
- Balanced team generator
- Audit log
- Public/private groups
- Public group index (sort, search; site admins can hide a group)
- Seeded public demo group
- PWA install (no offline sync)

**MVP stretch:** win-probability preview while entering a match.

**Later:** email magic-link sign-in + email invites (same email-provider dependency), "Advanced" rating settings tab (config already stored per group), sessions (named play days), account deletion.

**Not planned:** offline entry/sync, multiple rating algorithms (rating code still sits behind a small interface).

---

## 3. Domain concepts

- **User** — signs in with Google; identified by Google account ID (`sub`), not email. `isSiteAdmin` is set at each login from the `SITE_ADMIN_EMAILS` env var (only when Google reports the email as verified).
- **Group** — container for players, matches, settings.
- **Player** — a rated entity in one group, with a display name and a **role**. Optionally linked to one user; a user has at most one player per group. Every group member is a player.
- **Role** (per player, fixed; each role includes everything below it):

| Capability                                                              | owner | admin | recorder | viewer |
| ----------------------------------------------------------------------- | :---: | :---: | :------: | :----: |
| View private group, stats, audit log, team generator                    |  ✅   |  ✅   |    ✅    |   ✅   |
| Record matches; edit/delete matches they recorded                       |  ✅   |  ✅   |    ✅    |        |
| Edit/delete any match                                                   |  ✅   |  ✅   |          |        |
| Add/rename/remove players; set roles recorder/viewer; unlink non-admins |  ✅   |  ✅   |          |        |
| Edit settings, manage invite link                                       |  ✅   |  ✅   |          |        |
| Grant/revoke admin; unlink admins                                       |  ✅   |       |          |        |
| Transfer ownership, delete group                                        |  ✅   |       |          |        |

Rules:

- Exactly one owner per group (except the demo group: no owner, managed by site admins). The owner can't be unlinked; ownership only changes by transfer to a linked player.
- **Admin only on linked players.** Unclaimed players can be recorder or viewer only. When an admin is unlinked or leaves, their player's role resets to the group's default role. (Otherwise anyone with the invite link could claim a vacated admin player.)
- The group's default role is recorder or viewer.
- Site admins act as owner on any group, including private ones, but can't become owner (they aren't players).
- **Match** — `playedAt` (date-time), 2+ teams, each team 1+ players with an optional score and a **rank** (1 = best; ties share a rank). With scores, rank derives from score (higher is better, any number of teams). Without scores, the recorder sets the winner/placement.
- **Team format** (locked after creation): fixed `T teams × S players`, or `flexible` (any teams ≥ 2, any sizes ≥ 1).
- **Scoring mode:** `required` / `optional` / `none`; `allowTies` boolean. Settings changes don't invalidate existing matches; they apply to new matches and to fields changed in an edit.
- **Ratings** are _derived_: a pure function of (match history, rating config, as-of time). Never stored, never edited. (So there's no "reset ratings" — start a new group.)

### Limits

| Item                      | Limit                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| Group name / player name  | 1–40 chars, trimmed                                              |
| Description / match notes | ≤ 500 chars                                                      |
| Players per group         | ≤ 200                                                            |
| Fixed format              | 2–8 teams × 1–8 players                                          |
| Flexible format           | ≤ 8 teams, ≤ 8 players per team                                  |
| Matches per batch         | ≤ 50                                                             |
| Scores                    | integers 0–999                                                   |
| `playedAt`                | entered in viewer's local time, stored UTC; ≤ 24 h in the future |

---

## 4. Architecture

```
 Browser (React SPA, PWA)
   │  rating replay, stats, team generator run here (packages/core)
   │  same origin: https://mmr-groups.<subdomain>.workers.dev
   ▼
 Cloudflare Worker (static assets)
   ├─ static assets (Vite build)
   └─ /api/* (run_worker_first)  →  Hono app (auth, permissions, validation, persistence)
                                   │
                                   ▼
                              Cloudflare D1 (SQLite) via Drizzle
```

- **Same origin** for SPA and API: one Worker serves the Vite build as static assets (SPA fallback) and runs the Hono app for `/api/*` (`apps/web/worker/index.ts` default-exports `app`). Session cookies are first-party; no CORS.
- **Dev:** `@cloudflare/vite-plugin` runs the Worker in workerd inside `vite dev`, with local D1. One process.
- **The server stores facts; the client derives ratings.** The API validates and persists matches; the browser fetches the group snapshot and replays it with `packages/core`. Replaying thousands of matches takes milliseconds, so there's no server CPU risk, no stored derived state to keep consistent, and no recalc logic — every edit is "correct by construction".
- **Hono RPC** (`hc<AppType>`) gives the client end-to-end types with no codegen.
- **Zod** schemas in `packages/core` validate on both client and server.
- **`packages/core`** is pure (no I/O): rating replay, decay, stats, team generator, permissions, schemas.

### Repo layout (pnpm workspaces)

```
apps/web/            Vite + React SPA + Worker entry; wrangler.jsonc
  worker/index.ts    default-exports the packages/api app
packages/api/        Hono app, routes, auth, Drizzle schema + migrations
packages/core/       domain types, Zod schemas, rating engine, stats, generator, permissions
e2e/                 Playwright tests
scenarios/           *.md scenario files
scripts/             check-scenarios.ts, scenarios.ts (parser), seed-demo.ts
```

### Free-tier constraints

| Limit (free)                                                                                              | Design response                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~10 ms CPU per request                                                                                    | Server does only validation + I/O; all computation is client-side                                                                                          |
| 50 D1 queries per invocation (a `db.batch()` counts as one); 100 bound params per statement; 2 MB per row | Mutations are a single batch; multi-row inserts chunked to ≤ 100 params                                                                                    |
| 5M D1 **rows read**/day, 100k **rows written**/day                                                        | Snapshot reads ~1 row per match; conditional GETs check the group version (1 row) before reading anything else; sessions extended at most once per 15 days |
| 100k requests/day                                                                                         | Far beyond hobby use                                                                                                                                       |

---

## 5. Data model (Drizzle / D1)

IDs are monotonic ULIDs (text; creation order is the ID order). Timestamps are ISO strings (UTC).

```
users            id, google_sub (unique), email, name, is_site_admin, created_at
auth_sessions    id (sha256 of token), user_id, expires_at, created_at
groups           id, name, description, visibility ('private'|'public'), is_demo,
                 team_format (json: {kind:'fixed',teams,size} | {kind:'flexible'}),
                 scoring_mode, allow_ties, default_role ('recorder'|'viewer'),
                 rating_config (json; defaults in core),
                 invite_code (nullable, unique), invite_expires_at (nullable),
                 hidden_from_index, player_count, match_count, last_played_at (nullable),
                 version (int, bumped on any change), created_at
players          id, group_id, display_name, role, user_id (nullable), created_at
                 unique(group_id, user_id); unique(group_id, lower(display_name))
matches          id, group_id, played_at, teams (json), notes, recorded_by_player_id,
                 version (int), created_at, updated_at
audit_events     id, group_id, actor_user_id, action, entity_type, entity_id,
                 before (json), after (json), created_at
```

- `matches.teams`: `[{ playerIds: string[], score: number | null, rank: number }]`. JSON keeps a match to one row (fewer statements/params, trivial snapshot). Player references are checked by the API; "player has matches" uses `json_each`.
- `recorded_by_player_id` (not user ID) so snapshots never expose users.
- Every mutation, its audit row(s), and the `groups.version` bump are one `db.batch()` (atomic).
- **Optimistic concurrency:** match edit/delete requires the match's `version` (`If-Match`). `guardedBatch()` (`packages/api/src/db/guarded-batch.ts`): a guarded `UPDATE/DELETE … WHERE id = ? AND version = ?`, then the audit row inserted `WHERE changes() = 1` (the commit marker), then follow-ups and the group bump conditioned on the marker existing, so a stale write changes nothing; the API returns 412 and the client refetches. Claims use `UPDATE players SET user_id = ? WHERE id = ? AND user_id IS NULL` (first claim wins). New matches can't conflict.
- Players with matches can't be deleted (rename instead).
- **Index counters:** `player_count`, `match_count`, `last_played_at` exist only so the public index can sort and page without aggregating. SQLite triggers on `players`/`matches` (migration `0001`) recompute them from group-scoped subqueries, so every write keeps them current, raw SQL included (demo seed, test fixtures). Drizzle doesn't model triggers: a later migration that rebuilds `players` or `matches` must recreate them. No indexes for the index: public groups are few and the name search scans anyway.

---

## 6. Rating engine (`packages/core/rating`, runs in the browser)

Library: **[openskill](https://github.com/philihp/openskill.js)** (MIT, TS, N teams × M players, ranks, ties, `predictWin`).

`replay(matches, config, asOf) → { players: {id: {mu, sigma, lastPlayedAt, matches}}, matches: {id: {playerId: {before, after}}} }`

1. Sort by `(playedAt, id)`.
2. For each match: decay each participant for time since their last match, then `rate(teams, { rank })`; record before/after.
3. Decay every player to `asOf` for display (the UI passes now; tests pass a fixed time).

**Decay:** `σ' = min(√(σ² + w · d²), σ₀)` where `w` = weeks inactive (fractional days / 7). μ unchanged.

**Defaults (`rating_config`, tune per R2):**

| Param                  | Default                       |
| ---------------------- | ----------------------------- |
| model                  | Plackett-Luce                 |
| μ₀, σ₀                 | 25, 25/3                      |
| τ (openskill dynamics) | 25/300                        |
| decay `d` per week     | 0.5                           |
| display                | `round(1000 + 20 · (μ − 3σ))` |
| provisional            | σ > 5                         |

**Interface:** `RatingSystem { initial(); rateMatch(teams, ranks); predictWin(teams); display(rating) }` — openskill is the only implementation.

---

## 7. Auth

- Google OAuth authorization-code flow with PKCE via **arctic**. `state` and code verifier in short-lived (10 min) `HttpOnly; Secure; SameSite=Lax` cookies. Routes: `GET /api/auth/google`, `GET /api/auth/google/callback`, `POST /api/auth/logout`, `GET /api/me`.
- Session: random 32-byte token in an `HttpOnly; Secure; SameSite=Lax` cookie; DB stores its SHA-256. 30-day expiry, extended only when < 15 days remain.
- CSRF: SameSite=Lax + every mutation **requires** `Content-Type: application/json` and `X-Requested-With: fetch`.
- `returnTo` preserved through login; must be a same-origin path, else `/`.
- **Test login** (`POST /api/test/login`) exists only in `vite build --mode e2e` builds (compile-time `__TEST_LOGIN__`, output to `dist-e2e/`); production bundles don't contain the route. The handler also refuses unless `env.ENABLE_TEST_LOGIN === 'true'`.

---

## 8. API (Hono, `/api`)

```
GET    /me
GET    /groups                         groups I'm a member of
GET    /public-groups?q=&sort=&dir=&cursor=   index (anyone; pages of 25)
POST   /groups                         create (creator becomes owner player)
GET    /groups/:gid                    snapshot (see below)
PATCH  /groups/:gid                    settings (team_format immutable)
DELETE /groups/:gid                    owner
POST   /groups/:gid/transfer           owner → another linked player
POST   /groups/:gid/players            add player(s)
PATCH  /groups/:gid/players/:pid       rename, role
DELETE /groups/:gid/players/:pid       only if no matches
POST   /groups/:gid/players/:pid/unlink
POST   /groups/:gid/leave              unlink myself (owner must transfer first)
POST   /groups/:gid/matches            batch create: { matches: [...] } (1..50)
PATCH  /groups/:gid/matches/:mid       If-Match: version
DELETE /groups/:gid/matches/:mid       If-Match: version
GET    /groups/:gid/audit?cursor=      members only
PUT    /groups/:gid/invite             (re)generate code, optional expiry
DELETE /groups/:gid/invite             revoke
GET    /invites/:code                  group name + unclaimed players (signed-in)
POST   /invites/:code/claim            { playerId } | { newPlayerName }
```

- One middleware resolves `(user, group, role)` and checks `can(role, action, resource)` from `packages/core/permissions` — the same function the UI uses to hide controls.
- Private group + non-member (or missing group): identical `404`.
- **Snapshot** = group settings, players, matches. Shaped per audience by explicit serializers:
  - _public_: settings, players (id, name), matches (no `recorded_by`).
  - _member_: + player roles, claimed flag, `recorded_by_player_id`, my player ID/role.
  - _admin_: + invite code/expiry.
  - Never: emails, Google names/avatars, user IDs.
- Caching: `ETag: "<version>-<audience>"`, `Cache-Control: private, no-cache`. On `If-None-Match`, read only `groups.version` and return 304 if unchanged.
- **Public index:** listed = public, not hidden, ≥ 1 match. Response `{ groups: [{ id, name, description, playerCount, matchCount, lastPlayedAt, createdAt }], nextCursor: string | null }` (public data only). `sort` ∈ name (default, asc) | played | matches | players | created (the four non-name sorts default desc); `dir` reverses. Name sort and its keyset comparison both use `COLLATE NOCASE` (ASCII-only case folding, like `LIKE`). Keyset cursor = opaque `{ sort, dir, value, id }`; 400 if malformed or its sort/dir differ from the request. `q` is trimmed (empty = no filter, max 100 chars), a case-insensitive substring match on name (escaped `LIKE`).
- **Settings PATCH sends only changed fields** (the form submits dirty fields). `hiddenFromIndex`: changing it is 403 unless the user is a site admin (owners included); checked after the no-op filter. Only the admin snapshot carries it, beside `invite`.
- Errors: `{ error: { code, message, details? } }`; 400 validation, 401, 403, 404, 409 (e.g. name taken, claim lost), 412 (stale version).
- Audit: one event per affected entity (a 6-match batch → 6 `match.created` events); `before`/`after` hold the entity's serialized fields.

---

## 9. Frontend

Vite, React, TanStack Router, TanStack Query, Hono RPC client, React Hook Form + Zod, Tailwind + shadcn/ui, Recharts, vite-plugin-pwa. Mobile-first; every screen designed at 375px first.

**Routes**

```
/                         my groups / landing (links to demo group and index)
/login
/groups                   public group index (?q=&sort=&dir=)
/groups/new
/g/:gid                   leaderboard
/g/:gid/matches           history (deltas per match)
/g/:gid/matches/new       batch entry
/g/:gid/matches/:mid      match detail / edit
/g/:gid/players/:pid      player profile + stats
/g/:gid/stats             group stats
/g/:gid/teams             team generator
/g/:gid/audit             audit log
/g/:gid/settings          general, players & roles, invite link
/join/:code               claim flow
```

**Data flow:** one TanStack Query for the snapshot per group; `replay()` memoized on `(snapshot.version, asOf day)`; all pages derive from that.

**Batch entry:** `useFieldArray` of match rows. Each row: teams (pickers constrained by team format), scores per scoring mode, winner/placement when no scores, `playedAt`. "Duplicate row" copies the previous row's players; "Add row" starts blank. First row defaults to now; each next row to previous + 1 min. Draft persisted to `localStorage` per group. One submit → one batch.

**Team generator:** selected players → partitioned into as many matches of the format as fit; minimize Σ|P(team 1 wins) − 0.5| (2-team matches; for N teams, Σ of each team's |P − 1/N|) via `predictWin`; ties broken deterministically by player-ID order. Sit-outs: prefer players who have sat out fewest times this session. Exhaustive search up to 12 players; beyond that, a swap search (any improving cross-team swap, until none) from a snake draft and seeded reshuffles, within a fixed evaluation budget; its distinct results, best first, stand in for the exhaustive ranking when regenerating.

**Stats** (pure functions in core): see `scenarios/stats.md` for definitions.

---

## 10. Testing

| Level           | Tool                                                                                              | Covers                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Unit            | Vitest                                                                                            | `packages/core`: replay, decay, permissions, stats, generator (incl. perf benchmark), schemas             |
| API integration | Vitest 4.1 + `@cloudflare/vitest-plugin` (`cloudflareTest()`; renamed from `vitest-pool-workers`) | routes, auth, permissions, serializers, atomicity, concurrency, audit rows                                |
| Component       | Vitest (`web` project) + jsdom + Testing Library                                                  | components and routes (real route tree, stubbed `fetch`): each branch; pure helpers in `apps/web/src/lib` |
| E2E             | Playwright (projects: Pixel 7, iPhone 14) against `vite preview` (built Worker in workerd)        | critical journeys: sign in, create group, join/claim, batch entry, edit → ratings update, public view     |

- API tests call `app.request(…, env)` using `apps/web/wrangler.jsonc`; migrations applied before each file.
- Pick the lowest level that genuinely verifies a scenario.
- E2E uses the test-login route and a fresh local D1 per run.
- Rating tests use fixed fixtures and a fixed `asOf`, asserting against openskill outputs with tolerances.

**Mutation testing (Stryker).** Scope: core, api, and web (logic + components via jsdom/Testing Library component tests). E2E covers each scenario's happy path; component tests cover a component's branches and tag scenario IDs.

- Runner: `@stryker-mutator/vitest-runner` (perTest coverage works in the workerd pool too). Concurrency ≤ 4 (3 in CI): more runners starve workerd into false timeouts.
- `pnpm mutate:changed` mutates only lines changed vs the base branch (`git diff -U0 -M --diff-filter=AMR`, new-side ranges → `--mutate file:a-b`). Empty diff → skip (never run Stryker without `--mutate`). CI runs it on PRs (`fetch-depth: 0`, `github.base_ref`).
- Pass = no Survived/NoCoverage mutants; Timeout counts as killed; survivors get one rerun before failing.
- An unkillable (equivalent) mutant is disabled inline with `// Stryker disable next-line <mutator>: <reason>`; a reason is required, and the script lists disables added by the PR. A next-line disable only reaches nodes under the statement or expression it leads (not a later link in a method chain: use a `disable`/`restore` range; nor a `catch` block: leave an equivalent catch empty). Static (module-level) survivors need a test unless provably equivalent.
- Not mutated: tests, `*.d.ts`, migrations, `meta/`, `routeTree.gen.ts`, `components/ui/*`, `components/charts/*` (Recharts config; chart data comes from tested lib/core code), `db/schema.ts`, `main.tsx`. Noise skipped by the `noise` ignorer (`scripts/stryker-noise.ts`), not disables: `className` (attribute or property)/`cn()`, `console.*`, `apiError` messages, `new Error(…)` messages, `"/"` Hono route paths (Hono treats `""` the same), `createFileRoute` paths (`routeTree.gen` sets them), `params: { gid }` within `/g/$gid` (the router keeps current params).
- Known gaps: deleted lines (incl. deleted tests) aren't checked; a mutant only partly overlapping a changed range is skipped.
- One-time audit brings every file to zero unresolved survivors (M8); until then, a PR inherits old survivors on lines it touches.

---

## 11. CI/CD (GitHub Actions)

- **PR:** install → lint (ESLint) → typecheck → unit + API tests → `scenarios:check` → E2E → preview upload: `wrangler versions upload --env preview --preview-alias pr-<n>` to the `mmr-groups-preview` Worker (preview D1).
- **main:** same checks → `wrangler d1 migrations apply --remote` (production, then preview) → seed demo on preview if missing → deploy production.
- PRs never migrate the preview D1, so unmerged migrations can't leak into it. Preview deploys of PRs with new migrations may break; that's acceptable.
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (GitHub); `GOOGLE_CLIENT_ID/SECRET`, `SITE_ADMIN_EMAILS` (Worker secrets).
- Migrations: Drizzle Kit → `packages/api/migrations`; must be backward-compatible with the previously deployed code.
- Google OAuth needs exact redirect URIs, so sign-in works only on production. Previews are for viewing the demo group.

## 12. Demo data & observability

- `scripts/seed-demo.ts`: deterministic (fixed seed) public "Demo Pickleball League" with `is_demo = true`, no owner, no linked users: 12 players with hidden "true skill", 16 weeks of 2v2 matches with plausible scores. Read-only to everyone except site admins.
- Structured JSON logs (request id, route, status, duration) via middleware. Cloudflare Web Analytics on the SPA.

## 13. Documentation

Only: `PLAN.md`, `scenarios/*.md`, `tasks/`, `CLAUDE.md` (pointers + commit convention), and one `README.md` (what it is, live + demo links, screenshot, stack, run/test/deploy). No other docs; comments only where the code is non-obvious.

---

## 14. Milestones & tasks

See `tasks/ROADMAP.md` (milestones, ticket process), `tasks/tickets/` (open tickets), `tasks/LOG.md` (completed).

## 15. Risks / open items

- **R1 — Snapshot growth.** The snapshot grows linearly (~100 bytes/match). Fine for thousands of matches; if it ever matters, paginate history and cache older matches client-side.
- **R2 — Rating constants** need tuning against real data; they live in `rating_config`, not code.
- **R3 — Pages vs Workers static assets.** Resolved: Workers (Hono's Pages adapter is deprecated; Cloudflare recommends Workers).
