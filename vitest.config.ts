import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 60,
        statements: 80,
      },
      exclude: [
        "node_modules/",
        "dist/",
        "tests/**",
        "**/*.d.ts",
        "**/*.test.ts",
        "vitest.config.ts",
        "src/registry/sources.ts", // External API calls - tested separately
      ],
    },
  },
  resolve: {
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
