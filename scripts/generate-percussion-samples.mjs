// Genera el mapa de percusión real (FreePats World Percussion, CC0) a partir
// del SFZ oficial: cada pieza trae VARIOS golpes distintos (round-robin), que es
// lo que evita el efecto ametralladora de repetir el mismo sample.
import { writeFileSync } from "node:fs";

const BASE =
  "https://raw.githubusercontent.com/freepats/world-percussion/main/";
const SFZ = BASE + "WorldPercussion%2020200905.sfz";

const res = await fetch(SFZ);
if (!res.ok) throw new Error(`SFZ ${res.status}`);
const text = await res.text();

/** key de FreePats → { samples: string[], hiVel?: string[] } */
const byKey = new Map();
let current = null;
for (const rawLine of text.split("\n")) {
  const line = rawLine.trim();
  const group = line.match(/^key=(\d+)/);
  if (line.startsWith("<group>")) {
    current = null;
    continue;
  }
  if (group) {
    const key = Number(group[1]);
    current = byKey.get(key) ?? { samples: [] };
    byKey.set(key, current);
    continue;
  }
  const sample = line.match(/^sample=(.+)$/);
  if (sample && current) {
    current.samples.push(sample[1].trim());
    continue;
  }
  const vel = line.match(/^(hi|lo)vel=(\d+)/);
  if (vel && current) current[`${vel[1]}vel`] = Number(vel[2]);
}

/** FreePats key → notas GM (canal 10) a las que sirve ese golpe. */
const KEY_TO_GM = {
  48: [35, 36], // cajón flamenco grave ≈ bombo / caja vallenata
  49: [36, 35],
  50: [36, 37], // cajón slap ≈ side stick / caja
  51: [62], // bongó apagado
  52: [60], // bongó alto
  53: [61], // bongó bajo
  54: [82], // egg shaker lento
  55: [82], // egg shaker rápido
  56: [82, 69], // egg shaker suave ≈ cabasa
  57: [54], // pandereta
  58: [54], // pandereta rápida
  59: [39], // palmas
  60: [75, 37], // claves / side stick
  61: [85], // castañuelas
  62: [63], // conga abierta
  63: [64], // conga baja
  64: [63], // conga alta
  65: [62], // conga apagada
  66: [64, 62], // conga baja apagada
  67: [70], // maracas (ida)
  68: [70, 69], // maracas (vuelta) ≈ cabasa
};

const out = {};
for (const [key, gms] of Object.entries(KEY_TO_GM)) {
  const entry = byKey.get(Number(key));
  if (!entry || entry.samples.length === 0) {
    console.warn(`⚠️  key ${key} sin samples`);
    continue;
  }
  for (const gm of gms) {
    out[gm] = out[gm] ?? [];
    for (const s of entry.samples) {
      // Solo audio decodable en el navegador, con URL absoluta.
      if (!/\.(flac|wav|ogg|mp3)$/i.test(s)) continue;
      const url = BASE + s.split("/").map(encodeURIComponent).join("/");
      if (!out[gm].includes(url)) out[gm].push(url);
    }
  }
}

console.log("piezas GM cubiertas:", Object.keys(out).sort((a, b) => a - b).join(", "));
for (const [gm, urls] of Object.entries(out)) {
  console.log(`  GM ${gm}: ${urls.length} golpes`);
}

const banner = `/**
 * percussionSamples — percusión latina REAL (FreePats World Percussion, CC0 1.0).
 *
 * Generado desde el SFZ oficial \`WorldPercussion 20200905.sfz\` del repo
 * freepats/world-percussion. Cada nota GM trae VARIOS golpes grabados
 * (round-robin): repetir el mismo sample en una figura de 16avos suena a
 * ametralladora, alternar 8-11 golpes distintos suena a percusionista.
 *
 * Los golpes son FLAC servidos por raw.githubusercontent.com con
 * \`Access-Control-Allow-Origin: *\`.
 *
 * Piezas que NO existen acá (bombo de batería, redoblante, hi-hats, platillos,
 * toms, güiro, agogo) las cubre el kit GM de WebAudioFont — ver DrumKitEngine.
 */

/** Nota GM (canal 10) → lista de URLs de golpes distintos. */
export const PERCUSSION_SAMPLES: Record<number, string[]> = `;

writeFileSync(
  "app/src/engine/percussionSamples.ts",
  `${banner}${JSON.stringify(out, null, 2)};\n`,
);
console.log("\n✔ escrito app/src/engine/percussionSamples.ts");
