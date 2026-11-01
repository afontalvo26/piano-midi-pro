#!/usr/bin/env node
/**
 * Audit raw WinMM short-message evidence without treating it as a sound or
 * latency certification. A synthetic fixture may pass the same checks:
 * provenance of physical origin must be independently recorded.
 *
 * Usage: node scripts/gate-smk37-midi.mjs .logs/smk37-elite-physical-20261101.jsonl
 */
import { readFile } from "node:fs/promises";

export function analyzeSmk37Capture(events) {
  const held = new Map();
  const notes = new Set();
  const controls = new Set();
  let noteOn = 0;
  let noteOff = 0;
  let unmatchedOff = 0;
  let maxHeld = 0;
  let consecutiveFullChords = 0;
  let inFullChord = false;
  for (const event of events) {
    const bytes = event?.bytes;
    if (!Array.isArray(bytes) || bytes.length !== 3 ||
        bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new Error("Captura MIDI inválida: se esperaban tres bytes por evento");
    }
    const [status, note, velocity] = bytes;
    if (status < 0x80 || status > 0xef) continue;
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    const key = `${channel}:${note}`;
    if (kind === 0x90 && velocity > 0) {
      notes.add(note);
      held.set(key, (held.get(key) ?? 0) + 1);
      noteOn++;
    } else if (kind === 0x80 || kind === 0x90 && velocity === 0) {
      const count = held.get(key) ?? 0;
      if (count < 1) unmatchedOff++;
      else if (count === 1) held.delete(key);
      else held.set(key, count - 1);
      noteOff++;
    } else if (kind === 0xb0) {
      controls.add(note);
    }
    const nowHeld = [...held.values()].reduce((sum, amount) => sum + amount, 0);
    maxHeld = Math.max(maxHeld, nowHeld);
    if (nowHeld >= 37 && !inFullChord) {
      consecutiveFullChords++;
      inFullChord = true;
    } else if (nowHeld === 0) {
      inFullChord = false;
    }
  }
  const checks = {
    thirtySevenPitches: notes.size >= 37,
    fullChordTwice: consecutiveFullChords >= 2,
    balancedReleases: unmatchedOff === 0 && held.size === 0 && noteOn === noteOff,
    sustainCC64: controls.has(64),
    sostenutoCC66: controls.has(66),
    softPedalCC67: controls.has(67),
  };
  return {
    eventCount: events.length, distinctPitches: notes.size,
    maxSimultaneous: maxHeld, fullChordWindows: consecutiveFullChords,
    noteOn, noteOff, unmatchedOff, notesHeldAtEnd: [...held.values()].reduce((a,b)=>a+b,0),
    controllerNumbers: [...controls].sort((a,b)=>a-b),
    checks, midiEvidenceReady: Object.values(checks).every(Boolean),
    physicalAudioCertified: false, physicalLatencyCertified: false,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: node scripts/gate-smk37-midi.mjs <captura.jsonl>");
    process.exitCode = 2;
  } else {
    try {
      const lines = (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean);
      const report = analyzeSmk37Capture(lines.map((line) => JSON.parse(line)));
      console.log(JSON.stringify(report, null, 2));
      if (!report.midiEvidenceReady) process.exitCode = 1;
    } catch (error) {
      console.error(String(error));
      process.exitCode = 2;
    }
  }
}
