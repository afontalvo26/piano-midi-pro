/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactElement } from "react";

// ── Types ──────────────────────────────────────────────────
export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export interface ToastProps extends ToastData {
  onDismiss: (id: string) => void;
}

export interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

// ── Style + animation injection ────────────────────────────
const STYLE_ID = "common-toast-style";
const STYLE_CSS = `
@keyframes common-toast-in {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes common-toast-out {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(20px); }
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

// ── Type → visual map ──────────────────────────────────────
interface ToastVisual {
  accent: string;
  glow: string;
  icon: string;
  label: string;
}

const TYPE_VISUAL: Record<ToastType, ToastVisual> = {
  success: {
    accent: "#34d399",
    glow: "rgba(52, 211, 153, 0.35)",
    icon: "✓",
    label: "Success",
  },
  error: {
    accent: "#f87171",
    glow: "rgba(248, 113, 113, 0.35)",
    icon: "✕",
    label: "Error",
  },
  warning: {
    accent: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.35)",
    icon: "!",
    label: "Warning",
  },
  info: {
    accent: "#8b5cf6",
    glow: "rgba(139, 92, 246, 0.35)",
    icon: "i",
    label: "Info",
  },
};

const DEFAULT_DURATION = 3000;

// ── Single Toast component ─────────────────────────────────
export function Toast({
  id,
  type,
  title,
  message,
  duration = DEFAULT_DURATION,
  onDismiss,
}: ToastProps): ReactElement {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    injectStyles();
  }, []);

  useEffect(() => {
    if (duration <= 0) return undefined;
    const t1 = window.setTimeout(() => setLeaving(true), duration);
    const t2 = window.setTimeout(() => onDismiss(id), duration + 180);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [duration, id, onDismiss]);

  const visual = TYPE_VISUAL[type];

  const rootStyle: CSSProperties = {
    minWidth: 280,
    maxWidth: 380,
    display: "flex",
    gap: 10,
    padding: "12px 14px",
    background:
      "linear-gradient(180deg, rgba(28, 28, 42, 0.96) 0%, rgba(15, 15, 23, 0.96) 100%)",
    color: "#e5e7eb",
    border: `1px solid ${visual.accent}55`,
    borderLeft: `3px solid ${visual.accent}`,
    borderRadius: 10,
    boxShadow: `0 8px 24px rgba(0, 0, 0, 0.45), 0 0 16px ${visual.glow}`,
    animation: leaving
      ? "common-toast-out 180ms ease forwards"
      : "common-toast-in 200ms ease",
    pointerEvents: "auto",
  };

  const iconStyle: CSSProperties = {
    width: 22,
    height: 22,
    flexShrink: 0,
    borderRadius: "50%",
    background: visual.accent,
    color: "#0f0f17",
    fontSize: 13,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  };

  const closeBtnStyle: CSSProperties = {
    background: "transparent",
    border: "none",
    color: "rgba(229, 231, 235, 0.65)",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    padding: 4,
    marginLeft: "auto",
    flexShrink: 0,
  };

  const handleDismiss = () => {
    setLeaving(true);
    window.setTimeout(() => onDismiss(id), 180);
  };

  return (
    <div role="status" aria-live="polite" style={rootStyle}>
      <span style={iconStyle} aria-hidden>
        {visual.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#f5f3ff",
            lineHeight: 1.3,
          }}
        >
          {title}
        </div>
        {message ? (
          <div
            style={{
              fontSize: 12,
              color: "rgba(229, 231, 235, 0.75)",
              lineHeight: 1.4,
              marginTop: 2,
            }}
          >
            {message}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={`Dismiss ${visual.label.toLowerCase()} notification`}
        style={closeBtnStyle}
        onClick={handleDismiss}
      >
        ×
      </button>
    </div>
  );
}

// ── Container with portal ──────────────────────────────────
export function ToastContainer({
  toasts,
  onDismiss,
}: ToastContainerProps): ReactElement | null {
  if (typeof document === "undefined") return null;

  const containerStyle: CSSProperties = {
    position: "fixed",
    top: 16,
    right: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    zIndex: 10000,
    pointerEvents: "none",
  };

  return createPortal(
    <div style={containerStyle} aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}

// ── useToasts hook ─────────────────────────────────────────
export interface UseToastsApi {
  toasts: ToastData[];
  push: (toast: Omit<ToastData, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

function genId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useToasts(): UseToastsApi {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idsRef = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    idsRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<ToastData, "id"> & { id?: string }): string => {
      const id = toast.id ?? genId();
      const next: ToastData = {
        id,
        type: toast.type,
        title: toast.title,
        message: toast.message,
        duration: toast.duration,
      };
      idsRef.current.add(id);
      setToasts((prev) => [...prev, next]);
      return id;
    },
    []
  );

  const clear = useCallback(() => {
    idsRef.current.clear();
    setToasts([]);
  }, []);

  return { toasts, push, dismiss, clear };
}
