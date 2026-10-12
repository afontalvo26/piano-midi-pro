/**
 * Bolero pack catalogue (Colombian grandparents' songbook).
 *
 * Source: karaokegratis.com.ar karaoke MIDIs (.kar). The download pipeline and
 * its validation live in scripts/boleros-download.mjs; run
 * `node scripts/boleros-verify.mjs` after touching the pack. Every file here
 * ships in `public/demo/`, is verified to parse with the app's own parser
 * (@tonejs/midi) and to contain real note data.
 *
 * Notes on the data:
 * - Three files were repaired rather than taken as-is: "Poquita Fe",
 *   "Lágrimas del Alma" and "Sabor a Mí" carry a malformed karaoke/lyric meta
 *   stream that makes the parser throw, so their lyric events were stripped
 *   (notes, tempo and key/time signatures are untouched).
 * - `artist` is the interpreter when a canonical one exists, otherwise the
 *   composer ("Roberto Cantoral - La Barca", "Álvaro Carrillo - Sabor a Mí").
 * - `bpm` mirrors the tempo embedded in each file, which is what the app shows.
 */

import type { DemoSong } from "../types/song";

interface BoleroEntry {
  title: string;
  artist: string;
  /** Nominal tempo; the parser prefers the tempo embedded in the MIDI file. */
  bpm: number;
  file: string;
}

const BOLEROS: BoleroEntry[] = [
  // ── Los Panchos: el trío de la radiola ──
  { title: "Bésame Mucho", artist: "Los Panchos", bpm: 100, file: "Bolero_-_Besame_Mucho.kar" },
  { title: "Solamente Una Vez", artist: "Los Panchos", bpm: 80, file: "Bolero_-_Solamente_Una_Vez.kar" },
  { title: "Quizás, Quizás, Quizás", artist: "Los Panchos", bpm: 107, file: "Bolero_-_Quizas_Quizas_Quizas.kar" },
  { title: "El Reloj", artist: "Los Panchos", bpm: 98, file: "Bolero_-_El_Reloj.kar" },
  { title: "Perfidia", artist: "Los Panchos", bpm: 100, file: "Bolero_-_Perfidia.kar" },
  { title: "Piel Canela", artist: "Los Panchos", bpm: 120, file: "Bolero_-_Piel_Canela.kar" },
  { title: "Rayito de Luna", artist: "Los Panchos", bpm: 100, file: "Bolero_-_Rayito_De_Luna.kar" },
  { title: "Sin Ti", artist: "Los Panchos", bpm: 94, file: "Bolero_-_Sin_Ti.kar" },
  { title: "Un Siglo de Ausencia", artist: "Los Panchos", bpm: 112, file: "Bolero_-_Un_Siglo_De_Ausencia.kar" },
  { title: "Nosotros", artist: "Los Panchos", bpm: 95, file: "Bolero_-_Nosotros.kar" },
  { title: "Obsesión", artist: "Los Panchos", bpm: 80, file: "Bolero_-_Obsesion.kar" },
  { title: "Espérame en el Cielo", artist: "Los Panchos", bpm: 100, file: "Bolero_-_Esperame_En_El_Cielo.kar" },
  { title: "Gema", artist: "Los Panchos", bpm: 100, file: "Bolero_-_Gema.kar" },
  { title: "Caminemos", artist: "Los Panchos", bpm: 100, file: "Bolero_-_Caminemos.kar" },
  { title: "Poquita Fe", artist: "Los Panchos", bpm: 97, file: "Bolero_-_Poquita_Fe.kar" },
  { title: "Una Copa Más", artist: "Los Panchos", bpm: 115, file: "Bolero_-_Una_Copa_Mas.kar" },
  { title: "Mil Besos", artist: "Los Panchos", bpm: 120, file: "Bolero_-_Mil_Besos.kar" },
  { title: "La Hiedra", artist: "Los Panchos", bpm: 100, file: "Bolero_-_La_Hiedra.kar" },
  { title: "Cerca del Mar", artist: "Los Panchos", bpm: 100, file: "Bolero_-_Cerca_Del_Mar.kar" },
  { title: "Si Tú Me Dices Ven", artist: "Los Panchos", bpm: 120, file: "Bolero_-_Si_Tu_Me_Dices_Ven.kar" },
  { title: "Triunfamos", artist: "Los Panchos", bpm: 103, file: "Bolero_-_Triunfamos.kar" },
  { title: "Alma, Corazón y Vida", artist: "Los Panchos", bpm: 170, file: "Bolero_-_Alma_Corazon_Y_Vida.kar" },
  { title: "Cachito", artist: "Los Panchos", bpm: 120, file: "Bolero_-_Cachito.kar" },
  { title: "Historia de un Amor", artist: "Los Panchos", bpm: 105, file: "Bolero_-_Historia_De_Un_Amor.kar" },
  { title: "Voy a Perder la Cabeza por Tu Amor", artist: "Los Panchos", bpm: 103, file: "Bolero_-_Voy_A_Perder_La_Cabeza_Por_Tu_Amor.kar" },
  { title: "No Me Quieras Tanto", artist: "Los Panchos", bpm: 100, file: "Bolero_-_No_Me_Quieras_Tanto.kar" },
  { title: "La Última Noche", artist: "Los Panchos", bpm: 120, file: "Bolero_-_La_Ultima_Noche.kar" },
  { title: "Sabrás Que Te Quiero", artist: "Los Panchos", bpm: 94, file: "Bolero_-_Sabras_Que_Te_Quiero.kar" },

  // ── Lucho Gatica: voz de terciopelo ──
  { title: "Contigo en la Distancia", artist: "Lucho Gatica", bpm: 96, file: "Bolero_-_Contigo_En_La_Distancia.kar" },
  { title: "Amor Perdido", artist: "Lucho Gatica", bpm: 120, file: "Bolero_-_Amor_Perdido.kar" },
  { title: "Mil Noches", artist: "Lucho Gatica", bpm: 90, file: "Bolero_-_Mil_Noches.kar" },
  { title: "Sabrá Dios", artist: "Lucho Gatica", bpm: 120, file: "Bolero_-_Sabra_Dios.kar" },
  { title: "Si Me Comprendieras", artist: "Lucho Gatica", bpm: 90, file: "Bolero_-_Si_Me_Comprendieras.kar" },
  { title: "Son Golpes Que Da la Vida", artist: "Lucho Gatica", bpm: 135, file: "Bolero_-_Son_Golpes_Que_Da_La_Vida.kar" },

  // ── Julio Jaramillo: el ruiseñor de América ──
  { title: "Sombras", artist: "Julio Jaramillo", bpm: 100, file: "Bolero_-_Sombras.kar" },
  { title: "Nuestro Juramento", artist: "Julio Jaramillo", bpm: 100, file: "Bolero_-_Nuestro_Juramento.kar" },
  { title: "Ódiame", artist: "Julio Jaramillo", bpm: 162, file: "Bolero_-_Odiame.kar" },
  { title: "Fatalidad", artist: "Julio Jaramillo", bpm: 160, file: "Bolero_-_Fatalidad.kar" },
  { title: "Alma en los Labios", artist: "Julio Jaramillo", bpm: 100, file: "Bolero_-_Alma_En_Los_Labios.kar" },
  { title: "Que Nadie Sepa Mi Sufrir", artist: "Julio Jaramillo", bpm: 85, file: "Bolero_-_Que_Nadie_Sepa_Mi_Sufrir.kar" },
  { title: "Adoración", artist: "Julio Jaramillo", bpm: 100, file: "Bolero_-_Adoracion.kar" },
  { title: "Sendas Distintas", artist: "Julio Jaramillo", bpm: 100, file: "Bolero_-_Sendas_Distintas.kar" },
  { title: "Guayaquil de Mis Amores", artist: "Julio Jaramillo", bpm: 100, file: "Bolero_-_Guayaquil_De_Mis_Amores.kar" },
  { title: "Un Disco Más", artist: "Julio Jaramillo", bpm: 125, file: "Bolero_-_Un_Disco_Mas.kar" },

  // ── Agustín Lara: el flaco de oro ──
  { title: "Amor de Mis Amores", artist: "Agustín Lara", bpm: 100, file: "Bolero_-_Amor_De_Mis_Amores.kar" },
  { title: "Farolito", artist: "Agustín Lara", bpm: 100, file: "Bolero_-_Farolito.kar" },
  { title: "María Bonita", artist: "Agustín Lara", bpm: 107, file: "Bolero_-_Maria_Bonita.kar" },
  { title: "Palabras de Mujer", artist: "Agustín Lara", bpm: 100, file: "Bolero_-_Palabras_De_Mujer.kar" },
  { title: "Veracruz", artist: "Agustín Lara", bpm: 93, file: "Bolero_-_Veracruz.kar" },
  { title: "Arráncame la Vida", artist: "Agustín Lara", bpm: 120, file: "Bolero_-_Arrancame_La_Vida.kar" },

  // ── Armando Manzanero ──
  { title: "Adoro", artist: "Armando Manzanero", bpm: 120, file: "Bolero_-_Adoro.kar" },
  { title: "Esta Tarde Vi Llover", artist: "Armando Manzanero", bpm: 91, file: "Bolero_-_Esta_Tarde_Vi_Llover.kar" },
  { title: "Contigo Aprendí", artist: "Armando Manzanero", bpm: 88, file: "Bolero_-_Contigo_Aprendi.kar" },
  { title: "Somos Novios", artist: "Armando Manzanero", bpm: 85, file: "Bolero_-_Somos_Novios.kar" },
  { title: "Voy a Apagar la Luz", artist: "Armando Manzanero", bpm: 80, file: "Bolero_-_Voy_A_Apagar_La_Luz.kar" },
  { title: "Parece Que Fue Ayer", artist: "Armando Manzanero", bpm: 80, file: "Bolero_-_Parece_Que_Fue_Ayer.kar" },
  { title: "Mía", artist: "Armando Manzanero", bpm: 100, file: "Bolero_-_Mia.kar" },

  // ── Antonio Machín ──
  { title: "Dos Gardenias", artist: "Antonio Machín", bpm: 95, file: "Bolero_-_Dos_Gardenias.kar" },
  { title: "Angelitos Negros", artist: "Antonio Machín", bpm: 120, file: "Bolero_-_Angelitos_Negros.kar" },
  { title: "Corazón Loco", artist: "Antonio Machín", bpm: 93, file: "Bolero_-_Corazon_Loco.kar" },
  { title: "Toda Una Vida", artist: "Antonio Machín", bpm: 90, file: "Bolero_-_Toda_Una_Vida.kar" },

  // ── Compositores e intérpretes del canon ──
  { title: "La Barca", artist: "Roberto Cantoral", bpm: 100, file: "Bolero_-_La_Barca.kar" },
  { title: "Regálame Esta Noche", artist: "Roberto Cantoral", bpm: 100, file: "Bolero_-_Regalame_Esta_Noche.kar" },
  { title: "Sabor a Mí", artist: "Álvaro Carrillo", bpm: 88, file: "Bolero_-_Sabor_A_Mi.kar" },
  { title: "El Andariego", artist: "Álvaro Carrillo", bpm: 176, file: "Bolero_-_El_Andariego.kar" },
  { title: "Se Te Olvida", artist: "Álvaro Carrillo", bpm: 100, file: "Bolero_-_Se_Te_Olvida.kar" },
  { title: "Incertidumbre", artist: "Gonzalo Curiel", bpm: 100, file: "Bolero_-_Incertidumbre.kar" },
  { title: "Vereda Tropical", artist: "Gonzalo Curiel", bpm: 120, file: "Bolero_-_Vereda_Tropical.kar" },
  { title: "Amar y Vivir", artist: "Consuelo Velázquez", bpm: 120, file: "Bolero_-_Amar_Y_Vivir.kar" },
  { title: "La Negra Noche", artist: "Pedro Vargas", bpm: 55, file: "Bolero_-_La_Negra_Noche.kar" },
  { title: "Quién Será", artist: "Nelson Pinedo", bpm: 130, file: "Bolero_-_Quien_Sera.kar" },

  // ── Colombia y el Caribe ──
  { title: "Lágrimas del Alma", artist: "Olimpo Cárdenas", bpm: 120, file: "Bolero_-_Lagrimas_Del_Alma.kar" },
  { title: "La Cárcel de Sing Sing", artist: "Alci Acosta", bpm: 104, file: "Bolero_-_La_Carcel_De_Sing_Sing.kar" },
  { title: "Inolvidable", artist: "Tito Rodríguez", bpm: 80, file: "Bolero_-_Inolvidable.kar" },
  { title: "El Que Se Fue", artist: "Tito Rodríguez", bpm: 202, file: "Bolero_-_El_Que_Se_Fue.kar" },
  { title: "La Puerta", artist: "Leo Marini", bpm: 100, file: "Bolero_-_La_Puerta.kar" },
  { title: "En la Orilla del Mar", artist: "La Sonora Matancera", bpm: 90, file: "Bolero_-_En_La_Orilla_Del_Mar.kar" },

  // ── Boleros clásicos de serenata ──
  { title: "Tú Me Acostumbraste", artist: "Bolero Clásico", bpm: 100, file: "Bolero_-_Tu_Me_Acostumbraste.kar" },
  { title: "La Gloria Eres Tú", artist: "Bolero Clásico", bpm: 96, file: "Bolero_-_La_Gloria_Eres_Tu.kar" },
  { title: "Soy un Extraño", artist: "Bolero Clásico", bpm: 106, file: "Bolero_-_Soy_Un_Extrano.kar" },
  { title: "Madrigal", artist: "Bolero Clásico", bpm: 120, file: "Bolero_-_Madrigal.kar" },
  { title: "Encadenados", artist: "Bolero Clásico", bpm: 100, file: "Bolero_-_Encadenados.kar" },
  { title: "Nomás Contigo", artist: "Bolero Clásico", bpm: 76, file: "Bolero_-_Nomas_Contigo.kar" },
];

/** The bolero pack, ready to merge into the demo-song catalogue. */
export const DEMO_BOLEROS: Omit<DemoSong, "trackId">[] = BOLEROS.map(
  ({ title, artist, bpm, file }) => ({
    path: `/demo/${file}`,
    title,
    artist,
    bpm,
    genre: "bolero" as const,
  }),
);
