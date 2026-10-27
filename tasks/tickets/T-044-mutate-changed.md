# T-044: `mutate:changed` + PR CI job (core)

Status: ready
Milestone: M8
Scenarios: —
Depends on: T-043

## Notes

- Script in `scripts/`: diff → ranges per PLAN §10 (exclusions, empty-diff skip, one rerun, list disables added, reject disables without a reason). Unit-test the diff→range mapping.
- CI job on `pull_request`: `fetch-depth: 0`, base `github.base_ref`, own timeout.
- Add `pnpm mutate:changed` to the ROADMAP "Done when" gate.

## Done when

- A PR adding an untested branch to core fails the job; adding the test makes it pass.
