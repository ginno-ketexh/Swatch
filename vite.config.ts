import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import RubyPlugin from "vite-plugin-ruby";

const projectRoot = decodeURIComponent(new URL(".", import.meta.url).pathname);

export default defineConfig({
  plugins: [tailwindcss(), react(), RubyPlugin()],
  test: {
    root: projectRoot,
    environment: "jsdom",
    setupFiles: ["./app/frontend/test/setup.ts"],
  },
});
