/**
 * Demo Songs Catalogue
 *
 * Curated MIDI files shipped with the app and pre-loaded into the user's
 * library on first visit. Paths are relative to the public folder.
 */

export interface DemoSong {
  path: string;
  title: string;
  artist: string;
  bpm: number;
}

export const DEMO_SONGS: DemoSong[] = [
  // ── Classical essentials ──
  {
    path: "/demo/fur_elise.mid",
    title: "Für Elise",
    artist: "Beethoven",
    bpm: 130,
  },
  {
    path: "/demo/Beethoven_-_Moonlight_Sonata_1st.mid",
    title: "Moonlight Sonata (1st Mvt.)",
    artist: "Beethoven",
    bpm: 60,
  },
  {
    path: "/demo/Scott_Joplin_-_The_Entertainer.mid",
    title: "The Entertainer",
    artist: "Scott Joplin",
    bpm: 80,
  },
  // ── Salsa brava ──
  {
    path: "/demo/Joe_Arroyo_-_La_Rebelion.mid",
    title: "La Rebelión",
    artist: "Joe Arroyo",
    bpm: 102,
  },
  { path: "/demo/Mama.mid", title: "Mama", artist: "Joe Arroyo", bpm: 85 },
  {
    path: "/demo/Polo_Montanez_-_Un_Monton_de_Estrellas.mid",
    title: "Un Montón de Estrellas",
    artist: "Polo Montañez",
    bpm: 91,
  },
  {
    path: "/demo/Ruben_Gonzalez_-_Mandinga.mid",
    title: "Mandinga",
    artist: "Rubén González",
    bpm: 120,
  },
  // ── Piano pop supertop ──
  {
    path: "/demo/John_Lennon_-_Imagine.mid",
    title: "Imagine",
    artist: "John Lennon",
    bpm: 75,
  },
  {
    path: "/demo/Billy_Joel_-_Piano_Man.mid",
    title: "Piano Man",
    artist: "Billy Joel",
    bpm: 72,
  },
  {
    path: "/demo/Queen_-_Bohemian_Rhapsody.mid",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    bpm: 72,
  },
  {
    path: "/demo/The_Beatles_-_Let_It_Be.mid",
    title: "Let It Be",
    artist: "The Beatles",
    bpm: 72,
  },
  {
    path: "/demo/Elvis_Presley_-_Cant_Help_Falling_in_Love.mid",
    title: "Can't Help Falling in Love",
    artist: "Elvis Presley",
    bpm: 74,
  },
  {
    path: "/demo/Yann_Tiersen_-_Comptine_dun_autre_ete.mid",
    title: "Comptine d'un autre été",
    artist: "Yann Tiersen",
    bpm: 100,
  },
];
