import type { ProjectDocumentV1, ProjectTrack } from "./model.ts";

export interface BusResampleRouteSelection {
  readonly sourceTrackIds: readonly string[];
  readonly routedTracks: readonly ProjectTrack[];
  readonly hasUnsupportedSends: boolean;
}

/**
 * Find source tracks whose output reaches the chosen bus, including nested buses.
 * The destination audio track is never a source, even if routed into that bus.
 * A missing or cyclic route is never treated as a valid source.
 */
export function findBusResampleRoutes(document: ProjectDocumentV1,
  sourceBusTrackId: string, destinationTrackId: string): BusResampleRouteSelection {
  const byId = new Map(document.tracks.map((track) => [track.id, track]));
  const paths: ProjectTrack[][] = [];
  for (const track of document.tracks) {
    if (track.kind === "bus" || track.id === destinationTrackId) continue;
    const path: ProjectTrack[] = [track];
    const seen = new Set([track.id]);
    let current: ProjectTrack = track;
    while (current.mix.outputBusTrackId) {
      const parent = byId.get(current.mix.outputBusTrackId);
      if (!parent || parent.kind !== "bus" || seen.has(parent.id)) break;
      path.push(parent);
      seen.add(parent.id);
      if (parent.id === sourceBusTrackId) {
        paths.push(path);
        break;
      }
      current = parent;
    }
  }
  const routed = new Map<string, ProjectTrack>();
  for (const path of paths) {
    for (const track of path) routed.set(track.id, track);
  }
  const routedTracks = [...routed.values()];
  return {
    sourceTrackIds: paths.map((path) => path[0]!.id),
    routedTracks,
    hasUnsupportedSends: routedTracks.some((track) => track.mix.sends.length > 0),
  };
}
