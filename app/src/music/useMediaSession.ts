// ============================================================
// music/useMediaSession — OS-level playback controls.
//
// Wires the player into the browser's Media Session so the track shows up on
// the lock screen / Windows media overlay and the hardware media keys work.
// Also owns the global keyboard shortcuts, because both are "the user is
// driving the player from outside the UI" concerns.
//
// Everything is feature-detected: Firefox has no Media Session, and the
// shortcut layer must never swallow keys while the user types in the search
// box or a MIDI filename.
// ============================================================

import { useEffect, useRef } from "react";
import type { PlayerContextValue } from "./PlayerContext";
import { SEEK_STEP, SEEK_STEP_LARGE } from "./constants";
import { initialsFor, paletteForTrack } from "./covers";

/** Renders the generated cover to a data URL for the OS media overlay. */
function coverArtwork(
  title: string,
  color: string,
  colorAlt: string,
): MediaImage[] {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="${colorAlt}"/>
    </linearGradient></defs>
    <rect width="512" height="512" fill="url(#g)"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
      font-family="system-ui, sans-serif" font-size="200" font-weight="700"
      fill="#ffffff" opacity="0.92">${initialsFor(title)}</text>
  </svg>`;
  // Blob URL keeps the artwork off the JS heap and works with the media
  // session's "src" contract on every browser that supports it.
  try {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    return [{ src: URL.createObjectURL(blob), sizes: "512x512", type: "image/svg+xml" }];
  } catch {
    return [];
  }
}

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    return TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
  }
  return false;
}

export type MediaSessionOptions = {
  /** Opens the full-screen now-playing view (media key / OS "open"). */
  onOpenNowPlaying?: () => void;
  /** Disables the shortcut layer (e.g. while a text field owns the keyboard). */
  enabled?: boolean;
};

export function useMediaSession(
  player: PlayerContextValue,
  options: MediaSessionOptions = {},
): void {
  const { onOpenNowPlaying, enabled = true } = options;
  const {
    current,
    currentTrackId,
    isPlaying,
    duration,
    next,
    previous,
    play,
    pause,
    seek,
    toggleLike,
    isLiked,
    toggleShuffle,
    cycleRepeat,
    toggleMute,
    volume,
    setVolume,
    getPosition,
  } = player;

  // Handlers are re-registered on every change, so they must read the latest
  // callbacks without re-running the effect on every render.
  const latest = useRef({ next, previous, play, pause, seek, onOpenNowPlaying });
  useEffect(() => {
    latest.current = { next, previous, play, pause, seek, onOpenNowPlaying };
  }, [next, previous, play, pause, seek, onOpenNowPlaying]);

  // Playhead is read imperatively (never React state), so publishing it to the
  // OS does not subscribe this hook to 60 fps updates. The ref is refreshed in
  // an effect because writing to it during render is a rules-of-hooks offence;
  // the position poll below runs on a timer, long after commit.
  const getPositionRef = useRef(getPosition);
  useEffect(() => {
    getPositionRef.current = getPosition;
  }, [getPosition]);

  // ── metadata ──────────────────────────────────────────────────
  const artworkUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;

    if (!current) {
      session.metadata = null;
      session.playbackState = "none";
      return;
    }

    const palette = paletteForTrack(current);
    const artwork = coverArtwork(current.title, palette.color, palette.colorAlt);
    if (artworkUrlRef.current) URL.revokeObjectURL(artworkUrlRef.current);
    artworkUrlRef.current = artwork[0]?.src ?? null;

    session.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist || "Piano MIDI Pro",
      album: current.album || "Piano MIDI Pro",
      artwork,
    });
  }, [current]);

  // Revoke the last artwork URL when the player unmounts.
  useEffect(
    () => () => {
      if (artworkUrlRef.current) URL.revokeObjectURL(artworkUrlRef.current);
    },
    [],
  );

  // ── playback state + position ─────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : current ? "paused" : "none";
  }, [isPlaying, current]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!("setPositionState" in navigator.mediaSession)) return;
    if (!current || duration <= 0) return;

    const publish = () => {
      const position = getPositionRef.current();
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(Math.max(0, position), duration),
        });
      } catch {
        /* transient inconsistent state — safe to ignore */
      }
    };

    publish();
    // The OS scrubber only needs occasional refreshes, so this is a slow poll
    // rather than a per-frame subscription.
    const timer = window.setInterval(publish, 2000);
    return () => window.clearInterval(timer);
  }, [current, duration]);

  // ── action handlers ───────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => latest.current.play()],
      ["pause", () => latest.current.pause()],
      ["nexttrack", () => latest.current.next()],
      ["previoustrack", () => latest.current.previous()],
      ["seekbackward", () => latest.current.seek(-SEEK_STEP, { relative: true })],
      ["seekforward", () => latest.current.seek(SEEK_STEP, { relative: true })],
      [
        "seekto",
        (details) => {
          if (typeof details.seekTime === "number") latest.current.seek(details.seekTime);
        },
      ],
      [
        "stop",
        () => {
          latest.current.pause();
          latest.current.seek(0);
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        /* unsupported action on this browser */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // ── keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key;
      const lower = key.toLowerCase();
      const withShift = event.shiftKey;

      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      switch (key) {
        case " ":
          handled();
          player.toggle();
          return;
        case "ArrowRight":
          handled();
          seek(withShift ? SEEK_STEP_LARGE : SEEK_STEP, { relative: true });
          return;
        case "ArrowLeft":
          handled();
          seek(withShift ? -SEEK_STEP_LARGE : -SEEK_STEP, { relative: true });
          return;
        case "ArrowUp":
          handled();
          setVolume(Math.min(1, volume + 0.05));
          return;
        case "ArrowDown":
          handled();
          setVolume(Math.max(0, volume - 0.05));
          return;
        default:
          break;
      }

      switch (lower) {
        case "n":
          handled();
          next();
          return;
        case "p":
          handled();
          previous();
          return;
        case "s":
          handled();
          toggleShuffle();
          return;
        case "r":
          handled();
          cycleRepeat();
          return;
        case "m":
          handled();
          toggleMute();
          return;
        case "l":
          handled();
          if (currentTrackId) toggleLike(currentTrackId);
          return;
        case "q":
          handled();
          window.dispatchEvent(new CustomEvent("pm:toggle-queue"));
          return;
        case "f":
          handled();
          latest.current.onOpenNowPlaying?.();
          return;
        case "escape":
          window.dispatchEvent(new CustomEvent("pm:close-overlays"));
          return;
        default:
          return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    player,
    seek,
    next,
    previous,
    toggleShuffle,
    cycleRepeat,
    toggleMute,
    setVolume,
    volume,
    toggleLike,
    currentTrackId,
  ]);

  // Screen readers get a polite announcement when the track changes.
  const liked = currentTrackId ? isLiked(currentTrackId) : false;
  useEffect(() => {
    if (!current) return;
    window.dispatchEvent(
      new CustomEvent("pm:track-change", {
        detail: { title: current.title, artist: current.artist },
      }),
    );
  }, [current, liked]);
}
