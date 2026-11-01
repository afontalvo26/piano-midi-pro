import { formatMidiHex, type MidiEvent } from "./message.ts";

export interface MidiObservation {
  readonly inputId: string;
  readonly timeStamp: number;
  readonly kind: MidiEvent["kind"];
  readonly channel?: number;
  readonly rawHex: string;
  readonly number?: number;
  readonly value?: number;
  /** Advisory only: two inputs delivered the same bytes close together. */
  readonly possibleMirrorOf?: string;
}

export type MidiPortRole = "performance" | "controls" | "sequencer" | "unknown";

function observationOf(event: MidiEvent): MidiObservation {
  const common = {
    inputId: event.inputId,
    timeStamp: event.timeStamp,
    kind: event.kind,
    rawHex: formatMidiHex(event.raw),
    ...( "channel" in event ? { channel: event.channel } : {}),
  };
  switch (event.kind) {
    case "noteOn": return { ...common, number: event.note, value: event.velocity };
    case "noteOff": return { ...common, number: event.note, value: event.releaseVelocity };
    case "cc": return { ...common, number: event.controller, value: event.value };
    case "polyPressure": return { ...common, number: event.note, value: event.pressure };
    case "channelPressure": return { ...common, value: event.pressure };
    case "pitchBend": return { ...common, value: event.value14 };
    case "programChange": return { ...common, number: event.program };
    case "songPosition": return { ...common, value: event.position16th };
    case "songSelect": return { ...common, value: event.song };
    case "mtcQuarterFrame": return { ...common, value: event.value };
    default: return common;
  }
}

/** Bounded, local, push-only monitor. No polling or automatic upload. */
export class MidiMonitor {
  private readonly records: MidiObservation[] = [];
  private readonly roles = new Map<string, MidiPortRole>();
  private readonly capacity: number;

  constructor(capacity = 256) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4096) {
      throw new RangeError("MIDI monitor capacity must be 1..4096");
    }
    this.capacity = capacity;
  }

  observe(event: MidiEvent): MidiObservation {
    const next = observationOf(event);
    // Same bytes and nearby timestamps are a diagnostic clue, not proof that
    // the second message can be discarded. Scan without cloning the ring.
    let mirrored: MidiObservation | undefined;
    for (let index = this.records.length - 1; index >= 0; index--) {
      const previous = this.records[index]!;
      if (previous.inputId !== next.inputId && previous.rawHex === next.rawHex &&
          Math.abs(previous.timeStamp - next.timeStamp) <= 3) {
        mirrored = previous;
        break;
      }
    }
    const observation = mirrored ? { ...next, possibleMirrorOf: mirrored.inputId } : next;
    this.records.push(observation);
    if (this.records.length > this.capacity) this.records.shift();
    return observation;
  }

  snapshot(): MidiObservation[] {
    return this.records.slice();
  }

  annotatePort(inputId: string, role: MidiPortRole): void {
    this.roles.set(inputId, role);
  }

  portRoles(): ReadonlyMap<string, MidiPortRole> {
    return new Map(this.roles);
  }

  clear(): void {
    this.records.length = 0;
  }
}
