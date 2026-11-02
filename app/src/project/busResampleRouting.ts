import type { ProjectDocumentV1, ProjectTrack } from "./model.ts";

export interface BusResampleRouteSelection {
  readonly sourceTrackIds: readonly string[];
  readonly routedTracks: readonly ProjectTrack[];
  /** Exact sends on one or more paths reaching the tap, not unrelated sends. */
  readonly includedSendIds: readonly string[];
}

/**
 * Discover every output/send path feeding a post-bus, pre-master tap.
 * Parallel routes are retained, but each source is rendered only once.
 * Destination audio track is never a source, preventing feedback on install.
 */
export function findBusResampleRoutes(document: ProjectDocumentV1,
  sourceBusTrackId: string, destinationTrackId: string): BusResampleRouteSelection {
  const byId = new Map(document.tracks.map((track) => [track.id, track]));
  const empty: BusResampleRouteSelection = { sourceTrackIds: [], routedTracks: [],
    includedSendIds: [] };
  if (byId.get(sourceBusTrackId)?.kind !== "bus") return empty;

  const memo = new Map<string, boolean>();
  const active = new Set<string>();
  const reachesTap = (id: string): boolean => {
    if (id === sourceBusTrackId) return true;
    if (memo.has(id)) return memo.get(id)!;
    if (active.has(id)) return false;
    const track = byId.get(id);
    if (!track) return false;
    active.add(id);
    const next = [track.mix.outputBusTrackId,
      ...track.mix.sends.map((send) => send.busTrackId)]
      .filter((value): value is string => value !== undefined);
    const reachable = next.some((busId) => byId.get(busId)?.kind === "bus" &&
      reachesTap(busId));
    active.delete(id);
    memo.set(id, reachable);
    return reachable;
  };

  const sourceTrackIds: string[] = [];
  const routed = new Set<string>([sourceBusTrackId]);
  const includedSendIds = new Set<string>();
  for (const source of document.tracks) {
    if (source.kind === "bus" || source.id === destinationTrackId ||
        !reachesTap(source.id)) continue;
    sourceTrackIds.push(source.id);
    const queue = [source.id];
    const visited = new Set<string>();
    while (queue.length) {
      const id = queue.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      routed.add(id);
      if (id === sourceBusTrackId) continue;
      const track = byId.get(id)!;
      const primary = track.mix.outputBusTrackId;
      if (primary && reachesTap(primary)) queue.push(primary);
      for (const send of track.mix.sends) {
        if (!reachesTap(send.busTrackId)) continue;
        includedSendIds.add(send.id);
        queue.push(send.busTrackId);
      }
    }
  }
  return {
    sourceTrackIds,
    routedTracks: document.tracks.filter((track) => routed.has(track.id)),
    includedSendIds: [...includedSendIds],
  };
}
