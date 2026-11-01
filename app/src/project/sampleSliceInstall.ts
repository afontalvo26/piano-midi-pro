import type { ProjectAssetRef, ProjectDrumRack } from "./model.ts";
import { applyCommand } from "./commands.ts";
import type { ProjectRepository } from "./repository.ts";
import type { ProjectSession, ProjectSessionSnapshot } from "./session.ts";

export interface InstallSampleSlicesOptions {
  readonly asset: ProjectAssetRef;
  readonly data: Blob;
  readonly trackId: string;
  /** Snapshot shown when the user accepted the frame boundaries. */
  readonly expectedRack: ProjectDrumRack;
  /** Source frame intervals are inclusive at start and exclusive at end. */
  readonly slices: readonly { readonly padId: string; readonly startFrame: number;
    readonly endFrame: number }[];
  readonly at: number;
}

export interface InstalledSampleSlices {
  readonly assetId: string;
  readonly snapshot: ProjectSessionSnapshot;
}

/** Keeps source bytes intact; one command installs their reference and all pad regions. */
export async function installSampleSlices(repository: ProjectRepository, session: ProjectSession,
  options: InstallSampleSlicesOptions): Promise<InstalledSampleSlices> {
  const command = { kind: "installSampleSlices" as const, trackId: options.trackId,
    expectedRack: options.expectedRack, asset: options.asset,
    slices: options.slices, at: options.at };
  // Reject stale racks and invalid frame ranges before leaving any staged bytes behind.
  applyCommand(session.getSnapshot().document, command);
  await repository.stageAsset(options.asset, options.data);
  session.dispatch(command);
  await session.save();
  return { assetId: options.asset.id, snapshot: session.getSnapshot() };
}
