import { app, type Bindings } from "@mmr/api";
import { testLogin } from "@mmr/api/test-login";

// Compile-time constant (vite.config.ts): false in production builds, so the
// route and its module are dropped from the bundle.
if (__TEST_LOGIN__) app.route("/test", testLogin);

export default app satisfies ExportedHandler<Bindings>;
