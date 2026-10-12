// ============================================================
// components/player/ToastHost — renders the player's toasts.
// ============================================================

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { dismissToast, subscribeToasts, type ToastMessage } from "../../music/toast";

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="pm-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`pm-toast pm-toast--${toast.tone}`}>
          <span className="pm-toast__text">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="pm-toast__action"
              onClick={() => {
                toast.action?.run();
                dismissToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            className="pm-toast__close"
            onClick={() => dismissToast(toast.id)}
            aria-label="Cerrar notificación"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
