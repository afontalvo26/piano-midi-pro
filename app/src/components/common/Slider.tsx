import { useEffect, useId } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";

// ── Types ──────────────────────────────────────────────────
export interface SliderProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  vertical?: boolean;
  showValue?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

// ── Style injection ────────────────────────────────────────
const STYLE_ID = "common-slider-style";
const STYLE_CSS = `
.common-slider-input {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  background: transparent;
  outline: none;
  padding: 0;
  margin: 0;
  height: 24px;
}
.common-slider-input::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    #8b5cf6 var(--common-slider-fill, 0%),
    rgba(255, 255, 255, 0.10) var(--common-slider-fill, 0%)
  );
}
.common-slider-input::-moz-range-track {
  height: 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.10);
}
.common-slider-input::-moz-range-progress {
  height: 4px;
  border-radius: 4px;
  background: #8b5cf6;
}
.common-slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -6px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #8b5cf6;
  box-shadow: 0 0 0 4px rgba(139, 92, 246, 0);
  transition: box-shadow 160ms ease, transform 80ms ease;
  cursor: pointer;
}
.common-slider-input::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #8b5cf6;
  cursor: pointer;
  transition: box-shadow 160ms ease;
}
.common-slider-input:hover:not(:disabled)::-webkit-slider-thumb {
  box-shadow: 0 0 0 6px rgba(139, 92, 246, 0.18);
}
.common-slider-input:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 6px rgba(167, 139, 250, 0.35);
}
.common-slider-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.common-slider-input:disabled::-webkit-slider-thumb {
  cursor: not-allowed;
}
`;

function injectStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLE_CSS;
  document.head.appendChild(el);
}

// ── Component ──────────────────────────────────────────────
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  vertical = false,
  showValue = true,
  className,
  style,
  "aria-label": ariaLabel,
}: SliderProps): ReactElement {
  const id = useId();

  useEffect(() => {
    injectStyles();
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (Number.isFinite(next)) onChange(next);
  };

  const safeRange = Math.max(1e-9, max - min);
  const fillPct = Math.max(0, Math.min(100, ((value - min) / safeRange) * 100));

  const wrapperStyle: CSSProperties = {
    display: "flex",
    flexDirection: vertical ? "row" : "column",
    alignItems: vertical ? "center" : "stretch",
    gap: 6,
    color: "#e5e7eb",
    fontSize: 12,
    fontFamily: "inherit",
    width: vertical ? "auto" : "100%",
    ...style,
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    color: "rgba(229, 231, 235, 0.85)",
    fontWeight: 500,
  };

  const valueStyle: CSSProperties = {
    fontVariantNumeric: "tabular-nums",
    color: "#a78bfa",
    fontWeight: 600,
  };

  const verticalTrackStyle: CSSProperties = vertical
    ? {
        transform: "rotate(-90deg)",
        transformOrigin: "center",
        width: 140,
      }
    : { width: "100%" };

  const inputStyleVars = {
    ["--common-slider-fill" as keyof CSSProperties]: `${fillPct}%`,
  } as CSSProperties;

  const inputStyle: CSSProperties = {
    ...verticalTrackStyle,
    ...inputStyleVars,
  };

  const valueText =
    showValue && unit
      ? `${value}${unit}`
      : showValue
      ? String(value)
      : "";

  return (
    <div className={className} style={wrapperStyle}>
      {!vertical && (label !== undefined || showValue) ? (
        <div style={headerStyle}>
          {label !== undefined ? (
            <label htmlFor={id}>{label}</label>
          ) : (
            <span />
          )}
          {showValue ? <span style={valueStyle}>{valueText}</span> : null}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: vertical ? 160 : 24,
          width: vertical ? 24 : "100%",
        }}
      >
        <input
          id={id}
          type="range"
          className="common-slider-input"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          onChange={handleChange}
          style={inputStyle}
        />
      </div>
      {vertical && showValue ? (
        <span style={valueStyle}>{valueText}</span>
      ) : null}
    </div>
  );
}
