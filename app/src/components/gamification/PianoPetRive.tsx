// ============================================================
// PianoPetRive — Rive-powered interactive character overlay
// Sits above the piano keys, reacts to music in real-time.
//
// HOW TO USE:
//   1. Go to one of the URLs listed below
//   2. Click "Download" → rename file to "pet.riv"
//   3. Place in  app/public/pet.riv
//   4. Restart dev server
//
// RECOMMENDED FREE FILES (CC-BY license):
//   🕺 Dance:   https://rive.app/marketplace/7910-15259-diana-character-dancing/
//   🚶 Walk:    https://rive.app/marketplace/9779-18650-walk-cycle/
//   🧍 Idle+W:  https://rive.app/marketplace/15768-29721-idle-and-walk-animation/
//   👾 Hover:   https://rive.app/marketplace/24177-45170-interactive-hover-character-walk-and-rest-animation/
//
// BEST COMBO: Download the "Walk Cycle" (has state machine + constraints).
// For alien aesthetic: any character works — you can change look in rive.app editor.
// ============================================================

// canvas-single embeds the WASM inline — no separate .wasm fetch, works in any Vite setup
import { useRive, Layout, Fit, Alignment } from "@rive-app/react-canvas-lite";
import { useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────

type PetMood = "sleep" | "idle" | "walk" | "dance" | "celebrate";

export interface PianoPetRiveProps {
  isPlaying: boolean;
  bpm: number;
  activeNoteCount: number;
  fxColor: string;
  show: boolean;
  onLoaded?: () => void; // fires when .riv loaded → hides canvas fallback
  onMissing?: () => void; // fires when .riv not found → keeps canvas fallback
}

// ── Mood resolution ─────────────────────────────────────────

function resolveMood(isPlaying: boolean, noteCount: number): PetMood {
  if (!isPlaying) return "sleep";
  if (noteCount >= 4) return "celebrate";
  if (noteCount > 0) return "dance";
  return "walk";
}

// ── Smart animation name matching ───────────────────────────
// Handles any naming convention found in marketplace files

const MOOD_KEYWORDS: Record<PetMood, string[]> = {
  sleep: ["sleep", "rest", "tired", "idle_slow", "zz", "sleeping", "nap"],
  idle: [
    "idle",
    "stand",
    "breathe",
    "neutral",
    "default",
    "waiting",
    "blink",
    "look",
  ],
  walk: ["walk", "walking", "run", "move", "stroll", "jog", "strut", "march"],
  dance: [
    "dance",
    "dancing",
    "groove",
    "bop",
    "bounce",
    "jump",
    "happy",
    "excited",
    "party",
    "move",
  ],
  celebrate: [
    "celebrate",
    "win",
    "victory",
    "cheer",
    "party",
    "excited",
    "wow",
    "yay",
    "success",
  ],
};

function findBestAnim(allNames: string[], mood: PetMood): string | null {
  if (!allNames.length) return null;
  const kws = MOOD_KEYWORDS[mood];
  const lower = allNames.map((n) => n.toLowerCase());

  // 1. Exact match
  for (const kw of kws) {
    const i = lower.findIndex((n) => n === kw);
    if (i !== -1) return allNames[i];
  }
  // 2. Starts-with match
  for (const kw of kws) {
    const i = lower.findIndex((n) => n.startsWith(kw));
    if (i !== -1) return allNames[i];
  }
  // 3. Contains match
  for (const kw of kws) {
    const i = lower.findIndex((n) => n.includes(kw));
    if (i !== -1) return allNames[i];
  }
  return null;
}

function buildMoodMap(allNames: string[]): Record<PetMood, string> {
  const moods: PetMood[] = ["sleep", "idle", "walk", "dance", "celebrate"];
  const result = {} as Record<PetMood, string>;

  for (const mood of moods) {
    const found = findBestAnim(allNames, mood);
    result[mood] = found ?? allNames[0] ?? "";
  }

  return result;
}

// ── State machine input helpers ─────────────────────────────

// Common boolean input names across Rive marketplace files
// "hover" is heavily used in Rive's own example files (hero-v6, etc.)
const SM_BOOL_PLAYING = [
  "isPlaying",
  "playing",
  "active",
  "on",
  "isActive",
  "hover",
  "isHover",
  "interact",
  "engaged",
];
const SM_TRIG_DANCE = [
  "dance",
  "Dancing",
  "isDancing",
  "startDance",
  "trigDance",
];
const SM_TRIG_SLEEP = ["sleep", "Sleeping", "rest", "isSleep"];
const SM_TRIG_WALK = ["walk", "Walking", "isWalking", "startWalk"];
const SM_TRIG_CELEBRATE = ["celebrate", "Celebrate", "win", "party"];
const SM_TRIG_IDLE = ["idle", "Idle", "isIdle"];

const MOOD_TRIGGERS: Record<PetMood, string[]> = {
  sleep: SM_TRIG_SLEEP,
  idle: SM_TRIG_IDLE,
  walk: SM_TRIG_WALK,
  dance: SM_TRIG_DANCE,
  celebrate: SM_TRIG_CELEBRATE,
};

// ── Component ───────────────────────────────────────────────

export function PianoPetRive({
  isPlaying,
  bpm,
  activeNoteCount,
  fxColor,
  show,
  onLoaded,
  onMissing,
}: PianoPetRiveProps) {
  const [moodMap, setMoodMap] = useState<Record<PetMood, string> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isMissing, setIsMissing] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("");

  const prevBpmFactor = useRef(1);
  const hasSM = useRef(false);
  const detectedSM = useRef<string | null>(null);

  // ── Rive instance ──────────────────────────────
  // autoplay=true without stateMachines → Rive auto-starts first SM if present
  const { rive, RiveComponent } = useRive({
    src: "/pet.riv",
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.BottomCenter,
    }),
    onLoadError: () => {
      setIsMissing(true);
      onMissing?.();
    },
  });

  // ── On load: detect animations + build map ─────────────────
  useEffect(() => {
    if (!rive) return;

    const animNames = rive.animationNames ?? [];
    const smNames = rive.stateMachineNames ?? [];

    console.groupCollapsed("[PianoPet Rive] Loaded!");
    console.log("Animations:", animNames);
    console.log("State Machines:", smNames);
    console.groupEnd();

    hasSM.current = smNames.length > 0;
    detectedSM.current = smNames[0] ?? null;

    // If SM found, start it explicitly (some files need this)
    if (smNames.length > 0) {
      try {
        rive.play(smNames[0]);
      } catch {
        /* SM already running */
      }
      // Log SM inputs immediately so we can debug
      const inputs = rive.stateMachineInputs(smNames[0]) ?? [];
      console.log(
        "[PianoPet] SM inputs:",
        inputs.map((i) => `${i.name}(${typeof i.value})`),
      );
    }

    setDebugInfo(
      animNames.length
        ? `${animNames.length} anim${animNames.length > 1 ? "s" : ""}: ${animNames.slice(0, 3).join(", ")}${animNames.length > 3 ? "…" : ""}`
        : smNames.length
          ? `SM: ${smNames[0]}`
          : "No animations found",
    );

    if (animNames.length > 0) {
      const map = buildMoodMap(animNames);
      console.log("[PianoPet Rive] Mood map:", map);
      setMoodMap(map);
    } else {
      // File uses only state machines — leave moodMap null, drive via SM inputs
      setMoodMap({} as Record<PetMood, string>);
    }

    setIsReady(true);
    onLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rive]);

  // ── Sync music state → animation + speed ─────────────────────
  useEffect(() => {
    if (!rive || !isReady) return;

    const mood = resolveMood(isPlaying, activeNoteCount);

    // Speed sync (normalize to 120 BPM baseline)
    const bpmFactor = Math.max(0.25, Math.min(3.5, bpm / 120));
    if (Math.abs(bpmFactor - prevBpmFactor.current) > 0.04) {
      // @ts-ignore - speed property exists at runtime but not in types
      rive.speed = bpmFactor;
      prevBpmFactor.current = bpmFactor;
    }

    // ── State machine ────────────────────────────────
    if (hasSM.current && detectedSM.current) {
      const inputs = rive.stateMachineInputs(detectedSM.current) ?? [];

      const isCelebrate = mood === "celebrate";
      const isDance = mood === "dance" || isCelebrate;
      const isSleeping = mood === "sleep";

      for (const input of inputs) {
        const n = input.name.toLowerCase();

        // ── hero-v6.riv specific: h_* booleans control each character ─
        // h_human → humanoid character dances when notes play
        // h_brain → brain alien celebrates on chords (4+ notes)
        // h_shape, h_screen, h_arm → active during any playback
        if (n === "h_human") {
          input.value = isDance;
          continue;
        }
        if (n === "h_brain") {
          input.value = isCelebrate;
          continue;
        }
        if (n === "h_shape") {
          input.value = isPlaying && !isSleeping;
          continue;
        }
        if (n === "h_screen") {
          input.value = isPlaying && !isSleeping;
          continue;
        }
        if (n === "h_arm") {
          input.value = isPlaying && !isSleeping;
          continue;
        }

        // ── Generic number inputs ──────────────────────────
        // xPos: map to note density (spread notes = spread characters)
        // yPos: map to intensity
        if (n === "xpos" && typeof input.value === "number") {
          input.value =
            activeNoteCount > 0
              ? 0.5 + Math.sin(Date.now() * 0.001) * 0.3
              : 0.5;
          continue;
        }
        if (n === "ypos" && typeof input.value === "number") {
          input.value = isDance ? 0.8 : isSleeping ? 0.2 : 0.5;
          continue;
        }

        // ── Generic fallback: any boolean matching SM_BOOL_PLAYING names ─
        if (SM_BOOL_PLAYING.some((k) => k.toLowerCase() === n)) {
          input.value = isPlaying;
          continue;
        }

        // ── Fire mood triggers ───────────────────────────────
        const moodTrigs = MOOD_TRIGGERS[mood] ?? [];
        if (moodTrigs.some((t) => t.toLowerCase() === n)) {
          if (
            "fire" in input &&
            typeof (input as unknown as Record<string, unknown>).fire ===
              "function"
          ) {
            (input as unknown as { fire: () => void }).fire();
          } else {
            input.value = true;
          }
        }
      }
    }

    // ── Strategy 2: direct timeline animation play ─────────────
    // rive.isPlaying is a boolean getter, NOT a function — use playingAnimationNames[]
    if (moodMap && moodMap[mood]) {
      const target = moodMap[mood];
      const alreadyPlaying = (rive.playingAnimationNames ?? []).includes(
        target,
      );
      if (target && !alreadyPlaying) {
        rive.play(target);
      }
    }
  }, [rive, isReady, isPlaying, bpm, activeNoteCount, moodMap]);

  // ── Early returns ──────────────────────────────────────────
  if (!show || isMissing) return null;

  return (
    <div
      className="piano-pet-rive-overlay"
      style={{ "--pet-fx-color": fxColor } as React.CSSProperties}
    >
      {/* Debug badge (dev only — invisible in prod) */}
      {import.meta.env.DEV && isReady && (
        <div className="piano-pet-rive-debug">{debugInfo}</div>
      )}

      {/* Loading pulse while file loads */}
      {!isReady && (
        <div className="piano-pet-rive-loading">
          <span className="piano-pet-rive-pulse" />
          Cargando personaje Rive…
        </div>
      )}

      {/* The Rive canvas */}
      <RiveComponent className="piano-pet-rive-canvas" />
    </div>
  );
}
