# T-052: Fix flaky unsaved-batch e2e test

Status: ready
Milestone: Maintenance
Scenarios: MATCH-014
Depends on: —

## Notes

- `e2e/matches.spec.ts` "an unsaved batch survives a reload and is cleared after saving" failed once locally (iphone-14 only) and passed on rerun: `page.goto(".../matches/new")` (line 172) "is interrupted by another navigation to .../matches".
- Likely a race: `toHaveURL(/matches$/)` passes as soon as the URL changes, but a second same-document history update can still be pending (batch entry's `onSuccess` awaits `invalidateQueries` before `navigate`; check also whether the router does a follow-up `replaceState`, e.g. search normalization on `/matches`). The test's `goto` then collides with it.
- Reproduce first: `pnpm --filter @mmr/e2e exec playwright test matches.spec.ts -g "unsaved batch" --repeat-each 30` (also with `--project iphone-14` and CPU throttling if it won't fail). Keep repro numbers in the LOG line.
- Prefer fixing the test's wait over sleeping/retries: wait for something rendered by the history page (e.g. the "Matches" list with the saved match) before the next `goto`. If the app really does double-navigate, fix that in `batch-entry.tsx` instead.
- Check other specs for the same `toHaveURL` → `goto` pattern and fix them too.

## Done when

- 30+ repeated runs on both projects pass; lint, typecheck, scenarios:check --strict, mutate:changed green
