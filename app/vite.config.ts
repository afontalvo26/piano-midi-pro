import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1234,
    strictPort: true,
  },
  preview: {
    port: 1234,
    strictPort: true,
  },
  optimizeDeps: {
    // Pre-bundle react-canvas-lite as ESM (it uses WASM embedded inline — no separate fetch needed)
    include: ["@rive-app/react-canvas-lite"],
  },
  build: {
    // Raise warning limit — the bundle is large due to opensheetmusicdisplay and tone.js
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split out large vendor libs for better caching
        manualChunks(id: string) {
          if (id.includes("opensheetmusicdisplay")) return "vendor-osmd";
          if (id.includes("@rive-app")) return "vendor-rive";
          if (id.includes("/tone/") || id.includes("/tone@")) return "vendor-tone";
          if (id.includes("@tonejs/midi")) return "vendor-midi";
          if (id.includes("gsap")) return "vendor-gsap";
          if (id.includes("jszip")) return "vendor-zip";
          if (id.includes("tonal")) return "vendor-tonal";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
