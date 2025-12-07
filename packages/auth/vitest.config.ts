import { defineConfig } from "vitest/config";
import { neonTesting } from "neon-testing/vite";

export default defineConfig({
  plugins: [neonTesting()],
});
