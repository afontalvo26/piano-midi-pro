/** The seven local Salamander recordings that cover the initial C3–C6 view. */
import { decodeSalamanderAacFallback } from "./salamanderAacFallback.ts";

export const CORE_PIANO_NOTES = ["C3", "F#3", "C4", "F#4", "C5", "F#5", "C6"] as const;

export type CorePianoNote = (typeof CORE_PIANO_NOTES)[number];

const FILE_BY_NOTE: Record<CorePianoNote, string> = {
  C3: "C3.ogg",
  "F#3": "Fs3.ogg",
  C4: "C4.ogg",
  "F#4": "Fs4.ogg",
  C5: "C5.ogg",
  "F#5": "Fs5.ogg",
  C6: "C6.ogg",
};

const CORE_BASE_URL = "/audio/salamander/core/";

let preloadPromises: Map<CorePianoNote, Promise<AudioBuffer | null>> | null = null;
let decoderContext: OfflineAudioContext | null = null;

function isCoreNote(note: string): note is CorePianoNote {
  return Object.prototype.hasOwnProperty.call(FILE_BY_NOTE, note);
}

function isOgg(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 4) return false;
  const header = new Uint8Array(bytes, 0, 4);
  return header[0] === 0x4f && header[1] === 0x67
    && header[2] === 0x67 && header[3] === 0x53;
}

async function fetchAndDecode(
  note: CorePianoNote,
  decoder: OfflineAudioContext,
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(`${CORE_BASE_URL}${FILE_BY_NOTE[note]}`);
    if (response.status !== 200) return null;
    const bytes = await response.arrayBuffer();
    // A misconfigured SPA server can answer a missing sample with index.html.
    if (!isOgg(bytes)) return null;
    let buffer: AudioBuffer;
    try { buffer = await decoder.decodeAudioData(bytes); }
    catch { buffer = await decodeSalamanderAacFallback(decoder, note, FILE_BY_NOTE[note]); }
    return buffer.length > 0 && buffer.numberOfChannels > 0 ? buffer : null;
  } catch {
    // The caller can fetch the original remote sample for this pitch.
    return null;
  }
}

/**
 * Start all local fetches and decodes before an audio-unlock gesture. A single
 * OfflineAudioContext handles the seven independent files. It never renders or
 * opens a live output context; each promise is reused by later callers.
 */
export function startCorePianoPreload(): void {
  if (preloadPromises) return;
  preloadPromises = new Map();

  if (typeof OfflineAudioContext === "undefined") {
    for (const note of CORE_PIANO_NOTES) preloadPromises.set(note, Promise.resolve(null));
    return;
  }

  try {
    decoderContext = new OfflineAudioContext(2, 1, 48000);
  } catch {
    for (const note of CORE_PIANO_NOTES) preloadPromises.set(note, Promise.resolve(null));
    return;
  }

  const decoder = decoderContext;
  for (const note of CORE_PIANO_NOTES) {
    preloadPromises.set(note, fetchAndDecode(note, decoder));
  }
  // Keep decoded buffers in their promises, but release the decoder reference.
  void Promise.all(preloadPromises.values()).then(() => { decoderContext = null; });
}

/** One promise per pitch; null signals that App should try the remote source. */
export function getCorePianoBuffer(note: string): Promise<AudioBuffer | null> {
  if (!isCoreNote(note)) return Promise.resolve(null);
  startCorePianoPreload();
  return preloadPromises!.get(note)!;
}
