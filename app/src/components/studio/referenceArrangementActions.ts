import type { ProjectClip, ProjectDocumentV1 } from "../../project/model.ts";
import type { ProjectCommand } from "../../project/commands.ts";
import { createArrangementClip, editArrangementClip,
  splitArrangementClip } from "../../composition/arrangementModel.ts";
import { shiftArrangementAudioClip,
  splitArrangementAudioClip } from "../../composition/audioArrangement.ts";

export type ReferenceArrangementTool = "select" | "draw" | "cut";

export const STUDIO_SNAP_TICKS = 240;

/** Snap an on-screen musical position to sixteenth notes. */
export function snapStudioTick(tick: number): number {
  if (!Number.isFinite(tick)) throw new RangeError("Posición de arreglo inválida");
  return Math.max(0, Math.round(tick / STUDIO_SNAP_TICKS) * STUDIO_SNAP_TICKS);
}

/** Only reuse a source pattern already assigned to this track. */
export function drawStudioClip(document: ProjectDocumentV1, trackId: string,
  tick: number): ProjectCommand {
  const track = document.tracks.find((item) => item.id === trackId);
  if (!track || (track.kind !== "instrument" && track.kind !== "drum")) {
    throw new RangeError("Dibujar un clip requiere una pista MIDI o de batería");
  }
  const sourceClip = document.clips.find((item) =>
    item.trackId === trackId && item.kind === "pattern");
  if (!sourceClip || !document.patterns.some((item) => item.id === sourceClip.sourceId)) {
    throw new RangeError("La pista no tiene patrón de referencia. Créalo en Arreglo.");
  }
  return createArrangementClip(document, trackId, sourceClip.sourceId, snapStudioTick(tick));
}

/** Cut both MIDI and audio clips with the original reversible editing engine. */
export function cutStudioClip(document: ProjectDocumentV1, clipId: string,
  tick: number): ProjectCommand {
  const clip = document.clips.find((item) => item.id === clipId);
  if (!clip) throw new RangeError("Clip seleccionado inexistente");
  const snapped = snapStudioTick(tick);
  if (snapped <= clip.startTick || snapped >= clip.startTick + clip.lengthTicks) {
    throw new RangeError("Coloca las tijeras dentro del clip, lejos de sus extremos");
  }
  return clip.kind === "audio"
    ? splitArrangementAudioClip(document, clipId, snapped)
    : splitArrangementClip(document, clipId, snapped);
}

/** Move a clip through the same validated domain commands as full Arrangement. */
export function moveStudioClip(document: ProjectDocumentV1, clipId: string,
  deltaTick: number): ProjectCommand | null {
  const clip = document.clips.find((item) => item.id === clipId);
  if (!clip) throw new RangeError("Clip seleccionado inexistente");
  const target = snapStudioTick(clip.startTick + deltaTick);
  if (target === clip.startTick) return null;
  if (clip.kind === "audio") {
    return shiftArrangementAudioClip(document, clipId, target - clip.startTick);
  }
  return editArrangementClip(document, clipId, {
    startTick: target, lengthTicks: clip.lengthTicks,
    sourceOffsetTick: clip.sourceOffsetTick, loopMode: clip.loopMode,
    tailPolicy: clip.tailPolicy, transpose: clip.transpose, gainDb: clip.gainDb,
    muted: clip.muted,
  });
}

/** Quick quantize acts on a real pattern, and therefore supports project Undo. */
export function quantizeStudioClip(document: ProjectDocumentV1,
  clipId: string, quantum = STUDIO_SNAP_TICKS): ProjectCommand | null {
  const clip: ProjectClip | undefined = document.clips.find((item) => item.id === clipId);
  if (!clip || clip.kind !== "pattern") {
    throw new RangeError("Selecciona un clip MIDI para cuantizar sus notas");
  }
  const pattern = document.patterns.find((item) => item.id === clip.sourceId);
  if (!pattern) throw new RangeError("El patrón seleccionado ya no existe");
  if (!Number.isSafeInteger(quantum) || quantum < 1) {
    throw new RangeError("Cuantización inválida");
  }
  const notes = pattern.notes.map((note) => {
    const startTick = Math.min(pattern.lengthTicks - 1,
      Math.max(0, Math.round(note.startTick / quantum) * quantum));
    const durationTick = Math.min(pattern.lengthTicks - startTick,
      Math.max(1, Math.round(note.durationTick / quantum) * quantum));
    return { ...note, startTick, durationTick };
  });
  if (notes.every((note, index) => note.startTick === pattern.notes[index]!.startTick &&
      note.durationTick === pattern.notes[index]!.durationTick)) return null;
  return { kind: "replacePattern", expectedVersion: pattern.version,
    pattern: { ...pattern, version: pattern.version + 1, notes }, at: Date.now() };
}
