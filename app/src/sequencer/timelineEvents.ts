import type { OwnedVoiceHandle } from "../audio/ownedVoiceRegistry";

/** Pure composition output. ownerPath is relative to the transport root. */
interface TimelineBase {
  readonly eventId: string;
  readonly sourceKind: string;
  readonly ownerPath: string;
  readonly trackId?: string;
  readonly clipId?: string;
  readonly tick: number;
  readonly sequence: number;
  readonly channel: number;
}

export interface TimelineNote extends TimelineBase {
  readonly kind: "note";
  readonly pitch: number;
  readonly playedPitch: number;
  readonly sourcePitch?: number;
  readonly velocity: number;
  readonly releaseVelocity: number;
  /** Clip gain is separate from the recorded MIDI velocity. */
  readonly gainDb?: number;
  readonly durationTicks: number;
  readonly tailPolicy: "cut" | "continue";
}

/** Original-rate audio segment. tick may precede a resolver window on Seek. */
export interface TimelineAudioClip extends TimelineBase {
  readonly kind: "audioClip";
  readonly assetId: string;
  /** Absent is the original beat-anchored V1 contract. */
  readonly timeMode?: "beat" | "absolute";
  /** Exact song-zero time for an absolute clip, independent of later tempo edits. */
  readonly absoluteStartUs?: number;
  readonly absoluteEndUs?: number;
  /** Audible authority segment; also used for sub-tick starts and crossfades. */
  readonly segmentStartUs?: number;
  readonly segmentEndUs?: number;
  /** Original clip origin; tick is the audible segment's start after authority resolution. */
  readonly clipStartTick: number;
  readonly clipEndTick: number;
  readonly sourceStartFrame: number;
  readonly sourceEndFrame: number;
  /** Preserve original fade anchors when splitting the source without copying PCM. */
  readonly envelopeStartFrame?: number;
  readonly envelopeEndFrame?: number;
  readonly fadeInFrames: number;
  readonly fadeOutFrames: number;
  /** Song-zero windows. Up to one incoming and one outgoing ramp per clip. */
  readonly crossfades?: readonly {
    readonly id: string;
    readonly role: "in" | "out";
    readonly startUs: number;
    readonly endUs: number;
    readonly curve: "linear" | "equalPower";
  }[];
  readonly gainDb: number;
  readonly tailPolicy: "cut" | "continue";
}

/** Exact musical authority switch; only listed project tracks release their tails. */
export interface TimelineAuthority extends TimelineBase {
  readonly kind: "authority";
  readonly trackIds: readonly string[];
}

export type TimelineControl = TimelineBase & (
  | { readonly kind: "cc"; readonly controller: number; readonly value: number }
  | { readonly kind: "pitchBend"; readonly value14: number }
  | { readonly kind: "polyPressure"; readonly pitch: number; readonly pressure: number }
  | { readonly kind: "channelPressure"; readonly pressure: number }
  | { readonly kind: "programChange"; readonly program: number }
);

export type TimelineEvent = TimelineNote | TimelineControl | TimelineAudioClip | TimelineAuthority;

/** Mixer automation is resolved separately from MIDI expression and clip authority. */
export interface TimelineAutomation {
  readonly laneId: string;
  readonly target:
    | { readonly scope: "track"; readonly ownerId: string;
        readonly parameterId: "gainDb" | "pan"; readonly effectId?: undefined;
        readonly sendId?: undefined }
    | { readonly scope: "track"; readonly ownerId: string;
        readonly sendId: string; readonly parameterId: "gainDb";
        readonly effectId?: undefined }
    | { readonly scope: "track"; readonly ownerId: string;
        readonly effectId: string; readonly parameterId: string;
        readonly sendId?: undefined }
    | { readonly scope: "master"; readonly parameterId: "masterGainDb";
        readonly effectId?: undefined }
    | { readonly scope: "clip"; readonly ownerId: string;
        readonly parameterId: "gainDb"; readonly effectId?: undefined }
    | { readonly scope: "master"; readonly effectId: string;
        readonly parameterId: string };
  readonly tick: number;
  readonly endTick: number;
  readonly startValue: number;
  readonly endValue: number;
  readonly shape: "step" | "linear";
  readonly sequence: number;
}

export type AutomationResolver = (
  startTick: number, endTick: number, iteration: number,
) => readonly TimelineAutomation[];

/** Resolver is pure: identical snapshot/revision/range/mode gives identical events. */
export type TimelineResolver = (
  startTick: number, endTick: number, iteration: number,
) => readonly TimelineEvent[];

interface ScheduledBase {
  readonly eventId: string;
  readonly sourceKind: string;
  readonly ownerId: string;
  readonly trackId?: string;
  readonly clipId?: string;
  readonly tick: number;
  readonly absoluteTick: number;
  readonly iteration: number;
  readonly epoch: number;
  readonly audioTime: number;
  readonly sequence: number;
  readonly channel: number;
}

export type ScheduledNoteOn = ScheduledBase & TimelineNote;
export type ScheduledAudioClip = ScheduledBase & TimelineAudioClip & {
  /** Source time elapsed from the original clip origin, before starting this segment. */
  readonly elapsedSeconds: number;
  /** Song-zero time at audioTime, before loop-iteration offset. */
  readonly songTimeUs?: number;
  /** Cut at segment/loop boundary; natural source end may be earlier. */
  readonly endAudioTime: number;
};
export type ScheduledAuthority = ScheduledBase & TimelineAuthority;
export type ScheduledControl = ScheduledBase & TimelineControl;
export interface ScheduledAutomation extends TimelineAutomation {
  readonly epoch: number;
  readonly iteration: number;
  readonly absoluteTick: number;
  readonly audioTime: number;
  readonly endAudioTime: number;
}
export interface ScheduledNoteOff extends ScheduledBase {
  readonly kind: "noteOff";
  readonly pitch: number;
  readonly releaseVelocity: number;
}

export interface ScheduledMetronomeTick {
  readonly tick: number;
  readonly absoluteTick: number;
  readonly iteration: number;
  readonly epoch: number;
  readonly audioTime: number;
  readonly accent: boolean;
}

/** Implementations own per-track slots, buses and AudioParam cancellation. */
export interface SequencerSink {
  noteOn(event: ScheduledNoteOn): OwnedVoiceHandle | null;
  audioClip?(event: ScheduledAudioClip): OwnedVoiceHandle | null;
  authorityChange?(event: ScheduledAuthority): void;
  noteOff(handle: OwnedVoiceHandle, event: ScheduledNoteOff): void;
  control(event: ScheduledControl): void;
  automation?(event: ScheduledAutomation): void;
  metronome?(event: ScheduledMetronomeTick): void;
  cancelMetronome?(): void;
  /** Cancel scheduled controls and release voices only for this transport epoch. */
  cancelEpoch(rootOwnerId: string, epoch: number, audioTime: number): void;
  /** Clear only mixer parameter plans, preserving scheduled notes and live voices. */
  cancelAutomationEpoch?(rootOwnerId: string, epoch: number, audioTime: number,
    restoreBase?: boolean): void;
  finishAutomationReplan?(rootOwnerId: string, epoch: number, audioTime: number): void;
  hasAudioOwnership(): boolean;
}
