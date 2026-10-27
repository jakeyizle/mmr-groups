# T-046: Web Vitest project + component tests

Status: ready
Milestone: M8
Scenarios: VIS-009, VIS-010, VIS-013
Depends on: T-044

## Notes

- `web` Vitest project: jsdom + Testing Library, `ResizeObserver` stub. Chart logic tested via `lib/charts.ts`.
- Extract `ago()` and the `/groups` `validateSearch` to `apps/web/src/lib`.
- First component tests: public index (sort/dir defaults, empty states), `IndexVisibility` (site admin / admin-notice / nothing).
- Stryker `excludedMutations`/globs for noise (PLAN §10); add web to `mutate:changed`.

## Done when

- web project green in `pnpm test`; `mutate:changed` covers `apps/web/src`.
