// ============================================================
// music/views — the player's navigation model.
//
// Lifted out of the screen component so App.tsx can persist "where the user
// was" across tab switches, and so a shared link can jump straight to a
// track's detail view.
// ============================================================

export type MusicView =
  | { tab: "home" }
  | { tab: "search"; q: string }
  | { tab: "tracks" }
  | { tab: "playlists" }
  | { tab: "playlist"; id: string }
  | { tab: "artists" }
  | { tab: "artist"; name: string }
  | { tab: "albums" }
  | { tab: "album"; name: string }
  | { tab: "genres" }
  | { tab: "genre"; id: string }
  | { tab: "liked" }
  | { tab: "history" };

export type MusicTab = MusicView["tab"];

/** Sidebar entries — the top-level destinations only. */
export const NAV_ITEMS: { tab: MusicTab; label: string; icon: string }[] = [
  { tab: "home", label: "Inicio", icon: "🏠" },
  { tab: "search", label: "Buscar", icon: "🔍" },
  { tab: "tracks", label: "Canciones", icon: "🎵" },
  { tab: "liked", label: "Me gusta", icon: "❤️" },
  { tab: "playlists", label: "Playlists", icon: "🎧" },
  { tab: "artists", label: "Artistas", icon: "🎤" },
  { tab: "albums", label: "Álbumes", icon: "💿" },
  { tab: "genres", label: "Géneros", icon: "🎼" },
  { tab: "history", label: "Historial", icon: "🕰️" },
];

/** True when `view` belongs under the sidebar entry `tab`. */
export function viewMatchesTab(view: MusicView, tab: MusicTab): boolean {
  if (view.tab === tab) return true;
  if (tab === "playlists" && view.tab === "playlist") return true;
  if (tab === "artists" && view.tab === "artist") return true;
  if (tab === "albums" && view.tab === "album") return true;
  if (tab === "genres" && view.tab === "genre") return true;
  return false;
}
