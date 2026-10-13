import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath, URL } from "node:url";

/**
 * Configuración del reproductor independiente.
 *
 * Tres decisiones que importan:
 *
 * 1. **Puerto 1235 con `strictPort`.** El piano vive en el 1234 y el dueño lo
 *    está usando: si el 1235 estuviera ocupado queremos que Vite FALLE en vez de
 *    saltar a otro puerto en silencio (un reproductor corriendo en un puerto
 *    desconocido es peor que un error claro).
 *
 * 2. **El código compartido NO se copia: se importa con el alias `@shared`.** `@shared`
 *    apunta a `../packages`, el hogar neutro que no es "del piano" ni "del
 *    reproductor". Ahí viven el motor de audio, los componentes compartidos, el
 *    estado del reproductor y las utilidades, así que las dos apps comparten
 *    literalmente los mismos archivos (una sola fuente de verdad). Si hay que
 *    tocar el motor, se toca en `packages/engine/`.
 *
 *    `@app` y `@engine` quedan SÓLO para las dependencias inversas que el
 *    codemod reporta (`packages/README.md` §6). No se usan para código nuevo.
 *
 * 3. **Las demos tampoco se copian.** `app/public/demo` (los ~200 MIDI del
 *    proyecto) se sirve en `/demo/...` con un middleware propio: son los mismos
 *    archivos y no hay una segunda copia que se desactualice.
 */
const packagesDir = fileURLToPath(new URL("../packages", import.meta.url));
const engineDir = fileURLToPath(new URL("../app/src/engine", import.meta.url));
const appSrcDir = fileURLToPath(new URL("../app/src", import.meta.url));
const demoDir = fileURLToPath(new URL("../app/public/demo", import.meta.url));

/**
 * Sirve `app/public/demo` en `/demo/<archivo>`.
 *
 * Sólo archivos sueltos del directorio (nada de subcarpetas ni `..`): es un
 * servidor de demos, no un file browser.
 */
function demoFilesPlugin(): Plugin {
  const MIME: Record<string, string> = {
    ".mid": "audio/midi",
    ".midi": "audio/midi",
    ".kar": "audio/midi",
    ".rmi": "audio/midi",
  };

  return {
    name: "player-demo-files",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const raw = request.url ?? "";
        if (!raw.startsWith("/demo/")) return next();

        const path = raw.slice("/demo/".length).split("?")[0];
        const fileName = basename(decodeURIComponent(path));
        const filePath = join(demoDir, fileName);

        if (
          fileName !== decodeURIComponent(path) ||
          !existsSync(filePath) ||
          !statSync(filePath).isFile()
        ) {
          response.statusCode = 404;
          response.end(`demo no encontrada: ${fileName}`);
          return;
        }

        const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
        response.setHeader("Content-Type", MIME[extension] ?? "application/octet-stream");
        response.setHeader("Cache-Control", "no-cache");
        createReadStream(filePath).pipe(response);
      });
    },
    // En el build las demos se sirven desde el server estático del proyecto
    // (`app/public`), así que el bundle no las copia.
  };
}

export default defineConfig({
  plugins: [react(), demoFilesPlugin()],
  resolve: {
    alias: [
      // El hogar neutro del código compartido. Es el alias de todo lo nuevo:
      // no lleva el nombre de ninguna app, así que mover algo de `app/` a
      // `packages/` no obliga a renombrar el import acá.
      { find: /^@shared\//, replacement: `${packagesDir}/` },
      // Sólo la forma con barra: `@engine/instrumentSources`. El piano no tiene
      // `engine/index.ts` y no queremos agregarle uno sólo para el reproductor.
      // En retirada: desaparece cuando `engine/` ya viva en `packages/`.
      { find: /^@engine\//, replacement: `${engineDir}/` },
      // Los pocos módulos de `app/src` que el reproductor necesita y que NO son
      // motor (parser de MIDI, tipos de canción, timing, mapeo GM): fuente única.
      { find: /^@app\//, replacement: `${appSrcDir}/` },
    ],
  },
  server: {
    port: 1235,
    strictPort: true,
    // Escucha en IPv4 **y** IPv6: sin esto quedaba sólo en `::1` y un navegador
    // que resuelve `localhost` a 127.0.0.1 veía el reproductor caído (mismo
    // problema que tenía el piano).
    host: true,
    fs: {
      // El dev server sirve archivos fuera de `player/`: el motor vive en
      // `../app/src`. Sin esto Vite responde 403 a esos módulos.
      allow: [fileURLToPath(new URL("..", import.meta.url))],
    },
  },
  preview: {
    port: 1235,
    strictPort: true,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("/tone/") || id.includes("/tone@")) return "vendor-tone";
          if (id.includes("@tonejs/midi")) return "vendor-midi";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
