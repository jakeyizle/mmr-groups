# T-050: Profile links and own-profile entry

Status: ready
Milestone: M9
Scenarios: STATS-013, STATS-014
Depends on: —

## Notes

- Add to `scenarios/stats.md` in this ticket's commit (`scenarios:check --strict` fails CI on required scenarios without tests):
  - STATS-013 "Player names lead to their profile": Given a player shown on the leaderboard, in a match, or in a stats list / When their name is selected / Then their profile opens
  - STATS-014 "Members can open their own profile": Given a signed-in user linked to a player in the group / When they view the group / Then they can go directly to their own profile
- Shared `PlayerLink` component (`components/player-link.tsx`) for profile links; use it for the leaderboard (ranked + unrated), match detail (`matches/$mid.tsx`), group stats lists, and profile partner/head-to-head lists. Not in pickers (team generator selection, batch entry).
- `MatchCard` is one `<Link>` to the match, so it can't hold name links (nested `<a>`). Make the card a plain container: date line links to the match (or stretched-link overlay with names raised above it via `relative z-10`). Keep the whole card tappable on mobile.
- STATS-014: a "Me" entry in the `$gid/route.tsx` tab bar when `data.me?.playerId` is set; public visitors and unlinked site admins don't get it.

## Done when

- Listed scenarios have passing tagged tests (component + an `e2e/profile.spec.ts` journey); lint, typecheck, scenarios:check --strict, mutate:changed green
