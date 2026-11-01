import type { ProjectAutomationLane, ProjectClip, ProjectDocumentV1, ProjectScene, ProjectSection } from "../project/model.ts";
import type { ProjectCommand } from "../project/commands.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";

export type EditableClipFields = Pick<ProjectClip,
  "startTick" | "lengthTicks" | "sourceOffsetTick" | "loopMode" | "transpose" | "gainDb" | "muted" | "tailPolicy"> &
  Partial<Pick<Extract<ProjectClip, { kind: "audio" }>,
    "sourceStartFrame" | "sourceEndFrame" | "fadeInFrames" | "fadeOutFrames">>;

function clipById(document: ProjectDocumentV1, clipId: string): ProjectClip {
  const clip = document.clips.find((item) => item.id === clipId);
  if (!clip) throw new RangeError("Clip inexistente");
  return clip;
}

export function editArrangementClip(document: ProjectDocumentV1, clipId: string,
  fields: EditableClipFields, at = Date.now()): ProjectCommand {
  const clip = clipById(document, clipId);
  const pattern = clip.kind === "pattern" ? document.patterns.find((item) => item.id === clip.sourceId) : null;
  if (!Number.isSafeInteger(fields.startTick) || fields.startTick < 0 ||
      !Number.isSafeInteger(fields.lengthTicks) || fields.lengthTicks < 1 ||
      !Number.isSafeInteger(fields.sourceOffsetTick) || fields.sourceOffsetTick < 0 ||
      (pattern && fields.sourceOffsetTick >= pattern.lengthTicks) ||
      !Number.isSafeInteger(fields.transpose) || fields.transpose < -127 || fields.transpose > 127 ||
      !Number.isFinite(fields.gainDb) || fields.gainDb < -120 || fields.gainDb > 24) {
    throw new RangeError("Posición, duración, transposición o ganancia inválida");
  }
  if ((fields.tailPolicy !== "cut" && fields.tailPolicy !== "continue") ||
      (fields.loopMode !== "none" && fields.loopMode !== "loop")) throw new RangeError("Repetición o cola inválida");
  if (clip.kind === "audio") {
    const first = fields.sourceStartFrame ?? clip.sourceStartFrame;
    const last = fields.sourceEndFrame ?? clip.sourceEndFrame;
    const fadeIn = fields.fadeInFrames ?? clip.fadeInFrames;
    const fadeOut = fields.fadeOutFrames ?? clip.fadeOutFrames;
    if (fields.loopMode !== "none" || fields.sourceOffsetTick !== 0 || fields.transpose !== 0 ||
        !Number.isSafeInteger(first) || first < 0 || !Number.isSafeInteger(last) || last <= first ||
        !Number.isSafeInteger(fadeIn) || fadeIn < 0 || !Number.isSafeInteger(fadeOut) || fadeOut < 0 ||
        fadeIn + fadeOut > last - first) {
      throw new RangeError("Clip de audio: trim/fades inválidos o modo no admitido");
    }
  }
  const clips = document.clips.map((item) => item.id === clip.id ? { ...item, ...fields } : item);
  return { kind: "replaceClips", expected: document.clips, clips, at };
}

export function createArrangementClip(document: ProjectDocumentV1, trackId: string,
  patternId: string, startTick: number, at = Date.now()): ProjectCommand {
  const track = document.tracks.find((item) => item.id === trackId);
  const pattern = document.patterns.find((item) => item.id === patternId);
  if (!track || (track.kind !== "instrument" && track.kind !== "drum") || !pattern ||
      !Number.isSafeInteger(startTick) || startTick < 0 ||
      startTick + pattern.lengthTicks > Number.MAX_SAFE_INTEGER) throw new RangeError("Pista, patrón o tick inválido");
  const clip: ProjectClip = { id: crypto.randomUUID(), kind: "pattern", trackId, sourceId: pattern.id,
    sourceVersion: pattern.version, startTick, lengthTicks: pattern.lengthTicks,
    sourceOffsetTick: 0, loopMode: "loop", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false };
  return { kind: "createClip", clip, at };
}

/** Splitting an instance never mutates its source or duplicates notes. */
export function splitArrangementClip(document: ProjectDocumentV1, clipId: string,
  atTick: number, at = Date.now()): ProjectCommand {
  const clip = clipById(document, clipId);
  if (clip.kind !== "pattern") throw new RangeError("El corte de audio requiere motor de pistas de audio");
  const relative = atTick - clip.startTick;
  if (!Number.isSafeInteger(atTick) || relative < 1 || relative >= clip.lengthTicks) {
    throw new RangeError("El corte debe caer dentro del clip");
  }
  const pattern = document.patterns.find((item) => item.id === clip.sourceId);
  const sourceOffsetTick = pattern && clip.loopMode === "loop"
    ? (clip.sourceOffsetTick + relative) % pattern.lengthTicks : clip.sourceOffsetTick + relative;
  if (pattern && sourceOffsetTick >= pattern.lengthTicks) {
    throw new RangeError("El corte supera la fuente sin repetición");
  }
  const left = { ...clip, lengthTicks: relative };
  const right = { ...clip, id: crypto.randomUUID(), startTick: atTick,
    lengthTicks: clip.lengthTicks - relative, sourceOffsetTick };
  const index = document.clips.findIndex((item) => item.id === clipId);
  return { kind: "replaceClips", expected: document.clips,
    clips: [...document.clips.slice(0, index), left, right, ...document.clips.slice(index + 1)], at };
}

export function duplicateArrangementClip(document: ProjectDocumentV1, clipId: string,
  at = Date.now(), newClipId = crypto.randomUUID()): ProjectCommand {
  const clip = clipById(document, clipId);
  const startTick = clip.startTick + clip.lengthTicks;
  const lanes = document.automation.filter((lane) => lane.target.scope === "clip" &&
    lane.target.ownerId === clipId);
  if (!lanes.length) return { kind: "duplicateClip", clipId, newClipId, startTick, at };
  return { kind: "duplicateClipWithAutomation", clipId, expectedClip: clip, expectedLanes: lanes,
    newClipId, startTick, newLaneIds: lanes.map(() => crypto.randomUUID()),
    newPointIds: lanes.map((lane) => lane.points.map(() => crypto.randomUUID())), at };
}

export function uniqueArrangementClip(document: ProjectDocumentV1, clipId: string,
  at = Date.now()): ProjectCommand {
  const clip = clipById(document, clipId);
  if (clip.kind !== "pattern") throw new RangeError("Sólo un clip MIDI puede hacerse único");
  const pattern = document.patterns.find((item) => item.id === clip.sourceId);
  if (!pattern) throw new RangeError("Patrón fuente inexistente");
  const stepIds = Object.fromEntries([...new Set(pattern.notes.map((note) => note.stepId).filter((id): id is string => !!id))]
    .map((id) => [id, crypto.randomUUID()]));
  return { kind: "makeClipUnique", clipId, newPatternId: crypto.randomUUID(),
    noteIds: pattern.notes.map(() => crypto.randomUUID()),
    expressionIds: pattern.expression.map(() => crypto.randomUUID()), stepIds, at };
}

/** Capture currently active pattern sources. A scene stores refs; it never clones notes. */
export function captureArrangementScene(document: ProjectDocumentV1, tick: number, name: string,
  launchQuantizationTicks: number, at = Date.now()): ProjectCommand {
  if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isSafeInteger(launchQuantizationTicks) ||
      launchQuantizationTicks < 0 || !name.trim() || name.trim().length > 100) {
    throw new RangeError("Escena inválida");
  }
  const slots = document.trackOrder.flatMap((trackId) => {
    const active = document.clips.filter((clip): clip is Extract<ProjectClip, { kind: "pattern" }> =>
      clip.kind === "pattern" && clip.trackId === trackId && !clip.muted &&
      clip.startTick <= tick && tick < clip.startTick + clip.lengthTicks)
      .sort((a, b) => b.startTick - a.startTick || b.id.localeCompare(a.id))[0];
    return active ? [{ id: crypto.randomUUID(), trackId, patternId: active.sourceId }] : [];
  });
  if (!slots.length) throw new RangeError("No hay clips MIDI activos para capturar en este tick");
  const scene: ProjectScene = { id: crypto.randomUUID(), name: name.trim(), launchQuantizationTicks, slots };
  return { kind: "replaceScenes", expected: document.scenes, scenes: [...document.scenes, scene], at };
}

export function removeArrangementScene(document: ProjectDocumentV1, sceneId: string,
  at = Date.now()): ProjectCommand {
  if (!document.scenes.some((scene) => scene.id === sceneId)) throw new RangeError("Escena inexistente");
  return { kind: "replaceScenes", expected: document.scenes,
    scenes: document.scenes.filter((scene) => scene.id !== sceneId), at };
}

export function addArrangementSection(document: ProjectDocumentV1, name: string, startTick: number,
  lengthTicks: number, at = Date.now()): ProjectCommand {
  if (!name.trim() || name.trim().length > 100 || !Number.isSafeInteger(startTick) || startTick < 0 ||
      !Number.isSafeInteger(lengthTicks) || lengthTicks < 1 ||
      startTick + lengthTicks > Number.MAX_SAFE_INTEGER ||
      document.sections.some((item) => startTick < item.startTick + item.lengthTicks &&
        startTick + lengthTicks > item.startTick)) throw new RangeError("Sección inválida o solapada");
  const section: ProjectSection = { id: crypto.randomUUID(), name: name.trim(), startTick, lengthTicks };
  return { kind: "replaceSections", expected: document.sections,
    sections: [...document.sections, section].sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id)), at };
}

export function duplicateArrangementSection(document: ProjectDocumentV1, sectionId: string,
  at = Date.now()): ProjectCommand {
  const source = document.sections.find((item) => item.id === sectionId);
  if (!source) throw new RangeError("Sección inexistente");
  const destination = source.startTick + source.lengthTicks;
  if (destination + source.lengthTicks > Number.MAX_SAFE_INTEGER ||
      document.sections.some((section) => destination < section.startTick + section.lengthTicks &&
        destination + source.lengthTicks > section.startTick)) {
    throw new RangeError("No hay espacio para duplicar la sección sin solapar otro marcador");
  }
  const section: ProjectSection = { ...source, id: crypto.randomUUID(), name: `${source.name} copia`,
    startTick: destination };
  const clock = new MusicalClock(document.tempoMap, document.meterMap);
  const shiftUs = Math.round(clock.tickToSeconds(destination) * 1_000_000) -
    Math.round(clock.tickToSeconds(source.startTick) * 1_000_000);
  const copiedClipSpans = new Map<string, { readonly id: string;
    readonly sourceStartTick: number; readonly lengthTicks: number;
    readonly targetLengthTicks: number }>();
  const addedClips: ProjectClip[] = [];
  for (const clip of document.clips) {
    const segmentStart = Math.max(clip.startTick, source.startTick);
    const segmentEnd = Math.min(clip.startTick + clip.lengthTicks, destination);
    if (segmentStart >= segmentEnd) continue;
    const trimmedLeft = segmentStart - clip.startTick;
    if (clip.kind === "audio" && (trimmedLeft > 0 || segmentEnd < clip.startTick + clip.lengthTicks)) {
      throw new RangeError("Duplicar un recorte parcial de audio requiere alineación de frames");
    }
    const pattern = clip.kind === "pattern" ? document.patterns.find((item) => item.id === clip.sourceId) : null;
    const offset = clip.loopMode === "loop" && pattern
      ? (clip.sourceOffsetTick + trimmedLeft) % pattern.lengthTicks : clip.sourceOffsetTick + trimmedLeft;
    if (pattern && offset >= pattern.lengthTicks) continue;
    const id = crypto.randomUUID();
    let copy: ProjectClip;
    if (clip.kind === "audio" && clip.timeMode === "absolute") {
      const absoluteStartUs = clip.absoluteStartUs! + shiftUs;
      const absoluteEndUs = clip.absoluteEndUs! + shiftUs;
      const startTick = clock.secondsToTick(absoluteStartUs / 1_000_000);
      const endTick = clock.secondsToTick(absoluteEndUs / 1_000_000);
      if (!Number.isSafeInteger(absoluteStartUs) || !Number.isSafeInteger(absoluteEndUs) ||
          endTick <= startTick) throw new RangeError("La copia absoluta colapsa o excede tiempo seguro");
      copy = { ...clip, id, startTick, lengthTicks: endTick - startTick,
        absoluteStartUs, absoluteEndUs };
    } else {
      copy = { ...clip, id, startTick: destination + segmentStart - source.startTick,
        lengthTicks: segmentEnd - segmentStart, sourceOffsetTick: offset };
    }
    addedClips.push(copy);
    copiedClipSpans.set(clip.id, { id, sourceStartTick: trimmedLeft,
      lengthTicks: segmentEnd - segmentStart, targetLengthTicks: copy.lengthTicks });
  }
  const automation: ProjectAutomationLane[] = document.automation.map((lane) => {
    if (lane.target.scope === "clip") return lane;
    const extra = lane.points.filter((point) => point.tick >= source.startTick && point.tick < destination)
      .map((point) => ({ ...point, id: crypto.randomUUID(), tick: point.tick + source.lengthTicks }));
    if (!extra.length) return lane;
    const points = [...lane.points, ...extra].sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
    if (points.some((point, index) => index > 0 && point.tick === points[index - 1]!.tick)) {
      throw new RangeError("La automatización destino ya contiene puntos en los mismos ticks");
    }
    return { ...lane, points };
  });
  for (const lane of document.automation) {
    if (lane.target.scope !== "clip" || !lane.target.ownerId) continue;
    const span = copiedClipSpans.get(lane.target.ownerId);
    if (!span) continue;
    const points = lane.points.filter((point) => point.tick >= span.sourceStartTick &&
      point.tick < span.sourceStartTick + span.lengthTicks)
      .map((point) => ({ ...point, id: crypto.randomUUID(),
        tick: point.tick - span.sourceStartTick }));
    if (points.some((point) => point.tick >= span.targetLengthTicks)) {
      throw new RangeError("La curva local no cabe en la copia absoluta de la sección");
    }
    automation.push({ ...lane, id: crypto.randomUUID(), target: { ...lane.target, ownerId: span.id },
      points });
  }
  const copiedCrossfades = (document.audioCrossfades ?? []).flatMap((fade) => {
    const outgoing = copiedClipSpans.get(fade.outgoingClipId);
    const incoming = copiedClipSpans.get(fade.incomingClipId);
    if (!outgoing && !incoming) return [];
    if (!outgoing || !incoming) {
      throw new RangeError("La sección corta un crossfade; incluye ambos clips completos para duplicarla");
    }
    return [{ ...fade, id: crypto.randomUUID(), outgoingClipId: outgoing.id,
      incomingClipId: incoming.id }];
  });
  const copiedComps = (document.audioComps ?? []).flatMap((comp) => {
    const segments = comp.segments.flatMap((segment) => {
      const copy = copiedClipSpans.get(segment.clipId);
      return copy ? [{ ...segment, id: crypto.randomUUID(), clipId: copy.id }] : [];
    });
    return segments.length ? [{ ...comp, id: crypto.randomUUID(), name: `${comp.name.slice(0, 94)} copia`,
      segments }] : [];
  });
  return { kind: "replaceFullArrangement", expected: { clips: document.clips,
    sections: document.sections, automation: document.automation,
    audioCrossfades: document.audioCrossfades, audioComps: document.audioComps },
  clips: [...document.clips, ...addedClips],
  sections: [...document.sections, section].sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id)),
  automation,
  audioCrossfades: document.audioCrossfades === undefined && !copiedCrossfades.length
    ? undefined : [...(document.audioCrossfades ?? []), ...copiedCrossfades],
  audioComps: document.audioComps === undefined && !copiedComps.length
    ? undefined : [...(document.audioComps ?? []), ...copiedComps], at };
}

export type EditableSectionFields = Pick<ProjectSection, "name" | "startTick" | "lengthTicks">;

export function editArrangementSection(document: ProjectDocumentV1, sectionId: string,
  fields: EditableSectionFields, at = Date.now()): ProjectCommand {
  if (!document.sections.some((item) => item.id === sectionId)) throw new RangeError("Sección inexistente");
  if (!fields.name.trim() || fields.name.trim().length > 100 ||
      !Number.isSafeInteger(fields.startTick) || fields.startTick < 0 ||
      !Number.isSafeInteger(fields.lengthTicks) || fields.lengthTicks < 1 ||
      fields.startTick + fields.lengthTicks > Number.MAX_SAFE_INTEGER ||
      document.sections.some((item) => item.id !== sectionId &&
        fields.startTick < item.startTick + item.lengthTicks &&
        fields.startTick + fields.lengthTicks > item.startTick)) {
    throw new RangeError("Sección inválida o solapada");
  }
  const sections = document.sections.map((item) => item.id === sectionId ? { ...item,
    name: fields.name.trim(), startTick: fields.startTick, lengthTicks: fields.lengthTicks } : item)
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id));
  return { kind: "replaceSections", expected: document.sections, sections, at };
}

export interface EditableSceneFields {
  readonly name: string;
  readonly launchQuantizationTicks: number;
  readonly slots: readonly { readonly trackId: string; readonly patternId: string }[];
}

export function editArrangementScene(document: ProjectDocumentV1, sceneId: string,
  fields: EditableSceneFields, at = Date.now()): ProjectCommand {
  const scene = document.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new RangeError("Escena inexistente");
  if (!fields.name.trim() || fields.name.trim().length > 100 ||
      !Number.isSafeInteger(fields.launchQuantizationTicks) || fields.launchQuantizationTicks < 0 ||
      new Set(fields.slots.map((slot) => slot.trackId)).size !== fields.slots.length ||
      fields.slots.some((slot) => !document.trackOrder.includes(slot.trackId) ||
        !document.patterns.some((pattern) => pattern.id === slot.patternId))) {
    throw new RangeError("Escena, pista o patrón inválido");
  }
  const slots = fields.slots.map((slot) => ({ id: scene.slots.find((item) => item.trackId === slot.trackId)?.id ??
    crypto.randomUUID(), trackId: slot.trackId, patternId: slot.patternId }));
  const scenes = document.scenes.map((item) => item.id === sceneId ? { ...item, name: fields.name.trim(),
    launchQuantizationTicks: fields.launchQuantizationTicks, slots } : item);
  return { kind: "replaceScenes", expected: document.scenes, scenes, at };
}

export interface PerformedSceneSegment {
  readonly sceneId: string;
  readonly startTick: number;
  readonly endTick: number;
}

/** Materialize a finished launcher performance as pattern instances, one command. */
export function captureArrangementPerformance(document: ProjectDocumentV1,
  segments: readonly PerformedSceneSegment[], at = Date.now()): ProjectCommand {
  if (!segments.length || segments.length > 100_000) throw new RangeError("Actuación vacía o demasiado larga");
  const added: ProjectClip[] = [];
  const covered = new Map<string, { startTick: number; endTick: number }[]>();
  let previousEnd = -1;
  for (const segment of segments) {
    if (!Number.isSafeInteger(segment.startTick) || !Number.isSafeInteger(segment.endTick) ||
        segment.startTick < 0 || segment.endTick <= segment.startTick ||
        segment.startTick < previousEnd) throw new RangeError("Intervalo de escena inválido o solapado");
    previousEnd = segment.endTick;
    const scene = document.scenes.find((item) => item.id === segment.sceneId);
    if (!scene) throw new RangeError("Escena de actuación inexistente");
    for (const slot of scene.slots) {
      const pattern = document.patterns.find((item) => item.id === slot.patternId);
      if (!pattern) throw new RangeError("Fuente de escena inexistente");
      const trackCoverage = covered.get(slot.trackId) ?? [];
      trackCoverage.push({ startTick: segment.startTick, endTick: segment.endTick });
      covered.set(slot.trackId, trackCoverage);
      added.push({ id: crypto.randomUUID(), kind: "pattern", trackId: slot.trackId,
        sourceId: pattern.id, sourceVersion: pattern.version, startTick: segment.startTick,
        lengthTicks: segment.endTick - segment.startTick, sourceOffsetTick: 0,
        loopMode: "loop", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false });
    }
  }
  const retained: ProjectClip[] = [];
  const survivingSpans = new Map<string, { readonly id: string;
    readonly sourceStartTick: number; readonly lengthTicks: number }[]>();
  for (const clip of document.clips) {
    const coverage = covered.get(clip.trackId);
    if (!coverage?.length) { retained.push(clip); continue; }
    let spans = [{ startTick: clip.startTick, endTick: clip.startTick + clip.lengthTicks }];
    for (const interval of coverage) {
      spans = spans.flatMap((span) => {
        if (interval.endTick <= span.startTick || interval.startTick >= span.endTick) return [span];
        const pieces: typeof spans = [];
        if (span.startTick < interval.startTick) pieces.push({ startTick: span.startTick,
          endTick: interval.startTick });
        if (interval.endTick < span.endTick) pieces.push({ startTick: interval.endTick,
          endTick: span.endTick });
        return pieces;
      });
    }
    const spansKept: { id: string; sourceStartTick: number; lengthTicks: number }[] = [];
    const pattern = clip.kind === "pattern" ? document.patterns.find((item) => item.id === clip.sourceId) : null;
    for (const span of spans) {
      if (span.endTick <= span.startTick) continue;
      if (clip.kind === "audio") throw new RangeError("Una escena MIDI no puede recortar audio de otra pista");
      const relative = span.startTick - clip.startTick;
      const offset = clip.loopMode === "loop" && pattern
        ? (clip.sourceOffsetTick + relative) % pattern.lengthTicks : clip.sourceOffsetTick + relative;
      if (pattern && offset >= pattern.lengthTicks) continue;
      const id = spansKept.length === 0 ? clip.id : crypto.randomUUID();
      retained.push({ ...clip, id, startTick: span.startTick,
        lengthTicks: span.endTick - span.startTick, sourceOffsetTick: offset });
      spansKept.push({ id, sourceStartTick: relative, lengthTicks: span.endTick - span.startTick });
    }
    survivingSpans.set(clip.id, spansKept);
  }
  const automation: ProjectAutomationLane[] = [];
  for (const lane of document.automation) {
    if (lane.target.scope !== "clip" || !lane.target.ownerId ||
        !survivingSpans.has(lane.target.ownerId)) { automation.push(lane); continue; }
    const spans = survivingSpans.get(lane.target.ownerId)!;
    for (const [index, span] of spans.entries()) {
      const points = lane.points.filter((point) => point.tick >= span.sourceStartTick &&
        point.tick < span.sourceStartTick + span.lengthTicks)
        .map((point) => ({ ...point,
          ...(index === 0 ? {} : { id: crypto.randomUUID() }),
          tick: point.tick - span.sourceStartTick }));
      automation.push({ ...lane, id: index === 0 ? lane.id : crypto.randomUUID(),
        target: { ...lane.target, ownerId: span.id }, points });
    }
  }
  return { kind: "replaceArrangement", expected: { clips: document.clips,
    sections: document.sections, automation: document.automation },
  clips: [...retained, ...added], sections: document.sections, automation, at };
}

export function removeArrangementSection(document: ProjectDocumentV1, sectionId: string,
  at = Date.now()): ProjectCommand {
  if (!document.sections.some((section) => section.id === sectionId)) throw new RangeError("Sección inexistente");
  return { kind: "replaceSections", expected: document.sections,
    sections: document.sections.filter((section) => section.id !== sectionId), at };
}
