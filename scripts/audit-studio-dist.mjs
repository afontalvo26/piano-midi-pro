#!/usr/bin/env node
/**
 * Production artifact gate: retired app sections must not be shipped, and the
 * seven offline Salamander core OGG samples must remain in every build.
 *
 * Run after Vite: node scripts/audit-studio-dist.mjs
 */
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const dist = resolve(process.cwd(), "app/dist");
const required = ["C3", "C4", "C5", "C6", "Fs3", "Fs4", "Fs5"]
  .map((note) => `audio/salamander/core/${note}.ogg`);
const forbiddenDirs = new Set(["demo", "covers", "samples", "player"]);
const errors = [];
const files = [];
try {
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      const relativeFile = relative(dist, full).split(sep).join("/");
      if (entry.isDirectory()) {
        if (forbiddenDirs.has(entry.name.toLowerCase())) {
          errors.push(`Ruta retirada publicada: ${relativeFile}/`);
        }
        await walk(full);
      } else if (entry.isFile()) {
        files.push(relativeFile);
      } else if (entry.isSymbolicLink()) {
        errors.push(`Enlace simbólico no permitido en dist: ${relativeFile}`);
      }
    }
  }
  await walk(dist);
  for (const sample of required) {
    if (!files.includes(sample)) {
      errors.push(`Falta audio núcleo sin conexión: ${sample}`);
    } else if ((await stat(join(dist, sample))).size === 0) {
      errors.push(`Archivo de audio núcleo vacío: ${sample}`);
    }
  }
  const retiredAssets = files.filter((path) =>
    path.split("/").some((piece) => forbiddenDirs.has(piece.toLowerCase())));
  for (const path of retiredAssets) errors.push(`Activo retirado en dist: ${path}`);
} catch (error) {
  errors.push(`No se pudo auditar ${dist}: ${String(error)}`);
}
if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exitCode = 1;
} else {
  console.log(`PASS dist: ${files.length} archivos, 0 rutas retiradas, ${required.length} muestras OGG núcleo presentes`);
}
