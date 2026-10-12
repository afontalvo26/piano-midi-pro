// ¿Cuántas notas se cortan? Compara la duración pedida por los MIDI contra la
// duración real de los samples de cada fuente (soundfont GM = 3.15 s sin loop).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Midi } from "../app/node_modules/@tonejs/midi/dist/Midi.js";

const dir = "app/public/demo";
const files = readdirSync(dir).filter((f) => /\.(mid|kar|midi)$/i.test(f));

const byProgram = new Map();
let totalNotes = 0;
let over3 = 0;
let over5 = 0;
let sustainedOver3 = 0;

const SUSTAINED = new Set([
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 40, 41, 42, 43, 44, 48, 49, 50, 51,
  52, 53, 54, 56, 57, 58, 59, 60, 61, 64, 65, 66, 67, 68, 70, 71, 72, 73, 74,
  75, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 109,
]);

for (const f of files) {
  const buf = readFileSync(join(dir, f));
  let midi;
  try {
    midi = new Midi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  } catch {
    continue;
  }
  for (const t of midi.tracks) {
    if (t.notes.length === 0 || t.channel === 9) continue;
    const program = t.instrument?.number ?? 0;
    const entry = byProgram.get(program) ?? { notas: 0, largas: 0, maxDur: 0 };
    for (const n of t.notes) {
      totalNotes++;
      const d = n.duration;
      if (d > entry.maxDur) entry.maxDur = d;
      if (d > 3.15) {
        entry.largas++;
        over3++;
        if (d > 5) over5++;
        if (SUSTAINED.has(program)) sustainedOver3++;
      }
    }
    entry.notas += t.notes.length;
    byProgram.set(program, entry);
  }
}

console.log(`notas melódicas totales: ${totalNotes}`);
console.log(
  `más largas que 3.15 s (límite del soundfont GM): ${over3} (${((over3 / totalNotes) * 100).toFixed(1)}%)`,
);
console.log(`más largas que 5 s: ${over5}`);
console.log(`de ésas, en instrumentos SOSTENIDOS: ${sustainedOver3}`);
console.log(`\n--- por programa (top 25 por notas largas) ---`);
[...byProgram.entries()]
  .filter(([, e]) => e.largas > 0)
  .sort((a, b) => b[1].largas - a[1].largas)
  .slice(0, 25)
  .forEach(([p, e]) =>
    console.log(
      `  prog ${String(p).padStart(3)}  ${String(e.largas).padStart(5)} largas de ${String(e.notas).padStart(6)}  (máx ${e.maxDur.toFixed(1)} s)`,
    ),
  );
