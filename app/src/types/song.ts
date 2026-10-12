// Song data types shared across the application.
// Extracted from App.tsx so non-React modules can consume them.

export type Genre =
  | "vallenato"
  | "cumbia"
  | "porro"
  | "bolero"
  | "bambuco"
  | "pasillo"
  | "salsa"
  | "pop"
  | "classical";

export type GenreMeta = {
  id: Genre;
  label: string;       // "Vallenato"
  emoji: string;       // "🪗"
  color: string;       // hex principal
  colorAlt: string;    // hex secundario para gradiente
  description: string; // 1 frase corta en español
};

export const GENRE_META: Record<Genre, GenreMeta> = {
  vallenato:  { id: "vallenato",  label: "Vallenato",  emoji: "🪗", color: "#f59e0b", colorAlt: "#ef4444", description: "Acordeón, caja y guacharaca del Caribe colombiano" },
  cumbia:     { id: "cumbia",     label: "Cumbia",     emoji: "🥁", color: "#ec4899", colorAlt: "#8b5cf6", description: "Ritmo costeño que mueve toda Latinoamérica" },
  porro:      { id: "porro",      label: "Porro",      emoji: "🎺", color: "#06b6d4", colorAlt: "#3b82f6", description: "Bandas pelayeras y fiesta sabanera" },
  bolero:     { id: "bolero",     label: "Bolero",     emoji: "🌹", color: "#f43f5e", colorAlt: "#a855f7", description: "Guitarras, serenata y amor de los abuelos" },
  bambuco:    { id: "bambuco",    label: "Bambuco",    emoji: "🎻", color: "#10b981", colorAlt: "#06b6d4", description: "El alma andina de Colombia en 6/8" },
  pasillo:    { id: "pasillo",    label: "Pasillo",    emoji: "💃", color: "#a855f7", colorAlt: "#ec4899", description: "Vals criollo elegante y nostálgico" },
  salsa:      { id: "salsa",      label: "Salsa",      emoji: "🔥", color: "#ef4444", colorAlt: "#f59e0b", description: "Calor tropical para bailar sin parar" },
  pop:        { id: "pop",        label: "Pop & Rock", emoji: "🎸", color: "#8b5cf6", colorAlt: "#d946ef", description: "Clásicos pop y rock que todos conocen" },
  classical:  { id: "classical",  label: "Clásica",    emoji: "🎼", color: "#0ea5e9", colorAlt: "#6366f1", description: "Piezas atemporales para piano" },
};

export const GENRE_ORDER: Genre[] = [
  "vallenato","cumbia","porro","bolero","bambuco","pasillo","salsa","pop","classical",
];

export type SongNote = {
  id: string;
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  trackIndex: number;
};

export type SongTrack = {
  index: number;
  name: string;
  instrument: string;
  noteCount: number;
  color: string;
  /**
   * Canal 10 (GM): la pista es un kit de percusión. Se toca con el
   * DrumKitEngine y no con el sampler del instrumento.
   */
  isDrumKit?: boolean;
};

/**
 * A synchronised lyric line. `time` is in seconds in the song's own time
 * domain — the same domain as `SongNote.time` — so the transport converts
 * both identically and they cannot drift apart.
 */
export type LyricLine = {
  time: number;
  text: string;
};

export type SongData = {
  title: string;
  source: string;
  duration: number;
  bpm: number;
  notes: SongNote[];
  /**
   * Golpes de percusión (canal 10), en el MISMO dominio de tiempo que `notes`.
   *
   * Van aparte a propósito: el piano-roll, el juego rítmico y el modo práctica
   * recorren `notes`, y un golpe de caja no es una tecla que el usuario pueda
   * tocar. La reproducción sí los agenda — antes se descartaban (264.003 notas
   * en la biblioteca de demos), que es lo que dejaba a vallenatos y boleros sin
   * su ritmo.
   */
  percussion?: SongNote[];
  tracks: SongTrack[];
  /** Optional artist when known (e.g. demo songs). Empty for user uploads. */
  artist?: string;
  /** Optional genre tag for categorisation. */
  genre?: Genre;
  /**
   * Stable identity assigned by the music-player layer (see music/ids.ts).
   * Optional so hand-built songs (including persisted legacy data) keep
   * working; `idForSong()` reconstructs it from the provenance fields below.
   */
  trackId?: string;
  /** Demo tracks only: the public path this was fetched from. */
  demoPath?: string;
  /** Uploaded-MIDI tracks only: the original filename, for a stable id. */
  uploadName?: string;
  /** Uploaded-MIDI tracks only: file size, so two files with one name differ. */
  uploadBytes?: number;
  /**
   * Karaoke lyrics embedded in the MIDI (.kar files usually have them).
   * Empty or absent for files with no lyric track.
   */
  lyrics?: LyricLine[];
};

/**
 * A MIDI file curated and shipped with the app (see constants/demoSongs.ts).
 * Lives here so the demo catalogues can reference it without importing each
 * other.
 */
export type DemoSong = {
  /** Path relative to the public folder, e.g. "/demo/fur_elise.mid". */
  path: string;
  title: string;
  artist: string;
  bpm: number;
  genre: Genre;
  /**
   * Stable player id, derived from `path` by constants/demoSongs.ts. It lives
   * on the catalogue row (rather than being derived at parse time) so a demo
   * can never be mistaken for an upload — that mistake made the whole shipped
   * catalogue unplayable once.
   */
  trackId: string;
};
