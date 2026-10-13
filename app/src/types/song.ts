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
  /**
   * CC7 (Channel Volume) del canal en el instante de la nota, normalizado 0..1.
   *
   * Es el nivel de mezcla que el AUTOR le dio a esa pista. Ausente cuando el
   * archivo no trae CC7: en ese caso el motor no atenúa nada (ganancia 1) y el
   * nivel queda como estaba. La conversión a ganancia (ley del GM2) vive en
   * `engine/playbackGain.ts` para que el dato guardado siga siendo el del MIDI.
   */
  volume?: number;
  /**
   * CC11 (Expression) del canal en el instante de la nota, normalizado 0..1.
   * Es la expresión continua (crescendos, fraseo). Ausente = sin CC11.
   */
  expression?: number;
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
 * Un trozo de texto con su propio instante.
 *
 * En un `.kar` cada evento meta de letra (0x05/0x01) trae su delta-time, así que
 * esto NO es una estimación: es el tiempo que el autor del karaoke le puso a esa
 * sílaba. Medido sobre los 140 `.kar` de `app/public/demo`: 43.498 eventos con
 * tiempo propio, separación mediana 0,275 s — granularidad de sílaba, no de
 * línea (las pausas entre frases dan 2,076 s de mediana).
 */
export type LyricSyllable = {
  /** Segundos, mismo dominio que `SongNote.time`. */
  time: number;
  text: string;
};

/**
 * Una palabra cantable, armada con las sílabas que el archivo reparte entre
 * varios eventos ("NU"+"BA"+"RRÓN" → "NUBARRÓN").
 *
 * `time` es el instante de su PRIMERA sílaba: eso es lo que hace exacto el
 * "tocá la palabra y andá a ese punto". `syllables` conserva el detalle para que
 * el resaltado avance sílaba por sílaba, que es el dato real del archivo.
 */
export type LyricWord = {
  time: number;
  text: string;
  syllables: LyricSyllable[];
};

/**
 * A synchronised lyric line. `time` is in seconds in the song's own time
 * domain — the same domain as `SongNote.time` — so the transport converts
 * both identically and they cannot drift apart.
 */
export type LyricLine = {
  time: number;
  text: string;
  /**
   * Palabras con su tiempo propio, cuando el archivo los trae.
   *
   * Opcional a propósito: una canción guardada por una versión anterior de la
   * app (o un `.mid` cuyo texto no viene por sílabas) no lo tiene, y el panel
   * cae al resaltado por línea sin inventar tiempos.
   */
  words?: LyricWord[];
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
  /**
   * Compás del archivo ([numerador, denominador], p. ej. [4,4] o [6,8]).
   *
   * Lo usa la perilla "Groove" para la jerarquía métrica: el desvío de una nota
   * depende de si cae en el tiempo 1, en un tiempo fuerte, en uno débil o en un
   * contratiempo (ver engine/groove.ts). Sin este dato habría que asumir 4/4 y
   * un vals o un bambuco quedarían mal medidos.
   */
  timeSignature?: [number, number];
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
