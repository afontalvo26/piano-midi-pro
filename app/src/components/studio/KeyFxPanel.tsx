/* eslint-disable react-refresh/only-export-components */
// ============================================================
// KeyFxPanel — Compact Key Press FX Theme Picker
// Presets + custom color + glow slider. Zero UI noise.
// ============================================================
import { useRef } from "react";

export type KeyFxThemeId =
  | "neon-violet"
  | "neon-cyan"
  | "neon-lime"
  | "ember"
  | "ice"
  | "rose"
  | "gold"
  | "custom";

export interface KeyFxPreset {
  id: KeyFxThemeId;
  name: string;
  color: string;
  glow: number;
}

export const KEY_FX_PRESETS: KeyFxPreset[] = [
  { id: "neon-violet", name: "Violeta", color: "#8b5cf6", glow: 0.9 },
  { id: "neon-cyan",   name: "Cian",    color: "#06b6d4", glow: 0.85 },
  { id: "neon-lime",   name: "Lima",    color: "#84cc16", glow: 0.85 },
  { id: "ember",       name: "Fuego",   color: "#f97316", glow: 0.92 },
  { id: "ice",         name: "Hielo",   color: "#bae6fd", glow: 0.75 },
  { id: "rose",        name: "Rosa",    color: "#f43f5e", glow: 0.9  },
  { id: "gold",        name: "Oro",     color: "#fbbf24", glow: 0.88 },
];

interface Props {
  themeId: KeyFxThemeId;
  color: string;
  glow: number;
  intensity: number;
  onTheme: (id: KeyFxThemeId, color: string, glow: number) => void;
  onColor: (hex: string) => void;
  onGlow: (v: number) => void;
  onIntensity: (v: number) => void;
}

export function KeyFxPanel({
  themeId, color, glow, intensity,
  onTheme, onColor, onGlow, onIntensity,
}: Props) {
  const colorInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="keyfx-panel">
      <div className="keyfx-header">
        <span className="keyfx-icon">✦</span>
        <span className="keyfx-title">Key FX</span>
      </div>

      {/* Preset swatches */}
      <div className="keyfx-swatches">
        {KEY_FX_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`keyfx-swatch ${themeId === p.id ? "keyfx-swatch--active" : ""}`}
            style={{
              background: p.color,
              boxShadow: themeId === p.id
                ? `0 0 0 2px #fff, 0 0 0 4px ${p.color}, 0 0 12px ${p.color}`
                : `0 0 8px ${p.color}44`,
            }}
            title={p.name}
            aria-label={`Tema de color ${p.name}`}
            aria-pressed={themeId === p.id}
            onClick={() => onTheme(p.id, p.color, p.glow)}
          />
        ))}

        {/* Custom color swatch */}
        <button
          className={`keyfx-swatch keyfx-swatch--custom ${themeId === "custom" ? "keyfx-swatch--active" : ""}`}
          title="Color personalizado"
          aria-label="Elegir color personalizado"
          aria-pressed={themeId === "custom"}
          style={{
            background: themeId === "custom"
              ? color
              : "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)",
            boxShadow: themeId === "custom"
              ? `0 0 0 2px #fff, 0 0 0 4px ${color}, 0 0 12px ${color}`
              : "none",
          }}
          onClick={() => colorInputRef.current?.click()}
        >
          {themeId !== "custom" && (
            <span style={{ fontSize: "10px", lineHeight: 1, color: "#fff", textShadow: "0 0 3px #000" }}>
              +
            </span>
          )}
          <input
            ref={colorInputRef}
            type="color"
            aria-label="Selector de color personalizado"
            value={color}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
            onChange={(e) => {
              onColor(e.target.value);
              onTheme("custom", e.target.value, glow);
            }}
          />
        </button>
      </div>

      {/* Glow slider */}
      <div className="keyfx-row">
        <span className="keyfx-label">Brillo</span>
        <div className="keyfx-slider-wrap">
          <input
            type="range" min={0} max={1} step={0.05}
            value={glow}
            className="slider-custom keyfx-slider"
            aria-label="Brillo del efecto Key FX"
            style={{ "--slider-color": color } as React.CSSProperties}
            onChange={(e) => onGlow(Number(e.target.value))}
          />
          <span className="keyfx-val">{Math.round(glow * 100)}%</span>
        </div>
      </div>

      {/* Intensity slider */}
      <div className="keyfx-row">
        <span className="keyfx-label">Intensidad</span>
        <div className="keyfx-slider-wrap">
          <input
            type="range" min={0} max={1} step={0.05}
            value={intensity}
            className="slider-custom keyfx-slider"
            aria-label="Intensidad del efecto Key FX"
            style={{ "--slider-color": color } as React.CSSProperties}
            onChange={(e) => onIntensity(Number(e.target.value))}
          />
          <span className="keyfx-val">{Math.round(intensity * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
