/**
 * scheduler — qué nota suena, cuándo, con qué instrumento y a qué volumen.
 *
 * Acá vive la lección más cara del piano: el callback de `Tone.Transport.schedule`
 * corre en el tick del scheduler, así que TODO lo que gaste se le suma a la
 * latencia de la nota. Por eso acá no se recorre la canción, no se reconstruyen
 * mapas y no se crean objetos por nota: el plan de disparo se arma UNA vez por
 * pista y dentro del callback sólo se consulta lo que cambia en caliente
 * (mute/solo/volumen/instrumento), que es barato.
 *
 * Regla de oro heredada: **nunca un sintetizador**. Si el sample real no está
 * listo, la nota se saltea en silencio (`wait`) o se declara sin fuente (`none`).
 */

import * as Tone from "tone";
import { humanizeVelocity } from "@engine/instrumentSources";
import {
  NO_GROOVE,
  GROOVE_ROLE_OFFSET_MS,
  grooveRoleFor,
  hashString,
  isSustainedInstrument,
  planGroove,
} from "@engine/groove";
import type { GrooveResult, GrooveRole, GrooveTrackInput } from "@engine/groove";
import type { DrumKitEngine } from "@engine/DrumKitEngine";
import type { AudioEngine } from "./audioEngine";
import type { SongData, SongNote } from "@app/types/song";

/** Estado del mezclador que se lee EN CALIENTE, por nota. */
export interface LiveMix {
  muted: Record<number, boolean>;
  solo: Record<number, boolean>;
  /** Volumen por pista, 0..1 (mismo dominio que el del piano). */
  volumes: Record<number, number>;
  /** Instrumento EFECTIVO por pista (incluye el cambio del usuario). */
  instruments: Record<number, string>;
}

/** Lo que el scheduler necesita saber del motor y del mezclador. */
export interface SchedulerHost {
  engine: AudioEngine;
  /** Estado del mezclador, leído por nota (los cambios valen al instante). */
  getMix: () => LiveMix;
  /** Piano: el sampler Salamander lo conecta el controlador, no el motor. */
  getPianoVoice: () => PianoVoice | null;
  /** Percusión: kit de samples reales. */
  getDrumKit: () => DrumKitEngine | null;
  /** Avisa de una nota que sonó (para poder liberarla al mute/solo). */
  onVoiceStart: (trackIndex: number, midi: number) => void;
  onVoiceEnd: (trackIndex: number, midi: number) => void;
  /** Avisa de una nota que se salteó por no tener sample real listo. */
  onNoteSkipped: () => void;
}

/** Lo mínimo que el scheduler necesita de la voz de piano (Sampler de Tone). */
export interface PianoVoice {
  triggerAttack(note: number, time: number, velocity?: number): void;
  triggerRelease(note: number, time?: number): void;
}

/** Cómo se resuelve un disparo, para el log y la UI. */
export type FireSource = "piano-sampler" | "sample" | "wait" | "none" | "drum";

/**
 * ¿La pista suena ahora?
 *
 * SOLO importan mute, solo y "hay algún solo": nada de piano-only, avatares ni
 * modos de juego (eso es del piano y acá no existe).
 */
export function isTrackAudible(trackIndex: number, mix: LiveMix): boolean {
  const anySolo = Object.values(mix.solo).some(Boolean);
  if (anySolo) return mix.solo[trackIndex] === true;
  return mix.muted[trackIndex] !== true;
}

/** Volumen efectivo de una pista (0..1). */
export function trackVolume(trackIndex: number, mix: LiveMix): number {
  const volume = mix.volumes[trackIndex];
  return volume === undefined ? 0.8 : volume;
}

/**
 * Opciones de la perilla **Groove** (`@app/engine/groove`).
 *
 * `amount` es la posición de la perilla (0..1) e `instruments` el instrumento
 * EFECTIVO por pista (incluye los cambios del mezclador): el rol de cada músico
 * —percusión, bajo, armonía, melodía— sale de ahí.
 */
export interface GrooveOptions {
  amount: number;
  instruments: Record<number, string>;
}

/**
 * Arma el plan de la perilla "Groove" para la canción que se va a agendar.
 *
 * Mismo cálculo que `buildGroovePlan` de `app/src/App.tsx`, con el módulo puro
 * `@app/engine/groove` compartido: el plan es POR PISTA porque el tope relativo
 * (8 % del intervalo local), la conservación del orden, los acordes y la jerarquía
 * métrica son propiedades de la pista, no de la nota suelta.
 *
 * A 0 % devuelve un mapa VACÍO: el llamador cae a `NO_GROOVE` y no cambia nada.
 */
function buildGroovePlan(
  instruments: Record<number, string>,
  amount: number,
  song: SongData,
  notes: { note: SongNote; percussive: boolean }[],
): { plan: Map<string, GrooveResult>; roles: Record<number, GrooveRole> } {
  const empty = { plan: new Map<string, GrooveResult>(), roles: {} };
  if (amount <= 0) return empty;

  const notesByTrack = new Map<number, { key: string; time: number }[]>();
  const percussiveTracks = new Set<number>();
  for (const { note, percussive } of notes) {
    const list = notesByTrack.get(note.trackIndex);
    if (list) list.push({ key: note.id, time: note.time });
    else notesByTrack.set(note.trackIndex, [{ key: note.id, time: note.time }]);
    if (percussive) percussiveTracks.add(note.trackIndex);
  }

  const roles: Record<number, GrooveRole> = {};
  const tracks: GrooveTrackInput[] = [];
  for (const [trackIndex, trackNotes] of notesByTrack) {
    const instrument =
      instruments[trackIndex] ?? song.tracks[trackIndex]?.instrument ?? "";
    const percussive = percussiveTracks.has(trackIndex);
    const role = grooveRoleFor(instrument, percussive);
    roles[trackIndex] = role;
    tracks.push({
      trackIndex,
      role,
      percussive,
      sustained: isSustainedInstrument(instrument),
      notes: trackNotes,
    });
  }

  return {
    plan: planGroove({
      // El id de la canción es la semilla: la misma canción suena igual siempre.
      songSeed: hashString(song.trackId || song.title),
      bpm: song.bpm,
      timeSignature: song.timeSignature,
      amount,
      tracks,
    }),
    roles,
  };
}

/**
 * Agenda la canción completa en el transporte.
 *
 * @param groove opcional. Si viene, se aplica el plan de `@app/engine/groove` a
 *   los ticks, la duración y la velocity. Sin él (o con `amount` 0) los números
 *   agendados quedan **bit a bit** como siempre: `planGroove` devuelve un mapa
 *   vacío y cada nota cae a `NO_GROOVE` (offset 0, factores 1).
 */
export function scheduleSongOnTransport(
  song: SongData,
  host: SchedulerHost,
  groove?: GrooveOptions,
): number {
  Tone.Transport.cancel(0);

  // Lo que todavía está sonando se libera ANTES de agendar lo nuevo, sin click:
  // `releaseAll` en un Tone.Sampler es un `source.stop()` sin fade.
  host.engine.releaseAllVoices();
  host.getDrumKit()?.releaseAll();

  const notes: { note: SongNote; percussive: boolean }[] = [
    ...song.notes.map((note) => ({ note, percussive: false })),
    ...(song.percussion ?? []).map((note) => ({ note, percussive: true })),
  ];

  const ppq = Tone.Transport.PPQ;
  const baseBpm = song.bpm > 0 ? song.bpm : 120;

  // ── Perilla "Groove" (ver @app/engine/groove) ──────────────────────────────
  //
  // El plan es POR PISTA y no nota por nota porque el orden de las notas, los
  // acordes y la jerarquía métrica sólo se pueden respetar viendo la pista
  // entera. Se calcula acá, fuera de los callbacks del Transport: esos corren en
  // el tick del scheduler y todo lo que gasten se le suma a la latencia de la nota.
  const amount = groove?.amount ?? 0;
  /** Segundos por tick: convierte los milisegundos del groove a ticks exactos. */
  const secondsPerTick = 60 / (baseBpm * ppq);
  const groovePlan = groove
    ? buildGroovePlan(groove.instruments, amount, song, notes)
    : null;
  const grooveByNoteId: Map<string, GrooveResult> = groovePlan?.plan ?? new Map();

  /**
   * Instrumentación de QA (sólo desarrollo): deja el plan EXACTO que se agendó a
   * la vista de `scripts/qa-player-groove.mjs`, para poder MEDIR —no estimar— que
   * a 0 % los ticks y las velocities son los mismos que sin la perilla, y que a
   * 100 % el desvío respeta los topes de `@app/engine/groove`. Es el mismo gancho
   * que publica el piano (`window.__PMP_GROOVE__` en `App.tsx`).
   */
  const qaRows: Record<string, number | boolean | string>[] | null =
    import.meta.env.DEV ? [] : null;

  for (const { note, percussive } of notes) {
    const grooveResult: GrooveResult = grooveByNoteId.get(note.id) ?? NO_GROOVE;

    // Duración: la escrita ±8 % como máximo, más el solapamiento legato de los
    // instrumentos sostenidos. A 0 % es exactamente `Math.max(0.04, ...)`.
    const duration =
      Math.max(0.04, note.duration) * grooveResult.durationFactor +
      grooveResult.legatoMs / 1000;
    const baseTick = Math.round((note.time / 60) * baseBpm * ppq);
    // El desvío se redondea a ticks porque el Transport agenda en ticks (misma
    // resolución con la que el motor ya agenda todas las notas). `Math.round(0)`
    // es 0: a 0 % el tick de inicio es el mismo entero de siempre.
    const tickStart =
      baseTick + Math.round(grooveResult.offsetMs / 1000 / secondsPerTick);
    const tickEnd = Math.round(((note.time + duration) / 60) * baseBpm * ppq);
    /** Dinámica del groove, aplicada SÓLO al disparar (no a 0 %, donde vale 1). */
    const grooveVelocityFactor = grooveResult.velocityFactor;

    if (qaRows) {
      // Mismos números que usa el callback del Transport (misma fórmula).
      const velocityOut =
        grooveVelocityFactor === 1
          ? note.velocity
          : Math.max(0.02, Math.min(1, note.velocity * grooveVelocityFactor));
      qaRows.push({
        id: note.id,
        track: note.trackIndex,
        midi: note.midi,
        percussive,
        role: groovePlan?.roles[note.trackIndex] ?? "harmony",
        time: note.time,
        bpm: baseBpm,
        ticks: tickStart,
        ticksEnd: tickEnd,
        offsetMs: grooveResult.offsetMs,
        velocityIn: note.velocity,
        velocityOut,
        durationFactor: grooveResult.durationFactor,
        legatoMs: grooveResult.legatoMs,
      });
    }

    // Una nota muteada no se dispara, así que su note-off tampoco debe liberar
    // nada: si no, se lleva por delante una nota igual que sigue sonando.
    let triggered = false;

    Tone.Transport.schedule((audioTime) => {
      const mix = host.getMix();
      // La dinámica del groove entra acá: a 0 % el factor es 1 y el producto es
      // exactamente el mismo número que sin perilla.
      const grooveVelocity = (velocity: number) =>
        grooveVelocityFactor === 1
          ? velocity
          : Math.max(0.02, Math.min(1, velocity * grooveVelocityFactor));

      // ── Percusión (canal 10): one-shot, sin note-off ──
      if (percussive) {
        if (!isTrackAudible(note.trackIndex, mix)) return;
        const drum = host.getDrumKit();
        if (!drum) return;
        const velocity = clamp01(
          grooveVelocity(note.velocity * trackVolume(note.trackIndex, mix)),
        );
        // Si la pieza todavía no bajó, el golpe se SALTE A: nunca cae a un motor
        // sintetizado (los osciladores no existen en el camino de audio).
        drum.trigger(note.midi, velocity, audioTime);
        return;
      }

      if (!isTrackAudible(note.trackIndex, mix)) return;

      const instrument = mix.instruments[note.trackIndex] ?? "Acoustic Grand Piano";
      const velocity = clamp01(
        grooveVelocity(note.velocity * trackVolume(note.trackIndex, mix)),
      );

      const source = fireNote(host, instrument, note.midi, velocity, audioTime);
      if (source === "wait" || source === "none") {
        // La nota se saltea (silencio, nunca un oscilador) y se cuenta: es el
        // único indicador honesto de que faltó un sample.
        host.onNoteSkipped();
        return;
      }

      triggered = true;
      host.onVoiceStart(note.trackIndex, note.midi);
    }, tickStart + "i");

    Tone.Transport.schedule(() => {
      if (!triggered || percussive) return;
      releaseNote(host, note.trackIndex, note.midi);
    }, tickEnd + "i");
  }

  if (qaRows) {
    (
      globalThis as unknown as {
        __PLAYER_GROOVE__?: {
          amount: number;
          ppq: number;
          rows: unknown[];
          roleOffsets: Record<string, number>;
        };
      }
    ).__PLAYER_GROOVE__ = {
      amount,
      ppq,
      rows: qaRows,
      roleOffsets: GROOVE_ROLE_OFFSET_MS,
    };
  }

  return notes.length;
}

/**
 * Dispara una nota contra la fuente que corresponda.
 *
 * Devuelve de dónde salió el sonido, para que el llamador sepa si la nota sonó
 * de verdad (y para poder contarla en el indicador de estado).
 */
export function fireNote(
  host: SchedulerHost,
  instrument: string,
  midi: number,
  velocity: number,
  audioTime: number,
): FireSource {
  // El instrumento se resuelve ACÁ, en el momento del disparo: si el usuario
  // cambia el instrumento de una pista a mitad de la canción, las notas que
  // siguen ya salen con el nuevo.
  const key = instrument.trim().toLowerCase();

  // ── 1. Piano acústico → sampler Salamander (grabación real) ──
  if (isPianoInstrument(key)) {
    const piano = host.getPianoVoice();
    if (!piano) return "wait";
    const frequency = midiToFrequency(midi);
    // El piano no pasa por la capa de fuentes: se humaniza acá para que dos notas
    // iguales no suenen idénticas.
    piano.triggerAttack(
      frequency,
      audioTime,
      humanizeVelocity("Acoustic Grand Piano", midi, audioTime, velocity),
    );
    return "piano-sampler";
  }

  // ── 2. Cualquier otro instrumento → sample real de la capa de fuentes ──
  const sampler = host.engine.samplerFor(instrument);
  if (sampler) {
    sampler.triggerAttack(midiToFrequency(midi), audioTime, velocity);
    return "sample";
  }

  // ── 3. Sin sample listo: silencio ──
  //
  // `wait` es lo normal en los primeros compases (los samples siguen bajando) y
  // `none` es un instrumento sin ninguna fuente real. En los dos casos la nota se
  // saltea: acá vivía el respaldo de osciladores que el dueño rechazó. Se
  // distingue con el estado real de la capa de fuentes, que ya lo sabe.
  return host.engine.instrumentStatus(instrument) === "unmapped" ? "none" : "wait";
}

/** Libera una nota de la fuente con la que se ATACÓ. */
export function releaseNote(host: SchedulerHost, trackIndex: number, midi: number): void {
  const instrument = host.getMix().instruments[trackIndex] ?? "Acoustic Grand Piano";
  const frequency = midiToFrequency(midi);

  if (isPianoInstrument(instrument.trim().toLowerCase())) {
    host.getPianoVoice()?.triggerRelease(frequency);
  } else {
    try {
      host.engine.samplerFor(instrument)?.triggerRelease(frequency);
    } catch {
      /* una voz ya liberada no es un error */
    }
  }
  host.onVoiceEnd(trackIndex, midi);
}

/**
 * ¿Este instrumento debe sonar con el sampler de piano acústico?
 *
 * Mismo criterio que `playbackRouting.usesSalamanderPiano` del piano (que es
 * quien decide en la app original): los pianos eléctricos, el piano eléctrico de
 * cola, el clave y el clavinet NO — tienen su propio sample en el soundfont.
 */
export function isPianoInstrument(instrumentLower: string): boolean {
  if (
    instrumentLower.includes("electric piano") ||
    instrumentLower.includes("electric grand") ||
    instrumentLower.includes("harpsichord") ||
    instrumentLower.includes("clavinet")
  ) {
    return false;
  }
  return instrumentLower.includes("piano");
}

/**
 * Frecuencia de una nota MIDI.
 *
 * Se calcula con la fórmula en vez de `Tone.Frequency(midi, "midi")` porque esa
 * construye un objeto por nota y esto corre en el tick del scheduler.
 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp01(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}
