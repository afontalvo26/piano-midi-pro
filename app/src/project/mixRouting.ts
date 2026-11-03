import type { ProjectDocumentV1, ProjectTrack } from "./model.ts";

export interface AudioRoutingState {
  readonly mute: boolean;
  readonly solo: boolean;
}

export interface AudioRoutingPolicy {
  readonly hasSolo: boolean;
  readonly canSourceReachOutput: (trackId: string) => boolean;
  readonly shouldOpenTrackGate: (trackId: string) => boolean;
  readonly routesThrough: (trackId: string, destinationTrackId: string) => boolean;
}

/**
 * One pure routing authority for timeline filtering, export planning and the
 * live/offline graph. Mute closes only that route; a parallel send can keep a
 * source audible. Solo is inherited both downstream from a soloed source and
 * upstream when a source feeds a soloed bus.
 */
export function createAudioRoutingPolicy(tracks: readonly ProjectTrack[],
  readState?: (trackId: string) => AudioRoutingState | undefined): AudioRoutingPolicy {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const state = (track: ProjectTrack): AudioRoutingState =>
    readState?.(track.id) ?? { mute: track.mix.mute, solo: track.mix.solo };
  const destinations = (track: ProjectTrack): readonly string[] => [
    ...(track.mix.outputBusTrackId ? [track.mix.outputBusTrackId] : []),
    ...track.mix.sends.map((send) => send.busTrackId),
  ];
  const routesThrough = (trackId: string, destinationTrackId: string): boolean => {
    const pending = [trackId];
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const track = byId.get(id);
      if (!track) continue;
      for (const next of destinations(track)) {
        if (next === destinationTrackId) return true;
        if (!visited.has(next)) pending.push(next);
      }
    }
    return false;
  };
  const hasSolo = tracks.some((track) => state(track).solo);
  const reachesOutput = (trackId: string, requireSolo: boolean): boolean => {
    const active = new Set<string>();
    const visit = (id: string, soloAlongPath: boolean): boolean => {
      if (active.has(id)) throw new RangeError("Ciclo de buses en enrutamiento de audio");
      const track = byId.get(id);
      if (!track || state(track).mute) return false;
      active.add(id);
      const solo = soloAlongPath || state(track).solo;
      const direct = !track.mix.outputBusTrackId && (!requireSolo || solo);
      const audible = direct || destinations(track).some((next) => visit(next, solo));
      active.delete(id);
      return audible;
    };
    return visit(trackId, false);
  };
  const canSourceReachOutput = (trackId: string): boolean =>
    reachesOutput(trackId, hasSolo);
  const shouldOpenTrackGate = (trackId: string): boolean => {
    const track = byId.get(trackId);
    if (!track || state(track).mute || !reachesOutput(trackId, false)) return false;
    if (!hasSolo || canSourceReachOutput(trackId)) return true;
    return track.kind === "bus" && tracks.some((candidate) =>
      !state(candidate).mute && state(candidate).solo &&
      routesThrough(candidate.id, trackId) && canSourceReachOutput(candidate.id));
  };
  return { hasSolo, canSourceReachOutput, shouldOpenTrackGate, routesThrough };
}

/**
 * Fast fail-closed routing gate before constructing Web Audio nodes.
 * The project document validator also checks cycles at persistence boundaries;
 * this extra guard protects ad-hoc render fixtures and transient sink rebuilds.
 */
export function assertSafeAudioRouting(document: Pick<ProjectDocumentV1, "tracks">): void {
  const tracks = new Map(document.tracks.map((track) => [track.id, track]));
  const edges = new Map<string, string[]>();
  for (const track of document.tracks) {
    const destinations = [
      ...(track.mix.outputBusTrackId ? [track.mix.outputBusTrackId] : []),
      ...track.mix.sends.map((send) => {
        if (!Number.isFinite(send.gainDb) || send.gainDb < -120 || send.gainDb > 24) {
          throw new RangeError(`Envío ${send.id}: ganancia inválida`);
        }
        return send.busTrackId;
      }),
    ];
    for (const id of destinations) {
      if (id === track.id || tracks.get(id)?.kind !== "bus") {
        throw new RangeError(`Pista ${track.id}: bus inválido o retroalimentación directa`);
      }
    }
    edges.set(track.id, destinations);
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) throw new RangeError("Ciclo de enrutamiento de audio");
    if (visited.has(id)) return;
    active.add(id);
    for (const next of edges.get(id) ?? []) visit(next);
    active.delete(id);
    visited.add(id);
  };
  for (const track of document.tracks) visit(track.id);
}
