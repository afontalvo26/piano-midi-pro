// Player barrel — the app shell imports from here.

export { PlayerSection, usePlayerUi } from "./PlayerSection";
export type { PlayerSectionProps, PlayerUiApi } from "./PlayerSection";
export { PlayerBar } from "./PlayerBar";
export type { PlayerBarProps } from "./PlayerBar";
export { NowPlaying } from "./NowPlaying";
export type { NowPlayingProps } from "./NowPlaying";
export { QueuePanel } from "./QueuePanel";
export { TrackMenu } from "./TrackMenu";
export type { TrackMenuProps } from "./TrackMenu";
export { ShareDialog } from "./ShareDialog";
export type { ShareDialogProps, SharePayload } from "./ShareDialog";
export { PlaylistDialog } from "./PlaylistDialog";
export type { PlaylistDialogProps } from "./PlaylistDialog";
export { DetailsDialog } from "./DetailsDialog";
export { ToastHost } from "./ToastHost";
export {
  Cover,
  LikeButton,
  NowPlayingBars,
  ProgressBar,
  TransportButton,
} from "./parts";
export type { CoverSize } from "./parts";
