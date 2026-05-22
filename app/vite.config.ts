import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundle react-canvas-lite as ESM (it uses WASM embedded inline — no separate fetch needed)
    include: ["@rive-app/react-canvas-lite"],
  },
});
