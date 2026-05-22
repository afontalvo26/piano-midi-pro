import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useLocalStorageState } from "./utils/settings";
import { Midi } from "@tonejs/midi";
import * as Tone from "tone";
import "./App.css";
import { parseMusicXML, scoreToParts } from "./parsers/MusicXMLParser";
import { analyzeScore } from "./analysis/MusicAnalyzer";
import { cacheScoreXML } from "./components/score/scoreCache";
import { PartMixer } from "./components/score/PartMixer";
import { ImportPanel } from "./components/score/ImportPanel";
import { ScoreInfoBar } from "./components/score/ScoreInfoBar";
const ScoreViewer = lazy(() =>
  import("./components/score/ScoreViewer").then((m) => ({ default: m.ScoreViewer })),
);
import type { ScoreDocument, ScorePart } from "./types/score";
import type { AnalysisResult } from "./analysis/MusicAnalyzer";
import {
  InstrumentEngineRegistry,
  inferPianoParams,
  inferTrumpetParams,
} from "./engine/InstrumentEngine";
import {
  getGMSampler,
  getGMSamplerSync,
  getLoadedGMSamplers,
  disposeAllGMSamplers,
} from "./engine/GMSamplerEngine";
import { InstrumentControlsPanel } from "./components/studio";
import type { BrassMuteType, TrumpetTonguing } from "./engine/InstrumentEngine";
import { KeyFxPanel } from "./components/studio";
import type { KeyFxThemeId } from "./components/studio";
import { ProfilePanel } from "./components/gamification";

// Gamification imports
import type {
  PlayerProfile,
  LevelUpEvent,
} from "./types/gamification";
import {
  getOrCreateProfile,
  saveProfile,
  calculateXPReward,
  addXP,
  updateStats,
  enhancedToExtendedStats,
} from "./utils/profile";
import {
  checkAchievements,
  unlockAchievement,
  getAchievementById,
} from "./utils/achievements";
import {
  calculateStars,
  createSongRating,
  saveSongRating,
} from "./utils/songRatings";
import {
  buildGameChart,
  classifyHit,
  computeAutoShiftTarget,
  createEnhancedGameStats,
  applyEnhancedGameHit,
  applyEnhancedGameMiss,
  calculateMaxScore,
  activateStarPower,
  updateStarPower,
  getTimingWindows,
} from "./game/engine";
import type {
  EnhancedGameStats,
  GameBestScore,
  GameChartNote,
  GameDifficulty,
  GameMode,
  GameStatus,
  HitGrade,
  RhythmSourceNote,
} from "./game/engine";
import { NeonRunnerAvatar } from "./components/gamification";
import { GameHUD } from "./components/game";
import { GameResultsModal } from "./components/game";
import { Icons } from "./components/common/Icons";
import {
  INSTRUMENT_FAMILIES,
  INITIAL_RANGE_START,
  PIANO_MAX_MIDI,
  PIANO_MIN_MIDI,
  RANGE_KEY_COUNT,
} from "./constants/piano";
import { TRACK_COLORS } from "./constants/ui";
import { DEMO_SONGS } from "./constants/demoSongs";
import { salamanderSamples as SALAMANDER_SAMPLES } from "./services/audioService";
import {
  clamp,
  hexToRgba,
  isBlackKey,
  lightenHex,
  midiToLabel,
} from "./utils/audioMidiUtils";
import {
  getInstrumentSynthSettings,
  gmProgramToInstrument,
} from "./utils/instrumentMapping";
import { getDeviceProfile } from "./utils/deviceCapabilities";
import {
  applyVelocityCurve,
  VELOCITY_CURVE_DESCRIPTORS,
  type VelocityCurve,
} from "./utils/velocity";
import { parseDemoInWorker } from "./utils/midiWorkerClient";

type NavScreen =
  | "studio"
  | "game"
  | "songs"
  | "tracks"
  | "midi"
  | "settings"
  | "score";

type SongNote = {
  id: string;
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  trackIndex: number;
};

type SongTrack = {
  index: number;
  name: string;
  instrument: string;
  noteCount: number;
  color: string;
};

type SongData = {
  title: string;
  source: string;
  duration: number;
  bpm: number;
  notes: SongNote[];
  tracks: SongTrack[];
};

type MidiInputDevice = {
  id: string;
  name: string;
  state: string;
};

// Particle effect type for note visualizer hits
type NoteParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
};


const EMPTY_SONG: SongData = {
  title: "Sin canción cargada",
  source: "",
  duration: 0,
  bpm: 120,
  notes: [],
  tracks: [],
};

export default function App() {
  const [screen, setScreen] = useLocalStorageState<NavScreen>(
    "piano_screen",
    "studio",
  );
  const [song, setSong] = useState<SongData>(() => {
    try {
      const savedTitle = localStorage.getItem("piano_current_song_title");
      if (savedTitle) {
        // songsList will be restored by useLocalStorageState above,
        // but it runs before this lazy init, so we check localStorage directly
        const savedSongs = localStorage.getItem("piano_songs_list");
        if (savedSongs) {
          const list: SongData[] = JSON.parse(savedSongs);
          const found = list.find((s) => s.title === savedTitle);
          if (found) return found;
        }
      }
    } catch {
      // fall through
    }
    return EMPTY_SONG;
  });
  const [songsList, setSongsList] = useLocalStorageState<SongData[]>(
    "piano_songs_list",
    [],
  );
  const [searchQuery, setSearchQuery] = useLocalStorageState(
    "piano_search_query",
    "",
  );
  const [demoSongsLoaded, setDemoSongsLoaded] = useState(false);

  // Auto-load demo songs on first visit
  useEffect(() => {
    if (demoSongsLoaded) return;
    // Note: we don't persist parsed demos to localStorage because the data
    // is too large (~5MB). Re-parsing on each cold start is acceptable —
    // the worker keeps it off the main thread.

    let cancelled = false;

    // Yield to the browser so we don't block the main thread between heavy
    // sync MIDI parses. Uses scheduler.yield when available, falls back to
    // requestIdleCallback / setTimeout.
    const yieldToMain = () =>
      new Promise<void>((resolve) => {
        const sched = (window as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
        if (sched?.yield) {
          sched.yield().then(() => resolve());
        } else if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(() => resolve(), { timeout: 50 });
        } else {
          setTimeout(resolve, 0);
        }
      });

    async function parseDemoSong(ds: typeof DEMO_SONGS[number]): Promise<SongData | null> {
      try {
        const res = await fetch(ds.path);
        if (!res.ok) return null;
        const bytes = await res.arrayBuffer();

        // Try Web Worker first (zero main-thread cost)
        try {
          const id = `${ds.artist}-${ds.title}`;
          // We must clone the buffer since postMessage transfers it
          const bufferCopy = bytes.slice(0);
          return await parseDemoInWorker({
            id,
            buffer: bufferCopy,
            title: ds.title,
            artist: ds.artist,
            defaultBpm: ds.bpm,
            source: "Demo incluida",
          });
        } catch {
          // Fallback: in-thread parse
        }

        const midi = new Midi(bytes);

        const parsedTracks: SongTrack[] = [];
        const parsedNotes: SongNote[] = [];

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
          const noteCount = track.notes.length;
          parsedTracks.push({
            index: newIdx,
            name: track.name?.trim() || `Pista ${newIdx + 1}`,
            instrument: gmProgramToInstrument(
              track.instrument?.number ?? 0,
              track.name,
            ),
            noteCount,
            color,
          });
          track.notes.forEach((note, noteIndex) => {
            parsedNotes.push({
              id: `demo-${ds.title}-${origIdx}-${noteIndex}`,
              midi: note.midi,
              time: note.time,
              duration: Math.max(0.04, note.duration),
              velocity: note.velocity || 0.75,
              trackIndex: newIdx,
            });
          });
        });

        parsedNotes.sort((a, b) => a.time - b.time);
        const duration = parsedNotes.reduce(
          (max, note) => Math.max(max, note.time + note.duration),
          0,
        );
        const bpm = Math.round(midi.header.tempos[0]?.bpm || ds.bpm);

        return {
          title: `${ds.artist} - ${ds.title}`,
          source: "Demo incluida",
          duration,
          bpm,
          notes: parsedNotes,
          tracks: parsedTracks,
        };
      } catch {
        return null;
      }
    }

    async function loadDemoSongs() {
      // Fetch + parse in parallel (network is mostly the bottleneck), but
      // yield to the main thread between each so React/canvas stay responsive.
      const loadedSongs: SongData[] = [];
      for (const ds of DEMO_SONGS) {
        if (cancelled) return;
        const song = await parseDemoSong(ds);
        if (song) loadedSongs.push(song);
        await yieldToMain();
      }
      if (!cancelled && loadedSongs.length > 0) {
        // Note: localStorage is too small (~5MB) to hold parsed MIDI note
        // data, so we don't try to persist it. Each session re-parses demos
        // off the main thread via Worker (fast, ~600ms total). The state
        // setter populates the in-memory list which the UI consumes.
        setSongsList((prev) => {
          const existing = new Set(prev.map((s) => s.title));
          const newOnes = loadedSongs.filter((s) => !existing.has(s.title));
          return [...newOnes, ...prev];
        });
        // Don't set demo_songs_loaded flag — we always want to reload demos
        // on cold start since localStorage can't hold them.
      }
      if (!cancelled) setDemoSongsLoaded(true);
    }
    loadDemoSongs();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoSongsLoaded]);

  // rangeStart SIEMPRE en nota C (múltiplo de 12) para el patrón 2-3-2-3 correcto
  const snapToC = (n: number) =>
    clamp(
      Math.round(n / 12) * 12,
      PIANO_MIN_MIDI,
      PIANO_MAX_MIDI - RANGE_KEY_COUNT + 1,
    );
  const [rangeStart, setRangeStart] = useLocalStorageState<number>(
    "piano_range_start",
    INITIAL_RANGE_START,
  );

  // Playback states
  const [playbackRate, setPlaybackRate] = useLocalStorageState<number>(
    "piano_playback_rate",
    1,
  );
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isAudioReady, setIsAudioReady] = useState<boolean>(false);
  const [isSamplerActive, setIsSamplerActive] = useState<boolean>(false);
  const [isAudioLoading, setIsAudioLoading] = useState<boolean>(false);
  const [audioStatusMessage, setAudioStatusMessage] = useState<string>(
    "Esperando activación",
  );

  // Live Note triggers
  const [activePlaybackNotes, setActivePlaybackNotes] = useState<Set<number>>(
    new Set(),
  );
  const [activeMidiNotes, setActiveMidiNotes] = useState<Set<number>>(
    new Set(),
  );

  // Track management settings
  const [trackMuted, setTrackMuted] = useLocalStorageState<
    Record<number, boolean>
  >("piano_track_muted", {});
  const [trackSolo, setTrackSolo] = useLocalStorageState<
    Record<number, boolean>
  >("piano_track_solo", {});
  const [trackVolumes, setTrackVolumes] = useLocalStorageState<
    Record<number, number>
  >("piano_track_volumes", {});
  const [trackInstruments, setTrackInstruments] = useLocalStorageState<
    Record<number, string>
  >("piano_track_instruments", {});
  const [trackColors, setTrackColors] = useLocalStorageState<
    Record<number, string>
  >("piano_track_colors", {});

  // MIDI Hardware States
  const [midiPermission, setMidiPermission] = useState<string>("unknown");
  const [midiStatus, setMidiStatus] = useState<string>(
    "Buscando controlador MIDI...",
  );
  const [midiError, setMidiError] = useState<string>("");
  const [midiInputs, setMidiInputs] = useState<MidiInputDevice[]>([]);
  const [isMidiScanning, setIsMidiScanning] = useState<boolean>(true);
  const [lastPhysicalMidi, setLastPhysicalMidi] = useState<number | null>(null); // última nota física recibida
  const [calibrating, setCalibrating] = useState<boolean>(false); // esperando calibración
  const calibratingRef = useRef<boolean>(false);
  const [selectedInputId, setSelectedInputId] = useLocalStorageState<string>(
    "piano_selected_midi_input_id",
    "__all__",
  );

  // shift mode por defecto: teclado físico sigue el rango visible 1:1
  // anchor mode: primera tecla presionada define el mapeo (menos predecible)
  const [midiMode, setMidiMode] = useLocalStorageState<"anchor" | "shift">(
    "piano_midi_mode",
    "shift",
  );
  const [midiPhysicalBase, setMidiPhysicalBase] = useLocalStorageState<number>(
    "piano_midi_physical_base",
    48,
  );

  // Advanced MIDI features
  const [pitchBend, setPitchBend] = useState<number>(0);
  const [pitchBendRange, setPitchBendRange] = useLocalStorageState<number>(
    "piano_pitch_bend_range",
    2,
  ); // semitones
  const [lastVelocity, setLastVelocity] = useState<number>(0);
  const [velocityCurve, setVelocityCurve] = useLocalStorageState<VelocityCurve>(
    "piano_velocity_curve",
    "piano",
  );
  // Migrate legacy curve names from previous app versions
  useEffect(() => {
    const cur = velocityCurve as string;
    if (cur === "logarithmic") setVelocityCurve("soft");
    else if (cur === "exponential") setVelocityCurve("piano");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [mouseVelocity, setMouseVelocity] = useLocalStorageState<number>(
    "piano_mouse_velocity",
    0.75,
  ); // 0-1, configurable
  const [sustainDown, setSustainDown] = useState<boolean>(false);

  // Config settings
  const [scrollSensitivity, setScrollSensitivity] =
    useLocalStorageState<number>("piano_scroll_sensitivity", 1.2);
  const [showNoteNames, setShowNoteNames] = useLocalStorageState<
    "none" | "name" | "binding"
  >("piano_show_note_names", "name");
  const [pitchPractice, setPitchPractice] = useLocalStorageState<boolean>(
    "piano_pitch_practice",
    false,
  );
  const [reverbDecay, setReverbDecay] = useLocalStorageState<number>(
    "piano_reverb_decay",
    1.5,
  );
  const [chorusDepth, setChorusDepth] = useLocalStorageState<number>(
    "piano_chorus_depth",
    0.0,
  );
  const [showParticles, setShowParticles] = useLocalStorageState<boolean>(
    "piano_show_particles",
    true,
  );
  const [keyFxThemeId, setKeyFxThemeId] = useLocalStorageState<KeyFxThemeId>(
    "keyfx_theme",
    "neon-violet",
  );
  const [keyFxColor, setKeyFxColor] = useLocalStorageState<string>(
    "keyfx_color",
    "#8b5cf6",
  );
  const [keyFxGlow, setKeyFxGlow] = useLocalStorageState<number>(
    "keyfx_glow",
    0.9,
  );
  const [keyFxIntensity, setKeyFxIntensity] = useLocalStorageState<number>(
    "keyfx_intensity",
    0.85,
  );
  const [sustainTime, setSustainTime] = useLocalStorageState<number>(
    "piano_sustain_time",
    1.2,
  );
  const [latencyMode, setLatencyMode] = useLocalStorageState<
    "ultra" | "balanced"
  >("piano_latency_mode", "ultra");

  // New essential sound controls
  const [masterVolume, setMasterVolume] = useLocalStorageState<number>(
    "piano_master_volume",
    -10,
  ); // dB, -40 to 0
  const [transpose, setTranspose] = useLocalStorageState<number>(
    "piano_transpose",
    0,
  ); // semitones, -12 to 12
  const [metronomeOn, setMetronomeOn] = useLocalStorageState<boolean>(
    "piano_metronome_on",
    false,
  );
  const [metronomeVolume] = useLocalStorageState<number>(
    "piano_metronome_volume",
    0.5,
  );
  const [pianoOnlyMode, setPianoOnlyMode] = useLocalStorageState<boolean>(
    "piano_piano_only_mode",
    false,
  );

  // ---- Neon Runner Avatar ----
  const [showPet, setShowPet] = useLocalStorageState<boolean>(
    "piano_pet_show",
    true,
  );

  // ---- Game mode ----
  const [gameMode, setGameMode] = useLocalStorageState<GameMode>(
    "piano_game_mode",
    "learn",
  );
  const [gameDifficulty, setGameDifficulty] =
    useLocalStorageState<GameDifficulty>("piano_game_difficulty", "easy");
  const [gameAutoShift, setGameAutoShift] = useLocalStorageState<boolean>(
    "piano_game_auto_shift",
    true,
  );
  const [gameGhostAssist, setGameGhostAssist] = useLocalStorageState<boolean>(
    "piano_game_ghost_assist",
    true,
  );
  const [gameStatus, setGameStatus] = useState<GameStatus>("setup");
  const [gameCountdown, setGameCountdown] = useState<number>(0);
  const [gameStats, setGameStats] = useState<EnhancedGameStats>(() =>
    createEnhancedGameStats(0),
  );
  const [gameComboMilestone, setGameComboMilestone] = useState<number | null>(
    null,
  );
  const [gameHitReadyNotes, setGameHitReadyNotes] = useState<Set<number>>(
    () => new Set(),
  );
  const [gameLastGrade, setGameLastGrade] = useState<HitGrade | null>(null);
  const [gameShiftLabel, setGameShiftLabel] = useState<string>("");
  const [gameAssistNotesState, setGameAssistNotesState] = useState<Set<number>>(
    () => new Set(),
  );
  const [gameBestScores, setGameBestScores] = useLocalStorageState<
    Record<string, GameBestScore>
  >("piano_game_best_scores", {});

  // ---- Gamification State ----
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile>(() =>
    getOrCreateProfile(),
  );
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [xpNotification, setXpNotification] = useState<{
    amount: number;
    show: boolean;
  }>({ amount: 0, show: false });
  const [levelUpEvent, setLevelUpEvent] = useState<LevelUpEvent | null>(null);
  const [achievementToasts, setAchievementToasts] = useState<
    Array<{ id: string; name: string; icon: string; description: string }>
  >([]);
  const [starsEarned, setStarsEarned] = useState<number>(0);

  // ---- Score Reader State ----
  const [scoreDocument, setScoreDocument] = useState<ScoreDocument | null>(
    null,
  );
  const [scoreAnalysis, setScoreAnalysis] = useState<AnalysisResult | null>(
    null,
  );
  const [scoreImportLoading, setScoreImportLoading] = useState(false);
  const [scoreImportError, setScoreImportError] = useState<string | null>(null);
  const [scoreLastImported, setScoreLastImported] = useLocalStorageState<
    string | null
  >("piano_score_last_imported", null);
  const [scoreViewMode, setScoreViewMode] = useLocalStorageState<
    "roll" | "sheet"
  >("piano_score_view_mode", "roll");
  const [scoreParts, setScoreParts] = useState<ScorePart[]>([]);

  // ---- Piano advanced state ----
  const [pianoPedalSustain, setPianoPedalSustain] = useState(false);
  const [pianoPedalSostenuto, setPianoPedalSostenuto] = useState(false);
  const [pianoPedalUnaCorda, setPianoPedalUnaCorda] = useState(false);
  const [pianoHalfPedal, setPianoHalfPedal] = useState(1.0);

  // ---- Trumpet advanced state ----
  const [trumpetMute, setTrumpetMute] = useLocalStorageState<BrassMuteType>(
    "piano_trumpet_mute",
    "none",
  );
  const [trumpetTonguing, setTrumpetTonguing] =
    useLocalStorageState<TrumpetTonguing>("piano_trumpet_tonguing", "single");
  const [trumpetVibratoDepth, setTrumpetVibratoDepth] =
    useLocalStorageState<number>("piano_trumpet_vibrato_depth", 0);
  const [trumpetVibratoRate, setTrumpetVibratoRate] =
    useLocalStorageState<number>("piano_trumpet_vibrato_rate", 5.5);
  const [trumpetVibratoDelay, setTrumpetVibratoDelay] =
    useLocalStorageState<number>("piano_trumpet_vibrato_delay", 0.15);
  const [trumpetFall, setTrumpetFall] = useState(false);
  const [trumpetDoit, setTrumpetDoit] = useState(false);
  const [trumpetShake, setTrumpetShake] = useState(false);

  // ---- InstrumentEngineRegistry ref ----
  const engineRegistryRef = useRef<InstrumentEngineRegistry | null>(null);

  // Canvas ref & loop
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<NoteParticle[]>([]);
  const particlePoolRef = useRef<NoteParticle[]>([]);

  // Audio refs
  const samplerRef = useRef<Tone.Sampler | null>(null);
  const fallbackSynthsRef = useRef<Record<number, Tone.PolySynth> | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  // GM sampler destination — set once audio is ready, used by GMSamplerEngine
  const gmDestRef = useRef<Tone.ToneAudioNode | null>(null);
  const chorusRef = useRef<Tone.Chorus | null>(null);
  const volNodeRef = useRef<Tone.Volume | null>(null);
  const compressorRef = useRef<Tone.Compressor | null>(null);
  const metronomeRef = useRef<Tone.MetalSynth | null>(null);
  const metronomeVolRef = useRef<Tone.Volume | null>(null);
  const isInitializingAudioRef = useRef<boolean>(false);

  // MIDI refs
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const physicalAnchorRef = useRef<number | null>(null);
  const activeFreqsRef = useRef<Map<string, number>>(new Map());
  const activePhysicalNotesRef = useRef<Map<number, number>>(new Map());
  const activeVoicesRef = useRef<
    { key: string; midi: number; trackIndex: number; freq: number }[]
  >([]);
  const sustainedNotesRef = useRef<Set<number>>(new Set());
  const mousePressedKeysRef = useRef<Set<number>>(new Set());
  // velocity per active note (0..1 normalized) — drives visual press depth
  const activeNoteVelocitiesRef = useRef<Map<number, number>>(new Map());
  const activePlaybackNotesRef = useRef<Map<number, number>>(new Map()); // MIDI -> count
  const minimapDragRef = useRef<{ startX: number; startRange: number } | null>(
    null,
  );

  // Game refs
  const gameChartRef = useRef<GameChartNote[]>([]);
  const gameMissCursorRef = useRef(0);
  const gameAutoShiftCooldownRef = useRef(0);
  const gameCountdownTimerRef = useRef<number | null>(null);
  const gameGradeTimerRef = useRef<number | null>(null);
  const gameStatsRef = useRef<EnhancedGameStats>(createEnhancedGameStats(0));
  const prevGameTimeRef = useRef<number>(0);
  const timingWindowsRef = useRef(getTimingWindows("easy")); // initialized to easy, updated on difficulty change
  const emptyAssistNotesRef = useRef<Set<number>>(new Set());
  const updateGameRuntimeRef = useRef<(nowSec: number) => void>(() => {});
  const finishGameRoundRef = useRef<(aborted?: boolean) => void>(() => {});

  // Find notes in the song that are currently at the playhead
  // Group song notes by start time to detect chords and note onsets (with a 30ms tolerance)
  const songOnsets = useMemo(() => {
    const activeNotes = song.notes.filter((note) => {
      const isMuted = trackMuted[note.trackIndex];
      const hasSolo = Object.values(trackSolo).some(Boolean);
      const isOutSolo = hasSolo && !trackSolo[note.trackIndex];
      return !isMuted && !isOutSolo;
    });

    interface PracticeOnset {
      time: number;
      midis: number[];
    }
    const onsets: PracticeOnset[] = [];
    activeNotes.forEach((note) => {
      const existing = onsets.find((o) => Math.abs(o.time - note.time) < 0.03);
      if (existing) {
        if (!existing.midis.includes(note.midi)) {
          existing.midis.push(note.midi);
        }
      } else {
        onsets.push({
          time: note.time,
          midis: [note.midi],
        });
      }
    });

    onsets.sort((a, b) => a.time - b.time);
    return onsets;
  }, [song.notes, trackMuted, trackSolo]);

  const lastPlayedTimeRef = useRef<number>(-1);

  // Find the active waiting onset (if any)
  /* eslint-disable react-hooks/refs */
  const activeWaitingOnset = useMemo(() => {
    if (!pitchPractice) return null;
    // Find the first onset that has not been played yet and is at/just before currentTime
    const lastPlayed = lastPlayedTimeRef.current;
    const upcoming = songOnsets.find((onset) => {
      return (
        onset.time > lastPlayed &&
        currentTime >= onset.time - 0.05
      );
    });
    return upcoming || null;
     
  }, [songOnsets, currentTime, pitchPractice]);
  /* eslint-enable react-hooks/refs */

  const waitingPracticeNotes = useMemo(() => {
    if (!pitchPractice || !activeWaitingOnset) return new Set<number>();
    return new Set<number>(activeWaitingOnset.midis);
  }, [pitchPractice, activeWaitingOnset]);

  // React refs to avoid canvas loop closures AND break useCallback dependency chains
  const stateRef = useRef({
    currentTime: 0,
    rangeStart,
    activeNotes: new Set<number>(),
    song,
    playbackNotes: new Set<number>(),
    midiNotes: new Set<number>(),
    trackMuted,
    trackColors,
    scrollSensitivity,
    showParticles,
    activePlaybackNotes,
    keyFxColor: "#8b5cf6",
    keyFxGlow: 0.9,
    keyFxIntensity: 0.85,
    practiceTargets: new Set<number>(),
    pitchPractice: false,
    songOnsets: [] as { time: number; midis: number[] }[],
    activeWaitingOnset: null as { time: number; midis: number[] } | null,
    // Audio state refs to break circular deps
    pitchBend: 0,
    pitchBendRange: 2,
    velocityCurve: "piano" as VelocityCurve,
    midiMode: "shift" as "anchor" | "shift",
    midiPhysicalBase: 48,
    isAudioReady: false,
    isSamplerActive: false,
    sustainDown: false,
    sustainTime: 1.2,
    selectedInputId: "__all__",
    transpose: 0,
    masterVolume: -10,
    latencyMode: "ultra" as "ultra" | "balanced",
    mouseVelocity: 0.75,
    showPet: true,
    isPlaying: false,
    gameStatus: "setup" as GameStatus,
    gameMode: "learn" as GameMode,
    gameDifficulty: "easy" as GameDifficulty,
    gameAutoShift: true,
    gameGhostAssist: true,
    pianoOnlyMode: false,
    trackInstruments: {} as Record<number, string>,
  });

  // Synchronize state ref variables — must always assign, no early returns
  const mergedNotes = useMemo(() => {
    const merged = new Set<number>(activePlaybackNotes);
    activeMidiNotes.forEach((n) => merged.add(n));
    return merged;
  }, [activePlaybackNotes, activeMidiNotes]);

  // Keep stateRef always in sync (assign directly, no useEffect needed)
  /* eslint-disable react-hooks/refs */
  stateRef.current.currentTime = currentTime;
  stateRef.current.rangeStart = rangeStart;
  stateRef.current.activeNotes = mergedNotes;
  stateRef.current.song = song;
  stateRef.current.playbackNotes = activePlaybackNotes;
  stateRef.current.midiNotes = activeMidiNotes;
  stateRef.current.trackMuted = trackMuted;
  stateRef.current.trackColors = trackColors;
  stateRef.current.scrollSensitivity = scrollSensitivity;
  stateRef.current.showParticles = showParticles;
  stateRef.current.keyFxColor = keyFxColor;
  stateRef.current.keyFxGlow = keyFxGlow;
  stateRef.current.keyFxIntensity = keyFxIntensity;
  stateRef.current.activePlaybackNotes = activePlaybackNotes;
  stateRef.current.practiceTargets = waitingPracticeNotes;
  stateRef.current.pitchPractice = pitchPractice;
  stateRef.current.songOnsets = songOnsets;
  stateRef.current.activeWaitingOnset = activeWaitingOnset;
  stateRef.current.pitchBend = pitchBend;
  stateRef.current.pitchBendRange = pitchBendRange;
  stateRef.current.velocityCurve = velocityCurve;
  stateRef.current.midiMode = midiMode;
  stateRef.current.midiPhysicalBase = midiPhysicalBase;
  stateRef.current.isAudioReady = isAudioReady;
  stateRef.current.isSamplerActive = isSamplerActive;
  stateRef.current.sustainDown = sustainDown;
  stateRef.current.sustainTime = sustainTime;
  stateRef.current.selectedInputId = selectedInputId;
  stateRef.current.transpose = transpose;
  stateRef.current.masterVolume = masterVolume;
  stateRef.current.latencyMode = latencyMode;
  stateRef.current.mouseVelocity = mouseVelocity;
  stateRef.current.showPet = showPet;
  stateRef.current.isPlaying = isPlaying;
  stateRef.current.gameStatus = gameStatus;
  stateRef.current.gameMode = gameMode;
  stateRef.current.gameDifficulty = gameDifficulty;
  stateRef.current.gameAutoShift = gameAutoShift;
  stateRef.current.gameGhostAssist = gameGhostAssist;
  stateRef.current.pianoOnlyMode = pianoOnlyMode;
  stateRef.current.trackInstruments = trackInstruments;
  gameStatsRef.current = gameStats;
  /* eslint-enable react-hooks/refs */

  // Persist current song title for session restore
  useEffect(() => {
    if (song.title !== EMPTY_SONG.title) {
      localStorage.setItem("piano_current_song_title", song.title);
    }
  }, [song.title]);

  // ── Audio engine refs ──
  // Range helper calculations
  void (PIANO_MAX_MIDI - RANGE_KEY_COUNT + 1); // maxRangeStart — kept for future slider
  const visibleNotes = useMemo(() => {
    return Array.from({ length: RANGE_KEY_COUNT }, (_, i) => rangeStart + i);
  }, [rangeStart]);

  // Calculate key positions for NeonRunnerAvatar
  /* eslint-disable react-hooks/refs */
  const keyPositions = useMemo(() => {
     
    const canvas = canvasRef.current;
    if (!canvas) return new Map();

    const width = canvas.width;
    const visibleWhiteNotes = visibleNotes.filter((m) => !isBlackKey(m));
    const numWhiteKeys = visibleWhiteNotes.length;
    const whiteKeyWidth = width / numWhiteKeys;
    const positions = new Map<number, { x: number; width: number }>();

    visibleNotes.forEach((midi) => {
      if (!isBlackKey(midi)) {
        // White key
        const whiteIndex = visibleWhiteNotes.indexOf(midi);
        if (whiteIndex !== -1) {
          positions.set(midi, {
            x: whiteIndex * whiteKeyWidth,
            width: whiteKeyWidth,
          });
        }
      } else {
        // Black key
        const prevWhiteIndex = visibleWhiteNotes.indexOf(midi - 1);
        if (prevWhiteIndex !== -1) {
          const borderX = (prevWhiteIndex + 1) * whiteKeyWidth;
          const blackWidth = whiteKeyWidth * 0.6;
          positions.set(midi, {
            x: borderX - blackWidth / 2,
            width: blackWidth,
          });
        } else {
          const nextWhiteIndex = visibleWhiteNotes.indexOf(midi + 1);
          if (nextWhiteIndex !== -1) {
            const borderX = nextWhiteIndex * whiteKeyWidth;
            const blackWidth = whiteKeyWidth * 0.6;
            positions.set(midi, {
              x: borderX - blackWidth / 2,
              width: blackWidth,
            });
          }
        }
      }
    });

    return positions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNotes, canvasRef.current?.width]);
  /* eslint-enable react-hooks/refs */

  const fullPianoNotes = useMemo(() => {
    return Array.from(
      { length: PIANO_MAX_MIDI - PIANO_MIN_MIDI + 1 },
      (_, i) => PIANO_MIN_MIDI + i,
    );
  }, []);

  const activeNotes = mergedNotes;

  // Setup/tear down audio nodes
  const initializeAudio = useCallback(async () => {
    if (stateRef.current.isAudioReady || isInitializingAudioRef.current) return;
    isInitializingAudioRef.current = true;
    try {
      // Configure AudioContext BEFORE start for minimum latency
      const ctx = Tone.getContext();
      const isUltra = stateRef.current.latencyMode === "ultra";
      ctx.lookAhead = isUltra ? 0 : 0.04;
      // @ts-expect-error updateInterval exists at runtime
      ctx.updateInterval = isUltra ? 0.01 : 0.025;

      await Tone.start();

      // Create effects chain: vol -> chorus -> reverb -> compressor -> limiter -> out
      const limiter = new Tone.Limiter(-2).toDestination();
      const compressor = new Tone.Compressor({
        threshold: -18, // start compressing at -18dB
        ratio: 5, // 5:1 ratio
        attack: 0.003, // 3ms attack — catches transients fast
        release: 0.1, // 100ms release
        knee: 6, // soft knee, transparent
      }).connect(limiter);
      const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.18 }).connect(
        compressor,
      );
      await reverb.generate();
      const chorus = new Tone.Chorus(4, 2.5, 0.5).connect(reverb);
      chorus.wet.value = 0.0;
      chorus.start();
      const vol = new Tone.Volume(stateRef.current.masterVolume).connect(
        chorus,
      );
      compressorRef.current = compressor;

      // Metronome click — MetalSynth → separate volume → limiter
      const metronomeVol = new Tone.Volume(-6).connect(limiter);
      const metronome = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
        harmonicity: 5.1,
        modulationIndex: 16,
        resonance: 4000,
        octaves: 1.5,
      }).connect(metronomeVol);
      metronome.frequency.value = 1000;
      metronome.volume.value = -6;

      reverbRef.current = reverb;
      chorusRef.current = chorus;
      volNodeRef.current = vol;
      metronomeRef.current = metronome;
      metronomeVolRef.current = metronomeVol;

      // Fallback synths listos ANTES del sampler — el usuario oye algo desde el primer click
      // mientras el sampler Salamander carga en segundo plano (~5s)
      const synths: Record<number, Tone.PolySynth> = {};
      fallbackSynthsRef.current = synths;

      // Marcar audio como listo sincrónicamente en stateRef — no esperar re-render de React
      // (si usamos solo setIsAudioReady, stateRef.current.isAudioReady sigue false hasta
      // el siguiente ciclo de render y triggerAttack descarta las notas)
      stateRef.current.isAudioReady = true;
      setIsAudioReady(true);
      setAudioStatusMessage("Cargando piano real... (sintetizador activo)");

      // Initialize InstrumentEngineRegistry for Piano/Trumpet world-class synthesis
      engineRegistryRef.current = new InstrumentEngineRegistry(vol);

      // GM sampler destination — all non-piano real samples route through here
      gmDestRef.current = vol;

      // Sampler Salamander — carga asíncrona, reemplaza el synth cuando termina
      await new Promise<void>((resolve) => {
        const sampler = new Tone.Sampler({
          urls: SALAMANDER_SAMPLES,
          baseUrl: "https://tonejs.github.io/audio/salamander/",
          release: sustainTime,
          onload: () => {
            stateRef.current.isSamplerActive = true; // sync update para triggerAttack
            setIsSamplerActive(true);
            setAudioStatusMessage("Piano realista activo");
            resolve();
          },
          onerror: () => {
            setAudioStatusMessage("Sintetizador FM activo");
            resolve();
          },
        }).connect(vol);
        samplerRef.current = sampler;
      });
    } finally {
      isInitializingAudioRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set individual poly synths based on General MIDI instrument selection
  const getOrCreateSynthForTrack = useCallback(
    (trackIndex: number, instrument: string) => {
      if (!fallbackSynthsRef.current) return null;
      let synth = fallbackSynthsRef.current[trackIndex];
      if (!synth) {
        const settings = getInstrumentSynthSettings(instrument);
        synth = new Tone.PolySynth(Tone.Synth).connect(
          volNodeRef.current || Tone.getDestination(),
        );
        synth.maxPolyphony = 6;

        const configuredSettings = {
          ...settings,
          envelope: {
            ...settings.envelope,
            release: stateRef.current.sustainTime,
          },
        };
        synth.set(configuredSettings);
        fallbackSynthsRef.current[trackIndex] = synth;
      }
      return synth;
    },
    [],
  );

  // Trigger Sound notes play helper — reads from stateRef to stay stable
  const triggerAttack = useCallback(
    (
      midi: number,
      velocity: number = 0.8,
      trackIndex: number = -1,
      instrument: string = "Acoustic Grand Piano",
      eventTimestamp?: number, // DOMHighResTimeStamp from MIDI event
      scheduledAudioTime?: number, // pre-calculated audioTime from Tone.Transport.schedule
    ) => {
      if (!stateRef.current.isAudioReady) return;

      // Pitch bend applies only to live input. Transpose applies only to song playback.
      const {
        pitchBend: pb,
        pitchBendRange: pbr,
        isSamplerActive: samplerActive,
        transpose: transp,
      } = stateRef.current;
      const bendOffset = trackIndex === -1 ? (pb / 100) * pbr : 0;
      const transposeOffset = trackIndex === -1 ? 0 : transp;
      const bentFreq = Tone.Frequency(
        midi + bendOffset + transposeOffset,
        "midi",
      ).toFrequency();

      const key = `${trackIndex}-${midi}`;

      // Implement voice stealing to limit concurrent audio play nodes (max 16)
      // Remove if voice already active (re-triggering key)
      activeVoicesRef.current = activeVoicesRef.current.filter(
        (v) => v.key !== key,
      );

      if (activeVoicesRef.current.length >= 32) {
        const oldest = activeVoicesRef.current.shift();
        if (oldest) {
          if (samplerActive) {
            samplerRef.current?.triggerRelease(oldest.freq, "+0.05");
          }
          if (fallbackSynthsRef.current) {
            if (oldest.trackIndex === -1) {
              Object.values(fallbackSynthsRef.current).forEach((synth) =>
                synth.triggerRelease(oldest.freq, "+0.05"),
              );
            } else {
              fallbackSynthsRef.current[oldest.trackIndex]?.triggerRelease(
                oldest.freq,
                "+0.05",
              );
            }
          }
        }
      }

      activeVoicesRef.current.push({ key, midi, trackIndex, freq: bentFreq });
      activeFreqsRef.current.set(key, bentFreq);

      // Schedule siempre 5ms adelante — evita que lookAhead=0 descarte notas
      // en el borde de currentTime. Con MIDI timestamp se compensa el delay de JS.
      // Si viene de Tone.Transport.schedule, usar el audioTime ya calculado directamente.
      const now = Tone.now();
      const safeOffset = 0.005; // 5ms — imperceptible pero garantiza scheduling futuro
      const audioTime =
        scheduledAudioTime !== undefined
          ? scheduledAudioTime
          : eventTimestamp !== undefined
            ? Math.max(
                now + safeOffset,
                now - (performance.now() - eventTimestamp) / 1000 + safeOffset,
              )
            : now + safeOffset;

      const instLower = instrument.toLowerCase();
      const registry = engineRegistryRef.current;

      // ── 1. Piano real (Salamander sampler) ──
      if (samplerActive && (instLower.includes("piano") || trackIndex === -1)) {
        try {
          samplerRef.current?.triggerAttack(bentFreq, audioTime, velocity);
        } catch {
          const synth = getOrCreateSynthForTrack(
            trackIndex === -1 ? 99 : trackIndex,
            instrument,
          );
          synth?.triggerAttack(bentFreq, audioTime, velocity);
        }
        return;
      }

      // ── 2. World-class engines (brass / strings / woodwinds / percussion) ──
      if (registry) {
        const instType = registry.getType(instrument);

        if (instType === "trumpet") {
          registry.getTrumpet(String(trackIndex)).triggerNote(
            {
              midi,
              velocity,
              duration: 0.5,
              mute: "none" as import("./engine/InstrumentEngine").BrassMuteType,
              tonguing:
                "single" as import("./engine/InstrumentEngine").BrassTonguing,
              vibratoRate: 5.5,
              vibratoDepth: 0,
              vibratoDelay: 0.15,
              articulation:
                "normal" as import("./engine/InstrumentEngine").BrassArticulation,
            },
            audioTime,
          );
          return;
        }

        if (instType === "trombone") {
          registry.getTrombone(String(trackIndex)).triggerNote(
            {
              midi,
              velocity,
              duration: 0.5,
              mute: "none" as import("./engine/InstrumentEngine").BrassMuteType,
              tonguing:
                "single" as import("./engine/InstrumentEngine").BrassTonguing,
              vibratoRate: 5.5,
              vibratoDepth: 0,
              vibratoDelay: 0.15,
              portamento: 0,
              pedalTone: false,
              articulation:
                "normal" as import("./engine/InstrumentEngine").BrassArticulation,
            },
            audioTime,
          );
          return;
        }

        if (instType === "strings") {
          registry.getStrings(String(trackIndex)).triggerNote(
            {
              midi,
              velocity,
              duration: 0.5,
              bowing: "legato",
              contactPoint: "ordinario",
              pizzicato: instLower.includes("pizz"),
              harmonic: false,
              snapPizzicato: false,
              vibrato: { rate: 5.5, depth: 30, delay: 0.2 },
              articulation: "normal",
            },
            audioTime,
          );
          return;
        }

        if (instType === "woodwind") {
          const woodwindEngine = registry.getWoodwind(String(trackIndex));
          const family = (() => {
                const l = instrument.toLowerCase();
                if (l.includes("flute")) return "flute";
                if (l.includes("oboe")) return "oboe";
                if (l.includes("clarinet")) return "clarinet";
                if (l.includes("bassoon")) return "bassoon";
                return "saxophone";
              })();
          woodwindEngine.triggerNote(
            {
              midi,
              velocity,
              duration: 0.5,
              family,
              tonguing: "single",
              vibrato: { rate: 5.5, depth: 25, delay: 0.15 },
              overblown: false,
              articulation: "normal",
            },
            audioTime,
          );
          return;
        }

        if (instType === "percussion") {
          const voice = (() => {
            const l = instrument.toLowerCase();
            if (l.includes("clave")) return "claves";
            if (l.includes("conga")) return "conga-mid";
            if (l.includes("bongo")) return "bongo-high";
            if (l.includes("timba")) return "timbale-high";
            if (l.includes("cowbell")) return "cowbell";
            if (l.includes("guiro")) return "guiro";
            if (l.includes("maraca")) return "maracas";
            if (l.includes("shaker")) return "shaker";
            if (l.includes("kick")) return "kick";
            if (l.includes("snare")) return "snare";
            return "claves";
          })();
          registry.getPercussion(String(trackIndex)).triggerNote(
            {
              voice,
              velocity,
            },
            audioTime,
          );
          return;
        }
      }

      // ── 3. GM sampler (real instrument recordings) ──
      const gmSampler = trackIndex !== -1 ? getGMSamplerSync(instrument) : null;
      if (gmSampler) {
        try {
          gmSampler.triggerAttack(bentFreq, audioTime, velocity);
        } catch {
          const synth = getOrCreateSynthForTrack(
            trackIndex === -1 ? 99 : trackIndex,
            instrument,
          );
          synth?.triggerAttack(bentFreq, audioTime, velocity);
        }
        return;
      }

      // ── 4. Synthetic fallback ──
      const synth = getOrCreateSynthForTrack(
        trackIndex === -1 ? 99 : trackIndex,
        instrument,
      );
      synth?.triggerAttack(bentFreq, audioTime, velocity);
       
    },
    [getOrCreateSynthForTrack],
  );

  const triggerRelease = useCallback(
    (midi: number, trackIndex: number = -1) => {
      if (!stateRef.current.isAudioReady) return;

      const key = `${trackIndex}-${midi}`;
      const freq =
        activeFreqsRef.current.get(key) ||
        Tone.Frequency(midi, "midi").toFrequency();
      activeFreqsRef.current.delete(key);

      // Remove from active voices list
      activeVoicesRef.current = activeVoicesRef.current.filter(
        (v) => v.key !== key,
      );

      // ── 1. Piano sampler (Salamander) ──
      if (
        stateRef.current.isSamplerActive &&
        (trackIndex === -1 ||
          (() => {
            const inst =
              stateRef.current.song.tracks[trackIndex]?.instrument || "";
            return (
              inst.toLowerCase().includes("piano") ||
              inst.toLowerCase().includes("harpsichord")
            );
          })())
      ) {
        samplerRef.current?.triggerRelease(freq);
      }

      // ── 2. World-class engines release (brass / strings / woodwinds) ──
      const registry = engineRegistryRef.current;
      if (trackIndex !== -1 && registry) {
        const inst =
          stateRef.current.trackInstruments[trackIndex] ??
          stateRef.current.song.tracks[trackIndex]?.instrument ??
          "";
        const instType = registry.getType(inst);
        if (instType === "trumpet") {
          try {
            registry.getTrumpet(String(trackIndex)).releaseNote(midi);
          } catch {
            /* ignore */
          }
        } else if (instType === "trombone") {
          try {
            registry.getTrombone(String(trackIndex)).releaseNote(midi);
          } catch {
            /* ignore */
          }
        } else if (instType === "strings") {
          try {
            registry.getStrings(String(trackIndex)).releaseNote(midi);
          } catch {
            /* ignore */
          }
        } else if (instType === "woodwind") {
          try {
            registry.getWoodwind(String(trackIndex)).releaseNote(midi);
          } catch {
            /* ignore */
          }
        }
      }

      // ── 3. GM sampler release ──
      if (trackIndex !== -1) {
        const inst = stateRef.current.song.tracks[trackIndex]?.instrument || "";
        const gmSampler = getGMSamplerSync(inst);
        if (gmSampler) {
          try {
            gmSampler.triggerRelease(freq);
          } catch {
            /* ignore */
          }
        }
      }

      // ── 4. Fallback synth release ──
      if (fallbackSynthsRef.current) {
        if (trackIndex === -1) {
          Object.values(fallbackSynthsRef.current).forEach((synth) =>
            synth.triggerRelease(freq),
          );
        } else {
          fallbackSynthsRef.current[trackIndex]?.triggerRelease(freq);
        }
      }
    },
    [],
  );

  // ─── Pre-load GM samplers for all non-piano tracks when a song is selected ──
  useEffect(() => {
    const dest = gmDestRef.current;
    if (!isAudioReady || !dest || song.tracks.length === 0) return;

    // Collect unique non-piano instrument names
    const nonPianoInstruments = [
      ...new Set(
        song.tracks
          .map((t) => trackInstruments[t.index] ?? t.instrument)
          .filter((inst) => {
            const l = inst.toLowerCase();
            return (
              !l.includes("piano") &&
              !l.includes("harpsichord") &&
              !l.includes("clavinet")
            );
          }),
      ),
    ];

    if (nonPianoInstruments.length === 0) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudioStatusMessage(
      `Cargando ${nonPianoInstruments.length} instrumento(s) real(es)...`,
    );

    const promises = nonPianoInstruments.map((inst) =>
      getGMSampler(inst, dest).catch((err) => {
        console.warn("[GMSampler] failed to load:", inst, err);
        return null;
      }),
    );

    Promise.all(promises).then((results) => {
      const loaded = results.filter(Boolean).length;
      setAudioStatusMessage(
        `✓ ${loaded}/${nonPianoInstruments.length} instrumento(s) real(es) listos`,
      );
      setTimeout(() => setAudioStatusMessage(""), 3500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.title, song.source, isAudioReady]);

  // Sync adjustable sustain (release time) to audio engine in real-time
  useEffect(() => {
    if (samplerRef.current) {
      // Tone.Sampler requires using .set() method to update release time
      try {
        samplerRef.current.set({ release: sustainTime });
      } catch (e) {
        console.warn("Failed to update sampler release:", e);
      }
    }
    if (fallbackSynthsRef.current) {
      Object.values(fallbackSynthsRef.current).forEach((synth) => {
        synth.set({
          envelope: {
            release: sustainTime,
          },
        });
      });
    }
  }, [sustainTime]);

  // Sync master volume to audio engine
  useEffect(() => {
    if (volNodeRef.current) {
      volNodeRef.current.volume.rampTo(masterVolume, 0.05);
    }
  }, [masterVolume]);

  // Metronome: tick on each beat while playing
  useEffect(() => {
    if (!isAudioReady) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (metronomeOn) {
      const bpm = (song.bpm || 120) * playbackRate;
      const intervalMs = 60000 / bpm;
      metronomeRef.current?.triggerAttackRelease("32n", Tone.now());
      intervalId = setInterval(() => {
        metronomeRef.current?.triggerAttackRelease("32n", Tone.now());
      }, intervalMs);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [metronomeOn, song.bpm, playbackRate, isAudioReady]);

  // Sync metronome volume
  useEffect(() => {
    if (metronomeVolRef.current) {
      metronomeVolRef.current.volume.rampTo(
        metronomeVolume === 0 ? -Infinity : -6 + (1 - metronomeVolume) * -30,
        0.05,
      );
    }
  }, [metronomeVolume]);

  // Track settings mapping changes
  useEffect(() => {
    const nextMuted: Record<number, boolean> = {};
    const nextSolo: Record<number, boolean> = {};
    const nextVolumes: Record<number, number> = {};
    const nextInstruments: Record<number, string> = {};
    const nextColors: Record<number, string> = {};

    song.tracks.forEach((track, i) => {
      nextMuted[track.index] = false;
      nextSolo[track.index] = false;
      nextVolumes[track.index] = 0.8;
      nextInstruments[track.index] = track.instrument || "Acoustic Grand Piano";
      nextColors[track.index] =
        track.color || TRACK_COLORS[i % TRACK_COLORS.length];
    });

    setTrackMuted(nextMuted);
    setTrackSolo(nextSolo);
    setTrackVolumes(nextVolumes);
    setTrackInstruments(nextInstruments);
    setTrackColors(nextColors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song]);

  // Handle speed and master volume effects
  useEffect(() => {
    Tone.Transport.bpm.value = song.bpm * playbackRate;
  }, [playbackRate, song.bpm]);

  // Setup song loop scheduler
  const scheduleSongOnTransport = useCallback(() => {
    Tone.Transport.cancel(0);

    // Release ALL currently sounding voices to prevent accumulation
    samplerRef.current?.releaseAll();
    if (fallbackSynthsRef.current) {
      Object.values(fallbackSynthsRef.current).forEach((synth) =>
        synth.releaseAll(),
      );
    }
    activeFreqsRef.current.clear();
    activeVoicesRef.current = [];
    activePlaybackNotesRef.current.clear(); // ← add this
    setActivePlaybackNotes(new Set());

    // Encontrar si hay algún track en modo Solo
    const hasSolo = Object.values(stateRef.current.trackMuted).some(
      (_, idx) => trackSolo[idx],
    );

    // Piano-only mode: build set of non-piano track indices for fast lookup
    const nonPianoTrackIndices = new Set<number>();
    if (pianoOnlyMode) {
      song.tracks.forEach((t) => {
        const inst = (trackInstruments[t.index] ?? t.instrument).toLowerCase();
        if (
          !inst.includes("piano") &&
          !inst.includes("harpsichord") &&
          !inst.includes("clavinet")
        ) {
          nonPianoTrackIndices.add(t.index);
        }
      });
    }

    song.notes.forEach((note) => {
      // Filtrar tracks muteados o fuera de solo
      const isMuted = trackMuted[note.trackIndex];
      const isOutSolo = hasSolo && !trackSolo[note.trackIndex];
      if (isMuted || isOutSolo) return;

      // Piano-only mode: skip non-piano tracks
      if (nonPianoTrackIndices.has(note.trackIndex)) return;

      const trackInst =
        trackInstruments[note.trackIndex] || "Acoustic Grand Piano";
      const trackVol =
        trackVolumes[note.trackIndex] !== undefined
          ? trackVolumes[note.trackIndex]
          : 0.8;

      const duration = Math.max(0.04, note.duration);
      const tickStart = Math.round(
        (note.time / 60) * song.bpm * Tone.Transport.PPQ,
      );
      const tickEnd = Math.round(
        ((note.time + duration) / 60) * song.bpm * Tone.Transport.PPQ,
      );

      // Programar inicio de nota — solo muta el ref, sin React setState
      Tone.Transport.schedule((audioTime) => {
        const registry = engineRegistryRef.current;
        const instType = registry?.getType(trackInst);

        if (registry && instType === "piano" && scoreDocument) {
          // World-class Piano engine
          const part = scoreDocument.parts[note.trackIndex];
          const scoreNote = part?.measures
            .flatMap((m) => m.notes)
            .find((n) => n.id === note.id);
          if (scoreNote) {
            const pianoEng = registry.getPiano(String(note.trackIndex));
            pianoEng.triggerNote(
              {
                ...inferPianoParams(scoreNote, pianoPedalSustain),
                velocity: scoreNote.velocity * trackVol,
                sustainPedal: pianoPedalSustain,
                sostenutoActive: pianoPedalSostenuto,
                unaChordaActive: pianoPedalUnaCorda,
                halfPedalLevel: pianoHalfPedal,
              },
              audioTime,
            );
          } else {
            triggerAttack(
              note.midi,
              note.velocity * trackVol,
              note.trackIndex,
              trackInst,
              undefined,
              audioTime,
            );
          }
        } else if (registry && instType === "trumpet" && scoreDocument) {
          // World-class Trumpet engine
          const part = scoreDocument.parts[note.trackIndex];
          const scoreNote = part?.measures
            .flatMap((m) => m.notes)
            .find((n) => n.id === note.id);
          if (scoreNote) {
            const trumpetEng = registry.getTrumpet(String(note.trackIndex));
            trumpetEng.triggerNote(
              {
                ...inferTrumpetParams(scoreNote),
                velocity: scoreNote.velocity * trackVol,
                mute: trumpetMute,
                tonguing: trumpetTonguing,
                vibratoDepth: trumpetVibratoDepth,
                vibratoRate: trumpetVibratoRate,
                vibratoDelay: trumpetVibratoDelay,
                fall: trumpetFall ? 0.3 : undefined,
                fallSemitones: trumpetFall ? -5 : undefined,
                doit: trumpetDoit ? 0.2 : undefined,
                doitSemitones: trumpetDoit ? 3 : undefined,
                shake: trumpetShake,
                shakeSemitones: 2,
              },
              audioTime,
            );
          } else {
            triggerAttack(
              note.midi,
              note.velocity * trackVol,
              note.trackIndex,
              trackInst,
              undefined,
              audioTime,
            );
          }
        } else {
          // Generic fallback engine
          triggerAttack(
            note.midi,
            note.velocity * trackVol,
            note.trackIndex,
            trackInst,
            undefined,
            audioTime,
          );
        }
        // Increment count for this MIDI note
        const currentCount = activePlaybackNotesRef.current.get(note.midi) || 0;
        activePlaybackNotesRef.current.set(note.midi, currentCount + 1);
      }, tickStart + "i");

      // Programar fin de nota
      Tone.Transport.schedule(() => {
        triggerRelease(note.midi, note.trackIndex);
        // Decrement count, remove if reaches 0
        const currentCount = activePlaybackNotesRef.current.get(note.midi) || 0;
        if (currentCount <= 1) {
          activePlaybackNotesRef.current.delete(note.midi);
        } else {
          activePlaybackNotesRef.current.set(note.midi, currentCount - 1);
        }
      }, tickEnd + "i");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    song,
    trackMuted,
    trackSolo,
    trackInstruments,
    trackVolumes,
    pianoOnlyMode,
    triggerAttack,
    triggerRelease,
  ]);

  // Playback state control loops
  const syncTransportClock = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    const tick = () => {
      if (Tone.Transport.state !== "started") {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        return;
      }

      const nextTime =
        (Tone.Transport.ticks / Tone.Transport.PPQ / song.bpm) * 60;

      // In pitch practice mode, check if we need to pause at the next upcoming onset
      const { pitchPractice: localPractice, songOnsets: localOnsets } =
        stateRef.current;
      if (localPractice) {
        const upcoming = localOnsets.find((onset) => {
          return (
            onset.time > lastPlayedTimeRef.current &&
            nextTime >= onset.time - 0.01
          );
        });
        if (upcoming) {
          Tone.Transport.pause();
          Tone.Transport.ticks = Math.round(
            (upcoming.time / 60) * song.bpm * Tone.Transport.PPQ,
          );
          setCurrentTime(upcoming.time);
          setIsPlaying(false);
          if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          return;
        }
      }

      setCurrentTime(nextTime);
      updateGameRuntimeRef.current(nextTime);
      // Sync active notes a React state: 1 vez por frame (60fps) en vez de por nota
      // Convert Map keys to Set for React state
      setActivePlaybackNotes(new Set(activePlaybackNotesRef.current.keys()));

      if (nextTime >= song.duration) {
        if (screen === "game" && stateRef.current.gameStatus === "playing") {
          setCurrentTime(song.duration);
          finishGameRoundRef.current();
          return;
        }
        Tone.Transport.stop();
        Tone.Transport.ticks = 0;
        setCurrentTime(0);
        setIsPlaying(false);
        activePlaybackNotesRef.current.clear();
        setActivePlaybackNotes(new Set());
        lastPlayedTimeRef.current = -1;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    if (Tone.Transport.state === "started") {
      rafRef.current = requestAnimationFrame(tick);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.duration, screen]);

  // Reactively update playing tempo when playbackRate or song changes
  useEffect(() => {
    Tone.Transport.bpm.value = song.bpm * playbackRate;
  }, [playbackRate, song.bpm]);

  const stopPlayback = useCallback(() => {
    // Release all sounding voices immediately
    samplerRef.current?.releaseAll();
    getLoadedGMSamplers().forEach((s) => s.releaseAll());
    if (fallbackSynthsRef.current) {
      Object.values(fallbackSynthsRef.current).forEach((s) => s.releaseAll());
    }
    Tone.Transport.stop();
    Tone.Transport.ticks = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    setActiveMidiNotes(new Set());
    setActivePlaybackNotes(new Set());
    activePlaybackNotesRef.current.clear();
    sustainedNotesRef.current.clear();
    activeVoicesRef.current = [];
    lastPlayedTimeRef.current = -1;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const pausePlayback = useCallback(() => {
    samplerRef.current?.releaseAll();
    getLoadedGMSamplers().forEach((s) => s.releaseAll());
    if (fallbackSynthsRef.current) {
      Object.values(fallbackSynthsRef.current).forEach((s) => s.releaseAll());
    }
    Tone.Transport.pause();
    setIsPlaying(false);
    setActiveMidiNotes(new Set());
    setActivePlaybackNotes(new Set());
    activePlaybackNotesRef.current.clear();
    sustainedNotesRef.current.clear();
    activeVoicesRef.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const startPlayback = useCallback(async () => {
    if (!song.notes.length) return;
    if (!stateRef.current.isAudioReady) {
      setIsAudioLoading(true);
      try {
        await initializeAudio();
      } finally {
        setIsAudioLoading(false);
      }
    }
    scheduleSongOnTransport();

    Tone.Transport.bpm.value = song.bpm * playbackRate;
    Tone.Transport.ticks = Math.round(
      (currentTime / 60) * song.bpm * Tone.Transport.PPQ,
    );
    lastPlayedTimeRef.current = currentTime - 0.01;
    Tone.Transport.start();
    setIsPlaying(true);
    syncTransportClock();
  }, [
    song,
    playbackRate,
    currentTime,
    scheduleSongOnTransport,
    syncTransportClock,
    initializeAudio,
  ]);

  const seekTo = useCallback(
    (nextTime: number) => {
      const clamped = clamp(nextTime, 0, song.duration);
      setCurrentTime(clamped);
      Tone.Transport.ticks = Math.round(
        (clamped / 60) * song.bpm * Tone.Transport.PPQ,
      );
      activePlaybackNotesRef.current.clear();
      setActivePlaybackNotes(new Set());
      lastPlayedTimeRef.current = clamped - 0.01;

      if (isPlaying) {
        scheduleSongOnTransport();
        Tone.Transport.start();
        syncTransportClock();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [song.duration, isPlaying, scheduleSongOnTransport, syncTransportClock],
  );

  const gameBestKey = useMemo(
    () => `${song.title}::${gameMode}::${gameDifficulty}`,
    [song.title, gameMode, gameDifficulty],
  );
  const currentGameBest = gameBestScores[gameBestKey];

  const clearGameTimers = useCallback(() => {
    if (gameCountdownTimerRef.current !== null) {
      window.clearInterval(gameCountdownTimerRef.current);
      gameCountdownTimerRef.current = null;
    }
    if (gameGradeTimerRef.current !== null) {
      window.clearTimeout(gameGradeTimerRef.current);
      gameGradeTimerRef.current = null;
    }
  }, []);

  const prepareGameRound = useCallback(() => {
    const hasSolo = Object.values(trackSolo).some(Boolean);
    const source = song.notes.filter((note) => {
      const isMuted = trackMuted[note.trackIndex];
      const isOutSolo = hasSolo && !trackSolo[note.trackIndex];
      return !isMuted && !isOutSolo;
    }) as RhythmSourceNote[];

    const chart = buildGameChart(source, {
      difficulty: gameDifficulty,
      mode: gameMode,
      rangeStart,
      rangeCount: RANGE_KEY_COUNT,
    });

    gameChartRef.current = chart;
    gameMissCursorRef.current = 0;
    gameAutoShiftCooldownRef.current = 0;
    setGameStats(createEnhancedGameStats(chart.length));
    setGameComboMilestone(null);
    setGameHitReadyNotes(new Set());
    prevGameTimeRef.current = 0;
    setGameLastGrade(null);
    setGameShiftLabel("");

    return chart;
  }, [gameDifficulty, gameMode, rangeStart, song.notes, trackMuted, trackSolo]);

  const persistGameBest = useCallback(
    (stats: EnhancedGameStats) => {
      if (stats.totalTargets === 0) return;
      setGameBestScores((prev) => {
        const current = prev[gameBestKey];
        if (current && current.score >= stats.score) return prev;

        return {
          ...prev,
          [gameBestKey]: {
            score: stats.score,
            accuracy: stats.accuracy,
            maxCombo: stats.maxCombo,
            date: new Date().toISOString(),
          },
        };
      });
    },
    [gameBestKey, setGameBestScores],
  );

  const finishGameRound = useCallback(
    (aborted: boolean = false) => {
      clearGameTimers();
      if (Tone.Transport.state === "started") {
        pausePlayback();
      }
      if (aborted) {
        setGameStatus("setup");
        setGameCountdown(0);
        return;
      }

      // Gamification: Process game results
      if (gameStatsRef.current.totalTargets > 0) {
        const stats = gameStatsRef.current;
        const maxScore = calculateMaxScore(stats.totalTargets, gameDifficulty);
        const stars = calculateStars(stats.score, maxScore);

        // Calculate XP reward
        const xpReward = calculateXPReward(
          stats.score,
          stats.accuracy,
          stats.maxCombo,
          gameDifficulty,
          0, // perfectStreak - will be tracked in enhanced stats later
        );

        // Add XP and check for level up
        const { profile: updatedProfile, levelUp } = addXP(
          playerProfile,
          xpReward.total,
        );

        // Convert to ExtendedGameStats
        const extendedStats = enhancedToExtendedStats(
          stats,
          song.title,
          song.title,
          gameDifficulty,
          stars,
          xpReward.total,
          song.duration,
        );

        // Update profile stats
        const profileWithStats = updateStats(
          updatedProfile,
          extendedStats,
          stars,
          song.duration,
        );

        // Check for new achievements
        const newAchievements = checkAchievements(
          profileWithStats,
          extendedStats,
        );

        // Unlock achievements
        let finalProfile = profileWithStats;
        newAchievements.forEach((achievementId) => {
          finalProfile = unlockAchievement(finalProfile, achievementId);
        });

        // Save song rating
        const rating = createSongRating(
          song.title,
          song.title,
          gameDifficulty,
          extendedStats,
          maxScore,
        );
        saveSongRating(rating);

        // Update state
        setPlayerProfile(finalProfile);
        saveProfile(finalProfile);
        setStarsEarned(stars);

        // Show XP notification
        setXpNotification({ amount: xpReward.total, show: true });
        setTimeout(() => setXpNotification({ amount: 0, show: false }), 3000);

        // Show level up modal
        if (levelUp) {
          setLevelUpEvent(levelUp);
          setTimeout(() => setLevelUpEvent(null), 5000);
        }

        // Show achievement toasts
        if (newAchievements.length > 0) {
          const toasts = newAchievements
            .map((id) => {
              const achievement = getAchievementById(id);
              return achievement
                ? {
                    id: achievement.id,
                    name: achievement.name,
                    icon: achievement.icon,
                    description: achievement.description,
                  }
                : null;
            })
            .filter(Boolean) as Array<{
            id: string;
            name: string;
            icon: string;
            description: string;
          }>;

          setAchievementToasts(toasts);
          setTimeout(() => setAchievementToasts([]), 5000);
        }
      }
      persistGameBest(gameStatsRef.current);
      setGameStatus("results");
      setGameCountdown(0);
    },
    [
      clearGameTimers,
      pausePlayback,
      persistGameBest,
      playerProfile,
      gameDifficulty,
      song.title,
      song.duration,
    ],
  );

  const startGameRound = useCallback(() => {
    if (!song.notes.length) return;

    const chart = prepareGameRound();
    if (chart.length === 0) return;

    clearGameTimers();
    pausePlayback();
    seekTo(0);
    setPitchPractice(false);

    setGameStatus("countdown");
    setGameCountdown(3);

    let count = 3;
    gameCountdownTimerRef.current = window.setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearGameTimers();
        setGameCountdown(0);
        setGameStatus("playing");
        void startPlayback();
      } else {
        setGameCountdown(count);
      }
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    song.notes.length,
    prepareGameRound,
    clearGameTimers,
    pausePlayback,
    seekTo,
    startPlayback,
  ]);

  const handleActivateStarPower = useCallback(() => {
    setGameStats((prev) => {
      if (
        prev.starPower.active ||
        prev.starPower.available < prev.starPower.activationThreshold
      ) {
        return prev;
      }
      const newSP = activateStarPower(prev.starPower);
      return {
        ...prev,
        starPower: newSP,
        starPowerActivations: prev.starPowerActivations + 1,
      };
    });
  }, []);

  const registerGameHit = useCallback(
    (midi: number) => {
      if (screen !== "game") return;
      if (stateRef.current.gameStatus !== "playing") return;

      const chart = gameChartRef.current;
      if (chart.length === 0) return;

      const windows = timingWindowsRef.current;
      const now = stateRef.current.currentTime;
      const goodSec = windows.goodMs / 1000;

      let bestIdx = -1;
      let bestDeltaMs = Number.POSITIVE_INFINITY;

      for (let i = 0; i < chart.length; i++) {
        const note = chart[i];
        if (note.hit || note.missed || note.midi !== midi) continue;

        const deltaMs = (now - note.time) * 1000;
        const absDeltaMs = Math.abs(deltaMs);
        if (absDeltaMs > windows.goodMs) continue;

        if (absDeltaMs < bestDeltaMs) {
          bestDeltaMs = absDeltaMs;
          bestIdx = i;
        }

        if (note.time > now + goodSec) break;
      }

      if (bestIdx === -1) {
        // No note in timing window — check if pressing too early
        // (note exists for this midi within the next 1s)
        let tooEarlyNote: (typeof chart)[0] | undefined;
        const scanEnd = Math.min(chart.length, gameMissCursorRef.current + 60); // scan max 60 notes ahead
        for (let i = gameMissCursorRef.current; i < scanEnd; i++) {
          const n = chart[i];
          if (n.hit || n.missed) continue;
          if (n.time > now + 1.0) break; // too far ahead
          if (n.midi === midi && n.time > now) {
            tooEarlyNote = n;
            break;
          }
        }
        if (tooEarlyNote) {
          // Flash MISS grade so player gets feedback that timing is off
          setGameLastGrade("miss");
          if (gameGradeTimerRef.current !== null)
            window.clearTimeout(gameGradeTimerRef.current);
          gameGradeTimerRef.current = window.setTimeout(() => {
            setGameLastGrade(null);
            gameGradeTimerRef.current = null;
          }, 350);
        }
        return;
      }

      const grade = classifyHit(bestDeltaMs, windows);
      if (grade === "miss") return;

      const target = chart[bestIdx];
      target.hit = true;
      target.grade = grade;
      target.deltaMs = bestDeltaMs;

      // Track combo milestone announcements
      const COMBO_MILESTONES = [10, 25, 50, 100, 250];
      const curCombo = gameStatsRef.current.combo;
      const nextCombo = curCombo + 1;
      for (const m of COMBO_MILESTONES) {
        if (curCombo < m && nextCombo >= m) {
          setGameComboMilestone(m);
          setTimeout(() => setGameComboMilestone(null), 2000);
          break;
        }
      }
      setGameStats((prev) => applyEnhancedGameHit(prev, grade));
      setGameLastGrade(grade);
      if (gameGradeTimerRef.current !== null) {
        window.clearTimeout(gameGradeTimerRef.current);
      }
      gameGradeTimerRef.current = window.setTimeout(() => {
        setGameLastGrade(null);
        gameGradeTimerRef.current = null;
      }, 480);
    },
    [screen],
  );

  const updateGameRuntime = useCallback(
    (nowSec: number) => {
      if (screen !== "game") return;
      if (stateRef.current.gameStatus !== "playing") return;

      const chart = gameChartRef.current;
      if (chart.length === 0) return;

      const missThreshold = nowSec - timingWindowsRef.current.goodMs / 1000;

      let missCount = 0;
      while (gameMissCursorRef.current < chart.length) {
        const note = chart[gameMissCursorRef.current];
        if (note.time > missThreshold) break;
        if (!note.hit && !note.missed) {
          note.missed = true;
          note.grade = "miss";
          missCount += 1;
        }
        gameMissCursorRef.current += 1;
      }

      const nowDelta = Math.min(
        Math.max(0, nowSec - prevGameTimeRef.current),
        1.0,
      );
      prevGameTimeRef.current = nowSec;

      if (missCount > 0 || nowDelta > 0) {
        setGameStats((prev) => {
          let next = prev;
          for (let i = 0; i < missCount; i++) {
            next = applyEnhancedGameMiss(next);
          }
          if (nowDelta > 0 && next.starPower.active) {
            next = {
              ...next,
              starPower: updateStarPower(next.starPower, nowDelta),
            };
          }
          return next === prev ? prev : next; // skip update if nothing changed
        });
      }

      if (stateRef.current.gameGhostAssist) {
        const assist = new Set<number>(); // coming up (300–600ms)
        const ready = new Set<number>(); // within timing window – HIT NOW
        const goodSec = timingWindowsRef.current.goodMs / 1000;
        const lookAhead = 0.6;
        for (let i = gameMissCursorRef.current; i < chart.length; i++) {
          const note = chart[i];
          if (note.hit || note.missed) continue;
          if (note.time < nowSec - 0.08) continue;
          if (note.time > nowSec + lookAhead) break;
          if (note.time <= nowSec + goodSec) {
            ready.add(note.midi);
          } else {
            assist.add(note.midi);
          }
          if (assist.size + ready.size >= 10) break;
        }
        setGameAssistNotesState((prev) => {
          if (prev.size === assist.size) {
            let same = true;
            for (const midi of assist) {
              if (!prev.has(midi)) {
                same = false;
                break;
              }
            }
            if (same) return prev;
          }
          return assist;
        });
        setGameHitReadyNotes((prev) => {
          if (prev.size === ready.size) {
            let same = true;
            for (const midi of ready) {
              if (!prev.has(midi)) {
                same = false;
                break;
              }
            }
            if (same) return prev;
          }
          return ready;
        });
      } else {
        setGameAssistNotesState((prev) => (prev.size === 0 ? prev : new Set()));
        setGameHitReadyNotes((prev) => (prev.size === 0 ? prev : new Set()));
      }

      if (
        stateRef.current.gameMode === "learn" &&
        stateRef.current.gameAutoShift
      ) {
        if (nowSec >= gameAutoShiftCooldownRef.current) {
          const lookAheadSec =
            stateRef.current.gameDifficulty === "easy"
              ? 2
              : stateRef.current.gameDifficulty === "normal"
                ? 1.5
                : stateRef.current.gameDifficulty === "hard"
                  ? 1
                  : 0.75;

          const currentRangeStart = stateRef.current.rangeStart;
          const targetStart = computeAutoShiftTarget(
            chart,
            nowSec,
            currentRangeStart,
            {
              lookAheadSec,
              minMidi: PIANO_MIN_MIDI,
              maxMidi: PIANO_MAX_MIDI,
              rangeCount: RANGE_KEY_COUNT,
              snap: snapToC,
            },
          );

          if (targetStart !== null && targetStart !== currentRangeStart) {
            setRangeStart(targetStart);
            setGameShiftLabel(
              `${midiToLabel(targetStart)} → ${midiToLabel(targetStart + RANGE_KEY_COUNT - 1)}`,
            );

            const cooldownSec =
              stateRef.current.gameDifficulty === "easy"
                ? 6
                : stateRef.current.gameDifficulty === "normal"
                  ? 4
                  : stateRef.current.gameDifficulty === "hard"
                    ? 3
                    : 2;
            gameAutoShiftCooldownRef.current = nowSec + cooldownSec;
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [screen],
  );

  useEffect(() => {
    updateGameRuntimeRef.current = updateGameRuntime;
  }, [updateGameRuntime]);

  useEffect(() => {
    finishGameRoundRef.current = finishGameRound;
  }, [finishGameRound]);

  useEffect(() => {
    timingWindowsRef.current = getTimingWindows(gameDifficulty);
  }, [gameDifficulty]);

  useEffect(() => {
    if (!gameShiftLabel) return;
    const timer = window.setTimeout(() => setGameShiftLabel(""), 1200);
    return () => window.clearTimeout(timer);
  }, [gameShiftLabel]);

  useEffect(() => {
    if (screen === "game") return;
    if (gameStatus === "playing" || gameStatus === "countdown") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      finishGameRound(true);
    }
  }, [screen, gameStatus, finishGameRound]);

  useEffect(() => {
    if (screen !== "game") return;
    if (gameStatus === "playing" && !isPlaying && currentTime > 0.2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      finishGameRound();
    }
  }, [screen, gameStatus, isPlaying, currentTime, finishGameRound]);

  useEffect(() => {
    clearGameTimers();
    gameChartRef.current = [];
    gameMissCursorRef.current = 0;
    /* eslint-disable react-hooks/set-state-in-effect */
    setGameStatus("setup");
    setGameCountdown(0);
    setGameStats(createEnhancedGameStats(0));
    setGameComboMilestone(null);
    setGameHitReadyNotes(new Set());
    setGameLastGrade(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [song.title, clearGameTimers]);

  // Parse external MIDI files
  const parseMidiFile = useCallback(
    async (file: File) => {
      const bytes = await file.arrayBuffer();
      const midi = new Midi(bytes);
      const parsedTracks: SongTrack[] = [];
      const parsedNotes: SongNote[] = [];

      // Filtrar: solo pistas con notas, sin percusión (channel 10), max 8
      const validTracks = midi.tracks
        .map((track, i) => ({ track, origIdx: i }))
        .filter(({ track }) => {
          if (track.notes.length === 0) return false;
          // Omitir pistas de percusión (channel 10)
          const isDrums =
            track.channel === 9 ||
            track.channel === 10 ||
            track.instrument?.percussion === true ||
            (track.name?.toLowerCase().match(/drum|perc|kit|beat/) ?? false);
          return !isDrums;
        })
        .sort((a, b) => b.track.notes.length - a.track.notes.length) // más notas primero
        .slice(0, 8); // máximo 8 pistas

      validTracks.forEach(({ track, origIdx }, newIdx) => {
        const color = TRACK_COLORS[newIdx % TRACK_COLORS.length];
        const noteCount = track.notes.length;

        parsedTracks.push({
          index: newIdx,
          name: track.name?.trim() || `Pista ${newIdx + 1}`,
          instrument: gmProgramToInstrument(
            track.instrument?.number ?? 0,
            track.name,
          ),
          noteCount,
          color,
        });

        track.notes.forEach((note, noteIndex) => {
          parsedNotes.push({
            id: `midi-${origIdx}-${noteIndex}-${note.midi}`,
            midi: note.midi,
            time: note.time,
            duration: Math.max(0.04, note.duration),
            velocity: note.velocity || 0.75,
            trackIndex: newIdx,
          });
        });
      });

      parsedNotes.sort((a, b) => a.time - b.time);
      const duration = parsedNotes.reduce(
        (max, note) => Math.max(max, note.time + note.duration),
        0,
      );
      const bpm = Math.round(midi.header.tempos[0]?.bpm || 120);

      const newSong: SongData = {
        title: file.name.replace(/\.[^.]+$/, ""),
        source: "Archivo subido",
        duration,
        bpm,
        notes: parsedNotes,
        tracks: parsedTracks,
      };

      setSongsList((prev) => [
        newSong,
        ...prev.filter((s) => s.title !== newSong.title),
      ]);
      setSong(newSong);
      stopPlayback();

      // Auto-centrar el rango sobre el rango de notas del MIDI importado
      if (parsedNotes.length > 0) {
        const mids = parsedNotes.map((n) => n.midi);
        const lo = Math.min(...mids);
        const hi = Math.max(...mids);
        const center = Math.round((lo + hi) / 2);
        const bestStart = clamp(
          Math.round(center / 12) * 12,
          PIANO_MIN_MIDI,
          PIANO_MAX_MIDI - RANGE_KEY_COUNT + 1,
        );
        setRangeStart(bestStart);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopPlayback],
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await parseMidiFile(file);
    },
    [parseMidiFile],
  );

  // ---- MusicXML / Universal score importer ----
  const handleScoreImport = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase();
      const isMidi = lower.endsWith(".mid") || lower.endsWith(".midi");
      const isMusicXML = lower.endsWith(".xml") || lower.endsWith(".mxl");

      setScoreImportLoading(true);
      setScoreImportError(null);

      try {
        if (isMidi) {
          // Use existing MIDI parser, no score document
          await parseMidiFile(file);
          setScoreDocument(null);
          setScoreAnalysis(null);
          setScoreParts([]);
          setScoreLastImported(file.name);
          stopPlayback();
          setScreen("studio");
        } else if (isMusicXML) {
          // Parse MusicXML
          const xmlText = await file.text();
          const result = await parseMusicXML(file);
          if (!result.success || !result.score) {
            setScoreImportError(
              result.errors[0] ?? "Error desconocido al parsear",
            );
            return;
          }
          const sc = result.score;

          // Cache original XML for OSMD rendering
          cacheScoreXML(sc.id, xmlText);

          // Run musical analysis
          const analysis = analyzeScore(sc);
          sc.metadata.detectedKey = analysis.detectedKey;
          sc.metadata.detectedChords = analysis.chords;
          sc.metadata.difficulty = analysis.difficulty;

          // Convert to SongData format for existing playback
          const songData = scoreToParts(sc);
          const newSong: SongData = {
            title: songData.title,
            source: "MusicXML",
            duration: songData.duration,
            bpm: songData.bpm,
            notes: songData.notes.map((n) => ({
              id: n.id,
              midi: n.midi,
              time: n.time,
              duration: n.duration,
              velocity: n.velocity,
              trackIndex: n.trackIndex,
            })),
            tracks: songData.tracks.map((t) => ({
              index: t.index,
              name: t.name,
              instrument: t.instrument,
              noteCount: t.noteCount,
              color: t.color,
            })),
          };

          setSong(newSong);
          setSongsList((prev) => [
            newSong,
            ...prev.filter((s) => s.title !== newSong.title),
          ]);
          setScoreDocument(sc);
          setScoreAnalysis(analysis);
          setScoreParts(sc.parts);
          setScoreLastImported(sc.metadata.title);
          stopPlayback();
          setScreen("score");
        } else {
          setScoreImportError(
            "Formato no soportado. Usa .xml, .mxl, .mid o .midi",
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setScoreImportError(`Error: ${msg}`);
      } finally {
        setScoreImportLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parseMidiFile, stopPlayback],
  );

  // Sync scoreParts changes back to song tracks
  const handlePartVolumeChange = useCallback(
    (partId: string, volume: number) => {
      setScoreParts((prev) =>
        prev.map((p) => (p.id === partId ? { ...p, volume } : p)),
      );
      const idx = scoreParts.findIndex((p) => p.id === partId);
      if (idx >= 0) setTrackVolumes((prev) => ({ ...prev, [idx]: volume }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoreParts],
  );

  const handlePartPanChange = useCallback((partId: string, pan: number) => {
    setScoreParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, pan } : p)),
    );
  }, []);

  const handlePartMuteToggle = useCallback((partId: string) => {
    setScoreParts((prev) => {
      const updated = prev.map((p) =>
        p.id === partId ? { ...p, muted: !p.muted } : p,
      );
      const idx = prev.findIndex((p) => p.id === partId);
      if (idx >= 0) setTrackMuted((tm) => ({ ...tm, [idx]: !prev[idx].muted }));
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePartSoloToggle = useCallback((partId: string) => {
    setScoreParts((prev) => {
      const wasSolo = prev.find((p) => p.id === partId)?.solo ?? false;
      const updated = prev.map((p) =>
        p.id === partId ? { ...p, solo: !wasSolo } : p,
      );
      updated.forEach((p, idx) => {
        setTrackSolo((ts) => ({ ...ts, [idx]: p.solo }));
      });
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePartVisibilityToggle = useCallback((partId: string) => {
    setScoreParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, visible: !p.visible } : p)),
    );
  }, []);

  const handlePartInstrumentChange = useCallback(
    (partId: string, instrument: string) => {
      setScoreParts((prev) =>
        prev.map((p) => (p.id === partId ? { ...p, instrument } : p)),
      );
      const idx = scoreParts.findIndex((p) => p.id === partId);
      if (idx >= 0)
        setTrackInstruments((prev) => ({ ...prev, [idx]: instrument }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoreParts],
  );

  const handlePartColorChange = useCallback(
    (partId: string, color: string) => {
      setScoreParts((prev) =>
        prev.map((p) => (p.id === partId ? { ...p, color } : p)),
      );
      const idx = scoreParts.findIndex((p) => p.id === partId);
      if (idx >= 0) setTrackColors((prev) => ({ ...prev, [idx]: color }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoreParts],
  );

  // 60 FPS Canvas visualizer loop (with device-aware adaptive quality)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;

    let localRafId: number;
    const profile = getDeviceProfile();
    const targetFrameMs = 1000 / profile.targetFps;
    let lastDrawAt = 0;
    let isPageVisible = !document.hidden;
    let isWindowFocused = document.hasFocus();

    // Effective DPR — capped to avoid 4K canvas on 6 GB phones
    const dpr = Math.min(window.devicePixelRatio || 1, profile.maxDpr);

    // Resize handler with DPR cap
    const resizeCanvas = () => {
      const targetWidth = canvas.clientWidth;
      const targetHeight = canvas.clientHeight;
      if (!targetWidth || !targetHeight) return;

      const dw = Math.floor(targetWidth * dpr);
      const dh = Math.floor(targetHeight * dpr);

      if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw;
        canvas.height = dh;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resizeCanvas();

    // Use ResizeObserver instead of resize event for more accuracy + less work
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas);

    // Page Visibility — pause loop in background to save CPU/battery
    const onVisibility = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible && isWindowFocused && localRafId === 0) {
        localRafId = requestAnimationFrame(drawLoop);
      }
    };
    const onFocus = () => {
      isWindowFocused = true;
      if (isPageVisible && localRafId === 0) {
        localRafId = requestAnimationFrame(drawLoop);
      }
    };
    const onBlur = () => {
      isWindowFocused = false;
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    const drawLoop = (now?: number) => {
      // Pause if hidden / blurred
      if (!isPageVisible || !isWindowFocused) {
        localRafId = 0;
        return;
      }

      // Frame pacing: skip if last draw too recent (target FPS cap)
      const ts = now ?? performance.now();
      if (ts - lastDrawAt < targetFrameMs - 1) {
        localRafId = requestAnimationFrame(drawLoop);
        return;
      }
      lastDrawAt = ts;

      const {
        currentTime: localTime,
        rangeStart: localRangeStart,
        activeNotes: localActive,
        song: localSong,
        trackColors: localColors,
        scrollSensitivity: localSens,
        showParticles: localPartUser,
        practiceTargets: localPractice,
        keyFxColor: fxColor,
        keyFxGlow: fxGlow,
        keyFxIntensity: fxIntensity,
        showPet: _localShowPet,
        isPlaying: _localIsPlaying,
        gameStatus: localGameStatus,
        pianoOnlyMode: localPianoOnly,
        trackInstruments: localTrackInstruments,
      } = stateRef.current;

      // Device-tier override: low-tier disables particles regardless of user setting
      const localPart = localPartUser && profile.enableParticles;

      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      // Clear visualizer
      ctx.fillStyle = "#040406";
      ctx.fillRect(0, 0, width, height);

      // Get visible keys list to do positioning
      const visibleKeysList = Array.from(
        { length: RANGE_KEY_COUNT },
        (_, i) => localRangeStart + i,
      );
      const visibleWhiteNotes = visibleKeysList.filter((m) => !isBlackKey(m));
      const numWhiteKeys = visibleWhiteNotes.length;
      const whiteKeyWidth = width / numWhiteKeys;

      const getKeyPos = (midi: number) => {
        const isBk = isBlackKey(midi);
        if (!isBk) {
          const whiteIndex = visibleWhiteNotes.indexOf(midi);
          if (whiteIndex !== -1) {
            return { x: whiteIndex * whiteKeyWidth, width: whiteKeyWidth };
          }
        } else {
          // It's a black key. Find the white key just before it.
          const prevWhiteMidi = midi - 1;
          const prevWhiteIndex = visibleWhiteNotes.indexOf(prevWhiteMidi);
          if (prevWhiteIndex !== -1) {
            const borderX = (prevWhiteIndex + 1) * whiteKeyWidth;
            const blackWidth = whiteKeyWidth * 0.6; // 60% of white key width
            return { x: borderX - blackWidth / 2, width: blackWidth };
          } else {
            // Edge case: black key at the very beginning of the range
            const nextWhiteMidi = midi + 1;
            const nextWhiteIndex = visibleWhiteNotes.indexOf(nextWhiteMidi);
            if (nextWhiteIndex !== -1) {
              const borderX = nextWhiteIndex * whiteKeyWidth;
              const blackWidth = whiteKeyWidth * 0.6;
              return { x: borderX - blackWidth / 2, width: blackWidth };
            }
          }
        }
        return { x: 0, width: 0 };
      };

      // 1. Draw lanes backgrounds
      for (let i = 0; i < RANGE_KEY_COUNT; i++) {
        const midi = localRangeStart + i;
        const isBk = isBlackKey(midi);
        const { x, width: kw } = getKeyPos(midi);

        ctx.fillStyle = isBk
          ? "rgba(0, 0, 0, 0.18)"
          : "rgba(255, 255, 255, 0.015)";
        ctx.fillRect(x, 0, kw, height);

        // Lane separating border
        ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.moveTo(x + kw, 0);
        ctx.lineTo(x + kw, height);
        ctx.stroke();

        // Highlight active lanes or practice target lanes
        if (localActive.has(midi)) {
          // Vertical beam: strong at impact line, fades to zero at top
          const beam = ctx.createLinearGradient(x, height, x, 0);
          beam.addColorStop(0, hexToRgba(fxColor, fxIntensity * 0.55));
          beam.addColorStop(0.15, hexToRgba(fxColor, fxIntensity * 0.18));
          beam.addColorStop(0.4, hexToRgba(fxColor, fxIntensity * 0.05));
          beam.addColorStop(1, hexToRgba(fxColor, 0));
          ctx.fillStyle = beam;
          ctx.fillRect(x, 0, kw, height);
        } else if (localPractice && localPractice.has(midi)) {
          ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
          ctx.fillRect(x, 0, kw, height);
        }
      }

      // 2. Render Beat timing lines scrolling down
      const beatDuration = 60 / localSong.bpm;
      const pixelsPerSecond = 100 * localSens;
      const viewDuration = height / pixelsPerSecond;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;

      const startBeat = Math.floor(localTime / beatDuration);
      const endBeat = Math.ceil((localTime + viewDuration) / beatDuration);

      for (let b = startBeat; b <= endBeat; b++) {
        const beatTime = b * beatDuration;
        const delta = beatTime - localTime;
        const y = height - delta * pixelsPerSecond;

        if (y >= 0 && y <= height) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      }

      // 3. Render falling note rectangles – binary search O(log n) instead of O(n) filter
      const graceTime = 0.5;
      const windowStart = localTime - graceTime;
      const windowEnd = localTime + viewDuration;

      const noteSource: ReadonlyArray<{
        time: number;
        duration: number;
        midi: number;
        trackIndex: number;
      }> =
        screen === "game" && localGameStatus !== "setup"
          ? gameChartRef.current
          : localSong.notes;

      // Binary search: first note whose (time + duration) >= windowStart
      let lo = 0;
      let hi = noteSource.length - 1;
      let startIdx = noteSource.length;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (noteSource[mid].time + noteSource[mid].duration < windowStart) {
          lo = mid + 1;
        } else {
          startIdx = mid;
          hi = mid - 1;
        }
      }

      // Linear scan from startIdx — break early when note.time > windowEnd
      // Pre-build non-piano track indices set for piano-only mode
      const nonPianoTrackSet = new Set<number>();
      if (localPianoOnly) {
        localSong.tracks.forEach((t) => {
          const inst = (
            localTrackInstruments[t.index] ?? t.instrument
          ).toLowerCase();
          if (
            !inst.includes("piano") &&
            !inst.includes("harpsichord") &&
            !inst.includes("clavinet")
          ) {
            nonPianoTrackSet.add(t.index);
          }
        });
      }

      const visibleNotes: {
        time: number;
        duration: number;
        midi: number;
        trackIndex: number;
      }[] = [];
      for (let ni = startIdx; ni < noteSource.length; ni++) {
        const note = noteSource[ni];
        if (note.time > windowEnd) break;
        // Skip non-piano tracks in piano-only mode
        if (localPianoOnly && nonPianoTrackSet.has(note.trackIndex)) continue;
        if (
          note.midi >= localRangeStart &&
          note.midi < localRangeStart + RANGE_KEY_COUNT
        ) {
          visibleNotes.push(note);
        }
      }

      visibleNotes.forEach((note) => {
        const trackColor = localColors[note.trackIndex] || "#8b5cf6";
        const { x: rawX, width: kw } = getKeyPos(note.midi);
        const isBk = isBlackKey(note.midi);
        const pad = isBk ? 2 : 4;
        const x = rawX + pad;
        const rectWidth = Math.max(1, kw - pad * 2);

        const startY =
          height - (note.time + note.duration - localTime) * pixelsPerSecond;
        const endY = height - (note.time - localTime) * pixelsPerSecond;

        const rectHeight = Math.max(1, endY - startY);

        // Draw elegant rounded rect with glow + gradient
        const noteGrad = ctx.createLinearGradient(x, startY, x, endY);
        noteGrad.addColorStop(0, lightenHex(trackColor, 0.35));
        noteGrad.addColorStop(0.5, trackColor);
        noteGrad.addColorStop(1, trackColor);
        ctx.fillStyle = noteGrad;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1.5;
        // Glow (skipped on low-tier devices to save GPU)
        if (profile.enableShadowBlur) {
          ctx.shadowBlur = fxGlow * 22 * profile.effectsScale;
          ctx.shadowColor = trackColor;
        }

        const radius = Math.max(0, Math.min(6, rectWidth / 2, rectHeight / 2));
        ctx.beginPath();
        ctx.moveTo(x + radius, startY);
        ctx.lineTo(x + rectWidth - radius, startY);
        ctx.quadraticCurveTo(
          x + rectWidth,
          startY,
          x + rectWidth,
          startY + radius,
        );
        ctx.lineTo(x + rectWidth, endY - radius);
        ctx.quadraticCurveTo(x + rectWidth, endY, x + rectWidth - radius, endY);
        ctx.lineTo(x + radius, endY);
        ctx.quadraticCurveTo(x, endY, x, endY - radius);
        ctx.lineTo(x, startY + radius);
        ctx.quadraticCurveTo(x, startY, x + radius, startY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Create particles on Note hits — ONLY during playback, capped by device profile
        if (
          localPart &&
          localTime > 0 &&
          note.time <= localTime &&
          note.time + note.duration >= localTime
        ) {
          // 30-100 based on intensity, but never above device-tier max
          const baseCap = Math.round(30 + fxIntensity * 70);
          const particleCap = Math.min(baseCap, profile.maxParticles);
          if (
            particlesRef.current.length < particleCap &&
            Math.random() < 0.1 + fxIntensity * 0.15
          ) {
            // Alternate between fx color and track color for variety
            const useTrack = Math.random() < 0.4;
            const p =
              particlePoolRef.current.length > 0
                ? particlePoolRef.current.pop()!
                : ({} as NoteParticle);
            p.x = x + rectWidth * Math.random();
            p.y = height - 6;
            p.vx = (Math.random() - 0.5) * (2 + fxIntensity * 2);
            p.vy = -(Math.random() * 3 + 1) * (0.6 + fxIntensity * 0.8);
            p.color = useTrack ? trackColor : fxColor;
            p.size = (Math.random() * 2 + 1) * (0.5 + fxIntensity * 0.8);
            p.alpha = 0.8 + fxIntensity * 0.2;
            p.life = 0.7 + fxIntensity * 0.3;
            particlesRef.current.push(p);
          }
        }
      });

      // 4. Update and Draw Particles (capped, fast path)
      const particles = particlesRef.current;
      let aliveCount = 0;
      for (let pi = 0; pi < particles.length; pi++) {
        const p = particles[pi];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.025;
        p.life -= 0.025;

        if (p.life > 0) {
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          particles[aliveCount++] = p;
        } else {
          // Return to pool (max pool size 100)
          if (particlePoolRef.current.length < 100)
            particlePoolRef.current.push(p);
        }
      }
      particles.length = aliveCount;
      ctx.globalAlpha = 1.0;

      // 4b. Draw timing-zone hit band (only in game mode, makes hit window visible)
      if (localGameStatus === "playing") {
        const gameWindows = timingWindowsRef.current;
        const perfectPxH = (gameWindows.perfectPlusMs / 1000) * pixelsPerSecond;
        const goodPxH = (gameWindows.goodMs / 1000) * pixelsPerSecond;

        // GOOD zone (outermost, very subtle)
        const goodBand = ctx.createLinearGradient(
          0,
          height - goodPxH,
          0,
          height,
        );
        goodBand.addColorStop(0, "rgba(251,191,36,0)");
        goodBand.addColorStop(0.5, "rgba(251,191,36,0.04)");
        goodBand.addColorStop(1, "rgba(251,191,36,0.10)");
        ctx.fillStyle = goodBand;
        ctx.fillRect(0, height - goodPxH, width, goodPxH);

        // PERFECT+ zone (bright inner glow right at the line)
        const ppBand = ctx.createLinearGradient(
          0,
          height - perfectPxH,
          0,
          height,
        );
        ppBand.addColorStop(0, "rgba(255,215,0,0)");
        ppBand.addColorStop(0.6, "rgba(255,215,0,0.08)");
        ppBand.addColorStop(1, "rgba(255,215,0,0.22)");
        ctx.fillStyle = ppBand;
        ctx.fillRect(0, height - perfectPxH, width, perfectPxH);

        // Hard horizontal line exactly at the hit moment
        ctx.strokeStyle = "rgba(255,215,0,0.55)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, height - 1);
        ctx.lineTo(width, height - 1);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 5. Draw Impact visual line (themed glow)
      const lineGrad = ctx.createLinearGradient(0, 0, width, 0);
      lineGrad.addColorStop(0, hexToRgba(fxColor, 0));
      lineGrad.addColorStop(0.15, fxColor);
      lineGrad.addColorStop(0.5, lightenHex(fxColor, 0.3));
      lineGrad.addColorStop(0.85, fxColor);
      lineGrad.addColorStop(1, hexToRgba(fxColor, 0));
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 2.5;
      if (profile.enableShadowBlur) {
        ctx.shadowBlur = fxGlow * 18 * profile.effectsScale;
        ctx.shadowColor = fxColor;
      }
      ctx.beginPath();
      ctx.moveTo(0, height - 2);
      ctx.lineTo(width, height - 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 6. Piano Pet mascot (DISABLED - now using NeonRunnerAvatar SVG overlay)
      // if (localShowPet) {
      //   updateAndDrawPet(ctx, petRef.current, {
      //     isPlaying: localIsPlaying,
      //     activeNoteCount: localActive.size,
      //     bpm: localSong.bpm,
      //     skinId: localPetSkinId,
      //     fxColor,
      //     currentTime: localTime,
      //     width,
      //     height,
      //   });
      // }

      localRafId = requestAnimationFrame(drawLoop);
    };

    localRafId = requestAnimationFrame(drawLoop);

    return () => {
      cancelAnimationFrame(localRafId);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [screen]);

  // Resume playback on correct key press during Practice Mode
  useEffect(() => {
    if (!pitchPractice || isPlaying || !activeWaitingOnset) return;

    const pressedMidi = activeMidiNotes;
    const allPressed = activeWaitingOnset.midis.every((midi) =>
      pressedMidi.has(midi),
    );
    if (allPressed) {
      lastPlayedTimeRef.current = activeWaitingOnset.time;
      Tone.Transport.seconds = activeWaitingOnset.time;
      Tone.Transport.start();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPlaying(true);
      syncTransportClock();
    }
  }, [
    activeMidiNotes,
    pitchPractice,
    isPlaying,
    activeWaitingOnset,
    syncTransportClock,
  ]);

  // MIDI Hardware Handling logic
  // MIDI message handler — reads all fast-changing values from stateRef to stay STABLE
  const handleMidiMessage = useCallback(
    async (event: MIDIMessageEvent) => {
      if (!event.data || event.data.length < 3) return;
      const status = event.data[0];
      const data1 = event.data[1];
      const data2 = event.data[2];
      const command = status & 0xf0;

      // Pitch Bend modulation
      if (command === 0xe0) {
        const bend = ((data2 << 7) | data1) - 8192;
        const fraction = bend / 8192;
        const deadZone = 0.02;
        let finalBend = 0;
        if (Math.abs(fraction) > deadZone) {
          const sign = Math.sign(fraction);
          const scaled = (Math.abs(fraction) - deadZone) / (1 - deadZone);
          finalBend = Math.round(sign * scaled * 100);
        }
        setPitchBend(finalBend);
        return;
      }

      // Modulation wheel (CC 1) — controla el rango visible del teclado
      // MOD wheel — mueve rango por octavas (snap a C siempre)
      if (command === 0xb0 && data1 === 1) {
        // 0-127 mapeado a octavas C1(24) → C5(72) — snap a C
        const minC = 24; // C1
        const maxC = 72; // C5
        const numOctaves = (maxC - minC) / 12; // 4 pasos
        const newStart = snapToC(
          minC + Math.round((data2 / 127) * numOctaves) * 12,
        );
        setRangeStart(newStart);
        physicalAnchorRef.current = null;
        return;
      }

      // Sustain CC pedal
      if (command === 0xb0 && data1 === 64) {
        const isDown = data2 >= 64;
        setSustainDown(isDown);

        if (!isDown) {
          const held = stateRef.current.midiNotes;
          sustainedNotesRef.current.forEach((midi) => {
            if (!held.has(midi)) {
              triggerRelease(midi);
            }
          });
          sustainedNotesRef.current.clear();
        }
        return;
      }

      // Key on/off
      if (command !== 0x90 && command !== 0x80) return;

      const incomingMidi = data1;
      const rawVelocity = data2;
      const isNoteOn = command === 0x90 && rawVelocity > 0;

      // Read current values from ref (stable, no deps needed)
      const { velocityCurve: vc } = stateRef.current;

      // Apply velocity curve (mathematically correct gain mapping)
      // GM spec default = "piano" (gain = (v/127)²) — see utils/velocity.ts
      const velocity = applyVelocityCurve(rawVelocity / 127, vc);

      // Mostrar nota física real en el panel MIDI
      if (isNoteOn) setLastPhysicalMidi(incomingMidi);

      // Marcar como calibrado en la primera nota (sin cambiar el rango)
      // La auto-calibración se removió: era unreliable porque el device
      // manda notas altas al conectarse. El usuario usa MOD wheel + botón calibrar.
      if (physicalAnchorRef.current === null && isNoteOn) {
        physicalAnchorRef.current = stateRef.current.midiPhysicalBase;
      }

      // mapped = rangeStart + (physical - midiPhysicalBase)
      // Ambos son siempre nota C (múltiplo de 12) → offset SIEMPRE múltiplo de 12
      // Múltiplo de 12 preserva pitch class → blanca→blanca y negra→negra GARANTIZADO
      // Mover el rango (MOD / minimap) transpone en octavas exactas
      const physBase = stateRef.current.midiPhysicalBase;
      const mapped = clamp(
        stateRef.current.rangeStart + (incomingMidi - physBase),
        PIANO_MIN_MIDI,
        PIANO_MAX_MIDI,
      );

      if (!stateRef.current.isAudioReady) {
        await initializeAudio();
      }

      if (isNoteOn) {
        activePhysicalNotesRef.current.set(incomingMidi, mapped);
        activeNoteVelocitiesRef.current.set(mapped, velocity);
        setLastVelocity(rawVelocity);
        setActiveMidiNotes((prev) => {
          const next = new Set(prev);
          next.add(mapped);
          return next;
        });
        sustainedNotesRef.current.delete(mapped);
        triggerAttack(
          mapped,
          velocity,
          -1,
          "Acoustic Grand Piano",
          event.timeStamp,
        );
        registerGameHit(mapped);
      } else {
        const releaseMapped =
          activePhysicalNotesRef.current.get(incomingMidi) ?? mapped;
        activePhysicalNotesRef.current.delete(incomingMidi);
        activeNoteVelocitiesRef.current.delete(releaseMapped);
        setActiveMidiNotes((prev) => {
          const next = new Set(prev);
          next.delete(releaseMapped);
          return next;
        });
        if (stateRef.current.sustainDown) {
          sustainedNotesRef.current.add(releaseMapped);
        } else {
          triggerRelease(releaseMapped);
        }
      }
       
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [triggerAttack, triggerRelease, initializeAudio, registerGameHit],
  );

  const connectMidiInputs = useCallback(
    (inputId: string) => {
      const access = midiAccessRef.current;
      if (!access) return () => {};

      // Clear all existing attachments immediately
      for (const input of access.inputs.values()) {
        input.onmidimessage = null;
      }

      physicalAnchorRef.current = null;
      activePhysicalNotesRef.current.clear();
      setActiveMidiNotes(new Set());

      // Timeout allows the hardware port to stabilize and fully open before binding
      const timer = setTimeout(() => {
        const freshAccess = midiAccessRef.current;
        if (!freshAccess) return;

        if (inputId === "__all__") {
          for (const input of freshAccess.inputs.values()) {
            input.onmidimessage = handleMidiMessage;
          }
        } else {
          const input = freshAccess.inputs.get(inputId);
          if (input) {
            input.onmidimessage = handleMidiMessage;
          }
        }
      }, 10);

      return () => clearTimeout(timer);
    },
    [handleMidiMessage],
  );

  const refreshMidiDevices = useCallback(() => {
    const access = midiAccessRef.current;
    if (!access) return;

    const inputs = Array.from(access.inputs.values())
      .filter((input) => input.state === "connected")
      .map((input) => ({
        id: input.id,
        name: input.name || "Dispositivo MIDI sin nombre",
        state: input.state,
      }));

    setMidiInputs(inputs);
    setIsMidiScanning(false);

    if (inputs.length === 0) {
      setMidiStatus("Esperando controlador MIDI");
      setMidiError("Conecta tu controlador y espera detección automática.");
      setSelectedInputId("__all__");
      return;
    }

    const currentSelected = stateRef.current.selectedInputId;
    const savedSelected = localStorage.getItem("piano_selected_midi_input_id");
    const currentExists =
      currentSelected !== "__all__" &&
      inputs.some((input) => input.id === currentSelected);
    const savedExists =
      savedSelected &&
      savedSelected !== "__all__" &&
      inputs.some((input) => input.id === savedSelected);
    const targetId = currentExists
      ? currentSelected
      : savedExists
        ? savedSelected
        : inputs[0].id;
    const targetName = inputs.find((input) => input.id === targetId)?.name;

    setMidiStatus(
      targetName
        ? `Controlador activo: ${targetName}`
        : "Controlador MIDI activo",
    );
    setMidiError("");
    setSelectedInputId(targetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestMidiAccess = useCallback(async () => {
    setIsMidiScanning(true);
    setMidiStatus("Buscando controlador MIDI...");
    if (!("requestMIDIAccess" in navigator)) {
      setMidiPermission("unsupported");
      setMidiStatus("Navegador incompatible con Web MIDI");
      setMidiError(
        "Usa navegadores basados en Chromium (Chrome, Edge, Opera) para MIDI real.",
      );
      setIsMidiScanning(false);
      return;
    }

    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      setMidiPermission("granted");

      access.onstatechange = () => {
        refreshMidiDevices();
      };

      refreshMidiDevices();
    } catch {
      setMidiPermission("denied");
      setIsMidiScanning(false);
      setMidiStatus("Acceso MIDI denegado por el navegador");
      setMidiError(
        "Concede permisos MIDI en la barra de direcciones y reintenta.",
      );
    }
  }, [refreshMidiDevices]);

  // Mount logic setup
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    requestMidiAccess();

    const handleGlobalMouseUp = () => {
      if (mousePressedKeysRef.current.size > 0) {
        mousePressedKeysRef.current.forEach((midi) => {
          setActiveMidiNotes((prev) => {
            const next = new Set(prev);
            next.delete(midi);
            return next;
          });
          triggerRelease(midi);
        });
        mousePressedKeysRef.current.clear();
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      clearGameTimers();
      stopPlayback();
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      if (samplerRef.current) samplerRef.current.dispose();
      disposeAllGMSamplers();
      if (fallbackSynthsRef.current) {
        Object.values(fallbackSynthsRef.current).forEach((s) => s.dispose());
      }
      if (reverbRef.current) reverbRef.current.dispose();
      if (chorusRef.current) chorusRef.current.dispose();
      if (compressorRef.current) compressorRef.current.dispose();
      if (metronomeRef.current) metronomeRef.current.dispose();
      if (metronomeVolRef.current) metronomeVolRef.current.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync MIDI connections when selectedInputId or midiInputs change
  useEffect(() => {
    const cleanup = connectMidiInputs(selectedInputId);
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInputId, midiInputs]);

  // Computer keyboard piano mapping (ZSXDCVGBHNJM Q2W3ER5T6Y7UI9O0P) — 2 octaves chromatic
  // keyboardActiveRef: key -> actual midi played (so release always matches attack even if rangeStart changed)
  const keyboardMapRef = useRef<Map<string, number>>(new Map());
  const keyboardActiveRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const map = new Map<string, number>();
    // Lower row: Z=C3, S=C#3, X=D3, D=D#3, C=E3, V=F3, G=F#3, B=G3, H=G#3, N=A3, J=A#3, M=B3
    const lowerRow: [string, number][] = [
      ["z", 48],
      ["s", 49],
      ["x", 50],
      ["d", 51],
      ["c", 52],
      ["v", 53],
      ["g", 54],
      ["b", 55],
      ["h", 56],
      ["n", 57],
      ["j", 58],
      ["m", 59],
    ];
    // Upper row: Q=C4, 2=C#4, W=D4, 3=D#4, E=E4, R=F4, 5=F#4, T=G4, 6=G#4, Y=A4, 7=A#4, U=B4, I=C5, 9=C#5, O=D5, 0=D#5, P=E5
    const upperRow: [string, number][] = [
      ["q", 60],
      ["2", 61],
      ["w", 62],
      ["3", 63],
      ["e", 64],
      ["r", 65],
      ["5", 66],
      ["t", 67],
      ["6", 68],
      ["y", 69],
      ["7", 70],
      ["u", 71],
      ["i", 72],
      ["9", 73],
      ["o", 74],
      ["0", 75],
      ["p", 76],
    ];
    [...lowerRow, ...upperRow].forEach(([key, midi]) => map.set(key, midi));
    keyboardMapRef.current = map;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        tag === "BUTTON"
      )
        return;

      // ---- Pedal shortcuts ----
      if (e.code === "Space") {
        e.preventDefault();
        initializeAudio();
        setPianoPedalSustain(true);
        setSustainDown(true);
        engineRegistryRef.current?.getPiano("0").pressSustainPedal();
        return;
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        e.preventDefault();
        setPianoPedalSostenuto(true);
        engineRegistryRef.current?.getPiano("0").pressSostenuto();
        return;
      }
      if (e.code === "ControlLeft" || e.code === "ControlRight") {
        e.preventDefault();
        setPianoPedalUnaCorda(true);
        engineRegistryRef.current?.getPiano("0").pressUnaCorda();
        return;
      }

      const key = e.key.toLowerCase();
      const baseMidi = map.get(key);
      if (baseMidi !== undefined && !keyboardActiveRef.current.has(key)) {
        e.preventDefault();
        // Offset by rangeStart so keyboard follows the visible octave
        const offset = stateRef.current.rangeStart - INITIAL_RANGE_START;
        const midi = clamp(baseMidi + offset, PIANO_MIN_MIDI, PIANO_MAX_MIDI);
        initializeAudio();
        keyboardActiveRef.current.set(key, midi);
        setActiveMidiNotes((prev) => {
          const next = new Set(prev);
          next.add(midi);
          return next;
        });
        const vel = stateRef.current.mouseVelocity ?? 0.75;
        activeNoteVelocitiesRef.current.set(midi, vel);
        setLastVelocity(Math.round(vel * 127));
        triggerAttack(midi, vel);
        registerGameHit(midi);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // ---- Pedal release ----
      if (e.code === "Space") {
        setPianoPedalSustain(false);
        setSustainDown(false);
        engineRegistryRef.current?.getPiano("0").releaseSustainPedal();
        // Release sustained notes
        const held = stateRef.current.midiNotes;
        sustainedNotesRef.current.forEach((midi) => {
          if (!held.has(midi)) triggerRelease(midi);
        });
        sustainedNotesRef.current.clear();
        return;
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        setPianoPedalSostenuto(false);
        engineRegistryRef.current?.getPiano("0").releaseSostenuto();
        return;
      }
      if (e.code === "ControlLeft" || e.code === "ControlRight") {
        setPianoPedalUnaCorda(false);
        engineRegistryRef.current?.getPiano("0").releaseUnaCorda();
        return;
      }

      const key = e.key.toLowerCase();
      const midi = keyboardActiveRef.current.get(key);
      if (midi !== undefined) {
        keyboardActiveRef.current.delete(key);
        activeNoteVelocitiesRef.current.delete(midi);
        setActiveMidiNotes((prev) => {
          const next = new Set(prev);
          next.delete(midi);
          return next;
        });
        triggerRelease(midi);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [initializeAudio, triggerAttack, triggerRelease, registerGameHit]);

  // Custom key hover press triggers (for mouse interactive clicks)
  const handleKeyMouseDown = (midi: number) => {
    initializeAudio();
    mousePressedKeysRef.current.add(midi);
    setActiveMidiNotes((prev) => {
      const next = new Set(prev);
      next.add(midi);
      return next;
    });
    const vel = stateRef.current.mouseVelocity ?? 0.75;
    activeNoteVelocitiesRef.current.set(midi, vel);
    setLastVelocity(Math.round(vel * 127));
    triggerAttack(midi, vel);
    registerGameHit(midi);
  };

  // Minimap drag — snap a C siempre para patrón 2-3-2-3 correcto
  const handleMinimapMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const totalKeys = PIANO_MAX_MIDI - PIANO_MIN_MIDI;
    const clicked = Math.round(PIANO_MIN_MIDI + frac * totalKeys);
    const newStart = snapToC(clicked - Math.floor(RANGE_KEY_COUNT / 2));
    setRangeStart(newStart);
    physicalAnchorRef.current = null;
    minimapDragRef.current = { startX: e.clientX, startRange: newStart };
  };
  const handleMinimapMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!minimapDragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const totalKeys = PIANO_MAX_MIDI - PIANO_MIN_MIDI;
    // Snap a octavas al arrastrar — cada paso = 12 semitonos = 1 octava
    const rawDelta =
      ((e.clientX - minimapDragRef.current.startX) / rect.width) * totalKeys;
    const deltaOctaves = Math.round(rawDelta / 12) * 12;
    const newStart = snapToC(minimapDragRef.current.startRange + deltaOctaves);
    setRangeStart(newStart);
    physicalAnchorRef.current = null;
  };
  const handleMinimapMouseUp = () => {
    minimapDragRef.current = null;
  };

  const handleKeyMouseUp = (midi: number) => {
    mousePressedKeysRef.current.delete(midi);
    activeNoteVelocitiesRef.current.delete(midi);
    setActiveMidiNotes((prev) => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
    triggerRelease(midi);
  };

  // Filter song lists on Search inputs
  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songsList;
    const q = searchQuery.toLowerCase();
    return songsList.filter((s) => s.title.toLowerCase().includes(q));
  }, [songsList, searchQuery]);

  const gameAssistNotes =
     
    screen === "game" ? gameAssistNotesState : emptyAssistNotesRef.current;
  const gameHitReady =
     
    screen === "game" ? gameHitReadyNotes : emptyAssistNotesRef.current;

  return (
    <>
      <div className="app-container">
        {/* Sidebar Navigation rail */}
        <aside className="sidebar-rail" aria-label="Navegación Principal">
          <div className="logo-container">🎹</div>
          <button
            className={`rail-item ${screen === "studio" ? "active" : ""}`}
            onClick={() => setScreen("studio")}
            title="Studio"
          >
            <Icons.Studio />
            Studio
          </button>
          <button
            className={`rail-item ${screen === "game" ? "active" : ""}`}
            onClick={() => setScreen("game")}
            title="Modo Juego"
          >
            <Icons.Game />
            Juego
          </button>
          <button
            className={`rail-item ${screen === "songs" ? "active" : ""}`}
            onClick={() => setScreen("songs")}
            title="Canciones"
          >
            <Icons.Songs />
            Canciones
          </button>
          <button
            className={`rail-item ${screen === "tracks" ? "active" : ""}`}
            onClick={() => setScreen("tracks")}
            title="Pistas"
          >
            <Icons.Tracks />
            Pistas
          </button>
          <button
            className={`rail-item ${screen === "midi" ? "active" : ""}`}
            onClick={() => setScreen("midi")}
            title="Configuración MIDI"
          >
            <Icons.MIDI />
            MIDI
          </button>
          <button
            className={`rail-item ${screen === "settings" ? "active" : ""}`}
            onClick={() => setScreen("settings")}
            title="Ajustes"
          >
            <Icons.Settings />
            Ajustes
          </button>
          <button
            className={`rail-item ${screen === "score" ? "active" : ""} ${scoreDocument ? "rail-item--has-score" : ""}`}
            onClick={() => setScreen("score")}
            title="Partitura"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" ry="1" />
              <line x1="9" y1="12" x2="15" y2="12" />
              <line x1="9" y1="16" x2="12" y2="16" />
            </svg>
            Partitura
          </button>
        </aside>

        {/* Main Workspace */}
        <main className="main-workspace">
          {/* Topbar Header status */}
          <header className="topbar-header">
            <div className="title-container">
              <h1>Piano MIDI Pro</h1>
              <p>
                {song.title} · Original: {Math.round(song.bpm)} BPM ·{" "}
                {Math.floor(song.duration / 60)}:
                {Math.floor(song.duration % 60)
                  .toString()
                  .padStart(2, "0")}
              </p>
            </div>
            <div className="status-pills">
              <div className="status-pill">
                <span
                  className={`status-pill-dot ${
                    midiPermission === "granted" ? "success" : "warning"
                  }`}
                ></span>
                MIDI:{" "}
                {midiPermission === "granted" ? "Conectado" : "Desactivado"}
              </div>
              <div className="status-pill">
                <span className="status-pill-dot success"></span>
                {audioStatusMessage}
              </div>
            </div>
            <button
              className="profile-button"
              onClick={() => setShowProfilePanel(true)}
              title="Ver perfil de jugador"
            >
              <span className="profile-button-avatar">
                {playerProfile.avatar}
              </span>
              <span className="profile-button-level">
                Lv.{playerProfile.level}
              </span>
              <span
                style={{ color: "var(--text-primary)", fontSize: "0.82rem" }}
              >
                {playerProfile.username}
              </span>
            </button>
          </header>

          {/* Playback seeking and controls bar */}
          <section className="playback-bar">
            <div className="controls-left">
              <button
                className="btn primary"
                onClick={isPlaying ? pausePlayback : startPlayback}
                disabled={isAudioLoading}
              >
                {isAudioLoading ? (
                  <>
                    <span className="spinner" />
                    Cargando...
                  </>
                ) : (
                  <>
                    {isPlaying ? <Icons.Pause /> : <Icons.Play />}
                    {isPlaying ? "Pausa" : "Reproducir"}
                  </>
                )}
              </button>
              <button className="btn" onClick={stopPlayback}>
                <Icons.Stop />
                Detener
              </button>
              <button
                className={`btn ${metronomeOn ? "primary" : ""}`}
                onClick={() => {
                  if (!isAudioReady) initializeAudio();
                  setMetronomeOn(!metronomeOn);
                }}
                title={metronomeOn ? "Apagar metrónomo" : "Encender metrónomo"}
              >
                🪘 Metrónomo
              </button>
              <button
                type="button"
                className={`btn piano-only-toggle ${pianoOnlyMode ? "active" : ""}`}
                aria-pressed={pianoOnlyMode}
                title={
                  pianoOnlyMode
                    ? "Mostrar todos los instrumentos"
                    : "Solo piano (ocultar otros)"
                }
                onClick={() => setPianoOnlyMode(!pianoOnlyMode)}
              >
                <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>🎹</span>
                <span>Solo Piano</span>
                <span
                  className="piano-only-toggle-track"
                  aria-hidden
                  style={{
                    position: "relative",
                    display: "inline-block",
                    width: "30px",
                    height: "16px",
                    background: pianoOnlyMode
                      ? "var(--accent-primary, #8b5cf6)"
                      : "rgba(255,255,255,0.18)",
                    borderRadius: "10px",
                    transition: "background 160ms ease",
                    flexShrink: 0,
                    marginLeft: "2px",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "2px",
                      left: pianoOnlyMode ? "16px" : "2px",
                      width: "12px",
                      height: "12px",
                      background: "#fff",
                      borderRadius: "50%",
                      transition: "left 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                    }}
                  />
                </span>
              </button>
              <label className="btn btn-file">
                <Icons.Upload />
                <span>Cargar MIDI</span>
                <input
                  type="file"
                  accept=".mid,.midi"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                  onClick={(e) => {
                    (e.target as HTMLInputElement).value = "";
                  }}
                />
              </label>
              <div
                className="tempo-control"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--surface)",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
                >
                  Tempo:
                </span>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <input
                    type="number"
                    className="input-custom"
                    aria-label="BPM (tempo)"
                    style={{
                      width: "70px",
                      padding: "4px",
                      textAlign: "center",
                      background: "var(--bg)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      fontFamily: "monospace",
                    }}
                    min={10}
                    max={400}
                    value={Math.round(song.bpm * playbackRate)}
                    onChange={(e) => {
                      const newBpm = Number(e.target.value);
                      if (newBpm > 0) setPlaybackRate(newBpm / song.bpm);
                    }}
                  />
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    BPM
                  </span>
                </div>
              </div>
            </div>
            <div className="controls-right">
              <div className="time-display">
                {Math.floor(currentTime / 60)}:
                {Math.floor(currentTime % 60)
                  .toString()
                  .padStart(2, "0")}{" "}
                / {Math.floor(song.duration / 60)}:
                {Math.floor(song.duration % 60)
                  .toString()
                  .padStart(2, "0")}
              </div>
              <div className="seeker-container">
                <input
                  type="range"
                  className="slider-custom"
                  aria-label="Posición de la canción"
                  min={0}
                  max={song.duration || 0}
                  step={0.05}
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                />
              </div>
            </div>
          </section>

          {/* Studio main visualizer and keys view */}
          {(screen === "studio" || screen === "game") && (
            <section className="studio-workspace">
              {/* Left Range Controller panel */}
              <div className="panel-left">
                {screen === "game" && (
                  <div className="game-panel-card">
                    <h3>Modo Juego 37 teclas</h3>
                    <p className="game-panel-subtitle">
                      Aprende jugando estilo rhythm.{" "}
                      {gameMode === "learn"
                        ? "Auto-shift activo."
                        : "Rango fijo competitivo."}
                    </p>

                    <div className="game-row">
                      <label>Modo</label>
                      <select
                        className="input-custom"
                        value={gameMode}
                        onChange={(e) =>
                          setGameMode(e.target.value as GameMode)
                        }
                        disabled={
                          gameStatus === "playing" || gameStatus === "countdown"
                        }
                      >
                        <option value="learn">Aprender (Auto-Shift)</option>
                        <option value="score">Score Attack (Rango fijo)</option>
                      </select>
                    </div>

                    <div className="game-row">
                      <label>Dificultad</label>
                      <select
                        className="input-custom"
                        value={gameDifficulty}
                        onChange={(e) =>
                          setGameDifficulty(e.target.value as GameDifficulty)
                        }
                        disabled={
                          gameStatus === "playing" || gameStatus === "countdown"
                        }
                      >
                        <option value="easy">Easy</option>
                        <option value="normal">Normal</option>
                        <option value="hard">Hard</option>
                        <option value="expert">Expert</option>
                      </select>
                    </div>

                    <div className="game-toggle-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={gameAutoShift}
                          onChange={(e) => setGameAutoShift(e.target.checked)}
                          disabled={gameMode !== "learn"}
                        />
                        Auto-shift inteligente
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={gameGhostAssist}
                          onChange={(e) => setGameGhostAssist(e.target.checked)}
                        />
                        Ghost keys (ayuda)
                      </label>
                    </div>

                    {gameStatus === "setup" && (
                      <button
                        className="btn primary"
                        onClick={startGameRound}
                        disabled={!song.notes.length}
                      >
                        Iniciar Partida
                      </button>
                    )}

                    {gameStatus === "countdown" && (
                      <div className="game-countdown">{gameCountdown}</div>
                    )}

                    {gameStatus === "playing" && (
                      <div className="game-live-stats">
                        <div>
                          <span>Progreso</span>
                          <strong>
                            {Math.round(gameStats.progress * 100)}%
                          </strong>
                        </div>
                        <div>
                          <span>Piano Fury</span>
                          <strong
                            className={
                              gameStats.starPower.active ? "active" : ""
                            }
                          >
                            {gameStats.starPower.active
                              ? "⚡ ACTIVO"
                              : `${Math.round(gameStats.starPower.available)}%`}
                          </strong>
                        </div>
                        <button
                          className="btn"
                          onClick={() => finishGameRound()}
                        >
                          Terminar run
                        </button>
                      </div>
                    )}

                    {gameStatus === "results" && (
                      <div className="game-results-inline">
                        <div>🏁 Partida terminada</div>
                        <button
                          className="btn primary"
                          onClick={startGameRound}
                          disabled={!song.notes.length}
                        >
                          Reintentar
                        </button>
                        <button
                          className="btn"
                          onClick={() => {
                            setGameStatus("setup");
                            seekTo(0);
                          }}
                        >
                          Volver
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Rango activo */}
                <div className="range-header-row">
                  <span className="range-header-label">Rango</span>
                  <span className="range-header-badge">
                    {midiToLabel(rangeStart)}
                    <span className="range-header-sep">–</span>
                    {midiToLabel(rangeStart + RANGE_KEY_COUNT - 1)}
                  </span>
                </div>

                {/* Minimap interactivo — arrastra izq/der para cambiar octava */}
                <div
                  className="keyboard-minimap minimap-interactive"
                  role="slider"
                  aria-label="Seleccionar rango de teclado"
                  onMouseDown={handleMinimapMouseDown}
                  onMouseMove={handleMinimapMouseMove}
                  onMouseUp={handleMinimapMouseUp}
                  onMouseLeave={handleMinimapMouseUp}
                >
                  {fullPianoNotes.map((midi) => {
                    const inRange =
                      midi >= rangeStart && midi < rangeStart + RANGE_KEY_COUNT;
                    const classes = [
                      "minimap-key",
                      isBlackKey(midi) ? "black" : "white",
                      inRange ? "in-range" : "",
                    ].join(" ");
                    return <div key={midi} className={classes} />;
                  })}
                </div>
                <p className="minimap-hint">← arrastra para cambiar octava →</p>

                {/* Sustain elegante */}
                <div className="sustain-section">
                  <div className="sustain-header">
                    <span>Sustain</span>
                    <span className="sustain-badge">
                      {sustainTime.toFixed(1)}s
                    </span>
                  </div>
                  <div
                    className="sustain-track"
                    onMouseDown={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setSustainTime(
                        clamp(
                          0.2 + ((e.clientX - r.left) / r.width) * 4.8,
                          0.2,
                          5,
                        ),
                      );
                    }}
                    onMouseMove={(e) => {
                      if (e.buttons !== 1) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      setSustainTime(
                        clamp(
                          0.2 + ((e.clientX - r.left) / r.width) * 4.8,
                          0.2,
                          5,
                        ),
                      );
                    }}
                  >
                    <div
                      className="sustain-fill"
                      style={{ width: `${((sustainTime - 0.2) / 4.8) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Volumen Maestro */}
                <div className="sustain-section" style={{ marginTop: "16px" }}>
                  <div className="sustain-header">
                    <span>Volumen</span>
                    <span className="sustain-badge">
                      {masterVolume <= -35
                        ? "Mute"
                        : `${Math.round(Math.max(0, ((masterVolume + 40) / 40) * 100))}%`}
                    </span>
                  </div>
                  <div
                    className="sustain-track"
                    onMouseDown={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setMasterVolume(
                        -40 + ((e.clientX - r.left) / r.width) * 40,
                      );
                    }}
                    onMouseMove={(e) => {
                      if (e.buttons !== 1) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      setMasterVolume(
                        -40 + ((e.clientX - r.left) / r.width) * 40,
                      );
                    }}
                  >
                    <div
                      className="sustain-fill"
                      style={{
                        width: `${Math.max(0, ((masterVolume + 40) / 40) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Transposición Cromática */}
                <div className="sustain-section" style={{ marginTop: "16px" }}>
                  <div className="sustain-header">
                    <span>Transponer</span>
                    <span className="sustain-badge">
                      {transpose > 0
                        ? `+${transpose}`
                        : transpose === 0
                          ? "0"
                          : transpose}{" "}
                      st
                    </span>
                  </div>
                  <div
                    className="sustain-track"
                    onMouseDown={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTranspose(
                        Math.round(-12 + ((e.clientX - r.left) / r.width) * 24),
                      );
                    }}
                    onMouseMove={(e) => {
                      if (e.buttons !== 1) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      setTranspose(
                        Math.round(-12 + ((e.clientX - r.left) / r.width) * 24),
                      );
                    }}
                  >
                    <div
                      className="sustain-fill"
                      style={{ width: `${((transpose + 12) / 24) * 100}%` }}
                    />
                  </div>
                  <p
                    style={{
                      fontSize: "0.65rem",
                      color: "var(--text-muted)",
                      marginTop: "4px",
                      textAlign: "center",
                    }}
                  >
                    Arrastra para cambiar tonalidad (±12 semitonos)
                  </p>
                </div>

                {/* Velocidad de click/teclado */}
                <div className="sustain-section" style={{ marginTop: "16px" }}>
                  <div className="sustain-header">
                    <span>Velocidad click</span>
                    <span className="sustain-badge">
                      {Math.round(mouseVelocity * 127)}
                    </span>
                  </div>
                  <div
                    className="sustain-track"
                    onMouseDown={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setMouseVelocity(
                        clamp((e.clientX - r.left) / r.width, 0.01, 1),
                      );
                    }}
                    onMouseMove={(e) => {
                      if (e.buttons !== 1) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      setMouseVelocity(
                        clamp((e.clientX - r.left) / r.width, 0.01, 1),
                      );
                    }}
                  >
                    <div
                      className="sustain-fill"
                      style={{ width: `${mouseVelocity * 100}%` }}
                    />
                  </div>
                </div>

                {screen === "studio" && (
                  <>
                    {/* World-class Piano & Trumpet controls */}
                    <InstrumentControlsPanel
                      activeInstrument={
                        trackInstruments[0] ??
                        song.tracks[0]?.instrument ??
                        "Acoustic Grand Piano"
                      }
                      pianoPedalSustain={pianoPedalSustain}
                      pianoPedalSostenuto={pianoPedalSostenuto}
                      pianoPedalUnaCorda={pianoPedalUnaCorda}
                      pianoHalfPedal={pianoHalfPedal}
                      onPianoSustain={(v) => {
                        setPianoPedalSustain(v);
                        const reg = engineRegistryRef.current;
                        if (reg) {
                          if (v) reg.getPiano("0").pressSustainPedal();
                          else reg.getPiano("0").releaseSustainPedal();
                        }
                      }}
                      onPianoSostenuto={(v) => {
                        setPianoPedalSostenuto(v);
                        const reg = engineRegistryRef.current;
                        if (reg) {
                          if (v) reg.getPiano("0").pressSostenuto();
                          else reg.getPiano("0").releaseSostenuto();
                        }
                      }}
                      onPianoUnaCorda={(v) => {
                        setPianoPedalUnaCorda(v);
                        const reg = engineRegistryRef.current;
                        if (reg) {
                          if (v) reg.getPiano("0").pressUnaCorda();
                          else reg.getPiano("0").releaseUnaCorda();
                        }
                      }}
                      onPianoHalfPedal={(v) => {
                        setPianoHalfPedal(v);
                        engineRegistryRef.current
                          ?.getPiano("0")
                          .setHalfPedalLevel(v);
                      }}
                      trumpetMute={trumpetMute}
                      trumpetTonguing={trumpetTonguing}
                      trumpetVibratoDepth={trumpetVibratoDepth}
                      trumpetVibratoRate={trumpetVibratoRate}
                      trumpetVibratoDelay={trumpetVibratoDelay}
                      trumpetFall={trumpetFall}
                      trumpetDoit={trumpetDoit}
                      trumpetShake={trumpetShake}
                      onTrumpetMute={(v) => {
                        setTrumpetMute(v);
                        engineRegistryRef.current?.getTrumpet("0").setMute(v);
                      }}
                      onTrumpetTonguing={setTrumpetTonguing}
                      onTrumpetVibrato={(d, r, dl) => {
                        setTrumpetVibratoDepth(d);
                        setTrumpetVibratoRate(r);
                        setTrumpetVibratoDelay(dl);
                      }}
                      onTrumpetFall={setTrumpetFall}
                      onTrumpetDoit={setTrumpetDoit}
                      onTrumpetShake={setTrumpetShake}
                    />
                    <KeyFxPanel
                      themeId={keyFxThemeId}
                      color={keyFxColor}
                      glow={keyFxGlow}
                      intensity={keyFxIntensity}
                      onTheme={(id, col, gl) => {
                        setKeyFxThemeId(id);
                        setKeyFxColor(col);
                        setKeyFxGlow(gl);
                      }}
                      onColor={(col) => {
                        setKeyFxColor(col);
                        setKeyFxThemeId("custom");
                      }}
                      onGlow={setKeyFxGlow}
                      onIntensity={setKeyFxIntensity}
                    />

                    {/* ── Piano Pet panel ── */}
                    <div className="piano-pet-panel">
                      <div className="keyfx-header">
                        <span className="keyfx-icon">🐾</span>
                        <span className="keyfx-title">Piano Pet</span>
                        <label
                          className="switch"
                          style={{ marginLeft: "auto" }}
                        >
                          <input
                            type="checkbox"
                            checked={showPet}
                            onChange={(e) => setShowPet(e.target.checked)}
                          />
                          <span className="switch-slider" />
                        </label>
                      </div>
                      {showPet && (
                        <p
                          className="pet-hint"
                          style={{
                            marginTop: "12px",
                            fontSize: "0.85rem",
                            color: "var(--text-muted)",
                            textAlign: "center",
                          }}
                        >
                          🤖 Avatar "Neon Runner" con física realista
                          <br />
                          Evita teclas y salta cuando las presionas
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Canvas Note Falling visualizer stage & Piano keys */}
              <div className="center-stage">
                <div className="visualizer-container">
                  <canvas ref={canvasRef} className="visualizer-canvas" />

                  {/* Neon Runner Avatar - SVG physics overlay */}
                  {/* eslint-disable react-hooks/refs */}
                  {showPet && canvasRef.current && (
                    <NeonRunnerAvatar
                      canvasWidth={canvasRef.current.width}
                      canvasHeight={canvasRef.current.height}
                      groundY={canvasRef.current.height - 2}
                      activeKeys={activeNotes}
                      keyPositions={keyPositions}
                      show={showPet}
                      fxColor={keyFxColor}
                    />
                  )}
                  {/* eslint-enable react-hooks/refs */}

                  {screen === "game" && (
                    <GameHUD
                      stats={gameStats}
                      lastGrade={gameLastGrade}
                      status={gameStatus}
                      countdown={gameCountdown}
                      songProgress={gameStats.progress}
                      onActivateStarPower={handleActivateStarPower}
                      difficulty={gameDifficulty}
                      shiftLabel={gameShiftLabel}
                      comboMilestone={gameComboMilestone}
                    />
                  )}
                </div>
                <div className="piano-wrapper">
                  {/* White keys container */}
                  <div
                    className="white-keys-container"
                    style={{
                      display: "flex",
                      width: "100%",
                      height: "100%",
                      position: "relative",
                    }}
                  >
                    {/* eslint-disable-next-line react-hooks/refs */}
                    {(() => {
                      const visibleWhiteNotes = visibleNotes.filter(
                        (m) => !isBlackKey(m),
                      );
                      return visibleWhiteNotes.map((midi) => {
                        const isActive = activeNotes.has(midi);
                        const isTarget =
                          waitingPracticeNotes.has(midi) ||
                          gameAssistNotes.has(midi);
                        const isHitReady = gameHitReady.has(midi);
                        const noteName = midiToLabel(midi);

                        return (
                          <div
                            key={midi}
                            className={`piano-key-element white ${isActive ? "active-press" : ""} ${isHitReady ? "game-hit-ready" : isTarget ? "practice-target" : ""}`}
                            style={
                              {
                                flexGrow: 1,
                                "--active-key-color": keyFxColor,
                                "--active-key-glow": `${Math.round(keyFxGlow * 30)}px`,
                                "--press-depth": isActive
                                  ? activeNoteVelocitiesRef.current.get(midi) ?? 0.75
                                  : 0,
                              } as React.CSSProperties
                            }
                            onMouseDown={() => handleKeyMouseDown(midi)}
                            onMouseUp={() => handleKeyMouseUp(midi)}
                            onMouseEnter={(e) => {
                              if (e.buttons === 1) handleKeyMouseDown(midi);
                            }}
                            onMouseLeave={() =>
                              isActive && handleKeyMouseUp(midi)
                            }
                          >
                            <div className="piano-key-velvet-strip" />
                            {showNoteNames !== "none" && (
                              <span className="piano-key-label">
                                {showNoteNames === "name"
                                  ? noteName
                                  : midi % 12}
                              </span>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Black keys overlay container */}
                  <div
                    className="black-keys-container"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                      zIndex: 20,
                    }}
                  >
                    {/* eslint-disable-next-line react-hooks/refs */}
                    {(() => {
                      const visibleWhiteNotes = visibleNotes.filter(
                        (m) => !isBlackKey(m),
                      );
                      const numWhiteKeys = visibleWhiteNotes.length;
                      const whiteKeyWidthPercent = 100 / numWhiteKeys;
                      const blackKeyWidthPercent = whiteKeyWidthPercent * 0.6;

                      return visibleNotes.filter(isBlackKey).map((midi) => {
                        const isActive = activeNotes.has(midi);
                        const isTarget =
                          waitingPracticeNotes.has(midi) ||
                          gameAssistNotes.has(midi);
                        const isHitReady = gameHitReady.has(midi);
                        const noteName = midiToLabel(midi);

                        const prevWhiteMidi = midi - 1;
                        const whiteIndex =
                          visibleWhiteNotes.indexOf(prevWhiteMidi);
                        let leftPercent = 0;
                        let isVisible = true;

                        if (whiteIndex !== -1) {
                          leftPercent = (whiteIndex + 1) * whiteKeyWidthPercent;
                        } else {
                          const nextWhiteMidi = midi + 1;
                          const nextWhiteIndex =
                            visibleWhiteNotes.indexOf(nextWhiteMidi);
                          if (nextWhiteIndex !== -1) {
                            leftPercent = nextWhiteIndex * whiteKeyWidthPercent;
                          } else {
                            isVisible = false;
                          }
                        }

                        if (!isVisible) return null;

                        return (
                          <div
                            key={midi}
                            className={`piano-key-element black ${isActive ? "active-press" : ""} ${isHitReady ? "game-hit-ready" : isTarget ? "practice-target" : ""}`}
                            style={
                              {
                                position: "absolute",
                                left: `${leftPercent - blackKeyWidthPercent / 2}%`,
                                width: `${blackKeyWidthPercent}%`,
                                height: "60%",
                                pointerEvents: "auto",
                                "--active-key-color": keyFxColor,
                                "--active-key-glow": `${Math.round(keyFxGlow * 30)}px`,
                                "--press-depth": isActive
                                  ? activeNoteVelocitiesRef.current.get(midi) ?? 0.75
                                  : 0,
                              } as React.CSSProperties
                            }
                            onMouseDown={() => handleKeyMouseDown(midi)}
                            onMouseUp={() => handleKeyMouseUp(midi)}
                            onMouseEnter={(e) => {
                              if (e.buttons === 1) handleKeyMouseDown(midi);
                            }}
                            onMouseLeave={() =>
                              isActive && handleKeyMouseUp(midi)
                            }
                          >
                            <div className="piano-key-velvet-strip" />
                            {showNoteNames !== "none" && (
                              <span className="piano-key-label">
                                {showNoteNames === "name"
                                  ? noteName
                                  : midi % 12}
                              </span>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              {/* Right MIDI stats panel */}
              <div className="panel-right">
                {screen === "game" ? (
                  <>
                    <h2>HUD Juego</h2>
                    <div className="metrics-container">
                      <div className="metric-card">
                        <span>Estado</span>
                        <strong
                          className={gameStatus === "playing" ? "active" : ""}
                        >
                          {gameStatus === "setup"
                            ? "Setup"
                            : gameStatus === "countdown"
                              ? `Cuenta ${gameCountdown}`
                              : gameStatus === "playing"
                                ? "En curso"
                                : "Resultados"}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span>Notas objetivo</span>
                        <strong>{gameStats.totalTargets}</strong>
                      </div>
                      <div className="metric-card">
                        <span>Score</span>
                        <strong>{Math.round(gameStats.score)}</strong>
                      </div>
                      <div className="metric-card">
                        <span>Combo / Max</span>
                        <strong>
                          x{gameStats.combo} / {gameStats.maxCombo}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span>Hits / Miss</span>
                        <strong>
                          {gameStats.hits} / {gameStats.misses}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span>Precisión</span>
                        <strong>{Math.round(gameStats.accuracy * 100)}%</strong>
                      </div>
                      <div className="metric-card">
                        <span>Rango actual</span>
                        <strong>
                          {midiToLabel(rangeStart)}–
                          {midiToLabel(rangeStart + RANGE_KEY_COUNT - 1)}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span>Best run</span>
                        <strong>
                          {currentGameBest
                            ? Math.round(currentGameBest.score)
                            : "Sin récord"}
                        </strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2>Métricas del Sistema</h2>
                    <div className="metrics-container">
                      <div className="metric-card">
                        <span>Pitch Bend</span>
                        <strong className={pitchBend !== 0 ? "active" : ""}>
                          {pitchBend}%
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span>Fuerza (Velocity)</span>
                        <strong>{lastVelocity} / 127</strong>
                      </div>
                      <div className="metric-card">
                        <span>Pedal Sustain</span>
                        <strong
                          className={
                            sustainDown || pianoPedalSustain ? "active" : ""
                          }
                        >
                          {sustainDown || pianoPedalSustain ? "ON" : "OFF"}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span>Notas activas</span>
                        <strong>{activeNotes.size}</strong>
                      </div>
                      <div className="metric-card">
                        <span>Transponer</span>
                        <strong className={transpose !== 0 ? "active" : ""}>
                          {transpose > 0 ? "+" : ""}
                          {transpose} st
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span>Metrónomo</span>
                        <strong className={metronomeOn ? "active" : ""}>
                          {metronomeOn ? "ON" : "OFF"}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span>Pistas activas</span>
                        <strong>
                          {
                            song.tracks.filter((t) => !trackMuted[t.index])
                              .length
                          }{" "}
                          / {song.tracks.length}
                        </strong>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {/* Songs view panel */}
          {screen === "songs" && (
            <section className="panel-screen">
              <div className="panel-screen-header">
                <h2>Biblioteca de Canciones</h2>
                <p>
                  Elige una canción o arrastra un archivo MIDI en la tarjeta de
                  subida para empezar a practicar.
                </p>
              </div>

              <input
                type="text"
                className="search-field"
                placeholder="Buscar canciones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              {/* Universal import panel - accepts MusicXML + MIDI */}
              <ImportPanel
                onFileSelect={handleScoreImport}
                isLoading={scoreImportLoading}
                error={scoreImportError}
                lastImported={scoreLastImported}
              />

              <div className="songs-grid">
                {filteredSongs.map((s, idx) => (
                  <div key={idx} className="song-card">
                    <div className="song-card-accent" />
                    <h3 className="song-card-title">{s.title}</h3>
                    <div className="song-card-meta">
                      <span>{s.bpm} BPM</span>
                      <span>{Math.floor(s.duration)}s</span>
                      <span>{s.notes.length} notas</span>
                      <span>{s.source}</span>
                    </div>
                    <button
                      className="btn primary song-card-action"
                      onClick={() => {
                        setSong(s);
                        stopPlayback();
                        setScreen("studio");
                      }}
                    >
                      Cargar y Tocar
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tracks view panel */}
          {screen === "tracks" && (
            <section className="panel-screen">
              <div className="panel-screen-header">
                <h2>Gestor de Pistas MIDI</h2>
                <p>
                  Mapea instrumentos y silencia pistas individuales para
                  practicar una mano específica.
                </p>
                {song.tracks.length > 0 && (
                  <button
                    className="btn secondary"
                    style={{ marginTop: 12, width: "fit-content" }}
                    onClick={() => {
                      const pianoIndices = song.tracks
                        .filter((t) => {
                          const inst = (
                            trackInstruments[t.index] ?? t.instrument
                          ).toLowerCase();
                          return (
                            inst.includes("piano") ||
                            inst.includes("harpsichord") ||
                            inst.includes("clavinet")
                          );
                        })
                        .map((t) => t.index);

                      if (pianoIndices.length === 0) return;

                      // Check if ALL piano tracks are already soloed → toggle OFF
                      const allPianoSoloed = pianoIndices.every(
                        (i) => trackSolo[i],
                      );

                      setTrackSolo((prev) => {
                        const next = { ...prev };
                        if (allPianoSoloed) {
                          // Un-solo everything
                          song.tracks.forEach((t) => {
                            next[t.index] = false;
                          });
                        } else {
                          // Solo only piano tracks
                          song.tracks.forEach((t) => {
                            next[t.index] = false;
                          });
                          pianoIndices.forEach((i) => {
                            next[i] = true;
                          });
                        }
                        return next;
                      });
                    }}
                  >
                    🎹 Solo Piano
                  </button>
                )}
              </div>

              {/* If score loaded, show advanced PartMixer */}
              {scoreParts.length > 0 && (
                <PartMixer
                  parts={scoreParts}
                  onVolumeChange={handlePartVolumeChange}
                  onPanChange={handlePartPanChange}
                  onMuteToggle={handlePartMuteToggle}
                  onSoloToggle={handlePartSoloToggle}
                  onVisibilityToggle={handlePartVisibilityToggle}
                  onInstrumentChange={handlePartInstrumentChange}
                  onColorChange={handlePartColorChange}
                />
              )}

              <div className="tracks-list">
                {song.tracks.map((track) => {
                  const isMuted = trackMuted[track.index];
                  const isSolo = trackSolo[track.index];
                  const trackVol =
                    trackVolumes[track.index] !== undefined
                      ? trackVolumes[track.index]
                      : 0.8;
                  const trackColor = trackColors[track.index] || "#8b5cf6";

                  return (
                    <div key={track.index} className="track-item-card">
                      <div className="track-item-left">
                        <div
                          className="track-color-picker-dot"
                          style={{ backgroundColor: trackColor }}
                          title="Cambiar color"
                          onClick={() => {
                            const randomColor =
                              TRACK_COLORS[
                                Math.floor(Math.random() * TRACK_COLORS.length)
                              ];
                            setTrackColors((prev) => ({
                              ...prev,
                              [track.index]: randomColor,
                            }));
                          }}
                        />
                        <div className="track-name-box">
                          <h4>{track.name}</h4>
                          <span>{track.noteCount} notas asignadas</span>
                        </div>
                      </div>

                      <div className="track-item-center">
                        <select
                          className="track-instrument-select"
                          value={
                            trackInstruments[track.index] ||
                            "Acoustic Grand Piano"
                          }
                          onChange={(e) => {
                            setTrackInstruments((prev) => ({
                              ...prev,
                              [track.index]: e.target.value,
                            }));
                          }}
                        >
                          {INSTRUMENT_FAMILIES.map((inst, i) => (
                            <option key={i} value={inst}>
                              {inst}
                            </option>
                          ))}
                        </select>

                        <div className="track-volume-block">
                          <input
                            type="range"
                            className="slider-custom"
                            min={0}
                            max={1}
                            step={0.05}
                            value={trackVol}
                            onChange={(e) =>
                              setTrackVolumes((prev) => ({
                                ...prev,
                                [track.index]: Number(e.target.value),
                              }))
                            }
                          />
                          <span>{Math.round(trackVol * 100)}%</span>
                        </div>
                      </div>

                      <div className="track-item-right">
                        <button
                          className={`btn btn-mute-solo ${isMuted ? "active-mute" : ""}`}
                          onClick={() =>
                            setTrackMuted((prev) => ({
                              ...prev,
                              [track.index]: !prev[track.index],
                            }))
                          }
                        >
                          Silencio
                        </button>
                        <button
                          className={`btn btn-mute-solo ${isSolo ? "active-solo" : ""}`}
                          onClick={() =>
                            setTrackSolo((prev) => ({
                              ...prev,
                              [track.index]: !prev[track.index],
                            }))
                          }
                        >
                          Solo
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ===== SCORE READER SCREEN ===== */}
          {screen === "score" && (
            <section className="score-screen">
              {/* Score info bar - key, chord, measure, dynamic */}
              {scoreDocument && (
                <ScoreInfoBar
                  score={scoreDocument}
                  analysis={scoreAnalysis}
                  currentTime={currentTime}
                />
              )}

              <div className="score-screen-body">
                {/* Left panel: import + analysis stats */}
                <div className="score-screen-sidebar">
                  <div className="score-screen-import">
                    <h3>Importar Partitura</h3>
                    <ImportPanel
                      onFileSelect={handleScoreImport}
                      isLoading={scoreImportLoading}
                      error={scoreImportError}
                      lastImported={scoreLastImported}
                    />
                  </div>

                  {scoreDocument && scoreAnalysis && (
                    <div className="score-stats-panel">
                      <h3>Analisis Musical</h3>
                      <div className="score-stat-row">
                        <span>Tonalidad detectada</span>
                        <strong>{scoreAnalysis.detectedKey}</strong>
                      </div>
                      <div className="score-stat-row">
                        <span>Tonalidad escrita</span>
                        <strong>
                          {scoreDocument.metadata.keySignature.name}
                        </strong>
                      </div>
                      <div className="score-stat-row">
                        <span>Compas</span>
                        <strong>
                          {scoreDocument.metadata.timeSignature.display}
                        </strong>
                      </div>
                      <div className="score-stat-row">
                        <span>Tempo</span>
                        <strong>
                          {Math.round(scoreDocument.metadata.bpm)} BPM
                        </strong>
                      </div>
                      <div className="score-stat-row">
                        <span>Compases</span>
                        <strong>{scoreDocument.metadata.totalMeasures}</strong>
                      </div>
                      <div className="score-stat-row">
                        <span>Instrumentos</span>
                        <strong>{scoreDocument.parts.length}</strong>
                      </div>
                      <div className="score-stat-row">
                        <span>Total notas</span>
                        <strong>
                          {scoreAnalysis.stats.totalNotes.toLocaleString()}
                        </strong>
                      </div>
                      <div className="score-stat-row">
                        <span>Densidad</span>
                        <strong>
                          {scoreAnalysis.stats.averageDensity.toFixed(1)} n/s
                        </strong>
                      </div>
                      <div className="score-stat-row">
                        <span>Cambios de tempo</span>
                        <strong>{scoreAnalysis.stats.tempoChanges}</strong>
                      </div>
                      {scoreDocument.metadata.composer && (
                        <div className="score-stat-row">
                          <span>Compositor</span>
                          <strong>{scoreDocument.metadata.composer}</strong>
                        </div>
                      )}
                      {scoreDocument.rehearsalMarks.length > 0 && (
                        <div className="score-stat-row">
                          <span>Marcas ensayo</span>
                          <strong>
                            {scoreDocument.rehearsalMarks
                              .map((r) => r.label)
                              .join(", ")}
                          </strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Center: Score sheet / Piano Roll viewer */}
                <div className="score-screen-main">
                  {/* View toggle */}
                  <div className="score-view-toggle">
                    <button
                      className={`btn ${scoreViewMode === "sheet" ? "primary" : ""}`}
                      onClick={() => setScoreViewMode("sheet")}
                    >
                      🎼 Partitura
                    </button>
                    <button
                      className={`btn ${scoreViewMode === "roll" ? "primary" : ""}`}
                      onClick={() => {
                        setScoreViewMode("roll");
                        setScreen("studio");
                      }}
                    >
                      🎹 Piano Roll
                    </button>
                  </div>

                  <Suspense
                    fallback={
                      <div
                        style={{
                          padding: 40,
                          textAlign: "center",
                          color: "var(--text-secondary, #94a3b8)",
                        }}
                      >
                        Cargando partitura...
                      </div>
                    }
                  >
                    <ScoreViewer
                      score={scoreDocument}
                      currentTime={currentTime}
                      onMeasureClick={(_, time) => seekTo(time)}
                      visiblePartIds={scoreParts
                        .filter((p) => p.visible)
                        .map((p) => p.id)}
                    />
                  </Suspense>
                </div>

                {/* Right panel: Part mixer */}
                <div className="score-screen-mixer">
                  <PartMixer
                    parts={scoreParts}
                    onVolumeChange={handlePartVolumeChange}
                    onPanChange={handlePartPanChange}
                    onMuteToggle={handlePartMuteToggle}
                    onSoloToggle={handlePartSoloToggle}
                    onVisibilityToggle={handlePartVisibilityToggle}
                    onInstrumentChange={handlePartInstrumentChange}
                    onColorChange={handlePartColorChange}
                  />
                </div>
              </div>
            </section>
          )}

          {/* MIDI configuration panel */}
          {screen === "midi" && (
            <section className="panel-screen">
              <div className="panel-screen-header">
                <h2>Panel MIDI Avanzado</h2>
                <p>
                  Configura tu controlador físico de 37 teclas y comprueba los
                  diagnósticos de entrada en tiempo real.
                </p>
              </div>

              <div className="settings-group">
                <h3>Conectividad MIDI</h3>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Estado del Servicio</label>
                    <span>{midiStatus}</span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Dispositivo Activo</label>
                    <span>
                      Selecciona la entrada MIDI física que deseas conectar a la
                      app.
                    </span>
                  </div>
                  <select
                    className="track-instrument-select"
                    value={
                      midiInputs.some((input) => input.id === selectedInputId)
                        ? selectedInputId
                        : "__all__"
                    }
                    disabled={isMidiScanning || midiInputs.length === 0}
                    onChange={(e) => setSelectedInputId(e.target.value)}
                  >
                    <option value="__all__">
                      {isMidiScanning
                        ? "Detectando controlador..."
                        : midiInputs.length === 0
                          ? "Sin controlador MIDI"
                          : "Selecciona controlador"}
                    </option>
                    {midiInputs.map((input) => (
                      <option key={input.id} value={input.id}>
                        {input.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Modo de Mapeo</label>
                    <span>
                      <strong>Sincronizado (recomendado)</strong>: tu C3 físico
                      siempre toca el C del rango visible. Mover el selector de
                      rango o el MOD wheel sincroniza el teclado
                      automáticamente.
                      <br />
                      <strong>Anclaje</strong>: la primera tecla que presionas
                      fija el mapeo. Menos predecible al mover el rango.
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className={`btn ${midiMode === "shift" ? "primary" : ""}`}
                      onClick={() => setMidiMode("shift")}
                    >
                      Sincronizado con Rango
                    </button>
                    <button
                      className={`btn ${midiMode === "anchor" ? "primary" : ""}`}
                      onClick={() => {
                        setMidiMode("anchor");
                        physicalAnchorRef.current = null;
                      }}
                    >
                      Anclaje Dinámico
                    </button>
                  </div>
                </div>

                {midiMode === "shift" && (
                  <div className="settings-row">
                    <div className="settings-col">
                      <label>Nota Base del Controlador</label>
                      <span>
                        C más baja de tu teclado físico. Actual:{" "}
                        <strong>
                          {midiToLabel(midiPhysicalBase)} (MIDI{" "}
                          {midiPhysicalBase})
                        </strong>
                        . La última tecla presionada:{" "}
                        <strong style={{ color: "var(--accent-primary)" }}>
                          {lastPhysicalMidi !== null
                            ? `${midiToLabel(lastPhysicalMidi)} (${lastPhysicalMidi})`
                            : "ninguna"}
                        </strong>
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <button
                        className={`btn ${calibrating ? "primary" : "secondary"}`}
                        style={{ whiteSpace: "nowrap" }}
                        onClick={() => {
                          const next = !calibrating;
                          calibratingRef.current = next;
                          setCalibrating(next);
                        }}
                      >
                        {calibrating
                          ? "🔴 Toca tu C más baja..."
                          : "🎧 Calibrar desde teclado"}
                      </button>
                      <input
                        type="number"
                        className="search-field"
                        style={{ width: "90px", textAlign: "center" }}
                        min={12}
                        max={84}
                        value={midiPhysicalBase}
                        onChange={(e) => {
                          const v =
                            Math.round(Number(e.target.value) / 12) * 12;
                          setMidiPhysicalBase(v);
                          physicalAnchorRef.current = null;
                        }}
                      />
                    </div>
                  </div>
                )}

                {midiError && (
                  <div
                    style={{
                      color: "var(--danger)",
                      fontSize: "0.85rem",
                      marginTop: "10px",
                    }}
                  >
                    {midiError}
                  </div>
                )}

                <button
                  className="btn secondary"
                  style={{ width: "fit-content" }}
                  onClick={requestMidiAccess}
                >
                  Buscar entradas MIDI
                </button>
              </div>

              <div className="settings-group">
                <h3>Parámetros de Expresividad</h3>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Curva de Velocidad (Fuerza)</label>
                    <span>
                      Mapea la velocidad MIDI (0-127) a ganancia de salida. La
                      curva &quot;Piano (GM)&quot; sigue la spec MIDI: dB = 40·log₁₀(127/v),
                      equivalente a (v/127)². &quot;Natural&quot; usa una curva piecewise
                      con más resolución en mp..mf, como un piano acústico real.
                    </span>
                  </div>
                  <select
                    className="track-instrument-select"
                    aria-label="Curva de velocidad MIDI"
                    value={velocityCurve}
                    onChange={(e) =>
                      setVelocityCurve(e.target.value as VelocityCurve)
                    }
                  >
                    {(Object.values(VELOCITY_CURVE_DESCRIPTORS)).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label} — {d.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Rango del Pitch Bend</label>
                    <span>
                      Máximo número de semitonos modulados por la rueda de pitch
                      bend (±2 semitonos estándar).
                    </span>
                  </div>
                  <select
                    className="track-instrument-select"
                    value={pitchBendRange}
                    onChange={(e) => setPitchBendRange(Number(e.target.value))}
                  >
                    <option value={1}>±1 Semitono</option>
                    <option value={2}>±2 Semitonos</option>
                    <option value={7}>±7 Semitonos</option>
                    <option value={12}>±12 Semitonos (1 Octava)</option>
                  </select>
                </div>

                <div
                  className="settings-row"
                  style={{ flexDirection: "column", alignItems: "stretch" }}
                >
                  <div
                    className="settings-col"
                    style={{ maxWidth: "100%", marginBottom: "8px" }}
                  >
                    <label>Monitor del Teclado Físico</label>
                    <span>Toca tu piano para ver el indicador de fuerza:</span>
                  </div>
                  <div className="velocity-monitor">
                    <div
                      className="velocity-monitor-bar"
                      style={{ width: `${(lastVelocity / 127) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Global settings view panel */}
          {screen === "settings" && (
            <section className="panel-screen">
              <div className="panel-screen-header">
                <h2>Configuraciones Generales</h2>
                <p>
                  Configura las opciones visuales y efectos de sonido para
                  personalizar tu estudio.
                </p>
              </div>

              <div className="settings-group">
                <h3>Ajustes Visuales</h3>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Zoom Vertical (Velocidad de Caída)</label>
                    <span>
                      Controla el tamaño de las notas. Valores bajos = notas más
                      pequeñas, ver más de la canción.
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "250px",
                    }}
                  >
                    <input
                      type="range"
                      className="slider-custom"
                      min={0.2}
                      max={4.0}
                      step={0.1}
                      value={scrollSensitivity}
                      onChange={(e) =>
                        setScrollSensitivity(Number(e.target.value))
                      }
                    />
                    <span style={{ minWidth: "45px", textAlign: "right" }}>
                      {scrollSensitivity.toFixed(1)}x
                    </span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Etiquetas de Notas</label>
                    <span>
                      Muestra las notas musicales (C4, D#4, etc.) en las teclas
                      virtuales de la pantalla.
                    </span>
                  </div>
                  <select
                    className="track-instrument-select"
                    value={showNoteNames}
                    onChange={(e) => setShowNoteNames(e.target.value as "none" | "name" | "binding")}
                  >
                    <option value="name">
                      Nombres de notas (Do, Re, Mi / C, D, E)
                    </option>
                    <option value="binding">
                      Índice MIDI absoluto (0-127)
                    </option>
                    <option value="none">Ocultar etiquetas</option>
                  </select>
                </div>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Efectos de Partículas y Brillo</label>
                    <span>
                      Activa destellos visuales y chispas de color cuando las
                      notas caen en la línea de impacto.
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={showParticles}
                      onChange={(e) => setShowParticles(e.target.checked)}
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-group">
                <h3>Efectos y Motor de Audio</h3>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Modo Práctica (Espera Notas)</label>
                    <span>
                      La canción esperará a que presiones la tecla
                      correspondiente antes de continuar.
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={pitchPractice}
                      onChange={(e) => setPitchPractice(e.target.checked)}
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Profundidad de Reverb (Ambiente)</label>
                    <span>
                      Aumenta la espacialidad acústica para lograr un sonido más
                      profundo y realista.
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "250px",
                    }}
                  >
                    <input
                      type="range"
                      className="slider-custom"
                      min={0.5}
                      max={4.0}
                      step={0.1}
                      value={reverbDecay}
                      onChange={(e) => {
                        setReverbDecay(Number(e.target.value));
                        if (reverbRef.current)
                          reverbRef.current.decay = Number(e.target.value);
                      }}
                    />
                    <span>{reverbDecay.toFixed(1)}s</span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Sustain (Tiempo de Liberación)</label>
                    <span>
                      Ajusta la duración del apagado acústico natural del piano
                      al soltar la tecla (1.2s estándar).
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "250px",
                    }}
                  >
                    <input
                      type="range"
                      className="slider-custom"
                      min={0.1}
                      max={4.0}
                      step={0.1}
                      value={sustainTime}
                      onChange={(e) => setSustainTime(Number(e.target.value))}
                    />
                    <span>{sustainTime.toFixed(1)}s</span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Intensidad del Chorus</label>
                    <span>
                      Aplica un efecto de modulación que enriquece el timbre del
                      sintetizador y fallback.
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "250px",
                    }}
                  >
                    <input
                      type="range"
                      className="slider-custom"
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setChorusDepth(val);
                        if (chorusRef.current) {
                          chorusRef.current.wet.value = val;
                        }
                      }}
                    />
                    <span>{Math.round(chorusDepth * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className="settings-group">
                <h3>Latencia y Rendimiento</h3>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Modo de Latencia</label>
                    <span>
                      Ultra: lookAhead=0ms, toca más rápido pero puede crujir si
                      el CPU está ocupado. Balanceado: lookAhead=40ms, estable y
                      sin crujidos. Requiere reiniciar audio (toca una tecla).
                    </span>
                  </div>
                  <select
                    className="track-instrument-select"
                    value={latencyMode}
                    onChange={(e) => {
                      setLatencyMode(e.target.value as "ultra" | "balanced");
                      // Reset audio so next play reinitializes with new settings
                      if (isAudioReady) {
                        samplerRef.current?.dispose();
                        if (fallbackSynthsRef.current) {
                          Object.values(fallbackSynthsRef.current).forEach(
                            (s) => s.dispose(),
                          );
                        }
                        reverbRef.current?.dispose();
                        chorusRef.current?.dispose();
                        compressorRef.current?.dispose();
                        metronomeRef.current?.dispose();
                        metronomeVolRef.current?.dispose();
                        samplerRef.current = null;
                        disposeAllGMSamplers();
                        gmDestRef.current = null;
                        fallbackSynthsRef.current = null;
                        reverbRef.current = null;
                        chorusRef.current = null;
                        compressorRef.current = null;
                        metronomeRef.current = null;
                        metronomeVolRef.current = null;
                        volNodeRef.current = null;
                        isInitializingAudioRef.current = false;
                        setIsAudioReady(false);
                        setIsSamplerActive(false);
                        setAudioStatusMessage("Esperando activación");
                      }
                    }}
                  >
                    <option value="ultra">
                      ⚡ Ultra Baja Latencia (0ms lookAhead)
                    </option>
                    <option value="balanced">
                      ⚖️ Balanceado (40ms lookAhead, sin crujidos)
                    </option>
                  </select>
                </div>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Latencia estimada del sistema</label>
                    <span>
                      Suma de AudioContext outputLatency + lookAhead
                      configurado.
                    </span>
                  </div>
                  <strong
                    style={{
                      fontSize: "0.9rem",
                      color: "var(--accent-primary)",
                    }}
                  >
                    {latencyMode === "ultra" ? "~5–15ms" : "~45–60ms"}
                  </strong>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* ── Game Results Modal ──────────────────────────────── */}
      {gameStatus === "results" && screen === "game" && (
        <GameResultsModal
          stats={gameStats}
          stars={starsEarned}
          xpEarned={xpNotification.amount}
          levelUp={
            levelUpEvent
              ? {
                  oldLevel: levelUpEvent.oldLevel,
                  newLevel: levelUpEvent.newLevel,
                }
              : null
          }
          newRecord={
            currentGameBest
              ? gameStats.score > currentGameBest.score
              : gameStats.score > 0
          }
          previousBest={currentGameBest?.score ?? 0}
          songTitle={song.title}
          difficulty={gameDifficulty}
          onRetry={() => startGameRound()}
          onMenu={() => {
            setGameStatus("setup");
            seekTo(0);
          }}
        />
      )}

      {/* ── Profile Panel ───────────────────────────────────── */}
      {showProfilePanel && (
        <ProfilePanel
          profile={playerProfile}
          onProfileUpdate={(p) => {
            setPlayerProfile(p);
            saveProfile(p);
          }}
          onClose={() => setShowProfilePanel(false)}
        />
      )}

      {/* ── XP Notification ─────────────────────────────────── */}
      {xpNotification.show && (
        <div className="xp-notification">+{xpNotification.amount} XP 🌟</div>
      )}

      {/* ── Level Up Modal ──────────────────────────────────── */}
      {levelUpEvent && (
        <div className="level-up-modal">
          <div className="level-up-title">🎉 ¡Subiste de Nivel!</div>
          <div className="level-up-number">{levelUpEvent.newLevel}</div>
          {levelUpEvent.rewards.length > 0 && (
            <div className="level-up-rewards">
              {levelUpEvent.rewards.map((r, i) => (
                <div key={i} className="level-up-reward">
                  ✨ {r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Achievement Toasts ──────────────────────────────── */}
      {achievementToasts.map((toast, i) => (
        <div
          key={toast.id}
          className="achievement-toast"
          style={{ bottom: `${24 + i * 108}px` }}
        >
          <div className="achievement-toast-icon">{toast.icon}</div>
          <div className="achievement-toast-content">
            <div className="achievement-toast-title">🏆 Logro desbloqueado</div>
            <div className="achievement-toast-name">{toast.name}</div>
            <div className="achievement-toast-desc">{toast.description}</div>
          </div>
        </div>
      ))}
    </>
  );
}
