// ============================================================
// qa-all-fixture — genera un .mid de QA sin silencio inicial.
//
// POR QUÉ: la medición de "arranque en frío" con una canción del demo no mide
// el arranque, mide el silencio que la propia canción trae al principio
// (Bésame Mucho: primera nota de percusión en 4,35 s y melódicas en 5,9–6,0 s).
// Con este fixture la primera nota cae en t = 0, así que la primera señal
// audible ES el arranque del motor.
//
// Sin dependencias: escribe el Standard MIDI File a mano (formato 1, división
// 480 ticks por negra, 120 BPM → 1 negra = 0,5 s).
//
// Uso:  node scripts/qa-all-fixture.mjs
// Sale: app/public/demo/QA_Arranque_0s.mid
// ============================================================

import { writeFileSync } from "node:fs";

const PPQ = 480; // ticks por negra
const BPM = 120;
const TICKS_PER_SEC = (PPQ * BPM) / 60; // 960

const varLen = (n) => {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
};

const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n) => [(n >>> 8) & 0xff, n & 0xff];

/** Construye una pista (MTrk) a partir de eventos delta-tick. */
const track = (eventos) => {
  const cuerpo = [];
  for (const [delta, payload] of eventos) {
    cuerpo.push(...varLen(delta), ...payload);
  }
  cuerpo.push(...varLen(0), 0xff, 0x2f, 0x00); // end of track
  return [...Buffer.from("MTrk", "ascii"), ...u32(cuerpo.length), ...cuerpo];
};

const seg = (s) => Math.round(s * TICKS_PER_SEC);

// ── Pista 0: tempo + compás ─────────────────────────────────────────────────
const NOMBRE = "QA Arranque";
const metaTrack = track([
  // tempo: 3 bytes big-endian de microsegundos por negra
  [0, [0xff, 0x51, 0x03, (60_000_000 / BPM >> 16) & 0xff, (60_000_000 / BPM >> 8) & 0xff, 60_000_000 / BPM & 0xff]],
  [0, [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08]], // 4/4
  // nombre de pista: la longitud tiene que ser la REAL en bytes, no un número a ojo
  [0, [0xff, 0x03, ...varLen(Buffer.byteLength(NOMBRE, "latin1")), ...Buffer.from(NOMBRE, "latin1")]],
]);

// ── Pista 1: piano (programa 0), primera nota en t = 0 ──────────────────────
// Do mayor ascendente, negras, velocity alta: señal fuerte y sin ambigüedad.
const NOTAS = [60, 64, 67, 72, 67, 64, 60, 72];
const blancas = NOTAS.map((midi, i) => [seg(i * 0.5), midi]);
const eventosPiano = [[0, [0xc0, 0x00]]]; // program change → Acoustic Grand Piano
for (const [tick, midi] of blancas) {
  // note-on con delta calculado después; se arma la lista ordenada por tiempo
  eventosPiano.push([tick, [0x90, midi, 100]]);
  eventosPiano.push([tick + seg(0.45), [0x80, midi, 0]]);
}
// Ordenar por tick acumulado y recalcular deltas.
const absolutos = [];
let acc = 0;
for (const [delta, payload] of eventosPiano) {
  acc += delta;
  absolutos.push({ tick: acc, payload, orden: absolutos.length });
}
absolutos.sort((a, b) => a.tick - b.tick || a.orden - b.orden);
const pianoOrdenado = [];
let prev = 0;
for (const e of absolutos) {
  pianoOrdenado.push([e.tick - prev, e.payload]);
  prev = e.tick;
}
const pianoTrack = track(pianoOrdenado);

// ── Ensamblado ──────────────────────────────────────────────────────────────
const pistas = [metaTrack, pianoTrack];
const cabecera = [...Buffer.from("MThd", "ascii"), ...u32(6), ...u16(1), ...u16(pistas.length), ...u16(PPQ)];
const bytes = Buffer.from([...cabecera, ...pistas.flat()]);

const DESTINO = "app/public/demo/QA_Arranque_0s.mid";
writeFileSync(DESTINO, bytes);

const primeraNota = Math.min(...blancas.map(([t]) => t)) / TICKS_PER_SEC;
const ultimaNota = Math.max(...blancas.map(([t]) => t)) / TICKS_PER_SEC + 0.45;
console.log(`escrito ${DESTINO} (${bytes.length} bytes)`);
console.log(`  formato 1 · ${pistas.length} pistas · ${PPQ} ppq · ${BPM} BPM`);
console.log(`  primera nota en t = ${primeraNota.toFixed(2)} s (percusión: ninguna) · última termina en ${ultimaNota.toFixed(2)} s`);
console.log(`  ${NOTAS.length} notas de piano, programa 0 (Acoustic Grand Piano)`);
