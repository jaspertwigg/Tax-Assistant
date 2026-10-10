import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative paths so the app works from any GitHub Pages sub-path.
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { claude: ["@anthropic-ai/sdk"] },
      },
    },
  },
});
