import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias: { "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], exclude: ["**/node_modules/**", "src/**/*.db.test.ts"], environment: "node" },
});
