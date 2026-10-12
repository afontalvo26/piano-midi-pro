// Verificacion del pack de salsa: lee cada archivo con el MISMO parser que usa
// la app en runtime (@tonejs/midi) y reporta tempo, duracion e instrumentacion.
//
// Un .kar es un MIDI con una pista extra de letra; si el stream de letra esta
// malformado, @tonejs/midi tira. Este script lo detecta antes de que el archivo
// llegue a la biblioteca de canciones.
//
// Uso: node scripts/salsa-verify.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEMO = path.resolve('app/public/demo');

const toneMidi = await import(
  pathToFileURL(path.resolve('app/node_modules/@tonejs/midi/build/Midi.js')).href
);
const Midi = toneMidi.Midi ?? toneMidi.default?.Midi ?? toneMidi.default;

const files = (await fs.readdir(DEMO))
  .filter((f) => /\.(kar|mid)$/i.test(f))
  .sort();

const salsa = files.filter((f) => f.endsWith('.kar'));
const otros = files.filter((f) => f.endsWith('.mid'));

console.log(`== pack demo: ${files.length} archivos (${salsa.length} .kar, ${otros.length} .mid) ==\n`);

const filas = [];
let rotos = 0;

for (const f of salsa) {
  const buf = await fs.readFile(path.join(DEMO, f));
  const esMidi = buf.slice(0, 4).toString('ascii') === 'MThd';
  try {
    const m = new Midi(buf);
    const conNotas = m.tracks.filter((t) => t.notes.length);
    const totalNotas = conNotas.reduce((a, t) => a + t.notes.length, 0);
    const piano = m.tracks.find((t) => /piano/i.test(t.instrument?.name || '') && t.notes.length);
    const perc = m.tracks.find((t) => t.channel === 9 && t.notes.length);
    const bpm = m.header.tempos[0]?.bpm ?? 0;
    filas.push({
      archivo: f,
      ok: true,
      bpm: bpm ? bpm.toFixed(0) : '-',
      dur: `${Math.floor(m.duration / 60)}:${String(Math.round(m.duration % 60)).padStart(2, '0')}`,
      pistas: conNotas.length,
      notas: totalNotas,
      piano: piano ? piano.notes.length : 0,
      perc: perc ? perc.notes.length : 0,
    });
  } catch (e) {
    rotos++;
    filas.push({ archivo: f, ok: false, bpm: '-', dur: '-', pistas: 0, notas: 0, piano: 0, perc: 0, err: e.message });
  }
}

const ancho = Math.max(...filas.map((r) => r.archivo.length), 10) + 2;
const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad('archivo', ancho) + pad('bpm', 6) + pad('dur', 7) + pad('pistas', 8) + pad('notas', 8) + pad('piano', 7) + 'perc'
);
console.log('-'.repeat(ancho + 36));
for (const r of filas) {
  if (!r.ok) {
    console.log(pad(r.archivo, ancho) + 'ROTO: ' + r.err);
    continue;
  }
  console.log(
    pad(r.archivo, ancho) +
      pad(r.bpm, 6) +
      pad(r.dur, 7) +
      pad(r.pistas, 8) +
      pad(r.notas, 8) +
      pad(r.piano, 7) +
      r.perc
  );
}

const conPiano = filas.filter((r) => r.ok && r.piano > 0).length;
console.log(`\nresumen: ${filas.length - rotos}/${filas.length} legibles | ${conPiano} con pista de piano | ${rotos} rotos`);
if (rotos) console.log('ATENCION: los archivos rotos hay que sanear antes de meterlos a la biblioteca.');
