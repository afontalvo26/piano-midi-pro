import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent, ReactElement, ReactNode } from "react";
import { Spinner } from "./Spinner";

// ── Types ──────────────────────────────────────────────────
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
  type?: "button" | "submit";
  className?: string;
  "aria-label"?: string;
  style?: CSSProperties;
}

// ── Variant style maps ─────────────────────────────────────
interface VariantStyle {
  background: string;
  color: string;
  border: string;
  hoverBackground: string;
  hoverBorder: string;
  shadow: string;
  hoverShadow: string;
}

const VARIANT_STYLES: Record<ButtonVariant, VariantStyle> = {
  primary: {
    background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    color: "#ffffff",
    border: "1px solid rgba(139, 92, 246, 0.6)",
    hoverBackground: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
    hoverBorder: "1px solid rgba(167, 139, 250, 0.9)",
    shadow: "0 4px 16px rgba(139, 92, 246, 0.35)",
    hoverShadow: "0 6px 24px rgba(139, 92, 246, 0.55)",
  },
  secondary: {
    background: "rgba(255, 255, 255, 0.06)",
    color: "#e5e7eb",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    hoverBackground: "rgba(255, 255, 255, 0.10)",
    hoverBorder: "1px solid rgba(255, 255, 255, 0.22)",
    shadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
    hoverShadow: "0 4px 14px rgba(0, 0, 0, 0.35)",
  },
  ghost: {
    background: "transparent",
    color: "#e5e7eb",
    border: "1px solid transparent",
    hoverBackground: "rgba(255, 255, 255, 0.06)",
    hoverBorder: "1px solid rgba(255, 255, 255, 0.10)",
    shadow: "none",
    hoverShadow: "none",
  },
  danger: {
    background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
    color: "#ffffff",
    border: "1px solid rgba(239, 68, 68, 0.6)",
    hoverBackground: "linear-gradient(135deg, #f87171 0%, #dc2626 100%)",
    hoverBorder: "1px solid rgba(248, 113, 113, 0.9)",
    shadow: "0 4px 16px rgba(239, 68, 68, 0.35)",
    hoverShadow: "0 6px 24px rgba(239, 68, 68, 0.55)",
  },
};

interface SizeStyle {
  padding: string;
  fontSize: number;
  height: number;
  gap: number;
  borderRadius: number;
}

const SIZE_STYLES: Record<ButtonSize, SizeStyle> = {
  sm: { padding: "0 10px", fontSize: 12, height: 28, gap: 6, borderRadius: 6 },
  md: { padding: "0 14px", fontSize: 14, height: 36, gap: 8, borderRadius: 8 },
  lg: { padding: "0 20px", fontSize: 16, height: 44, gap: 10, borderRadius: 10 },
};

// ── Focus-visible helper ───────────────────────────────────
const FOCUS_STYLE_ID = "common-button-focus-style";
const FOCUS_CSS = `
.common-btn:focus-visible {
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
export function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  icon,
  iconPosition = "left",
  fullWidth = false,
  onClick,
  children,
  type = "button",
  className,
  "aria-label": ariaLabel,
  style,
}: ButtonProps): ReactElement {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    injectFocusStyle();
  }, []);

  const isDisabled = disabled || loading;
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];

  const rootStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: s.gap,
    padding: s.padding,
    height: s.height,
    fontSize: s.fontSize,
    fontWeight: 600,
    fontFamily: "inherit",
    lineHeight: 1,
    width: fullWidth ? "100%" : undefined,
    color: v.color,
    background: hover && !isDisabled ? v.hoverBackground : v.background,
    border: hover && !isDisabled ? v.hoverBorder : v.border,
    borderRadius: s.borderRadius,
    boxShadow: hover && !isDisabled ? v.hoverShadow : v.shadow,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.55 : 1,
    transform: pressed && !isDisabled ? "translateY(1px)" : "translateY(0)",
    transition:
      "background 160ms ease, border 160ms ease, box-shadow 160ms ease, transform 80ms ease, opacity 160ms ease",
    userSelect: "none",
    whiteSpace: "nowrap",
    ...style,
  };

  const spinnerSize: "sm" | "md" = size === "lg" ? "md" : "sm";
  const spinnerColor =
    variant === "secondary" || variant === "ghost" ? "#e5e7eb" : "#ffffff";

  const showLeftIcon = !loading && icon && iconPosition === "left";
  const showRightIcon = !loading && icon && iconPosition === "right";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={["common-btn", className].filter(Boolean).join(" ")}
      style={rootStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onBlur={() => setPressed(false)}
    >
      {loading ? <Spinner size={spinnerSize} color={spinnerColor} /> : null}
      {showLeftIcon ? (
        <span style={{ display: "inline-flex" }} aria-hidden>
          {icon}
        </span>
      ) : null}
      {children !== undefined && children !== null ? (
        <span>{children}</span>
      ) : null}
      {showRightIcon ? (
        <span style={{ display: "inline-flex" }} aria-hidden>
          {icon}
        </span>
      ) : null}
    </button>
  );
}
