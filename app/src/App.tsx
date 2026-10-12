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
import { SongLibrary } from "./components/songs";
import { MusicPanel } from "./components/library";
import { PlayerSection } from "./components/player";
import { LyricsPanel } from "./components/studio/LyricsPanel";
import { ScoreInfoBar } from "./components/score/ScoreInfoBar";
const ScoreViewer = lazy(() =>
  import("./components/score/ScoreViewer").then((m) => ({ default: m.ScoreViewer })),
);
import type { ScoreDocument, ScoreNote, ScorePart } from "./types/score";
import type { AnalysisResult } from "./analysis/MusicAnalyzer";
import {
  InstrumentEngineRegistry,
  inferPianoParams,
} from "./engine/InstrumentEngine";
import {
  getLoadedGMSamplers,
  disposeAllGMSamplers,
} from "./engine/GMSamplerEngine";
import {
  disposeAllInstruments,
  getInstrumentStatus,
  getInstrumentSync,
  loadInstrument,
  humanizeVelocity,
} from "./engine/instrumentSources";
import {
  createInstrumentChain,
  type InstrumentChain,
} from "./engine/instrumentChain";
import { DrumKitEngine } from "./engine/DrumKitEngine";
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
  configureAudioTiming,
  fadeOutNodesVolume,
  heardTransportSeconds,
  liveNoteTime,
  startTransportMusic,
  stopVoicesDeferred,
  ticksForHeardSeconds,
} from "./audio/audioTiming";

// Dev-only handle on the transport, so the audio audit
// (`tests/e2e/verify-audio-glitches.spec.ts`) can wrap `Transport.schedule` and
// measure how much lead time the scheduler really has. Tone ships as an ES
// module and never lands on `window`, so without this the measurement harness
// has nothing to instrument. Stripped from production builds; nothing in the app
// reads it.
if (import.meta.env.DEV) {
  (window as unknown as { __PMP_TRANSPORT__?: unknown }).__PMP_TRANSPORT__ =
    Tone.getTransport();
}
import {
  INSTRUMENT_FAMILIES,
  INITIAL_RANGE_START,
  PIANO_MAX_MIDI,
  PIANO_MIN_MIDI,
  RANGE_KEY_COUNT,
} from "./constants/piano";
import { TRACK_COLORS } from "./constants/ui";
import { DEMO_SONGS } from "./constants/demoSongs";
// Song identity lives in types/song.ts (shared with the player module). These
// local aliases keep the existing annotations in this file readable.
import type {
  DemoSong,
  LyricLine,
  SongData,
  SongNote,
  SongTrack,
} from "./types/song";
import { libraryStore } from "./music/libraryStore";
import {
  idForSong,
  uploadTrackId,
  scoreTrackId,
  sourceInfoFor,
} from "./music/ids";
import { parseMidiBytes, putSessionSong } from "./music/resolve";
import { extractLyrics } from "./utils/midiLyrics";
import { usePlayer } from "./music/PlayerContext";
import { salamanderSamples as SALAMANDER_SAMPLES } from "./services/audioService";
import {
  clamp,
  hexToRgba,
  isBlackKey,
  lightenHex,
  midiToLabel,
} from "./utils/audioMidiUtils";
import { gmProgramToInstrument } from "./utils/instrumentMapping";
import {
  choosePlaybackSource,
  usesSalamanderPiano,
} from "./utils/playbackRouting";
import { getDeviceProfile } from "./utils/deviceCapabilities";
import {
  VELOCITY_CURVE_DESCRIPTORS,
  midiVelocityToGain,
  recordVelocityObservation,
  DEFAULT_CALIBRATION,
  type VelocityCurve,
  type VelocityCalibration,
} from "./utils/velocity";
import {
  buildNonPianoTrackSet,
  isTrackActive,
} from "./utils/trackFilter";

type NavScreen =
  | "studio"
  | "game"
  | "music"
  | "songs"
  | "tracks"
  | "midi"
  | "settings"
  | "score";

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
  // Player orchestration lives in PlayerProvider (see main.tsx); App owns the
  // audio engine and registers itself as the player's playback host below.
  const player = usePlayer();
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

    /**
     * Fetches and parses one shipped demo. Parsing is delegated to
     * `parseMidiBytes` so the Web Worker path, the in-thread fallback and the
     * player's own resolver all produce identically-shaped songs — including
     * `trackId`/`demoPath`, which the player needs to identify the track.
     */
    async function parseDemoSong(ds: DemoSong): Promise<SongData | null> {
      try {
        const res = await fetch(ds.path);
        if (!res.ok) return null;
        const bytes = await res.arrayBuffer();
        const parsed = await parseMidiBytes(bytes, {
          id: `${ds.artist}-${ds.title}`,
          trackId: ds.trackId,
          title: ds.title,
          artist: ds.artist,
          genre: ds.genre,
          defaultBpm: ds.bpm,
          demoPath: ds.path,
        });
        // Cache it so the player never re-fetches a song already parsed here.
        putSessionSong(parsed);
        return parsed;
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
        // The player's catalogue only stores lightweight metadata (never note
        // data), so it IS safe to persist — that is what makes playlists and
        // likes survive a cold start.
        libraryStore.registerTracks(
          loadedSongs.map((loaded) => ({
            song: loaded,
            source: sourceInfoFor(loaded, idForSong(loaded)),
          })),
        );
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
  /** Mirror of `currentTime` for imperative reads (player bridge). */
  const currentTimeRef = useRef<number>(0);
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
    "soft",
  );
  // Migrate legacy curve names from previous app versions
  useEffect(() => {
    const cur = velocityCurve as string;
    if (cur === "logarithmic") setVelocityCurve("soft");
    else if (cur === "exponential") setVelocityCurve("piano");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Velocity calibration: tracks the controller's actual min/max range
  // and remaps it to 0..1 before applying the curve. Without this, a
  // controller that only sends 32..127 would have a useless soft range.
  const [velocityCalibration, setVelocityCalibration] =
    useLocalStorageState<VelocityCalibration>(
      "piano_velocity_calibration",
      DEFAULT_CALIBRATION,
    );
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

  /** Instrumentos que ya avisaron que no tienen sample real (aviso único). */
  const silentInstrumentWarnedRef = useRef<Set<string>>(new Set());
  /** Promesas de precarga: la reproducción espera a que resuelvan. */
  const songSamplesReadyRef = useRef<Promise<void>>(Promise.resolve());
  const drumReadyRef = useRef<Promise<void>>(Promise.resolve());
  /** ¿Hay samples de la canción bajando ahora mismo? */
  const samplesPendingRef = useRef(false);

  // ---- InstrumentEngineRegistry ref ----
  const engineRegistryRef = useRef<InstrumentEngineRegistry | null>(null);
  // ---- DrumKitEngine ref (percusión real del canal 10) ----
  const drumKitRef = useRef<DrumKitEngine | null>(null);

  // Canvas ref & loop
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<NoteParticle[]>([]);
  const particlePoolRef = useRef<NoteParticle[]>([]);

  // Audio refs
  const samplerRef = useRef<Tone.Sampler | null>(null);
  /** Cadena de mezcla del piano (EQ + paneo), para liberarla al desmontar. */
  const pianoChainRef = useRef<InstrumentChain | null>(null);
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
  /**
   * Canceller for a pending post-fade voice cleanup (see `stopVoicesDeferred`).
   *
   * Pause and stop arms one so the truncated notes are dropped a few
   * milliseconds *after* they have been faded. Any new playback must cancel it
   * first, or the cleanup would land on the notes that just started.
   */
  const cancelVoiceCleanupRef = useRef<(() => void) | null>(null);

  // MIDI refs
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const physicalAnchorRef = useRef<number | null>(null);
  const activeFreqsRef = useRef<Map<string, number>>(new Map());
  const activePhysicalNotesRef = useRef<Map<number, number>>(new Map());
  const activeVoicesRef = useRef<
    { key: string; midi: number; trackIndex: number; freq: number }[]
  >([]);
  /**
   * Instrumento con el que se atacó cada nota activa (clave `${track}-${midi}`).
   * El release debe liberar el MISMO motor/sampler que sonó, aunque el usuario
   * cambie el instrumento de la pista mientras la nota sigue sonando.
   */
  const activeNoteInstrumentsRef = useRef<Map<string, string>>(new Map());
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
    const trackState = {
      muted: trackMuted,
      solo: trackSolo,
      instruments: trackInstruments,
      pianoOnlyMode,
    };
    const nonPiano = pianoOnlyMode
      ? buildNonPianoTrackSet(song.tracks, trackInstruments)
      : undefined;
    const activeNotes = song.notes.filter((note) =>
      isTrackActive(note.trackIndex, trackState, nonPiano),
    );

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
  }, [song.notes, song.tracks, trackMuted, trackSolo, trackInstruments, pianoOnlyMode]);

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
    trackSolo,
    trackVolumes: {} as Record<number, number>,
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
    velocityCurve: "soft" as VelocityCurve,
    velocityCalibration: DEFAULT_CALIBRATION as VelocityCalibration,
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
  stateRef.current.trackSolo = trackSolo;
  stateRef.current.trackVolumes = trackVolumes;
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
  stateRef.current.velocityCalibration = velocityCalibration;
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
      // Configure the AudioContext's scheduling window BEFORE start.
      //
      // This used to be 0 in "ultra" mode, which meant the clock had no slack
      // at all: any callback that arrived a millisecond late scheduled its note
      // in the past, Web Audio clamped it to "now", and consecutive notes piled
      // onto the same render quantum — the crackle heard on studio monitors.
      // The window is what buys the audio thread its margin. See
      // `audio/audioTiming.ts` for the reasoning and for the two compensations
      // it requires (live-input lead time and the heard playhead).
      configureAudioTiming();

      await Tone.start();

      // Cadena de efectos:
      //
      //   vol → chorus ─┬────────────────────────────→ compressor → limiter → out
      //                 └→ highpass → reverb (100% wet) → compressor
      //
      // El reverb va como ENVÍO, no en serie. Antes estaba en serie y sin filtro,
      // así que todo el bajo entraba al reverb: la mezcla quedaba embarrada y el
      // grave perdía definición (y encima el "wet" se comía el ataque de la
      // percusión). Con el envío, la señal seca queda intacta y sólo la cola de
      // medios/agudos va al reverb — que es como se hace en un estudio.
      const limiter = new Tone.Limiter(-2).toDestination();
      // Ganancia de compensación: el EQ por familia recorta graves y barro que
      // aportaban ~4 dB de energía, así que sin esto la mezcla quedaría más
      // limpia pero más baja. Es el "makeup gain" de manual.
      const makeup = new Tone.Gain(1.45).connect(limiter);
      const compressor = new Tone.Compressor({
        threshold: -18, // start compressing at -18dB
        ratio: 5, // 5:1 ratio
        attack: 0.003, // 3ms attack — catches transients fast
        release: 0.1, // 100ms release
        knee: 6, // soft knee, transparent
      }).connect(makeup);

      const reverb = new Tone.Reverb({ decay: 1.5, wet: 1 }).connect(compressor);
      await reverb.generate();
      // Corte de graves antes del reverb: por debajo de ~200 Hz el reverb sólo
      // agrega barro, no profundidad.
      const reverbHighpass = new Tone.Filter({
        type: "highpass",
        frequency: 200,
        Q: 0.7,
      }).connect(reverb);
      const reverbSend = new Tone.Gain(0.18).connect(reverbHighpass);

      const chorus = new Tone.Chorus(4, 2.5, 0.5);
      chorus.wet.value = 0.0;
      chorus.start();
      // Seco hacia el compresor y, en paralelo, al envío del reverb.
      chorus.connect(compressor);
      chorus.connect(reverbSend);

      const vol = new Tone.Volume(stateRef.current.masterVolume).connect(chorus);
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
      setAudioStatusMessage("Cargando piano real...");

      // El registro queda sólo por el PianoEngine (que toca el sampler real de
      // Salamander). Los motores de osciladores que vivían acá ya no se rutean.
      engineRegistryRef.current = new InstrumentEngineRegistry(vol);

      // Percusión real (canal 10): sólo samples grabados, sin respaldo
      // sintetizado.
      drumKitRef.current = new DrumKitEngine(vol);

      // GM sampler destination — all non-piano real samples route through here
      gmDestRef.current = vol;

      // Sampler Salamander — carga en DOS fases.
      //
      // Antes se esperaban los 30 samples (~6.6 MB) antes de marcar
      // `isSamplerActive`. Sin sintetizador de respaldo eso significa que tocar
      // el teclado durante los primeros segundos no sonaba a nada. Ahora se
      // arranca con un núcleo de 5 samples reales repartidos por el registro
      // (el piano ya suena, repitcheando los que faltan) y el resto se suma
      // cuando termina de bajar.
      await new Promise<void>((resolve) => {
        const coreNotes = ["C2", "C4", "D#5"];
        const coreUrls: Record<string, string> = {};
        for (const note of coreNotes) {
          if (SALAMANDER_SAMPLES[note]) coreUrls[note] = SALAMANDER_SAMPLES[note];
        }

        // El piano es el instrumento más usado y era el único que iba derecho al
        // bus maestro: sin EQ (retumbe y barro de 300 Hz) y sin ubicar en el
        // estéreo. Ahora entra por la misma cadena de mezcla que los demás.
        const pianoChain = createInstrumentChain("Acoustic Grand Piano", vol);
        pianoChainRef.current = pianoChain;

        const sampler = new Tone.Sampler({
          urls: coreUrls,
          baseUrl: "https://tonejs.github.io/audio/salamander/",
          release: sustainTime,
          onload: () => {
            stateRef.current.isSamplerActive = true; // sync update para triggerAttack
            setIsSamplerActive(true);
            // El PianoEngine de las partituras (MusicXML) también usa samples
            // reales en vez de su PolySynth de triangle.
            engineRegistryRef.current?.setPianoSampler(sampler);
            setAudioStatusMessage("Piano realista activo");
            resolve();

            // Fase 2: el registro completo, en segundo plano.
            const raw = Tone.getContext().rawContext as BaseAudioContext;
            void Promise.all(
              Object.entries(SALAMANDER_SAMPLES)
                .filter(([note]) => !coreUrls[note])
                .map(async ([note, file]) => {
                  try {
                    const res = await fetch(
                      `https://tonejs.github.io/audio/salamander/${file}`,
                    );
                    if (!res.ok) return;
                    const buffer = await raw.decodeAudioData(
                      await res.arrayBuffer(),
                    );
                    sampler.add(note as Tone.Unit.Note, buffer);
                  } catch {
                    /* el núcleo ya suena: los que falten son una mejora */
                  }
                }),
            ).then(() => {
              console.log("[piano] registro completo cargado");
            });
          },
          onerror: () => {
            setAudioStatusMessage("Sintetizador FM activo");
            resolve();
          },
        }).connect(pianoChain.input);
        samplerRef.current = sampler;
      });
    } finally {
      isInitializingAudioRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sintetizadores: ELIMINADOS del camino de audio ────────────────────────
  //
  // Acá vivía `getOrCreateSynthForTrack`, que creaba un `Tone.PolySynth` por
  // pista como respaldo cuando el sample real no estaba listo. El dueño del
  // proyecto fue explícito: **ningún sonido electrónico**. Hoy, si el sample no
  // está, la nota se saltea (silencio) en vez de sonar a oscilador, y
  // `fallbackSynthsRef` queda siempre vacío — los bucles que lo recorren para
  // liberar voces son no-ops.

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
          activeNoteInstrumentsRef.current.delete(oldest.key);
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
      activeNoteInstrumentsRef.current.set(key, instrument);

      // Note timestamp.
      //
      // Scheduled playback arrives with the Transport's own `audioTime`, which
      // is already positioned inside the context's scheduling window — pass it
      // through untouched.
      //
      // A human keypress must NOT pay that window, or the instrument would feel
      // 30 ms late. `liveNoteTime()` anchors live input to the hardware clock
      // instead (subtracting the window, plus however long the MIDI message
      // spent queued behind React) and keeps only the couple of milliseconds
      // Web Audio needs to render the attack cleanly.
      const audioTime =
        scheduledAudioTime !== undefined
          ? scheduledAudioTime
          : liveNoteTime(eventTimestamp);

      // Qué fuente toca esta nota — la política vive en `playbackRouting.ts`.
      //
      // Ya no existe el fallback a sintetizador: si el sample real no está
      // listo, la nota se saltea (silencio) en vez de sonar a oscilador. Los
      // motores de síntesis y los PolySynth quedan en el código pero FUERA del
      // camino de audio.
      const source = choosePlaybackSource({
        instrument,
        trackIndex,
        isPianoSamplerActive: samplerActive,
        samplerStatus:
          trackIndex !== -1 ? getInstrumentStatus(instrument) : "unmapped",
      });

      // ── 1. Piano real (Salamander sampler) ──
      if (source === "piano-sampler") {
        // El piano es el instrumento más usado y no pasa por la capa de fuentes:
      // se humaniza acá para que dos notas iguales no suenen idénticas.
      samplerRef.current?.triggerAttack(
        bentFreq,
        audioTime,
        humanizeVelocity("Acoustic Grand Piano", midi, audioTime, velocity),
      );
        return;
      }

      // ── 2. Instrumento real (sample grabado) ──
      if (source === "soundfont") {
        const gmSampler = getInstrumentSync(instrument);
        if (gmSampler) {
          gmSampler.triggerAttack(bentFreq, audioTime, velocity);
          return;
        }
      }

      // ── 3. Sin fuente real todavía (o inexistente): silencio ──
      //
      // `wait` es lo normal durante los primeros compases de una canción
      // mientras bajan los samples; la precarga de la canción ya arranca al
      // seleccionarla para que la ventana sea la más corta posible.
      if (source === "none" && !silentInstrumentWarnedRef.current.has(instrument)) {
        silentInstrumentWarnedRef.current.add(instrument);
        console.warn(
          `[ruteo] "${instrument}" no tiene sample real: su pista queda en silencio (no se sintetiza)`,
        );
      }
    },
    [],
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

      // Instrumento con el que se ATACÓ esta nota. El release tiene que usar
      // exactamente el mismo: si el usuario cambia el instrumento de la pista
      // a mitad de la canción, resolverlo de nuevo con `song.tracks[...]`
      // liberaba un sampler distinto y la nota quedaba sonando para siempre.
      const resolvedInst =
        activeNoteInstrumentsRef.current.get(key) ??
        stateRef.current.trackInstruments[trackIndex] ??
        stateRef.current.song.tracks[trackIndex]?.instrument ??
        "";
      activeNoteInstrumentsRef.current.delete(key);
      const resolvedLower = resolvedInst.toLowerCase();

      // ── 1. Piano sampler (Salamander) ──
      if (
        stateRef.current.isSamplerActive &&
        (trackIndex === -1 ||
          resolvedLower.includes("piano") ||
          resolvedLower.includes("harpsichord"))
      ) {
        samplerRef.current?.triggerRelease(freq);
      }

      // ── 2. Motores especializados (brass / strings / woodwinds) ──
      const registry = engineRegistryRef.current;
      if (trackIndex !== -1 && registry) {
        const inst = resolvedInst;
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
        const gmSampler = getInstrumentSync(resolvedInst);
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

  // ─── Precarga de instrumentos reales al seleccionar la canción ────────────
  //
  // Se baja SÓLO lo que la canción usa: por cada pista, las notas que toca. Es
  // la diferencia entre 85 mp3 de piano (14.9 MB) y los 20-30 que una canción
  // realmente necesita.
  useEffect(() => {
    const dest = gmDestRef.current;
    if (!isAudioReady || !dest || song.tracks.length === 0) return;

    // Instrumentos únicos (nombre) con las notas que toca cada uno.
    const notesByInstrument = new Map<string, Set<number>>();
    for (const track of song.tracks) {
      if (track.isDrumKit) continue; // la percusión tiene su propio motor
      const inst = trackInstruments[track.index] ?? track.instrument;
      if (!inst) continue;
      // El piano acústico lo toca el sampler Salamander (ya cargado): pedir
      // además su versión de VSCO eran decenas de MB que nunca se oían.
      if (usesSalamanderPiano(inst)) continue;
      const set = notesByInstrument.get(inst) ?? new Set<number>();
      for (const note of song.notes) {
        if (note.trackIndex === track.index) set.add(note.midi);
      }
      // Sin notas (p. ej. pista vacía) se pide el rango central del piano.
      if (set.size === 0) for (let m = 48; m <= 72; m++) set.add(m);
      notesByInstrument.set(inst, set);
    }

    if (notesByInstrument.size === 0) {
      songSamplesReadyRef.current = Promise.resolve();
      samplesPendingRef.current = false;
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudioStatusMessage(
      `Cargando ${notesByInstrument.size} instrumento(s) real(es)...`,
    );

    // La reproducción espera a este promise: sin sintetizador de respaldo, una
    // nota que llega antes que su sample no suena, así que arrancar la canción
    // con los instrumentos a medio bajar se oiría con huecos.
    const pending = Promise.all(
      [...notesByInstrument.entries()].map(([inst, notes]) =>
        loadInstrument(inst, dest, [...notes]),
      ),
    );
    samplesPendingRef.current = true;
    songSamplesReadyRef.current = pending.then(() => undefined);
    void songSamplesReadyRef.current.finally(() => {
      samplesPendingRef.current = false;
    });

    pending.then((results) => {
      const total = notesByInstrument.size;
      const ok = results.filter(Boolean).length;
      setAudioStatusMessage(
        ok === total
          ? `✓ ${ok} instrumento(s) real(es) listos`
          : `⚠ ${ok}/${total} instrumentos con sample real (los que falten quedan en silencio, nunca en sintetizador)`,
      );
      setTimeout(() => setAudioStatusMessage(""), 3500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.title, song.source, isAudioReady]);

  // ─── Percusión: bajar SÓLO las piezas que usa la canción ──────────────────
  //
  // Un kit GM completo son 47 archivos; una canción usa entre 4 y 12 piezas.
  // Bajar todo sería tirar ancho de banda y memoria, así que se piden las notas
  // que aparecen en `song.percussion` y nada más.
  useEffect(() => {
    const drum = drumKitRef.current;
    if (!isAudioReady || !drum || !song.percussion?.length) {
      drumReadyRef.current = Promise.resolve();
      return;
    }

    const pieces = [...new Set(song.percussion.map((n) => n.midi))];
    setAudioStatusMessage(
      `Cargando percusión (${pieces.length} pieza${pieces.length === 1 ? "" : "s"})...`,
    );
    const pending = drum.prefetch(pieces);
    drumReadyRef.current = pending;
    void pending.then(() => {
      setAudioStatusMessage(
        `✓ Percusión lista: ${drum.loadedCount()}/${pieces.length} piezas reales`,
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

  // Track settings mapping changes — runs only when the SONG itself changes
  // (title/source). Avoids resetting user choices on incidental updates.
  const lastSongTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastSongTitleRef.current === song.title) return;
    lastSongTitleRef.current = song.title;

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

  // When mute/solo/pianoOnly toggles DURING playback, immediately silence
  // any voices that are no longer "active" per the new track config. This
  // makes the audio sync with the visual filtering on the very same frame
  // a user toggles a track. Notes scheduled in the future will pick up the
  // new state at trigger time (see scheduleSongOnTransport).
  useEffect(() => {
    if (!isPlaying) return;
    const trackState = {
      muted: trackMuted,
      solo: trackSolo,
      instruments: trackInstruments,
      pianoOnlyMode,
    };
    const nonPiano = pianoOnlyMode
      ? buildNonPianoTrackSet(song.tracks, trackInstruments)
      : undefined;

    // Walk currently sounding voices; release any that belong to a now-
    // inactive track. We iterate a copy because triggerRelease mutates the
    // underlying array.
    const voices = [...activeVoicesRef.current];
    voices.forEach((v) => {
      if (v.trackIndex === -1) return; // live MIDI input, never auto-mute
      if (!isTrackActive(v.trackIndex, trackState, nonPiano)) {
        triggerRelease(v.midi, v.trackIndex);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackMuted, trackSolo, pianoOnlyMode, isPlaying]);

  // Setup song loop scheduler
  const scheduleSongOnTransport = useCallback(() => {
    Tone.Transport.cancel(0);

    // A cleanup armed by a pause/stop must not land on the notes about to
    // start — this runs at the top of every playback and every seek.
    cancelVoiceCleanupRef.current?.();
    cancelVoiceCleanupRef.current = null;

    // Silence whatever is still sounding — without the click.
    //
    // This used to be three bare `releaseAll()` calls. On the Salamander
    // sampler `releaseAll` is a hard `source.stop()` per note with no fade at
    // all (Tone's `Sampler.js`), so every seek, every new track and the very
    // start of playback truncated the whole mix mid-waveform. Fading the
    // instrument busses and stopping the voices only *after* the fade makes the
    // transition silent.
    //
    // The GM samplers are the exception: their `release` is the sample's own
    // fade-out, so they are released rather than cut.
    const fade = fadeOutNodesVolume([
      samplerRef.current,
      ...(fallbackSynthsRef.current
        ? Object.values(fallbackSynthsRef.current)
        : []),
    ]);
    getLoadedGMSamplers().forEach((s) => s.releaseAll());
    drumKitRef.current?.releaseAll();
    if (fade.faded) {
      const samplers = getLoadedGMSamplers();
      stopVoicesDeferred(() => {
        samplerRef.current?.releaseAll();
        samplers.forEach((s) => s.releaseAll());
        if (fallbackSynthsRef.current) {
          Object.values(fallbackSynthsRef.current).forEach((synth) =>
            synth.releaseAll(),
          );
        }
      });
    }

    activeFreqsRef.current.clear();
    activeVoicesRef.current = [];
    activePlaybackNotesRef.current.clear();
    setActivePlaybackNotes(new Set());

    // ── Precomputed per-scheduling data ──────────────────────────
    //
    // Everything below used to be derived *inside* the per-note callback, and
    // that is exactly where it hurt: those callbacks run on the scheduler's
    // tick, so every millisecond they spend is a millisecond the note may
    // already be late. Two of them were quadratic in the size of the piece:
    //
    //   • `part.measures.flatMap(m => m.notes).find(n => n.id === note.id)`
    //     re-flattened every measure of the part and scanned it, for every note
    //     of every track. On a 3000-note score that is ~4.5M object visits per
    //     scheduling pass, all of it on the audio tick.
    //   • `buildNonPianoTrackSet` rebuilt the same set once per note.
    //
    // Both are now built once, here, outside the callbacks.

    /** `ScoreNote.id` is unique across the whole document (the parser embeds
     *  part, measure, pitch and onset), so one flat map is enough. */
    const scoreNotesById = new Map<string, ScoreNote>();
    if (scoreDocument) {
      for (const part of scoreDocument.parts) {
        for (const measure of part.measures) {
          for (const scoreNote of measure.notes) {
            scoreNotesById.set(scoreNote.id, scoreNote);
          }
        }
      }
    }

    // `trackInstruments` is replaced wholesale whenever the user edits a track,
    // so the instruments object doubles as the cache key: unchanged object means
    // an unchanged set, and a live edit recomputes it once (not once per note).
    let nonPianoCacheKey: Record<number, string> | null = null;
    let nonPianoCache: Set<number> | undefined;
    const nonPianoTrackSet = (instruments: Record<number, string>) => {
      if (nonPianoCacheKey !== instruments) {
        nonPianoCacheKey = instruments;
        nonPianoCache = buildNonPianoTrackSet(song.tracks, instruments);
      }
      return nonPianoCache;
    };

    // Schedule ALL notes regardless of current mute/solo. The actual
    // mute/solo/pianoOnly check happens AT TRIGGER TIME via stateRef so
    // toggling tracks during playback takes effect immediately for
    // upcoming notes (no re-scheduling needed).
    //
    // La percusión (canal 10) viaja en la MISMA pasada pero marcada: se dispara
    // contra el DrumKitEngine y no lleva note-off (son one-shots).
    const scheduledNotes = [
      ...song.notes.map((note) => ({ note, percussive: false })),
      ...(song.percussion ?? []).map((note) => ({ note, percussive: true })),
    ];

    scheduledNotes.forEach(({ note, percussive }) => {
      const duration = Math.max(0.04, note.duration);
      const tickStart = Math.round(
        (note.time / 60) * song.bpm * Tone.Transport.PPQ,
      );
      const tickEnd = Math.round(
        ((note.time + duration) / 60) * song.bpm * Tone.Transport.PPQ,
      );

      // Track which scheduled notes actually triggered (for note-off
      // pairing). We use a closed-over flag per note so that mute/solo
      // changes mid-playback don't cause stranded note-off calls or
      // mismatched activePlaybackNotes counts.
      let triggered = false;

      // Schedule note-on
      Tone.Transport.schedule((audioTime) => {
        // Read latest mute/solo/pianoOnly state from ref so changes during
        // playback take effect on subsequent notes.
        const trackState = {
          muted: stateRef.current.trackMuted,
          solo: stateRef.current.trackSolo,
          instruments: stateRef.current.trackInstruments,
          pianoOnlyMode: stateRef.current.pianoOnlyMode,
        };
        const nonPiano = trackState.pianoOnlyMode
          ? nonPianoTrackSet(trackState.instruments)
          : undefined;

        if (!isTrackActive(note.trackIndex, trackState, nonPiano)) {
          // Don't trigger anything for muted / soloed-out / hidden tracks.
          triggered = false;
          return;
        }
        triggered = true;

        const trackInst =
          trackState.instruments[note.trackIndex] || "Acoustic Grand Piano";
        const liveVolumes = stateRef.current.trackVolumes;
        const trackVol =
          liveVolumes[note.trackIndex] !== undefined
            ? liveVolumes[note.trackIndex]
            : 0.8;

        const registry = engineRegistryRef.current;
        const instType = registry?.getType(trackInst);
        // One hash lookup instead of a flatMap + linear scan per note.
        const scoreNote = scoreNotesById.get(note.id);

        // ── Percusión (canal 10): sólo samples reales ──
        //
        // Si la pieza todavía no bajó, el golpe se saltea en vez de caer al
        // PercussionEngine sintetizado (los osciladores ya no se usan nunca).
        if (percussive) {
          const drum = drumKitRef.current;
          const hitVelocity = Math.max(0.05, Math.min(1, note.velocity * trackVol));
          if (drum && !drum.trigger(note.midi, hitVelocity, audioTime)) {
            drum.noteSkipped(note.midi);
          }
          return;
        }

        // El PianoEngine solo si de verdad toca samples de piano: `instType`
        // devuelve "piano" para cualquier cosa con "piano" en el nombre (un
        // Rhodes, un piano eléctrico) y esos tienen su propio soundfont.
        if (
          registry &&
          instType === "piano" &&
          usesSalamanderPiano(trackInst) &&
          registry.hasPianoSampler() &&
          scoreNote
        ) {
          // World-class Piano engine
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
          // Todo lo demás (incluida una trompeta en una partitura) va al sample
          // real. Acá vivía el `TrumpetEngine`, un motor de osciladores con
          // articulaciones: sonaba a trompeta sintética y el dueño del proyecto
          // lo rechazó explícitamente ("solo sonidos reales").
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

      // Schedule note-off (only releases if note-on actually triggered).
      // La percusión no tiene note-off: el golpe es un one-shot.
      Tone.Transport.schedule(() => {
        if (!triggered || percussive) return;
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
    // Reads runtime mute/solo/pianoOnly/volumes from stateRef inside the
    // schedule callback, so toggling them mid-playback affects subsequent
    // notes immediately without rescheduling. Only re-schedules when the
    // song, the loaded score or the playback transport itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    song,
    scoreDocument,
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

      // The Transport counts from the scheduler's future, one window ahead of
      // the speakers. `heardTransportSeconds()` removes that window, so the
      // playhead, the falling notes, the game's hit window and the practice
      // pause all agree with what is being heard right now.
      const nextTime = heardTransportSeconds();

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
          // Pause the heard playhead *at* the onset, so the resume below starts
          // from the note the player was asked to play rather than from one
          // scheduler window further along.
          Tone.Transport.pause();
          Tone.Transport.ticks = ticksForHeardSeconds(upcoming.time);
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

    /**
     * El transporte no siempre está "started" en este instante: `startPlayback`
     * lo arranca con `startTransportMusic()`, que agenda el comienzo unos
     * milisegundos en el futuro (para que las primeras notas no nazcan
     * atrasadas). Revisar el estado UNA sola vez dejaba el bucle sin arrancar
     * nunca: el botón decía "Pausa", el transporte avanzaba por dentro, pero el
     * cursor, el reloj y las notas que caen quedaban congelados en 0.
     *
     * Se espera al estado con un tope (~2 s): si el transporte nunca arranca,
     * el bucle se rinde en vez de quedar girando para siempre.
     */
    const waitForTransport = (attempt = 0) => {
      if (Tone.Transport.state === "started") {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (attempt >= 120) {
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(() =>
        waitForTransport(attempt + 1),
      );
    };

    waitForTransport();
  }, [song.duration, screen]);

  // Reactively update playing tempo when playbackRate or song changes
  useEffect(() => {
    Tone.Transport.bpm.value = song.bpm * playbackRate;
  }, [playbackRate, song.bpm]);

  const stopPlayback = useCallback(() => {
    // Stop means stop: silence the busses over a few milliseconds instead of
    // cutting every sample mid-waveform, then hard-stop the voices once they
    // are already inaudible.
    const fade = fadeOutNodesVolume([
      samplerRef.current,
      ...(fallbackSynthsRef.current
        ? Object.values(fallbackSynthsRef.current)
        : []),
    ]);
    const gmSamplers = getLoadedGMSamplers();

    // A cleanup armed by an earlier stop must not fire into this new state.
    cancelVoiceCleanupRef.current?.();
    cancelVoiceCleanupRef.current = stopVoicesDeferred(() => {
      gmSamplers.forEach((s) => s.releaseAll());
      samplerRef.current?.releaseAll();
      if (fallbackSynthsRef.current) {
        Object.values(fallbackSynthsRef.current).forEach((s) => s.releaseAll());
      }
    }, fade.fadeSec + 0.05);

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
    // Pause releases the notes that are still held (the Transport's own
    // note-off callbacks never fire once it is paused) and fades the busses so
    // a sample truncated by that release cannot click.
    const fade = fadeOutNodesVolume([
      samplerRef.current,
      ...(fallbackSynthsRef.current
        ? Object.values(fallbackSynthsRef.current)
        : []),
    ]);
    const gmSamplers = getLoadedGMSamplers();

    cancelVoiceCleanupRef.current?.();
    cancelVoiceCleanupRef.current = stopVoicesDeferred(() => {
      samplerRef.current?.releaseAll();
      if (fallbackSynthsRef.current) {
        Object.values(fallbackSynthsRef.current).forEach((s) => s.releaseAll());
      }
    }, fade.fadeSec + 0.05);

    Tone.Transport.pause();
    setIsPlaying(false);
    setActiveMidiNotes(new Set());
    setActivePlaybackNotes(new Set());
    activePlaybackNotesRef.current.clear();
    sustainedNotesRef.current.clear();
    activeVoicesRef.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    // Released here rather than inside the cleanup: their own `release` is what
    // fades them out, so it has to run while the notes are still sounding.
    gmSamplers.forEach((s) => s.releaseAll());
  }, []);

  const startPlayback = useCallback(
    async (offsetSec?: number) => {
      if (!song.notes.length) return;
      if (!stateRef.current.isAudioReady) {
        setIsAudioLoading(true);
        try {
          await initializeAudio();
        } finally {
          setIsAudioLoading(false);
        }
      }

      // Sin sintetizador de respaldo, una nota que llega antes que su sample no
      // suena: mejor esperar a que la canción tenga sus instrumentos. El tope
      // es corto (7 s) porque las fuentes pesadas (VSCO ~2 MB por muestra)
      // pueden tardar: lo que falte se suma solo cuando termina de bajar.
      if (samplesPendingRef.current) {
        setIsAudioLoading(true);
        setAudioStatusMessage("Esperando los instrumentos reales de la canción...");
        try {
          await Promise.race([
            Promise.all([songSamplesReadyRef.current, drumReadyRef.current]),
            new Promise((resolve) => setTimeout(resolve, 7_000)),
          ]);
        } finally {
          setIsAudioLoading(false);
          setAudioStatusMessage("");
        }
      }

      // The player asks to start at an explicit offset (a new track, or a
      // scrub made while paused) — honour it before the transport is started,
      // because `startPlayback` otherwise resumes from `currentTime`.
      const from = offsetSec ?? currentTime;
      scheduleSongOnTransport();

      Tone.Transport.bpm.value = song.bpm * playbackRate;
      // `ticksForHeardSeconds` rather than a bare tick computation: it adds the
      // scheduler's window back on, so the requested offset is what the
      // listener hears rather than one window further into the song.
      Tone.Transport.ticks = ticksForHeardSeconds(from);
      lastPlayedTimeRef.current = from - 0.01;
      // `startTransportMusic` rather than `start()`: a transport started at
      // "now" reports its first events against a moment that has already passed,
      // so the opening notes of every song used to be rendered all at once.
      startTransportMusic();
      setIsPlaying(true);
      syncTransportClock();
    },
    [
      song,
      playbackRate,
      currentTime,
      scheduleSongOnTransport,
      syncTransportClock,
      initializeAudio,
    ],
  );

  // Live references so the memoised engine bridge never calls a stale closure.
  const startPlaybackRef = useRef(startPlayback);
  const seekToRef = useRef<(sec: number) => void>(() => {});
  const pausePlaybackRef = useRef<() => void>(() => {});
  const stopPlaybackRef = useRef<() => void>(() => {});
  const setMasterVolumeRef = useRef<(db: number) => void>(() => {});

  const seekTo = useCallback(
    (nextTime: number) => {
      const clamped = clamp(nextTime, 0, song.duration);
      setCurrentTime(clamped);
      Tone.Transport.ticks = ticksForHeardSeconds(clamped);
      activePlaybackNotesRef.current.clear();
      setActivePlaybackNotes(new Set());
      lastPlayedTimeRef.current = clamped - 0.01;

      if (isPlaying) {
        scheduleSongOnTransport();
        startTransportMusic();
        syncTransportClock();
      }
    },
    [song.duration, isPlaying, scheduleSongOnTransport, syncTransportClock],
  );

  const gameBestKey = useMemo(
    () => `${song.title}::${gameMode}::${gameDifficulty}`,
    [song.title, gameMode, gameDifficulty],
  );

  // All engine commands now exist, so the bridge's live references can be
  // wired up. Keeping them as refs is what lets the bridge object itself be
  // created once. The assignments live in an effect (not in the render body)
  // because writing to a ref during render is a React rules-of-hooks offence;
  // effects run before any user interaction can reach these handlers, so the
  // one-commit lag is unobservable.
  useEffect(() => {
    seekToRef.current = seekTo;
    pausePlaybackRef.current = pausePlayback;
    stopPlaybackRef.current = stopPlayback;
    setMasterVolumeRef.current = setMasterVolume;
    startPlaybackRef.current = startPlayback;
  });

  // ── Music player: engine bridge ───────────────────────────────
  //
  // The player (music/PlayerContext) owns the queue and decides what plays
  // next; App owns Tone.Transport, the samplers and the falling-notes state.
  // These callbacks are the only seam between them, which is what lets the
  // Studio, the canvas and the rhythm game keep working unchanged.

  /** Engine playhead in seconds, as heard. Stable identity — read imperatively. */
  const getEnginePosition = useCallback(() => {
    const heard = heardTransportSeconds();
    // Before playback has started there is no transport position to report, so
    // fall back to the last value the rAF loop published. (`heard` is 0 here,
    // not because the tick count is 0 — it never is now that the counter starts
    // inside the scheduler's window — but because the window cancels it out.)
    if (Tone.Transport.state !== "started" && heard <= 0) {
      return currentTimeRef.current;
    }
    return heard;
  }, []);

  // The rAF loop owns `currentTime`; this mirrors it into a ref so
  // `getEnginePosition` can answer while the transport is stopped. The guard
  // keeps the effect from re-running the setter on every unrelated render.
  useEffect(() => {
    if (currentTimeRef.current !== currentTime) {
      currentTimeRef.current = currentTime;
    }
  }, [currentTime]);

  /** Loads a track the player resolved into the engine (does not start it). */
  const handlePlayerLoad = useCallback(
    (nextSong: SongData) => {
      // Already loaded (e.g. "play" on the current track after a manual stop) —
      // reloading would needlessly re-centre the keyboard.
      if (nextSong.trackId && nextSong.trackId === song.trackId) return;

      stopPlayback();
      setSong(nextSong);
      setScoreDocument(null);
      setScoreAnalysis(null);
      setScoreParts([]);
      activePlaybackNotesRef.current.clear();
      setActivePlaybackNotes(new Set());
      lastPlayedTimeRef.current = -1;

      // Bring the 37-key window onto the range the piece actually uses, same
      // rule as a manual import.
      if (nextSong.notes.length > 0) {
        const pitches = nextSong.notes.map((note) => note.midi);
        const centre = Math.round(
          (Math.min(...pitches) + Math.max(...pitches)) / 2,
        );
        setRangeStart(
          snapToC(clamp(centre, PIANO_MIN_MIDI, PIANO_MAX_MIDI - RANGE_KEY_COUNT + 1)),
        );
      }

      // Warm the samplers in the background so pressing play is instant.
      if (!stateRef.current.isAudioReady) {
        void initializeAudio().catch(() => {
          /* stays silent until the user's next gesture retries */
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [song.trackId, stopPlayback, initializeAudio],
  );

  /**
   * Live mirror of the engine's inputs. The bridge is memoised so the player
   * can register it once, which means it must NOT close over render values —
   * `startPlayback` in particular would otherwise run against the *previous*
   * song when the player loads a new track and immediately presses play.
   */
  const playerBridgeRef = useRef({ song, currentTime, isPlaying });
  useEffect(() => {
    playerBridgeRef.current = { song, currentTime, isPlaying };
  });

  /** Waits for the render that installed `song` before it can be played. */
  const nextFrame = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

  /**
   * Makes sure the audio engine is built before the transport is asked to
   * play. `startPlayback` returns early (and silently) when the engine is not
   * ready, which is exactly the state a cold-start player press lands in: the
   * audio context may not even be unlocked yet.
   */
  const ensureEngineReady = useCallback(async () => {
    if (stateRef.current.isAudioReady) return;
    setIsAudioLoading(true);
    try {
      await initializeAudio();
    } finally {
      setIsAudioLoading(false);
    }
  }, [initializeAudio]);

  /**
   * The bridge hands the player a *live* view of the engine. Every command
   * re-reads state on the next frame, because the player typically calls
   * `load()` and `play()` in the same tick and React has not yet committed the
   * new song.
   */
  const engineBridge = useMemo(
    () => ({
      load: (nextSong: SongData) => handlePlayerLoad(nextSong),
      play: async (offsetSec?: number) => {
        await ensureEngineReady();
        await nextFrame();
        if (!playerBridgeRef.current.isPlaying) {
          await startPlaybackRef.current(offsetSec);
        } else if (offsetSec !== undefined) {
          seekToRef.current(offsetSec);
        }
      },
      pause: () => pausePlaybackRef.current(),
      stop: () => stopPlaybackRef.current(),
      seek: (sec: number) => seekToRef.current(sec),
      setVolume: (volume: number, muted: boolean) => {
        // The player speaks 0..1 while this app's master volume is in dB (the
        // Studio slider works in the same range), so map onto it and drive the
        // shared state — that keeps both volume controls in agreement.
        const db = muted ? -60 : -40 + volume * 40;
        setMasterVolumeRef.current(db);
        volNodeRef.current?.volume.rampTo(db, 0.05);
      },
    }),
    [handlePlayerLoad, ensureEngineReady],
  );

  /**
   * The transport stopped because the song reached its end. The player decides
   * what plays next; this only reports the event.
   */
  const handleTrackFinished = useCallback(() => {
    player.notifyEnded();
  }, [player]);

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
    const trackState = {
      muted: trackMuted,
      solo: trackSolo,
      instruments: trackInstruments,
      pianoOnlyMode,
    };
    const nonPiano = pianoOnlyMode
      ? buildNonPianoTrackSet(song.tracks, trackInstruments)
      : undefined;
    const source = song.notes.filter((note) =>
      isTrackActive(note.trackIndex, trackState, nonPiano),
    ) as RhythmSourceNote[];

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
  }, [gameDifficulty, gameMode, rangeStart, song.notes, song.tracks, trackMuted, trackSolo, trackInstruments, pianoOnlyMode]);

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
      const parsedPercussion: SongNote[] = [];

      // La percusión (canal 10) ya NO se descarta: se separa. Sus golpes van a
      // `percussion` para que el piano-roll, el juego y la práctica —que
      // recorren `notes`— sigan mostrando sólo teclas tocables, mientras el
      // transporte los agenda contra el DrumKitEngine.
      const isDrumTrack = (t: (typeof midi.tracks)[number]) =>
        t.channel === 9 || t.instrument?.percussion === true;
      const withNotes = midi.tracks
        .map((track, i) => ({ track, origIdx: i }))
        .filter(({ track }) => track.notes.length > 0 && !isDrumTrack(track))
        .sort((a, b) => b.track.notes.length - a.track.notes.length) // más notas primero
        .slice(0, 8); // máximo 8 pistas melódicas
      // El kit va al final: así los índices de las pistas melódicas no cambian
      // respecto de las canciones ya cargadas y la mezcla guardada sigue válida.
      const drumTracks = midi.tracks
        .map((track, i) => ({ track, origIdx: i }))
        .filter(({ track }) => track.notes.length > 0 && isDrumTrack(track))
        .slice(0, 2);
      const validTracks = [...withNotes, ...drumTracks];

      validTracks.forEach(({ track, origIdx }, newIdx) => {
        const color = TRACK_COLORS[newIdx % TRACK_COLORS.length];
        const noteCount = track.notes.length;
        const isDrumKit = isDrumTrack(track);

        parsedTracks.push({
          index: newIdx,
          name:
            track.name?.trim() ||
            (isDrumKit ? "Percusión" : `Pista ${newIdx + 1}`),
          instrument: isDrumKit
            ? "GM Drum Kit"
            : gmProgramToInstrument(track.instrument?.number ?? 0, track.name),
          noteCount,
          color,
          isDrumKit,
        });

        const bucket = isDrumKit ? parsedPercussion : parsedNotes;
        track.notes.forEach((note, noteIndex) => {
          bucket.push({
            id: `${isDrumKit ? "perc" : "midi"}-${origIdx}-${noteIndex}-${note.midi}`,
            midi: note.midi,
            time: note.time,
            duration: Math.max(0.04, note.duration),
            velocity: note.velocity || 0.75,
            trackIndex: newIdx,
          });
        });
      });

      parsedNotes.sort((a, b) => a.time - b.time);
      const duration = [...parsedNotes, ...parsedPercussion].reduce(
        (max, note) => Math.max(max, note.time + note.duration),
        0,
      );
      const bpm = Math.round(midi.header.tempos[0]?.bpm || 120);

      const uploadName = file.name;
      const newSong: SongData = {
        title: file.name.replace(/\.[^.]+$/, ""),
        source: "Archivo subido",
        duration,
        bpm,
        notes: parsedNotes,
        percussion: parsedPercussion,
        tracks: parsedTracks,
        // Stable id from filename + size, so re-importing the same file keeps
        // its likes, play count and playlist memberships.
        trackId: uploadTrackId(uploadName, file.size),
        uploadName,
        uploadBytes: file.size,
        // Uploaded .kar files carry their own lyrics — pick them up too.
        lyrics: extractLyrics(
          bytes,
          midi.header.ticksToSeconds.bind(midi.header),
        ),
      };

      setSongsList((prev) => [
        newSong,
        ...prev.filter((s) => s.title !== newSong.title),
      ]);
      // Register in the player's catalogue and cache the parsed notes so the
      // player bar can play it without a round trip.
      putSessionSong(newSong);
      libraryStore.registerTracks([
        { song: newSong, source: sourceInfoFor(newSong, idForSong(newSong)) },
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
            trackId: scoreTrackId(file.name),
            uploadName: file.name,
          };

          setSong(newSong);
          setSongsList((prev) => [
            newSong,
            ...prev.filter((s) => s.title !== newSong.title),
          ]);
          putSessionSong(newSong);
          libraryStore.registerTracks([
            { song: newSong, source: sourceInfoFor(newSong, idForSong(newSong)) },
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
      // Idle detection: if nothing is happening, throttle to ~4 FPS to save CPU/battery.
      // We still need *some* frames so screen-resize/keyFx changes get rendered,
      // but at idle there's nothing animating worth 60 fps.
      const idleState = stateRef.current;
      const isIdle =
        !idleState.isPlaying &&
        idleState.activeNotes.size === 0 &&
        idleState.gameStatus !== "playing" &&
        (!idleState.practiceTargets || idleState.practiceTargets.size === 0);
      const effectiveFrameMs = isIdle ? 250 : targetFrameMs;
      const ts = now ?? performance.now();
      if (ts - lastDrawAt < effectiveFrameMs - 1) {
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
      // Build the full track-state snapshot from stateRef so muted/soloed
      // tracks disappear from the falling notes view IMMEDIATELY, in sync
      // with the audio scheduler's trigger-time check.
      const drawTrackState = {
        muted: stateRef.current.trackMuted,
        solo: stateRef.current.trackSolo,
        instruments: localTrackInstruments,
        pianoOnlyMode: localPianoOnly,
      };
      const nonPianoTrackSet = localPianoOnly
        ? buildNonPianoTrackSet(localSong.tracks, localTrackInstruments)
        : undefined;

      const visibleNotes: {
        time: number;
        duration: number;
        midi: number;
        trackIndex: number;
      }[] = [];
      for (let ni = startIdx; ni < noteSource.length; ni++) {
        const note = noteSource[ni];
        if (note.time > windowEnd) break;
        // Skip muted, soloed-out, or non-piano (when pianoOnly) tracks
        if (!isTrackActive(note.trackIndex, drawTrackState, nonPianoTrackSet)) {
          continue;
        }
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
      // `seconds` is a wrapper over `ticks` that counts inside the scheduler's
      // window, so assigning the onset directly would resume one window past
      // the note the player was asked to play. Assign the ticks instead.
      Tone.Transport.ticks = ticksForHeardSeconds(activeWaitingOnset.time);
      startTransportMusic();
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
      const { velocityCurve: vc, velocityCalibration: vCal } = stateRef.current;

      // Auto-calibrate the controller's velocity range over time so the
      // user's softest stroke maps to actual ppp dynamics (not 6% gain).
      if (isNoteOn && vCal.autoCalibrationEnabled) {
        const updated = recordVelocityObservation(vCal, rawVelocity);
        // Throttle persistence: only commit every 8 strikes to avoid
        // spamming localStorage during fast playing.
        if (updated.sampleCount % 8 === 0 || updated.sampleCount < 32) {
          setVelocityCalibration(updated);
        }
        // Update ref immediately for the next note in this same callback chain.
        stateRef.current.velocityCalibration = updated;
      }

      // Apply velocity curve through the calibrated pipeline:
      //   raw → calibration remap → curve → audibility floor
      const velocity = midiVelocityToGain(rawVelocity, vc, stateRef.current.velocityCalibration);

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
      disposeAllInstruments();
      drumKitRef.current?.dispose();
      engineRegistryRef.current?.disposeAll();
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

  /**
   * Karaoke lyrics for the loaded song, in the same time domain as the
   * transport (so they cannot drift when the tempo or playback rate changes).
   */
  const lyricLines: LyricLine[] = song.lyrics ?? [];
  const [showLyrics, setShowLyrics] = useState(false);

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
            className={`rail-item ${screen === "music" ? "active" : ""}`}
            onClick={() => setScreen("music")}
            title="Música — tu reproductor"
          >
            <Icons.Songs />
            Música
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

        {/* Main column: the persistent player wraps the workspace so both the
            bottom bar and every screen share the player's UI context. */}
        <PlayerSection
          bridge={engineBridge}
          getPosition={getEnginePosition}
          onTrackFinished={handleTrackFinished}
          hasScore={Boolean(scoreDocument)}
          onOpenStudio={() => setScreen("studio")}
          onOpenScore={() => setScreen("score")}
          onOpenGame={() => setScreen("game")}
        >
        <div className="app-shell">
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
                onClick={() => (isPlaying ? pausePlayback() : void startPlayback())}
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
                className={`btn ${showLyrics ? "primary" : ""}`}
                onClick={() => setShowLyrics((on) => !on)}
                aria-pressed={showLyrics}
                title={
                  lyricLines.length > 0
                    ? showLyrics
                      ? "Volver a las métricas"
                      : "Ver la letra sincronizada"
                    : "Esta canción no trae letra"
                }
                disabled={lyricLines.length === 0 && !showLyrics}
              >
                <Icons.Lyrics />
                Letra
                {lyricLines.length > 0 && (
                  <span className="lyrics-count">{lyricLines.length}</span>
                )}
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
                  aria-label="Cargar archivo MIDI"
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

              {/* Right panel: live metrics, the game HUD, or the karaoke
                  lyrics when that mode is on. The HUD always wins in game
                  mode — it carries live scoring the player needs. */}
              <div
                className={
                  "panel-right" +
                  (showLyrics && screen !== "game"
                    ? " panel-right--lyrics"
                    : "")
                }
              >
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
                ) : showLyrics ? (
                  <LyricsPanel
                    lines={lyricLines}
                    currentTime={currentTime}
                    duration={song.duration}
                    songTitle={
                      song.title !== EMPTY_SONG.title ? song.title : undefined
                    }
                  />
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
                        <strong>
                          {lastVelocity} / 127
                          {velocityCalibration.autoCalibrationEnabled && velocityCalibration.sampleCount > 8 ? (
                            <span style={{ fontSize: "0.65rem", marginLeft: 6, color: "rgba(229,231,235,0.55)" }}>
                              ({velocityCalibration.minObserved}-{velocityCalibration.maxObserved})
                            </span>
                          ) : null}
                        </strong>
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

          {/* Songs view panel — rich browser grouped by genre */}
          {screen === "songs" && (
            <section className="panel-screen">
              <SongLibrary
                songs={songsList}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                onSelectSong={(s) => {
                  setSong(s);
                  stopPlayback();
                  setScreen("studio");
                }}
                onImportFile={handleScoreImport}
                importLoading={scoreImportLoading}
                importError={scoreImportError}
                importLastFile={scoreLastImported}
              />
            </section>
          )}

          {/* Música — the Spotify-style player section */}
          {screen === "music" && (
            <section className="panel-screen panel-screen--music">
              <MusicPanel
                onImportFile={handleScoreImport}
                importLoading={scoreImportLoading}
                importError={scoreImportError}
                importLastFile={scoreLastImported}
              />
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
                    <label>Auto-calibración del controlador</label>
                    <span>
                      La mayoría de teclados solo envían velocity 25-127.
                      La auto-calibración aprende tu rango real (mín {velocityCalibration.minObserved} - máx {velocityCalibration.maxObserved}{velocityCalibration.sampleCount > 0 ? `, ${velocityCalibration.sampleCount} muestras` : ", sin muestras todavía"}) y lo estira a 0-100 % antes de aplicar la curva. Sin esto, tu nota más suave nunca llega a pianissimo real.
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    <label className="switch-toggle" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={velocityCalibration.autoCalibrationEnabled}
                        onChange={(e) =>
                          setVelocityCalibration({
                            ...velocityCalibration,
                            autoCalibrationEnabled: e.target.checked,
                          })
                        }
                        style={{ accentColor: "#8b5cf6" }}
                      />
                      <span style={{ fontSize: "0.85rem" }}>
                        {velocityCalibration.autoCalibrationEnabled ? "Activa" : "Inactiva"}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: "0.75rem", padding: "4px 10px", height: 28 }}
                      onClick={() => setVelocityCalibration(DEFAULT_CALIBRATION)}
                    >
                      Reiniciar calibración
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-col">
                    <label>Floor de audibilidad</label>
                    <span>
                      Ganancia mínima para tu nota más suave. {Math.round(velocityCalibration.audibilityFloor * 100)}% — sin esto, una velocity 1 quedaría inaudible incluso en la curva &quot;piano&quot;.
                    </span>
                  </div>
                  <input
                    type="range"
                    className="slider-custom"
                    aria-label="Floor de audibilidad"
                    min={0}
                    max={0.15}
                    step={0.01}
                    value={velocityCalibration.audibilityFloor}
                    onChange={(e) =>
                      setVelocityCalibration({
                        ...velocityCalibration,
                        audibilityFloor: Number(e.target.value),
                      })
                    }
                    style={{ minWidth: 200, maxWidth: 320 }}
                  />
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
        </PlayerSection>
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
