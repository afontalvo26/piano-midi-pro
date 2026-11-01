import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1234,
    strictPort: true,
    // `host: true` escucha en IPv4 **y** IPv6. Sin esto Vite quedaba sólo en
    // `::1`: un navegador que resuelve `localhost` a 127.0.0.1 veía la app
    // caída aunque el servidor estuviera vivo (nos pasó y costó encontrarlo).
    host: true,
  },
  preview: {
    port: 1234,
    strictPort: true,
    host: true,
  },
  build: {
    // The Tone audio graph can still make a large vendor chunk.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split out large vendor libs for better caching
        manualChunks(id: string) {
          if (id.includes("/tone/") || id.includes("/tone@")) return "vendor-tone";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
