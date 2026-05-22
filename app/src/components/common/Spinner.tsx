import { useEffect } from "react";
import type { CSSProperties, ReactElement } from "react";

// ── Style injection ────────────────────────────────────────
const SPINNER_STYLE_ID = "common-spinner-keyframes";
const SPINNER_KEYFRAMES = `
@keyframes common-spinner-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

function injectSpinnerStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(SPINNER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SPINNER_STYLE_ID;
  style.textContent = SPINNER_KEYFRAMES;
  document.head.appendChild(style);
}

// ── Sizing ─────────────────────────────────────────────────
const SIZE_PX: Record<"sm" | "md" | "lg", number> = {
  sm: 14,
  md: 20,
  lg: 32,
};

// ── Props ──────────────────────────────────────────────────
export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  color?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

// ── Component ──────────────────────────────────────────────
export function Spinner({
  size = "md",
  color = "#8b5cf6",
  className,
  style,
  "aria-label": ariaLabel = "Loading",
}: SpinnerProps): ReactElement {
  useEffect(() => {
    injectSpinnerStyles();
  }, []);

  const px = SIZE_PX[size];
  const border = Math.max(2, Math.round(px / 8));

  const rootStyle: CSSProperties = {
    display: "inline-block",
    width: px,
    height: px,
    borderRadius: "50%",
    border: `${border}px solid rgba(255, 255, 255, 0.15)`,
    borderTopColor: color,
    animation: "common-spinner-rotate 0.8s linear infinite",
    boxSizing: "border-box",
    ...style,
  };

  return (
    <span
      className={className}
      style={rootStyle}
      role="status"
      aria-label={ariaLabel}
    />
  );
}
