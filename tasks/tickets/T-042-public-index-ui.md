# T-042: Public group index UI

Status: ready
Milestone: M7
Scenarios: VIS-009, VIS-010, VIS-011, VIS-012, VIS-013
Depends on: T-041

## Notes

- `routes/groups/index.tsx`: `validateSearch` for `q`/`sort`/`dir` (URL is shareable; defaults omitted from URL). `useInfiniteQuery` keyed on the search; "Load more" button, not infinite scroll. Search input debounced (~300 ms), replaces history entry.
- Mobile-first rows, not a table: name + one-line description, then "12 players · 160 matches · 3 days ago" (relative time with absolute in `title`). Sort as a native select ("Name", "Latest match", …) + direction toggle button with an accessible label. Empty and no-results states.
- Home: "Browse public groups" link on the landing (beside the demo button) and in the signed-in "Your groups" header.
- `general-settings.tsx`: submit only dirty fields (`formState.dirtyFields`), so the settings PATCH is partial (PLAN §8); keep its existing tests green.
- Settings: "Hide from public index" switch shown only to site admins, PATCHing just `{ hiddenFromIndex }`; admins/owners see a notice when hidden. Non-member site admins already get the Settings tab (`can` treats them as owner); verify in the E2E.
- E2E: signed-out browse (sort change, search, load more), and site-admin hide → gone from index, group link still works. Seed > 25 groups via API in one spec; keep other specs unaffected (index tests scope by a unique name prefix + search).

## Done when

- Listed scenarios have passing tagged E2E tests on both devices; lint, typecheck, scenarios:check --strict green; deployed
