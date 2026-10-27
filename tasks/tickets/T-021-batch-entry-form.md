# T-021: Batch entry form

Status: ready
Milestone: M2
Scenarios: MATCH-001, MATCH-002, MATCH-004, MATCH-005, MATCH-012, MATCH-014, MATCH-015
Depends on: T-020

## Notes

- PLAN §9 (Batch entry). `/g/$gid/matches/new`: react-hook-form `useFieldArray`, resolver built from core `matchInputSchema` + `validateMatch`; server issues mapped back onto row fields.
- Team pickers constrained by the format; score inputs per scoring mode (`inputmode="numeric"`); winner/placement picker when no scores.
- Draft in `localStorage` per group (try/catch; cleared on success). Add-player inline uses the players API (`player.manage` only).
- `datetime-local` in the viewer's zone → UTC ISO.
- E2E on both devices: record one, record a batch, duplicate row, reload keeps draft.

## Done when

- Listed scenarios have passing tagged tests (E2E for the UI ones); lint, typecheck, scenarios:check green
