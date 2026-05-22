import { useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { EnhancedGameStats } from "../../game/engine";

interface GameResultsModalProps {
  stats: EnhancedGameStats;
  stars: number; // 0-5
  xpEarned: number;
  levelUp: { oldLevel: number; newLevel: number } | null;
  newRecord: boolean;
  previousBest: number;
  songTitle: string;
  difficulty: string;
  onRetry: () => void;
  onMenu: () => void;
}

// ── Grade config ───────────────────────────────────────────
const GRADE_CONFIG = [
  { min: 0.95, letter: "S", color: "#ffd700" },
  { min: 0.9, letter: "A", color: "#34d399" },
  { min: 0.8, letter: "B", color: "#60a5fa" },
  { min: 0.7, letter: "C", color: "#fbbf24" },
  { min: 0, letter: "F", color: "#ef4444" },
] as const;

function getGrade(accuracy: number) {
  return (
    GRADE_CONFIG.find((g) => accuracy >= g.min) ??
    GRADE_CONFIG[GRADE_CONFIG.length - 1]
  );
}

// ── Difficulty config ──────────────────────────────────────
const DIFF_COLORS: Record<string, string> = {
  easy: "#34d399",
  normal: "#fbbf24",
  hard: "#fb923c",
  expert: "#ef4444",
};

const DIFF_LABELS: Record<string, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
  expert: "Expert",
};

// ── Component ──────────────────────────────────────────────
export function GameResultsModal({
  stats,
  stars,
  xpEarned,
  levelUp,
  newRecord,
  previousBest,
  songTitle,
  difficulty,
  onRetry,
  onMenu,
}: GameResultsModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const gradeRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<HTMLDivElement[]>([]);
  const scoreNumRef = useRef<HTMLDivElement>(null);
  const xpRef = useRef<HTMLDivElement>(null);
  const scoreCounterObj = useRef({ val: 0 });

  const grade = getGrade(stats.accuracy);
  const diffKey = difficulty.toLowerCase();
  const diffColor = DIFF_COLORS[diffKey] ?? "#94a3b8";
  const diffLabel = DIFF_LABELS[diffKey] ?? difficulty;

  const totalJudged = stats.hits + stats.misses;

  const segments = [
    { key: "pp", label: "P+", color: "#a78bfa", count: stats.perfectPlus },
    { key: "perf", label: "PERF", color: "#60a5fa", count: stats.perfect },
    { key: "gr", label: "GREAT", color: "#34d399", count: stats.great },
    { key: "gd", label: "GOOD", color: "#fbbf24", count: stats.good },
    { key: "ms", label: "MISS", color: "#ef4444", count: stats.misses },
  ].filter((s) => s.count > 0);

  const statsRows = [
    {
      label: "Accuracy",
      value: `${(stats.accuracy * 100).toFixed(1)}%`,
      color: grade.color,
    },
    { label: "Max Combo", value: `×${stats.maxCombo}`, color: undefined },
    { label: "Perfect+", value: String(stats.perfectPlus), color: "#a78bfa" },
    { label: "Perfect", value: String(stats.perfect), color: "#60a5fa" },
    { label: "Great", value: String(stats.great), color: "#34d399" },
    { label: "Good", value: String(stats.good), color: "#fbbf24" },
    { label: "Miss", value: String(stats.misses), color: "#ef4444" },
    {
      label: "Notes Hit",
      value: `${stats.hits} / ${stats.totalTargets}`,
      color: undefined,
    },
  ];

  // ── GSAP timeline ──────────────────────────────────────────
  useGSAP(
    () => {
      const tl = gsap.timeline({ delay: 0.4 });

      // Grade letter: elastic pop
      tl.fromTo(
        gradeRef.current,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: "elastic.out(1.2, 0.5)" },
      );

      // Stars: staggered back-out pop
      tl.fromTo(
        starsRef.current.filter(Boolean),
        { scale: 0, opacity: 0, rotation: -30 },
        {
          scale: 1,
          opacity: 1,
          rotation: 0,
          duration: 0.35,
          stagger: 0.12,
          ease: "back.out(2.5)",
        },
        "-=0.2",
      );

      // Score counter: GSAP tween on a plain object — zero DOM reads during update
      scoreCounterObj.current.val = 0;
      tl.to(
        scoreCounterObj.current,
        {
          val: stats.score,
          duration: 1.5,
          ease: "power2.out",
          onUpdate: () => {
            if (scoreNumRef.current) {
              scoreNumRef.current.textContent = Math.round(
                scoreCounterObj.current.val,
              ).toLocaleString();
            }
          },
        },
        "-=0.3",
      );

      // XP: slide in
      if (xpRef.current) {
        tl.fromTo(
          xpRef.current,
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" },
          "-=0.8",
        );
      }
    },
    { scope: cardRef, dependencies: [stats.score, stars] },
  );

  // ── Render ─────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        overflowY: "auto",
        contain: "layout paint style",
      }}
    >
      <motion.div
        ref={cardRef}
        initial={{ y: 60, scale: 0.95, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.1 }}
        style={{
          width: "100%",
          maxWidth: 680,
          background:
            "linear-gradient(160deg, rgba(18,18,32,0.98), rgba(10,10,22,0.99))",
          borderRadius: 20,
          border: "1px solid rgba(139,92,246,0.2)",
          padding: "32px 28px 28px",
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          position: "relative",
          contain: "layout paint style",
        }}
      >
        {/* Accent line — grade-colored, compositor-only */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "10%",
            right: "10%",
            height: 2,
            background: `linear-gradient(90deg, transparent, ${grade.color}, transparent)`,
            borderRadius: "0 0 4px 4px",
          }}
        />

        {/* ① Song title + difficulty badge */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            marginTop: 4,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "rgba(255,255,255,0.86)",
              textAlign: "center",
              maxWidth: 430,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {songTitle}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: diffColor,
              background: `${diffColor}18`,
              border: `1px solid ${diffColor}50`,
              borderRadius: 6,
              padding: "2px 10px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {diffLabel}
          </div>
        </div>

        {/* ② Grade letter — GSAP elastic pop */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            ref={gradeRef}
            style={{
              fontSize: 100,
              fontWeight: 900,
              fontFamily: "system-ui, sans-serif",
              color: grade.color,
              // drop-shadow instead of text-shadow: compositor-safe when not animated
              filter: `drop-shadow(0 0 28px ${grade.color}) drop-shadow(0 0 60px ${grade.color}50)`,
              lineHeight: 1,
              opacity: 0, // GSAP takes over
            }}
          >
            {grade.letter}
          </div>
        </div>

        {/* ③ Stars — GSAP stagger pop, callback ref pattern */}
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              ref={(el) => {
                if (el) starsRef.current[i - 1] = el;
              }}
              style={{
                fontSize: 36,
                lineHeight: 1,
                opacity: 0, // GSAP sets opacity
                color: i <= stars ? "#fbbf24" : "rgba(255,255,255,0.13)",
              }}
            >
              {i <= stars ? "★" : "☆"}
            </div>
          ))}
        </div>

        {/* ④ Score counter — GSAP counter on plain object */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(255,255,255,0.38)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            SCORE
          </div>
          <div
            ref={scoreNumRef}
            style={{
              fontSize: 58,
              fontWeight: 900,
              fontFamily: "system-ui, monospace, sans-serif",
              color: "#ffffff",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            0
          </div>
          {previousBest > 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
              Best: {previousBest.toLocaleString()}
            </div>
          )}
        </div>

        {/* ⑤ NEW RECORD — pulsing scale loop, no keyframes */}
        {newRecord && (
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
            style={{
              alignSelf: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "#ffd700",
              background: "rgba(255,215,0,0.1)",
              border: "1px solid rgba(255,215,0,0.4)",
              borderRadius: 8,
              padding: "5px 18px",
              letterSpacing: "0.1em",
              marginTop: -8,
            }}
          >
            🏆 NEW RECORD!
          </motion.div>
        )}

        {/* ⑥ Stats grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {statsRows.map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.42)",
                  letterSpacing: "0.05em",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: color ?? "rgba(255,255,255,0.88)",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* ⑦ Hit quality bar — scaleX segments, compositor-only */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(255,255,255,0.38)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            HIT QUALITY
          </div>
          <div
            style={{
              display: "flex",
              height: 14,
              borderRadius: 7,
              overflow: "hidden",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            {segments.map((seg) => (
              <motion.div
                key={seg.key}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: 0.9, ease: "easeOut" }}
                style={{
                  flex: seg.count,
                  background: seg.color,
                  opacity: 0.88,
                  transformOrigin: "left",
                }}
              />
            ))}
          </div>
          {/* Segment legend */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {segments.map((seg) => {
              const pct =
                totalJudged > 0
                  ? ((seg.count / totalJudged) * 100).toFixed(0)
                  : "0";
              return (
                <div
                  key={seg.key}
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: seg.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{ fontSize: 11, color: "rgba(255,255,255,0.46)" }}
                  >
                    {seg.label} {seg.count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ⑧ XP earned — GSAP slide in */}
        <div
          ref={xpRef}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            opacity: 0, // GSAP controls
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "#ffd700",
              filter: "drop-shadow(0 0 10px #ffd70088)",
              letterSpacing: "0.04em",
            }}
          >
            +{xpEarned.toLocaleString()} XP
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.36)" }}>
            experience earned
          </div>
        </div>

        {/* ⑨ Level-up badge — AnimatePresence spring burst */}
        <AnimatePresence>
          {levelUp && (
            <motion.div
              key="levelup"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 320,
                damping: 22,
                delay: 1.8,
              }}
              style={{
                alignSelf: "center",
                padding: "10px 28px",
                background:
                  "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(236,72,153,0.13))",
                border: "1px solid rgba(139,92,246,0.45)",
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.46)",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                LEVEL UP
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#e879f9",
                  filter: "drop-shadow(0 0 8px #e879f980)",
                }}
              >
                {levelUp.oldLevel} → {levelUp.newLevel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ⑩ Action buttons */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 4,
          }}
        >
          <button
            className="btn primary"
            onClick={onRetry}
            style={{
              justifyContent: "center",
              padding: "12px 0",
              fontSize: "0.95rem",
            }}
          >
            ↺ RETRY
          </button>
          <button
            className="btn"
            onClick={onMenu}
            style={{
              justifyContent: "center",
              padding: "10px 0",
              fontSize: "0.9rem",
            }}
          >
            ← Back to Menu
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Made with Bob
