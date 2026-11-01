// ============================================================
// useStorePoll — select frame-batched keyboard-store notifications.
//
// Why not `useSyncExternalStore`?
// ───────────────────────────────
// React gives `useSyncExternalStore` updates the *sync* lane, so a notification
// arriving from a MIDI handler re-renders that component's subtree synchronously
// and immediately. Measured on the same 40-note burst (120 ms apart):
//
//   useSyncExternalStore → handler max 8.9 ms, one sync repaint per note
//   useStorePoll         → handler max 3.9 ms, at most one repaint per frame
//
// The MIDI callback is the one place that must stay cheap: whatever it spends is
// added directly to how late the note is scheduled, and at playing speed a
// repaint storm leaves MIDI events queued behind React. The store schedules a
// notification only after a change, at most once per frame, so the audio path
// is never blocked by rendering and idle components do not keep polling.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { PianoKeyboardSnapshot } from "../state/pianoKeyboardStore";
import { pianoKeyboardStore } from "../state/pianoKeyboardStore";

export type StoreSelector<T> = (snapshot: PianoKeyboardSnapshot) => T;

function shallowArrayEqual(
  a: readonly unknown[],
  b: readonly unknown[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/**
 * @param selector  Derives the needed value from the store snapshot.
 * @param isEqual   Optional equality check; `true` skips the repaint. Defaults
 *                  to `Object.is`, or a shallow comparison for arrays.
 */
export function useStorePoll<T>(
  selector: StoreSelector<T>,
  isEqual?: (a: T, b: T) => boolean,
): T {
  const [value, setValue] = useState<T>(() =>
    selector(pianoKeyboardStore.getSnapshot()),
  );

  // Latest render's props, kept in refs so a store notification never closes
  // over a stale selector. Written from an effect, never during render.
  const latest = useRef({ selector, isEqual, value });

  useEffect(() => {
    latest.current.selector = selector;
    latest.current.isEqual = isEqual;
    latest.current.value = value;
  });

  const update = useCallback(() => {
    const state = latest.current;
    const next = state.selector(pianoKeyboardStore.getSnapshot());
    const prev = state.value;
    const equal =
      state.isEqual !== undefined
        ? state.isEqual(prev, next)
        : Array.isArray(prev) && Array.isArray(next)
          ? shallowArrayEqual(prev as unknown[], next as unknown[])
          : Object.is(prev, next);
    if (equal) return;
    state.value = next;
    setValue(next);
  }, []);

  useEffect(() => pianoKeyboardStore.subscribe(update), [update]);

  // A selector may depend on props. Ask the store for one shared notification;
  // while hidden it is retained until the page becomes visible again.
  useEffect(() => {
    pianoKeyboardStore.requestRefresh();
  }, [selector, isEqual]);

  return value;
}
