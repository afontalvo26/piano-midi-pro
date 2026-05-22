import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
} from "react";

// ── Types ──────────────────────────────────────────────────
export type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  size?: ModalSize;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  style?: CSSProperties;
}

// ── Sizing ─────────────────────────────────────────────────
const SIZE_WIDTH: Record<ModalSize, number> = {
  sm: 360,
  md: 520,
  lg: 720,
  xl: 960,
};

// ── Component ──────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  closeOnBackdropClick = true,
  closeOnEscape = true,
  className,
  style,
}: ModalProps): ReactElement | null {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // Mount / unmount with fade transition
  useEffect(() => {
    if (open) {
      setMounted(true);
      // next tick → trigger fade-in
      const id = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(t);
  }, [open]);

  // Focus the close button when opened
  useEffect(() => {
    if (open && mounted) {
      const t = window.setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 10);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open, mounted]);

  // Escape key
  useEffect(() => {
    if (!open || closeOnEscape === false) return undefined;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closeOnEscape, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Simple focus trap on Tab key
  const onKeyDownTrap = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const list = Array.from(focusable).filter(
      (el) => !el.hasAttribute("disabled")
    );
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  const onBackdropClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (closeOnBackdropClick === false) return;
      onClose();
    },
    [closeOnBackdropClick, onClose]
  );

  if (!mounted) return null;

  const backdropStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(8, 8, 14, 0.65)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9000,
    opacity: visible ? 1 : 0,
    transition: "opacity 200ms ease",
    padding: 16,
  };

  const dialogStyle: CSSProperties = {
    width: "100%",
    maxWidth: SIZE_WIDTH[size],
    maxHeight: "calc(100vh - 32px)",
    display: "flex",
    flexDirection: "column",
    background:
      "linear-gradient(180deg, rgba(24, 24, 36, 0.92) 0%, rgba(15, 15, 23, 0.92) 100%)",
    color: "#e5e7eb",
    borderRadius: 14,
    border: "1px solid rgba(139, 92, 246, 0.25)",
    boxShadow:
      "0 20px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.04) inset",
    transform: visible ? "translateY(0) scale(1)" : "translateY(8px) scale(0.98)",
    transition: "transform 200ms ease, opacity 200ms ease",
    opacity: visible ? 1 : 0,
    overflow: "hidden",
    ...style,
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
  };

  const titleStyle: CSSProperties = {
    fontSize: 16,
    fontWeight: 700,
    margin: 0,
    color: "#f5f3ff",
  };

  const bodyStyle: CSSProperties = {
    padding: 16,
    overflowY: "auto",
  };

  const closeBtnStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    color: "#e5e7eb",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
    padding: 0,
  };

  return (
    <div
      style={backdropStyle}
      onClick={onBackdropClick}
      aria-hidden={!open}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={className}
        style={dialogStyle}
        onKeyDown={onKeyDownTrap}
      >
        {title !== undefined ? (
          <header style={headerStyle}>
            <h2 style={titleStyle}>{title}</h2>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              style={closeBtnStyle}
            >
              ×
            </button>
          </header>
        ) : (
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              ...closeBtnStyle,
              position: "absolute",
              top: 10,
              right: 10,
              zIndex: 1,
            }}
          >
            ×
          </button>
        )}
        <div style={bodyStyle}>{children}</div>
      </div>
    </div>
  );
}
