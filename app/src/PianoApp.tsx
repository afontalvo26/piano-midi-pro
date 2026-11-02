import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LiveStudioEngine } from "./audio/liveStudioEngine";
import type { ProjectLauncherSnapshot, ProjectRecordingSchedule } from "./audio/projectPlayback";
import { PROJECT_808_INSTRUMENT, PROJECT_CLAP_INSTRUMENT, PROJECT_DRUM_INSTRUMENT,
  PROJECT_PIANO_INSTRUMENT } from "./audio/projectAudioSink";
import { PianoKeyboard } from "./components/studio/PianoKeyboard";
import { ReferenceStudio } from "./components/studio/ReferenceStudio";
import { studioLoopBarRange } from "./components/studio/studioMusicalBars";
import { StudioScore } from "./components/studio/StudioScore";
import { applyStudioMacro } from "./components/studio/studioMacros";
import { LivePerformanceReadout } from "./components/studio/LivePerformanceReadout";
import { publishLiveStrike } from "./components/studio/livePerformanceStore";
import { MidiControlPanel } from "./components/midi/MidiControlPanel";
import { RecordedTracks } from "./components/tracks/RecordedTracks";
import { ProjectBrowser } from "./components/tracks/ProjectBrowser";
import { PianoRoll } from "./components/beatmaker/PianoRoll";
import { RecordedOverdubPanel } from "./components/beatmaker/RecordedOverdubPanel";
import { DrumMachine, type DrumRackSourceOption } from "./components/beatmaker/DrumMachine";
import { Arrangement } from "./components/beatmaker/Arrangement";
import { AutomationEditor } from "./components/beatmaker/AutomationEditor";
import type { BaseAutomationTarget } from "./composition/automationEdit";
import type { DrumPadDefinition } from "./composition/drumPattern";
import { createArrangementResolver } from "./composition/resolveProjectTimeline";
import { createCaptureOverlay } from "./composition/captureOverlay";
import { createProjectDocument, PROJECT_PPQ, type ProjectDocumentV1, type ProjectDrumPad,
  type ProjectAudioRecordingPlan, type ProjectDrumRack, type ProjectEffect,
  type ProjectInstrumentRef, type ProjectNote } from "./project/model";
import { ProjectRepository, type ProjectListItem } from "./project/repository";
import type { ProjectAssetStatus } from "./project/assets";
import { inspectProjectAssets, relocalizeProjectAsset } from "./project/assetRelocation";
import { ProjectSession, type ProjectSessionSnapshot } from "./project/session";
import { exportProjectBundle, importProjectBundle, previewProjectBundle } from "./project/bundle";
import { convertRecordedTake } from "./project/smfImport";
import { prepareRecordedTakeImport } from "./project/takeImport";
import { commitPortableRecordedOverdub } from "./project/portableOverdub";
import type { PortableRecordedOverdubRequest } from "./project/portableOverdub";
import { exportArrangementMidi } from "./export/arrangementMidiClient";
import { analyzeUserSample, type AnalyzedUserSample } from "./audio/userSampleAsset";
import { type AudioCaptureTake, type AudioInputSession,
  type AudioInputSnapshot } from "./audio/audioInputSession";
import { installUserSample } from "./project/userSampleInstall";
import { installSampleSlices } from "./project/sampleSliceInstall";
import { installAudioCapture } from "./project/audioTakeInstall";
import { installBusResample } from "./project/busResampleInstall";
import { renderProjectBusPcm } from "./audio/renderProjectBusPcm";
import type { RenderProgress } from "./audio/renderProjectPcm";
import { MusicalClock } from "./sequencer/musicalClock";
import { AudioRecorderPanel, type AudioCaptureSettings } from "./components/tracks/AudioRecorderPanel";
import { AudioTakeLatencyPanel } from "./components/tracks/AudioTakeLatencyPanel";
import { ProjectBusResamplePanel, type ProjectBusResampleRequest } from "./components/tracks/ProjectBusResamplePanel";
import { ProjectMixer } from "./components/tracks/ProjectMixer";
import { ProjectExportPanel } from "./components/tracks/ProjectExportPanel";
import { ProjectAssetRepairPanel } from "./components/tracks/ProjectAssetRepairPanel";
import { ProjectSampleVoicePanel } from "./components/tracks/ProjectSampleVoicePanel";
import { ProjectSampleSlicePanel } from "./components/tracks/ProjectSampleSlicePanel";
import { ProjectSoundLibrariesPanel } from "./components/tracks/ProjectSoundLibrariesPanel";
import { exportProjectWav, type ProjectWavOptions, type ProjectWavProgress } from "./export/projectWav";
import { zipProjectWavAsync } from "./export/projectWavZip";
import { getProjectStorageHealth, requestProjectStoragePersistence,
  type ProjectStorageHealth } from "./project/storageHealth";
import type { ProjectCommand } from "./project/commands";
import { MidiMonitor, type MidiObservation } from "./midi/diagnostics";
import { ALL_MIDI_INPUTS_ID, AUTO_MIDI_INPUT_ID, selectMidiInput } from "./midi/inputSelection";
import { parseMidiMessage, type MidiEvent } from "./midi/message";
import { MidiPhysicalTrace } from "./midi/physicalTrace";
import {
  bindingValue, identifyProfile, learnMidiBinding, loadMidiBindings, mapPhysicalNote, resolveBindings,
  saveMidiBindings, upsertMidiBinding, type MidiBinding, type MidiProfileId,
  type MidiValueMode,
} from "./midi/profile";
import { MidiRecorder, type MidiRecorderSnapshot } from "./midi/recorder";
import { RecordingLibrary, type RecordedTakeSummary, type SaveRecordingOptions } from "./midi/recordingLibrary";
import { InstrumentBrowser } from "./components/studio/InstrumentBrowser";
import { DEFAULT_INSTRUMENT_ID, getInstrument } from "./instruments/catalog";
import { pianoKeyboardStore } from "./state/pianoKeyboardStore";
import { midiToLabel } from "./utils/audioMidiUtils";
import { useLocalStorageState } from "./utils/settings";
import {
  computeVelocityExpression, DEFAULT_CALIBRATION, DEFAULT_PHYSICAL_CALIBRATION,
  DEFAULT_VELOCITY_CALIBRATION_BANK, getPortVelocityCalibration, recordPortVelocity,
  resetPortVelocityCalibration, setPortVelocityCalibration, VELOCITY_CALIBRATIONS_STORAGE_KEY,
  VELOCITY_CURVE_DESCRIPTORS, VELOCITY_CURVES,
  type VelocityCalibration, type VelocityCalibrationBank, type VelocityCalibrationScope, type VelocityCurve,
} from "./utils/velocity";
import "./PianoApp.css";

type Screen = "studio" | "tracks" | "settings";
type Pedal = "sustain" | "sostenuto" | "unaCorda";
type InputInfo = { id: string; name: string; manufacturer?: string | null; state?: "connected" | "disconnected" };
type HeldNote = { display: number; played: number };
type SampleRegionDraft = { startSeconds: number; endSeconds: number; fadeInMs: number; fadeOutMs: number;
  rootMidi: number; cents: number; reverse: boolean; loopMode: "none" | "loop"; playMode: "oneShot" | "gate" };
type RecordingOverlayTarget = { projectId: string; trackId: string; startTick: number; startPerfMs: number;
  tempoMap: ProjectDocumentV1["tempoMap"]; meterMap: ProjectDocumentV1["meterMap"] };
type SavedOverdubTarget = { recordingId: string; projectId: string; trackId: string; startTick: number };

const MIN_MIDI = 21;
const MAX_MIDI = 108;
const KEY_COUNT = 37;
const KEY_LAYOUT = "zsxdcvgbhnjmq2w3er5t6y7ui9o0p";
const KEY_OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
const ACTIVE_MIDI_ACTIONS = new Set([
  "recording.toggle", "metronome.toggle", "drum.pad", "bank.prev", "bank.next",
  "piano.modulation", "piano.release", "piano.transpose", "volume.master",
  "effect.reverbDecay", "effect.chorusDepth",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function level(value: number, mode: MidiValueMode, current: number): number {
  const relative = mode === "relative-twos-complement" || mode === "relative-binary-offset";
  return clamp(relative ? current + value / 127 : value / 127, 0, 1);
}

function sameLauncher(left: ProjectLauncherSnapshot | null, right: ProjectLauncherSnapshot | null): boolean {
  return left?.activeSceneId === right?.activeSceneId &&
    left?.queuedSceneId === right?.queuedSceneId &&
    left?.queuedStartTick === right?.queuedStartTick &&
    left?.performanceRevision === right?.performanceRevision &&
    left?.performedSceneSegments.length === right?.performedSceneSegments.length;
}

function sampleRegionFromDraft(draft: SampleRegionDraft, frames: number, sampleRate: number) {
  const startFrame = Math.round(draft.startSeconds * sampleRate);
  const endFrame = Math.round(draft.endSeconds * sampleRate);
  const fadeInFrames = Math.round(draft.fadeInMs * sampleRate / 1000);
  const fadeOutFrames = Math.round(draft.fadeOutMs * sampleRate / 1000);
  if (![startFrame, endFrame, fadeInFrames, fadeOutFrames, draft.rootMidi, draft.cents].every(Number.isFinite)
    || !Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrame)
    || startFrame < 0 || endFrame > frames || endFrame <= startFrame
    || fadeInFrames < 0 || fadeOutFrames < 0 || fadeInFrames + fadeOutFrames > endFrame - startFrame
    || !Number.isInteger(draft.rootMidi) || draft.rootMidi < 0 || draft.rootMidi > 127
    || draft.cents < -2400 || draft.cents > 2400
    || (draft.loopMode === "loop" && draft.playMode !== "gate")) {
    throw new RangeError("Ajusta el inicio, fin, fades y nota raíz a una región válida");
  }
  return { startFrame, endFrame, fadeInFrames, fadeOutFrames,
    rootMidi: draft.rootMidi, cents: draft.cents, reverse: draft.reverse,
    loopMode: draft.loopMode, playMode: draft.playMode };
}

function download(bytes: Uint8Array | string | Blob, filename: string, mime: string): void {
  const body = bytes instanceof Blob ? bytes : typeof bytes === "string" ? bytes : Uint8Array.from(bytes).buffer;
  const url = URL.createObjectURL(bytes instanceof Blob ? bytes : new Blob([body], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function shouldIgnoreComputerKey(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) ||
    target.closest(".piano-roll") !== null);
}

const TR808_CORE_PIECES = [
    { name: "Kick", note: 36, color: "#f87171", sourceNote: 36 },
    { name: "Snare", note: 38, color: "#fb923c", sourceNote: 38 },
    { name: "Hi-hat cerrado", note: 42, color: "#facc15", sourceNote: 42, chokeGroup: "hat" },
    { name: "Hi-hat abierto", note: 46, color: "#a3e635", sourceNote: 46, chokeGroup: "hat" },
    { name: "Cowbell", note: 56, color: "#34d399", sourceNote: 56 },
    { name: "Clap", note: 39, color: "#60a5fa", sourceNote: 39 },
    { name: "Rim", note: 35, color: "#818cf8", sourceNote: 37 },
    { name: "Clave", note: 37, color: "#a78bfa", sourceNote: 75 },
    { name: "Maracas", note: 40, color: "#c084fc", sourceNote: 70 },
    { name: "Tom bajo", note: 41, color: "#e879f9", sourceNote: 45 },
    { name: "Tom medio", note: 43, color: "#f472b6", sourceNote: 47 },
    { name: "Tom alto", note: 45, color: "#fb7185", sourceNote: 50 },
    { name: "Conga baja", note: 47, color: "#2dd4bf", sourceNote: 64 },
    { name: "Conga media", note: 49, color: "#22d3ee", sourceNote: 62 },
    { name: "Conga alta", note: 51, color: "#38bdf8", sourceNote: 63 },
    { name: "Cymbal", note: 53, color: "#94a3b8", sourceNote: 49 },
] as const;

function starterDrumPads(): ProjectDrumPad[] {
  return TR808_CORE_PIECES.map((slot, index) => ({
    id: crypto.randomUUID(), name: slot.name, color: slot.color, midiNote: slot.note,
    channel: 9, source: { kind: "instrument" as const,
      ref: PROJECT_808_INSTRUMENT, sourceNote: slot.sourceNote },
    gainDb: 0, pan: 0, pitchSemitones: 0, startFrame: 0, attackMs: 0,
    decayMs: 12, playMode: "oneShot" as const, mute: false, solo: false,
    ...(index === 2 || index === 3 ? { chokeGroup: "hat" } : {}),
    stepTicks: PROJECT_PPQ / 4, stepCount: 64,
  }));
}

function createStarterProject(name: string, bpm: number): ProjectDocumentV1 {
  const now = Date.now();
  const document = createProjectDocument({ name, at: now, microsPerQuarter: Math.round(60_000_000 / bpm) });
  const trackId = crypto.randomUUID();
  const patternId = crypto.randomUUID();
  const drumTrackId = crypto.randomUUID();
  const drumPatternId = crypto.randomUUID();
  const bassTrackId = crypto.randomUUID();
  const bassPatternId = crypto.randomUUID();
  const lengthTicks = PROJECT_PPQ * 16;
  return {
    ...document,
    trackOrder: [trackId, drumTrackId, bassTrackId],
    tracks: [{
      id: trackId, name: "Piano", kind: "instrument",
      instrument: PROJECT_PIANO_INSTRUMENT,
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] },
    }, {
      id: drumTrackId, name: "TR-808 grabada", kind: "drum",
      instrument: PROJECT_808_INSTRUMENT,
      drumRack: { pads: starterDrumPads() },
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] },
    }, {
      id: bassTrackId, name: "Bajo 808 grabado", kind: "instrument",
      instrument: PROJECT_808_INSTRUMENT,
      mix: { gainDb: -3, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] },
    }],
    patterns: [{ id: patternId, name: "Patrón de piano", version: 1, lengthTicks, notes: [], expression: [] },
      { id: drumPatternId, name: "Patrón TR-808", version: 1, lengthTicks, notes: [], expression: [] },
      { id: bassPatternId, name: "Patrón de bajo 808", version: 1, lengthTicks, notes: [], expression: [] }],
    clips: [{ id: crypto.randomUUID(), kind: "pattern", trackId, sourceId: patternId, sourceVersion: 1,
      startTick: 0, lengthTicks, sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut",
      transpose: 0, gainDb: 0, muted: false },
    { id: crypto.randomUUID(), kind: "pattern", trackId: drumTrackId, sourceId: drumPatternId, sourceVersion: 1,
      startTick: 0, lengthTicks, sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut",
      transpose: 0, gainDb: 0, muted: false },
    { id: crypto.randomUUID(), kind: "pattern", trackId: bassTrackId, sourceId: bassPatternId, sourceVersion: 1,
      startTick: 0, lengthTicks, sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut",
      transpose: 0, gainDb: 0, muted: false }],
  };
}

const CORE_DRUM_PADS: readonly DrumPadDefinition[] = [
  { id: "kick", label: "Kick", midiNote: 36, channel: 9, sourceStatus: "loading" },
  { id: "snare", label: "Snare", midiNote: 38, channel: 9, sourceStatus: "loading" },
  { id: "hat-closed", label: "Hi-hat cerrado", midiNote: 42, channel: 9, sourceStatus: "loading" },
  { id: "hat-open", label: "Hi-hat abierto", midiNote: 46, channel: 9, sourceStatus: "loading" },
  { id: "cowbell", label: "Cowbell", midiNote: 56, channel: 9, sourceStatus: "loading" },
];

const DRUM_SOURCE_OPTIONS: readonly DrumRackSourceOption[] = [
  ...TR808_CORE_PIECES.map((piece) => ({
    id: `tr808-${piece.sourceNote}`, label: `TR-808 real · ${piece.name} · Michael Fischer · CC0`,
    source: { kind: "instrument" as const, ref: PROJECT_808_INSTRUMENT,
      sourceNote: piece.sourceNote },
  })),
  ...([36, 38, 42, 46, 56] as const).map((note) => ({
    id: `virtuosity-${note}`, label: `Virtuosity Drums · MIDI ${note} · CC0`,
    source: { kind: "instrument" as const, ref: PROJECT_DRUM_INSTRUMENT, sourceNote: note },
  })),
  { id: "freepats-clap", label: "FreePats hand clap · MIDI 39 · CC0",
    source: { kind: "instrument", ref: PROJECT_CLAP_INSTRUMENT, sourceNote: 39 } },
];

export default function PianoApp() {
  const [storedScreen, setScreen] = useLocalStorageState<string>("piano_screen", "studio");
  const screen: Screen = storedScreen === "tracks" || storedScreen === "settings" ? storedScreen : "studio";
  const [rangeStart, setRangeStart] = useLocalStorageState("piano_range_start", 48);
  const [physicalBase, setPhysicalBase] = useLocalStorageState("piano_midi_physical_base", 48);
  const [transpose, setTranspose] = useLocalStorageState("piano_transpose", 0);
  const [storedVelocityCurve, setVelocityCurve] = useLocalStorageState<string>("piano_velocity_curve", "expressive");
  const velocityCurve: VelocityCurve = storedVelocityCurve === "logarithmic" ? "soft"
    : storedVelocityCurve === "exponential" ? "piano"
      : VELOCITY_CURVES.includes(storedVelocityCurve as VelocityCurve)
        ? storedVelocityCurve as VelocityCurve : "expressive";
  const [calibrationBank, setCalibrationBank] = useLocalStorageState<VelocityCalibrationBank>(
    VELOCITY_CALIBRATIONS_STORAGE_KEY, DEFAULT_VELOCITY_CALIBRATION_BANK,
  );
  const [calibratedPortId, setCalibratedPortId] = useLocalStorageState("piano_physical_base_calibrated_port", "");
  const [mouseVelocity, setMouseVelocity] = useLocalStorageState("piano_mouse_velocity", 0.75);
  const [pitchBendRange, setPitchBendRange] = useLocalStorageState("piano_pitch_bend_range", 2);
  const [storedNoteNames, setShowNoteNames] = useLocalStorageState<string>("piano_show_note_names", "name");
  const showNoteNames: "none" | "name" = storedNoteNames === "none" ? "none" : "name";
  const [masterVolume, setMasterVolume] = useLocalStorageState("piano_master_volume", -10);
  const [releaseSeconds, setReleaseSeconds] = useLocalStorageState("piano_sustain_time", 1.2);
  const [reverbDecay, setReverbDecay] = useLocalStorageState("piano_reverb_decay", 1.4);
  const [chorusWet, setChorusWet] = useLocalStorageState("piano_chorus_depth", 0);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [bpm, setBpm] = useLocalStorageState("piano_studio_bpm", 120);
  const [storedInputId, setSelectedInputId] = useLocalStorageState("piano_selected_midi_input_id", AUTO_MIDI_INPUT_ID);
  // The old app stored __all__ as a default. Only an explicit new choice enables all ports.
  const selectedInputId = storedInputId === ALL_MIDI_INPUTS_ID &&
    localStorage.getItem("piano_midi_explicit_all") !== "true" ? AUTO_MIDI_INPUT_ID : storedInputId;
  const [profileOverride, setProfileOverride] = useLocalStorageState<"auto" | MidiProfileId>(
    "piano_midi_profile_override", "auto",
  );
  const [midiInputs, setMidiInputs] = useState<InputInfo[]>([]);
  const [attachedInputIds, setAttachedInputIds] = useState<string[]>([]);
  const [midiStatus, setMidiStatus] = useState("Buscando MIDI…");
  const [midiError, setMidiError] = useState("");
  const [audioStatus, setAudioStatus] = useState("Audio listo al tocar");
  const [storedInstrumentId, setStoredInstrumentId] = useLocalStorageState<string>(
    "piano_live_instrument_id", DEFAULT_INSTRUMENT_ID,
  );
  const [activeInstrumentId, setActiveInstrumentId] = useState(DEFAULT_INSTRUMENT_ID);
  const [loadingInstrumentId, setLoadingInstrumentId] = useState<string | null>(null);
  const [instrumentLoadingProgress, setInstrumentLoadingProgress] = useState<{
    loaded: number; total: number; decodedPcmBytes: number;
  } | null>(null);
  const [failedInstrumentId, setFailedInstrumentId] = useState<string | null>(null);
  const [instrumentError, setInstrumentError] = useState("");
  const [instrumentNotice, setInstrumentNotice] = useState("");
  const [observations, setObservations] = useState<MidiObservation[]>([]);
  const [bindings, setBindings] = useState<MidiBinding[]>([]);
  const [learnAction, setLearnAction] = useState<string | null>(null);
  const [bank, setBank] = useState(1);
  const [recording, setRecording] = useState(false);
  const [captureOverlay, setCaptureOverlay] = useState<readonly ProjectNote[] | undefined>();
  const [recordingOverlayTarget, setRecordingOverlayTarget] = useState<RecordingOverlayTarget | null>(null);
  const [savedOverdubTarget, setSavedOverdubTarget] = useState<SavedOverdubTarget | null>(null);
  const [recordedEvents, setRecordedEvents] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);
  const [unsavedRecording, setUnsavedRecording] = useState(false);
  const [savingRecording, setSavingRecording] = useState(false);
  const [takes, setTakes] = useState<RecordedTakeSummary[]>([]);
  const [takesLoading, setTakesLoading] = useState(true);
  const [takesError, setTakesError] = useState("");
  const [projectRepository] = useState(() => new ProjectRepository());
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [projectView, setProjectView] = useState<ProjectSessionSnapshot | null>(null);
  const [projectAssetStatuses, setProjectAssetStatuses] = useState<readonly ProjectAssetStatus[]>([]);
  const [projectAssetBusyId, setProjectAssetBusyId] = useState<string | null>(null);
  const [projectAssetNotice, setProjectAssetNotice] = useState("");
  const [projectSwitching, setProjectSwitching] = useState(false);
  const [workspace, setWorkspace] = useState<"performance" | "piano-roll" | "drums" | "arrangement" | "sampler" | "audio" | "mixer" | "automation" | "export">("performance");
  const [referenceStudioOpen, setReferenceStudioOpen] = useState(true);
  const [studioLoopEnabled, setStudioLoopEnabled] = useState(false);
  const [studioLoopStartBar, setStudioLoopStartBar] = useState(5);
  const [studioLoopEndBar, setStudioLoopEndBar] = useState(12);
  const [studioPendingSeek, setStudioPendingSeek] = useState<number | null>(null);
  const [editorPatternId, setEditorPatternId] = useState<string | null>(null);
  const [editorTrackId, setEditorTrackId] = useState<string | null>(null);
  const [studioSelectedTrackId, setStudioSelectedTrackId] = useState<string | null>(null);
  const [projectAudioPreparing, setProjectAudioPreparing] = useState(false);
  const [preparedProjectDocument, setPreparedProjectDocument] = useState<ProjectDocumentV1 | null>(null);
  const [projectAudioStatus, setProjectAudioStatus] = useState("");
  const [takeImportNotice, setTakeImportNotice] = useState("");
  const [midiExportNotice, setMidiExportNotice] = useState("");
  const [exportingMidi, setExportingMidi] = useState(false);
  const [exportingWav, setExportingWav] = useState(false);
  const [wavExportProgress, setWavExportProgress] = useState<ProjectWavProgress | null>(null);
  const [wavExportNotice, setWavExportNotice] = useState("");
  const [sampleDraft, setSampleDraft] = useState<{ fileName: string; analysis: AnalyzedUserSample } | null>(null);
  const [sampleRegionDraft, setSampleRegionDraft] = useState<SampleRegionDraft | null>(null);
  const [editingSampleTrackId, setEditingSampleTrackId] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleNotice, setSampleNotice] = useState("");
  const [audioInputSnapshot, setAudioInputSnapshot] = useState<AudioInputSnapshot | null>(null);
  const [audioCaptureBusy, setAudioCaptureBusy] = useState(false);
  const [audioCaptureNotice, setAudioCaptureNotice] = useState("");
  const [pendingAudioTake, setPendingAudioTake] = useState(false);
  const [busResampleBusy, setBusResampleBusy] = useState(false);
  const [busResampleProgress, setBusResampleProgress] = useState<RenderProgress | null>(null);
  const [busResampleNotice, setBusResampleNotice] = useState("");
  const [storageHealth, setStorageHealth] = useState<ProjectStorageHealth | null>(null);
  const [storageNotice, setStorageNotice] = useState("");
  const [projectTransport, setProjectTransport] = useState<"stopped" | "playing" | "paused" | "suspended" | "blocked">("stopped");
  const [projectTick, setProjectTick] = useState(0);
  const [projectLauncher, setProjectLauncher] = useState<ProjectLauncherSnapshot | null>(null);
  const [projectBpmDraft, setProjectBpmDraft] = useState<string | null>(null);
  const [drumPads, setDrumPads] = useState<readonly DrumPadDefinition[]>(CORE_DRUM_PADS);
  const [captureRunning, setCaptureRunning] = useState(false);
  const [captureAvailable, setCaptureAvailable] = useState(false);
  const [calibrateNextKey, setCalibrateNextKey] = useState(false);
  const [pedals, setPedals] = useState({ sustain: false, sostenuto: false, unaCorda: false });
  const [halfPedal, setHalfPedal] = useState(0);

  const [engine] = useState(() => {
    let shown = "";
    let lastProgress = "";
    let lastProgressAt = 0;
    return new LiveStudioEngine({
      onDiagnostics: (diagnostics) => {
        const next = diagnostics.error ??
          (diagnostics.phase === "loading-core" ? "Cargando muestras del piano…" :
            diagnostics.phase === "ready" || diagnostics.phase === "partial" ? "Audio activo" : "");
        if (next && next !== shown) {
          shown = next;
          setAudioStatus(next);
        }
        const progress = diagnostics.instrument.loadingProgress;
        const progressKey = progress
          ? `${progress.loaded}/${progress.total}/${progress.decodedPcmBytes}` : "";
        if (progressKey !== lastProgress && (!progress || progress.loaded === progress.total
          || performance.now() - lastProgressAt >= 80)) {
          lastProgress = progressKey;
          lastProgressAt = performance.now();
          setInstrumentLoadingProgress(progress);
        }
      },
    });
  });
  const [monitor] = useState(() => new MidiMonitor(256));
  const [trace] = useState(() => new MidiPhysicalTrace());
  const [recorder] = useState(() => new MidiRecorder());
  const [library] = useState(() => new RecordingLibrary());
  const projectSessionRef = useRef<ProjectSession | null>(null);
  const projectUnsubscribeRef = useRef<(() => void) | null>(null);
  const projectSwitchingRef = useRef(false);
  const preparedProjectRef = useRef<ProjectDocumentV1 | null>(null);
  const projectAudioRequestRef = useRef(0);
  const wavExportAbortRef = useRef<AbortController | null>(null);
  const busResampleAbortRef = useRef<AbortController | null>(null);
  const audioInputRef = useRef<AudioInputSession | null>(null);
  const audioCaptureScheduleRef = useRef<ProjectRecordingSchedule | null>(null);
  const audioCaptureTargetRef = useRef<{ session: ProjectSession } | null>(null);
  const pendingAudioTakeRef = useRef<AudioCaptureTake | null>(null);
  const audioCaptureSaveRef = useRef<Promise<void> | null>(null);
  const audioCaptureEpochRef = useRef(0);
  const projectPreviewTimersRef = useRef(new Map<string, number>());
  const refreshProjectLauncher = useCallback(() => {
    const next = engine.projectLauncherSnapshot();
    setProjectLauncher((previous) => sameLauncher(previous, next) ? previous : next);
  }, [engine]);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const activeNotesRef = useRef(new Map<string, HeldNote[]>());
  const computerHeldRef = useRef(new Map<string, number>());
  const mouseHeldRef = useRef(new Set<number>());
  const activeVelocityRef = useRef(new Map<number, number>());
  const consumedNotesRef = useRef(new Map<string, number>());
  const pedalSourcesRef = useRef(new Map<string, boolean>());
  const lastTriggerRef = useRef(new Map<string, number>());
  const calibrationBankRef = useRef(calibrationBank);
  const calibrationTimerRef = useRef<number | null>(null);
  const traceTimerRef = useRef<number | null>(null);
  const telemetryTimerRef = useRef<number | null>(null);
  const instrumentRequestRef = useRef(0);
  const initialInstrumentRestoredRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const recordingTargetRef = useRef<RecordingOverlayTarget | null>(null);
  const latestRecordingRef = useRef<Uint8Array | null>(null);
  const unsavedRecordingRef = useRef<{
    snapshot: MidiRecorderSnapshot;
    bytes: Uint8Array;
    options: SaveRecordingOptions & { id: string };
    target: RecordingOverlayTarget | null;
  } | null>(null);
  const latestRef = useRef({ rangeStart, physicalBase, transpose, velocityCurve, mouseVelocity,
    pitchBendRange, selectedInputId, profileOverride, midiInputs, bindings, learnAction, bank,
    masterVolume, releaseSeconds, reverbDecay, chorusWet, bpm, metronomeOn, recording,
    calibrateNextKey, calibratedPortId, screen });
  useLayoutEffect(() => {
    latestRef.current = { rangeStart, physicalBase, transpose, velocityCurve, mouseVelocity,
      pitchBendRange, selectedInputId, profileOverride, midiInputs, bindings, learnAction, bank,
      masterVolume, releaseSeconds, reverbDecay, chorusWet, bpm, metronomeOn, recording,
      calibrateNextKey, calibratedPortId, screen };
  });

  const selectedInput = midiInputs.find((input) => input.id === selectedInputId);
  const listeningInputs = midiInputs.filter((input) => attachedInputIds.includes(input.id));
  const midiListening = listeningInputs.length > 0;
  const liveMidiStatus = midiListening
    ? listeningInputs.length === 1 ? `${listeningInputs[0]!.name} en escucha`
      : `${listeningInputs.length} entradas MIDI en escucha`
    : midiInputs.length === 0 ? midiStatus
      : selectedInputId === AUTO_MIDI_INPUT_ID ? "Selecciona una entrada MIDI"
        : selectedInputId !== ALL_MIDI_INPUTS_ID && !selectedInput ? "Entrada MIDI desconectada"
          : "Entrada MIDI sin escucha activa";
  const profileId: MidiProfileId = profileOverride === "auto"
    ? identifyProfile(selectedInput ?? {}) : profileOverride;
  const calibrationScope: VelocityCalibrationScope | null = selectedInput
    ? { profileId, inputId: selectedInput.id, inputName: selectedInput.name } : null;
  const calibration = calibrationScope
    ? getPortVelocityCalibration(calibrationBank, calibrationScope) : DEFAULT_PHYSICAL_CALIBRATION;
  const bindingScope = useMemo(() => ({ profileId, portKey: selectedInputId }), [profileId, selectedInputId]);
  const visibleNotes = useMemo(() => Array.from({ length: KEY_COUNT }, (_, i) => rangeStart + i), [rangeStart]);

  const chooseInstrument = useCallback(async (id: string) => {
    const definition = getInstrument(id);
    if (!definition) {
      setInstrumentError("Ese instrumento no está disponible en el catálogo actual.");
      setFailedInstrumentId(null);
      return;
    }
    const request = ++instrumentRequestRef.current;
    setLoadingInstrumentId(id);
    setInstrumentLoadingProgress(null);
    setFailedInstrumentId(null);
    setInstrumentError("");
    setInstrumentNotice("");
    try {
      const loaded = await engine.selectInstrument(id);
      if (request !== instrumentRequestRef.current) return;
      setLoadingInstrumentId(null);
      setInstrumentLoadingProgress(null);
      if (!loaded || engine.currentInstrumentId !== id) {
        const current = getInstrument(engine.currentInstrumentId) ?? getInstrument(DEFAULT_INSTRUMENT_ID)!;
        const detail = engine.diagnostics().instrument.error;
        setFailedInstrumentId(id);
        setInstrumentError(`No se pudo activar ${definition.label}. Sigue sonando ${current.label}.${detail ? ` ${detail}` : ""}`);
        return;
      }
      setActiveInstrumentId(id);
      setStoredInstrumentId(id);
      const currentStart = latestRef.current.rangeStart;
      const minimumStart = Math.max(MIN_MIDI, definition.suggestedRange.minMidi);
      const maximumStart = Math.min(MAX_MIDI - KEY_COUNT + 1,
        definition.suggestedRange.maxMidi - KEY_COUNT + 1);
      if (minimumStart <= maximumStart) {
        const suggestedStart = clamp(currentStart, minimumStart, maximumStart);
        if (suggestedStart !== currentStart) {
          latestRef.current.rangeStart = suggestedStart;
          setRangeStart(suggestedStart);
          engine.setVisibleRangeStart(suggestedStart);
          setInstrumentNotice(`Rango ajustado para ${definition.label}: ${midiToLabel(suggestedStart)}–${midiToLabel(suggestedStart + KEY_COUNT - 1)}.`);
          return;
        }
      }
      setInstrumentNotice(`${definition.label} listo para tocar.`);
    } catch (error) {
      if (request !== instrumentRequestRef.current) return;
      setLoadingInstrumentId(null);
      setInstrumentLoadingProgress(null);
      setFailedInstrumentId(id);
      const current = getInstrument(engine.currentInstrumentId) ?? getInstrument(DEFAULT_INSTRUMENT_ID)!;
      setInstrumentError(`No se pudo activar ${definition.label}. Sigue sonando ${current.label}. ${error instanceof Error ? error.message : "Reintenta la carga."}`);
    }
  }, [engine, setRangeStart, setStoredInstrumentId]);

  const cancelInstrumentLoad = useCallback(() => {
    if (!loadingInstrumentId) return;
    ++instrumentRequestRef.current;
    const active = getInstrument(engine.currentInstrumentId) ?? getInstrument(DEFAULT_INSTRUMENT_ID)!;
    void engine.selectInstrument(active.id);
    setLoadingInstrumentId(null);
    setInstrumentLoadingProgress(null);
    setFailedInstrumentId(null);
    setInstrumentError("");
    setInstrumentNotice(`Carga cancelada. Sigue sonando ${active.label}.`);
  }, [engine, loadingInstrumentId]);

  useEffect(() => {
    if (initialInstrumentRestoredRef.current) return;
    initialInstrumentRestoredRef.current = true;
    if (!getInstrument(storedInstrumentId)) {
      queueMicrotask(() => {
        setStoredInstrumentId(DEFAULT_INSTRUMENT_ID);
        setInstrumentNotice("El sonido guardado ya no está disponible; sigue activo el piano Salamander.");
      });
      return;
    }
    if (storedInstrumentId === "salamander-layered") {
      queueMicrotask(() => setInstrumentNotice(
        "El Salamander de cuatro capas está disponible en Cambiar instrumento. Se carga sólo al seleccionarlo para mantener el inicio ágil.",
      ));
      return;
    }
    if (storedInstrumentId !== DEFAULT_INSTRUMENT_ID) {
      queueMicrotask(() => { void chooseInstrument(storedInstrumentId); });
    }
  }, [chooseInstrument, setStoredInstrumentId, storedInstrumentId]);

  useEffect(() => { engine.setVisibleRangeStart(rangeStart); }, [engine, rangeStart]);

  const refreshTakes = useCallback(async () => {
    setTakesLoading(true);
    try {
      setTakes(await library.list());
      setTakesError("");
    } catch (error) {
      setTakesError(error instanceof Error ? error.message : "No se pudieron leer las tomas");
    } finally {
      setTakesLoading(false);
    }
  }, [library]);

  useEffect(() => {
    engine.preloadCore();
    queueMicrotask(() => { void refreshTakes(); });
    return () => {
      engine.dispose();
      void library.close();
    };
  }, [engine, library, refreshTakes]);

  useEffect(() => {
    if (storedScreen !== screen) queueMicrotask(() => setScreen(screen));
  }, [storedScreen, screen, setScreen]);
  useEffect(() => {
    if (storedVelocityCurve !== velocityCurve) queueMicrotask(() => setVelocityCurve(velocityCurve));
  }, [storedVelocityCurve, velocityCurve, setVelocityCurve]);
  useEffect(() => {
    if (storedNoteNames !== showNoteNames) queueMicrotask(() => setShowNoteNames(showNoteNames));
  }, [storedNoteNames, showNoteNames, setShowNoteNames]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const loaded = loadMidiBindings(localStorage, bindingScope).filter((binding) =>
          ACTIVE_MIDI_ACTIONS.has(binding.action));
        setBindings(loaded);
        setLearnAction(null);
      } catch { setBindings([]); }
    });
  }, [bindingScope]);

  useEffect(() => { engine.setMasterVolumeDb(masterVolume); }, [engine, masterVolume]);
  useEffect(() => { engine.setReleaseSeconds(releaseSeconds); }, [engine, releaseSeconds]);
  useEffect(() => { engine.setPitchBendRange(pitchBendRange); }, [engine, pitchBendRange]);
  useEffect(() => { engine.setReverbDecay(reverbDecay); }, [engine, reverbDecay]);
  useEffect(() => { engine.setChorusWet(chorusWet); }, [engine, chorusWet]);
  useEffect(() => { calibrationBankRef.current = calibrationBank; }, [calibrationBank]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setRecordedEvents(recorder.eventCount);
      const target = recordingOverlayTarget;
      const project = projectSessionRef.current?.getSnapshot().document;
      const rollable = project?.tracks.filter((track) => track.kind === "instrument" || track.kind === "drum") ?? [];
      const activeTrack = rollable.find((track) => track.id === editorTrackId) ?? rollable[0];
      if (workspace === "piano-roll" && target && project?.id === target.projectId &&
          activeTrack?.id === target.trackId) {
        setCaptureOverlay(createCaptureOverlay(recorder.snapshot(), {
          startPerfMs: target.startPerfMs, startTick: target.startTick,
          nowPerfMs: performance.now(), tempoMap: target.tempoMap, meterMap: target.meterMap,
        }));
      } else setCaptureOverlay(undefined);
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording, recorder, workspace, recordingOverlayTarget, editorTrackId]);

  const saveUnsavedRecording = useCallback(async () => {
    const pending = unsavedRecordingRef.current;
    if (!pending) return;
    setSavingRecording(true);
    try {
      // A failed response can follow a committed transaction. Reusing the
      // same ID and checking its bytes prevents a retry from adding a copy.
      const existing = await library.getBytes(pending.options.id);
      if (existing) {
        if (existing.length !== pending.bytes.length ||
          existing.some((byte, index) => byte !== pending.bytes[index])) {
          throw new Error("Ya existe otra toma con este identificador; exporta la toma en memoria.");
        }
      } else {
        await library.save(pending.snapshot, pending.bytes, pending.options);
      }
      unsavedRecordingRef.current = null;
      setUnsavedRecording(false);
      setSavedOverdubTarget(pending.target ? {
        recordingId: pending.options.id, projectId: pending.target.projectId,
        trackId: pending.target.trackId, startTick: pending.target.startTick,
      } : null);
      setMidiError("");
      await refreshTakes();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No se pudo guardar la toma MIDI";
      setMidiError(`${detail} La toma sigue en memoria: reintenta o exporta el .mid antes de cerrar esta pestaña.`);
    } finally {
      setSavingRecording(false);
    }
  }, [library, refreshTakes]);

  const startRecording = useCallback(() => {
    if (recorder.isRecording) return;
    if (unsavedRecordingRef.current) {
      setMidiError("La toma anterior sigue sin guardar. Reintenta el guardado o expórtala y descarta la copia en memoria antes de empezar otra.");
      return;
    }
    const now = performance.now();
    const project = projectSessionRef.current?.getSnapshot().document;
    const rollable = project?.tracks.filter((track) => track.kind === "instrument" || track.kind === "drum") ?? [];
    const targetTrack = rollable.find((track) => track.id === editorTrackId) ?? rollable[0];
    const position = engine.projectPlaybackSnapshot()?.transport;
    const startTick = position?.state === "playing" || position?.state === "paused" ? position.tick : 0;
    const clock = project ? new MusicalClock(project.tempoMap, project.meterMap) : null;
    const initialMicros = clock?.tempoAt(startTick).microsPerQuarter;
    const initialMeter = clock?.meterAt(startTick);
    const captureBpm = clamp(initialMicros ? 60_000_000 / initialMicros
      : latestRef.current.bpm, 10, 1000);
    const captureMicros = Math.round(60_000_000 / captureBpm);
    recorder.start({ timeStamp: now, tempo: captureBpm,
    ...(initialMeter ? { timeSignature: [initialMeter.numerator, initialMeter.denominator] as const } : {}) });
    recordingStartedAtRef.current = now;
    const overlayTarget: RecordingOverlayTarget | null = project && targetTrack ? {
      projectId: project.id, trackId: targetTrack.id, startPerfMs: now,
      startTick,
      // The legacy live-take SMF uses its starting BPM. Keep the visual overlay
      // on that same clock until project overdub owns a tempo-aware take.
      tempoMap: [{ tick: 0, microsPerQuarter: captureMicros }],
      meterMap: [{ tick: 0, numerator: initialMeter?.numerator ?? 4,
        denominator: initialMeter?.denominator ?? 4 }],
    } : null;
    recordingTargetRef.current = overlayTarget;
    setRecordingOverlayTarget(overlayTarget);
    if (project) setProjectAudioStatus("Toma MIDI en curso: el piano roll muestra una vista temporal; la toma se guarda en Pistas y se añade al proyecto al importarla.");
    setCaptureOverlay([]);
    latestRecordingRef.current = null;
    setRecordedEvents(0);
    setHasRecording(false);
    setRecording(true);
    latestRef.current.recording = true;
    setMidiError("");
  }, [recorder, engine, editorTrackId]);

  const stopRecording = useCallback(async () => {
    if (!recorder.isRecording) return;
    const now = performance.now();
    const snapshot = recorder.stop(now);
    const target = recordingTargetRef.current;
    recordingTargetRef.current = null;
    setRecordingOverlayTarget(null);
    setCaptureOverlay(undefined);
    setRecording(false);
    latestRef.current.recording = false;
    setRecordedEvents(snapshot.events.length);
    if (snapshot.events.length === 0) {
      setMidiError("La toma no contiene eventos MIDI.");
      return;
    }
    if (snapshot.overflowed) {
      setMidiError("La toma superó la capacidad de grabación; no se guardó incompleta.");
      return;
    }
    try {
      const bytes = recorder.toMidiBytes();
      latestRecordingRef.current = bytes;
      setHasRecording(true);
      const names = Object.fromEntries(latestRef.current.midiInputs.map((input) => [input.id, input.name]));
      unsavedRecordingRef.current = {
        snapshot, bytes,
        options: { id: crypto.randomUUID(), durationMs: now - recordingStartedAtRef.current, inputNames: names },
        target,
      };
      setUnsavedRecording(true);
      await saveUnsavedRecording();
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : "No se pudo guardar la toma MIDI");
    }
  }, [recorder, saveUnsavedRecording]);

  const discardUnsavedRecording = () => {
    if (!unsavedRecordingRef.current || savingRecording) return;
    if (!window.confirm("Esta toma MIDI no se guardó. ¿Descartar la copia que sigue en memoria? Esta acción no se puede deshacer.")) return;
    unsavedRecordingRef.current = null;
    latestRecordingRef.current = null;
    setUnsavedRecording(false);
    setHasRecording(false);
    setRecordedEvents(0);
    setMidiError("");
  };

  const applyBinding = useCallback((binding: MidiBinding, event: MidiEvent): boolean => {
    const value = bindingValue(event, binding.valueMode);
    const isTrigger = ["recording.toggle", "metronome.toggle", "bank.prev", "bank.next", "drum.pad"].includes(binding.action);
    const relative = binding.valueMode === "relative-twos-complement" || binding.valueMode === "relative-binary-offset";
    if (isTrigger && (relative ? value === 0 : value <= 0 || (event.kind === "cc" && event.value < 64))) return false;
    if (isTrigger) {
      const previous = lastTriggerRef.current.get(binding.id) ?? -Infinity;
      if (event.timeStamp - previous < 120) return false;
      lastTriggerRef.current.set(binding.id, event.timeStamp);
    }
    const now = latestRef.current;
    switch (binding.action) {
      case "recording.toggle": if (recorder.isRecording) void stopRecording(); else startRecording(); break;
      case "metronome.toggle": {
        const next = !now.metronomeOn;
        now.metronomeOn = next;
        setMetronomeOn(next);
        void engine.setMetronome({ enabled: next, bpm: now.bpm });
        break;
      }
      case "bank.prev": now.bank = Math.max(1, now.bank - 1); setBank(now.bank); break;
      case "bank.next": now.bank = Math.min(2, now.bank + 1); setBank(now.bank); break;
      case "volume.master": {
        const next = -40 + 40 * level(value, binding.valueMode, (now.masterVolume + 40) / 40);
        now.masterVolume = next;
        engine.setMasterVolumeDb(next);
        setMasterVolume(next);
        break;
      }
      case "effect.reverbDecay": {
        const next = 0.5 + 3.5 * level(value, binding.valueMode, (now.reverbDecay - 0.5) / 3.5);
        now.reverbDecay = next;
        engine.setReverbDecay(next);
        setReverbDecay(next);
        break;
      }
      case "effect.chorusDepth": {
        const next = level(value, binding.valueMode, now.chorusWet);
        now.chorusWet = next;
        engine.setChorusWet(next);
        setChorusWet(next);
        break;
      }
      case "piano.release": {
        const next = 0.1 + 3.9 * level(value, binding.valueMode, (now.releaseSeconds - 0.1) / 3.9);
        now.releaseSeconds = next;
        engine.setReleaseSeconds(next);
        setReleaseSeconds(next);
        break;
      }
      case "piano.transpose": {
        const next = Math.round(-12 + 24 * level(value, binding.valueMode, (now.transpose + 12) / 24));
        now.transpose = next;
        setTranspose(next);
        break;
      }
      case "piano.modulation": {
        if ("channel" in event) {
          const mod = Math.round(127 * level(value, binding.valueMode, 0));
          engine.applyMidiExpression(parseMidiMessage(Uint8Array.from([0xb0 | event.channel, 1, mod]), event.inputId, event.timeStamp));
        }
        break;
      }
      case "drum.pad": {
        if (event.kind === "noteOn") {
          void engine.triggerDrum(event.note, event.velocity, event.timeStamp);
          recorder.record(event, { playedChannel: 9 });
        }
        break;
      }
      default: return false;
    }
    return true;
  }, [engine, recorder, startRecording, stopRecording,
    setMetronomeOn, setMasterVolume, setReverbDecay, setChorusWet, setReleaseSeconds, setTranspose]);

  const handleMidi = useCallback((data: Uint8Array, input: MIDIInput, timestamp: number, diagnosticOnly = false) => {
    const event = parseMidiMessage(data, input.id, timestamp);
    const sequence = trace.recordMessage(event, { handlerTimeMs: performance.now(),
      selectedInputId: latestRef.current.selectedInputId, inputName: input.name,
      inputState: input.state, inputConnection: input.connection });
    if (diagnosticOnly) {
      trace.recordRoute(sequence, "diagnostic-only-port", performance.now());
      return;
    }
    monitor.observe(event);
    if (latestRef.current.screen === "settings" && telemetryTimerRef.current === null) {
      telemetryTimerRef.current = window.setTimeout(() => {
        telemetryTimerRef.current = null;
        setObservations(monitor.snapshot());
      }, 100);
    }
    if (event.kind === "unknown" || event.kind === "sysex") return;
    const key = "channel" in event && "note" in event
      ? `${event.inputId}:${event.channel}:${event.note}` : "";
    if (event.kind === "noteOff" && (consumedNotesRef.current.get(key) ?? 0) > 0) {
      const left = consumedNotesRef.current.get(key)! - 1;
      if (left) consumedNotesRef.current.set(key, left);
      else consumedNotesRef.current.delete(key);
      return;
    }
    const pending = latestRef.current.learnAction;
    if (pending && !["noteOff", "clock", "activeSensing", "systemReset"].includes(event.kind)) {
      const bankScoped = !["bank.prev", "bank.next", "recording.toggle", "metronome.toggle"].includes(pending);
      const learned = learnMidiBinding(event, { id: `${pending}:${Date.now()}`,
        action: pending, bank: bankScoped ? String(latestRef.current.bank) : undefined,
        consumeNote: event.kind === "noteOn" });
      if (learned) {
        const proposed = upsertMidiBinding(latestRef.current.bindings, learned, "reject");
        if (proposed.conflicts.length) setMidiError(`El mensaje ya está asignado a ${proposed.conflicts[0]!.first.action}.`);
        else {
          const current = latestRef.current;
          const selected = current.midiInputs.find((candidate) => candidate.id === current.selectedInputId);
          saveMidiBindings(localStorage, { profileId: current.profileOverride === "auto"
            ? identifyProfile(selected ?? {}) : current.profileOverride,
            portKey: latestRef.current.selectedInputId }, proposed.bindings);
          latestRef.current.bindings = proposed.bindings;
          setBindings(proposed.bindings);
          latestRef.current.learnAction = null;
          setLearnAction(null);
        }
        if (event.kind === "noteOn") consumedNotesRef.current.set(key, (consumedNotesRef.current.get(key) ?? 0) + 1);
        return;
      }
    }
    let consumed = false;
    for (const binding of resolveBindings(event, latestRef.current.bindings, { bank: String(latestRef.current.bank) })) {
      const applied = applyBinding(binding, event);
      if (!applied) continue;
      if (binding.consumeNote && event.kind === "noteOn") {
        consumedNotesRef.current.set(key, (consumedNotesRef.current.get(key) ?? 0) + 1);
        consumed = true;
      }
      if (binding.action === "drum.pad") consumed = true;
    }
    if (consumed) return;
    if (event.kind !== "noteOn" && event.kind !== "noteOff") {
      recorder.record(event);
      if (event.kind === "pitchBend") pianoKeyboardStore.setPitchBend(Math.round(event.normalized * 100));
      engine.applyMidiExpression(event);
      if (event.kind === "cc" && [64, 66, 67].includes(event.controller)) {
        const pedal: Pedal = event.controller === 64 ? "sustain"
          : event.controller === 66 ? "sostenuto" : "unaCorda";
        pedalSourcesRef.current.set(`${event.inputId}:${event.channel}:${pedal}`, event.value >= 64);
        setPedals({
          sustain: [...pedalSourcesRef.current].some(([key, down]) => key.endsWith(":sustain") && down),
          sostenuto: [...pedalSourcesRef.current].some(([key, down]) => key.endsWith(":sostenuto") && down),
          unaCorda: [...pedalSourcesRef.current].some(([key, down]) => key.endsWith(":unaCorda") && down),
        });
      }
      if (event.kind === "cc" && (event.controller === 120 || event.controller === 123)) {
        pianoKeyboardStore.releaseSource(`${event.inputId}:${event.channel}`);
        for (const heldKey of activeNotesRef.current.keys()) {
          if (heldKey.startsWith(`${event.inputId}:${event.channel}:`)) activeNotesRef.current.delete(heldKey);
        }
      }
      return;
    }
    if (event.channel === 9) {
      recorder.record(event);
      if (event.kind === "noteOn") void engine.triggerDrum(event.note, event.velocity, event.timeStamp);
      return;
    }
    const noteKey = `${event.inputId}:${event.channel}:${event.note}`;
    const source = `${event.inputId}:${event.channel}`;
    if (event.kind === "noteOn") {
      const current = latestRef.current;
      const portProfile = current.profileOverride === "auto" ? identifyProfile(input) : current.profileOverride;
      const velocityScope: VelocityCalibrationScope = {
        profileId: portProfile, inputId: input.id, inputName: input.name,
      };
      if (current.calibrateNextKey) {
        current.physicalBase = event.note;
        current.calibratedPortId = input.id;
        current.calibrateNextKey = false;
        setPhysicalBase(event.note);
        setCalibratedPortId(input.id);
        setCalibrateNextKey(false);
      }
      const nextBank = recordPortVelocity(calibrationBankRef.current, velocityScope, event.velocity);
      if (nextBank !== calibrationBankRef.current) {
        calibrationBankRef.current = nextBank;
        if (calibrationTimerRef.current === null) calibrationTimerRef.current = window.setTimeout(() => {
          calibrationTimerRef.current = null;
          setCalibrationBank(calibrationBankRef.current);
        }, 400);
      }
      const display = clamp(mapPhysicalNote(event.note, {
        physicalBase: current.physicalBase, rangeStart: current.rangeStart, profileId: portProfile,
        identity: input, explicitlyCalibrated: current.calibratedPortId === input.id,
      }), MIN_MIDI, MAX_MIDI);
      const played = clamp(display + current.transpose, MIN_MIDI, MAX_MIDI);
      const expression = computeVelocityExpression(event.velocity, current.velocityCurve,
        getPortVelocityCalibration(calibrationBankRef.current, velocityScope));
      const amplitude = expression.gain;
      const stack = activeNotesRef.current.get(noteKey) ?? [];
      stack.push({ display, played });
      activeNotesRef.current.set(noteKey, stack);
      activeVelocityRef.current.set(display, amplitude);
      pianoKeyboardStore.setVelocity(event.velocity);
      pianoKeyboardStore.setPhysicalMidi(event.note);
      pianoKeyboardStore.noteOn(display, source);
      publishLiveStrike({ source: "midi", inputName: input.name ?? "Puerto MIDI", physicalNote: event.note,
        playedNote: played, rawVelocity: event.velocity, normalizedVelocity: expression.normalized,
        gain: amplitude, curveLabel: VELOCITY_CURVE_DESCRIPTORS[current.velocityCurve].label });
      recorder.record(event, { playedNote: played });
      void engine.noteOn({ inputId: event.inputId, channel: event.channel, originalNote: event.note,
        mappedMidi: played, rawVelocity: event.velocity, amplitude, eventTimestamp: event.timeStamp })
        .then((attackId) => trace.recordRoute(sequence, attackId === null ? "note-silent" : "note-attacked", performance.now(), { attackId: attackId ?? undefined }))
        .catch((error: unknown) => setAudioStatus(error instanceof Error ? error.message : "Error al activar audio"));
    } else {
      const stack = activeNotesRef.current.get(noteKey);
      const held = stack?.shift();
      if (stack?.length === 0) activeNotesRef.current.delete(noteKey);
      const portProfile = latestRef.current.profileOverride === "auto" ? identifyProfile(input) : latestRef.current.profileOverride;
      const fallbackDisplay = clamp(mapPhysicalNote(event.note, {
        physicalBase: latestRef.current.physicalBase, rangeStart: latestRef.current.rangeStart,
        profileId: portProfile, identity: input,
        explicitlyCalibrated: latestRef.current.calibratedPortId === input.id,
      }), MIN_MIDI, MAX_MIDI);
      const display = held?.display ?? fallbackDisplay;
      recorder.record(event, { playedNote: held?.played ?? display });
      if (held) pianoKeyboardStore.noteOff(display, source);
      activeVelocityRef.current.delete(display);
      const attackId = engine.noteOff({ inputId: event.inputId, channel: event.channel,
        originalNote: event.note, eventTimestamp: event.timeStamp });
      trace.recordRoute(sequence, attackId === null ? "note-off-without-voice" : "note-released", performance.now(), { attackId: attackId ?? undefined });
    }
  }, [applyBinding, engine, monitor, recorder, trace, setCalibrationBank, setPhysicalBase, setCalibratedPortId]);

  const handleMidiRef = useRef(handleMidi);
  useLayoutEffect(() => { handleMidiRef.current = handleMidi; });

  const refreshInputs = useCallback(() => {
    const access = midiAccessRef.current;
    if (!access) return;
    const inputs = Array.from(access.inputs.values()).filter((input) => input.state === "connected")
      .map((input) => ({ id: input.id, name: input.name ?? "Puerto MIDI", manufacturer: input.manufacturer, state: input.state }));
    setMidiInputs(inputs);
    setMidiStatus(inputs.length ? `${inputs.length} entrada${inputs.length === 1 ? "" : "s"} MIDI disponible${inputs.length === 1 ? "" : "s"}`
      : "Sin entradas MIDI conectadas");
    if (latestRef.current.selectedInputId === AUTO_MIDI_INPUT_ID) {
      const selection = selectMidiInput(inputs, { storedSelectionRaw: localStorage.getItem("piano_selected_midi_input_id"),
        explicitAllRaw: localStorage.getItem("piano_midi_explicit_all") });
      if (selection.selectedInputId !== AUTO_MIDI_INPUT_ID) setSelectedInputId(selection.selectedInputId);
    }
  }, [setSelectedInputId]);

  const requestMidi = useCallback(async () => {
    if (!("requestMIDIAccess" in navigator)) {
      setMidiStatus("Web MIDI no está disponible en este navegador");
      return;
    }
    setMidiStatus("Esperando permiso MIDI del navegador…");
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      access.onstatechange = (change) => {
        const port = change.port;
        if (port?.type === "input" && port.state === "disconnected") {
          engine.releaseOrigin(port.id);
          for (let channel = 0; channel < 16; channel++) {
            pianoKeyboardStore.releaseSource(`${port.id}:${channel}`);
          }
          for (const heldKey of activeNotesRef.current.keys()) {
            if (heldKey.startsWith(`${port.id}:`)) activeNotesRef.current.delete(heldKey);
          }
        }
        refreshInputs();
      };
      refreshInputs();
      setMidiError("");
    } catch {
      setMidiStatus("Acceso MIDI denegado");
      setMidiError("Concede permiso MIDI en el navegador y reintenta.");
    }
  }, [engine, refreshInputs]);

  useEffect(() => { queueMicrotask(() => { void requestMidi(); }); }, [requestMidi]);

  useEffect(() => {
    const access = midiAccessRef.current;
    if (!access) return;
    const attached: MIDIInput[] = [];
    const listening: string[] = [];
    let disposed = false;
    for (const input of access.inputs.values()) {
      if (input.state !== "connected") continue;
      const selected = selectedInputId === ALL_MIDI_INPUTS_ID || input.id === selectedInputId;
      if (!selected && !captureRunning) { input.onmidimessage = null; continue; }
      input.onmidimessage = (message) => {
        if (message.data) handleMidiRef.current(message.data, input, message.timeStamp, !selected);
      };
      attached.push(input);
      if (selected) listening.push(input.id);
    }
    queueMicrotask(() => { if (!disposed) setAttachedInputIds(listening); });
    return () => {
      disposed = true;
      for (const input of attached) input.onmidimessage = null;
    };
  }, [selectedInputId, midiInputs, captureRunning]);

  const setPedal = useCallback((pedal: Pedal, down: boolean, source = "ui") => {
    engine.setGlobalPedal(source, pedal, down);
    pedalSourcesRef.current.set(`${source}:${pedal}`, down);
    setPedals({
      sustain: [...pedalSourcesRef.current].some(([key, active]) => key.endsWith(":sustain") && active),
      sostenuto: [...pedalSourcesRef.current].some(([key, active]) => key.endsWith(":sostenuto") && active),
      unaCorda: [...pedalSourcesRef.current].some(([key, active]) => key.endsWith(":unaCorda") && active),
    });
  }, [engine]);

  const pressVirtual = useCallback((source: "mouse" | "keyboard", note: number, key: string) => {
    const inputId = source;
    const velocity = Math.round(clamp(latestRef.current.mouseVelocity, 0.05, 1) * 127);
    const expression = computeVelocityExpression(velocity, latestRef.current.velocityCurve, DEFAULT_CALIBRATION);
    const amplitude = expression.gain;
    const played = clamp(note + latestRef.current.transpose, MIN_MIDI, MAX_MIDI);
    pianoKeyboardStore.noteOn(note, `${source}:${key}`);
    pianoKeyboardStore.setVelocity(velocity);
    activeVelocityRef.current.set(note, amplitude);
    publishLiveStrike({ source, inputName: source === "keyboard" ? "Teclado PC" : "Pantalla",
      physicalNote: note, playedNote: played, rawVelocity: velocity,
      normalizedVelocity: expression.normalized, gain: amplitude,
      curveLabel: VELOCITY_CURVE_DESCRIPTORS[latestRef.current.velocityCurve].label });
    const event = parseMidiMessage(Uint8Array.from([0x90, note, velocity]), inputId, performance.now());
    recorder.record(event, { playedNote: played });
    void engine.noteOn({ inputId, channel: 0, originalNote: note,
      mappedMidi: played, rawVelocity: velocity, amplitude, eventTimestamp: performance.now() })
      .catch((error: unknown) => setAudioStatus(error instanceof Error ? error.message : "Error de audio"));
  }, [engine, recorder]);

  const releaseVirtual = useCallback((source: "mouse" | "keyboard", note: number, key: string) => {
    pianoKeyboardStore.noteOff(note, `${source}:${key}`);
    activeVelocityRef.current.delete(note);
    const event = parseMidiMessage(Uint8Array.from([0x80, note, 0]), source, performance.now());
    recorder.record(event, { playedNote: clamp(note + latestRef.current.transpose, MIN_MIDI, MAX_MIDI) });
    engine.noteOff({ inputId: source, channel: 0, originalNote: note, eventTimestamp: performance.now() });
  }, [engine, recorder]);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.repeat || latestRef.current.screen !== "studio" ||
          shouldIgnoreComputerKey(event.target) || event.altKey || event.metaKey) return;
      if (event.code === "Space" || event.code.startsWith("Shift") || event.code.startsWith("Control")) {
        const pedal: Pedal = event.code === "Space" ? "sustain"
          : event.code.startsWith("Shift") ? "sostenuto" : "unaCorda";
        event.preventDefault();
        setPedal(pedal, true, "keyboard");
        return;
      }
      const index = KEY_LAYOUT.indexOf(event.key.toLowerCase());
      if (index < 0 || computerHeldRef.current.has(event.code)) return;
      const note = clamp(latestRef.current.rangeStart + KEY_OFFSETS[index]!, MIN_MIDI, MAX_MIDI);
      event.preventDefault();
      computerHeldRef.current.set(event.code, note);
      pressVirtual("keyboard", note, event.code);
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code.startsWith("Shift") || event.code.startsWith("Control")) {
        const pedal: Pedal = event.code === "Space" ? "sustain"
          : event.code.startsWith("Shift") ? "sostenuto" : "unaCorda";
        setPedal(pedal, false, "keyboard");
        return;
      }
      const note = computerHeldRef.current.get(event.code);
      if (note === undefined) return;
      computerHeldRef.current.delete(event.code);
      releaseVirtual("keyboard", note, event.code);
    };
    const releaseInput = () => {
      for (const [key, note] of computerHeldRef.current) releaseVirtual("keyboard", note, key);
      computerHeldRef.current.clear();
      for (const note of mouseHeldRef.current) releaseVirtual("mouse", note, String(note));
      mouseHeldRef.current.clear();
      for (const pedal of ["sustain", "sostenuto", "unaCorda"] as const) setPedal(pedal, false, "keyboard");
    };
    const onVisibility = () => { if (document.hidden) releaseInput(); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", releaseInput);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", releaseInput);
      document.removeEventListener("visibilitychange", onVisibility);
      releaseInput();
    };
  }, [pressVirtual, releaseVirtual, setPedal]);

  useEffect(() => {
    const flushCalibration = () => {
      if (calibrationTimerRef.current === null) return;
      window.clearTimeout(calibrationTimerRef.current);
      calibrationTimerRef.current = null;
      try {
        localStorage.setItem(VELOCITY_CALIBRATIONS_STORAGE_KEY, JSON.stringify(calibrationBankRef.current));
      } catch { /* Storage can be unavailable; the live mapping still works. */ }
    };
    window.addEventListener("pagehide", flushCalibration);
    return () => {
      window.removeEventListener("pagehide", flushCalibration);
      flushCalibration();
      if (telemetryTimerRef.current !== null) window.clearTimeout(telemetryTimerRef.current);
      if (traceTimerRef.current !== null) window.clearTimeout(traceTimerRef.current);
      trace.stop(performance.now());
      if (recorder.isRecording) void stopRecording();
      if (midiAccessRef.current) {
        midiAccessRef.current.onstatechange = null;
        for (const input of midiAccessRef.current.inputs.values()) input.onmidimessage = null;
      }
      engine.releaseAll();
    };
  }, [engine, recorder, stopRecording, trace]);

  const startCapture = () => {
    const access = midiAccessRef.current;
    if (!access) { setMidiError("Conecta el controlador antes de capturar."); return; }
    trace.start({ nowMs: performance.now(), wallTimeIso: new Date().toISOString(),
      timeOriginMs: performance.timeOrigin, selectedInputId,
      ports: [...access.inputs.values(), ...access.outputs.values()].map((port) => ({
        id: port.id, name: port.name, manufacturer: port.manufacturer,
        type: port.type, state: port.state, connection: port.connection,
      })) });
    setCaptureAvailable(false);
    setCaptureRunning(true);
    traceTimerRef.current = window.setTimeout(() => {
      trace.stop(performance.now());
      setCaptureAvailable(trace.snapshot().records.length > 0);
      setCaptureRunning(false);
      traceTimerRef.current = null;
    }, 30_000);
  };

  const stopCapture = () => {
    if (traceTimerRef.current !== null) window.clearTimeout(traceTimerRef.current);
    traceTimerRef.current = null;
    trace.stop(performance.now());
    setCaptureAvailable(trace.snapshot().records.length > 0);
    setCaptureRunning(false);
  };

  const commitBindings = (next: MidiBinding[]) => {
    try {
      saveMidiBindings(localStorage, bindingScope, next);
      setBindings(next);
      latestRef.current.bindings = next;
      setMidiError("");
    } catch (error) { setMidiError(error instanceof Error ? error.message : "No se pudieron guardar las asignaciones"); }
  };

  const selectedChanged = (value: string) => {
    localStorage.setItem("piano_midi_explicit_all", value === ALL_MIDI_INPUTS_ID ? "true" : "false");
    setAttachedInputIds([]);
    setSelectedInputId(value);
    for (const input of midiAccessRef.current?.inputs.values() ?? []) {
      engine.releaseOrigin(input.id);
      for (let channel = 0; channel < 16; channel++) pianoKeyboardStore.releaseSource(`${input.id}:${channel}`);
    }
    activeNotesRef.current.clear();
  };

  const exportLatest = () => {
    if (!latestRecordingRef.current) return;
    download(latestRecordingRef.current, `toma-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.mid`, "audio/midi");
  };

  const exportTake = async (id: string) => {
    try {
      const bytes = await library.getBytes(id);
      if (!bytes) throw new Error("La toma ya no está disponible");
      const name = takes.find((take) => take.id === id)?.name ?? "toma";
      const safe = name.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
      download(bytes, `${safe || "toma"}.mid`, "audio/midi");
    } catch (error) { setTakesError(error instanceof Error ? error.message : "No se pudo exportar la toma"); }
  };

  const changePhysicalCalibration = (change: Partial<VelocityCalibration>) => {
    if (!calibrationScope) return;
    const current = getPortVelocityCalibration(calibrationBankRef.current, calibrationScope);
    const next = setPortVelocityCalibration(calibrationBankRef.current, calibrationScope, { ...current, ...change });
    calibrationBankRef.current = next;
    setCalibrationBank(next);
  };

  const resetPhysicalCalibration = () => {
    if (!calibrationScope) return;
    const next = resetPortVelocityCalibration(calibrationBankRef.current, calibrationScope);
    calibrationBankRef.current = next;
    setCalibrationBank(next);
  };

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      setProjects(await projectRepository.list());
      setProjectsError("");
    } catch (cause) {
      setProjectsError(cause instanceof Error ? cause.message : "No se pudieron cargar los proyectos");
    } finally {
      setProjectsLoading(false);
    }
  }, [projectRepository]);

  useEffect(() => { queueMicrotask(() => { void refreshProjects(); }); }, [refreshProjects]);

  const assetInspectionProjectId = projectView?.document.id;
  const assetInspectionRefs = projectView?.document.assets;
  useEffect(() => {
    const document = projectSessionRef.current?.getSnapshot().document;
    if (!document || document.id !== assetInspectionProjectId || !assetInspectionRefs?.length) return;
    let current = true;
    void inspectProjectAssets(projectRepository, document).then((statuses) => {
      if (current && projectSessionRef.current?.getSnapshot().document.id === document.id) {
        setProjectAssetStatuses(statuses);
      }
    }).catch((cause: unknown) => {
      if (current) setProjectAssetNotice(cause instanceof Error
        ? cause.message : "No se pudieron verificar las muestras del proyecto");
    });
    return () => { current = false; };
  }, [projectRepository, assetInspectionProjectId, assetInspectionRefs]);

  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      const status = projectSessionRef.current?.getSnapshot().status;
      if ((status && status !== "clean") || pendingAudioTakeRef.current ||
          audioInputRef.current?.state === "recording") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => {
      window.removeEventListener("beforeunload", warnUnsaved);
      wavExportAbortRef.current?.abort();
      projectUnsubscribeRef.current?.();
      const session = projectSessionRef.current;
      void (async () => {
        try { if (session) await session.save(); }
        catch { /* The browser may close before a save finishes; the last committed revision remains. */ }
        await projectRepository.close();
      })();
    };
  }, [projectRepository]);

  const activateProject = (session: ProjectSession) => {
    wavExportAbortRef.current?.abort();
    for (const [ownerId, timer] of projectPreviewTimersRef.current) {
      window.clearTimeout(timer);
      engine.releaseProjectPreview(ownerId);
    }
    projectPreviewTimersRef.current.clear();
    ++projectAudioRequestRef.current;
    engine.stopProjectPlayback();
    preparedProjectRef.current = null;
    setPreparedProjectDocument(null);
    setProjectAudioPreparing(false);
    setProjectAudioStatus("");
    setProjectTransport("stopped");
    setProjectTick(0);
    setProjectLauncher(null);
    setDrumPads(CORE_DRUM_PADS);
    projectSessionRef.current = session;
    setProjectBpmDraft(null);
    setEditorPatternId(null);
    setEditorTrackId(null);
    setStudioSelectedTrackId(null);
    setSavedOverdubTarget(null);
    recordingTargetRef.current = null;
    setTakeImportNotice("");
    setMidiExportNotice("");
    setWavExportProgress(null);
    setWavExportNotice("");
    setSampleDraft(null);
    setSampleRegionDraft(null);
    setEditingSampleTrackId(null);
    setSampleNotice("");
    setProjectView(session.getSnapshot());
    setProjectAssetStatuses([]);
    setProjectAssetBusyId(null);
    setProjectAssetNotice("");
    projectUnsubscribeRef.current = session.subscribe(() => setProjectView(session.getSnapshot()));
    localStorage.setItem("pmp_active_project_id", session.getSnapshot().document.id);
    setWorkspace("piano-roll");
    setScreen("studio");
  };

  const switchProject = async (open: () => Promise<ProjectSession>) => {
    if (projectSwitchingRef.current) throw new Error("Ya se está cambiando de proyecto");
    wavExportAbortRef.current?.abort();
    projectSwitchingRef.current = true;
    setProjectSwitching(true);
    try {
      await finishAudioCapture();
      if (projectSessionRef.current) {
        await projectSessionRef.current.close();
        projectUnsubscribeRef.current?.();
        projectUnsubscribeRef.current = null;
        projectSessionRef.current = null;
        setProjectView(null);
      }
      setStudioLoopEnabled(false);
      setStudioLoopStartBar(5);
      setStudioLoopEndBar(12);
      setStudioPendingSeek(null);
      activateProject(await open());
      await refreshProjects();
    } finally {
      projectSwitchingRef.current = false;
      setProjectSwitching(false);
    }
  };

  const createProject = async (name: string) => {
    await switchProject(() => ProjectSession.create(projectRepository, createStarterProject(name, bpm)));
  };

  const openProject = async (id: string) => {
    if (projectSessionRef.current?.getSnapshot().document.id === id) {
      setWorkspace("piano-roll");
      setScreen("studio");
      return;
    }
    await switchProject(() => ProjectSession.open(projectRepository, id));
  };

  const mutateProject = async (id: string, command: ProjectCommand) => {
    const active = projectSessionRef.current;
    if (active?.getSnapshot().document.id === id) {
      active.dispatch(command);
      await active.save();
    } else {
      const session = await ProjectSession.open(projectRepository, id);
      session.dispatch(command);
      await session.close();
    }
    await refreshProjects();
  };

  const duplicateProject = async (id: string) => {
    if (projectSessionRef.current?.getSnapshot().document.id === id) await projectSessionRef.current.save();
    const source = projects.find((project) => project.id === id);
    if (!source) throw new Error("Proyecto no encontrado");
    await projectRepository.duplicate(id, { id: crypto.randomUUID(), name: `${source.name.slice(0, 94)} copia`, at: Date.now() });
    await refreshProjects();
  };

  const exportProject = async (id: string) => {
    if (projectSessionRef.current?.getSnapshot().document.id === id) await projectSessionRef.current.save();
    const bundle = await exportProjectBundle(projectRepository, id);
    const name = projects.find((project) => project.id === id)?.name ?? "proyecto";
    const safe = name.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
    download(bundle, `${safe || "proyecto"}.pmp`, bundle.type);
  };

  const importProject = async (file: File) => {
    await importProjectBundle(projectRepository, file, { id: crypto.randomUUID(), at: Date.now() });
    await refreshProjects();
  };

  const recoverProjectDraft = async (projectId: string, sessionId: string) => {
    const source = projects.find((project) => project.id === projectId);
    const copy = await projectRepository.recoverDraftAsCopy(projectId, sessionId, {
      id: crypto.randomUUID(),
      name: `${(source?.name ?? "Proyecto").slice(0, 80)} recuperado`, at: Date.now(),
    });
    await switchProject(() => ProjectSession.open(projectRepository, copy.projectId));
  };

  const repairProjectAsset = async (assetId: string, file: File) => {
    const session = projectSessionRef.current;
    if (!session) return;
    const document = session.getSnapshot().document;
    setProjectAssetBusyId(assetId);
    setProjectAssetNotice("Verificando bytes y SHA-256 del archivo original…");
    try {
      await relocalizeProjectAsset(projectRepository, document, assetId, file);
      if (projectSessionRef.current !== session) return;
      setProjectAssetStatuses(await inspectProjectAssets(projectRepository, document));
      if (preparedProjectRef.current?.id === document.id) {
        engine.stopProjectPlayback();
        preparedProjectRef.current = null;
        setPreparedProjectDocument(null);
        setProjectTransport("stopped");
        setProjectTick(0);
        refreshProjectLauncher();
      }
      setProjectAssetNotice("Archivo original verificado y restaurado. Prepara el audio para escucharlo.");
      setProjectAudioStatus("Muestra restaurada con SHA-256 idéntico. Prepara el audio para escucharla.");
    } catch (cause) {
      if (projectSessionRef.current === session) setProjectAssetNotice(cause instanceof Error
        ? cause.message : "No se pudo restaurar la muestra");
    } finally {
      if (projectSessionRef.current === session) setProjectAssetBusyId(null);
    }
  };

  const importTakeToProject = async (takeId: string) => {
    const session = projectSessionRef.current;
    if (!session) throw new Error("Abre o crea un proyecto antes de añadir una toma MIDI");
    if (session.getSnapshot().document.takes.some((entry) => entry.recordingId === takeId)) {
      throw new Error("Esta toma ya está en el proyecto. Edita sus clips desde Arreglo.");
    }
    const take = takes.find((entry) => entry.id === takeId);
    const converted = await convertRecordedTake(library, takeId, {
      patternId: crypto.randomUUID(), patternName: take?.name ?? "Toma MIDI propia",
    });
    const prepared = prepareRecordedTakeImport(converted, {
      takeId, at: Date.now(), pianoInstrument: PROJECT_PIANO_INSTRUMENT,
      drumInstrument: PROJECT_DRUM_INSTRUMENT,
    });
    session.dispatch(prepared.command);
    let saveError = "";
    try { await session.save(); }
    catch (cause) { saveError = cause instanceof Error ? cause.message : "No se pudo confirmar el guardado"; }
    const unmatched = prepared.unsupportedDrumPitches;
    setTakeImportNotice(`${converted.report.noteCount} notas importadas sin alterar la toma original.${
      unmatched.length ? ` Batería sin muestra para notas MIDI ${unmatched.join(", ")}.` : ""}${
      converted.report.roundedPositions ? ` ${converted.report.roundedPositions} posiciones redondeadas al PPQ del proyecto.` : ""}${
      saveError ? ` Guardado pendiente: ${saveError}. Reintenta desde Studio.` : ""}`);
    if (!saveError) await refreshProjects();
    setWorkspace("arrangement");
    setScreen("studio");
  };

  const commitRecordedOverdub = async (projectId: string, request: PortableRecordedOverdubRequest) => {
    const session = projectSessionRef.current;
    if (!session || session.getSnapshot().document.id !== projectId) {
      throw new Error("El proyecto cambió antes de confirmar la toma");
    }
    await commitPortableRecordedOverdub(library, projectRepository, session, request);
    await refreshProjects();
  };

  const exportActiveProjectMidi = async () => {
    const session = projectSessionRef.current;
    if (!session) throw new Error("Abre un proyecto antes de exportar MIDI");
    setExportingMidi(true);
    setMidiExportNotice("");
    try {
      await session.save();
      const snapshot = session.getSnapshot();
      const { bytes, report } = await exportArrangementMidi(snapshot.document,
        { seed: snapshot.document.id });
      const safe = snapshot.document.name.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-|-$/g, "");
      download(bytes, `${safe || "proyecto"}.mid`, "audio/midi");
      setMidiExportNotice(`SMF tipo 1: ${report.noteCount} notas y ${report.controlCount} controles.${
        report.warnings.length ? ` Avisos: ${report.warnings.map((warning) =>
          `${warning.message} (${warning.count})`).join(" · ")}` : ""}`);
      setProjectsError("");
    } catch (cause) {
      setProjectsError(cause instanceof Error ? cause.message : "No se pudo exportar el MIDI del arreglo");
    } finally { setExportingMidi(false); }
  };

  const exportActiveProjectWav = async (options: ProjectWavOptions) => {
    if (wavExportAbortRef.current) return;
    const session = projectSessionRef.current;
    if (!session) { setWavExportNotice("Abre un proyecto antes de exportar audio."); return; }
    const controller = new AbortController();
    wavExportAbortRef.current = controller;
    setExportingWav(true);
    setWavExportProgress(null);
    setWavExportNotice("Guardando la revisión que se va a renderizar…");
    try {
      const revision = await session.save();
      if (controller.signal.aborted || projectSessionRef.current !== session) {
        throw new DOMException("Exportación cancelada", "AbortError");
      }
      const result = await exportProjectWav(revision, projectRepository, options,
        controller.signal, setWavExportProgress);
      if (controller.signal.aborted) throw new DOMException("Exportación cancelada", "AbortError");
      if (options.stems === "none") {
        const master = result.files[0];
        if (!master || master.kind !== "master") throw new Error("El render no produjo master WAV");
        download(master.bytes, master.name, master.mimeType);
      } else {
        setWavExportNotice("Empaquetando WAV y manifiesto…");
        const archive = await zipProjectWavAsync(result, controller.signal);
        if (controller.signal.aborted) throw new DOMException("Exportación cancelada", "AbortError");
        download(archive.blob, archive.name, archive.mimeType);
      }
      setWavExportNotice(`Exportación de revisión ${result.revision} completa: ${result.files.length} WAV, ${
        result.plan.omittedSourceTrackIds.length} pistas sin audio en el rango.`);
    } catch (cause) {
      if (projectSessionRef.current === session) {
        setWavExportNotice(cause instanceof DOMException && cause.name === "AbortError"
          ? "Exportación cancelada; no se descargó un archivo parcial."
          : cause instanceof Error ? cause.message : "No se pudo exportar el proyecto a WAV");
      }
    } finally {
      if (wavExportAbortRef.current === controller) wavExportAbortRef.current = null;
      setExportingWav(false);
    }
  };

  const inspectUserSample = async (file: File) => {
    const session = projectSessionRef.current;
    if (!session) throw new Error("Abre un proyecto antes de añadir una muestra");
    setSampleBusy(true);
    setSampleNotice("");
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const analysis = await analyzeUserSample(file, crypto.randomUUID(), context);
      if (projectSessionRef.current !== session) throw new Error("El proyecto cambió durante la lectura de la muestra");
      const duration = analysis.buffer.length / analysis.buffer.sampleRate;
      setSampleDraft({ fileName: file.name, analysis });
      setEditingSampleTrackId(null);
      setSampleRegionDraft({ startSeconds: 0, endSeconds: duration, fadeInMs: 0,
        fadeOutMs: 0, rootMidi: 60, cents: 0, reverse: false,
        loopMode: "none", playMode: "oneShot" });
      setSampleNotice(`${file.name}: ${duration.toFixed(2)} s, ${analysis.buffer.numberOfChannels} canal(es), SHA-256 verificado.`);
    } catch (cause) {
      setSampleDraft(null);
      setSampleRegionDraft(null);
      setSampleNotice(cause instanceof Error ? cause.message : "No se pudo analizar la muestra");
    } finally {
      if (context) void context.close().catch(() => undefined);
      setSampleBusy(false);
    }
  };

  const installAnalyzedSample = async () => {
    const session = projectSessionRef.current;
    if (!session || !sampleDraft || !sampleRegionDraft) return;
    const projectId = session.getSnapshot().document.id;
    setSampleBusy(true);
    setSampleNotice("");
    try {
      const { analysis, fileName } = sampleDraft;
      const existing = session.getSnapshot().document.tracks.find((track) =>
        track.instrument?.presetId === `asset:${analysis.ref.id}`);
      if (existing) {
        await session.retrySave();
        setEditorTrackId(existing.id);
      } else {
        const trackId = crypto.randomUUID();
        const patternId = crypto.randomUUID();
        const region = sampleRegionFromDraft(sampleRegionDraft,
          analysis.buffer.length, analysis.buffer.sampleRate);
        await installUserSample(projectRepository, session, {
          asset: analysis.ref, data: analysis.data, trackId, patternId,
          clipId: crypto.randomUUID(), at: Date.now(),
          trackName: fileName.replace(/\.[^.]+$/, "").trim().slice(0, 80) || "Muestra propia",
          patternName: "Patrón de muestra", sampleRegion: region,
        });
        if (projectSessionRef.current !== session || session.getSnapshot().document.id !== projectId) return;
        setEditorTrackId(trackId);
        setEditorPatternId(patternId);
      }
      setWorkspace("piano-roll");
      setSampleDraft(null);
      setSampleRegionDraft(null);
      setSampleNotice("Muestra propia instalada y guardada. Dibuja notas en Piano roll para escucharla.");
      await refreshProjects();
    } catch (cause) {
      setSampleNotice(cause instanceof Error ? cause.message : "No se pudo instalar la muestra");
    } finally { setSampleBusy(false); }
  };

  const installAnalyzedSampleSlices = async (trackId: string, expectedRack: ProjectDrumRack,
    slices: readonly { padId: string; startFrame: number; endFrame: number }[]): Promise<void> => {
    const session = projectSessionRef.current;
    if (!session || !sampleDraft) throw new Error("El proyecto o la muestra cambiaron antes de guardar los cortes");
    const projectId = session.getSnapshot().document.id;
    setSampleBusy(true);
    setSampleNotice("");
    try {
      await installSampleSlices(projectRepository, session, {
        asset: sampleDraft.analysis.ref, data: sampleDraft.analysis.data,
        trackId, expectedRack, slices, at: Date.now(),
      });
      if (projectSessionRef.current !== session || session.getSnapshot().document.id !== projectId) return;
      setSampleDraft(null);
      setSampleRegionDraft(null);
      setWorkspace("drums");
      setSampleNotice(`${slices.length} cortes guardados en pads. Los bytes originales siguen intactos.`);
      await refreshProjects();
    } catch (cause) {
      setSampleNotice(cause instanceof Error ? cause.message : "No se pudieron instalar los cortes");
      throw cause;
    } finally { setSampleBusy(false); }
  };

  const beginEditingInstalledSample = () => {
    const track = selectedSampleTrack;
    const asset = selectedSampleAsset;
    if (!track || !asset?.frameCount || !asset.sampleRate) {
      setSampleNotice("La pista no tiene una muestra verificable para editar.");
      return;
    }
    const region = track.instrument?.sampleRegion ?? {
      startFrame: 0, endFrame: asset.frameCount, fadeInFrames: 0, fadeOutFrames: 0,
      rootMidi: 60, cents: 0, reverse: false, loopMode: "none" as const,
      playMode: "oneShot" as const,
    };
    setSampleDraft(null);
    setEditingSampleTrackId(track.id);
    setSampleRegionDraft({ startSeconds: region.startFrame / asset.sampleRate,
      endSeconds: region.endFrame / asset.sampleRate,
      fadeInMs: region.fadeInFrames * 1000 / asset.sampleRate,
      fadeOutMs: region.fadeOutFrames * 1000 / asset.sampleRate,
      rootMidi: region.rootMidi, cents: region.cents, reverse: region.reverse,
      loopMode: region.loopMode, playMode: region.playMode });
    setSampleNotice(`Editando región de ${track.name}. Los bytes originales se conservan.`);
  };

  const saveInstalledSampleRegion = async () => {
    const session = projectSessionRef.current;
    const track = session?.getSnapshot().document.tracks.find((entry) => entry.id === editingSampleTrackId);
    const asset = session?.getSnapshot().document.assets.find((entry) =>
      `asset:${entry.id}` === track?.instrument?.presetId);
    if (!session || !track || !asset?.frameCount || !asset.sampleRate || !sampleRegionDraft) return;
    setSampleBusy(true);
    try {
      const region = sampleRegionFromDraft(sampleRegionDraft, asset.frameCount, asset.sampleRate);
      session.dispatch({ kind: "replaceSampleRegion", trackId: track.id,
        expected: track.instrument?.sampleRegion, region, at: Date.now() });
      await session.save();
      setSampleRegionDraft(null);
      setEditingSampleTrackId(null);
      setSampleNotice("Región guardada. Deshacer y Rehacer siguen disponibles en el proyecto.");
    } catch (cause) {
      setSampleNotice(cause instanceof Error ? cause.message : "No se pudo guardar la región");
    } finally { setSampleBusy(false); }
  };

  const saveInstalledSampleVoice = async (trackId: string, voice: ProjectInstrumentRef["sampleVoice"]) => {
    const session = projectSessionRef.current;
    const track = session?.getSnapshot().document.tracks.find((entry) => entry.id === trackId);
    if (!session || !track || track.instrument?.instrumentId !== "user-sampler") return;
    setSampleBusy(true);
    setSampleNotice("");
    try {
      session.dispatch({ kind: "replaceSampleVoice", trackId,
        expected: track.instrument.sampleVoice, voice, at: Date.now() });
      await session.save();
      setSampleNotice(voice ? "Voz de muestra guardada; puedes deshacer el cambio en el proyecto."
        : "Polifonía predeterminada restaurada; puedes deshacer el cambio en el proyecto.");
    } catch (cause) {
      setSampleNotice(cause instanceof Error ? cause.message : "No se pudo guardar la voz de muestra");
    } finally { setSampleBusy(false); }
  };

  async function savePendingAudioTake(): Promise<void> {
    if (audioCaptureSaveRef.current) return audioCaptureSaveRef.current;
    const capture = pendingAudioTakeRef.current;
    const target = audioCaptureTargetRef.current;
    if (!capture || !target) return;
    const task = (async () => {
      try {
        if (projectSessionRef.current !== target.session) {
          throw new Error("La sesión del proyecto cambió antes de guardar el audio");
        }
        const document = target.session.getSnapshot().document;
        const durationSeconds = capture.frameCount / capture.sampleRate;
        if (capture.startProjectUs === undefined) {
          throw new Error("La toma no confirmó su inicio preciso con el reloj del proyecto; conserva el WAV para reintentar.");
        }
        const track = document.tracks.find((entry) => entry.id === capture.trackId);
        if (document.takes.some((take) => take.kind === "audio" && take.assetId === capture.ref.id)) {
          await target.session.retrySave();
        } else {
          await installAudioCapture(projectRepository, target.session, {
            capture, takeId: crypto.randomUUID(), clipId: crypto.randomUUID(), at: Date.now(),
            ...(track ? {} : { track: {
              id: capture.trackId, name: "Audio grabado", kind: "audio" as const,
              mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
                sends: [], effects: [] },
            } }),
          });
        }
        pendingAudioTakeRef.current = null;
        audioCaptureTargetRef.current = null;
        audioCaptureScheduleRef.current = null;
        setPendingAudioTake(false);
        setAudioCaptureNotice(`${capture.incomplete ? "Toma interrumpida recuperada" : "Toma de audio guardada"}: ${durationSeconds.toFixed(2)} s, ${capture.frameCount} frames${
          capture.clippedSamples ? `, ${capture.clippedSamples} muestras con clipping` : ""}.`);
        await refreshProjects();
        if (audioInputRef.current) {
          engine.releaseAudioInputSession(audioInputRef.current);
          audioInputRef.current = null;
          setAudioInputSnapshot(null);
        }
      } catch (cause) {
        setAudioCaptureNotice(cause instanceof Error ? cause.message : "No se pudo guardar la toma de audio");
        throw cause;
      }
    })();
    audioCaptureSaveRef.current = task;
    try { await task; }
    finally { if (audioCaptureSaveRef.current === task) audioCaptureSaveRef.current = null; }
  }

  async function setAudioTakeLatency(takeId: string, expectedOffsetFrames: number,
    offsetFrames: number): Promise<void> {
    const session = projectSessionRef.current;
    if (!session) throw new Error("Abre un proyecto para corregir la latencia de audio");
    session.dispatch({ kind: "setAudioTakeLatency", takeId, expectedOffsetFrames,
      offsetFrames, at: Date.now() });
    await session.save();
  }

  async function finishAudioCapture(): Promise<void> {
    const input = audioInputRef.current;
    if (input?.state === "starting") {
      audioCaptureScheduleRef.current?.cancel("count-in-cancelled");
      audioCaptureScheduleRef.current = null;
    }
    if (input?.state === "recording" || input?.state === "starting" || input?.state === "stopping") {
      await input.stop();
    }
    if (audioCaptureSaveRef.current) await audioCaptureSaveRef.current;
    if (pendingAudioTakeRef.current) throw new Error("La toma de audio sigue sin guardar; reintenta antes de cambiar proyecto");
    if (audioInputRef.current) {
      engine.releaseAudioInputSession(audioInputRef.current);
      audioInputRef.current = null;
    }
    audioCaptureScheduleRef.current = null;
    audioCaptureTargetRef.current = null;
    setAudioInputSnapshot(null);
  }

  const armAudioInput = async (channels: 1 | 2) => {
    if (!projectSessionRef.current || pendingAudioTakeRef.current) {
      setAudioCaptureNotice("Abre un proyecto y guarda la toma pendiente antes de armar la entrada.");
      return;
    }
    setAudioCaptureBusy(true);
    setAudioCaptureNotice("");
    try {
      if (!(await prepareProjectAudio())) throw new Error("Prepara el audio del proyecto antes de grabar");
      if (audioInputRef.current) engine.releaseAudioInputSession(audioInputRef.current);
      const input = await engine.createAudioInputSession({
        onState: (snapshot) => setAudioInputSnapshot(snapshot),
        onTake: (take) => {
          pendingAudioTakeRef.current = take;
          setPendingAudioTake(true);
          void savePendingAudioTake().catch(() => undefined);
        },
      });
      audioInputRef.current = input;
      setAudioInputSnapshot(await input.arm(undefined, channels));
      setAudioCaptureNotice("Entrada armada. El monitor está apagado.");
    } catch (cause) {
      setAudioCaptureNotice(cause instanceof Error ? cause.message : "No se pudo armar la entrada de audio");
      if (audioInputRef.current) {
        engine.releaseAudioInputSession(audioInputRef.current);
        audioInputRef.current = null;
      }
    } finally { setAudioCaptureBusy(false); }
  };

  const startAudioCapture = async (settings: AudioCaptureSettings) => {
    const input = audioInputRef.current;
    const session = projectSessionRef.current;
    const now = engine.projectAudioNow();
    if (!input || !session || now === null) {
      setAudioCaptureNotice("La entrada o el reloj del proyecto no están listos. Vuelve a armar.");
      return;
    }
    setAudioCaptureBusy(true);
    setAudioCaptureNotice("");
    try {
      const document = session.getSnapshot().document;
      const clock = new MusicalClock(document.tempoMap, document.meterMap);
      const position = engine.projectPositionAtAudioTime(now);
      if (!position) throw new Error("No se pudo leer el reloj del proyecto");
      const playing = position.state === "playing";
      const baseTick = playing ? position.projectTick : position.tick;
      const meter = clock.meterAt(baseTick);
      const tempo = clock.tempoAt(baseTick);
      const barTicks = PROJECT_PPQ * 4 * meter.numerator / meter.denominator;
      const barSeconds = tempo.microsPerQuarter * 4 * meter.numerator /
        meter.denominator / 1_000_000;
      const leadSeconds = 0.12;
      const earliestTick = playing ? clock.secondsToTick(
        position.projectUs / 1_000_000 + leadSeconds + settings.countInBars * barSeconds, "ceil")
        : baseTick;
      const startTick = playing && (settings.countInBars > 0 || settings.punchBars !== null)
        ? meter.tick + Math.ceil(Math.max(0, earliestTick - meter.tick) / barTicks) * barTicks
        : earliestTick;
      const plan: ProjectAudioRecordingPlan = { startTick,
        countInBars: settings.countInBars,
        ...(settings.punchBars === null ? {} : { punch: {
          startTick, endTick: startTick + settings.punchBars * barTicks,
        } }) };
      audioCaptureTargetRef.current = { session };
      const schedule = await engine.scheduleProjectAudioRecording(input, plan, {
        assetId: crypto.randomUUID(), trackId: crypto.randomUUID(),
        epoch: ++audioCaptureEpochRef.current, latencyOffsetFrames: 0,
      });
      audioCaptureScheduleRef.current = schedule;
      setProjectTransport("playing");
      setAudioInputSnapshot(input.snapshot());
      setAudioCaptureNotice(settings.countInBars > 0
        ? `Cuenta de ${settings.countInBars} ${settings.countInBars === 1 ? "compás" : "compases"} programada con el reloj de audio.`
        : settings.punchBars === null ? "Grabación programada con el reloj de audio."
          : `Punch de ${settings.punchBars} ${settings.punchBars === 1 ? "compás" : "compases"} programado.`);
      void schedule.started.then(() => {
        if (audioCaptureScheduleRef.current !== schedule) return;
        setAudioInputSnapshot(input.snapshot());
        setAudioCaptureNotice(settings.punchBars === null
          ? "Grabando audio. Detén la toma para guardarla."
          : "Grabando audio. La salida de punch guardará la toma automáticamente.");
      }, (cause: unknown) => {
        if (audioCaptureScheduleRef.current !== schedule) return;
        audioCaptureScheduleRef.current = null;
        audioCaptureTargetRef.current = null;
        setAudioCaptureNotice(cause instanceof Error ? cause.message : "No se inició la toma programada");
      });
      if (schedule.completed) void schedule.completed.then((take) => {
        if (audioCaptureScheduleRef.current !== schedule) return;
        audioCaptureScheduleRef.current = null;
        if (!take) {
          audioCaptureTargetRef.current = null;
          setAudioCaptureNotice("El punch terminó sin frames confirmados; no se guardó una toma.");
        }
      }, (cause: unknown) => {
        if (audioCaptureScheduleRef.current !== schedule) return;
        audioCaptureScheduleRef.current = null;
        setAudioCaptureNotice(cause instanceof Error ? cause.message : "Falló la salida de punch");
      });
    } catch (cause) {
      audioCaptureTargetRef.current = null;
      setAudioCaptureNotice(cause instanceof Error ? cause.message : "No se pudo iniciar la captura");
    } finally { setAudioCaptureBusy(false); }
  };

  const stopAudioCapture = async () => {
    const cancellingCountIn = audioInputRef.current?.state === "starting";
    setAudioCaptureBusy(true);
    try {
      await finishAudioCapture();
      if (cancellingCountIn && !pendingAudioTakeRef.current) setAudioCaptureNotice("Cuenta cancelada antes de capturar audio.");
    }
    catch (cause) { setAudioCaptureNotice(cause instanceof Error ? cause.message : "No se pudo cerrar la toma"); }
    finally { setAudioCaptureBusy(false); }
  };

  const disarmAudioInput = () => {
    const input = audioInputRef.current;
    audioCaptureScheduleRef.current?.cancel("input-disarmed");
    audioCaptureScheduleRef.current = null;
    if (input) engine.releaseAudioInputSession(input);
    audioInputRef.current = null;
    audioCaptureTargetRef.current = null;
    setAudioInputSnapshot(null);
    setAudioCaptureNotice("Entrada desarmada.");
  };

  const setAudioMonitor = (enabled: boolean, acknowledged: boolean) => {
    try { setAudioInputSnapshot(audioInputRef.current?.setMonitorEnabled(enabled, acknowledged) ?? null); }
    catch (cause) { setAudioCaptureNotice(cause instanceof Error ? cause.message : "No se pudo cambiar el monitor"); }
  };

  useEffect(() => {
    if (workspace !== "audio" && audioInputRef.current?.state !== "recording") return;
    const timer = window.setInterval(() => {
      if (audioInputRef.current) setAudioInputSnapshot(audioInputRef.current.snapshot());
    }, 125);
    return () => window.clearInterval(timer);
  }, [workspace, audioInputSnapshot?.state]);

  const refreshStorageHealth = async () => {
    try {
      setStorageHealth(await getProjectStorageHealth());
      setStorageNotice("");
    } catch (cause) {
      setStorageNotice(cause instanceof Error ? cause.message : "No se pudo consultar el almacenamiento");
    }
  };

  const persistProjectStorage = async () => {
    try {
      const granted = await requestProjectStoragePersistence();
      setStorageNotice(granted ? "Almacenamiento persistente concedido por el navegador."
        : "El navegador no concedió almacenamiento persistente.");
      setStorageHealth(await getProjectStorageHealth());
    } catch (cause) {
      setStorageNotice(cause instanceof Error ? cause.message : "No se pudo solicitar persistencia");
    }
  };

  const saveActiveProjectAsCopy = async () => {
    const active = projectSessionRef.current;
    if (!active) throw new Error("No hay proyecto activo");
    const name = `${active.getSnapshot().document.name.slice(0, 80)} copia recuperada`;
    const copy = await active.saveAsCopy({ id: crypto.randomUUID(), name, at: Date.now() });
    projectUnsubscribeRef.current?.();
    projectUnsubscribeRef.current = null;
    const captured = pendingAudioTakeRef.current;
    if (captured && copy.getSnapshot().document.takes.some((take) =>
      take.kind === "audio" && take.assetId === captured.ref.id)) {
      pendingAudioTakeRef.current = null;
      audioCaptureTargetRef.current = null;
      setPendingAudioTake(false);
      if (audioInputRef.current) engine.releaseAudioInputSession(audioInputRef.current);
      audioInputRef.current = null;
      setAudioInputSnapshot(null);
      setAudioCaptureNotice("Toma de audio preservada en la copia recuperada.");
    }
    activateProject(copy);
    await refreshProjects();
  };

  const setProjectArchived = async (id: string, archived: boolean) => {
    if (archived && projectSessionRef.current?.getSnapshot().document.id === id) {
      await finishAudioCapture();
    }
    await mutateProject(id, { kind: "setArchived", archived, at: Date.now() });
    const active = projectSessionRef.current;
    if (archived && active?.getSnapshot().document.id === id) {
      await active.close();
      projectUnsubscribeRef.current?.();
      projectUnsubscribeRef.current = null;
      projectSessionRef.current = null;
      setProjectView(null);
      setWorkspace("performance");
      localStorage.removeItem("pmp_active_project_id");
    }
  };

  useEffect(() => {
    const document = projectView?.document;
    if (preparedProjectRef.current && preparedProjectRef.current !== document) {
      const sameProject = preparedProjectRef.current.id === document?.id;
      let reprepareReason = "";
      if (sameProject && document) {
        try {
          const automationTick = engine.hotSwapProjectAutomation(document);
          if (automationTick !== null) {
            preparedProjectRef.current = document;
            queueMicrotask(() => {
              if (preparedProjectRef.current !== document) return;
              setPreparedProjectDocument(document);
              setProjectAudioStatus(`Automatización aplicada sin detener el beat desde tick ${automationTick}.`);
            });
            return;
          }
        } catch { /* Otra edición del proyecto puede requerir sincronizar arreglo o preparar audio. */ }
        try {
          const swap = engine.hotSwapProjectArrangement(document);
          if (swap) {
            preparedProjectRef.current = document;
            queueMicrotask(() => {
              if (preparedProjectRef.current !== document) return;
              setPreparedProjectDocument(document);
              setProjectAudioStatus(`Edición MIDI aplicada sin detener el beat desde tick ${swap.effectiveTick}.`);
              refreshProjectLauncher();
            });
            return;
          }
        } catch (cause) {
          reprepareReason = cause instanceof Error ? cause.message : "La edición requiere preparar audio de nuevo";
        }
      }
      ++projectAudioRequestRef.current;
      engine.stopProjectPlayback();
      preparedProjectRef.current = null;
      setPreparedProjectDocument(null);
      setProjectAudioPreparing(false);
      setProjectTransport("stopped");
      setProjectTick(0);
      setProjectLauncher(null);
      setProjectAudioStatus(sameProject ? `${reprepareReason || "Proyecto actualizado"}. Reproduce para escuchar la nueva versión.` : "");
      if (!sameProject) setDrumPads(CORE_DRUM_PADS);
    }
  }, [engine, projectView?.document, refreshProjectLauncher]);

  useEffect(() => {
    if (projectTransport !== "playing") return;
    const timer = window.setInterval(() => {
      const transport = engine.projectPlaybackSnapshot()?.transport;
      if (transport) {
        setProjectTick(transport.tick);
        if (transport.state !== projectTransport) setProjectTransport(transport.state);
        refreshProjectLauncher();
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [engine, projectTransport, refreshProjectLauncher]);

  const projectStartMicros = projectView?.document.tempoMap[0]?.microsPerQuarter;
  const visibleProjectBpm = projectBpmDraft ?? (projectStartMicros
    ? String(Math.round(60_000_000 / projectStartMicros)) : "");

  const instrumentTracks = projectView?.document.tracks.filter((track) => track.kind === "instrument") ?? [];
  const rollTracks = projectView?.document.tracks.filter((track) =>
    track.kind === "instrument" || track.kind === "drum") ?? [];
  const projectTrack = rollTracks.find((track) => track.id === editorTrackId) ?? rollTracks[0];
  const sampleTracks = instrumentTracks.filter((track) => track.instrument?.instrumentId === "user-sampler");
  const selectedSampleTrack = sampleTracks.find((track) => track.id === editorTrackId) ?? sampleTracks[0];
  const selectedSampleAsset = projectView?.document.assets.find((asset) =>
    `asset:${asset.id}` === selectedSampleTrack?.instrument?.presetId);
  const editingSampleAsset = sampleDraft?.analysis.ref ?? (editingSampleTrackId === selectedSampleTrack?.id
    ? selectedSampleAsset : undefined);
  const editingSampleDuration = sampleDraft?.analysis.buffer.duration ??
    (editingSampleAsset?.frameCount && editingSampleAsset.sampleRate
      ? editingSampleAsset.frameCount / editingSampleAsset.sampleRate : 0);
  const drumTrack = projectView?.document.tracks.find((track) => track.kind === "drum");
  const drumSourceOptions: readonly DrumRackSourceOption[] = [
    ...DRUM_SOURCE_OPTIONS,
    ...(projectView?.document.assets ?? []).filter((asset) => asset.sourceKind !== "official" &&
      asset.frameCount !== undefined).map((asset) => ({
      id: `asset-${asset.id}`, label: `Muestra propia · ${asset.id.slice(0, 8)}`,
      source: { kind: "asset" as const, assetId: asset.id, sha256: asset.sha256 },
    })),
  ];
  const defaultProjectPatternId = projectView?.document.clips.find((clip) =>
    clip.kind === "pattern" && clip.trackId === projectTrack?.id)?.sourceId;
  const defaultDrumPatternId = projectView?.document.clips.find((clip) =>
    clip.kind === "pattern" && clip.trackId === drumTrack?.id)?.sourceId;
  const projectPatternId = editorPatternId && projectView?.document.clips.some((clip) =>
    clip.kind === "pattern" && clip.trackId === projectTrack?.id && clip.sourceId === editorPatternId)
    ? editorPatternId : defaultProjectPatternId;
  const drumPatternId = editorPatternId && projectView?.document.clips.some((clip) =>
    clip.kind === "pattern" && clip.trackId === drumTrack?.id && clip.sourceId === editorPatternId)
    ? editorPatternId : defaultDrumPatternId;
  const projectPattern = projectView?.document.patterns.find((pattern) => pattern.id === projectPatternId) ?? null;
  const drumPattern = projectView?.document.patterns.find((pattern) => pattern.id === drumPatternId) ?? null;

  const prepareProjectAudio = async (): Promise<boolean> => {
    const document = projectSessionRef.current?.getSnapshot().document;
    if (!document) throw new Error("Abre un proyecto antes de activar su audio");
    if (preparedProjectRef.current === document && engine.projectPlaybackSnapshot()?.audio.projectId === document.id) return true;
    const request = ++projectAudioRequestRef.current;
    setProjectAudioPreparing(true);
    setProjectAudioStatus("Cargando muestras grabadas…");
    try {
      const loopRange = studioLoopEnabled
        ? studioLoopBarRange(document.meterMap, studioLoopStartBar, studioLoopEndBar)
        : undefined;
      const playback = await engine.prepareProjectPlayback(document, createArrangementResolver(document),
        loopRange, projectRepository);
      if (request !== projectAudioRequestRef.current || projectSessionRef.current?.getSnapshot().document !== document) {
        if (playback && engine.projectPlaybackSnapshot()?.audio.projectId === document.id) engine.stopProjectPlayback();
        return false;
      }
      if (!playback) throw new Error(engine.diagnostics().error ?? "No se pudo obtener la salida de audio de esta pestaña");
      const diagnostics = playback.snapshot().audio;
      const errors = diagnostics.tracks.filter((track) => track.status === "error");
      const preparedDrumTrack = document.tracks.find((track) => track.kind === "drum");
      const statuses = preparedDrumTrack ? engine.projectPadStatus(preparedDrumTrack.id) : [];
      if (!preparedDrumTrack?.drumRack) setDrumPads(CORE_DRUM_PADS.map((pad) => {
        const source = statuses.find((status) => status.note === pad.midiNote);
        return { ...pad, sourceStatus: source?.assetStatus === "ready" ? "ready" : "missing",
          sourceCredit: source?.sourceLabel };
      }));
      if (errors.length) {
        setProjectAudioStatus(errors.map((track) => `${track.trackId}: ${track.error}`).join(" · "));
        return false;
      }
      if (!diagnostics.metronome.ready) {
        setProjectAudioStatus(`Metrónomo sin muestra lista: ${diagnostics.metronome.error ?? "fuente no disponible"}`);
        if (latestRef.current.metronomeOn) return false;
      } else {
        setProjectAudioStatus("Muestras verificadas y listas. Calidad física pendiente de audición.");
      }
      preparedProjectRef.current = document;
      setPreparedProjectDocument(document);
      refreshProjectLauncher();
      return true;
    } catch (cause) {
      if (request === projectAudioRequestRef.current) {
        setProjectAudioStatus(cause instanceof Error ? cause.message : "No se pudo preparar el audio");
        setDrumPads(CORE_DRUM_PADS.map((pad) => ({ ...pad, sourceStatus: "missing" })));
      }
      return false;
    } finally {
      if (request === projectAudioRequestRef.current) setProjectAudioPreparing(false);
    }
  };

  const toggleProjectPlayback = async () => {
    if (projectTransport === "playing") {
      engine.pauseProjectPlayback();
      setProjectTransport("paused");
      refreshProjectLauncher();
      return;
    }
    if (!(await prepareProjectAudio())) return;
    const played = await engine.playProjectPlayback(studioPendingSeek ?? undefined);
    if (played) setStudioPendingSeek(null);
    setProjectTransport(played ? "playing" : engine.projectPlaybackSnapshot()?.transport.state ?? "blocked");
    refreshProjectLauncher();
    if (!played) setProjectAudioStatus("No se pudo iniciar el transporte. Activa el audio y vuelve a intentar.");
  };

  const stopProjectPlayback = () => {
    for (const [ownerId, timer] of projectPreviewTimersRef.current) {
      window.clearTimeout(timer);
      engine.releaseProjectPreview(ownerId);
    }
    projectPreviewTimersRef.current.clear();
    engine.stopProjectPlayback();
    setProjectTransport("stopped");
    setProjectTick(0);
    setStudioPendingSeek(null);
    refreshProjectLauncher();
  };

  const launchProjectScene = async (sceneId: string, requestedTick: number): Promise<void> => {
    const projectId = projectSessionRef.current?.getSnapshot().document.id;
    if (!projectId || !(await prepareProjectAudio()) ||
        projectSessionRef.current?.getSnapshot().document.id !== projectId) {
      throw new Error("No se pudo preparar el audio de esta escena");
    }
    const launchTick = engine.queueProjectScene(sceneId, requestedTick);
    if (launchTick === null) throw new Error("No hay transporte del proyecto para lanzar la escena");
    if (engine.projectPlaybackSnapshot()?.transport.state !== "playing") {
      const played = await engine.playProjectPlayback();
      if (!played) {
        engine.stopProjectScene();
        refreshProjectLauncher();
        throw new Error("No se pudo iniciar la salida de audio del proyecto");
      }
    }
    setProjectTransport("playing");
    refreshProjectLauncher();
  };

  const stopProjectScene = (): void => {
    engine.stopProjectScene();
    refreshProjectLauncher();
  };

  const readProjectTick = useCallback(() => engine.projectTransportTick() ?? 0, [engine]);

  const commitAutomationEdit = (change: (session: ProjectSession) => ProjectSessionSnapshot): void => {
    const session = projectSessionRef.current;
    if (!session) throw new Error("Abre un proyecto antes de editar la automatización");
    const previous = session.getSnapshot().document;
    const wasPrepared = preparedProjectRef.current === previous &&
      engine.projectPlaybackSnapshot()?.audio.projectId === previous.id;
    const next = change(session).document;
    if (wasPrepared) {
      try {
        if (engine.hotSwapProjectAutomation(next) !== null) {
          preparedProjectRef.current = next;
          setPreparedProjectDocument(next);
        }
      } catch { /* El efecto de revisión detendrá o preparará el grafo si cambia otra área. */ }
    }
  };
  const rollVisuals = useMemo(() => {
    const document = projectView?.document;
    const tracks = document?.tracks.filter((track) => track.kind === "instrument" || track.kind === "drum");
    const active = tracks?.find((track) => track.id === editorTrackId) ?? tracks?.[0];
    if (!document || !active) return { ghostPatterns: [], padTriggers: undefined, padNames: undefined };
    const activeSourceId = editorPatternId && document.clips.some((clip) =>
      clip.kind === "pattern" && clip.trackId === active.id && clip.sourceId === editorPatternId)
      ? editorPatternId : document.clips.find((clip) =>
        clip.kind === "pattern" && clip.trackId === active.id)?.sourceId;
    const sourceIds = new Set(document.clips.filter((clip) => clip.kind === "pattern" &&
      clip.sourceId !== activeSourceId).map((clip) => clip.sourceId));
    const padTriggers = active.drumRack?.pads.map((pad) => ({
      pitch: pad.midiNote, channel: pad.channel, label: pad.name,
    }));
    return { ghostPatterns: document.patterns.filter((pattern) => sourceIds.has(pattern.id)),
      padTriggers, padNames: padTriggers && Object.fromEntries(
        padTriggers.map((pad) => [pad.pitch, pad.label])) };
  }, [projectView?.document, editorTrackId, editorPatternId]);

  const releaseProjectPreviewLater = (ownerId: string, durationMs: number) => {
    const timer = window.setTimeout(() => {
      projectPreviewTimersRef.current.delete(ownerId);
      engine.releaseProjectPreview(ownerId);
    }, durationMs);
    projectPreviewTimersRef.current.set(ownerId, timer);
  };

  useEffect(() => () => {
    for (const [ownerId, timer] of projectPreviewTimersRef.current) {
      window.clearTimeout(timer);
      engine.releaseProjectPreview(ownerId);
    }
    projectPreviewTimersRef.current.clear();
  }, [engine]);

  const commitProjectBpm = () => {
    if (projectBpmDraft === null) return;
    if (pendingAudioTakeRef.current || audioInputRef.current?.state === "starting" ||
        audioInputRef.current?.state === "recording" || audioInputRef.current?.state === "stopping") {
      setProjectBpmDraft(null);
      setProjectsError("Detén y guarda la toma de audio antes de cambiar el tempo.");
      return;
    }
    const snapshot = projectSessionRef.current?.getSnapshot();
    if (!snapshot) return;
    const nextBpm = Number(visibleProjectBpm);
    if (!Number.isFinite(nextBpm) || nextBpm < 30 || nextBpm > 300) {
      setProjectBpmDraft(null);
      setProjectsError("El tempo inicial del proyecto debe estar entre 30 y 300 BPM.");
      return;
    }
    const microsPerQuarter = Math.round(60_000_000 / nextBpm);
    if (microsPerQuarter === snapshot.document.tempoMap[0]?.microsPerQuarter) {
      setProjectBpmDraft(null);
      return;
    }
    try {
      projectSessionRef.current?.dispatch({ kind: "replaceTempoMap", at: Date.now(),
        tempoMap: snapshot.document.tempoMap.map((point, index) => index === 0
          ? { ...point, microsPerQuarter } : point) });
      setProjectBpmDraft(null);
      setProjectsError("");
    } catch (cause) {
      setProjectsError(cause instanceof Error ? cause.message : "No se pudo cambiar el tempo del proyecto");
    }
  };

  const commitTrackMix = (trackId: string, mix: ProjectDocumentV1["tracks"][number]["mix"]) => {
    const session = projectSessionRef.current;
    const previous = session?.getSnapshot().document;
    const track = previous?.tracks.find((entry) => entry.id === trackId);
    if (!session || !previous || !track) return;
    try {
      const wasPrepared = preparedProjectRef.current === previous &&
        engine.projectPlaybackSnapshot()?.audio.projectId === previous.id;
      const canApplyLive = track.mix.outputBusTrackId === mix.outputBusTrackId &&
        track.mix.effects === mix.effects && track.mix.sends === mix.sends;
      const snapshot = session.dispatch({ kind: "replaceTrackMix", trackId,
        expected: track.mix, mix, at: Date.now() });
      if (wasPrepared && canApplyLive && engine.syncProjectMixRevision(snapshot.document) !== null) {
        preparedProjectRef.current = snapshot.document;
        setPreparedProjectDocument(snapshot.document);
      }
      setProjectsError("");
    } catch (cause) {
      setProjectsError(cause instanceof Error ? cause.message : "No se pudo guardar la mezcla de la pista");
    }
  };

  const commitMasterMix = (mix: ProjectDocumentV1["mix"]) => {
    const session = projectSessionRef.current;
    const previous = session?.getSnapshot().document;
    if (!session || !previous) return;
    try {
      const wasPrepared = preparedProjectRef.current === previous &&
        engine.projectPlaybackSnapshot()?.audio.projectId === previous.id;
      const canApplyLive = previous.mix.masterEffects === mix.masterEffects;
      const snapshot = session.dispatch({ kind: "replaceMasterMix",
        expected: previous.mix, mix, at: Date.now() });
      if (wasPrepared && canApplyLive && engine.syncProjectMixRevision(snapshot.document) !== null) {
        preparedProjectRef.current = snapshot.document;
        setPreparedProjectDocument(snapshot.document);
      }
      setProjectsError("");
    } catch (cause) {
      setProjectsError(cause instanceof Error ? cause.message : "No se pudo guardar la mezcla master");
    }
  };

  const commitTrackEffects = (trackId: string, effects: readonly ProjectEffect[]) => {
    const session = projectSessionRef.current;
    const track = session?.getSnapshot().document.tracks.find((entry) => entry.id === trackId);
    if (!session || !track) return;
    try {
      session.dispatch({ kind: "replaceTrackEffects", trackId, expected: track.mix.effects,
        effects, at: Date.now() });
      setProjectsError("");
    } catch (cause) {
      setProjectsError(cause instanceof Error ? cause.message : "No se pudo guardar la cadena de efectos");
    }
  };

  const commitMasterEffects = (effects: readonly ProjectEffect[]) => {
    const session = projectSessionRef.current;
    if (!session) return;
    try {
      session.dispatch({ kind: "replaceMasterEffects",
        expected: session.getSnapshot().document.mix.masterEffects,
        effects, at: Date.now() });
      setProjectsError("");
    } catch (cause) {
      setProjectsError(cause instanceof Error ? cause.message : "No se pudo guardar la cadena master");
    }
  };

  const createProjectBus = (name: string) => {
    try {
      projectSessionRef.current?.dispatch({ kind: "createTrack", at: Date.now(),
        track: { id: crypto.randomUUID(), name, kind: "bus", mix: {
          gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
          sends: [], effects: [],
        } } });
      setProjectsError("");
    } catch (cause) {
      setProjectsError(cause instanceof Error ? cause.message : "No se pudo crear el bus");
    }
  };

  const removeProjectBus = (trackId: string) => {
    try {
      projectSessionRef.current?.dispatch({ kind: "removeTrack", trackId, at: Date.now() });
      setProjectsError("");
    } catch (cause) {
      setProjectsError(cause instanceof Error ? cause.message : "No se pudo quitar el bus");
    }
  };

  const createBusResampleDestination = () => {
    try {
      const document = projectSessionRef.current?.getSnapshot().document;
      if (!document) throw new Error("Abre un proyecto antes de crear la pista destino");
      const index = document.tracks.filter((track) => track.kind === "audio").length + 1;
      projectSessionRef.current?.dispatch({ kind: "createTrack", at: Date.now(),
        track: { id: crypto.randomUUID(), name: `Resample ${index}`, kind: "audio", mix: {
          gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
          sends: [], effects: [],
        } } });
      setBusResampleNotice("Pista destino creada. Elige el bus y renderiza cuando esté listo.");
    } catch (cause) {
      setBusResampleNotice(cause instanceof Error ? cause.message : "No se pudo crear la pista destino");
    }
  };

  const resampleProjectBus = async (request: ProjectBusResampleRequest) => {
    if (busResampleAbortRef.current) return;
    const session = projectSessionRef.current;
    if (!session) { setBusResampleNotice("Abre un proyecto antes de resamplear un bus."); return; }
    const controller = new AbortController();
    busResampleAbortRef.current = controller;
    setBusResampleBusy(true);
    setBusResampleProgress(null);
    setBusResampleNotice("Guardando la revisión fuente…");
    try {
      const revision = await session.save();
      if (projectSessionRef.current !== session) throw new Error("El proyecto activo cambió durante el resampling");
      const assetId = crypto.randomUUID();
      const rendered = await renderProjectBusPcm(revision, { ...request, assetId,
        seed: `${revision.hash}:${request.sourceBusTrackId}:${request.startTick}:${request.endTick}`,
      }, projectRepository, controller.signal, (progress) => setBusResampleProgress(progress));
      if (projectSessionRef.current !== session) throw new Error("El proyecto activo cambió antes de instalar el WAV");
      await installBusResample(projectRepository, session, { ...rendered,
        takeId: crypto.randomUUID(), clipId: crypto.randomUUID(), at: Date.now() });
      setBusResampleNotice(`WAV instalado: ${rendered.provenance.frameCount.toLocaleString("es-CO")} frames · ${rendered.asset.sha256.slice(0, 12)}…`);
      await refreshProjects();
    } catch (cause) {
      setBusResampleNotice(controller.signal.aborted ? "Resampling cancelado; no se instaló ningún clip."
        : cause instanceof Error ? cause.message : "No se pudo resamplear el bus");
    } finally {
      if (busResampleAbortRef.current === controller) busResampleAbortRef.current = null;
      setBusResampleBusy(false);
      setBusResampleProgress(null);
    }
  };

  const visibleProjectMeters = (referenceStudioOpen || workspace === "mixer")
    ? engine.projectPlaybackSnapshot()?.audio : undefined;
  const trackMeters = visibleProjectMeters && Object.fromEntries(visibleProjectMeters.tracks.map((track) =>
    [track.trackId, track.meter]));
  const automationTargets: readonly BaseAutomationTarget[] = projectView ? [
    { scope: "master", parameterId: "masterGainDb" },
    ...projectView.document.tracks.flatMap((track): BaseAutomationTarget[] => [
      { scope: "track", ownerId: track.id, parameterId: "gainDb" },
      { scope: "track", ownerId: track.id, parameterId: "pan" },
    ]),
  ] : [];
  const effectiveAutomationValues = workspace === "automation"
    ? engine.projectAutomationSnapshot() : undefined;

  return (
    <div className={screen === "studio" && referenceStudioOpen ? "piano-app piano-app--reference" : "piano-app"}>
      <header className="piano-app__header">
        <div className="piano-app__brand"><span className="piano-app__brand-mark">♪</span><div><strong>Piano MIDI Pro</strong><small>Studio para SMK-37 y MIDI</small></div></div>
        <nav className="piano-app__nav" aria-label="Secciones principales">
          {([["studio", "Studio"], ["tracks", "Pistas"], ["settings", "Configuración"]] as const).map(([id, label]) => (
            <button key={id} type="button" className={screen === id ? "is-active" : ""}
              aria-current={screen === id ? "page" : undefined} onClick={() => {
                setScreen(id);
                if (id === "settings") setObservations(monitor.snapshot());
                if (id === "settings") void refreshStorageHealth();
                if (id === "tracks") void refreshProjects();
              }}>{label}</button>
          ))}
        </nav>
        <div className="piano-app__status" role="status"><span className={midiListening ? "is-connected" : ""} />{liveMidiStatus}</div>
      </header>

      <main className="piano-app__main">
        {screen === "studio" && referenceStudioOpen && <ReferenceStudio
          key={projectView?.document.id ?? "empty-project"}
          document={projectView?.document ?? null}
          workspace={workspace}
          loopEnabled={studioLoopEnabled}
          loopStartBar={studioLoopStartBar}
          loopEndBar={studioLoopEndBar}
          onLoopChange={(enabled) => {
            const range = enabled && projectView
              ? studioLoopBarRange(projectView.document.meterMap, studioLoopStartBar, studioLoopEndBar)
              : null;
            engine.setProjectLoopRange(range);
            setStudioLoopEnabled(enabled);
            if(range) setStudioPendingSeek((current)=>
              current !== null && current >= range.endTick ? range.startTick : current);
            setProjectTick(engine.projectTransportTick() ?? projectTick);
          }}
          onLoopRangeChange={(startBar,endBar)=>{
            const range = projectView
              ? studioLoopBarRange(projectView.document.meterMap,startBar,endBar) : null;
            if(studioLoopEnabled) engine.setProjectLoopRange(range);
            setStudioLoopStartBar(startBar);
            setStudioLoopEndBar(endBar);
            if(range && studioLoopEnabled) setStudioPendingSeek((current)=>
              current!==null && current>=range.endTick ? range.startTick : current);
            setProjectTick(engine.projectTransportTick() ?? projectTick);
          }}
          onSeekTick={(requested) => {
            const range = studioLoopEnabled && projectView
              ? studioLoopBarRange(projectView.document.meterMap,studioLoopStartBar,studioLoopEndBar)
              : null;
            const tick = range && requested >= range.endTick
              ? range.startTick : requested;
            if (engine.projectPlaybackSnapshot()) {
              engine.seekProjectPlayback(tick);
              setStudioPendingSeek(null);
            } else {
              setStudioPendingSeek(tick);
            }
            setProjectTick(tick);
          }}
          onArrangementCommand={(command) => {
            if (!projectSessionRef.current) throw new Error("Abre un proyecto para editar el arreglo");
            projectSessionRef.current.dispatch(command);
          }}
          onMacroChange={(trackId, macro, value) => {
            const session = projectSessionRef.current;
            const track = session?.getSnapshot().document.tracks.find((item)=>item.id===trackId);
            if(!session || !track) throw new Error("Selecciona una pista para editar sus efectos");
            // Do not swallow CAS/validation errors: the visible macro must not
            // silently claim that a processor was saved when it was rejected.
            const effects = applyStudioMacro(track.mix.effects, trackId, macro, value);
            session.dispatch({kind:"replaceTrackEffects",trackId,
              expected:track.mix.effects,effects,at:Date.now()});
            setProjectsError("");
          }}
          activeTrackId={studioSelectedTrackId ?? projectTrack?.id}
          saveStatus={projectView?.status ?? "none"}
          problem={projectView?.error || projectsError || instrumentError || midiError || undefined}
          loadingLabel={projectSwitching ? "Abriendo proyecto…" :
            projectAudioPreparing ? "Preparando audio del proyecto…" :
            loadingInstrumentId ? "Cargando instrumento…" : undefined}
          onRetrySave={() => {
            void projectSessionRef.current?.save().catch((cause:unknown)=>{
              setProjectsError(cause instanceof Error?cause.message:"No se pudo reintentar el guardado");
            });
          }}
          transport={projectTransport}
          tick={projectTick}
          bpm={visibleProjectBpm || String(bpm)}
          metronome={metronomeOn}
          recording={recording}
          midiConnected={midiListening}
          midiStatus={liveMidiStatus}
          outputLatencyEstimateMs={engine.outputBufferLatencyEstimateMs()}
          instrumentName={getInstrument(activeInstrumentId)?.engineId === "salamander"
            ? "Piano de concierto" : getInstrument(activeInstrumentId)?.label ?? "Instrumento"}
          instrumentCategory={getInstrument(activeInstrumentId)?.engineId === "salamander"
            ? "Gran Piano Clásico" : getInstrument(activeInstrumentId)?.category ?? "Seleccionar instrumento"}
          masterLevel={visibleProjectMeters?.masterMeter}
          trackLevels={trackMeters}
          onWorkspace={(id) => setWorkspace(id)}
          onLibrary={() => { setWorkspace("performance"); setReferenceStudioOpen(false); }}
          onProjects={() => { setScreen("tracks"); void refreshProjects(); }}
          onSettings={() => { setScreen("settings"); setObservations(monitor.snapshot()); void refreshStorageHealth(); }}
          onNew={() => { void createProject("Proyecto sin título").catch((cause: unknown) =>
            setProjectsError(cause instanceof Error ? cause.message : "No se pudo crear el proyecto")); }}
          onPlay={() => { void toggleProjectPlayback(); }}
          onStop={stopProjectPlayback}
          onRecord={() => { if (recording) void stopRecording(); else startRecording(); }}
          onMetronome={() => { const next = !metronomeOn; setMetronomeOn(next);
            void engine.setMetronome({ enabled: next, bpm }); }}
          onTempoDraft={setProjectBpmDraft}
          onTempoCommit={commitProjectBpm}
          onTrackSelect={(track) => {
            setStudioSelectedTrackId(track.id);
            if(track.kind==="instrument" || track.kind==="drum") {
              setEditorTrackId(track.id);
              setEditorPatternId(null);
            }
          }}
          onOpenPattern={(trackId, patternId) => {
            setStudioSelectedTrackId(trackId);
            setEditorTrackId(trackId); setEditorPatternId(patternId); setWorkspace("piano-roll");
          }}
          onTrackMix={commitTrackMix}
          onTrackInstrumentChange={(trackId,instrumentId)=>{
            const session=projectSessionRef.current;
            const track=session?.getSnapshot().document.tracks.find((item)=>item.id===trackId);
            if(!session || !track || track.kind!=="instrument") {
              throw new Error("Selecciona una pista de instrumento válida");
            }
            const bank=instrumentId==="salamander-grand" ? PROJECT_PIANO_INSTRUMENT
              : instrumentId==="tr808-fischer-core" ? PROJECT_808_INSTRUMENT : null;
            if(!bank)throw new RangeError("Banco de proyecto no autorizado o aún no instalado");
            if(track.instrument?.instrumentId===bank.instrumentId &&
               track.instrument.packageVersion===bank.packageVersion &&
               track.instrument.presetId===bank.presetId) return;
            session.dispatch({kind:"replaceTrackInstrument",trackId,expected:track.instrument,
              instrument:bank,at:Date.now()});
            setProjectsError("");
          }}
          onUndo={() => {
            try {projectSessionRef.current?.undo();setProjectsError("");}
            catch(error){setProjectsError(error instanceof Error?error.message:"No se pudo deshacer");}
          }}
          onRedo={() => {
            try {projectSessionRef.current?.redo();setProjectsError("");}
            catch(error){setProjectsError(error instanceof Error?error.message:"No se pudo rehacer");}
          }}
          canUndo={projectView?.canUndo ?? false}
          canRedo={projectView?.canRedo ?? false}
          onMasterGain={(gainDb) => {
            if (projectView) commitMasterMix({ ...projectView.document.mix, masterGainDb: gainDb });
          }}
          onFullEditor={() => setReferenceStudioOpen(false)}
          onFullMixer={() => { setWorkspace("mixer"); setReferenceStudioOpen(false); }}
          notationPanel={<StudioScore pattern={projectPattern} meter={projectView?.document.meterMap[0]}
            onOpenEditor={()=>{setWorkspace("piano-roll");setReferenceStudioOpen(false);}} />}
          recordingPanel={projectView && projectTrack && projectPattern ? (
            <RecordedOverdubPanel key={`${projectView.document.id}:${projectTrack.id}:${projectPattern.id}`}
                document={projectView.document} trackId={projectTrack.id} patternId={projectPattern.id}
                projectStartTick={projectTick}
                startTickForTake={(recordingId) => savedOverdubTarget?.projectId === projectView.document.id &&
                  savedOverdubTarget.trackId === projectTrack.id &&
                  savedOverdubTarget.recordingId === recordingId
                  ? savedOverdubTarget.startTick : projectTick}
                activeSceneId={projectLauncher?.activeSceneId} recording={recording || unsavedRecording}
                takes={takes}
                onLoadTake={(recordingId) => convertRecordedTake(library, recordingId, {
                  patternId: crypto.randomUUID(), patternName: "Toma MIDI para overdub",
                })}
                onCommit={(request) => commitRecordedOverdub(projectView.document.id, request)} />
          ) : <div className="ref-takes-empty">
            <strong>Selecciona un patrón MIDI</strong>
            <p>Abre un proyecto y selecciona una pista con patrón para añadir una toma propia.</p>
          </div>}
          unsavedRecording={unsavedRecording}
          onRetryRecordingSave={()=>{void saveUnsavedRecording();}}
          onExportRecording={exportLatest}
          performancePanel={<div className="ref-performance" aria-label="Teclado interactivo de 37 teclas">
            <div className="ref-performance-toolbar">
              <button type="button" onClick={() => {
                const next = Math.max(MIN_MIDI, rangeStart - 12);
                latestRef.current.rangeStart = next;
                setRangeStart(next);
                engine.setVisibleRangeStart(next);
              }} aria-label="Octava anterior">− Octava</button>
              <span>{midiToLabel(visibleNotes[0]!)} – {midiToLabel(visibleNotes[KEY_COUNT-1]!)}</span>
              <button type="button" onClick={() => {
                const next = Math.min(MAX_MIDI - KEY_COUNT + 1, rangeStart + 12);
                latestRef.current.rangeStart = next;
                setRangeStart(next);
                engine.setVisibleRangeStart(next);
              }} aria-label="Octava siguiente">+ Octava</button>
              <span className="ref-performance-hint">Toca con ratón, pantalla o MIDI</span>
            </div>
            <div className="ref-performance-keys" role="group" aria-label="Piano virtual">
              <PianoKeyboard visibleNotes={visibleNotes}
                activeNoteVelocitiesRef={activeVelocityRef}
                showNoteNames={showNoteNames} keyFxColor="#8b5cf6" keyFxGlow={0.55}
                onKeyMouseDown={(note) => {
                  if (mouseHeldRef.current.has(note)) return;
                  mouseHeldRef.current.add(note);
                  pressVirtual("mouse",note,String(note));
                }}
                onKeyMouseUp={(note) => {
                  if (!mouseHeldRef.current.delete(note)) return;
                  releaseVirtual("mouse",note,String(note));
                }} />
            </div>
            <div className="ref-performance-pedals" role="group" aria-label="Pedales virtuales">
              {([["unaCorda","Una corda"],["sostenuto","Sostenuto"],["sustain","Sustain"]] as const)
                .map(([id,label])=><button key={id} type="button" aria-pressed={pedals[id]}
                  onPointerDown={()=>setPedal(id,true,"studio")}
                  onPointerUp={()=>setPedal(id,false,"studio")}
                  onPointerCancel={()=>setPedal(id,false,"studio")}
                  onPointerLeave={()=>{if(pedals[id])setPedal(id,false,"studio");}}>
                  {label}
                </button>)}
            </div>
          </div>}
          instrumentPicker={<InstrumentBrowser initialOpen activeId={activeInstrumentId} loadingId={loadingInstrumentId}
              loadingProgress={instrumentLoadingProgress} onCancel={cancelInstrumentLoad}
              failedId={failedInstrumentId} error={instrumentError} notice={instrumentNotice}
              onSelect={(id) => { void chooseInstrument(id); }} />}
          editor={workspace === "drums" && drumPattern ? (<DrumMachine pattern={drumPattern} pads={drumPads} document={projectView?.document}
              track={drumTrack} padStatuses={drumTrack?.drumRack &&
                preparedProjectDocument === projectView?.document
                ? engine.projectPadStatus(drumTrack.id) : undefined}
              sourceOptions={drumSourceOptions} projectName={projectView?.document.name}
              trackName={drumTrack?.name} meter={projectView?.document.meterMap[0]}
              saveState={projectView?.status} externalError={projectView?.error ?? undefined}
              onCommand={(command: ProjectCommand) => {
                if (!projectSessionRef.current) throw new Error("Abre un proyecto antes de editar batería");
                projectSessionRef.current.dispatch(command);
              }}
              onUndo={() => { projectSessionRef.current?.undo(); }}
              onRedo={() => { projectSessionRef.current?.redo(); }}
              canUndo={projectView?.canUndo} canRedo={projectView?.canRedo}
              onPreviewPad={(pad, ownerId) => {
                const padNote = pad.midiNote;
                if (!drumTrack || padNote === null || !projectView) return;
                const projectId = projectView.document.id;
                const owner = `preview/${ownerId}`;
                void (async () => {
                  if (!(await prepareProjectAudio()) ||
                      projectSessionRef.current?.getSnapshot().document.id !== projectId) return;
                  const played = await engine.previewProjectPad(drumTrack.id, padNote, 0.78, owner);
                  if (played) releaseProjectPreviewLater(owner, 600);
                  else setProjectAudioStatus("No se pudo escuchar este pad.");
                })().catch((cause: unknown) => setProjectAudioStatus(cause instanceof Error
                  ? cause.message : "Falló la preescucha del pad"));
              }} onPreviewRackPad={(pad, ownerId) => {
                if (!drumTrack || !projectView) return;
                const projectId = projectView.document.id;
                const owner = `preview/${ownerId}`;
                void (async () => {
                  if (!(await prepareProjectAudio()) ||
                      projectSessionRef.current?.getSnapshot().document.id !== projectId) return;
                  const played = await engine.previewProjectRackPad(drumTrack.id, pad.id, 0.78, owner);
                  if (played) releaseProjectPreviewLater(owner, 600);
                  else setProjectAudioStatus("No se pudo escuchar este pad.");
                })().catch((cause: unknown) => setProjectAudioStatus(cause instanceof Error
                  ? cause.message : "Falló la preescucha del pad"));
              }} />) :
            workspace === "mixer" && projectView ? (<ProjectMixer document={projectView.document}
            meter={trackMeters} masterMeter={visibleProjectMeters?.masterMeter}
            onTrackMix={commitTrackMix} onMasterMix={commitMasterMix}
            onTrackEffects={commitTrackEffects} onMasterEffects={commitMasterEffects}
            onCreateBus={createProjectBus} onRemoveBus={removeProjectBus}
            onUndo={() => { projectSessionRef.current?.undo(); }}
            onRedo={() => { projectSessionRef.current?.redo(); }}
            canUndo={projectView.canUndo} canRedo={projectView.canRedo} />) : 
            workspace === "automation" && projectView ? (<AutomationEditor
            document={projectView.document} readPlaybackReady={true}
            availableTargets={automationTargets} effectiveValues={effectiveAutomationValues}
            playheadTick={projectTick} readPlayheadTick={readProjectTick}
            saveState={projectView.status}
            onCommand={(command) => commitAutomationEdit((session) => session.dispatch(command))}
            onUndo={() => commitAutomationEdit((session) => session.undo())}
            onRedo={() => commitAutomationEdit((session) => session.redo())}
            canUndo={projectView.canUndo} canRedo={projectView.canRedo} />) : 
            workspace === "export" && projectView ? (<ProjectExportPanel busy={exportingWav}
            progress={wavExportProgress} notice={wavExportNotice}
            onExport={(options) => { void exportActiveProjectWav(options); }}
            onCancel={() => wavExportAbortRef.current?.abort()} />) : 
            workspace === "arrangement" && projectView ? (<Arrangement document={projectView?.document ?? null}
            playheadTick={projectTick} readPlayheadTick={readProjectTick} saveState={projectView?.status}
            onLaunchScene={launchProjectScene} onStopScene={stopProjectScene}
            activeSceneId={projectLauncher?.activeSceneId}
            queuedSceneId={projectLauncher?.queuedSceneId}
            queuedStartTick={projectLauncher?.queuedStartTick}
            performedSceneSegments={projectLauncher?.performedSceneSegments}
            performanceRevision={projectLauncher?.performanceRevision}
            onPerformanceCaptured={() => {
              engine.clearProjectPerformedSceneSegments();
              refreshProjectLauncher();
            }}
            externalError={projectView?.error ?? undefined}
            onCommand={(command: ProjectCommand) => {
              if (!projectSessionRef.current) throw new Error("Abre un proyecto antes de editar el arreglo");
              projectSessionRef.current.dispatch(command);
            }}
            onUndo={() => { projectSessionRef.current?.undo(); }}
            onRedo={() => { projectSessionRef.current?.redo(); }}
            canUndo={projectView?.canUndo} canRedo={projectView?.canRedo}
            onOpenPattern={(patternId, trackId) => {
              setEditorTrackId(trackId);
              setEditorPatternId(patternId);
              setWorkspace(trackId === drumTrack?.id ? "drums" : "piano-roll");
            }} />) : 
            projectView ? (<PianoRoll pattern={projectPattern} projectName={projectView?.document.name}
            trackName={projectTrack?.name} meter={projectView?.document.meterMap[0]}
            ghostPatterns={rollVisuals.ghostPatterns} allowedPadTriggers={rollVisuals.padTriggers}
            padNames={rollVisuals.padNames}
            captureOverlay={captureOverlay}
            playheadTick={projectTick} readPlayheadTick={readProjectTick}
            saveState={projectView?.status} externalError={projectView?.error ?? undefined}
            onCommand={(command: ProjectCommand) => {
              if (!projectSessionRef.current) throw new Error("Abre un proyecto antes de editar notas");
              projectSessionRef.current.dispatch(command);
            }}
            onUndo={() => { projectSessionRef.current?.undo(); }}
            onRedo={() => { projectSessionRef.current?.redo(); }}
            canUndo={projectView?.canUndo} canRedo={projectView?.canRedo}
            onPreviewNote={(note, ownerId) => {
              if (!projectTrack || !projectView) return;
              const trackId = projectTrack.id;
              const projectId = projectView.document.id;
              const owner = `preview/${ownerId}`;
              void (async () => {
                if (!(await prepareProjectAudio()) ||
                    projectSessionRef.current?.getSnapshot().document.id !== projectId) return;
                const pad = projectTrack.drumRack?.pads.find((entry) =>
                  entry.midiNote === note.pitch && entry.channel === note.channel);
                const played = pad ? await engine.previewProjectRackPad(trackId, pad.id,
                  note.velocity / 127, owner) : projectTrack.kind === "drum"
                  ? await engine.previewProjectPad(trackId, note.pitch, note.velocity / 127, owner)
                  : projectTrack.instrument?.instrumentId === "user-sampler"
                    ? await engine.previewProjectSample(trackId, note.pitch, note.velocity / 127, owner)
                    : await engine.previewProjectNote(trackId, note.pitch, note.velocity / 127, owner);
                if (!played) { setProjectAudioStatus("No se pudo escuchar la nota seleccionada."); return; }
                const clock = new MusicalClock(projectView.document.tempoMap, projectView.document.meterMap);
                const durationMs = Math.max(120, Math.min(2500, Math.round(clock.secondsBetween(
                  note.startTick, note.startTick + note.durationTick) * 1000)));
                releaseProjectPreviewLater(owner, durationMs);
              })().catch((cause: unknown) => setProjectAudioStatus(cause instanceof Error
                ? cause.message : "Falló la preescucha de la nota"));
            }} />) : (
            <div className="ref-editor-empty"><strong>Tu piano roll está listo</strong>
              <span>Abre o crea un proyecto para comenzar a componer.</span>
              <button type="button" onClick={() => {
                void createProject("Proyecto sin título").catch((cause: unknown) =>
                  setProjectsError(cause instanceof Error ? cause.message : "No se pudo crear el proyecto"));
              }}>Nuevo proyecto</button>
            </div>
          )}
        />}
        {screen === "studio" && !referenceStudioOpen && <div className="piano-app__studio">
          <div className="piano-app__reference-return">
            <button type="button" onClick={() => setReferenceStudioOpen(true)}>← Volver al nuevo Studio</button>
          </div>
          <div className="piano-app__hero">
            <div><p className="piano-app__eyebrow">Instrumento en vivo</p><h1>Studio</h1>
              <p>Toca con el SMK-37, un controlador MIDI o el teclado en pantalla.</p></div>
            <button type="button" className="piano-app__primary" onClick={() => {
              void engine.initialize().then((ready) => setAudioStatus(ready ? "Audio activo" : "No se pudo activar el audio"))
                .catch((error: unknown) => setAudioStatus(error instanceof Error ? error.message : "Error de audio"));
            }}>Activar audio</button>
          </div>
          {(midiError || audioStatus !== "Audio listo al tocar") && <p className="piano-app__feedback" role="status">{midiError || audioStatus}</p>}
          <section className="piano-app__project-bar" aria-label="Proyecto de Beatmaker">
            <div><p className="piano-app__eyebrow">Proyecto</p><h2>{projectView?.document.name ?? "Comienza un proyecto propio"}</h2>
              <p>{projectView ? `Revisión ${projectView.revision} · ${projectView.status === "clean" ? "Guardado" :
                projectView.status === "pending" ? "Pendiente de guardar" : projectView.status === "saving" ? "Guardando…" :
                  projectView.status === "conflict" ? "Conflicto de guardado" : "Error al guardar"}`
                : "Crea un proyecto para dibujar notas y guardar tus ediciones."}</p></div>
            {projectView && <label className="piano-app__project-tempo">Tempo inicial del proyecto
              <input aria-label="Tempo inicial del proyecto" type="number" inputMode="numeric" min="30" max="300"
                disabled={pendingAudioTake || audioInputSnapshot?.state === "starting" ||
                  audioInputSnapshot?.state === "recording" || audioInputSnapshot?.state === "stopping"}
                value={visibleProjectBpm} onChange={(event) => setProjectBpmDraft(event.target.value)}
                onBlur={commitProjectBpm} onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }} /> BPM
              <small>Transporte: {projectTransport} · tick {projectTick}</small>
            </label>}
            <div className="piano-app__project-actions">
              <button type="button" onClick={() => { void createProject("Proyecto sin título").catch((cause: unknown) =>
                setProjectsError(cause instanceof Error ? cause.message : "No se pudo crear el proyecto")); }}
                disabled={projectSwitching}>Nuevo proyecto</button>
              {projectView && <button type="button" onClick={() => { void toggleProjectPlayback(); }}
                disabled={projectAudioPreparing}>{projectAudioPreparing ? "Cargando audio…" :
                  projectTransport === "playing" ? "Pausar" : projectTransport === "paused" ? "Continuar" : "Reproducir"}</button>}
              {projectView && <button type="button" onClick={stopProjectPlayback}
                disabled={projectTransport === "stopped"}>Detener</button>}
              <button type="button" onClick={() => setWorkspace("performance")}
                aria-pressed={workspace === "performance"}>Interpretar</button>
              <button type="button" onClick={() => setWorkspace("piano-roll")}
                aria-pressed={workspace === "piano-roll"} disabled={!projectView}>Piano roll</button>
              <button type="button" onClick={() => setWorkspace("drums")}
                aria-pressed={workspace === "drums"} disabled={!drumPattern}>Batería</button>
              <button type="button" onClick={() => setWorkspace("arrangement")}
                aria-pressed={workspace === "arrangement"} disabled={!projectView}>Arreglo</button>
              <button type="button" onClick={() => setWorkspace("sampler")}
                aria-pressed={workspace === "sampler"} disabled={!projectView}>Sampler</button>
              <button type="button" onClick={() => setWorkspace("audio")}
                aria-pressed={workspace === "audio"} disabled={!projectView}>Grabar audio</button>
              <button type="button" onClick={() => setWorkspace("mixer")}
                aria-pressed={workspace === "mixer"} disabled={!projectView}>Mezclador</button>
              <button type="button" onClick={() => setWorkspace("automation")}
                aria-pressed={workspace === "automation"} disabled={!projectView}>Automatización</button>
              <button type="button" onClick={() => setWorkspace("export")}
                aria-pressed={workspace === "export"} disabled={!projectView}>Exportar audio</button>
              {projectView && <button type="button" onClick={() => { void exportActiveProjectMidi(); }}
                disabled={exportingMidi}>{exportingMidi ? "Exportando MIDI…" : "Exportar MIDI"}</button>}
              <button type="button" onClick={() => { setScreen("tracks"); void refreshProjects(); }}>Ver proyectos</button>
              {projectView && (projectView.status === "pending" || projectView.status === "error") &&
                <button type="button" onClick={() => {
                  void projectSessionRef.current?.retrySave().then(() => refreshProjects()).catch((cause: unknown) =>
                    setProjectsError(cause instanceof Error ? cause.message : "No se pudo guardar el proyecto"));
                }}>{projectView.status === "error" ? "Reintentar guardado" : "Guardar ahora"}</button>}
              {projectView?.status === "conflict" && <button type="button" onClick={() => {
                void saveActiveProjectAsCopy().catch((cause: unknown) =>
                  setProjectsError(cause instanceof Error ? cause.message : "No se pudo guardar la copia"));
              }}>Guardar cambios como copia</button>}
            </div>
            {projectView?.error && <p className="piano-app__project-error" role="alert">{projectView.error}</p>}
            {projectView?.draftStatus === "error" && <p className="piano-app__project-error" role="alert">
              Journal de recuperación: {projectView.draftError}</p>}
            {projectsError && <p className="piano-app__project-error" role="alert">{projectsError}</p>}
            {projectAudioStatus && <p className="piano-app__project-audio-status" role="status">{projectAudioStatus}</p>}
            {takeImportNotice && <p className="piano-app__project-audio-status" role="status">{takeImportNotice}</p>}
            {midiExportNotice && <p className="piano-app__project-audio-status" role="status">{midiExportNotice}</p>}
            {sampleNotice && <p className="piano-app__project-audio-status" role="status">{sampleNotice}</p>}
            {projectView && <ProjectAssetRepairPanel assets={projectView.document.assets}
              statuses={projectAssetStatuses} busyAssetId={projectAssetBusyId}
              notice={projectAssetNotice} onRelocate={(assetId, file) => {
                void repairProjectAsset(assetId, file);
              }} />}
          </section>
          {workspace === "piano-roll" && <>
            {rollTracks.length > 1 && <label className="piano-app__track-picker">Pista MIDI
              <select aria-label="Pista del piano roll" value={projectTrack?.id ?? ""}
                onChange={(event) => { setEditorTrackId(event.target.value); setEditorPatternId(null); }}>
                {rollTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
              </select>
            </label>}
            <PianoRoll pattern={projectPattern} projectName={projectView?.document.name}
            trackName={projectTrack?.name} meter={projectView?.document.meterMap[0]}
            ghostPatterns={rollVisuals.ghostPatterns} allowedPadTriggers={rollVisuals.padTriggers}
            padNames={rollVisuals.padNames}
            captureOverlay={captureOverlay}
            playheadTick={projectTick} readPlayheadTick={readProjectTick}
            saveState={projectView?.status} externalError={projectView?.error ?? undefined}
            onCommand={(command: ProjectCommand) => {
              if (!projectSessionRef.current) throw new Error("Abre un proyecto antes de editar notas");
              projectSessionRef.current.dispatch(command);
            }}
            onUndo={() => { projectSessionRef.current?.undo(); }}
            onRedo={() => { projectSessionRef.current?.redo(); }}
            canUndo={projectView?.canUndo} canRedo={projectView?.canRedo}
            onPreviewNote={(note, ownerId) => {
              if (!projectTrack || !projectView) return;
              const trackId = projectTrack.id;
              const projectId = projectView.document.id;
              const owner = `preview/${ownerId}`;
              void (async () => {
                if (!(await prepareProjectAudio()) ||
                    projectSessionRef.current?.getSnapshot().document.id !== projectId) return;
                const pad = projectTrack.drumRack?.pads.find((entry) =>
                  entry.midiNote === note.pitch && entry.channel === note.channel);
                const played = pad ? await engine.previewProjectRackPad(trackId, pad.id,
                  note.velocity / 127, owner) : projectTrack.kind === "drum"
                  ? await engine.previewProjectPad(trackId, note.pitch, note.velocity / 127, owner)
                  : projectTrack.instrument?.instrumentId === "user-sampler"
                    ? await engine.previewProjectSample(trackId, note.pitch, note.velocity / 127, owner)
                    : await engine.previewProjectNote(trackId, note.pitch, note.velocity / 127, owner);
                if (!played) { setProjectAudioStatus("No se pudo escuchar la nota seleccionada."); return; }
                const clock = new MusicalClock(projectView.document.tempoMap, projectView.document.meterMap);
                const durationMs = Math.max(120, Math.min(2500, Math.round(clock.secondsBetween(
                  note.startTick, note.startTick + note.durationTick) * 1000)));
                releaseProjectPreviewLater(owner, durationMs);
              })().catch((cause: unknown) => setProjectAudioStatus(cause instanceof Error
                ? cause.message : "Falló la preescucha de la nota"));
            }} />
            {projectView && projectTrack?.kind === "instrument" && !projectTrack.drumRack && projectPattern &&
              <RecordedOverdubPanel key={`${projectView.document.id}:${projectTrack.id}:${projectPattern.id}`}
                document={projectView.document} trackId={projectTrack.id} patternId={projectPattern.id}
                projectStartTick={projectTick}
                startTickForTake={(recordingId) => savedOverdubTarget?.projectId === projectView.document.id &&
                  savedOverdubTarget.trackId === projectTrack.id &&
                  savedOverdubTarget.recordingId === recordingId
                  ? savedOverdubTarget.startTick : projectTick}
                activeSceneId={projectLauncher?.activeSceneId} recording={recording || unsavedRecording}
                takes={takes}
                onLoadTake={(recordingId) => convertRecordedTake(library, recordingId, {
                  patternId: crypto.randomUUID(), patternName: "Toma MIDI para overdub",
                })}
                onCommit={(request) => commitRecordedOverdub(projectView.document.id, request)} />}
          </>}
          {workspace === "drums" && <>
            <div className="piano-app__drum-setup">
              <span>{drumTrack?.drumRack
                ? "Rack de 16 pads · TR-808, Virtuosity y FreePats grabados · fuentes propias opcionales"
                : "Kit grabado Virtuosity · 5 piezas disponibles · 11 pads sin fuente"}</span>
              <button type="button" onClick={() => { void prepareProjectAudio(); }} disabled={projectAudioPreparing}>
                {projectAudioPreparing ? "Cargando muestras…" : "Preparar batería"}
              </button>
            </div>
            <DrumMachine pattern={drumPattern} pads={drumPads} document={projectView?.document}
              track={drumTrack} padStatuses={drumTrack?.drumRack &&
                preparedProjectDocument === projectView?.document
                ? engine.projectPadStatus(drumTrack.id) : undefined}
              sourceOptions={drumSourceOptions} projectName={projectView?.document.name}
              trackName={drumTrack?.name} meter={projectView?.document.meterMap[0]}
              saveState={projectView?.status} externalError={projectView?.error ?? undefined}
              onCommand={(command: ProjectCommand) => {
                if (!projectSessionRef.current) throw new Error("Abre un proyecto antes de editar batería");
                projectSessionRef.current.dispatch(command);
              }}
              onUndo={() => { projectSessionRef.current?.undo(); }}
              onRedo={() => { projectSessionRef.current?.redo(); }}
              canUndo={projectView?.canUndo} canRedo={projectView?.canRedo}
              onPreviewPad={(pad, ownerId) => {
                const padNote = pad.midiNote;
                if (!drumTrack || padNote === null || !projectView) return;
                const projectId = projectView.document.id;
                const owner = `preview/${ownerId}`;
                void (async () => {
                  if (!(await prepareProjectAudio()) ||
                      projectSessionRef.current?.getSnapshot().document.id !== projectId) return;
                  const played = await engine.previewProjectPad(drumTrack.id, padNote, 0.78, owner);
                  if (played) releaseProjectPreviewLater(owner, 600);
                  else setProjectAudioStatus("No se pudo escuchar este pad.");
                })().catch((cause: unknown) => setProjectAudioStatus(cause instanceof Error
                  ? cause.message : "Falló la preescucha del pad"));
              }} onPreviewRackPad={(pad, ownerId) => {
                if (!drumTrack || !projectView) return;
                const projectId = projectView.document.id;
                const owner = `preview/${ownerId}`;
                void (async () => {
                  if (!(await prepareProjectAudio()) ||
                      projectSessionRef.current?.getSnapshot().document.id !== projectId) return;
                  const played = await engine.previewProjectRackPad(drumTrack.id, pad.id, 0.78, owner);
                  if (played) releaseProjectPreviewLater(owner, 600);
                  else setProjectAudioStatus("No se pudo escuchar este pad.");
                })().catch((cause: unknown) => setProjectAudioStatus(cause instanceof Error
                  ? cause.message : "Falló la preescucha del pad"));
              }} />
          </>}
          {workspace === "sampler" && <section className="piano-app__sample-setup" aria-label="Sampler de muestras propias">
            <div><h2>Sampler</h2><p>Añade un WAV u OGG propio de hasta 16 MiB y 96 segundos. El archivo queda en este navegador y se verifica con SHA-256.</p></div>
            {sampleTracks.length > 0 && <div className="piano-app__sample-existing">
              <label>Pista de muestra
                <select aria-label="Pista de muestra" value={selectedSampleTrack?.id ?? ""} onChange={(event) => {
                  setEditorTrackId(event.target.value);
                  setEditorPatternId(null);
                  setEditingSampleTrackId(null);
                  setSampleRegionDraft(null);
                }}>
                  {sampleTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
                </select>
              </label>
              <button type="button" onClick={beginEditingInstalledSample}>Editar región</button>
              <button type="button" onClick={() => {
                if (!selectedSampleTrack) return;
                setEditorTrackId(selectedSampleTrack.id);
                setEditorPatternId(null);
                setWorkspace("piano-roll");
              }}>Editar notas</button>
            </div>}
            <label className="piano-app__sample-file">Elegir muestra propia
              <input type="file" accept=".wav,.wave,.ogg,audio/wav,audio/ogg"
                disabled={sampleBusy || !projectView} onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void inspectUserSample(file);
                }} />
            </label>
            {editingSampleAsset && sampleRegionDraft && <>
              <p className="piano-app__sample-facts">{sampleDraft?.fileName ?? selectedSampleTrack?.name} · {editingSampleDuration.toFixed(2)} s · {editingSampleAsset.sampleRate} Hz · {editingSampleAsset.channelCount} canal(es)</p>
              <div className="piano-app__sample-grid">
                <label>Inicio (s)<input aria-label="Inicio de muestra" type="number" inputMode="decimal" min="0" step="0.001"
                  max={editingSampleDuration} value={sampleRegionDraft.startSeconds}
                  onChange={(event) => setSampleRegionDraft({ ...sampleRegionDraft, startSeconds: Number(event.target.value) })} /></label>
                <label>Fin (s)<input aria-label="Fin de muestra" type="number" inputMode="decimal" min="0" step="0.001"
                  max={editingSampleDuration} value={sampleRegionDraft.endSeconds}
                  onChange={(event) => setSampleRegionDraft({ ...sampleRegionDraft, endSeconds: Number(event.target.value) })} /></label>
                <label>Fade entrada (ms)<input aria-label="Fade de entrada" type="number" inputMode="numeric" min="0" step="1"
                  value={sampleRegionDraft.fadeInMs}
                  onChange={(event) => setSampleRegionDraft({ ...sampleRegionDraft, fadeInMs: Number(event.target.value) })} /></label>
                <label>Fade salida (ms)<input aria-label="Fade de salida" type="number" inputMode="numeric" min="0" step="1"
                  value={sampleRegionDraft.fadeOutMs}
                  onChange={(event) => setSampleRegionDraft({ ...sampleRegionDraft, fadeOutMs: Number(event.target.value) })} /></label>
                <label>Nota raíz MIDI<input aria-label="Nota raíz de muestra" type="number" inputMode="numeric" min="0" max="127" step="1"
                  value={sampleRegionDraft.rootMidi}
                  onChange={(event) => setSampleRegionDraft({ ...sampleRegionDraft, rootMidi: Number(event.target.value) })} /></label>
                <label>Afinación (cents)<input aria-label="Afinación de muestra" type="number" inputMode="numeric" min="-2400" max="2400" step="1"
                  value={sampleRegionDraft.cents}
                  onChange={(event) => setSampleRegionDraft({ ...sampleRegionDraft, cents: Number(event.target.value) })} /></label>
                <label>Reproducción<select aria-label="Modo de muestra" value={sampleRegionDraft.playMode}
                  onChange={(event) => setSampleRegionDraft({ ...sampleRegionDraft,
                    playMode: event.target.value as SampleRegionDraft["playMode"],
                    loopMode: event.target.value === "oneShot" ? "none" : sampleRegionDraft.loopMode })}>
                  <option value="oneShot">Un disparo</option><option value="gate">Mantener hasta Note Off</option>
                </select></label>
                <label>Loop<select aria-label="Loop de muestra" value={sampleRegionDraft.loopMode}
                  onChange={(event) => setSampleRegionDraft({ ...sampleRegionDraft,
                    loopMode: event.target.value as SampleRegionDraft["loopMode"],
                    playMode: event.target.value === "loop" ? "gate" : sampleRegionDraft.playMode })}>
                  <option value="none">Sin loop</option><option value="loop">Repetir región</option>
                </select></label>
                <label className="piano-app__sample-check"><input type="checkbox" checked={sampleRegionDraft.reverse}
                  onChange={(event) => setSampleRegionDraft({ ...sampleRegionDraft, reverse: event.target.checked })} /> Reversa</label>
              </div>
              <button type="button" className="piano-app__primary" disabled={sampleBusy} onClick={() => {
                void (sampleDraft ? installAnalyzedSample() : saveInstalledSampleRegion());
              }}>{sampleBusy ? "Guardando muestra…" : sampleDraft ? "Añadir pista de muestra" : "Guardar región"}</button>
            </>}
            {sampleDraft && <ProjectSampleSlicePanel key={sampleDraft.analysis.ref.id}
              fileName={sampleDraft.fileName} analysis={sampleDraft.analysis}
              rack={drumTrack?.drumRack ?? null} busy={sampleBusy}
              onInstall={(slices) => {
                if (!drumTrack?.drumRack) throw new Error("La pista de batería no tiene rack de pads");
                return installAnalyzedSampleSlices(drumTrack.id, drumTrack.drumRack, slices);
              }} />}
            {selectedSampleTrack?.instrument?.instrumentId === "user-sampler" &&
              <ProjectSampleVoicePanel key={`${selectedSampleTrack.id}:${JSON.stringify(selectedSampleTrack.instrument.sampleVoice)}`}
                value={selectedSampleTrack.instrument.sampleVoice} region={selectedSampleTrack.instrument.sampleRegion}
                busy={sampleBusy} onSave={(voice) => { void saveInstalledSampleVoice(selectedSampleTrack.id, voice); }} />}
            {selectedSampleTrack && <button type="button" onClick={() => {
              void (async () => {
                if (!(await prepareProjectAudio())) return;
                const played = await engine.previewProjectSample(selectedSampleTrack.id,
                  selectedSampleTrack.instrument?.sampleRegion?.rootMidi ?? 60, 0.8, `preview/sample/${selectedSampleTrack.id}`);
                if (!played) setSampleNotice("No se pudo escuchar esta muestra.");
              })().catch((cause: unknown) => setSampleNotice(cause instanceof Error
                ? cause.message : "Falló la preescucha de la muestra"));
            }}>Escuchar pista de muestra</button>}
          </section>}
          {workspace === "audio" && <>
            <AudioRecorderPanel snapshot={audioInputSnapshot} busy={audioCaptureBusy}
              notice={audioCaptureNotice} onArm={(channels) => { void armAudioInput(channels); }}
              onStart={(settings) => { void startAudioCapture(settings); }}
              onStop={() => { void stopAudioCapture(); }} onDisarm={disarmAudioInput}
              onMonitor={setAudioMonitor} />
            {projectView && <AudioTakeLatencyPanel document={projectView.document}
              busy={audioCaptureBusy} canUndo={projectView.canUndo}
              onSetOffset={setAudioTakeLatency}
              onUndo={() => { projectSessionRef.current?.undo(); }} />}
            {projectView && <ProjectBusResamplePanel document={projectView.document}
              busy={busResampleBusy} progress={busResampleProgress}
              notice={busResampleNotice} onCreateDestination={createBusResampleDestination}
              onRender={(request) => { void resampleProjectBus(request); }}
              onCancel={() => busResampleAbortRef.current?.abort()} />}
            {pendingAudioTake && <button type="button" className="piano-app__primary"
              disabled={audioCaptureBusy} onClick={() => { void savePendingAudioTake().catch(() => undefined); }}>
              Reintentar guardado de audio</button>}
          </>}
          {workspace === "mixer" && projectView && <ProjectMixer document={projectView.document}
            meter={trackMeters} masterMeter={visibleProjectMeters?.masterMeter}
            onTrackMix={commitTrackMix} onMasterMix={commitMasterMix}
            onTrackEffects={commitTrackEffects} onMasterEffects={commitMasterEffects}
            onCreateBus={createProjectBus} onRemoveBus={removeProjectBus}
            onUndo={() => { projectSessionRef.current?.undo(); }}
            onRedo={() => { projectSessionRef.current?.redo(); }}
            canUndo={projectView.canUndo} canRedo={projectView.canRedo} />}
          {workspace === "automation" && projectView && <AutomationEditor
            document={projectView.document} readPlaybackReady={true}
            availableTargets={automationTargets} effectiveValues={effectiveAutomationValues}
            playheadTick={projectTick} readPlayheadTick={readProjectTick}
            saveState={projectView.status}
            onCommand={(command) => commitAutomationEdit((session) => session.dispatch(command))}
            onUndo={() => commitAutomationEdit((session) => session.undo())}
            onRedo={() => commitAutomationEdit((session) => session.redo())}
            canUndo={projectView.canUndo} canRedo={projectView.canRedo} />}
          {workspace === "export" && projectView && <ProjectExportPanel busy={exportingWav}
            progress={wavExportProgress} notice={wavExportNotice}
            onExport={(options) => { void exportActiveProjectWav(options); }}
            onCancel={() => wavExportAbortRef.current?.abort()} />}
          {workspace === "arrangement" && <Arrangement document={projectView?.document ?? null}
            playheadTick={projectTick} readPlayheadTick={readProjectTick} saveState={projectView?.status}
            onLaunchScene={launchProjectScene} onStopScene={stopProjectScene}
            activeSceneId={projectLauncher?.activeSceneId}
            queuedSceneId={projectLauncher?.queuedSceneId}
            queuedStartTick={projectLauncher?.queuedStartTick}
            performedSceneSegments={projectLauncher?.performedSceneSegments}
            performanceRevision={projectLauncher?.performanceRevision}
            onPerformanceCaptured={() => {
              engine.clearProjectPerformedSceneSegments();
              refreshProjectLauncher();
            }}
            externalError={projectView?.error ?? undefined}
            onCommand={(command: ProjectCommand) => {
              if (!projectSessionRef.current) throw new Error("Abre un proyecto antes de editar el arreglo");
              projectSessionRef.current.dispatch(command);
            }}
            onUndo={() => { projectSessionRef.current?.undo(); }}
            onRedo={() => { projectSessionRef.current?.redo(); }}
            canUndo={projectView?.canUndo} canRedo={projectView?.canRedo}
            onOpenPattern={(patternId, trackId) => {
              setEditorTrackId(trackId);
              setEditorPatternId(patternId);
              setWorkspace(trackId === drumTrack?.id ? "drums" : "piano-roll");
            }} />}
          {workspace === "performance" && <>
          <div className="piano-app__toolbar">
            <div className="piano-app__toolbar-group"><span>Rango</span>
              <button type="button" aria-label="Octava anterior" onClick={() => setRangeStart(clamp(rangeStart - 12, MIN_MIDI, MAX_MIDI - KEY_COUNT + 1))}>−</button>
              <strong>{midiToLabel(rangeStart)} – {midiToLabel(rangeStart + KEY_COUNT - 1)}</strong>
              <button type="button" aria-label="Octava siguiente" onClick={() => setRangeStart(clamp(rangeStart + 12, MIN_MIDI, MAX_MIDI - KEY_COUNT + 1))}>+</button></div>
            <div className="piano-app__toolbar-group"><span>Tempo live</span><input aria-label="Tempo live" type="number" min="30" max="300" value={bpm} onChange={(e) => {
              const next = clamp(Number(e.target.value) || 120, 30, 300);
              setBpm(next);
              if (metronomeOn) void engine.setMetronome({ enabled: true, bpm: next });
            }} /><span>BPM</span></div>
            <button type="button" className={metronomeOn ? "is-active" : ""} aria-pressed={metronomeOn}
              onClick={() => { const next = !metronomeOn; setMetronomeOn(next);
                void engine.setMetronome({ enabled: next, bpm }); }}>Metrónomo</button>
            <button type="button" className={recording ? "is-recording" : "piano-app__primary"}
              onClick={() => { if (recording) void stopRecording(); else startRecording(); }}>
              {recording ? "■ Detener grabación" : "● Grabar MIDI"}</button>
          </div>
          <section className="piano-app__instrument" aria-label="Instrumento de 37 teclas">
            <InstrumentBrowser activeId={activeInstrumentId} loadingId={loadingInstrumentId}
              loadingProgress={instrumentLoadingProgress} onCancel={cancelInstrumentLoad}
              failedId={failedInstrumentId} error={instrumentError} notice={instrumentNotice}
              onSelect={(id) => { void chooseInstrument(id); }} />
            <div className="piano-app__keyboard-viewport" role="region" aria-label="Teclado desplazable de 37 teclas" tabIndex={0}>
              <PianoKeyboard visibleNotes={visibleNotes}
              activeNoteVelocitiesRef={activeVelocityRef} showNoteNames={showNoteNames}
              keyFxColor="#8b5cf6" keyFxGlow={0.55}
              onKeyMouseDown={(note) => {
                if (mouseHeldRef.current.has(note)) return;
                mouseHeldRef.current.add(note);
                pressVirtual("mouse", note, String(note));
              }}
              onKeyMouseUp={(note) => {
                if (!mouseHeldRef.current.delete(note)) return;
                releaseVirtual("mouse", note, String(note));
              }} />
            </div>
          </section>
          <LivePerformanceReadout midiInputActive={midiListening} />
          {(velocityCurve === "soft" || velocityCurve === "fixed") && <div className="piano-app__expression-tip">
            <span>{velocityCurve === "soft" ? "La curva Suave eleva mucho las pulsaciones leves." : "La curva Fija elimina las diferencias de velocidad."}</span>
            <button type="button" onClick={() => setVelocityCurve("expressive")}>Usar curva Expresiva</button>
          </div>}
          <div className="piano-app__cards">
            <section className="piano-app__card"><h2>Pedales</h2><p>Sustain, sostenuto y una corda responden al controlador o al teclado.</p>
              <div className="piano-app__pedals">{([["unaCorda", "Una corda", "Ctrl"], ["sostenuto", "Sostenuto", "Shift"], ["sustain", "Sustain", "Espacio"]] as const).map(([id, label, key]) => (
                <button key={id} type="button" className={pedals[id] ? "is-active" : ""}
                  aria-pressed={pedals[id]} onPointerDown={() => setPedal(id, true)}
                  onPointerUp={() => setPedal(id, false)} onPointerCancel={() => setPedal(id, false)}
                  onPointerLeave={() => { if (pedals[id]) setPedal(id, false); }}>
                  <strong>{label}</strong><small>{key}</small></button>
              ))}</div>
              <label className="piano-app__field">Medio pedal <span>{Math.round(halfPedal * 100)} %</span>
                <input type="range" min="0" max="1" step="0.01" value={halfPedal}
                  onChange={(event) => { const value = Number(event.target.value); setHalfPedal(value); engine.setGlobalPedal("ui", "half", value); }} /></label>
            </section>
            <section className="piano-app__card"><h2>Grabación MIDI</h2><p>Cada toma se guarda localmente y aparece en Pistas.</p>
              <div className="piano-app__record-state"><span className={recording ? "is-recording" : ""}>{recording ? "Grabando" : "En espera"}</span><strong>{recordedEvents} eventos</strong></div>
              {unsavedRecording && <p role="alert">Esta toma sólo está en memoria. Reintenta el guardado o exporta el .mid antes de cerrar la pestaña.</p>}
              <div className="piano-app__row"><button type="button" onClick={() => setScreen("tracks")}>Ver mis pistas</button>
                <button type="button" onClick={exportLatest} disabled={!hasRecording || recording}>Exportar última toma</button>
                {unsavedRecording && <button type="button" onClick={() => { void saveUnsavedRecording(); }} disabled={savingRecording}>Reintentar guardado</button>}
                {unsavedRecording && <button type="button" onClick={discardUnsavedRecording} disabled={savingRecording}>Descartar toma sin guardar</button>}</div>
            </section>
          </div>
          </>}
        </div>}

        {screen === "tracks" && <section className="piano-app__page">
          <div className="piano-app__page-heading"><div><p className="piano-app__eyebrow">Mis grabaciones</p><h1>Pistas</h1>
            <p>Las tomas MIDI de este navegador. Abre Studio para grabar una nueva.</p></div>
            <button type="button" className="piano-app__primary" onClick={() => setScreen("studio")}>Ir a Studio</button></div>
          <ProjectBrowser projects={projects} loading={projectsLoading} error={projectsError}
            activeProjectId={projectView?.document.id} onCreate={createProject} onOpen={openProject}
            onRename={(id, name) => mutateProject(id, { kind: "renameProject", name, at: Date.now() })}
            onDuplicate={duplicateProject} onSetArchived={setProjectArchived}
            onExport={exportProject} onPreview={previewProjectBundle} onImport={importProject}
            onListDrafts={(projectId) => projectRepository.listDrafts(projectId)}
            onRecoverDraft={recoverProjectDraft}
            onDiscardDraft={(projectId, sessionId) => projectRepository.discardDraft(projectId, sessionId)} />
          <RecordedTracks takes={takes} loading={takesLoading} error={takesError}
            onRename={async (id, name) => { await library.rename(id, name); await refreshTakes(); }}
            onExport={exportTake}
            onDelete={async (id) => { await library.delete(id); await refreshTakes(); }}
            onImportToProject={projectView ? importTakeToProject : undefined} />
        </section>}

        {screen === "settings" && <div className="piano-app__page piano-app__settings">
          <div className="piano-app__page-heading"><div><p className="piano-app__eyebrow">Ajustes del instrumento</p><h1>Configuración</h1>
            <p>Audio, interpretación, conectividad y asignación de controles MIDI.</p></div></div>
          <section className="piano-app__card"><h2>Conectividad MIDI</h2>
            <div className="piano-app__grid">
              <label className="piano-app__field">Entrada activa<select value={selectedInputId} onChange={(event) => selectedChanged(event.target.value)}>
                <option value={AUTO_MIDI_INPUT_ID}>Seleccionar entrada</option>
                <option value={ALL_MIDI_INPUTS_ID}>Todos los puertos (sólo si son independientes)</option>
                {midiInputs.map((input) => <option key={input.id} value={input.id}>{input.name}</option>)}
                {selectedInputId !== AUTO_MIDI_INPUT_ID && selectedInputId !== ALL_MIDI_INPUTS_ID &&
                  !midiInputs.some((input) => input.id === selectedInputId) &&
                  <option value={selectedInputId}>Puerto desconectado</option>}
              </select></label>
              <label className="piano-app__field">Nota física base <span>{physicalBase}</span><input type="number" min="0" max="127" value={physicalBase}
                onChange={(event) => { setPhysicalBase(clamp(Number(event.target.value) || 0, 0, 127));
                  if (selectedInput) setCalibratedPortId(selectedInput.id); }} /></label>
              <label className="piano-app__field">Inicio del rango visible <span>{midiToLabel(rangeStart)}</span>
                <input type="range" min={MIN_MIDI} max={MAX_MIDI - KEY_COUNT + 1} step="1" value={rangeStart}
                  onChange={(event) => setRangeStart(Number(event.target.value))} /></label>
            </div>
            <div className="piano-app__row"><button type="button" onClick={() => void requestMidi()}>Volver a buscar MIDI</button>
              <button type="button" disabled={!midiListening} onClick={() => setCalibrateNextKey(true)}>{calibrateNextKey ? "Pulsa la tecla física más a la izquierda…" : "Calibrar tecla izquierda"}</button></div>
            <p className="piano-app__hint">Para alinear las 37 teclas, pulsa la tecla más a la izquierda del controlador cuando se active la calibración.</p>
            {midiError && <p role="alert" className="piano-app__error">{midiError}</p>}
          </section>
          <section className="piano-app__card"><h2>Interpretación y audio</h2><div className="piano-app__grid">
            <label className="piano-app__field">Curva de velocidad<select value={velocityCurve} onChange={(event) => setVelocityCurve(event.target.value as VelocityCurve)}>
              {VELOCITY_CURVES.map((curve) => <option key={curve} value={curve}>{VELOCITY_CURVE_DESCRIPTORS[curve].label}</option>)}
            </select></label>
            <label className="piano-app__field">Calibración MIDI física<select value={calibration.autoCalibrationEnabled ? "auto" : "raw"}
              disabled={!calibrationScope} onChange={(event) => changePhysicalCalibration({ autoCalibrationEnabled: event.target.value === "auto" })}>
              <option value="auto">Automática por puerto</option><option value="raw">Velocidad original 1–127</option>
            </select></label>
            <label className="piano-app__field">Piso de ganancia física <span>{(calibration.audibilityFloor * 100).toFixed(1)} %</span>
              <input type="range" min="0" max="0.1" step="0.001" value={calibration.audibilityFloor}
                disabled={!calibrationScope} onChange={(event) => changePhysicalCalibration({ audibilityFloor: Number(event.target.value) })} /></label>
            <label className="piano-app__field">Velocidad virtual <span>{Math.round(mouseVelocity * 127)}</span><input type="range" min="0.05" max="1" step="0.01" value={mouseVelocity}
              onChange={(event) => setMouseVelocity(Number(event.target.value))} /></label>
            <label className="piano-app__field">Transposición <span>{transpose > 0 ? "+" : ""}{transpose} semitonos</span><input type="range" min="-12" max="12" step="1" value={transpose}
              onChange={(event) => setTranspose(Number(event.target.value))} /></label>
            <label className="piano-app__field">Rango pitch bend <span>±{pitchBendRange}</span><input type="range" min="1" max="12" step="1" value={pitchBendRange}
              onChange={(event) => setPitchBendRange(Number(event.target.value))} /></label>
            <label className="piano-app__field">Volumen maestro <span>{Math.round(masterVolume)} dB</span><input type="range" min="-40" max="0" step="1" value={masterVolume}
              onChange={(event) => setMasterVolume(Number(event.target.value))} /></label>
            <label className="piano-app__field">Liberación <span>{releaseSeconds.toFixed(1)} s</span><input type="range" min="0.1" max="4" step="0.1" value={releaseSeconds}
              onChange={(event) => setReleaseSeconds(Number(event.target.value))} /></label>
            <label className="piano-app__field">Reverberación <span>{reverbDecay.toFixed(1)} s</span><input type="range" min="0.5" max="4" step="0.1" value={reverbDecay}
              onChange={(event) => setReverbDecay(Number(event.target.value))} /></label>
            <label className="piano-app__field">Chorus <span>{Math.round(chorusWet * 100)} %</span><input type="range" min="0" max="1" step="0.01" value={chorusWet}
              onChange={(event) => setChorusWet(Number(event.target.value))} /></label>
            <label className="piano-app__field">Nombres de notas<select value={showNoteNames} onChange={(event) => setShowNoteNames(event.target.value as "none" | "name")}>
              <option value="name">Mostrar</option><option value="none">Ocultar</option></select></label>
          </div><p className="piano-app__hint">{VELOCITY_CURVE_DESCRIPTORS[velocityCurve].description}. {calibrationScope
              ? `Calibración de ${selectedInput?.name}: ${calibration.sampleCount} ${calibration.sampleCount === 1 ? "pulsación MIDI observada" : "pulsaciones MIDI observadas"} (${calibration.minObserved}–${calibration.maxObserved}).`
              : "Selecciona un puerto MIDI para ajustar su calibración física."}</p>
            <div className="piano-app__row"><button type="button" disabled={!calibrationScope} onClick={resetPhysicalCalibration}>Reiniciar calibración de este puerto</button>
              <button type="button" onClick={() => void engine.retrySamples()}>Reintentar muestras de piano</button></div>
          </section>
          <section className="piano-app__card"><h2>Almacenamiento local de proyectos</h2>
            {storageHealth ? <p>{storageHealth.supported
              ? `Uso estimado: ${storageHealth.usageBytes === null ? "desconocido" : `${(storageHealth.usageBytes / 1048576).toFixed(1)} MiB`} · Cuota estimada: ${storageHealth.quotaBytes === null ? "desconocida" : `${(storageHealth.quotaBytes / 1048576).toFixed(1)} MiB`} · Persistencia: ${storageHealth.persistent === null ? "desconocida" : storageHealth.persistent ? "concedida" : "sin conceder"}.`
              : "El navegador no ofrece estimación de cuota."}</p> : <p>Consulta el espacio y la persistencia de este navegador.</p>}
            <div className="piano-app__row">
              <button type="button" onClick={() => { void refreshStorageHealth(); }}>Actualizar estado</button>
              <button type="button" onClick={() => { void persistProjectStorage(); }}
                disabled={!storageHealth?.supported || storageHealth.persistent === true}>Solicitar almacenamiento persistente</button>
            </div>
            {storageNotice && <p role="status">{storageNotice}</p>}
            <p className="piano-app__hint">Las cifras son estimadas. Un guardado puede fallar por cuota aunque quede espacio indicado.</p>
          </section>
          <ProjectSoundLibrariesPanel />
          <section className="piano-app__card"><h2>Diagnóstico MIDI físico</h2>
            <p>Captura durante 30 segundos los bytes de todos los puertos conectados para identificar controles del SMK-37.</p>
            <div className="piano-app__row"><button type="button" onClick={captureRunning ? stopCapture : startCapture}>
              {captureRunning ? "Detener captura" : "Iniciar captura"}</button>
              <button type="button" disabled={!captureAvailable} onClick={() => download(trace.toJSON(),
                `smk37-midi-diagnostico-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`, "application/json")}>Descargar JSON</button></div>
          </section>
          <MidiControlPanel profileId={profileId} profileOverride={profileOverride} onProfileOverride={setProfileOverride}
            inputs={midiInputs} selectedInputId={selectedInputId} observations={observations} bindings={bindings}
            bank={bank} onBankChange={setBank} learnAction={learnAction}
            onStartLearn={(action) => { latestRef.current.learnAction = action; setLearnAction(action); }}
            onCancelLearn={() => { latestRef.current.learnAction = null; setLearnAction(null); }}
            onRemoveBinding={(id) => commitBindings(bindings.filter((binding) => binding.id !== id))}
            onToggleBinding={(id, enabled) => commitBindings(bindings.map((binding) => binding.id === id ? { ...binding, enabled } : binding))}
            onValueModeChange={(id, valueMode) => commitBindings(bindings.map((binding) => binding.id === id ? { ...binding, valueMode } : binding))}
            onClearObservations={() => { monitor.clear(); setObservations([]); }}
            recording={recording} recordedEvents={recordedEvents} hasRecording={hasRecording}
            unsavedRecording={unsavedRecording} savingRecording={savingRecording}
            onRetryRecording={() => { void saveUnsavedRecording(); }}
            onDiscardRecording={discardUnsavedRecording}
            onStartRecording={startRecording} onStopRecording={() => { void stopRecording(); }} onExportRecording={exportLatest} />
        </div>}
      </main>
    </div>
  );
}
