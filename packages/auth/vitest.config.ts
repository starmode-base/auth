import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["neon-testing/setup"],
  },
});
