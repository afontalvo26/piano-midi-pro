// Thin client around the MIDI parser worker.
// Falls back to in-thread parsing if Worker isn't available (node, ssr).

import type { SongData } from "../types/song";

interface ParseRequestPayload {
  id: string;
  buffer: ArrayBuffer;
  title: string;
  artist: string;
  defaultBpm: number;
  source?: string;
}

let _worker: Worker | null = null;

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (_worker) return _worker;
  try {
    _worker = new Worker(
      new URL("../workers/midiParser.worker.ts", import.meta.url),
      { type: "module" },
    );
    return _worker;
  } catch {
    return null;
  }
}

/**
 * Parse a single MIDI file off the main thread.
 *
 * Returns a Promise<SongData>. If the worker is unavailable, the caller
 * should fall back to the in-thread parser.
 */
export function parseDemoInWorker(payload: ParseRequestPayload): Promise<SongData> {
  const worker = getWorker();
  if (!worker) {
    return Promise.reject(new Error("Worker unavailable"));
  }

  return new Promise<SongData>((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: "parsed"; id: string; song: SongData }
        | { type: "error"; id: string; error: string };
      if (msg.id !== payload.id) return;
      worker.removeEventListener("message", onMessage);
      if (msg.type === "parsed") resolve(msg.song);
      else reject(new Error(msg.error));
    };
    worker.addEventListener("message", onMessage);
    // Transfer the buffer so we don't pay the structured-clone cost
    worker.postMessage({ type: "parse", ...payload }, [payload.buffer]);
  });
}

/** Optional: dispose the worker when the app shuts down. */
export function disposeMidiWorker(): void {
  _worker?.terminate();
  _worker = null;
}
