import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Each test file gets isolated storage, so migrate per file.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
