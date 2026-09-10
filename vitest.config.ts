import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": fileURLToPath(
        new URL("./tests/cloud-bindings.ts", import.meta.url),
      ),
      "@runtime": fileURLToPath(
        new URL("./lib/runtime-node.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
