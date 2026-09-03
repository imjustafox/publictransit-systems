import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    globals: false,
    passWithNoTests: true,
  },
});
