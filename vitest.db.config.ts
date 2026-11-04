import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

/** Integration tests against the local development database (npm run test:db). */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias: { "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)) } },
  test: { include: ["src/**/*.db.test.ts"], environment: "node", fileParallelism: false, testTimeout: 30_000, hookTimeout: 60_000 },
});
