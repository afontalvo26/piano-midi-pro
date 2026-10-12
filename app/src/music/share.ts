// ============================================================
// music/share — links, clipboard and the native share sheet.
//
// A share link has to work for someone who has never opened the app, which
// rules out uploads (their notes only ever live in the sharer's memory).
// Shipped demo tracks are addressed by id, because the id *is* the public
// path — see music/ids.ts.
// ============================================================

import type { TrackMeta } from "./types";
import { isDemoMeta } from "./ids";
import { formatTime } from "./meta";

/** URL-safe base64 so ids survive being pasted into WhatsApp, Discord, etc. */
function encodePayload(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePayload<T>(token: string): T | null {
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export type SharedTrackPayload = {
  id: string;
  title: string;
  artist: string;
  /** Kept so a recipient who lacks the track still sees what it was. */
  duration?: number;
};

export type SharedCollectionPayload = {
  kind: "playlist" | "collection";
  name: string;
  description?: string;
  emoji?: string;
  color?: string;
  colorAlt?: string;
  tracks: { id: string; title: string; artist: string }[];
};

/** `?t=<token>` for a single track. */
export function buildTrackShareUrl(meta: TrackMeta): string {
  const payload: SharedTrackPayload = {
    id: meta.id,
    title: meta.title,
    artist: meta.artist,
    duration: Math.round(meta.duration),
  };
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("t", encodePayload(payload));
  return url.toString();
}

/** `?c=<token>` for a playlist or an arbitrary collection. */
export function buildCollectionShareUrl(payload: SharedCollectionPayload): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("c", encodePayload(payload));
  return url.toString();
}

export type IncomingShare =
  | { kind: "track"; track: SharedTrackPayload }
  | { kind: "collection"; collection: SharedCollectionPayload };

/** Reads `?t=` / `?c=` from a URL. Returns null when there is nothing to do. */
export function parseShareUrl(href: string): IncomingShare | null {
  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return null;
  }

  const trackToken = url.searchParams.get("t");
  if (trackToken) {
    const track = decodePayload<SharedTrackPayload>(trackToken);
    if (track?.id) return { kind: "track", track };
  }

  const collectionToken = url.searchParams.get("c");
  if (collectionToken) {
    const collection = decodePayload<SharedCollectionPayload>(collectionToken);
    if (collection?.tracks?.length) return { kind: "collection", collection };
  }
  return null;
}

/** Removes the share params without adding a history entry. */
export function stripShareParams(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("t") && !url.searchParams.has("c")) return;
    url.searchParams.delete("t");
    url.searchParams.delete("c");
    window.history.replaceState({}, "", url.toString());
  } catch {
    /* ignore — a failed cleanup is cosmetic */
  }
}

/** True when a link can actually be shared (demo tracks live on the server). */
export function isShareable(meta: TrackMeta | null | undefined): boolean {
  return Boolean(meta && isDemoMeta(meta));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  // Legacy fallback: offline contexts and older browsers deny the async API.
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/**
 * Tries the OS share sheet first (phones), then falls back to the clipboard.
 * `navigator.share` must be called inside the user gesture, so this is
 * invoked straight from the click handler.
 */
export async function shareTrack(
  meta: TrackMeta,
  options: { url?: string; preferClipboard?: boolean } = {},
): Promise<ShareOutcome> {
  const url = options.url ?? buildTrackShareUrl(meta);
  const text = `${meta.title} — ${meta.artist || "Piano MIDI Pro"}`;

  if (!options.preferClipboard && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: meta.title, text, url });
      return "shared";
    } catch (err) {
      // AbortError means the user dismissed the sheet — not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }

  const copied = await copyText(url);
  return copied ? "copied" : "failed";
}

/** Plain-text summary used by "copiar como texto". */
export function trackAsText(meta: TrackMeta): string {
  const lines = [
    `🎵 ${meta.title}`,
    `🎤 ${meta.artist || "Artista desconocido"}`,
    `⏱️ ${formatTime(meta.duration)} · ${meta.bpm} BPM`,
  ];
  if (meta.genre) lines.push(`🎼 ${meta.genre}`);
  lines.push(buildTrackShareUrl(meta));
  return lines.join("\n");
}

export function collectionAsText(collection: SharedCollectionPayload): string {
  const lines = [`${collection.emoji ?? "🎧"} ${collection.name}`];
  if (collection.description) lines.push(collection.description);
  lines.push("");
  collection.tracks.forEach((track, index) => {
    lines.push(`${index + 1}. ${track.title} — ${track.artist || "Desconocido"}`);
  });
  lines.push("");
  lines.push(buildCollectionShareUrl(collection));
  return lines.join("\n");
}

/** WhatsApp / Telegram / email deep links for the desktop fallback row. */
export function shareTargets(url: string, text: string) {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  return [
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${encodedText}%0A${encodedUrl}` },
    { id: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}` },
    {
      id: "x",
      label: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    },
    {
      id: "email",
      label: "Correo",
      href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodedUrl}`,
    },
  ] as const;
}
