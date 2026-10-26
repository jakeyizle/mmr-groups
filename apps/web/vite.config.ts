import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Cloudflare plugin runs worker/ in workerd during `vite dev`.
// Build for an environment with CLOUDFLARE_ENV=preview.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
