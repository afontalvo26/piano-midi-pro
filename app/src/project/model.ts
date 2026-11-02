/** Canonical musical resolution of project documents. SMF takes keep their own PPQ. */
export const PROJECT_PPQ = 960;
export const PROJECT_SCHEMA_VERSION = 1;

export type ProjectId = string;
export type TrackId = string;
export type PatternId = string;
export type ClipId = string;
export type AssetId = string;

export interface TempoPoint {
  readonly tick: number;
  /** Integer microseconds per quarter note, as in Standard MIDI Files. */
  readonly microsPerQuarter: number;
}

export interface MeterPoint {
  readonly tick: number;
  readonly numerator: number;
  readonly denominator: number;
}

export interface ProjectNoteOrigin {
  readonly kind: "drawn" | "captured" | "imported";
  /** ProjectTakeRef.id; preserves the immutable RecordingLibrary source of an overdub. */
  readonly sourceTakeId?: string;
  /** Omitted when a historical SMF cannot prove the physical key pressed. */
  readonly sourcePitch?: number;
  /** Pitch performed before subsequent edits; note.pitch is the current pitch. */
  readonly playedPitch?: number;
  readonly inputId?: string;
  readonly sourceChannel?: number;
  readonly sourceTrackIndex?: number;
  readonly sourcePpq?: number;
  readonly sourceStartTick?: number;
  readonly sourceDurationTick?: number;
  /** Pattern-local coordinates immediately after musical-clock retiming at overdub commit. */
  readonly importedProjectStartTick?: number;
  readonly importedProjectDurationTick?: number;
  readonly sourceSequence?: number;
  readonly captureStartMs?: number;
  readonly captureDurationMs?: number;
  readonly originalVelocity?: number;
}

export interface ProjectNote {
  readonly id: string;
  readonly startTick: number;
  readonly durationTick: number;
  readonly pitch: number;
  readonly velocity: number;
  readonly releaseVelocity: number;
  readonly channel: number;
  readonly origin: ProjectNoteOrigin;
  /** Signed timing offset from the editable start tick, retained independently. */
  readonly microOffsetTick?: number;
  readonly probability?: number;
  readonly ratchetCount?: number;
  /** Stable grid step identity; absent for free-positioned notes. */
  readonly stepId?: string;
  readonly muted?: boolean;
}

interface ExpressionBase {
  readonly id: string;
  readonly tick: number;
  readonly channel: number;
  readonly sequence: number;
  readonly sourceTakeId?: string;
  readonly sourcePpq?: number;
  readonly sourceTick?: number;
  readonly sourceTrackIndex?: number;
}

export type ProjectExpressionEvent =
  | (ExpressionBase & { readonly kind: "cc"; readonly controller: number; readonly value: number })
  | (ExpressionBase & { readonly kind: "pitchBend"; readonly value14: number })
  | (ExpressionBase & { readonly kind: "polyPressure"; readonly pitch: number; readonly pressure: number })
  | (ExpressionBase & { readonly kind: "channelPressure"; readonly pressure: number })
  | (ExpressionBase & { readonly kind: "programChange"; readonly program: number });

export interface ProjectPattern {
  readonly id: PatternId;
  readonly name: string;
  /** Only the current source is stored. Shared edits bump this and all referring clips together. */
  readonly version: number;
  readonly lengthTicks: number;
  /** Drum steps and piano roll notes share this single event collection. */
  readonly notes: readonly ProjectNote[];
  readonly expression: readonly ProjectExpressionEvent[];
}

export interface ProjectInstrumentRef {
  readonly instrumentId: string;
  readonly packageVersion: string;
  readonly presetId: string;
  /** User sampler voice policy; absent retains the original polyphonic behavior. */
  readonly sampleVoice?: {
    readonly mode: "poly" | "mono";
    readonly retrigger: "always" | "legato";
    readonly glideMs: number;
    readonly attackMs: number;
    readonly releaseMs: number;
    /** 0..1 soft saturation amount; optional for backwards-compatible projects. */
    readonly saturation?: number;
    /** Parallel low-passed reinforcement in dB; absent disables the subgrave path. */
    readonly subGainDb?: number;
  };
  /** Optional non-destructive region for a user/recorded sample; frames refer to original decoded audio. */
  readonly sampleRegion?: {
    readonly startFrame: number;
    readonly endFrame: number;
    readonly fadeInFrames: number;
    readonly fadeOutFrames: number;
    readonly rootMidi: number;
    readonly cents: number;
    readonly reverse: boolean;
    readonly loopMode: "none" | "loop";
    readonly playMode: "oneShot" | "gate";
  };
}

export type ProjectDrumPadSource =
  | { readonly kind: "instrument"; readonly ref: ProjectInstrumentRef; readonly sourceNote: number }
  | { readonly kind: "asset"; readonly assetId: AssetId; readonly sha256: string };

/** A stable trigger slot. Null source is explicit silence until a recorded source is installed. */
export interface ProjectDrumPad {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly midiNote: number;
  readonly channel: number;
  readonly source: ProjectDrumPadSource | null;
  readonly gainDb: number;
  readonly pan: number;
  readonly pitchSemitones: number;
  readonly startFrame: number;
  /** Exclusive decoded-frame endpoint; omitted means the complete source. */
  readonly endFrame?: number;
  /** Fade in on trigger. */
  readonly attackMs: number;
  /** Gate release/choke fade; oneShot uses this as an optional end fade. */
  readonly decayMs: number;
  readonly playMode: "oneShot" | "gate";
  readonly mute: boolean;
  readonly solo: boolean;
  readonly chokeGroup?: string;
  readonly stepTicks: number;
  readonly stepCount: number;
}

export interface ProjectDrumRack {
  /** Exactly 16 stable slots; absent rack means legacy drum-track behavior. */
  readonly pads: readonly ProjectDrumPad[];
}

export type EffectParameter = number | string | boolean;

export interface ProjectEffect {
  readonly id: string;
  readonly kind: string;
  readonly enabled: boolean;
  readonly parameters: Readonly<Record<string, EffectParameter>>;
}

export interface ProjectSend {
  readonly id: string;
  readonly busTrackId: TrackId;
  readonly gainDb: number;
}

/** Audio-driven ducking. The detector source is control-only and never adds audio to the target. */
export interface ProjectSidechain {
  readonly sourceTrackId: TrackId;
  readonly thresholdDb: number;
  readonly ratio: number;
  readonly attackMs: number;
  readonly releaseMs: number;
  /** Delay only the target path so the key can reduce gain before the transient arrives. */
  readonly lookaheadMs?: number;
  readonly maxReductionDb: number;
}

export interface ProjectMixChannel {
  readonly gainDb: number;
  readonly pan: number;
  readonly mute: boolean;
  readonly solo: boolean;
  readonly armed: boolean;
  /** Omitted means the master bus. */
  readonly outputBusTrackId?: TrackId;
  readonly sends: readonly ProjectSend[];
  /** Optional kick/key detector driving gain reduction after inserts and pan. */
  readonly sidechain?: ProjectSidechain;
  readonly effects: readonly ProjectEffect[];
}

export interface ProjectTrack {
  readonly id: TrackId;
  readonly name: string;
  readonly kind: "instrument" | "drum" | "audio" | "bus";
  readonly instrument?: ProjectInstrumentRef;
  readonly drumRack?: ProjectDrumRack;
  readonly mix: ProjectMixChannel;
}

interface ClipBase {
  readonly id: ClipId;
  readonly trackId: TrackId;
  readonly startTick: number;
  readonly lengthTicks: number;
  readonly sourceOffsetTick: number;
  readonly loopMode: "none" | "loop";
  readonly tailPolicy: "cut" | "continue";
  readonly transpose: number;
  readonly gainDb: number;
  readonly muted: boolean;
  /** Optional arrangement edit group. Group membership never changes playback authority. */
  readonly groupId?: string;
}

export type ProjectClip =
  | (ClipBase & {
      readonly kind: "pattern";
      readonly sourceId: PatternId;
      /** Hacer único creates a new pattern ID and repoints just this clip in one command. */
      readonly sourceVersion: number;
    })
  | (ClipBase & {
      readonly kind: "audio";
      readonly sourceId: AssetId;
      /** Exact recorded take behind this clip, if it came from an AudioInputSession. */
      readonly sourceTakeId?: string;
      /** Omitted is the V1 beat timeline; absolute clips keep microsecond anchors under tempo edits. */
      readonly timeMode?: "beat" | "absolute";
      readonly absoluteStartUs?: number;
      readonly absoluteEndUs?: number;
      readonly sourceStartFrame: number;
      readonly sourceEndFrame: number;
      /** Stable original fade anchors; split children keep them instead of creating a new fade. */
      readonly envelopeStartFrame?: number;
      readonly envelopeEndFrame?: number;
      readonly fadeInFrames: number;
      readonly fadeOutFrames: number;
    });

export interface ProjectAudioCrossfade {
  readonly id: string;
  readonly outgoingClipId: ClipId;
  readonly incomingClipId: ClipId;
  /** The overlap window is derived from clip positions; no duplicate timing authority. */
  readonly curve: "linear" | "equalPower";
}

/** Comp selections cite audible clips; clips and crossfades remain the playback authority. */
export interface ProjectAudioComp {
  readonly id: string;
  readonly name: string;
  readonly trackId: TrackId;
  readonly segments: readonly {
    readonly id: string;
    readonly clipId: ClipId;
    readonly takeId: string;
  }[];
}

/** Ephemeral capture plan; AudioContext scheduling is owned by the active audio tab. */
export interface ProjectAudioRecordingPlan {
  readonly startTick: number;
  readonly countInBars: 0 | 1 | 2 | 3 | 4;
  readonly punch?: { readonly startTick: number; readonly endTick: number };
}

export interface ProjectSceneSlot {
  readonly id: string;
  readonly trackId: TrackId;
  readonly patternId: PatternId;
}

export interface ProjectScene {
  readonly id: string;
  readonly name: string;
  /** Zero means immediate; otherwise quantize launch to this many ticks. */
  readonly launchQuantizationTicks: number;
  readonly slots: readonly ProjectSceneSlot[];
}

export interface ProjectSection {
  readonly id: string;
  readonly name: string;
  readonly startTick: number;
  readonly lengthTicks: number;
}

export interface ProjectAssetRef {
  readonly id: AssetId;
  readonly sha256: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly sourceKind: "official" | "user" | "recorded";
  readonly license: string;
  readonly creator?: string;
  readonly sourceUrl?: string;
  readonly packageVersion?: string;
  readonly frameCount?: number;
  readonly sampleRate?: number;
  readonly channelCount?: number;
}

/** Historical provenance of a bus render; playback uses the immutable WAV, not the source graph. */
export interface ProjectAudioResample {
  readonly sourceBusTrackId: TrackId;
  readonly destinationTrackId: TrackId;
  readonly sourceRevision: number;
  readonly sourceHash: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly tap: "post-bus-pre-master";
  readonly sourceTrackIds: readonly TrackId[];
  readonly includedEffectIds: readonly string[];
  /** Route-specific sends feeding the captured bus; legacy renders omit this. */
  readonly includedSendIds?: readonly string[];
  readonly seed: string;
  readonly sampleRate: number;
  readonly channelCount: number;
  /** Total rendered frames, including the tail exactly once. */
  readonly frameCount: number;
  readonly tailFrames: number;
  readonly rendererVersion: "bus-resample-v1";
}

export interface ProjectTakeRef {
  readonly id: string;
  readonly kind: "midi" | "audio";
  readonly recordingId?: string;
  /** Recorded audio or exact original SMF copied into project assets; legacy MIDI takes may omit it. */
  readonly assetId?: AssetId;
  readonly createdAt: number;
  /** Clock/capture provenance for an immutable recorded audio take. */
  readonly audioCapture?: {
    readonly startTick: number;
    /** Exact song-zero microseconds at the first confirmed audio frame; absent in legacy takes. */
    readonly startProjectUs?: number;
    readonly startAudioTime: number;
    readonly frameCount: number;
    readonly sampleRate: number;
    readonly channelCount: number;
    readonly deviceId?: string;
    readonly latencyOffsetFrames: number;
    /** Original measured value; omitted legacy data means latencyOffsetFrames was captured. */
    readonly capturedLatencyOffsetFrames?: number;
    /** Punch times are historical AudioContext timestamps, never reopened as clock authority. */
    readonly punch?: {
      readonly startTick: number;
      readonly endTick: number;
      readonly startAudioTime: number;
      readonly endAudioTime: number;
    };
    readonly incomplete: boolean;
    readonly reason?: string;
  };
  /** Rendered internally from a project bus; never implies microphone access. */
  readonly audioResample?: ProjectAudioResample;
  /** Non-destructive provenance of an imported MIDI take; raw bytes remain in RecordingLibrary. */
  readonly midiImport?: {
    readonly sourceSha256: string;
    readonly sourceByteLength: number;
    readonly sourcePpq: number;
    readonly tempoMap: readonly TempoPoint[];
    readonly meterMap: readonly MeterPoint[];
    readonly sourceTempoEvents: readonly {
      readonly sourceTick: number; readonly sourceTrackIndex: number; readonly sourceSequence: number;
      readonly microsPerQuarter: number;
    }[];
    readonly sourceMeterEvents: readonly {
      readonly sourceTick: number; readonly sourceTrackIndex: number; readonly sourceSequence: number;
      readonly numerator: number; readonly denominator: number;
    }[];
    readonly roundedPositions: number;
    readonly ignoredMetaEvents: number;
    readonly ignoredSysExEvents: number;
    readonly normalizedZeroDurations: number;
  };
}

export interface ProjectAutomationPoint {
  readonly id: string;
  /** Clip lanes use local ticks; track and master lanes use absolute project ticks. */
  readonly tick: number;
  readonly value: number;
  readonly shape: "step" | "linear" | "bezier";
  readonly curve?: number;
}

export interface ProjectAutomationLane {
  readonly id: string;
  /** Omitted is read-only playback; touch recording requires an armed runtime. */
  readonly writeMode?: "read" | "touch";
  readonly target: {
    readonly scope: "track" | "clip" | "master";
    readonly ownerId?: string;
    /** Exact insert in the owner chain; parameterId names one numeric parameter of that insert. */
    readonly effectId?: string;
    readonly parameterId: string;
  };
  readonly points: readonly ProjectAutomationPoint[];
}

export interface ProjectMixState {
  readonly masterGainDb: number;
  readonly masterEffects: readonly ProjectEffect[];
}

/** JSON-serializable source of truth. Revision/hash are stored outside this document. */
export interface ProjectDocumentV1 {
  readonly id: ProjectId;
  readonly name: string;
  readonly schemaVersion: 1;
  readonly ppq: 960;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived: boolean;
  readonly tempoMap: readonly TempoPoint[];
  readonly meterMap: readonly MeterPoint[];
  readonly trackOrder: readonly TrackId[];
  readonly tracks: readonly ProjectTrack[];
  readonly patterns: readonly ProjectPattern[];
  readonly clips: readonly ProjectClip[];
  readonly audioCrossfades?: readonly ProjectAudioCrossfade[];
  readonly audioComps?: readonly ProjectAudioComp[];
  readonly scenes: readonly ProjectScene[];
  readonly sections: readonly ProjectSection[];
  readonly assets: readonly ProjectAssetRef[];
  readonly takes: readonly ProjectTakeRef[];
  readonly automation: readonly ProjectAutomationLane[];
  readonly mix: ProjectMixState;
}

export interface CreateProjectOptions {
  readonly id?: string;
  readonly name?: string;
  readonly at?: number;
  readonly microsPerQuarter?: number;
  readonly numerator?: number;
  readonly denominator?: number;
}

export function createProjectDocument(options: CreateProjectOptions = {}): ProjectDocumentV1 {
  const at = options.at ?? Date.now();
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    name: options.name ?? "Proyecto sin título",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    ppq: PROJECT_PPQ,
    createdAt: at,
    updatedAt: at,
    archived: false,
    tempoMap: [{ tick: 0, microsPerQuarter: options.microsPerQuarter ?? 500_000 }],
    meterMap: [{ tick: 0, numerator: options.numerator ?? 4, denominator: options.denominator ?? 4 }],
    trackOrder: [],
    tracks: [],
    patterns: [],
    clips: [],
    scenes: [],
    sections: [],
    assets: [],
    takes: [],
    automation: [],
    mix: { masterGainDb: 0, masterEffects: [] },
  };
}
