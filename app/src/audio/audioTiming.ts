// ============================================================
// audioTiming — the one place that knows how the lookAhead window maps
// between "what the scheduler is thinking about" and "what the speakers
// are actually playing right now".
//
// Why this file exists
// ────────────────────
// Tone's clock runs *ahead* of the audio hardware on purpose. Every tick
// the Transport reports happens at `context.currentTime + lookAhead`, so
// that note callbacks get a whole window of wall-clock time to do their
// work before the audio they schedule has to be rendered. Tone's own docs
// on `Context.lookAhead` say exactly this: "Giving Web Audio a short amount
// of time into the future to schedule events can reduce clicks and improve
// performance. This value can be set to 0 to get the lowest latency."
//
// This app used to run that window at 0 (the "ultra" mode). With no window
// there is no margin: a callback that arrives a millisecond late schedules
// its note in the past, the Web Audio thread clamps it to "now", and the
// note lands on top of the previous one — the crackle heard on monitors.
//
// Two consequences of running with a real window, both handled here:
//
//   1. `Tone.Transport.ticks` now describes a moment ~lookAhead in the
//      future. Anything user-facing that reads the playhead — the time
//      display, the falling-notes canvas, the rhythm game, the pitch
//      practice pause — has to subtract the window, or it runs ahead of
//      what is heard. `heardTransportSeconds()` / `heardTransportTicks()`
//      are those readings.
//
//   2. Opening a *new* AudioContext is expensive. A context created with
//      `latencyHint: "interactive"` can already have 30-80 ms of hardware
//      output latency, and its clock does not advance until the graph is
//      rendering. Creating one solely to read `outputLatency` would add
//      that cost to the user's first keypress. We therefore ship a
//      conservative default and only adopt a measurement once a live
//      context can supply one for free.
// ============================================================

import * as Tone from "tone";

/**
 * Scheduling window, in seconds, for the running audio context.
 *
 * This is a *budget*, not a delay the listener pays: scheduled notes are handed
 * to Web Audio this far ahead of the moment they sound, and live keypresses are
 * deliberately excluded from it (see `liveNoteTime`). What it buys is slack for
 * the main thread.
 *
 * 60 ms is not arbitrary. Tone's ticker asks to be woken every `updateInterval`
 * and then delivers its callback through the main thread, so whatever the main
 * thread is busy with — a React render, a canvas repaint, a garbage collection —
 * comes straight off the window. Measured on this app (see
 * `tests/e2e/verify-audio-glitches.spec.ts`) the ticker commonly arrives 20-25 ms
 * late under playback load, which left a 30 ms window with only ~7 ms of real
 * headroom and notes still landing past due under load. 60 ms keeps the typical
 * lead near 35 ms and the worst case positive.
 */
const CONTEXT_LOOK_AHEAD_SEC = 0.06;

/**
 * How far ahead a *fresh* start of the Transport is placed.
 *
 * Without this the first notes of a song are scheduled in the past every single
 * time: `Transport.start()` starts the clock at that instant, the first tick
 * reports events at tick 0, and those events belong to a moment that has already
 * gone by the time their callbacks run. Web Audio then renders the opening
 * notes all at once, which is the little burst heard on the first beat.
 *
 * One millisecond is enough — the window above supplies the rest — and it also
 * costs nothing at a pause/resume, where the clock simply resumes with its
 * existing offset.
 */
const TRANSPORT_START_MARGIN_SEC = 0.001;

/**
 * Runtime override for the scheduling window, for measurements only.
 *
 * `tests/e2e/verify-audio-glitches.spec.ts` sets this before the app boots so a
 * single capture can be taken with the old 0 ms window and compared against the
 * current one on identical material. Nothing in the app writes it, so the
 * shipped behaviour is always `CONTEXT_LOOK_AHEAD_SEC`; it exists so the
 * before/after comparison does not require reverting the fix.
 */
declare global {
  interface Window {
    __AUDIO_WINDOW_OVERRIDE__?: number;
  }
}

function requestedLookAheadSec(): number {
  if (typeof window === "undefined") return CONTEXT_LOOK_AHEAD_SEC;
  const override = window.__AUDIO_WINDOW_OVERRIDE__;
  return typeof override === "number" && Number.isFinite(override) && override >= 0
    ? override
    : CONTEXT_LOOK_AHEAD_SEC;
}

/**
 * Floor for how far in the future a note may be scheduled. Web Audio accepts
 * a time already in the past (it renders it immediately), but staying a hair
 * ahead keeps every source on the same graph update and avoids the rounding
 * edge at the start of a render quantum.
 */
const MIN_SCHEDULE_LEAD_SEC = 0.002;

/** Last measured hardware output latency, in seconds. */
let measuredOutputLatencySec: number | null = null;

/**
 * Hardware output latency, in seconds, of the running context.
 *
 * `baseLatency` / `outputLatency` only mean anything once the context has
 * been resumed — an un-started context reports 0. Before that we report the
 * conservative estimate rather than forcing a context into existence.
 */
export function outputLatencySec(): number {
  if (measuredOutputLatencySec !== null) return measuredOutputLatencySec;

  const raw = Tone.getContext().rawContext as AudioContext;
  if (!raw || typeof raw.currentTime !== "number" || raw.state !== "running") {
    return 0.02;
  }

  const reported =
    typeof raw.outputLatency === "number" && raw.outputLatency > 0
      ? raw.outputLatency
      : typeof raw.baseLatency === "number" && raw.baseLatency > 0
        ? raw.baseLatency
        : null;

  if (reported === null) return 0.02;

  // Chrome on Windows sometimes reports an absurd outputLatency for
  // Bluetooth endpoints; clamp to a plausible range instead of trusting it.
  measuredOutputLatencySec = Math.min(Math.max(reported, 0.005), 0.3);
  return measuredOutputLatencySec;
}

/** Discards the cached latency measurement (after the device changes, say). */
export function resetOutputLatencyCache(): void {
  measuredOutputLatencySec = null;
}

/**
 * The current scheduling window of the live context, in seconds.
 *
 * Read from Tone rather than from our own constant so that a context built
 * elsewhere (or a mode that changes it later) is still described correctly.
 */
export function lookAheadSec(): number {
  const value = Tone.getContext().lookAhead;
  // Report the window the context actually has — a caller that asks for it must
  // never be told 60 ms while Tone is running with 0. The fallback only covers a
  // value that was never set at all.
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : CONTEXT_LOOK_AHEAD_SEC;
}

/**
 * Applies the scheduling window and its paired ticker interval.
 *
 * Tone derives `updateInterval` from `lookAhead` (half of it) when the
 * context is constructed with a `lookAhead` option, but this app sets both
 * fields explicitly after the fact — and a plain `lookAhead` assignment
 * silently overwrites `updateInterval` with `lookAhead / 2`. Setting both
 * here keeps the pairing explicit and stops the next edit from undoing it.
 *
 * Must run *before* `Tone.start()`, so the very first tick already has its
 * window.
 */
export function configureAudioTiming(): number {
  // `getContext()` is typed as `BaseContext`, but the global context Tone hands
  // back is always a `Context` — the ticker and its interval only exist there.
  const ctx = Tone.getContext() as Tone.Context;
  const scheduleWindow = requestedLookAheadSec();
  ctx.lookAhead = scheduleWindow;
  // Tone pairs the two (its own default is `lookAhead / 2`); keeping the ticker
  // three times faster than the window is what lets the scheduler stay ahead of
  // the audio thread instead of racing it.
  ctx.updateInterval = scheduleWindow > 0 ? scheduleWindow / 3 : 0.01;
  resetOutputLatencyCache();
  return scheduleWindow;
}

/**
 * Earliest time a note may still be scheduled for, in seconds.
 *
 * The window is subtracted so that a *live* keypress is scheduled against the
 * hardware clock rather than against the scheduler's future: the note still
 * needs `MIN_SCHEDULE_LEAD_SEC` of lead to be rendered cleanly, but it does
 * not need the whole window the Transport uses.
 */
export function earliestLiveScheduleTime(): number {
  const currentTime = Tone.getContext().rawContext.currentTime;
  return currentTime + MIN_SCHEDULE_LEAD_SEC - lookAheadSec();
}

/**
 * Timestamp for a note played by a human, in audio-context seconds.
 *
 * `eventTimestamp` is a `DOMHighResTimeStamp` from the MIDI event, which is
 * measured on a different clock than the audio context, so it is only useful
 * as a *relative* correction: how long ago the message arrived.
 */
export function liveNoteTime(eventTimestamp?: number): number {
  const earliest = earliestLiveScheduleTime();

  // `Tone.immediate()` is the context clock *without* the window — the anchor
  // live input has to be measured against. `Tone.now()` would add the whole
  // window back and make the instrument feel 30 ms late.
  const sinceEventSec =
    eventTimestamp !== undefined && Number.isFinite(eventTimestamp)
      ? Math.max(0, (performance.now() - eventTimestamp) / 1000)
      : 0;
  const pressedAt = Math.max(0, Tone.immediate() - sinceEventSec);

  // `earliest` is what makes this schedulable: it keeps the timestamp inside
  // the current render quantum, and Web Audio is specified to start a source
  // with a past timestamp immediately (reading the buffer at the corresponding
  // offset), so nothing is clipped even when the value is negative.
  return Math.max(pressedAt, earliest);
}

/**
 * The playhead as it is being *heard* right now, in transport seconds.
 *
 * `Tone.Transport.ticks` counts from the scheduler's future, so it reads
 * ahead of the speakers by the scheduling window. Subtracting it makes the
 * UI, the game's hit window and the practice-mode pause agree with the ear.
 * Never negative: before playback starts there is nothing to be ahead of.
 */
export function heardTransportSeconds(): number {
  const transport = Tone.getTransport();
  const raw = (transport.ticks / transport.PPQ) * (60 / transport.bpm.value);
  const heard = Math.max(0, raw - lookAheadSec());

  // Published for the playback audit; a single object assignment per frame, and
  // only in dev builds. `contextTime` and `contextState` are what separate
  // "the scheduler is behind" from "the audio clock is not running at all" —
  // the second is an environment problem, not a scheduling one.
  if (import.meta.env.DEV) {
    const context = Tone.getContext().rawContext as AudioContext;
    (globalThis as unknown as { __PMP_PLAYHEAD__?: unknown }).__PMP_PLAYHEAD__ = {
      ticks: transport.ticks,
      bpm: transport.bpm.value,
      raw,
      heard,
      state: transport.state,
      contextTime: context.currentTime,
      contextState: context.state,
    };
  }

  return heard;
}

/**
 * Transport ticks corresponding to `heardTransportSeconds()`.
 *
 * Use this instead of assigning `Tone.Transport.ticks` directly: a seek must
 * place the *heard* playhead, and assigning the raw tick count would land the
 * audio one window further along than the position the caller asked for.
 */
export function ticksForHeardSeconds(sec: number): number {
  const transport = Tone.getTransport();
  const withWindow = Math.max(0, sec) + lookAheadSec();
  return Math.round((withWindow / 60) * transport.bpm.value * transport.PPQ);
}

// ─────────────────────────────────────────────────────────────
// Silence without the click
// ─────────────────────────────────────────────────────────────

/**
 * Fade time used whenever playback is stopped, paused or re-scheduled.
 *
 * 12 ms removes the step in the waveform (a discontinuity is audible down to a
 * couple of milliseconds) and stays well inside the scheduler's own window, so
 * the fade is always finished before the notes that follow it are heard.
 */
export const RELEASE_FADE_SEC = 0.012;

/**
 * How long a faded bus stays muted before its resting level is restored.
 *
 * Must exceed `RELEASE_FADE_SEC` so the mute never truncates the ramp, and it
 * is measured on the audio clock — a late JavaScript timer cannot shorten it.
 */
const RESTORE_AFTER_FADE_SEC = 0.004;

/** The subset of `Tone.Param` this module drives on a node's `volume`. */
interface FadeableParam {
  value: number;
  cancelScheduledValues(time: number): unknown;
  cancelAndHoldAtTime?(time: number): unknown;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
}

/** Anything carrying a decibel `volume` param — Volume, PolySynth, Sampler, … */
type HasVolumeParam = { volume?: FadeableParam };

/** What a fade actually did, so callers can wait exactly that long. */
export interface FadeResult {
  /** True when the node had a usable `volume` param and was faded. */
  faded: boolean;
  /** Seconds after which the node is silent. */
  fadeSec: number;
  /** Audio-context time at which the node's resting level comes back. */
  restoredAt: number;
}

const NOT_FADED: FadeResult = { faded: false, fadeSec: 0, restoredAt: 0 };

/**
 * Holds a param at the value it has *now*, so a following ramp interpolates
 * from the real level instead of from the last scheduled one.
 *
 * `cancelAndHoldAtTime` does exactly this, but it is not in every engine; the
 * fallback reads the live value and pins it, which is equivalent here.
 */
function holdCurrentValue(param: FadeableParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === "function") {
    try {
      param.cancelAndHoldAtTime(time);
      return;
    } catch {
      /* fall through to the manual path */
    }
  }
  param.cancelScheduledValues(time);
  param.setValueAtTime(param.value, time);
}

/**
 * Fades a node's own `volume` to silence, then restores its resting level.
 *
 * Why not `releaseAll()`: Tone implements it as `source.stop(time)` on every
 * active source (`Sampler.js`, `PolySynth.js`) with no fade at all, so a note
 * still sounding is truncated mid-waveform. Across a full mix that step is a
 * loud pop — this is the click heard on pause, on stop, on seek and at the
 * start of every song, because all of those paths call `releaseAll()` first.
 *
 * Fading the *bus* rather than the voices keeps this to one automation event
 * and cannot click: the voices keep playing into a silent node, and are stopped
 * afterwards (see `stopVoicesDeferred`) where stopping is inaudible.
 *
 * The restore matters as much as the fade: a bus left at `-Infinity` would
 * swallow every note after it. It is scheduled at `ramp end + a few ms`, which
 * is inaudible because the signal is already silent by then.
 */
export function fadeOutNodeVolume(
  node: unknown,
  fadeSec = RELEASE_FADE_SEC,
): FadeResult {
  const param = (node as HasVolumeParam | null | undefined)?.volume;
  if (!param || typeof param.linearRampToValueAtTime !== "function") {
    return NOT_FADED;
  }

  // What the node should return to. `value` reads the automation value, which
  // is finite at rest; the guards only cover a node that is already mid-fade.
  const restingDb = Number.isFinite(param.value) ? param.value : 0;

  const now = Tone.now();
  const restoredAt = now + fadeSec + RESTORE_AFTER_FADE_SEC;

  try {
    holdCurrentValue(param, now);
    // `rampTo` schedules cancelAndHold(0.9 × fade) + ramp to silence. Its own
    // doc calls it the click-free way to move a param mid-ramp, and it accepts
    // `-Infinity` where `linearRampToValueAtTime` asserts on it.
    rampTo(param, -Infinity, fadeSec);
    param.setValueAtTime(-Infinity, now + fadeSec);
    rampTo(param, restingDb, RESTORE_AFTER_FADE_SEC);
  } catch {
    /* a node mid-disposal must never break the transport */
    return NOT_FADED;
  }

  return { faded: true, fadeSec, restoredAt };
}

/** `Param.rampTo` is missing from some Tone type surfaces; call it structurally. */
function rampTo(param: FadeableParam, value: number, time: number): void {
  (param as unknown as { rampTo(v: number, t: number): unknown }).rampTo(
    value,
    time,
  );
}

/**
 * Fades several nodes at once, returning the longest fade so the caller knows
 * how long the whole group stays silent.
 */
export function fadeOutNodesVolume(
  nodes: Iterable<unknown>,
  fadeSec = RELEASE_FADE_SEC,
): FadeResult {
  let faded = false;
  let restoredAt = 0;
  for (const node of nodes) {
    const result = fadeOutNodeVolume(node, fadeSec);
    faded = faded || result.faded;
    restoredAt = Math.max(restoredAt, result.restoredAt);
  }
  return faded ? { faded, fadeSec, restoredAt } : NOT_FADED;
}

/**
 * Starts the Transport on the audio clock rather than "as soon as possible".
 *
 * See `TRANSPORT_START_MARGIN_SEC`: starting at `now()` makes the opening notes
 * of a song past-due by construction.
 *
 * The offset is derived from Tone's own clock instead of `ctx.currentTime` so
 * the same arithmetic works whichever context the Transport is bound to.
 */
export function startTransportMusic(): void {
  const transport = Tone.getTransport();
  if (transport.state === "started") return;
  // `Tone.now()` already includes the window, so on the first tick the current
  // audio time sits at the top of the window and every event in it has room.
  transport.start(Tone.now() + TRANSPORT_START_MARGIN_SEC);
}

/**
 * Hard-stops voices well after they have been faded, i.e. while they are
 * already inaudible — the one place where `releaseAll`/`stop` is safe.
 *
 * Uses a wall-clock timer rather than a Transport event on purpose: every
 * caller runs with the Transport *stopped*, so a scheduled event would never
 * fire. Late is also the safe direction here — a delayed cleanup happens to
 * silent voices, so main-thread jank can only postpone it, never expose it.
 *
 * @returns a canceller, so a new playback can drop a pending cleanup instead of
 *          having it stop the voices that were just started.
 */
export function stopVoicesDeferred(
  stop: () => void,
  delaySec = 0.25,
): () => void {
  const timer = setTimeout(() => {
    try {
      stop();
    } catch {
      /* disposal races must never break playback */
    }
  }, Math.max(0, delaySec) * 1000);

  return () => clearTimeout(timer);
}



