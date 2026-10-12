// ============================================================
// GenreNav - horizontal pill navigation for song genres.
// Active pill animates with motion's shared layout (layoutId) so the
// background slides between selections. Falls back to a flat solid
// background when the user prefers reduced motion.
// ============================================================

import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Genre } from "../../types/song";

export interface GenreNavProps {
  genres: {
    id: Genre;
    label: string;
    emoji: string;
    color: string;
    colorAlt: string;
    count: number;
  }[];
  active: Genre | "all";
  totalCount: number;
  onChange: (g: Genre | "all") => void;
}

type PillStyle = CSSProperties & {
  "--genre-c"?: string;
  "--genre-c-alt"?: string;
};

export function GenreNav({
  genres,
  active,
  totalCount,
  onChange,
}: GenreNavProps) {
  const reduceMotion = useReducedMotion();

  const renderPill = (
    id: Genre | "all",
    label: string,
    emoji: string,
    count: number,
    color: string,
    colorAlt: string,
  ) => {
    const isActive = active === id;
    const style: PillStyle = {
      "--genre-c": color,
      "--genre-c-alt": colorAlt,
    };
    return (
      <button
        key={id}
        type="button"
        className={`lib-genre-pill ${isActive ? "is-active" : ""}`}
        style={style}
        aria-pressed={isActive}
        onClick={() => onChange(id)}
      >
        {isActive && (
          <motion.span
            layoutId="genreNavActiveBg"
            className="lib-genre-pill__bg"
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 380, damping: 32 }
            }
          />
        )}
        <span className="lib-genre-pill__content">
          <span className="lib-genre-pill__emoji" aria-hidden="true">
            {emoji}
          </span>
          <span className="lib-genre-pill__label">{label}</span>
          <span className="lib-genre-pill__count">({count})</span>
        </span>
      </button>
    );
  };

  return (
    <div
      className="lib-genre-nav"
      role="tablist"
      aria-label="Filtrar por género"
    >
      {renderPill(
        "all",
        "Todos",
        "✨",
        totalCount,
        "var(--accent-primary)",
        "var(--accent-secondary)",
      )}
      {genres.map((g) =>
        renderPill(g.id, g.label, g.emoji, g.count, g.color, g.colorAlt),
      )}
    </div>
  );
}
