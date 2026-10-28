# MMR Groups

- Spec: `PLAN.md`. Requirements: `scenarios/*.md` (source of truth). Work: `tasks/ROADMAP.md` (process + tickets).
- Keep docs minimal; don't add new doc files.

## Commits

- Subject line only, imperative, ≤ 60 chars. No body.
- Ticket work: `T-012: add batch match API`. Otherwise: `fix typo in auth scenarios`.
- Only exception: one short body line when the "why" is non-obvious.

## Shipping

- Never push to `main`; it deploys to production. Branch (e.g. `t-012-batch-match-api`), push, open a PR.
- PR CI also runs `mutation` and `preview`, which `main` skips. Wait for all checks, then `gh pr merge --rebase --delete-branch` (keeps history linear).
- `gh` isn't on PATH: `"/c/Program Files/GitHub CLI/gh.exe"`.
