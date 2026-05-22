// Song data types shared across the application.
// Extracted from App.tsx so non-React modules can consume them.

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
};

export type SongData = {
  title: string;
  source: string;
  duration: number;
  bpm: number;
  notes: SongNote[];
  tracks: SongTrack[];
};
