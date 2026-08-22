import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ["./test/global-setup.ts"],
    globals: true,
    hookTimeout: 60_000,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 60_000,
  },
});
