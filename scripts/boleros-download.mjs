// Bolero pack downloader for piano-midi-pro.
//
// Downloads the curated "abuelos" bolero set from karaokegratis.com.ar (each
// .zip holds one karaoke MIDI), picks the entry with the most notes, and
// validates it with the *same* parser the app uses at runtime (@tonejs/midi),
// so a file that lands in app/public/demo/ is guaranteed to render in the song
// library. Files whose karaoke/lyric meta stream is malformed (which makes
// @tonejs/midi throw) are sanitized automatically — see sanitizeMidi().
//
// After running this, run `node scripts/boleros-verify.mjs` and update the
// catalogue in app/src/constants/demoBoleros.ts (bpm values are read from the
// downloaded files).
//
// Usage: node scripts/boleros-download.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const OUT_DIR = path.resolve('app/public/demo');
const BASE = 'https://www.karaokegratis.com.ar/wp-content/uploads/2018/06/';
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: '*/*',
};

// Resolve @tonejs/midi from the app workspace (same code path the browser uses).
const toneMidi = await import(
  pathToFileURL(path.resolve('app/node_modules/@tonejs/midi/build/Midi.js')).href
);
const Midi = toneMidi.Midi ?? toneMidi.default?.Midi ?? toneMidi.default;

/**
 * The curated pack: `pack` is the source zip on karaokegratis, `artist`/`song`
 * are what the library shows. `as` overrides the file title when two songs
 * would collide on the same filename. The trailing `bpm` is the tempo read back
 * from the previous run and is informational only — both the report and the app
 * take the tempo from the MIDI file itself.
 * @type {{ artist: string, song: string, pack: string, as?: string, bpm?: number }[]}
 */
const PACK = [
  // ── Los Panchos: el trío que cantaba la abuela ──
  { artist: 'Los Panchos', song: 'Bésame Mucho', pack: 'Bolero clasico - Besame mucho.zip', bpm: 96 },
  { artist: 'Los Panchos', song: 'Solamente Una Vez', pack: 'Bolero clasico - Solamente una vez.zip', bpm: 92 },
  { artist: 'Los Panchos', song: 'Quizás, Quizás, Quizás', pack: 'Los Panchos - Quizas.zip', bpm: 120 },
  { artist: 'Los Panchos', song: 'El Reloj', pack: 'Bolero clasico - Reloj.zip', bpm: 84 },
  { artist: 'Los Panchos', song: 'Perfidia', pack: 'Bolero clasico - Perfidia.zip', bpm: 100 },
  { artist: 'Los Panchos', song: 'Piel Canela', pack: 'Los Panchos - Piel Canela.zip', bpm: 128 },
  { artist: 'Los Panchos', song: 'Rayito De Luna', pack: 'Los Panchos - Rayito de luna.zip', bpm: 92 },
  { artist: 'Los Panchos', song: 'Sin Ti', pack: 'Bolero clasico - Sin ti.zip', bpm: 88 },
  { artist: 'Los Panchos', song: 'Un Siglo De Ausencia', pack: 'Los Panchos - Un Siglo De Ausencia.zip', bpm: 90 },
  { artist: 'Los Panchos', song: 'Nosotros', pack: 'Bolero clasico - Nosotros.zip', bpm: 88 },
  { artist: 'Los Panchos', song: 'Obsesión', pack: 'Bolero clasico - Obsesion.zip', bpm: 92 },
  { artist: 'Los Panchos', song: 'Espérame En El Cielo', pack: 'Los Panchos - Esperame En El Cielo.zip', bpm: 84 },
  { artist: 'Los Panchos', song: 'Gema', pack: 'Los Panchos - Gema.zip', bpm: 96 },
  { artist: 'Los Panchos', song: 'Caminemos', pack: 'Los Panchos - Caminemos.zip', bpm: 88 },
  { artist: 'Los Panchos', song: 'Poquita Fe', pack: 'Los Panchos - Poquita fe.zip', bpm: 92 },
  { artist: 'Los Panchos', song: 'Una Copa Más', pack: 'Los Panchos - Una Copa Mas.zip', bpm: 92 },
  { artist: 'Los Panchos', song: 'Mil Besos', pack: 'Los Panchos - Mil Besos.zip', bpm: 96 },
  { artist: 'Los Panchos', song: 'La Hiedra', pack: 'Bolero clasico - La hiedra.zip', bpm: 92 },
  { artist: 'Los Panchos', song: 'Cerca Del Mar', pack: 'Los Panchos - Cerca Del Mar.zip', bpm: 96 },
  { artist: 'Los Panchos', song: 'Si Tú Me Dices Ven', pack: 'Los Panchos - Si tu me dices ven.zip', bpm: 100 },
  { artist: 'Los Panchos', song: 'Triunfamos', pack: 'Los Panchos - Triunfamos.zip', bpm: 96 },
  { artist: 'Los Panchos', song: 'Alma Corazón Y Vida', pack: 'Los Panchos - Alma corazon y vida.zip', bpm: 96 },
  { artist: 'Los Panchos', song: 'Cachito', pack: 'Los Panchos - Cachito.zip', bpm: 108 },
  { artist: 'Los Panchos', song: 'Historia De Un Amor', pack: 'Los Panchos - Historia de un amor.zip', bpm: 92 },
  { artist: 'Los Panchos', song: 'Voy A Perder La Cabeza Por Tu Amor', pack: 'Los Panchos - Voy A Perder La Cabeza Por Tu Amor.zip', bpm: 100 },
  { artist: 'Los Panchos', song: 'No Me Quieras Tanto', pack: 'Los Panchos - No Me Quieras Tanto.zip', bpm: 88 },
  { artist: 'Los Panchos', song: 'La Última Noche', pack: 'Los Panchos - La ultima noche.zip', bpm: 96 },
  { artist: 'Los Panchos', song: 'Sabrás Que Te Quiero', pack: 'Los Panchos - Sabras Que Te Quiero.zip', bpm: 92 },

  // ── Lucho Gatica: el bolero con voz de terciopelo ──
  { artist: 'Lucho Gatica', song: 'Contigo En La Distancia', pack: 'Lucho Gatica - Contigo en la distancia.zip', bpm: 88 },
  { artist: 'Lucho Gatica', song: 'Amor Perdido', pack: 'Lucho Gatica - Amor perdido.zip', bpm: 92 },
  { artist: 'Lucho Gatica', song: 'Mil Noches', pack: 'Lucho Gatica - Mil noches.zip', bpm: 84 },
  { artist: 'Lucho Gatica', song: 'Sabrá Dios', pack: 'Lucho Gatica - Sabra Dios.zip', bpm: 92 },
  { artist: 'Lucho Gatica', song: 'Si Me Comprendieras', pack: 'Lucho Gatica - Si me comprendieras.zip', bpm: 88 },
  { artist: 'Lucho Gatica', song: 'Son Golpes Que Da La Vida', pack: 'Lucho Gatica - Son golpes que da la vida.zip', bpm: 92 },

  // ── Julio Jaramillo: el ruiseñor de América ──
  { artist: 'Julio Jaramillo', song: 'Sombras', pack: 'Julio Jaramillo - Sombras.zip', bpm: 88 },
  { artist: 'Julio Jaramillo', song: 'Nuestro Juramento', pack: 'Julio Jaramillo - Nuestro Juramento.zip', bpm: 88 },
  { artist: 'Julio Jaramillo', song: 'Ódiame', pack: 'Julio Jaramillo - Odiame.zip', bpm: 92 },
  { artist: 'Julio Jaramillo', song: 'Fatalidad', pack: 'Julio Jaramillo - Fatalidad.zip', bpm: 96 },
  { artist: 'Julio Jaramillo', song: 'Alma En Los Labios', pack: 'Julio Jaramillo - Alma En Los Labios.zip', bpm: 92 },
  { artist: 'Julio Jaramillo', song: 'Que Nadie Sepa Mi Sufrir', pack: 'Julio Jaramillo - Que Nadie Sepa Mi Sufrir.zip', bpm: 96 },
  { artist: 'Julio Jaramillo', song: 'Adoración', pack: 'Julio Jaramillo - Adoracion.zip', bpm: 92 },
  { artist: 'Julio Jaramillo', song: 'Sendas Distintas', pack: 'Julio Jaramillo - Sendas distintas.zip', bpm: 92 },
  { artist: 'Julio Jaramillo', song: 'Guayaquil De Mis Amores', pack: 'Julio Jaramillo - Guayaquil de mis amores.zip', bpm: 96 },
  { artist: 'Julio Jaramillo', song: 'Un Disco Más', pack: 'Julio Jaramillo - Un Disco Mas.zip', bpm: 96 },

  // ── Agustín Lara: el compositor de la vida ──
  { artist: 'Agustín Lara', song: 'Amor De Mis Amores', pack: 'Agustin Lara - Amor De Mis Amores.zip', bpm: 88 },
  { artist: 'Agustín Lara', song: 'Farolito', pack: 'Agustin Lara - Farolito.zip', bpm: 92 },
  { artist: 'Agustín Lara', song: 'María Bonita', pack: 'Agustin Lara - Maria Bonita.zip', bpm: 92 },
  { artist: 'Agustín Lara', song: 'Palabras De Mujer', pack: 'Agustin Lara - Palabras de mujer.zip', bpm: 88 },
  { artist: 'Agustín Lara', song: 'Veracruz', pack: 'Agustin Lara - Veracruz.zip', bpm: 96 },
  { artist: 'Agustín Lara', song: 'Arráncame La Vida', pack: 'Agustin Lara - Arrancame la Vida.zip', bpm: 92 },

  // ── Armando Manzanero ──
  { artist: 'Armando Manzanero', song: 'Adoro', pack: 'Armando Manzanero - Adoro.zip', bpm: 84 },
  { artist: 'Armando Manzanero', song: 'Esta Tarde Vi Llover', pack: 'Armando Manzanero - Esta tarde vi llover.zip', bpm: 92 },
  { artist: 'Armando Manzanero', song: 'Contigo Aprendí', pack: 'Armando Manzanero - Contigo arpendi.zip', bpm: 88 },
  { artist: 'Armando Manzanero', song: 'Somos Novios', pack: 'Armando Manzanero - Somos novios.zip', bpm: 88 },
  { artist: 'Armando Manzanero', song: 'Voy A Apagar La Luz', pack: 'Armando Manzanero - Voy A Apagar La Luz.zip', bpm: 84 },
  { artist: 'Armando Manzanero', song: 'Parece Que Fue Ayer', pack: 'Armando Manzanero - Parece que fue ayer.zip', bpm: 92 },
  { artist: 'Armando Manzanero', song: 'Mía', pack: 'Armando Manzanero - Mia.zip', bpm: 88 },

  // ── Antonio Machín ──
  { artist: 'Antonio Machín', song: 'Dos Gardenias', pack: 'Antonio Machin - Dos gardenias.zip', bpm: 92 },
  { artist: 'Antonio Machín', song: 'Angelitos Negros', pack: 'Antonio Machin - Angelitos negros.zip', bpm: 84 },
  { artist: 'Antonio Machín', song: 'Corazón Loco', pack: 'Antonio Machin - Corazon Loco.zip', bpm: 96 },
  { artist: 'Antonio Machín', song: 'Toda Una Vida', pack: 'Antonio Machin - Toda una vida.zip', bpm: 88 },

  // ── Autores e intérpretes clásicos ──
  { artist: 'Roberto Cantoral', song: 'La Barca', pack: 'Roberto Cantoral - La barca.zip', bpm: 88 },
  { artist: 'Roberto Cantoral', song: 'Regálame Esta Noche', pack: 'Roberto Cantoral - Regalame Esta Noche.zip', bpm: 88 },
  { artist: 'Álvaro Carrillo', song: 'Sabor a Mí', pack: 'Álvaro Carrillo - Sabor A Mi V2.zip', bpm: 88 },
  { artist: 'Álvaro Carrillo', song: 'El Andariego', pack: 'Alvaro Carrillo - El Andariego.zip', bpm: 100 },
  { artist: 'Álvaro Carrillo', song: 'Se Te Olvida', pack: 'Alvaro Carrillo - Se Te Olvida.zip', bpm: 92 },
  { artist: 'Gonzalo Curiel', song: 'Incertidumbre', pack: 'Gonzalo Curiel - Incertidumbre.zip', bpm: 92 },
  { artist: 'Gonzalo Curiel', song: 'Vereda Tropical', pack: 'Bolero clasico - Vereda tropical.zip', bpm: 100 },
  { artist: 'Consuelo Velázquez', song: 'Amar Y Vivir', pack: 'Consuelo Velazquez - Amar Y Vivir.zip', bpm: 96 },
  { artist: 'Pedro Vargas', song: 'La Negra Noche', pack: 'Pedro Vargas - La Negra Noche.zip', bpm: 92 },
  { artist: 'Nelson Pinedo', song: 'Quién Será', pack: 'Nelson Pinedo - Quien sera.zip', bpm: 108 },

  // ── Colombia y el Caribe ──
  { artist: 'Olimpo Cárdenas', song: 'Lágrimas Del Alma', pack: 'Olimpo Cardenas - Lagrimas del Alma.zip', bpm: 88 },
  { artist: 'Alci Acosta', song: 'La Cárcel De Sing Sing', pack: 'Alci Acosta - La Carcel De Sing Sing.zip', bpm: 96 },
  { artist: 'Tito Rodríguez', song: 'Inolvidable', pack: 'Tito Rodriguez - Inolvidable.zip', bpm: 92 },
  { artist: 'Tito Rodríguez', song: 'El Que Se Fue', pack: 'Tito Rodriguez - El que se fue.zip', bpm: 96 },
  { artist: 'Leo Marini', song: 'La Puerta', pack: 'Boleros Clasicos - La Puerta.zip', bpm: 92 },
  { artist: 'La Sonora Matancera', song: 'En La Orilla Del Mar', pack: 'La Sonora Matancera - En La Orilla Del Mar.zip', bpm: 100 },
  { artist: 'Bienvenido Granda', song: 'En La Orilla Del Mar', pack: 'Bienvenido Granda - En La Orilla Del Mar.zip', as: 'En La Orilla Del Mar (Bienvenido Granda)', bpm: 96 },

  // ── Boleros clásicos sin intérprete de referencia ──
  { artist: 'Bolero Clásico', song: 'Tú Me Acostumbraste', pack: 'Bolero clasico - Tu me acostumbraste.zip', bpm: 88 },
  { artist: 'Bolero Clásico', song: 'La Gloria Eres Tú', pack: 'Boleros Clasicos - La Gloria Eres Tu.zip', bpm: 92 },
  { artist: 'Bolero Clásico', song: 'Soy Un Extraño', pack: 'Bolero clasico - Soy un extranio.zip', bpm: 88 },
  { artist: 'Bolero Clásico', song: 'Aquellos Boleros', pack: 'Bolero clasico - Aquellos Boleros.zip', bpm: 96 },
  { artist: 'Bolero Clásico', song: 'El Día Que Me Quieras', pack: 'Bolero clasico - El dia que me quieras.zip', bpm: 84 },
  { artist: 'Bolero Clásico', song: 'Madrigal', pack: 'Bolero clasico - Madrigal.zip', bpm: 92 },
  { artist: 'Bolero Clásico', song: 'Encadenados', pack: 'Bolero clasico - Encadenados.zip', bpm: 92 },
  { artist: 'Bolero Clásico', song: 'Nomas Contigo', pack: 'Bolero Clasico - Nomas Contigo.zip', bpm: 92 },
];

/** Extract every entry of a ZIP buffer (stored or deflate). */
function zipEntries(zip) {
  const out = [];
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i > zip.length - 70000; i--) {
    if (zip[i] === sig[0] && zip[i + 1] === sig[1] && zip[i + 2] === sig[2] && zip[i + 3] === sig[3]) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;
  const total = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break;
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.slice(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.(mid|kar)$/i.test(name)) continue;
    if (zip.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.slice(start, start + compSize);
    try {
      out.push({ name, data: method === 0 ? raw : zlib.inflateRawSync(raw) });
    } catch {
      /* skip broken entry */
    }
  }
  return out;
}

/** Parse with the app parser; returns null when the file is unusable. */
function inspect(buf) {
  if (buf.slice(0, 4).toString('ascii') !== 'MThd') return null;
  try {
    const midi = new Midi(buf);
    const notes = midi.tracks.reduce((a, t) => a + t.notes.length, 0);
    const tracksWithNotes = midi.tracks.filter((t) => t.notes.length > 0).length;
    if (notes <= 0) return null;
    return { midi, notes, tracksWithNotes, duration: midi.duration, bpm: midi.header.ppq ? (midi.header.tempos[0]?.bpm ?? null) : null };
  } catch {
    return null;
  }
}

const slug = (song) =>
  song
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

// Some karaoke authors (Victoriano Calvano / Walter Calvo files among them)
// write a lyric meta stream that @tonejs/midi cannot walk, so the whole file
// throws. The notes themselves are fine, so keep channel events plus the
// structural meta the app cares about (tempo, time and key signature,
// end-of-track) and drop the lyric/text and sysex events, which the app never
// reads — it renders a piano roll and a score.
const KEEP_META = new Set([0x51, 0x58, 0x59, 0x2f]);

/**
 * Rewrite every track keeping channel events + structural meta only.
 * @returns {{buffer: Buffer, dropped: number}}
 */
function sanitizeMidi(buf) {
  const header = buf.slice(0, 14);
  const tracks = [];
  let p = 14;
  while (p + 8 <= buf.length && buf.slice(p, p + 4).toString('ascii') === 'MTrk') {
    const len = buf.readUInt32BE(p + 4);
    tracks.push(buf.slice(p + 8, Math.min(p + 8 + len, buf.length)));
    p = p + 8 + len;
  }

  let dropped = 0;
  const bodies = tracks.map((body) => {
    const kept = [];
    let i = 0;
    let running = 0;
    while (i < body.length) {
      const start = i;
      let dtBytes = 0;
      let b;
      do {
        b = body[i];
        i++;
        dtBytes++;
      } while (b & 0x80 && dtBytes < 5 && i < body.length);
      if (i >= body.length) break;
      let status = body[i];
      if (status & 0x80) {
        i++;
        running = status;
      } else {
        status = running;
      }
      const hi = status & 0xf0;
      let keep = true;
      if (status === 0xff) {
        const type = body[i];
        const lenPos = i + 1;
        let l = 0;
        let lenBytes = 0;
        let bb;
        do {
          bb = body[lenPos + lenBytes];
          l = (l << 7) | (bb & 0x7f);
          lenBytes++;
        } while (bb & 0x80 && lenBytes < 5);
        i = lenPos + lenBytes + l;
        keep = KEEP_META.has(type);
      } else if (hi === 0xf0) {
        const lenPos = i;
        let l = 0;
        let lenBytes = 0;
        let bb;
        do {
          bb = body[lenPos + lenBytes];
          l = (l << 7) | (bb & 0x7f);
          lenBytes++;
        } while (bb & 0x80 && lenBytes < 5);
        i = lenPos + lenBytes + l;
        keep = false;
      } else {
        i += hi === 0xc0 || hi === 0xd0 ? 1 : 2;
      }
      if (i > body.length) break;
      if (keep) kept.push(body.slice(start, i));
      else dropped++;
    }
    if (!kept.length) kept.push(Buffer.from([0x00, 0xff, 0x2f, 0x00]));
    return Buffer.concat(kept);
  });

  const parts = [header];
  for (const body of bodies) {
    const h = Buffer.alloc(8);
    h.write('MTrk', 0, 'ascii');
    h.writeUInt32BE(body.length, 4);
    parts.push(h, body);
  }
  return { buffer: Buffer.concat(parts), dropped };
}

/**
 * Pick the best playable candidate from a pack, sanitizing when the raw file
 * cannot be parsed.
 * @returns {{data: Buffer, info: object, name: string, sanitized: number}|null}
 */
function pickBest(candidates) {
  const scored = candidates
    .map((c) => ({ ...c, info: inspect(c.data) }))
    .filter((c) => c.info)
    .sort((a, b) => b.info.notes - a.info.notes);
  if (scored.length) return { data: scored[0].data, info: scored[0].info, name: scored[0].name, sanitized: 0 };

  for (const c of candidates) {
    const { buffer, dropped } = sanitizeMidi(c.data);
    const info = inspect(buffer);
    if (info) return { data: buffer, info, name: c.name, sanitized: dropped };
  }
  return null;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const report = [];
  let ok = 0;
  let repaired = 0;
  for (const item of PACK) {
    const url = BASE + encodeURIComponent(item.pack);
    const label = `${item.artist} - ${item.song}`;
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());

      let candidates;
      let ext;
      if (buf.slice(0, 4).toString('ascii') === 'MThd') {
        candidates = [{ name: 'direct.mid', data: buf }];
        ext = '.mid';
      } else if (buf[0] === 0x50 && buf[1] === 0x4b) {
        candidates = zipEntries(buf);
        if (!candidates.length) throw new Error('zip sin .mid/.kar');
      } else {
        throw new Error(`formato desconocido (${buf.slice(0, 8).toString('hex')})`);
      }

      const best = pickBest(candidates);
      if (!best) throw new Error('ningún MIDI válido dentro del pack');

      if (ext !== '.mid') ext = /\.kar$/i.test(best.name) ? '.kar' : '.mid';
      const file = `Bolero_-_${slug(item.as ?? item.song)}${ext}`;
      await fs.writeFile(path.join(OUT_DIR, file), best.data);
      if (best.sanitized) repaired++;
      report.push({
        artist: item.artist,
        song: item.song,
        file,
        path: `/demo/${file}`,
        bpm: Math.round(best.info.bpm ?? 0) || null,
        notes: best.info.notes,
        tracks: best.info.tracksWithNotes,
        duration: Math.round(best.info.duration),
        bytes: best.data.length,
        sanitizedEvents: best.sanitized,
        status: 'ok',
      });
      ok++;
      console.log(
        `OK   ${label.padEnd(46)} -> ${file.padEnd(52)} ${String(best.info.notes).padStart(5)} notas  ${best.info.duration.toFixed(0).padStart(4)}s${best.sanitized ? `  (sanitizado: ${best.sanitized} eventos de letra)` : ''}`,
      );
    } catch (e) {
      report.push({ artist: item.artist, song: item.song, pack: item.pack, status: 'fail', error: e.message });
      console.log(`FAIL ${label.padEnd(46)}    ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 220));
  }
  await fs.writeFile('scripts/boleros-download-report.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(
    `\nDONE: ${ok}/${PACK.length} archivos en app/public/demo/ (${repaired} sanitizados) -> scripts/boleros-download-report.json`,
  );
}

main();
