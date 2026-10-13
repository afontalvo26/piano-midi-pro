// ¿Qué pide la canción en sus primeros segundos? Sirve para elegir el tope de
// espera de samples sin arrancar en silencio. (Herramienta de diagnóstico.)
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(path.join(process.cwd(), "app", "package.json"));
const { Midi } = require("@tonejs/midi");

const file = process.argv[2] ?? "app/public/demo/BinomioDeOro_-_El_Osito_Dormilon.kar";
const midi = new Midi(fs.readFileSync(file));

const all = [];
for (const [i, track] of midi.tracks.entries()) {
  for (const note of track.notes) {
    all.push({
      t: note.time,
      midi: note.midi,
      track: i,
      name: track.name || `(pista ${i})`,
      instrument: track.instrument?.name ?? "?",
      channel: track.channel,
    });
  }
}
all.sort((a, b) => a.t - b.t);

console.log(`archivo: ${file}`);
console.log(`notas: ${all.length} | duración: ${midi.duration.toFixed(1)}s`);
console.log(`primera nota: ${all[0].t.toFixed(2)}s (${all[0].name} / ${all[0].instrument})`);
console.log(`\nprimeras 12 notas:`);
for (const n of all.slice(0, 12)) {
  console.log(`  ${n.t.toFixed(2)}s  midi ${n.midi}  pista ${n.track} "${n.name}" / ${n.instrument}${n.channel === 9 ? " (percusión)" : ""}`);
}
for (const win of [1, 2, 3, 5]) {
  const inWindow = all.filter((n) => n.t <= win);
  const instruments = [...new Set(inWindow.map((n) => n.instrument))];
  console.log(
    `\nhasta ${win}s: ${inWindow.length} notas, instrumentos: ${instruments.join(", ") || "(ninguno)"}`,
  );
}
const silentUntil = all.length ? all[0].t : 0;
console.log(`\nsilencio inicial del MIDI: ${silentUntil.toFixed(2)}s`);
