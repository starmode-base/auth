import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const config = defineConfig({
  server: { host: true },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});

export default config;
