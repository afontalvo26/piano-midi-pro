// Genera app/src/constants/demoSalsa.ts a partir de los .kar que estan en
// app/public/demo/, leyendo el BPM real de cada archivo con el mismo parser que
// usa la app (@tonejs/midi).
//
// Por que un generador y no escribirlo a mano: son 41 filas y el BPM tiene que
// coincidir con el archivo, no con lo que uno recuerde. Si se re-baja el pack,
// se vuelve a correr esto y el catalogo queda en sincronia.
//
// Uso: node scripts/salsa-catalogue.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEMO = path.resolve('app/public/demo');
const OUT = path.resolve('app/src/constants/demoSalsa.ts');

const toneMidi = await import(
  pathToFileURL(path.resolve('app/node_modules/@tonejs/midi/build/Midi.js')).href
);
const Midi = toneMidi.Midi ?? toneMidi.default?.Midi ?? toneMidi.default;

/**
 * Nombre visible y artista por archivo.
 *
 * El nombre de archivo viene del zip de origen y tiene la ñ/á mutilada
 * ("Sin_tu_cari_o"): el zip declara los nombres en Latin-1 y eso viaja mal por
 * el parser de ZIP. Los archivos estan bien; solo el nombre quedo feo, asi que
 * la tilde se restaura aca a mano.
 * @type {Record<string, {title: string, artist: string, nota?: string}>}
 */
const META = {
  'Salsa_-_Ruben_Blades_Pedro_Navaja.kar': { title: 'Pedro Navaja', artist: 'Rubén Blades & Willie Colón' },
  'Salsa_-_Ruben_Blades_Plastico.kar': { title: 'Plástico', artist: 'Rubén Blades & Willie Colón' },
  'Salsa_-_Ruben_Blades_Juan_Pachanga.kar': { title: 'Juan Pachanga', artist: 'Rubén Blades' },
  'Salsa_-_Ruben_Blades_Sin_tu_cari_o.kar': { title: 'Sin Tu Cariño', artist: 'Rubén Blades' },
  'Salsa_-_Ruben_Blades_Decisiones.kar': { title: 'Decisiones', artist: 'Rubén Blades' },
  'Salsa_-_Ruben_Blades_Amor_Y_Control.kar': { title: 'Amor y Control', artist: 'Rubén Blades' },
  'Salsa_-_Ruben_Blades_El_Padre_Antonio_Y_Su_Monaguillo_Andres.kar': {
    title: 'El Padre Antonio y su Monaguillo Andrés',
    artist: 'Rubén Blades',
  },
  'Salsa_-_Ruben_Blades_y_Willie_Colon_Ligia_Elena.kar': { title: 'Ligia Elena', artist: 'Rubén Blades & Willie Colón' },
  'Salsa_-_Hector_Lavoe_El_Cantante.kar': { title: 'El Cantante', artist: 'Héctor Lavoe' },
  'Salsa_-_Hector_Lavoe_Mi_Gente.kar': { title: 'Mi Gente', artist: 'Héctor Lavoe' },
  'Salsa_-_Hector_Lavoe_Todo_Poderoso.kar': { title: 'El Todopoderoso', artist: 'Héctor Lavoe' },
  'Salsa_-_Hector_Lavoe_Todo_Me_Gusta_De_Ti.kar': { title: 'Todo Me Gusta de Ti', artist: 'Héctor Lavoe' },
  'Salsa_-_Celia_Cruz_Quimbara.kar': { title: 'Quimbara', artist: 'Celia Cruz & Johnny Pacheco' },
  'Salsa_-_Celia_Cruz_Burundanga.kar': { title: 'Burundanga', artist: 'Celia Cruz' },
  'Salsa_-_Celia_Cruz_Yo_Vivire.kar': { title: 'Yo Viviré', artist: 'Celia Cruz' },
  'Salsa_-_Celia_Cruz_La_Negra_Tiene_Tumbao.kar': { title: 'La Negra Tiene Tumbao', artist: 'Celia Cruz' },
  'Salsa_-_Celia_Cruz_La_vida_es_un_carnaval.kar': { title: 'La Vida Es un Carnaval', artist: 'Celia Cruz' },
  'Salsa_-_Cheo_Feliciano_Anacaona.kar': { title: 'Anacaona', artist: 'Cheo Feliciano' },
  'Salsa_-_Cheo_Feliciano_El_Raton.kar': { title: 'El Ratón', artist: 'Cheo Feliciano' },
  'Salsa_-_Ismael_Rivera_Las_caras_lindas.kar': { title: 'Las Caras Lindas', artist: 'Ismael Rivera' },
  'Salsa_-_Ismael_Rivera_El_Nazareno.kar': { title: 'El Nazareno', artist: 'Ismael Rivera' },
  'Salsa_-_Ismael_Rivera_Mi_Jaragual.kar': { title: 'Mi Jaragual', artist: 'Ismael Rivera' },
  'Salsa_-_Ismael_Rivera_Es_Tarde.kar': { title: 'Es Tarde', artist: 'Ismael Rivera' },
  'Salsa_-_Sonora_Poncena_Fuego_En_El_23.kar': { title: 'Fuego en el 23', artist: 'La Sonora Ponceña' },
  'Salsa_-_Sonora_Poncena_Boranda.kar': { title: 'Boranda', artist: 'La Sonora Ponceña' },
  'Salsa_-_Sonora_Poncena_Cancion.kar': { title: 'Canción', artist: 'La Sonora Ponceña' },
  'Salsa_-_El_Gran_Combo_De_Puerto_Rico_Brujeria.kar': { title: 'Brujería', artist: 'El Gran Combo' },
  'Salsa_-_El_Gran_Combo_De_Puerto_Rico_La_Muerte.kar': { title: 'La Muerte', artist: 'El Gran Combo' },
  'Salsa_-_Gran_Combo_Nido_De_Amor.kar': { title: 'Nido de Amor', artist: 'El Gran Combo' },
  'Salsa_-_Willie_Colon_Idilio.kar': { title: 'Idilio', artist: 'Willie Colón' },
  'Salsa_-_Willie_Colon_El_Gran_Varon.kar': { title: 'El Gran Varón', artist: 'Willie Colón' },
  'Salsa_-_La_Lupe_Puro_Teatro.kar': { title: 'Puro Teatro', artist: 'La Lupe' },
  'Salsa_-_La_Lupe_Que_Te_Pedi.kar': { title: 'Que Te Pedí', artist: 'La Lupe' },
  'Salsa_-_Andy_Montanez_Casi_Te_Envidio.kar': { title: 'Casi Te Envidio', artist: 'Andy Montañez' },
  'Salsa_-_Bobby_Valentin_Porque_Me_Citas.kar': { title: 'Porque Me Citas', artist: 'Bobby Valentín' },
  'Salsa_-_Ismael_Miranda_No_Me_Digas_Que_Es_Muy_Tarde_Ya.kar': {
    title: 'No Me Digas Que Es Muy Tarde Ya',
    artist: 'Ismael Miranda',
  },
  'Salsa_-_Tito_Rodriguez_Miedo_al_Cha_Cha_Cha.kar': { title: 'Miedo al Cha Cha Chá', artist: 'Tito Rodríguez' },
  'Salsa_-_Grupo_Niche_Anamile.kar': { title: 'Anamile', artist: 'Grupo Niche' },
  'Salsa_-_Joe_Arroyo_Rebelion.kar': { title: 'Rebelión', artist: 'Joe Arroyo' },
  'Salsa_-_Varios_El_cantante.kar': { title: 'El Cantante (versión varios)', artist: 'Varios' },
};

const files = (await fs.readdir(DEMO)).filter((f) => f.startsWith('Salsa_-_') && f.endsWith('.kar')).sort();

const filas = [];
const sinMeta = [];
for (const file of files) {
  const meta = META[file];
  if (!meta) {
    sinMeta.push(file);
    continue;
  }
  const buf = await fs.readFile(path.join(DEMO, file));
  let bpm = 100;
  try {
    const m = new Midi(buf);
    const t = m.header.tempos[0]?.bpm;
    if (t && t > 20 && t < 320) bpm = Math.round(t);
  } catch {
    // el archivo ya paso salsa-verify.mjs; si no parsea, se deja el bpm nominal
  }
  filas.push({ title: meta.title, artist: meta.artist, bpm, file });
}

const q = (s) => `"${s.replace(/"/g, '\\"')}"`;
const cuerpo = filas
  .map((r) => `  { title: ${q(r.title)}, artist: ${q(r.artist)}, bpm: ${r.bpm}, file: ${q(r.file)} },`)
  .join('\n');

const doc = `/**
 * Salsa brava pack (el canon de Fania / Nueva York, 1965-1985).
 *
 * Source: karaokegratis.com.ar karaoke MIDIs (.kar), the same source as the
 * bolero pack. Discovery, download and validation live in
 * scripts/salsa-discover.mjs, scripts/download-midi.mjs and
 * scripts/salsa-verify.mjs; regenerate this file with
 * \`node scripts/salsa-catalogue.mjs\` after touching the pack.
 *
 * Every file ships in \`public/demo/\`, parses with the app's own parser
 * (@tonejs/midi) and contains real note data.
 *
 * Notes on the data:
 * - \`bpm\` is read back from each file at generation time (it is what the app
 *   shows), not typed by hand.
 * - Two files (the La Lupe boleros) carry no piano track; they are kept because
 *   the arrangement is worth hearing, but they will not exercise the piano roll.
 * - The ranking these were chosen from, with sources, is in
 *   docs/investigacion-salsa-brava-top.md.
 */

import type { DemoSong } from "../types/song";

interface SalsaEntry {
  title: string;
  artist: string;
  /** Nominal tempo; the parser prefers the tempo embedded in the MIDI file. */
  bpm: number;
  file: string;
}

const SALSA: SalsaEntry[] = [
  // ── El corazón del canon ──
${cuerpo}
];

/** The salsa pack, ready to merge into the demo-song catalogue. */
export const DEMO_SALSA: Omit<DemoSong, "trackId">[] = SALSA.map(
  ({ title, artist, bpm, file }) => ({
    path: \`/demo/\${file}\`,
    title,
    artist,
    bpm,
    genre: "salsa" as const,
  }),
);
`;

await fs.writeFile(OUT, doc, 'utf8');
console.log(`escrito ${OUT}`);
console.log(`filas: ${filas.length}`);
console.log(`rango de bpm: ${Math.min(...filas.map((f) => f.bpm))}..${Math.max(...filas.map((f) => f.bpm))}`);
if (sinMeta.length) {
  console.log('\nSIN METADATA (no entraron al catalogo, agregar a META):');
  for (const f of sinMeta) console.log('  ' + f);
}
