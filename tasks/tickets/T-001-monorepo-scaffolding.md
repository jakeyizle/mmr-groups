# T-001: Monorepo scaffolding + core package
Status: ready
Milestone: M0
Scenarios: —
Depends on: —

## Notes
- pnpm workspaces per PLAN §4 layout: `apps/web`, `packages/api`, `packages/core`, `e2e`, `scripts`. Pin pnpm via `packageManager` and Node via `.nvmrc` (current LTS).
- Shared `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, ESM, `moduleResolution: bundler`).
- ESLint flat config with typescript-eslint (type-aware) at root. Prettier with defaults.
- Root scripts: `lint`, `typecheck`, `test`, `format`.
- `packages/core`: empty `src/index.ts` + Vitest config + one trivial test to prove the runner works.
- Only create the other packages' folders/`package.json` if needed for workspace resolution; they're filled in later tickets.

## Done when
- `pnpm install && pnpm lint && pnpm typecheck && pnpm test` pass from a clean clone
