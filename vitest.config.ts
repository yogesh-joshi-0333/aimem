import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.e2e.test.ts", "src/**/performance.integration.test.ts", "node_modules/**", "dist/**"],
    environment: "node",
    passWithNoTests: true,
  },
});
