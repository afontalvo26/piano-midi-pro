import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { EnhancedGameStats, HitGrade } from "../../game/engine";

interface GameHUDProps {
  stats: EnhancedGameStats;
  lastGrade: HitGrade | null;
  status: "playing" | "countdown" | "setup" | "results";
  countdown: number;
  songProgress: number; // 0-1
  onActivateStarPower: () => void;
  difficulty: string;
  shiftLabel?: string;
  comboMilestone: number | null;
}

// ── Tier + grade config ──────────────────────────────────────
const TIER_CONFIG = [
  { min: 250, color: "#c084fc", mult: 32 },
  { min: 100, color: "#a78bfa", mult: 16 },
  { min: 50, color: "#f87171", mult: 8 },
  { min: 25, color: "#fb923c", mult: 4 },
  { min: 10, color: "#fbbf24", mult: 2 },
  { min: 0, color: "#94a3b8", mult: 1 },
];
function getComboTier(n: number) {
  return (
    TIER_CONFIG.find((t) => n >= t.min) ?? TIER_CONFIG[TIER_CONFIG.length - 1]
  );
}

const GRADE_CFG: Record<HitGrade, { label: string; color: string }> = {
  perfect_plus: { label: "PERFECT+", color: "#ffd700" },
  perfect: { label: "PERFECT", color: "#34d399" },
  great: { label: "GREAT", color: "#60a5fa" },
  good: { label: "GOOD", color: "#fbbf24" },
  miss: { label: "MISS", color: "#ef4444" },
};

const MONO = "ui-monospace, monospace";

// ── Component ────────────────────────────────────────────────
export function GameHUD({
  stats,
  lastGrade,
  status,
  countdown,
  songProgress,
  onActivateStarPower,
  difficulty,
  shiftLabel,
  comboMilestone,
}: GameHUDProps) {
  const hudRef = useRef<HTMLDivElement>(null);
  const gradeCntRef = useRef(0); // ensures AnimatePresence sees a new key when same grade fires twice

  const { contextSafe } = useGSAP({ scope: hudRef });

  useEffect(() => {
    if (lastGrade) gradeCntRef.current++;
  }, [lastGrade]);

  // GSAP screen shake — contextSafe ties lifecycle to useGSAP scope (auto-cleanup)
  useEffect(() => {
    if (lastGrade !== "miss") return;
    contextSafe(() => {
      gsap
        .timeline()
        .to(hudRef.current, { x: -8, duration: 0.05, ease: "none" })
        .to(hudRef.current, { x: 8, duration: 0.05 })
        .to(hudRef.current, { x: -6, duration: 0.04 })
        .to(hudRef.current, { x: 6, duration: 0.04 })
        .to(hudRef.current, { x: 0, duration: 0.06, ease: "power2.out" });
    })();
  }, [lastGrade, contextSafe]);

  if (status === "setup" || status === "results") return null;

  // ── Derived values ───────────────────────────────────────
  const tier = getComboTier(stats.combo);
  const tc = tier.color;
  const sp = stats.starPower;
  const spPct = sp.active ? (sp.duration / sp.maxDuration) * 100 : sp.available;
  const canActivate = !sp.active && sp.available >= sp.activationThreshold;
  const accPct = stats.accuracy * 100;
  const accColor =
    accPct >= 90 ? "#34d399" : accPct >= 70 ? "#fbbf24" : "#ef4444";
  const mColor =
    comboMilestone !== null ? getComboTier(comboMilestone).color : "#fff";
  const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  return (
    <div
      ref={hudRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 100,
        userSelect: "none",
        contain: "layout paint style",
      }}
    >
      {/* ── Progress bar — scaleX is compositor-only ── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: "100%",
            background: "linear-gradient(90deg, #818cf8, #c084fc)",
            borderRadius: "0 2px 2px 0",
            transform: `scaleX(${Math.min(1, songProgress)})`,
            transformOrigin: "left",
            transition: "transform 0.25s linear",
          }}
        />
      </div>

      {/* ── Top-left: Combo cluster ── */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 18,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 3,
        }}
      >
        {/* Combo number — Motion spring re-fires on every change via key */}
        <motion.div
          key={stats.combo}
          initial={{ scale: 1.4, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 700,
            damping: 20,
            duration: 0.2,
          }}
          style={{
            fontSize: 52,
            fontWeight: 700,
            fontFamily: MONO,
            color: tc,
            lineHeight: 1,
          }}
        >
          {stats.combo}
        </motion.div>

        {/* Multiplier pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
            fontFamily: MONO,
            letterSpacing: "0.04em",
            color: tc,
            background: `${tc}1a`,
            border: `1.5px solid ${tc}`,
            borderRadius: 999,
            padding: "2px 10px",
          }}
        >
          ×{tier.mult}
        </div>

        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase" as const,
            fontFamily: MONO,
          }}
        >
          COMBO
        </div>
      </div>

      {/* ── Top-right: Score + accuracy + difficulty ── */}
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 18,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 3,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            fontFamily: MONO,
            color: "var(--text-primary, #f1f5f9)",
            letterSpacing: "0.04em",
            lineHeight: 1,
          }}
        >
          {stats.score.toLocaleString()}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: accColor,
            fontFamily: MONO,
          }}
        >
          {accPct.toFixed(1)}%
        </div>
        <div
          style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.25)",
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            fontFamily: MONO,
          }}
        >
          {diffLabel}
        </div>
        {shiftLabel && (
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.28)",
              letterSpacing: "0.08em",
              fontFamily: MONO,
            }}
          >
            {shiftLabel}
          </div>
        )}
      </div>

      {/* ── Center: Grade pop ── */}
      <AnimatePresence mode="popLayout">
        {lastGrade && (
          <motion.div
            key={`${lastGrade}-${gradeCntRef.current}`}
            initial={{ scale: 0, opacity: 0, y: 10 }}
            animate={{
              scale:
                lastGrade === "perfect_plus"
                  ? [1.8, 1]
                  : lastGrade === "perfect"
                    ? [1.5, 1]
                    : [1.2, 1],
              opacity: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              y: -40,
              scale: 0.7,
              transition: { duration: 0.25 },
            }}
            transition={{ type: "spring", stiffness: 800, damping: 22 }}
            style={{
              position: "absolute",
              top: "42%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              fontSize:
                lastGrade === "perfect_plus"
                  ? 72
                  : lastGrade === "perfect"
                    ? 64
                    : 54,
              fontWeight: 800,
              fontFamily: MONO,
              letterSpacing: "0.06em",
              color: "#fff",
              // Static stroke/glow — set once, never animated → compositor-safe
              WebkitTextStroke: `2px ${GRADE_CFG[lastGrade].color}`,
              filter: `drop-shadow(0 0 20px ${GRADE_CFG[lastGrade].color})`,
              whiteSpace: "nowrap",
              zIndex: 200,
            }}
          >
            {GRADE_CFG[lastGrade].label}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Countdown overlay ── */}
      <AnimatePresence>
        {status === "countdown" && (
          <motion.div
            key={countdown}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            style={{
              position: "absolute",
              top: "45%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: 120,
              fontWeight: 900,
              fontFamily: MONO,
              color: countdown <= 1 ? "#34d399" : "#fff",
              filter: `drop-shadow(0 0 30px ${countdown <= 1 ? "#34d399" : "#818cf8"})`,
              zIndex: 200,
              pointerEvents: "none",
            }}
          >
            {countdown === 0 ? "GO!" : countdown}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top-center: Combo milestone banner ── */}
      <AnimatePresence>
        {comboMilestone !== null && (
          <motion.div
            key={comboMilestone}
            initial={{ y: -40, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.3 } }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            style={{
              position: "absolute",
              top: 60,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.85)",
              border: `2px solid ${mColor}`,
              borderRadius: 8,
              padding: "6px 20px",
              fontSize: 18,
              fontWeight: 800,
              fontFamily: MONO,
              letterSpacing: "0.1em",
              color: mColor,
              filter: `drop-shadow(0 0 12px ${mColor})`,
              whiteSpace: "nowrap",
              zIndex: 150,
              pointerEvents: "none",
            }}
          >
            ×{getComboTier(comboMilestone).mult} MULTIPLIER!
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom-center: Star Power / Piano Fury bar ── */}
      <div
        style={{
          position: "absolute",
          bottom: 18,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 7,
        }}
      >
        {/* Bar shell — pulsing glow via filter, never box-shadow */}
        <motion.div
          animate={{
            filter: sp.active
              ? [
                  "drop-shadow(0 0 6px #22c55e)",
                  "drop-shadow(0 0 20px #22c55e)",
                  "drop-shadow(0 0 6px #22c55e)",
                ]
              : "drop-shadow(0 0 6px #fbbf2440)",
          }}
          transition={
            sp.active
              ? { repeat: Infinity, duration: 1.1, ease: "easeInOut" }
              : { duration: 0.3 }
          }
          style={{
            position: "relative",
            width: 320,
            height: 44,
            background: "rgba(0,0,0,0.72)",
            borderRadius: 22,
            border: `1.5px solid ${sp.active ? "#22c55e" : "rgba(255,255,255,0.1)"}`,
            overflow: "hidden",
          }}
        >
          {/* Fill via scaleX — compositor-only, no width in keyframes */}
          <motion.div
            animate={{ scaleX: Math.min(1, spPct / 100) }}
            transition={{ duration: 0.25, ease: "linear" }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "100%",
              background: sp.active
                ? "linear-gradient(90deg, #15803d, #22c55e, #4ade80)"
                : "linear-gradient(90deg, #78350f, #b45309, #fbbf24)",
              borderRadius: 22,
              transformOrigin: "left",
            }}
          />

          {/* Star pips at 10 / 30 / 50 / 70 / 90% */}
          {([0.1, 0.3, 0.5, 0.7, 0.9] as const).map((pos, i) => {
            const lit = Math.min(100, spPct) >= pos * 100;
            const pc = sp.active ? "#4ade80" : "#fbbf24";
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${pos * 100}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  fontSize: 11,
                  lineHeight: 1,
                  color: lit ? pc : "rgba(255,255,255,0.15)",
                  filter: lit ? `drop-shadow(0 0 4px ${pc})` : undefined,
                  zIndex: 3,
                  pointerEvents: "none",
                }}
              >
                ★
              </div>
            );
          })}

          {/* Label */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.16em",
              fontFamily: MONO,
              color: sp.active ? "#fff" : "rgba(255,255,255,0.6)",
              zIndex: 4,
              pointerEvents: "none",
            }}
          >
            {sp.active
              ? `✦ PIANO FURY! ${Math.ceil(sp.duration)}s ✦`
              : `PIANO FURY  ${Math.round(spPct)}%`}
          </div>
        </motion.div>

        {/* Activate button — pointer-events intentionally on */}
        <button
          onClick={onActivateStarPower}
          disabled={!canActivate}
          style={{
            pointerEvents: "auto",
            padding: "5px 26px",
            borderRadius: 999,
            border: `1.5px solid ${canActivate ? "#fbbf24" : "rgba(255,255,255,0.1)"}`,
            background: canActivate
              ? "linear-gradient(135deg, #92400e, #d97706)"
              : "rgba(255,255,255,0.04)",
            color: canActivate ? "#fef3c7" : "rgba(255,255,255,0.2)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            fontFamily: MONO,
            cursor: canActivate ? "pointer" : "not-allowed",
            filter: canActivate ? "drop-shadow(0 0 10px #fbbf2470)" : undefined,
            transition: "all 0.2s ease",
          }}
        >
          ACTIVATE
        </button>
      </div>
    </div>
  );
}

// Made with Bob
