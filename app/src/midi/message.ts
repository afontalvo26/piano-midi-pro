/** A Web MIDI message with its original source and browser clock. */
export interface MidiMessageBase {
  readonly inputId: string;
  /** DOMHighResTimeStamp in milliseconds, in the page's performance clock. */
  readonly timeStamp: number;
  /** Copy of the bytes supplied by Web MIDI; never a view of the browser buffer. */
  readonly raw: Uint8Array;
  readonly status: number;
}

export interface MidiChannelMessage extends MidiMessageBase {
  /** Zero based MIDI channel (0..15). Add one only when displaying it. */
  readonly channel: number;
}

export type MidiEvent =
  | (MidiChannelMessage & { readonly kind: "noteOn"; readonly note: number; readonly velocity: number })
  | (MidiChannelMessage & { readonly kind: "noteOff"; readonly note: number; readonly releaseVelocity: number })
  | (MidiChannelMessage & { readonly kind: "cc"; readonly controller: number; readonly value: number })
  | (MidiChannelMessage & { readonly kind: "pitchBend"; readonly value14: number; readonly normalized: number })
  | (MidiChannelMessage & { readonly kind: "polyPressure"; readonly note: number; readonly pressure: number })
  | (MidiChannelMessage & { readonly kind: "channelPressure"; readonly pressure: number })
  | (MidiChannelMessage & { readonly kind: "programChange"; readonly program: number })
  | (MidiMessageBase & { readonly kind: "clock" | "start" | "continue" | "stop" | "activeSensing" | "systemReset" | "tuneRequest" })
  | (MidiMessageBase & { readonly kind: "songPosition"; readonly position16th: number })
  | (MidiMessageBase & { readonly kind: "songSelect"; readonly song: number })
  | (MidiMessageBase & { readonly kind: "mtcQuarterFrame"; readonly value: number })
  | (MidiMessageBase & { readonly kind: "sysex"; readonly payload: Uint8Array })
  | (MidiMessageBase & { readonly kind: "unknown"; readonly reason: string });

export function formatMidiHex(data: ArrayLike<number>): string {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

/**
 * Parse one complete Web MIDI message. It does not access React, audio or a
 * device. Unknown and malformed messages remain observable in diagnostics.
 */
export function parseMidiMessage(
  data: Uint8Array,
  inputId: string,
  timeStamp: number,
): MidiEvent {
  const raw = Uint8Array.from(data);
  const status = raw[0] ?? 0;
  const base = {
    inputId,
    timeStamp: Number.isFinite(timeStamp) && timeStamp >= 0 ? timeStamp : 0,
    raw,
    status,
  };
  const unknown = (reason: string): MidiEvent => ({ ...base, kind: "unknown", reason });

  if (raw.length === 0 || status < 0x80) return unknown("missing MIDI status");
  if (status === 0xf0) {
    if (raw.length < 2 || raw[raw.length - 1] !== 0xf7) return unknown("incomplete SysEx");
    if (raw.subarray(1, -1).some((byte) => byte > 0x7f)) return unknown("invalid SysEx data byte");
    return { ...base, kind: "sysex", payload: raw.slice(1, -1) };
  }

  const command = status & 0xf0;
  if (status < 0xf0) {
    const expected = command === 0xc0 || command === 0xd0 ? 2 : 3;
    if (raw.length !== expected) return unknown(`expected ${expected} bytes, got ${raw.length}`);
    const data1 = raw[1]!;
    const data2 = raw[2] ?? 0;
    if (data1 > 0x7f || data2 > 0x7f) return unknown("invalid MIDI data byte");
    const channelBase = { ...base, channel: status & 0x0f };
    switch (command) {
      case 0x80:
        return { ...channelBase, kind: "noteOff", note: data1, releaseVelocity: data2 };
      case 0x90:
        return data2 === 0
          ? { ...channelBase, kind: "noteOff", note: data1, releaseVelocity: 0 }
          : { ...channelBase, kind: "noteOn", note: data1, velocity: data2 };
      case 0xa0:
        return { ...channelBase, kind: "polyPressure", note: data1, pressure: data2 };
      case 0xb0:
        return { ...channelBase, kind: "cc", controller: data1, value: data2 };
      case 0xc0:
        return { ...channelBase, kind: "programChange", program: data1 };
      case 0xd0:
        return { ...channelBase, kind: "channelPressure", pressure: data1 };
      case 0xe0: {
        const value14 = (data2 << 7) | data1;
        const normalized = value14 < 8192 ? (value14 - 8192) / 8192 : (value14 - 8192) / 8191;
        return { ...channelBase, kind: "pitchBend", value14, normalized };
      }
      default:
        return unknown("unsupported channel status");
    }
  }

  const lengths: Record<number, number> = {
    0xf1: 2, 0xf2: 3, 0xf3: 2, 0xf6: 1,
    0xf8: 1, 0xfa: 1, 0xfb: 1, 0xfc: 1, 0xfe: 1, 0xff: 1,
  };
  const expected = lengths[status];
  if (expected === undefined) return unknown("undefined system status");
  if (raw.length !== expected) return unknown(`expected ${expected} bytes, got ${raw.length}`);
  if (raw.subarray(1).some((byte) => byte > 0x7f)) return unknown("invalid MIDI data byte");
  switch (status) {
    case 0xf1: return { ...base, kind: "mtcQuarterFrame", value: raw[1]! };
    case 0xf2: return { ...base, kind: "songPosition", position16th: (raw[2]! << 7) | raw[1]! };
    case 0xf3: return { ...base, kind: "songSelect", song: raw[1]! };
    case 0xf6: return { ...base, kind: "tuneRequest" };
    case 0xf8: return { ...base, kind: "clock" };
    case 0xfa: return { ...base, kind: "start" };
    case 0xfb: return { ...base, kind: "continue" };
    case 0xfc: return { ...base, kind: "stop" };
    case 0xfe: return { ...base, kind: "activeSensing" };
    case 0xff: return { ...base, kind: "systemReset" };
    default: return unknown("unsupported system status");
  }
}
