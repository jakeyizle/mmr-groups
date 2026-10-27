# T-040: `scenarios:check --strict` in CI

Status: ready
Milestone: M6
Scenarios: —
Depends on: T-036, T-037

## Notes

- Once every required scenario has a tagged test, switch CI (`ci.yml` checks job) to `pnpm scenarios:check --strict` so uncovered scenarios fail the build. Check what `--strict` treats as optional (stretch section) and keep that behaviour.
- Update PLAN §1/§11 wording if it says "warn".

## Done when

- CI runs strict and passes on main
