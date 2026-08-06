import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/performance.integration.test.ts", "src/**/search-quality-benchmark.integration.test.ts"],
    exclude: ["node_modules/**"],
    environment: "node",
    testTimeout: 180000,
    hookTimeout: 180000,
  },
});
