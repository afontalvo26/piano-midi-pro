/**
 * Salsa brava pack (el canon de Fania / Nueva York, 1965-1985).
 *
 * Source: karaokegratis.com.ar karaoke MIDIs (.kar), the same source as the
 * bolero pack. Discovery, download and validation live in
 * scripts/salsa-discover.mjs, scripts/download-midi.mjs and
 * scripts/salsa-verify.mjs; regenerate this file with
 * `node scripts/salsa-catalogue.mjs` after touching the pack.
 *
 * Every file ships in `public/demo/`, parses with the app's own parser
 * (@tonejs/midi) and contains real note data.
 *
 * Notes on the data:
 * - `bpm` is read back from each file at generation time (it is what the app
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
  { title: "Casi Te Envidio", artist: "Andy Montañez", bpm: 180, file: "Salsa_-_Andy_Montanez_Casi_Te_Envidio.kar" },
  { title: "Porque Me Citas", artist: "Bobby Valentín", bpm: 88, file: "Salsa_-_Bobby_Valentin_Porque_Me_Citas.kar" },
  { title: "Burundanga", artist: "Celia Cruz", bpm: 100, file: "Salsa_-_Celia_Cruz_Burundanga.kar" },
  { title: "La Negra Tiene Tumbao", artist: "Celia Cruz", bpm: 106, file: "Salsa_-_Celia_Cruz_La_Negra_Tiene_Tumbao.kar" },
  { title: "La Vida Es un Carnaval", artist: "Celia Cruz", bpm: 104, file: "Salsa_-_Celia_Cruz_La_vida_es_un_carnaval.kar" },
  { title: "Quimbara", artist: "Celia Cruz & Johnny Pacheco", bpm: 120, file: "Salsa_-_Celia_Cruz_Quimbara.kar" },
  { title: "Yo Viviré", artist: "Celia Cruz", bpm: 115, file: "Salsa_-_Celia_Cruz_Yo_Vivire.kar" },
  { title: "Anacaona", artist: "Cheo Feliciano", bpm: 185, file: "Salsa_-_Cheo_Feliciano_Anacaona.kar" },
  { title: "El Ratón", artist: "Cheo Feliciano", bpm: 100, file: "Salsa_-_Cheo_Feliciano_El_Raton.kar" },
  { title: "Brujería", artist: "El Gran Combo", bpm: 93, file: "Salsa_-_El_Gran_Combo_De_Puerto_Rico_Brujeria.kar" },
  { title: "La Muerte", artist: "El Gran Combo", bpm: 188, file: "Salsa_-_El_Gran_Combo_De_Puerto_Rico_La_Muerte.kar" },
  { title: "Nido de Amor", artist: "El Gran Combo", bpm: 86, file: "Salsa_-_Gran_Combo_Nido_De_Amor.kar" },
  { title: "Anamile", artist: "Grupo Niche", bpm: 175, file: "Salsa_-_Grupo_Niche_Anamile.kar" },
  { title: "El Cantante", artist: "Héctor Lavoe", bpm: 185, file: "Salsa_-_Hector_Lavoe_El_Cantante.kar" },
  { title: "Mi Gente", artist: "Héctor Lavoe", bpm: 202, file: "Salsa_-_Hector_Lavoe_Mi_Gente.kar" },
  { title: "Todo Me Gusta de Ti", artist: "Héctor Lavoe", bpm: 100, file: "Salsa_-_Hector_Lavoe_Todo_Me_Gusta_De_Ti.kar" },
  { title: "El Todopoderoso", artist: "Héctor Lavoe", bpm: 245, file: "Salsa_-_Hector_Lavoe_Todo_Poderoso.kar" },
  { title: "No Me Digas Que Es Muy Tarde Ya", artist: "Ismael Miranda", bpm: 105, file: "Salsa_-_Ismael_Miranda_No_Me_Digas_Que_Es_Muy_Tarde_Ya.kar" },
  { title: "El Nazareno", artist: "Ismael Rivera", bpm: 97, file: "Salsa_-_Ismael_Rivera_El_Nazareno.kar" },
  { title: "Es Tarde", artist: "Ismael Rivera", bpm: 120, file: "Salsa_-_Ismael_Rivera_Es_Tarde.kar" },
  { title: "Las Caras Lindas", artist: "Ismael Rivera", bpm: 100, file: "Salsa_-_Ismael_Rivera_Las_caras_lindas.kar" },
  { title: "Mi Jaragual", artist: "Ismael Rivera", bpm: 200, file: "Salsa_-_Ismael_Rivera_Mi_Jaragual.kar" },
  { title: "Rebelión", artist: "Joe Arroyo", bpm: 98, file: "Salsa_-_Joe_Arroyo_Rebelion.kar" },
  { title: "Puro Teatro", artist: "La Lupe", bpm: 110, file: "Salsa_-_La_Lupe_Puro_Teatro.kar" },
  { title: "Que Te Pedí", artist: "La Lupe", bpm: 87, file: "Salsa_-_La_Lupe_Que_Te_Pedi.kar" },
  { title: "Amor y Control", artist: "Rubén Blades", bpm: 95, file: "Salsa_-_Ruben_Blades_Amor_Y_Control.kar" },
  { title: "Decisiones", artist: "Rubén Blades", bpm: 98, file: "Salsa_-_Ruben_Blades_Decisiones.kar" },
  { title: "El Padre Antonio y su Monaguillo Andrés", artist: "Rubén Blades", bpm: 115, file: "Salsa_-_Ruben_Blades_El_Padre_Antonio_Y_Su_Monaguillo_Andres.kar" },
  { title: "Juan Pachanga", artist: "Rubén Blades", bpm: 200, file: "Salsa_-_Ruben_Blades_Juan_Pachanga.kar" },
  { title: "Pedro Navaja", artist: "Rubén Blades & Willie Colón", bpm: 187, file: "Salsa_-_Ruben_Blades_Pedro_Navaja.kar" },
  { title: "Plástico", artist: "Rubén Blades & Willie Colón", bpm: 190, file: "Salsa_-_Ruben_Blades_Plastico.kar" },
  { title: "Sin Tu Cariño", artist: "Rubén Blades", bpm: 200, file: "Salsa_-_Ruben_Blades_Sin_tu_cari_o.kar" },
  { title: "Ligia Elena", artist: "Rubén Blades & Willie Colón", bpm: 134, file: "Salsa_-_Ruben_Blades_y_Willie_Colon_Ligia_Elena.kar" },
  { title: "Boranda", artist: "La Sonora Ponceña", bpm: 175, file: "Salsa_-_Sonora_Poncena_Boranda.kar" },
  { title: "Canción", artist: "La Sonora Ponceña", bpm: 177, file: "Salsa_-_Sonora_Poncena_Cancion.kar" },
  { title: "Fuego en el 23", artist: "La Sonora Ponceña", bpm: 87, file: "Salsa_-_Sonora_Poncena_Fuego_En_El_23.kar" },
  { title: "Miedo al Cha Cha Chá", artist: "Tito Rodríguez", bpm: 126, file: "Salsa_-_Tito_Rodriguez_Miedo_al_Cha_Cha_Cha.kar" },
  { title: "El Cantante (versión varios)", artist: "Varios", bpm: 100, file: "Salsa_-_Varios_El_cantante.kar" },
  { title: "El Gran Varón", artist: "Willie Colón", bpm: 133, file: "Salsa_-_Willie_Colon_El_Gran_Varon.kar" },
  { title: "Idilio", artist: "Willie Colón", bpm: 95, file: "Salsa_-_Willie_Colon_Idilio.kar" },
];

/** The salsa pack, ready to merge into the demo-song catalogue. */
export const DEMO_SALSA: Omit<DemoSong, "trackId">[] = SALSA.map(
  ({ title, artist, bpm, file }) => ({
    path: `/demo/${file}`,
    title,
    artist,
    bpm,
    genre: "salsa" as const,
  }),
);
