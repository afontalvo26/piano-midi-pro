import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/**
 * Rutas del código compartido.
 *
 * `packages/` está en la raíz del repo, o sea FUERA de `app/`. Dos
 * consecuencias que hay que declarar sí o sí:
 *
 *  1. El alias `@shared/*` (acá y en `tsconfig.app.json`) — si se declara en un
 *     solo lado, la app compila pero `tsc -b` falla, o al revés.
 *  2. `server.fs.allow` con la raíz del repo — sin esto el dev server responde
 *     **403** a los módulos de `packages/` y el error no dice por qué.
 */
const packagesDir = fileURLToPath(new URL("../packages", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // El hogar neutro del código compartido (motor, componentes compartidos,
      // estado del reproductor, utilidades). Es el alias de todo lo nuevo.
      { find: /^@shared\//, replacement: `${packagesDir}/` },
      // `@app/*` existe SÓLO para las dependencias inversas que el codemod
      // reporta (`packages/README.md` §6): código compartido que necesita algo
      // que se queda en el piano. No se usa para código nuevo.
      { find: /^@app\//, replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/` },
    ],
  },
  server: {
    port: 1234,
    strictPort: true,
    // `host: true` escucha en IPv4 **y** IPv6. Sin esto Vite quedaba sólo en
    // `::1`: un navegador que resuelve `localhost` a 127.0.0.1 veía la app
    // caída aunque el servidor estuviera vivo (nos pasó y costó encontrarlo).
    host: true,
    fs: {
      // El dev server tiene que poder servir `packages/`, que está fuera de
      // `app/`. La raíz del repo contiene a `app/`, así que no se pierde nada.
      allow: [repoRoot],
    },
  },
  preview: {
    port: 1234,
    strictPort: true,
    host: true,
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
