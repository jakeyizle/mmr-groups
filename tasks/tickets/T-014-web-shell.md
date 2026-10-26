# T-014: Web shell

Status: ready
Milestone: M1
Scenarios: AUTH-004, ROLE-008
Depends on: T-009, T-010

## Notes

- PLAN §9. TanStack Router (file-based, via its Vite plugin), TanStack Query, Tailwind v4 + shadcn/ui, mobile-first layout (375px), signed-in/out header, sign-out.
- API client: Hono RPC `hc<AppType>`. Gotcha: importing `AppType` makes web's tsconfig type-check `packages/api` sources, which need workers types that clash with DOM. Try `import type` first; if it clashes, emit declarations for `packages/api` (`tsc --emitDeclarationOnly`) and import those.
- Fetch wrapper that always sends `X-Requested-With: fetch` + JSON content type (CSRF, T-010).
- `useMe()` query; a `<Can action=…>` helper over core `can()` for ROLE-008.
- Replace the hello page; keep `/api/health`.

## Done when

- Routes from PLAN §9 exist as stubs; E2E: test login → signed-in header → sign out passes on both projects; lint, typecheck, scenarios:check green
