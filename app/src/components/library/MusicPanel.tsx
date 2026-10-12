// ============================================================
// components/library/MusicPanel — the music tab as App renders it.
//
// App owns the *engine* and the current Studio song; this panel owns the
// player's navigation state and pulls the player's UI commands from context
// (see PlayerSection). Keeping the glue in its own component is what lets
// App.tsx render the whole section with a handful of props.
// ============================================================

import { useCallback } from "react";
import type { MouseEvent } from "react";
import type { TrackMeta } from "../../music/types";
import { usePlayerUi } from "../player/PlayerSection";
import { useLocalStorageState } from "../../utils/settings";
import type { MusicView } from "../../music/views";
import { MusicScreen } from "./MusicScreen";

export type MusicPanelProps = {
  onImportFile: (file: File) => void;
  importLoading?: boolean;
  importError?: string | null;
  importLastFile?: string | null;
};

export function MusicPanel({
  onImportFile,
  importLoading = false,
  importError = null,
  importLastFile = null,
}: MusicPanelProps) {
  const playerUi = usePlayerUi();
  // The active view persists so leaving the tab and coming back lands the user
  // where they were instead of resetting to Inicio.
  const [view, setView] = useLocalStorageState<MusicView>("piano_music_view", {
    tab: "home",
  });

  const handleOpenMenu = useCallback(
    (meta: TrackMeta, event: MouseEvent<HTMLElement>) => {
      playerUi.openTrackMenu(meta, event);
    },
    [playerUi],
  );

  return (
    <MusicScreen
      view={view}
      onViewChange={setView}
      onOpenMenu={handleOpenMenu}
      onAddToPlaylist={(meta) => playerUi.addToPlaylist([meta.id])}
      onSharePlaylist={playerUi.sharePlaylist}
      onEditPlaylist={playerUi.editPlaylist}
      onCreatePlaylist={() => playerUi.createPlaylist()}
      onPracticeTrack={playerUi.practice}
      onImportFile={onImportFile}
      importLoading={importLoading}
      importError={importError}
      importLastFile={importLastFile}
    />
  );
}
