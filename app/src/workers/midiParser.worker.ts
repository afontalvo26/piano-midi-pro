/// <reference lib="webworker" />
// Web Worker for parsing MIDI files off the main thread.
//
// Receives raw ArrayBuffers, returns the structured SongData payload.
// Keeps the UI thread responsive even when parsing 13+ demos at startup.

import { Midi } from "@tonejs/midi";

const TRACK_COLORS = [
  "#a78bfa",
  "#60a5fa",
  "#fb923c",
  "#34d399",
  "#f472b6",
  "#fbbf24",
] as const;

// Inline copy of `gmProgramToInstrument` (subset — covers >95% of cases).
// We can't import from the main bundle here — the worker has its own module graph.
function gmInstrument(programNumber: number, trackName?: string): string {
  const name = (trackName || "").toLowerCase();
  if (name.match(/drum|perc|kit|beat/)) return "Acoustic Grand Piano";
  if (name.match(/muted trumpet/)) return "Muted Trumpet";
  if (name.match(/trumpet|trpt|tpt/)) return "Trumpet";
  if (name.match(/trombone/)) return "Trombone";
  if (name.match(/french horn/)) return "French Horn";
  if (name.match(/tuba/)) return "Tuba";
  if (name.match(/sax/)) return "Alto Sax";
  if (name.match(/flute/)) return "Flute";
  if (name.match(/clarinet/)) return "Clarinet";
  if (name.match(/violin/)) return "Violin";
  if (name.match(/cello/)) return "Cello";
  if (name.match(/bass/)) return "Acoustic Bass";
  if (name.match(/guitar/)) return "Acoustic Guitar (nylon)";
  if (name.match(/organ/)) return "Drawbar Organ";
  if (name.match(/piano|grand/)) return "Acoustic Grand Piano";

  const GM: Record<number, string> = {
    0: "Acoustic Grand Piano",
    1: "Bright Acoustic Piano",
    24: "Acoustic Guitar (nylon)",
    25: "Acoustic Guitar (steel)",
    32: "Acoustic Bass",
    40: "Violin",
    42: "Cello",
    48: "String Ensemble 1",
    52: "Choir Aahs",
    56: "Trumpet",
    57: "Trombone",
    65: "Alto Sax",
    71: "Clarinet",
    73: "Flute",
  };
  return GM[programNumber] ?? "Acoustic Grand Piano";
}

interface ParseRequest {
  type: "parse";
  id: string;
  buffer: ArrayBuffer;
  title: string;
  artist: string;
  defaultBpm: number;
  source?: string;
}

interface ParsedTrackOut {
  index: number;
  name: string;
  instrument: string;
  noteCount: number;
  color: string;
}

interface ParsedNoteOut {
  id: string;
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  trackIndex: number;
}

interface ParsedSongOut {
  title: string;
  source: string;
  duration: number;
  bpm: number;
  notes: ParsedNoteOut[];
  tracks: ParsedTrackOut[];
}

type ParseResponse =
  | { type: "parsed"; id: string; song: ParsedSongOut }
  | { type: "error"; id: string; error: string };

self.addEventListener("message", (event: MessageEvent<ParseRequest>) => {
  const msg = event.data;
  if (msg.type !== "parse") return;

  try {
    const midi = new Midi(msg.buffer);
    const tracks: ParsedTrackOut[] = [];
    const notes: ParsedNoteOut[] = [];

    const validTracks = midi.tracks
      .map((track, i) => ({ track, origIdx: i }))
      .filter(({ track }) => {
        if (track.notes.length === 0) return false;
        if (track.channel === 9) return false;
        return true;
      })
      .slice(0, 8);

    validTracks.forEach(({ track, origIdx }, newIdx) => {
      const color = TRACK_COLORS[newIdx % TRACK_COLORS.length];
      tracks.push({
        index: newIdx,
        name: track.name?.trim() || `Pista ${newIdx + 1}`,
        instrument: gmInstrument(track.instrument?.number ?? 0, track.name),
        noteCount: track.notes.length,
        color,
      });
      track.notes.forEach((note, noteIndex) => {
        notes.push({
          id: `demo-${msg.id}-${origIdx}-${noteIndex}`,
          midi: note.midi,
          time: note.time,
          duration: Math.max(0.04, note.duration),
          velocity: note.velocity || 0.75,
          trackIndex: newIdx,
        });
      });
    });

    notes.sort((a, b) => a.time - b.time);
    const duration = notes.reduce(
      (max, note) => Math.max(max, note.time + note.duration),
      0,
    );
    const bpm = Math.round(midi.header.tempos[0]?.bpm || msg.defaultBpm);

    const response: ParseResponse = {
      type: "parsed",
      id: msg.id,
      song: {
        title: `${msg.artist} - ${msg.title}`,
        source: msg.source ?? "Demo incluida",
        duration,
        bpm,
        notes,
        tracks,
      },
    };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
  } catch (err) {
    const response: ParseResponse = {
      type: "error",
      id: msg.id,
      error: err instanceof Error ? err.message : "Parse failed",
    };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
  }
});

export {};
