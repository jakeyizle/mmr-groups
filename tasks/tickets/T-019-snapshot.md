# T-019: Snapshot endpoint: audience serializers, ETag/304

Status: ready
Milestone: M2
Scenarios: VIS-006, VIS-007
Depends on: —

## Notes

- PLAN §8 (Snapshot, Caching). Extend `GET /api/groups/:gid` with `matches` (ordered `(playedAt, id)`), and split `serialize.ts` into public / member / admin audiences (public: no roles, `linked`, `recordedByPlayerId`).
- ETag `"<version>-<audience>"`, `Cache-Control: private, no-cache`; on `If-None-Match` read only `groups.version` (plus the access check) and return 304.
- Check every group/player/match mutation bumps `groups.version` (players and settings already do via `auditedBatch`/`guardedBatch`).
- Web: `groupQuery` keeps working; the browser handles 304 transparently.
- Admin audience fields (invite code) arrive with M4; leave the hook.

## Done when

- Listed scenarios have passing tagged API tests; 304 path tested; lint, typecheck, scenarios:check green
