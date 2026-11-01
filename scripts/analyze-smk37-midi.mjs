import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('Uso: node scripts/analyze-smk37-midi.mjs <captura.jsonl>');
const events = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const held = new Map();
const pitches = new Set();
const velocities = [];
const controls = new Map();
let maxHeld = 0;
let unmatchedOff = 0;
let repeatedOnBeforeOff = 0;
let noteOn = 0;
let noteOff = 0;
const statusCount = new Map();

for (const event of events) {
  const [status, pitch, value] = event.bytes;
  const type = status & 0xf0;
  const channel = status & 0x0f;
  statusCount.set(type, (statusCount.get(type) ?? 0) + 1);
  const key = `${channel}:${pitch}`;
  if (type === 0x90 && value > 0) {
    noteOn++;
    pitches.add(pitch);
    velocities.push(value);
    const count = (held.get(key) ?? 0) + 1;
    held.set(key, count);
    if (count > 1) repeatedOnBeforeOff++;
    maxHeld = Math.max(maxHeld, [...held.values()].reduce((sum, amount) => sum + amount, 0));
  } else if (type === 0x80 || type === 0x90 && value === 0) {
    noteOff++;
    const count = held.get(key) ?? 0;
    if (!count) unmatchedOff++;
    else if (count === 1) held.delete(key);
    else held.set(key, count - 1);
  } else if (type === 0xb0) {
    const values = controls.get(pitch) ?? new Set();
    values.add(value);
    controls.set(pitch, values);
  }
}

console.log(JSON.stringify({
  events: events.length,
  noteOn, noteOff, maxSimultaneousRawNoteOns: maxHeld,
  unmatchedOff, repeatedOnBeforeOff,
  heldAtEnd: Object.fromEntries(held),
  physicalPitches: [...pitches].sort((a, b) => a - b),
  velocity: velocities.length ? { min: Math.min(...velocities), max: Math.max(...velocities) } : null,
  channels: [...new Set(events.map((event) => event.bytes[0] & 0x0f))].sort((a, b) => a - b),
  controls: Object.fromEntries([...controls].map(([number, values]) => [number, [...values].sort((a, b) => a - b)])),
  statusCount: Object.fromEntries([...statusCount].map(([type, count]) => [`0x${type.toString(16)}`, count])),
  captureWindowMs: events.length ? [events[0].timestampMs, events.at(-1).timestampMs] : null,
}, null, 2));
