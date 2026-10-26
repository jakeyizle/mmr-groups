import { Hono } from "hono";

export interface Bindings {
  DB: D1Database;
}

export const app = new Hono<{ Bindings: Bindings }>()
  .basePath("/api")
  .get("/health", async (c) => {
    await c.env.DB.prepare("select 1").run();
    return c.json({ ok: true });
  });

export type AppType = typeof app;
