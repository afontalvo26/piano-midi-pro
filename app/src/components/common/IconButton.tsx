import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent, ReactElement, ReactNode } from "react";

// ── Types ──────────────────────────────────────────────────
export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonVariant = "ghost" | "solid";

export interface IconButtonProps {
  icon: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  "aria-label": string;
  disabled?: boolean;
  tooltip?: string;
  className?: string;
  style?: CSSProperties;
  type?: "button" | "submit";
}

// ── Sizing ─────────────────────────────────────────────────
const SIZE_PX: Record<IconButtonSize, number> = {
  sm: 28,
  md: 36,
  lg: 44,
};

const ICON_SCALE: Record<IconButtonSize, number> = {
  sm: 14,
  md: 18,
  lg: 22,
};

// ── Variant style ──────────────────────────────────────────
interface VariantStyle {
  background: string;
  hoverBackground: string;
  color: string;
  border: string;
  hoverBorder: string;
}

const VARIANTS: Record<IconButtonVariant, VariantStyle> = {
  ghost: {
    background: "transparent",
    hoverBackground: "rgba(255, 255, 255, 0.08)",
    color: "#e5e7eb",
    border: "1px solid transparent",
    hoverBorder: "1px solid rgba(255, 255, 255, 0.10)",
  },
  solid: {
    background: "rgba(139, 92, 246, 0.18)",
    hoverBackground: "rgba(139, 92, 246, 0.30)",
    color: "#ffffff",
    border: "1px solid rgba(139, 92, 246, 0.45)",
    hoverBorder: "1px solid rgba(167, 139, 250, 0.7)",
  },
};

// ── Focus style injection ──────────────────────────────────
const FOCUS_STYLE_ID = "common-icon-button-focus-style";
const FOCUS_CSS = `
.common-icon-btn:focus-visible {
  outline: 2px solid #a78bfa;
  outline-offset: 2px;
}
`;

function injectFocusStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(FOCUS_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = FOCUS_STYLE_ID;
  el.textContent = FOCUS_CSS;
  document.head.appendChild(el);
}

// ── Component ──────────────────────────────────────────────
export function IconButton({
  icon,
  onClick,
  size = "md",
  variant = "ghost",
  "aria-label": ariaLabel,
  disabled = false,
  tooltip,
  className,
  style,
  type = "button",
}: IconButtonProps): ReactElement {
  const [hover, setHover] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    injectFocusStyle();
  }, []);

  const px = SIZE_PX[size];
  const v = VARIANTS[variant];

  const rootStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: px,
    height: px,
    borderRadius: 8,
    background: hover && !disabled ? v.hoverBackground : v.background,
    border: hover && !disabled ? v.hoverBorder : v.border,
    color: v.color,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    padding: 0,
    transition: "background 160ms ease, border 160ms ease, color 160ms ease",
    fontSize: ICON_SCALE[size],
    lineHeight: 1,
    flexShrink: 0,
    position: "relative",
    ...style,
  };

  const iconStyle: CSSProperties = {
    width: ICON_SCALE[size],
    height: ICON_SCALE[size],
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  };

  const tooltipStyle: CSSProperties = {
    position: "absolute",
    bottom: "calc(100% + 6px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#0f0f17",
    color: "#e5e7eb",
    fontSize: 11,
    fontWeight: 500,
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid rgba(255, 255, 255, 0.10)",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.45)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    opacity: showTip ? 1 : 0,
    transition: "opacity 120ms ease",
    zIndex: 1000,
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={tooltip}
      className={["common-icon-btn", className].filter(Boolean).join(" ")}
      style={rootStyle}
      onMouseEnter={() => {
        setHover(true);
        if (tooltip) setShowTip(true);
      }}
      onMouseLeave={() => {
        setHover(false);
        setShowTip(false);
      }}
      onFocus={() => {
        if (tooltip) setShowTip(true);
      }}
      onBlur={() => setShowTip(false)}
    >
      <span style={iconStyle} aria-hidden>
        {icon}
      </span>
      {tooltip ? (
        <span role="tooltip" style={tooltipStyle}>
          {tooltip}
        </span>
      ) : null}
    </button>
  );
}
