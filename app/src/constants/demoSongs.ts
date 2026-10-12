/**
 * Demo Songs Catalogue
 *
 * Curated MIDI files shipped with the app and pre-loaded into the user's
 * library on first visit. Paths are relative to the public folder.
 */

import type { DemoSong } from "../types/song";
import { DEMO_BOLEROS } from "./demoBoleros";
import { demoTrackId } from "../music/ids";

export type { DemoSong };

/** Catalogue rows as authored — `trackId` is filled in just below. */
type DemoSongInput = Omit<DemoSong, "trackId">;

const CATALOGUE: DemoSongInput[] = [
  // ── Vallenato (Colombian) (25) ──
  {
    path: "/demo/BinomioDeOro_-_El_Osito_Dormilon.kar",
    title: "El Osito Dormilón",
    artist: "Binomio de Oro",
    bpm: 100,
    genre: "vallenato",
  },
  {
    path: "/demo/BinomioDeOro_-_Sombra_Perdida.kar",
    title: "Sombra Perdida",
    artist: "Binomio de Oro",
    bpm: 100,
    genre: "vallenato",
  },
  {
    path: "/demo/BinomioDeOro_-_La_Creciente.kar",
    title: "La Creciente",
    artist: "Binomio de Oro",
    bpm: 100,
    genre: "vallenato",
  },
  {
    path: "/demo/BinomioDeOro_-_Olvidala.kar",
    title: "Olvídala",
    artist: "Binomio de Oro",
    bpm: 100,
    genre: "vallenato",
  },
  {
    path: "/demo/BinomioDeOro_-_Cha_Cun_Cha.kar",
    title: "Cha Cun Cha",
    artist: "Binomio de Oro",
    bpm: 100,
    genre: "vallenato",
  },
  {
    path: "/demo/BinomioDeOro_-_Mix.kar",
    title: "Mix Binomio",
    artist: "Binomio de Oro",
    bpm: 110,
    genre: "vallenato",
  },
  {
    path: "/demo/DiomedesDiaz_-_Tu_Serenata.kar",
    title: "Tu Serenata",
    artist: "Diomedes Díaz",
    bpm: 120,
    genre: "vallenato",
  },
  {
    path: "/demo/LosDiablitos_-_Busca_Un_Confidente.kar",
    title: "Busca un Confidente",
    artist: "Los Diablitos",
    bpm: 120,
    genre: "vallenato",
  },
  {
    path: "/demo/MiguelMorales_-_Sirena_Encantada.kar",
    title: "Sirena Encantada",
    artist: "Miguel Morales",
    bpm: 77,
    genre: "vallenato",
  },
  {
    path: "/demo/CarlosVives_-_La_Gota_Fria.kar",
    title: "La Gota Fría",
    artist: "Carlos Vives",
    bpm: 206,
    genre: "vallenato",
  },
  {
    path: "/demo/CarlosVives_-_La_Tierra_del_Olvido.kar",
    title: "La Tierra del Olvido",
    artist: "Carlos Vives",
    bpm: 96,
    genre: "vallenato",
  },
  {
    path: "/demo/CarlosVives_-_La_Piragua.kar",
    title: "La Piragua",
    artist: "Carlos Vives",
    bpm: 202,
    genre: "vallenato",
  },
  {
    path: "/demo/CarlosVives_-_Fruta_Fresca.kar",
    title: "Fruta Fresca",
    artist: "Carlos Vives",
    bpm: 119,
    genre: "vallenato",
  },
  {
    path: "/demo/CarlosVives_-_El_Amor_de_mi_Tierra.kar",
    title: "El Amor de mi Tierra",
    artist: "Carlos Vives",
    bpm: 170,
    genre: "vallenato",
  },
  {
    path: "/demo/CarlosVives_-_Alicia_Adorada.kar",
    title: "Alicia Adorada",
    artist: "Carlos Vives",
    bpm: 85,
    genre: "vallenato",
  },
  {
    path: "/demo/CarlosVives_-_Matilde_Lina.kar",
    title: "Matilde Lina",
    artist: "Carlos Vives",
    bpm: 188,
    genre: "vallenato",
  },
  {
    path: "/demo/JorgeCeledon_-_Ay_Hombre.kar",
    title: "Ay Hombre",
    artist: "Jorge Celedón",
    bpm: 137,
    genre: "vallenato",
  },
  {
    path: "/demo/DiomedesDiaz_-_Fantasia.mid",
    title: "Fantasía",
    artist: "Diomedes Díaz",
    bpm: 80,
    genre: "vallenato",
  },
  {
    path: "/demo/DiomedesDiaz_-_Sin_Medir_Distancias.mid",
    title: "Sin Medir Distancias",
    artist: "Diomedes Díaz",
    bpm: 80,
    genre: "vallenato",
  },
  {
    path: "/demo/Vallenato_-_Alicia_Adorada.mid",
    title: "Alicia Adorada (vallenato)",
    artist: "Vallenato Clásico",
    bpm: 85,
    genre: "vallenato",
  },
  {
    path: "/demo/Vallenato_-_El_Mochuelo.mid",
    title: "El Mochuelo",
    artist: "Vallenato Clásico",
    bpm: 90,
    genre: "vallenato",
  },
  {
    path: "/demo/Vallenato_-_El_Rio_Badillo.mid",
    title: "El Río Badillo",
    artist: "Vallenato Clásico",
    bpm: 81,
    genre: "vallenato",
  },
  {
    path: "/demo/Vallenato_-_La_Gota_Fria.mid",
    title: "La Gota Fría (vallenato)",
    artist: "Vallenato Clásico",
    bpm: 93,
    genre: "vallenato",
  },
  {
    path: "/demo/Vallenato_-_Fantasia_Diomedes_Diaz.mid",
    title: "Fantasía (Vallenato)",
    artist: "Diomedes Díaz",
    bpm: 82,
    genre: "vallenato",
  },
  {
    path: "/demo/Vallenato_-_Sin_Medir_Distancias.mid",
    title: "Sin Medir Distancias",
    artist: "Vallenato Clásico",
    bpm: 80,
    genre: "vallenato",
  },
  // ── Classical essentials (4) ──
  {
    path: "/demo/fur_elise.mid",
    title: "Für Elise",
    artist: "Beethoven",
    bpm: 130,
    genre: "classical",
  },
  {
    path: "/demo/Beethoven_-_Moonlight_Sonata_1st.mid",
    title: "Moonlight Sonata (1st Mvt.)",
    artist: "Beethoven",
    bpm: 60,
    genre: "classical",
  },
  {
    path: "/demo/Scott_Joplin_-_The_Entertainer.mid",
    title: "The Entertainer",
    artist: "Scott Joplin",
    bpm: 80,
    genre: "classical",
  },
  {
    path: "/demo/Yann_Tiersen_-_Comptine_dun_autre_ete.mid",
    title: "Comptine d'un autre été",
    artist: "Yann Tiersen",
    bpm: 100,
    genre: "classical",
  },
  // ── Pop & Rock (5) ──
  {
    path: "/demo/John_Lennon_-_Imagine.mid",
    title: "Imagine",
    artist: "John Lennon",
    bpm: 75,
    genre: "pop",
  },
  {
    path: "/demo/Billy_Joel_-_Piano_Man.mid",
    title: "Piano Man",
    artist: "Billy Joel",
    bpm: 72,
    genre: "pop",
  },
  {
    path: "/demo/Queen_-_Bohemian_Rhapsody.mid",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    bpm: 72,
    genre: "pop",
  },
  {
    path: "/demo/The_Beatles_-_Let_It_Be.mid",
    title: "Let It Be",
    artist: "The Beatles",
    bpm: 72,
    genre: "pop",
  },
  {
    path: "/demo/Elvis_Presley_-_Cant_Help_Falling_in_Love.mid",
    title: "Can't Help Falling in Love",
    artist: "Elvis Presley",
    bpm: 74,
    genre: "pop",
  },
  // ── Boleros (los de los abuelos) (85) ──
  // Curated pack; see ./demoBoleros.ts for the per-track source and notes.
  ...DEMO_BOLEROS,
];

/**
 * The shipped catalogue, with each row's stable player id stamped on it.
 * Deriving the id here (once, at module load) means every consumer — the demo
 * loader, the resolver, share links — sees the same identity, and a demo can
 * never fall through to the "uploaded file" path.
 */
export const DEMO_SONGS: DemoSong[] = CATALOGUE.map((song) => ({
  ...song,
  trackId: demoTrackId(song.path),
}));

/** Fast lookup by public path, used by the player's resolver. */
export const DEMO_SONGS_BY_PATH: Map<string, DemoSong> = new Map(
  DEMO_SONGS.map((song) => [song.path, song]),
);
