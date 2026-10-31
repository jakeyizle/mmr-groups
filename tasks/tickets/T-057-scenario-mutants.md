# T-057: Scenario mutants

Status: ready
Milestone: M11
Scenarios: —
Depends on: T-056

## Notes

- PLAN §10 "Scenario fidelity", Scenario mutants. `pnpm scenarios:mutants <IDs…>`; results to `reports/fidelity/`. Load the `claude-api` skill before writing the client code; `ANTHROPIC_API_KEY` from env.
- Generate: scenario text + top-ranked T-056 files (+ T-058 flagged clauses when present) → a few unified diffs, each naming the clause it breaks. Write diffs LF (`.gitattributes` is `eol=lf`, local `core.autocrlf=true`).
- One persistent worktree (`pnpm install --frozen-lockfile --offline` once). Per patch: `git apply --check` (count failures separately), apply, typecheck (fail → discard), `vitest --tags-filter=<ID>`, then Playwright `--grep @<ID>` if the scenario has E2E tags, then `git checkout -- . && git clean -fd`.
- Playwright must not reuse a running server: `reuseExistingServer` is `!ci` and `e2e/serve.ts` hard-codes :4173. Set `CI=1` or a port override, and check the served build is the patched one (one patch's change visible, or a build stamp). Sequential runs only.
- Survivors: LLM equivalence check (does the patch really break the clause?), then listed for review. Accept plain patches too: the optional sampled-E2E item reuses the runner.
- Add the step to ROADMAP's ticket finish and template: run on the ticket's scenarios; confirmed survivors get a test or a Maintenance item. Advisory.

## Done when

- Runs on ~10 scenarios on Windows. A deliberately weakened test (assertion removed on a scratch branch) yields a confirmed survivor. Apply failures, kills, survivors, time and cost per scenario recorded in LOG.
