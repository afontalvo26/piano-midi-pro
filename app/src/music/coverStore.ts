// ============================================================
// music/coverStore — real album art for the shipped catalogue.
//
// The demo pack used to render every track as a genre gradient with initials
// (see music/covers.ts) because the MIDI files carry no artwork. That art is
// now pre-resolved: `public/covers/manifest.json` maps a track id to a local
// JPEG downloaded from Spotify (640px, its HD square master).
//
// The manifest is a plain static file, so this is a one-shot fetch rather than
// a per-track request. Until it lands — or for any track it does not cover,
// which is every upload — `covers.ts` keeps generating the gradient, so the
// component tree never has to branch on "do we have art yet".
// ============================================================

import { useSyncExternalStore } from "react";

const MANIFEST_URL = "/covers/manifest.json";

type Manifest = {
  generatedAt: string;
  source: string;
  size: string;
  count: number;
  covers: Record<string, string>;
};

type CoverState = {
  /** Track id → public URL, e.g. `/covers/012-la-gota-fria-carlos-vives.jpg`. */
  byTrackId: Record<string, string>;
  /** False until the manifest resolves, so callers can tell "none" from "not yet". */
  ready: boolean;
};

// `getSnapshot` must return a stable reference between renders, so the state is
// replaced wholesale on load rather than mutated in place.
let state: CoverState = { byTrackId: {}, ready: false };
let loadStarted: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeCoverStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCoverSnapshot(): CoverState {
  return state;
}

/**
 * Reads the manifest once. Safe to call repeatedly — the second call is a
 * no-op, and a failure leaves the generated gradients in place rather than
 * throwing into the render path.
 */
export function loadCoverManifest(): Promise<void> {
  if (loadStarted) return loadStarted;

  loadStarted = fetch(MANIFEST_URL, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<Manifest>;
    })
    .then((manifest) => {
      const covers = manifest?.covers ?? {};
      state = { byTrackId: covers, ready: true };
      emit();
    })
    .catch(() => {
      // Offline first run, or the file was never shipped — the generated
      // artwork is a complete fallback, so there is nothing to report.
      state = { byTrackId: {}, ready: true };
      emit();
    });

  return loadStarted;
}

/** The art for one track, or null when only generated artwork exists. */
export function coverUrlFor(trackId: string | null | undefined): string | null {
  if (!trackId) return null;
  return state.byTrackId[trackId] ?? null;
}

/** Subscribes a component to the manifest, returning the lookup it needs. */
export function useCoverUrl(trackId: string | null | undefined): string | null {
  const snapshot = useSyncExternalStore(subscribeCoverStore, getCoverSnapshot, getCoverSnapshot);
  return trackId ? (snapshot.byTrackId[trackId] ?? null) : null;
}

/** How many tracks have real art — used by the verification script. */
export function coverCount(): number {
  return Object.keys(state.byTrackId).length;
}
