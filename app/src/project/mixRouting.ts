import type { ProjectDocumentV1 } from "./model.ts";

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
