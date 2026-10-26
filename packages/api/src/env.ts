// Imported (not global) so the web app can type-check AppType without workers globals.
import type { D1Database } from "@cloudflare/workers-types";

import type { Db } from "./db";

export interface Bindings {
  DB: D1Database;
  ENABLE_TEST_LOGIN?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  isSiteAdmin: boolean;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: { db: Db; user: SessionUser | null };
}
