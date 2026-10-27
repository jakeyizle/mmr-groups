# T-038: PWA

Status: ready
Milestone: M6
Scenarios: —
Depends on: —

## Notes

- `vite-plugin-pwa` (pin an older-than-a-day release): manifest (name, short_name "MMR", theme/background colors from the theme, `display: standalone`), icons (192, 512, maskable; generate from one SVG in `apps/web/public`), `registerType: "autoUpdate"`.
- Precache the app shell only; never cache `/api/*` (network-only), so data is never stale and auth stays correct.
- Make sure it works with the Cloudflare plugin's build output and the `dist-e2e` mode (disable the service worker in e2e builds to keep tests deterministic).
- Check: Lighthouse installability in a production build (`vite preview`), manifest served, SW registered.

## Done when

- Production build is installable (manifest + SW), API requests bypass the SW; lint, typecheck green
