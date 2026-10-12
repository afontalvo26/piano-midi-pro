// ============================================================
// music/toast — feedback for player actions.
//
// The player fires a lot of confirmations that have no visible result
// ("Agregada a la cola", "Link copiado"). Without a message the user cannot
// tell whether the click landed, so every one of them routes here.
//
// Module-level emitter (not context state) so `libraryStore`-style code and
// plain event handlers can raise a toast without prop drilling.
// ============================================================

export type ToastTone = "info" | "success" | "error";

export type ToastMessage = {
  id: number;
  text: string;
  tone: ToastTone;
  /** Optional single action, e.g. "Deshacer". */
  action?: { label: string; run: () => void };
};

type Listener = (toasts: ToastMessage[]) => void;

const DURATION: Record<ToastTone, number> = {
  info: 2600,
  success: 3200,
  error: 5200,
};

let toasts: ToastMessage[] = [];
const listeners = new Set<Listener>();
const timers = new Map<number, number>();
let nextId = 1;

function publish(): void {
  const snapshot = [...toasts];
  for (const listener of listeners) listener(snapshot);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener([...toasts]);
  return () => listeners.delete(listener);
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timers.delete(id);
  }
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  publish();
}

export function showToast(
  text: string,
  tone: ToastTone = "info",
  action?: ToastMessage["action"],
): number {
  const id = nextId++;
  toasts = [...toasts.slice(-3), { id, text, tone, action }];
  publish();
  const timer = window.setTimeout(() => dismissToast(id), DURATION[tone]);
  timers.set(id, timer);
  return id;
}

export const toast = {
  info: (text: string, action?: ToastMessage["action"]) => showToast(text, "info", action),
  success: (text: string, action?: ToastMessage["action"]) =>
    showToast(text, "success", action),
  error: (text: string, action?: ToastMessage["action"]) => showToast(text, "error", action),
};
