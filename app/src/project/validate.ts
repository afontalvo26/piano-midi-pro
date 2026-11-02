import { PROJECT_PPQ, PROJECT_SCHEMA_VERSION, type ProjectDocumentV1, type ProjectPattern } from "./model.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";
import { FREEPATS_HANDCLAP_NOTE, FREEPATS_HANDCLAP_VERSION } from "../audio/freePatsHandClap.ts";
import { VIRTUOSITY_CORE_NOTES, VIRTUOSITY_CORE_VERSION } from "../audio/virtuosityCore.ts";
import { TR808_FISCHER_SOURCE_NOTES, TR808_FISCHER_VERSION } from "../audio/tr808FischerCore.ts";
import { drumRackCycleTicks } from "./drumRack.ts";
import { baseAutomationParameter } from "./automationParameters.ts";
import { numericProjectEffectParameter, projectEffectParameters } from "./effectParameters.ts";

type JsonObject = Record<string, unknown>;

function invalid(path: string, reason: string): never {
  throw new RangeError(`Proyecto inválido en ${path}: ${reason}`);
}

function object(value: unknown, path: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(path, "se esperaba un objeto");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(path, "objeto no serializable");
  return value as JsonObject;
}

function array(value: unknown, path: string, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid(path, `se esperaba una lista de máximo ${max} elementos`);
  return value;
}

function text(value: unknown, path: string, max = 128): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value.trim() !== value) {
    invalid(path, `texto obligatorio de máximo ${max} caracteres sin espacios exteriores`);
  }
  return value;
}

function id(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) invalid(path, "identificador no seguro");
  return result;
}

function integer(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    invalid(path, `entero fuera de ${min}..${max}`);
  }
  return value as number;
}

function finite(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    invalid(path, `número fuera de ${min}..${max}`);
  }
  return value;
}

function boolean(value: unknown, path: string): void {
  if (typeof value !== "boolean") invalid(path, "se esperaba un booleano");
}

function oneOf(value: unknown, path: string, allowed: readonly string[]): void {
  if (typeof value !== "string" || !allowed.includes(value)) invalid(path, `valor no permitido: ${String(value)}`);
}

function uniqueId(value: unknown, path: string, allIds: Set<string>): void {
  const key = id(value, path);
  if (allIds.has(key)) invalid(path, `identificador duplicado ${key}`);
  allIds.add(key);
}

/** Reject values JSON would silently change, including NaN, undefined and cycles. */
function assertPlainJson(value: unknown): void {
  const active = new Set<object>();
  let visited = 0;
  const visit = (item: unknown, depth: number): void => {
    if (++visited > 3_000_000 || depth > 64) invalid("documento", "límite de tamaño o profundidad excedido");
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object") invalid("documento", "valor no serializable como JSON");
    if (active.has(item)) invalid("documento", "referencia circular");
    active.add(item);
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry, depth + 1);
    } else {
      for (const [key, entry] of Object.entries(object(item, "documento"))) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") invalid("documento", "clave reservada");
        visit(entry, depth + 1);
      }
    }
    active.delete(item);
  };
  visit(value, 0);
};

function validateTempoMap(value: unknown): void {
  const points = array(value, "tempoMap", 100_000);
  if (points.length === 0) invalid("tempoMap", "falta el punto inicial");
  let previous = -1;
  points.forEach((entry, index) => {
    const point = object(entry, `tempoMap[${index}]`);
    const tick = integer(point.tick, `tempoMap[${index}].tick`, 0);
    if (tick <= previous || (index === 0 && tick !== 0)) invalid("tempoMap", "ticks no ordenados o sin punto en cero");
    integer(point.microsPerQuarter, `tempoMap[${index}].microsPerQuarter`, 60_000, 6_000_000);
    previous = tick;
  });
}

function validateMeterMap(value: unknown): void {
  const points = array(value, "meterMap", 100_000);
  if (points.length === 0) invalid("meterMap", "falta el punto inicial");
  let previous = -1;
  points.forEach((entry, index) => {
    const point = object(entry, `meterMap[${index}]`);
    const tick = integer(point.tick, `meterMap[${index}].tick`, 0);
    if (tick <= previous || (index === 0 && tick !== 0)) invalid("meterMap", "ticks no ordenados o sin punto en cero");
    integer(point.numerator, `meterMap[${index}].numerator`, 1, 32);
    const denominator = integer(point.denominator, `meterMap[${index}].denominator`, 1, 64);
    if ((denominator & (denominator - 1)) !== 0) invalid("meterMap", "denominador no es potencia de dos");
    previous = tick;
  });
}

function validateEffects(value: unknown, path: string, allIds: Set<string>): void {
  array(value, path, 128).forEach((entry, index) => {
    const effectPath = `${path}[${index}]`;
    const effect = object(entry, effectPath);
    uniqueId(effect.id, `${effectPath}.id`, allIds);
    text(effect.kind, `${effectPath}.kind`);
    boolean(effect.enabled, `${effectPath}.enabled`);
    const parameters = object(effect.parameters, `${effectPath}.parameters`);
    if (Object.keys(parameters).length > 128) invalid(`${effectPath}.parameters`, "demasiados parámetros");
    for (const [key, parameter] of Object.entries(parameters)) {
      id(key, `${effectPath}.parameters key`);
      if (typeof parameter === "number") finite(parameter, `${effectPath}.parameters.${key}`, -1e12, 1e12);
      else if (typeof parameter === "string") text(parameter, `${effectPath}.parameters.${key}`, 256);
      else boolean(parameter, `${effectPath}.parameters.${key}`);
    }
    const descriptors = projectEffectParameters(effect.kind as string);
    if (descriptors) {
      const keys = new Set(descriptors.map((descriptor) => descriptor.parameterId));
      if (Object.keys(parameters).length !== keys.size ||
          Object.keys(parameters).some((key) => !keys.has(key))) {
        invalid(`${effectPath}.parameters`, "parámetros no coinciden con catálogo MIX-02");
      }
      for (const descriptor of descriptors) {
        const parameterPath = `${effectPath}.parameters.${descriptor.parameterId}`;
        const parameter = parameters[descriptor.parameterId];
        if (descriptor.valueType === "number") {
          finite(parameter, parameterPath, descriptor.min, descriptor.max);
        } else oneOf(parameter, parameterPath, descriptor.values);
      }
      if (effect.kind === "eq3" &&
          (parameters.lowHz as number) >= (parameters.highHz as number)) {
        invalid(`${effectPath}.parameters`, "cruces EQ invertidos");
      }
    }
  });
}

function validateNotes(value: unknown, path: string, lengthTicks: number, allIds: Set<string>): void {
  array(value, path, 1_000_000).forEach((entry, index) => {
    const notePath = `${path}[${index}]`;
    const note = object(entry, notePath);
    uniqueId(note.id, `${notePath}.id`, allIds);
    const start = integer(note.startTick, `${notePath}.startTick`, 0);
    const duration = integer(note.durationTick, `${notePath}.durationTick`, 1);
    if (start >= lengthTicks || start + duration > Number.MAX_SAFE_INTEGER) invalid(notePath, "nota fuera del rango seguro");
    integer(note.pitch, `${notePath}.pitch`, 0, 127);
    integer(note.velocity, `${notePath}.velocity`, 1, 127);
    integer(note.releaseVelocity, `${notePath}.releaseVelocity`, 0, 127);
    integer(note.channel, `${notePath}.channel`, 0, 15);
    const origin = object(note.origin, `${notePath}.origin`);
    oneOf(origin.kind, `${notePath}.origin.kind`, ["drawn", "captured", "imported"]);
    if (origin.sourceTakeId !== undefined) id(origin.sourceTakeId, `${notePath}.origin.sourceTakeId`);
    for (const field of ["sourcePitch", "playedPitch"] as const) {
      if (origin[field] !== undefined) integer(origin[field], `${notePath}.origin.${field}`, 0, 127);
    }
    if (origin.inputId !== undefined) text(origin.inputId, `${notePath}.origin.inputId`, 256);
    if (origin.sourceChannel !== undefined) integer(origin.sourceChannel, `${notePath}.origin.sourceChannel`, 0, 15);
    if (origin.sourceTrackIndex !== undefined) integer(origin.sourceTrackIndex, `${notePath}.origin.sourceTrackIndex`, 0);
    if (origin.sourcePpq !== undefined) integer(origin.sourcePpq, `${notePath}.origin.sourcePpq`, 1, 0x7fff);
    if (origin.sourceStartTick !== undefined) integer(origin.sourceStartTick, `${notePath}.origin.sourceStartTick`, 0);
    if (origin.sourceDurationTick !== undefined) integer(origin.sourceDurationTick, `${notePath}.origin.sourceDurationTick`, 0);
    if ((origin.importedProjectStartTick === undefined) !==
        (origin.importedProjectDurationTick === undefined)) {
      invalid(`${notePath}.origin`, "restauración de overdub requiere inicio y duración juntos");
    }
    if (origin.importedProjectStartTick !== undefined) {
      if (origin.sourceTakeId === undefined) {
        invalid(`${notePath}.origin.sourceTakeId`, "restauración de overdub requiere toma de origen");
      }
      const importedStart = integer(origin.importedProjectStartTick,
        `${notePath}.origin.importedProjectStartTick`, 0);
      const importedDuration = integer(origin.importedProjectDurationTick,
        `${notePath}.origin.importedProjectDurationTick`, 1);
      if (importedStart + importedDuration > Number.MAX_SAFE_INTEGER) {
        invalid(`${notePath}.origin`, "anclas de overdub fuera del rango seguro");
      }
    }
    if (origin.sourceSequence !== undefined) integer(origin.sourceSequence, `${notePath}.origin.sourceSequence`, 0);
    if (origin.captureStartMs !== undefined) finite(origin.captureStartMs, `${notePath}.origin.captureStartMs`, 0, 8.64e15);
    if (origin.captureDurationMs !== undefined) finite(origin.captureDurationMs, `${notePath}.origin.captureDurationMs`, 0, 8.64e15);
    if (origin.originalVelocity !== undefined) integer(origin.originalVelocity, `${notePath}.origin.originalVelocity`, 1, 127);
    if (note.microOffsetTick !== undefined) {
      const offset = integer(note.microOffsetTick, `${notePath}.microOffsetTick`, -Number.MAX_SAFE_INTEGER);
      if (start + offset < 0 || start + offset > Number.MAX_SAFE_INTEGER) invalid(notePath, "microdesplazamiento fuera del rango seguro");
    }
    if (note.probability !== undefined) finite(note.probability, `${notePath}.probability`, 0, 1);
    if (note.ratchetCount !== undefined) integer(note.ratchetCount, `${notePath}.ratchetCount`, 1, 64);
    if (note.stepId !== undefined) id(note.stepId, `${notePath}.stepId`);
    if (note.muted !== undefined) boolean(note.muted, `${notePath}.muted`);
  });
}

function validateExpression(value: unknown, path: string, lengthTicks: number, allIds: Set<string>): void {
  array(value, path, 1_000_000).forEach((entry, index) => {
    const eventPath = `${path}[${index}]`;
    const event = object(entry, eventPath);
    uniqueId(event.id, `${eventPath}.id`, allIds);
    const tick = integer(event.tick, `${eventPath}.tick`, 0);
    if (tick >= lengthTicks) invalid(eventPath, "evento fuera del patrón");
    integer(event.channel, `${eventPath}.channel`, 0, 15);
    integer(event.sequence, `${eventPath}.sequence`, 0);
    if (event.sourceTakeId !== undefined) id(event.sourceTakeId, `${eventPath}.sourceTakeId`);
    if (event.sourcePpq !== undefined) integer(event.sourcePpq, `${eventPath}.sourcePpq`, 1, 0x7fff);
    if (event.sourceTick !== undefined) integer(event.sourceTick, `${eventPath}.sourceTick`, 0);
    if (event.sourceTrackIndex !== undefined) integer(event.sourceTrackIndex, `${eventPath}.sourceTrackIndex`, 0);
    switch (event.kind) {
      case "cc":
        integer(event.controller, `${eventPath}.controller`, 0, 127);
        integer(event.value, `${eventPath}.value`, 0, 127);
        break;
      case "pitchBend": integer(event.value14, `${eventPath}.value14`, 0, 16383); break;
      case "polyPressure":
        integer(event.pitch, `${eventPath}.pitch`, 0, 127);
        integer(event.pressure, `${eventPath}.pressure`, 0, 127);
        break;
      case "channelPressure": integer(event.pressure, `${eventPath}.pressure`, 0, 127); break;
      case "programChange": integer(event.program, `${eventPath}.program`, 0, 127); break;
      default: invalid(`${eventPath}.kind`, "evento MIDI desconocido");
    }
  });
}

function projectEntityIds(document: ProjectDocumentV1): Set<string> {
  const ids = new Set<string>([document.id]);
  for (const track of document.tracks) {
    ids.add(track.id);
    for (const send of track.mix.sends) ids.add(send.id);
    for (const effect of track.mix.effects) ids.add(effect.id);
    for (const pad of track.drumRack?.pads ?? []) ids.add(pad.id);
  }
  for (const effect of document.mix.masterEffects) ids.add(effect.id);
  for (const pattern of document.patterns) {
    ids.add(pattern.id);
    for (const note of pattern.notes) ids.add(note.id);
    for (const event of pattern.expression) ids.add(event.id);
  }
  for (const clip of document.clips) ids.add(clip.id);
  for (const fade of document.audioCrossfades ?? []) ids.add(fade.id);
  for (const scene of document.scenes) {
    ids.add(scene.id);
    for (const slot of scene.slots) ids.add(slot.id);
  }
  for (const section of document.sections) ids.add(section.id);
  for (const asset of document.assets) ids.add(asset.id);
  for (const take of document.takes) ids.add(take.id);
  for (const lane of document.automation) {
    ids.add(lane.id);
    for (const point of lane.points) ids.add(point.id);
  }
  return ids;
}

function collectFocusedChanges<T extends { readonly id: string }>(before: readonly T[], after: readonly T[],
  changed: T[], added: T[], sameProvenance: (original: T, edited: T) => boolean): boolean {
  if (before.length === after.length || after.length > before.length) {
    for (let index = 0; index < before.length; index++) {
      if (before[index]!.id !== after[index]?.id) return false;
      if (before[index] !== after[index]) {
        if (!sameProvenance(before[index]!, after[index]!)) return false;
        changed.push(after[index]!);
      }
    }
    added.push(...after.slice(before.length));
    return true;
  }
  let beforeIndex = 0;
  for (const item of after) {
    while (beforeIndex < before.length && before[beforeIndex]!.id !== item.id) beforeIndex++;
    if (beforeIndex === before.length) return false;
    if (before[beforeIndex] !== item) {
      if (!sameProvenance(before[beforeIndex]!, item)) return false;
      changed.push(item);
    }
    beforeIndex++;
  }
  return true;
}

/** Focused check for trusted structural edits; untrusted callers still run full-document validation. */
export function validateFocusedPatternEdit(previous: ProjectPattern, next: ProjectPattern,
  snapshot?: ProjectDocumentV1): boolean {
  const fields = ["id", "name", "version", "lengthTicks", "notes", "expression"];
  if (Object.keys(next).length !== fields.length || fields.some((field) => !Object.hasOwn(next, field)) ||
      !Number.isSafeInteger(next.version) || next.version < 1) return false;
  if (previous.id !== next.id || previous.name !== next.name || previous.lengthTicks !== next.lengthTicks ||
      Math.abs(previous.version - next.version) !== 1 || !Array.isArray(next.notes) ||
      !Array.isArray(next.expression)) return false;
  const changedNotes: ProjectPattern["notes"][number][] = [];
  const addedNotes: ProjectPattern["notes"][number][] = [];
  if (!collectFocusedChanges(previous.notes, next.notes, changedNotes, addedNotes,
    (before, after) => before.origin.sourceTakeId === after.origin?.sourceTakeId)) return false;
  const changedExpression: ProjectPattern["expression"][number][] = [];
  const addedExpression: ProjectPattern["expression"][number][] = [];
  if (!collectFocusedChanges(previous.expression, next.expression,
    changedExpression, addedExpression,
    (before, after) => before.sourceTakeId === after.sourceTakeId)) return false;
  if ((addedNotes.length > 0 || addedExpression.length > 0) && !snapshot) return false;
  if (snapshot) {
    const takeIds = new Set(snapshot.takes.filter((take) => take.kind === "midi").map((take) => take.id));
    if (addedNotes.some((note) => note.origin?.sourceTakeId !== undefined &&
        !takeIds.has(note.origin.sourceTakeId)) ||
        addedExpression.some((event) => event.sourceTakeId !== undefined &&
          !takeIds.has(event.sourceTakeId))) return false;
  }
  assertPlainJson(changedNotes);
  validateNotes(changedNotes, "pattern.notes", next.lengthTicks, new Set<string>());
  assertPlainJson(changedExpression);
  validateExpression(changedExpression, "pattern.expression", next.lengthTicks, new Set<string>());
  if (snapshot && (addedNotes.length > 0 || addedExpression.length > 0)) {
    const allIds = projectEntityIds(snapshot);
    assertPlainJson(addedNotes);
    validateNotes(addedNotes, "pattern.notes", next.lengthTicks, allIds);
    assertPlainJson(addedExpression);
    validateExpression(addedExpression, "pattern.expression", next.lengthTicks, allIds);
  }
  return true;
}

/** A small gesture cannot bypass drum-pad routing and per-pad base-cycle limits. */
export function validateFocusedDrumRackPatternEdit(document: ProjectDocumentV1,
  previous: ProjectPattern, next: ProjectPattern): void {
  const trackIds = new Set<string>();
  for (const clip of document.clips) {
    if (clip.kind === "pattern" && clip.sourceId === next.id) trackIds.add(clip.trackId);
  }
  for (const scene of document.scenes) {
    for (const slot of scene.slots) {
      if (slot.patternId === next.id) trackIds.add(slot.trackId);
    }
  }
  for (const track of document.tracks) {
    if (!trackIds.has(track.id) || !track.drumRack) continue;
    if (next.lengthTicks !== drumRackCycleTicks(track.drumRack)) {
      invalid(`patterns.${next.id}.lengthTicks`, "patrón del rack debe durar su ciclo común exacto");
    }
    const pads = new Map(track.drumRack.pads.map((pad) => [`${pad.channel}:${pad.midiNote}`, pad]));
    for (let index = 0; index < next.notes.length; index++) {
      const note = next.notes[index]!;
      if (note === previous.notes[index]) continue;
      const pad = pads.get(`${note.channel}:${note.pitch}`);
      if (!pad || note.startTick >= pad.stepTicks * pad.stepCount) {
        invalid(`patterns.${next.id}.notes[${index}]`, "golpe sin pad o fuera de su vuelta base");
      }
    }
  }
}

function validateTracks(value: unknown, allIds: Set<string>): Map<string, JsonObject> {
  const tracks = new Map<string, JsonObject>();
  array(value, "tracks", 512).forEach((entry, index) => {
    const path = `tracks[${index}]`;
    const track = object(entry, path);
    uniqueId(track.id, `${path}.id`, allIds);
    const trackId = track.id as string;
    text(track.name, `${path}.name`, 100);
    oneOf(track.kind, `${path}.kind`, ["instrument", "drum", "audio", "bus"]);
    if (track.drumRack !== undefined && track.kind !== "drum") {
      invalid(`${path}.drumRack`, "sólo una pista de batería puede tener rack");
    }
    if (track.instrument !== undefined) {
      if (track.kind === "audio" || track.kind === "bus") invalid(`${path}.instrument`, "esta pista no usa instrumento");
      const instrument = object(track.instrument, `${path}.instrument`);
      id(instrument.instrumentId, `${path}.instrument.instrumentId`);
      text(instrument.packageVersion, `${path}.instrument.packageVersion`);
      id(instrument.presetId, `${path}.instrument.presetId`);
      if (instrument.sampleVoice !== undefined) {
        if (instrument.instrumentId !== "user-sampler") {
          invalid(`${path}.instrument.sampleVoice`, "política de voz sólo para sampler propio");
        }
        const voice = object(instrument.sampleVoice, `${path}.instrument.sampleVoice`);
        oneOf(voice.mode, `${path}.instrument.sampleVoice.mode`, ["poly", "mono"]);
        oneOf(voice.retrigger, `${path}.instrument.sampleVoice.retrigger`, ["always", "legato"]);
        finite(voice.glideMs, `${path}.instrument.sampleVoice.glideMs`, 0, 2000);
        finite(voice.attackMs, `${path}.instrument.sampleVoice.attackMs`, 0, 5000);
        finite(voice.releaseMs, `${path}.instrument.sampleVoice.releaseMs`, 0, 5000);
        if (voice.saturation !== undefined) {
          finite(voice.saturation, `${path}.instrument.sampleVoice.saturation`, 0, 1);
        }
        if (voice.subGainDb !== undefined) {
          finite(voice.subGainDb, `${path}.instrument.sampleVoice.subGainDb`, -36, 0);
        }
        if (voice.mode === "poly" && (voice.retrigger !== "always" || voice.glideMs !== 0 ||
            (voice.saturation as number | undefined) !== undefined ||
            (voice.subGainDb as number | undefined) !== undefined)) {
          invalid(`${path}.instrument.sampleVoice`,
            "polifonía requiere retrigger always, glide cero y procesamiento mono desactivado");
        }
        if (voice.retrigger === "legato" && (voice.mode !== "mono" ||
            instrument.sampleRegion === undefined)) {
          invalid(`${path}.instrument.sampleVoice`, "legato requiere mono y región gate con loop");
        }
      }
      if (instrument.sampleRegion !== undefined) {
        if (instrument.instrumentId !== "user-sampler") invalid(`${path}.instrument.sampleRegion`, "región sólo para sampler propio");
        const region = object(instrument.sampleRegion, `${path}.instrument.sampleRegion`);
        const first = integer(region.startFrame, `${path}.instrument.sampleRegion.startFrame`, 0);
        const last = integer(region.endFrame, `${path}.instrument.sampleRegion.endFrame`, first + 1);
        const fadeIn = integer(region.fadeInFrames, `${path}.instrument.sampleRegion.fadeInFrames`, 0);
        const fadeOut = integer(region.fadeOutFrames, `${path}.instrument.sampleRegion.fadeOutFrames`, 0);
        if (fadeIn + fadeOut > last - first) invalid(`${path}.instrument.sampleRegion`, "fades exceden región");
        integer(region.rootMidi, `${path}.instrument.sampleRegion.rootMidi`, 0, 127);
        finite(region.cents, `${path}.instrument.sampleRegion.cents`, -2400, 2400);
        boolean(region.reverse, `${path}.instrument.sampleRegion.reverse`);
        oneOf(region.loopMode, `${path}.instrument.sampleRegion.loopMode`, ["none", "loop"]);
        oneOf(region.playMode, `${path}.instrument.sampleRegion.playMode`, ["oneShot", "gate"]);
        if (region.loopMode === "loop" && region.playMode !== "gate") {
          invalid(`${path}.instrument.sampleRegion`, "un loop requiere voz gate con Note Off");
        }
        if (instrument.sampleVoice !== undefined) {
          const voice = object(instrument.sampleVoice, `${path}.instrument.sampleVoice`);
          if (voice.retrigger === "legato" &&
              (region.playMode !== "gate" || region.loopMode !== "loop")) {
            invalid(`${path}.instrument.sampleVoice`, "legato requiere región gate con loop");
          }
        }
      }
    }
    const mix = object(track.mix, `${path}.mix`);
    finite(mix.gainDb, `${path}.mix.gainDb`, -120, 24);
    finite(mix.pan, `${path}.mix.pan`, -1, 1);
    for (const field of ["mute", "solo", "armed"] as const) boolean(mix[field], `${path}.mix.${field}`);
    if (mix.outputBusTrackId !== undefined) id(mix.outputBusTrackId, `${path}.mix.outputBusTrackId`);
    if (mix.sidechain !== undefined) {
      if (track.kind === "bus") invalid(`${path}.mix.sidechain`, "un bus no puede ser destino sidechain");
      const sidechain = object(mix.sidechain, `${path}.mix.sidechain`);
      id(sidechain.sourceTrackId, `${path}.mix.sidechain.sourceTrackId`);
      finite(sidechain.thresholdDb, `${path}.mix.sidechain.thresholdDb`, -60, 0);
      finite(sidechain.ratio, `${path}.mix.sidechain.ratio`, 1, 20);
      finite(sidechain.attackMs, `${path}.mix.sidechain.attackMs`, 0.1, 250);
      finite(sidechain.releaseMs, `${path}.mix.sidechain.releaseMs`, 1, 2000);
      if (sidechain.lookaheadMs !== undefined) {
        finite(sidechain.lookaheadMs, `${path}.mix.sidechain.lookaheadMs`, 0, 50);
      }
      finite(sidechain.maxReductionDb, `${path}.mix.sidechain.maxReductionDb`, 0, 36);
    }
    array(mix.sends, `${path}.mix.sends`, 128).forEach((sendValue, sendIndex) => {
      const sendPath = `${path}.mix.sends[${sendIndex}]`;
      const send = object(sendValue, sendPath);
      uniqueId(send.id, `${sendPath}.id`, allIds);
      id(send.busTrackId, `${sendPath}.busTrackId`);
      finite(send.gainDb, `${sendPath}.gainDb`, -120, 24);
    });
    validateEffects(mix.effects, `${path}.mix.effects`, allIds);
    tracks.set(trackId, track);
  });
  return tracks;
}

function validatePatterns(value: unknown, allIds: Set<string>): Map<string, JsonObject> {
  const patterns = new Map<string, JsonObject>();
  array(value, "patterns", 100_000).forEach((entry, index) => {
    const path = `patterns[${index}]`;
    const pattern = object(entry, path);
    uniqueId(pattern.id, `${path}.id`, allIds);
    text(pattern.name, `${path}.name`, 100);
    integer(pattern.version, `${path}.version`, 1);
    const length = integer(pattern.lengthTicks, `${path}.lengthTicks`, 1);
    validateNotes(pattern.notes, `${path}.notes`, length, allIds);
    validateExpression(pattern.expression, `${path}.expression`, length, allIds);
    patterns.set(pattern.id as string, pattern);
  });
  return patterns;
}

export function validateStandalonePattern(value: unknown): asserts value is ProjectPattern {
  assertPlainJson(value);
  validatePatterns([value], new Set<string>());
}

function validateAssets(value: unknown, allIds: Set<string>): Map<string, JsonObject> {
  const assets = new Map<string, JsonObject>();
  array(value, "assets", 100_000).forEach((entry, index) => {
    const path = `assets[${index}]`;
    const asset = object(entry, path);
    uniqueId(asset.id, `${path}.id`, allIds);
    if (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(asset.sha256)) invalid(`${path}.sha256`, "SHA-256 inválido");
    integer(asset.byteLength, `${path}.byteLength`, 1);
    text(asset.mimeType, `${path}.mimeType`, 128);
    oneOf(asset.sourceKind, `${path}.sourceKind`, ["official", "user", "recorded"]);
    text(asset.license, `${path}.license`, 256);
    if (asset.creator !== undefined) text(asset.creator, `${path}.creator`, 256);
    if (asset.sourceUrl !== undefined) text(asset.sourceUrl, `${path}.sourceUrl`, 2048);
    if (asset.packageVersion !== undefined) text(asset.packageVersion, `${path}.packageVersion`);
    if (asset.sourceKind === "official" && (!asset.creator || !asset.packageVersion || !asset.sourceUrl)) {
      invalid(path, "un activo oficial requiere creador, versión y fuente");
    }
    if (asset.frameCount !== undefined) integer(asset.frameCount, `${path}.frameCount`, 1);
    if (asset.sampleRate !== undefined) integer(asset.sampleRate, `${path}.sampleRate`, 1, 384_000);
    if (asset.channelCount !== undefined) integer(asset.channelCount, `${path}.channelCount`, 1, 32);
    assets.set(asset.id as string, asset);
  });
  return assets;
}

function validateDrumRacks(tracks: Map<string, JsonObject>, assets: Map<string, JsonObject>,
  allIds: Set<string>): void {
  for (const [trackId, track] of tracks) {
    if (track.drumRack === undefined) continue;
    const path = `tracks.${trackId}.drumRack`;
    const rack = object(track.drumRack, path);
    const pads = array(rack.pads, `${path}.pads`, 16);
    if (pads.length !== 16) invalid(`${path}.pads`, "el rack requiere exactamente 16 pads");
    const triggers = new Set<string>();
    pads.forEach((entry, index) => {
      const padPath = `${path}.pads[${index}]`;
      const pad = object(entry, padPath);
      uniqueId(pad.id, `${padPath}.id`, allIds);
      text(pad.name, `${padPath}.name`, 80);
      if (typeof pad.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(pad.color)) {
        invalid(`${padPath}.color`, "color hexadecimal inválido");
      }
      const note = integer(pad.midiNote, `${padPath}.midiNote`, 0, 127);
      const channel = integer(pad.channel, `${padPath}.channel`, 0, 15);
      const trigger = `${channel}:${note}`;
      if (triggers.has(trigger)) invalid(padPath, "nota/canal de disparo duplicados");
      triggers.add(trigger);
      finite(pad.gainDb, `${padPath}.gainDb`, -120, 24);
      finite(pad.pan, `${padPath}.pan`, -1, 1);
      finite(pad.pitchSemitones, `${padPath}.pitchSemitones`, -24, 24);
      const first = integer(pad.startFrame, `${padPath}.startFrame`, 0);
      const last = pad.endFrame === undefined ? undefined :
        integer(pad.endFrame, `${padPath}.endFrame`, first + 1);
      finite(pad.attackMs, `${padPath}.attackMs`, 0, 10_000);
      finite(pad.decayMs, `${padPath}.decayMs`, 0, 10_000);
      oneOf(pad.playMode, `${padPath}.playMode`, ["oneShot", "gate"]);
      boolean(pad.mute, `${padPath}.mute`);
      boolean(pad.solo, `${padPath}.solo`);
      if (pad.chokeGroup !== undefined) id(pad.chokeGroup, `${padPath}.chokeGroup`);
      integer(pad.stepTicks, `${padPath}.stepTicks`, 1, 15_360);
      integer(pad.stepCount, `${padPath}.stepCount`, 1, 128);
      if (pad.source === null) return;
      const source = object(pad.source, `${padPath}.source`);
      if (source.kind === "asset") {
        const assetId = id(source.assetId, `${padPath}.source.assetId`);
        const asset = assets.get(assetId);
        if (!asset || (asset.sourceKind !== "user" && asset.sourceKind !== "recorded") ||
            source.sha256 !== asset.sha256) {
          invalid(`${padPath}.source`, "muestra propia inexistente o hash distinto");
        }
        if (asset.frameCount !== undefined &&
            (first >= (asset.frameCount as number) || (last !== undefined && last > (asset.frameCount as number)))) {
          invalid(`${padPath}.endFrame`, "región excede la muestra propia");
        }
      } else if (source.kind === "instrument") {
        const ref = object(source.ref, `${padPath}.source.ref`);
        const sourceNote = integer(source.sourceNote, `${padPath}.source.sourceNote`, 0, 127);
        const virtuosity = ref.instrumentId === "virtuosity-core" &&
          ref.packageVersion === VIRTUOSITY_CORE_VERSION && ref.presetId === "core" &&
          Object.hasOwn(VIRTUOSITY_CORE_NOTES, sourceNote);
        const clap = ref.instrumentId === "freepats-handclap" &&
          ref.packageVersion === FREEPATS_HANDCLAP_VERSION && ref.presetId === "core" &&
          sourceNote === FREEPATS_HANDCLAP_NOTE;
        const tr808 = ref.instrumentId === "tr808-fischer-core" &&
          ref.packageVersion === TR808_FISCHER_VERSION && ref.presetId === "core" &&
          Object.hasOwn(TR808_FISCHER_SOURCE_NOTES, sourceNote);
        if ((!virtuosity && !clap && !tr808) || ref.sampleRegion !== undefined || ref.sampleVoice !== undefined) {
          invalid(`${padPath}.source`, "instrumento, versión, preset o pieza no aprobados");
        }
      } else invalid(`${padPath}.source.kind`, "fuente de pad desconocida");
    });
    try { drumRackCycleTicks(rack as unknown as import("./model.ts").ProjectDrumRack); }
    catch (error) { invalid(path, error instanceof Error ? error.message : "ciclo común inválido"); }
  }
}

function validateClips(value: unknown, tracks: Map<string, JsonObject>, patterns: Map<string, JsonObject>,
  assets: Map<string, JsonObject>, allIds: Set<string>, clock: MusicalClock): Map<string, JsonObject> {
  const clips = new Map<string, JsonObject>();
  array(value, "clips", 1_000_000).forEach((entry, index) => {
    const path = `clips[${index}]`;
    const clip = object(entry, path);
    uniqueId(clip.id, `${path}.id`, allIds);
    const trackId = id(clip.trackId, `${path}.trackId`);
    const track = tracks.get(trackId);
    if (!track) invalid(`${path}.trackId`, "pista inexistente");
    const start = integer(clip.startTick, `${path}.startTick`, 0);
    const length = integer(clip.lengthTicks, `${path}.lengthTicks`, 1);
    if (start + length > Number.MAX_SAFE_INTEGER) invalid(path, "clip fuera del rango seguro");
    integer(clip.sourceOffsetTick, `${path}.sourceOffsetTick`, 0);
    oneOf(clip.loopMode, `${path}.loopMode`, ["none", "loop"]);
    oneOf(clip.tailPolicy, `${path}.tailPolicy`, ["cut", "continue"]);
    integer(clip.transpose, `${path}.transpose`, -127, 127);
    finite(clip.gainDb, `${path}.gainDb`, -120, 24);
    boolean(clip.muted, `${path}.muted`);
    if (clip.groupId !== undefined) id(clip.groupId, `${path}.groupId`);
    const sourceId = id(clip.sourceId, `${path}.sourceId`);
    if (clip.kind === "pattern") {
      if (track.kind !== "instrument" && track.kind !== "drum") invalid(path, "patrón en pista no MIDI");
      const pattern = patterns.get(sourceId);
      if (!pattern) invalid(`${path}.sourceId`, "patrón inexistente");
      if (track.drumRack !== undefined && clip.transpose !== 0) {
        invalid(`${path}.transpose`, "el rack usa el pitch MIDI exacto de cada pad");
      }
      if (clip.sourceOffsetTick as number >= (pattern.lengthTicks as number)) invalid(path, "offset fuera del patrón");
      const sourceVersion = integer(clip.sourceVersion, `${path}.sourceVersion`, 1);
      // Versioned pattern edits must update every shared clip in the same command.
      if (sourceVersion !== pattern.version) invalid(path, "versión de patrón no disponible");
    } else if (clip.kind === "audio") {
      if (track.kind !== "audio") invalid(path, "audio en pista no audio");
      if (clip.sourceTakeId !== undefined) id(clip.sourceTakeId, `${path}.sourceTakeId`);
      if (clip.loopMode !== "none" || clip.sourceOffsetTick !== 0 || clip.transpose !== 0) {
        invalid(path, "clip de audio v1 requiere loop none, offset y transposición cero; recorta con frames");
      }
      const asset = assets.get(sourceId);
      if (!asset) invalid(`${path}.sourceId`, "activo inexistente");
      if (clip.timeMode !== undefined) oneOf(clip.timeMode, `${path}.timeMode`, ["beat", "absolute"]);
      if (clip.timeMode === "absolute") {
        if (typeof asset.mimeType !== "string" || !asset.mimeType.startsWith("audio/") ||
            asset.mimeType === "audio/midi" || asset.sampleRate === undefined || asset.frameCount === undefined) {
          invalid(path, "audio absoluto requiere activo de audio con frames y sample rate verificados");
        }
        const startUs = integer(clip.absoluteStartUs, `${path}.absoluteStartUs`, 0);
        const endUs = integer(clip.absoluteEndUs, `${path}.absoluteEndUs`, startUs + 1);
        const projectedStart = clock.secondsToTick(startUs / 1_000_000);
        const projectedEnd = clock.secondsToTick(endUs / 1_000_000);
        if (start !== projectedStart || start + length !== projectedEnd) {
          invalid(path, "ticks de clip absoluto no coinciden con sus anclas de microsegundos");
        }
      } else if (clip.absoluteStartUs !== undefined || clip.absoluteEndUs !== undefined) {
        invalid(path, "clip beat no puede guardar anclas de tiempo absoluto");
      }
      const first = integer(clip.sourceStartFrame, `${path}.sourceStartFrame`, 0);
      const last = integer(clip.sourceEndFrame, `${path}.sourceEndFrame`, first + 1);
      if (asset.frameCount !== undefined && last > (asset.frameCount as number)) invalid(path, "clip excede los frames del activo");
      if (clip.timeMode === "absolute" &&
          ((clip.absoluteEndUs as number) - (clip.absoluteStartUs as number)) >
            (last - first) * 1_000_000 / (asset.sampleRate as number) +
              1_000_000 / (asset.sampleRate as number)) {
        invalid(path, "clip absoluto dura más que sus frames sin time-stretch");
      }
      const fadeIn = integer(clip.fadeInFrames, `${path}.fadeInFrames`, 0);
      const fadeOut = integer(clip.fadeOutFrames, `${path}.fadeOutFrames`, 0);
      if ((clip.envelopeStartFrame === undefined) !== (clip.envelopeEndFrame === undefined)) {
        invalid(path, "anclas de envolvente incompletas");
      }
      const envelopeStart = clip.envelopeStartFrame === undefined ? first :
        integer(clip.envelopeStartFrame, `${path}.envelopeStartFrame`, 0, first);
      const envelopeEnd = clip.envelopeEndFrame === undefined ? last :
        integer(clip.envelopeEndFrame, `${path}.envelopeEndFrame`, last);
      if (asset.frameCount !== undefined && envelopeEnd > (asset.frameCount as number)) {
        invalid(path, "envolvente excede los frames del activo");
      }
      if (fadeIn + fadeOut > envelopeEnd - envelopeStart) invalid(path, "fades exceden el rango de audio");
    } else invalid(`${path}.kind`, "clip desconocido");
    clips.set(clip.id as string, clip);
  });
  return clips;
}

function validateAudioCrossfades(value: unknown, clips: Map<string, JsonObject>,
  assets: Map<string, JsonObject>, allIds: Set<string>, clock: MusicalClock): void {
  if (value === undefined) return;
  const allAudio = [...clips.values()].filter((clip) => clip.kind === "audio");
  const bounds = (clip: JsonObject): { start: number; end: number } => clip.timeMode === "absolute"
    ? { start: clip.absoluteStartUs as number, end: clip.absoluteEndUs as number }
    : { start: Math.round(clock.tickToSeconds(clip.startTick as number) * 1_000_000),
        end: Math.round(clock.tickToSeconds((clip.startTick as number) +
          (clip.lengthTicks as number)) * 1_000_000) };
  const pairs = new Set<string>();
  const windows = new Map<string, { start: number; end: number }[]>();
  array(value, "audioCrossfades", 100_000).forEach((entry, index) => {
    const path = `audioCrossfades[${index}]`;
    const row = object(entry, path);
    uniqueId(row.id, `${path}.id`, allIds);
    const outgoingId = id(row.outgoingClipId, `${path}.outgoingClipId`);
    const incomingId = id(row.incomingClipId, `${path}.incomingClipId`);
    oneOf(row.curve, `${path}.curve`, ["linear", "equalPower"]);
    const outgoing = clips.get(outgoingId);
    const incoming = clips.get(incomingId);
    if (!outgoing || !incoming || outgoing.kind !== "audio" || incoming.kind !== "audio" ||
        outgoingId === incomingId || outgoing.trackId !== incoming.trackId) {
      invalid(path, "crossfade requiere dos clips de audio de la misma pista");
    }
    for (const clip of [outgoing, incoming]) {
      const asset = assets.get(clip.sourceId as string);
      if (!asset || typeof asset.mimeType !== "string" || !asset.mimeType.startsWith("audio/") ||
          asset.mimeType === "audio/midi" || asset.frameCount === undefined || asset.sampleRate === undefined) {
        invalid(path, "crossfade requiere activos de audio con frames y sample rate verificados");
      }
    }
    const left = bounds(outgoing);
    const right = bounds(incoming);
    if (left.start >= right.start || left.end <= right.start || left.end >= right.end) {
      invalid(path, "crossfade requiere solape saliente a entrante sin invertir orden");
    }
    const start = right.start;
    const end = left.end;
    for (const clip of [outgoing, incoming]) {
      const asset = assets.get(clip.sourceId as string)!;
      const availableEnd = bounds(clip).start + ((clip.sourceEndFrame as number) -
        (clip.sourceStartFrame as number)) * 1_000_000 / (asset.sampleRate as number);
      if (availableEnd + 1_000_000 / (asset.sampleRate as number) < end) {
        invalid(path, "crossfade excede los frames audibles de una fuente");
      }
    }
    const pair = JSON.stringify([outgoingId, incomingId]);
    if (pairs.has(pair)) invalid(path, "crossfade duplicado");
    pairs.add(pair);
    const trackId = outgoing.trackId as string;
    if (allAudio.some((clip) => clip.trackId === trackId && clip.id !== outgoingId &&
        clip.id !== incomingId && bounds(clip).start < end && bounds(clip).end > start)) {
      invalid(path, "tercer clip solapa la ventana de crossfade");
    }
    const trackWindows = windows.get(trackId) ?? [];
    if (trackWindows.some((window) => window.start < end && window.end > start)) {
      invalid(path, "ventanas de crossfade se superponen");
    }
    trackWindows.push({ start, end });
    windows.set(trackId, trackWindows);
  });
}

function validateDrumRackPatterns(tracks: Map<string, JsonObject>, patterns: Map<string, JsonObject>,
  clips: Map<string, JsonObject>, scenes: unknown): void {
  const checked = new Set<string>();
  const check = (trackId: string, patternId: string): void => {
    const track = tracks.get(trackId);
    if (!track || track.drumRack === undefined) return;
    const key = JSON.stringify([trackId, patternId]);
    if (checked.has(key)) return;
    checked.add(key);
    const rack = object(track.drumRack, `tracks.${trackId}.drumRack`);
    const pads = (rack.pads as readonly JsonObject[]);
    const cycle = drumRackCycleTicks(rack as unknown as import("./model.ts").ProjectDrumRack);
    const pattern = patterns.get(patternId)!;
    if (pattern.lengthTicks !== cycle) {
      invalid(`patterns.${patternId}.lengthTicks`, "patrón del rack debe durar su ciclo común exacto");
    }
    const byTrigger = new Map(pads.map((pad) => [`${pad.channel}:${pad.midiNote}`, pad]));
    for (const note of pattern.notes as readonly JsonObject[]) {
      const pad = byTrigger.get(`${note.channel}:${note.pitch}`);
      if (!pad) invalid(`patterns.${patternId}.notes`, "nota sin pad de disparo en el rack");
      if ((note.startTick as number) >= (pad.stepTicks as number) * (pad.stepCount as number)) {
        invalid(`patterns.${patternId}.notes`, "golpe fuera de la vuelta base del pad");
      }
    }
  };
  for (const clip of clips.values()) {
    if (clip.kind === "pattern") check(clip.trackId as string, clip.sourceId as string);
  }
  for (const scene of scenes as readonly JsonObject[]) {
    for (const slot of scene.slots as readonly JsonObject[]) {
      check(slot.trackId as string, slot.patternId as string);
    }
  }
}

function validateScenes(value: unknown, tracks: Map<string, JsonObject>, patterns: Map<string, JsonObject>, allIds: Set<string>): void {
  array(value, "scenes", 100_000).forEach((entry, index) => {
    const path = `scenes[${index}]`;
    const scene = object(entry, path);
    uniqueId(scene.id, `${path}.id`, allIds);
    text(scene.name, `${path}.name`, 100);
    integer(scene.launchQuantizationTicks, `${path}.launchQuantizationTicks`, 0);
    const usedTracks = new Set<string>();
    array(scene.slots, `${path}.slots`, 512).forEach((slotValue, slotIndex) => {
      const slotPath = `${path}.slots[${slotIndex}]`;
      const slot = object(slotValue, slotPath);
      uniqueId(slot.id, `${slotPath}.id`, allIds);
      const trackId = id(slot.trackId, `${slotPath}.trackId`);
      const track = tracks.get(trackId);
      if (!track || (track.kind !== "instrument" && track.kind !== "drum")) invalid(`${slotPath}.trackId`, "pista no MIDI o inexistente");
      if (usedTracks.has(trackId)) invalid(slotPath, "dos patrones lanzados a la misma pista");
      usedTracks.add(trackId);
      if (!patterns.has(id(slot.patternId, `${slotPath}.patternId`))) invalid(`${slotPath}.patternId`, "patrón inexistente");
    });
  });
}

function validateSections(value: unknown, allIds: Set<string>): void {
  let lastEnd = 0;
  array(value, "sections", 100_000).forEach((entry, index) => {
    const path = `sections[${index}]`;
    const section = object(entry, path);
    uniqueId(section.id, `${path}.id`, allIds);
    text(section.name, `${path}.name`, 100);
    const start = integer(section.startTick, `${path}.startTick`, 0);
    const length = integer(section.lengthTicks, `${path}.lengthTicks`, 1);
    if (start < lastEnd || start + length > Number.MAX_SAFE_INTEGER) invalid(path, "sección solapada o fuera del rango seguro");
    lastEnd = start + length;
  });
}

function validateAutomation(value: unknown, tracks: Map<string, JsonObject>, clips: Map<string, JsonObject>,
  masterMix: unknown, allIds: Set<string>): void {
  const destinations = new Set<string>();
  array(value, "automation", 100_000).forEach((entry, index) => {
    const path = `automation[${index}]`;
    const lane = object(entry, path);
    uniqueId(lane.id, `${path}.id`, allIds);
    if (lane.writeMode !== undefined) oneOf(lane.writeMode, `${path}.writeMode`, ["read", "touch"]);
    const target = object(lane.target, `${path}.target`);
    oneOf(target.scope, `${path}.target.scope`, ["master", "track", "clip"]);
    id(target.parameterId, `${path}.target.parameterId`);
    if (target.scope === "master") {
      if (target.ownerId !== undefined) invalid(`${path}.target.ownerId`, "master no tiene ownerId");
    } else {
      const owner = id(target.ownerId, `${path}.target.ownerId`);
      if (target.scope === "track" && !tracks.has(owner)) invalid(`${path}.target.ownerId`, "pista inexistente");
      if (target.scope === "clip" && !clips.has(owner)) invalid(`${path}.target.ownerId`, "clip inexistente");
    }
    const effectId = target.effectId === undefined ? undefined : id(target.effectId, `${path}.target.effectId`);
    const ownerClip = target.scope === "clip" ? clips.get(target.ownerId as string) : undefined;
    const destination = JSON.stringify([target.scope, target.ownerId, effectId, target.parameterId]);
    if (destinations.has(destination)) invalid(path, "dos curvas gobiernan el mismo parámetro");
    destinations.add(destination);
    let valueRange: readonly [number, number] = [-1e12, 1e12];
    if (effectId !== undefined) {
      if (target.scope === "clip") invalid(`${path}.target.effectId`, "un clip no tiene cadena de efectos");
      const mix = target.scope === "master" ? object(masterMix, "mix") :
        object(tracks.get(target.ownerId as string)?.mix, `tracks.${target.ownerId}.mix`);
      const chain = array(target.scope === "master" ? mix.masterEffects : mix.effects,
        `${path}.target.effectId.chain`, 128);
      const effectValue = chain.find((candidate) => object(candidate, "effect").id === effectId);
      if (!effectValue) invalid(`${path}.target.effectId`, "efecto automatizado inexistente");
      const effect = object(effectValue, `${path}.target.effect`);
      const parameters = object(effect.parameters, `${path}.target.effect.parameters`);
      if (typeof parameters[target.parameterId as string] !== "number") {
        invalid(`${path}.target.parameterId`, "la automatización requiere parámetro numérico del efecto");
      }
      const descriptor = numericProjectEffectParameter(effect.kind as string,
        target.parameterId as string);
      if (effect.kind === "saturation" && target.parameterId === "drive") {
        invalid(`${path}.target.parameterId`,
          "drive de saturación reconstruye la curva y no admite automatización continua");
      }
      if (descriptor) valueRange = [descriptor.min, descriptor.max];
      else if (projectEffectParameters(effect.kind as string)) {
        invalid(`${path}.target.parameterId`, "parámetro de efecto no automatizable");
      }
    } else {
      const descriptor = baseAutomationParameter(target as ProjectDocumentV1["automation"][number]["target"]);
      if (descriptor) valueRange = [descriptor.min, descriptor.max];
    }
    let previous = -1;
    array(lane.points, `${path}.points`, 1_000_000).forEach((pointValue, pointIndex) => {
      const pointPath = `${path}.points[${pointIndex}]`;
      const point = object(pointValue, pointPath);
      uniqueId(point.id, `${pointPath}.id`, allIds);
      const tick = integer(point.tick, `${pointPath}.tick`, 0);
      if (tick <= previous) invalid(pointPath, "puntos no ordenados o tick duplicado");
      if (ownerClip && tick >= (ownerClip.lengthTicks as number)) {
        invalid(pointPath, "punto de clip fuera de sus ticks locales");
      }
      previous = tick;
      finite(point.value, `${pointPath}.value`, valueRange[0], valueRange[1]);
      oneOf(point.shape, `${pointPath}.shape`, ["step", "linear", "bezier"]);
      if (point.curve !== undefined) finite(point.curve, `${pointPath}.curve`, -1, 1);
    });
  });
}

function validateRouting(tracks: Map<string, JsonObject>): void {
  const edges = new Map<string, string[]>();
  const sidechainEdges = new Map<string, string>();
  for (const [trackId, track] of tracks) {
    const mix = object(track.mix, `tracks.${trackId}.mix`);
    const destinations: string[] = [];
    if (mix.outputBusTrackId !== undefined) destinations.push(mix.outputBusTrackId as string);
    for (const sendValue of mix.sends as readonly unknown[]) {
      const send = object(sendValue, `tracks.${trackId}.send`);
      destinations.push(send.busTrackId as string);
    }
    for (const destination of destinations) {
      if (tracks.get(destination)?.kind !== "bus") invalid(`tracks.${trackId}.mix`, "bus destino inexistente");
      if (destination === trackId) invalid(`tracks.${trackId}.mix`, "retroalimentación directa");
    }
    if (mix.sidechain !== undefined) {
      const sidechain = object(mix.sidechain, `tracks.${trackId}.mix.sidechain`);
      const sourceTrackId = sidechain.sourceTrackId as string;
      const source = tracks.get(sourceTrackId);
      if (!source || source.kind === "bus") {
        invalid(`tracks.${trackId}.mix.sidechain.sourceTrackId`, "la fuente sidechain debe ser una pista de audio/MIDI existente");
      }
      if (sourceTrackId === trackId) {
        invalid(`tracks.${trackId}.mix.sidechain.sourceTrackId`, "una pista no puede detectarse a sí misma");
      }
      sidechainEdges.set(trackId, sourceTrackId);
    }
    edges.set(trackId, destinations);
  }
  const sidechainVisiting = new Set<string>();
  const sidechainVisited = new Set<string>();
  const visitSidechain = (trackId: string): void => {
    if (sidechainVisiting.has(trackId)) invalid("tracks.mix.sidechain", "ciclo de detectores sidechain");
    if (sidechainVisited.has(trackId)) return;
    sidechainVisiting.add(trackId);
    const source = sidechainEdges.get(trackId);
    if (source) visitSidechain(source);
    sidechainVisiting.delete(trackId);
    sidechainVisited.add(trackId);
  };
  for (const trackId of tracks.keys()) visitSidechain(trackId);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (trackId: string): void => {
    if (visiting.has(trackId)) invalid("tracks.mix", "ciclo de enrutamiento");
    if (visited.has(trackId)) return;
    visiting.add(trackId);
    for (const next of edges.get(trackId) ?? []) visit(next);
    visiting.delete(trackId);
    visited.add(trackId);
  };
  for (const trackId of tracks.keys()) visit(trackId);
}

/** Validate at the boundary before a command, IndexedDB commit or export. */
export function validateProjectDocument(value: unknown): asserts value is ProjectDocumentV1 {
  assertPlainJson(value);
  const document = object(value, "documento");
  id(document.id, "id");
  text(document.name, "name", 100);
  if (document.schemaVersion !== PROJECT_SCHEMA_VERSION) invalid("schemaVersion", "versión no admitida");
  if (document.ppq !== PROJECT_PPQ) invalid("ppq", "resolución musical no admitida");
  const createdAt = integer(document.createdAt, "createdAt", 0, 8.64e15);
  const updatedAt = integer(document.updatedAt, "updatedAt", createdAt, 8.64e15);
  if (updatedAt < createdAt) invalid("updatedAt", "fecha anterior a creación");
  boolean(document.archived, "archived");
  validateTempoMap(document.tempoMap);
  validateMeterMap(document.meterMap);
  const clock = new MusicalClock(document.tempoMap as readonly import("./model.ts").TempoPoint[],
    document.meterMap as readonly import("./model.ts").MeterPoint[]);
  const allIds = new Set<string>([document.id as string]);
  const tracks = validateTracks(document.tracks, allIds);
  const order = array(document.trackOrder, "trackOrder", 512);
  if (order.length !== tracks.size) invalid("trackOrder", "no coincide con las pistas");
  const ordered = new Set<string>();
  order.forEach((entry, index) => {
    const trackId = id(entry, `trackOrder[${index}]`);
    if (!tracks.has(trackId) || ordered.has(trackId)) invalid("trackOrder", "pista inexistente o repetida");
    ordered.add(trackId);
  });
  const patterns = validatePatterns(document.patterns, allIds);
  const assets = validateAssets(document.assets, allIds);
  validateDrumRacks(tracks, assets, allIds);
  for (const [trackId, track] of tracks) {
    if (track.instrument === undefined) continue;
    const instrument = object(track.instrument, `tracks.${trackId}.instrument`);
    if (instrument.instrumentId !== "user-sampler") continue;
    const preset = id(instrument.presetId, `tracks.${trackId}.instrument.presetId`);
    if (!preset.startsWith("asset:") || preset.length <= 6) {
      invalid(`tracks.${trackId}.instrument.presetId`, "sampler requiere preset asset:<id>");
    }
    const asset = assets.get(preset.slice(6));
    if (!asset || (asset.sourceKind !== "user" && asset.sourceKind !== "recorded") ||
        instrument.packageVersion !== `sha256:${(asset.sha256 as string).toLowerCase()}`) {
      invalid(`tracks.${trackId}.instrument`, "el sampler no coincide con un activo propio verificado");
    }
    if (instrument.sampleRegion !== undefined && asset.frameCount !== undefined) {
      const region = object(instrument.sampleRegion, `tracks.${trackId}.instrument.sampleRegion`);
      if ((region.endFrame as number) > (asset.frameCount as number)) {
        invalid(`tracks.${trackId}.instrument.sampleRegion.endFrame`, "región excede frames del activo");
      }
    }
  }
  const clips = validateClips(document.clips, tracks, patterns, assets, allIds, clock);
  validateAudioCrossfades(document.audioCrossfades, clips, assets, allIds, clock);
  validateScenes(document.scenes, tracks, patterns, allIds);
  validateDrumRackPatterns(tracks, patterns, clips, document.scenes);
  validateSections(document.sections, allIds);
  array(document.takes, "takes", 100_000).forEach((entry, index) => {
    const path = `takes[${index}]`;
    const take = object(entry, path);
    uniqueId(take.id, `${path}.id`, allIds);
    oneOf(take.kind, `${path}.kind`, ["midi", "audio"]);
    integer(take.createdAt, `${path}.createdAt`, 0, 8.64e15);
    if (take.kind === "midi") {
      id(take.recordingId, `${path}.recordingId`);
      if (take.assetId !== undefined) {
        if (take.midiImport === undefined) invalid(`${path}.midiImport`, "SMF portable requiere metadatos originales");
        const asset = assets.get(id(take.assetId, `${path}.assetId`));
        if (!asset || asset.sourceKind !== "recorded" || asset.mimeType !== "audio/midi") {
          invalid(`${path}.assetId`, "SMF original requiere activo grabado audio/midi");
        }
      }
    } else if (!assets.has(id(take.assetId, `${path}.assetId`))) invalid(`${path}.assetId`, "activo de audio inexistente");
    if (take.audioCapture !== undefined) {
      if (take.kind !== "audio") invalid(`${path}.audioCapture`, "sólo una toma de audio tiene metadatos de captura");
      if (take.audioResample !== undefined) invalid(path, "captura de micrófono y resampling son orígenes excluyentes");
      const capture = object(take.audioCapture, `${path}.audioCapture`);
      integer(capture.startTick, `${path}.audioCapture.startTick`, 0);
      if (capture.startProjectUs !== undefined) {
        // startTick records the original clock; later tempo edits must not rewrite take provenance.
        integer(capture.startProjectUs, `${path}.audioCapture.startProjectUs`, 0);
      }
      finite(capture.startAudioTime, `${path}.audioCapture.startAudioTime`, 0, 8.64e12);
      const frames = integer(capture.frameCount, `${path}.audioCapture.frameCount`, 1);
      const rate = integer(capture.sampleRate, `${path}.audioCapture.sampleRate`, 8_000, 384_000);
      const channels = integer(capture.channelCount, `${path}.audioCapture.channelCount`, 1, 32);
      if (capture.deviceId !== undefined) text(capture.deviceId, `${path}.audioCapture.deviceId`, 256);
      integer(capture.latencyOffsetFrames, `${path}.audioCapture.latencyOffsetFrames`, -2 * rate, 2 * rate);
      if (capture.capturedLatencyOffsetFrames !== undefined) {
        integer(capture.capturedLatencyOffsetFrames,
          `${path}.audioCapture.capturedLatencyOffsetFrames`, -2 * rate, 2 * rate);
      }
      if (capture.punch !== undefined) {
        const punch = object(capture.punch, `${path}.audioCapture.punch`);
        const punchStart = integer(punch.startTick, `${path}.audioCapture.punch.startTick`, 0);
        integer(punch.endTick, `${path}.audioCapture.punch.endTick`, punchStart + 1);
        if (punchStart !== capture.startTick) invalid(`${path}.audioCapture.punch`, "entrada punch no coincide con inicio capturado");
        const startTime = finite(punch.startAudioTime, `${path}.audioCapture.punch.startAudioTime`, 0, 8.64e12);
        const endTime = finite(punch.endAudioTime, `${path}.audioCapture.punch.endAudioTime`, startTime, 8.64e12);
        if (endTime <= startTime || endTime - startTime > 60) {
          invalid(`${path}.audioCapture.punch`, "ventana punch fuera de 60 segundos");
        }
      }
      boolean(capture.incomplete, `${path}.audioCapture.incomplete`);
      if (capture.reason !== undefined) text(capture.reason, `${path}.audioCapture.reason`, 256);
      if (capture.incomplete && capture.reason === undefined) invalid(`${path}.audioCapture.reason`, "una toma incompleta requiere motivo");
      const asset = assets.get(take.assetId as string)!;
      if ((asset.frameCount !== undefined && frames !== asset.frameCount) ||
          (asset.sampleRate !== undefined && rate !== asset.sampleRate) ||
          (asset.channelCount !== undefined && channels !== asset.channelCount)) {
        invalid(`${path}.audioCapture`, "metadatos no coinciden con el activo grabado");
      }
    }
    if (take.audioResample !== undefined) {
      if (take.kind !== "audio" || take.audioCapture !== undefined) {
        invalid(`${path}.audioResample`, "resampling requiere toma de audio sin micrófono");
      }
      const resample = object(take.audioResample, `${path}.audioResample`);
      const sourceBusTrackId = id(resample.sourceBusTrackId, `${path}.audioResample.sourceBusTrackId`);
      const destinationTrackId = id(resample.destinationTrackId, `${path}.audioResample.destinationTrackId`);
      if (sourceBusTrackId === destinationTrackId) invalid(`${path}.audioResample`, "bus y destino coinciden");
      integer(resample.sourceRevision, `${path}.audioResample.sourceRevision`, 1);
      if (typeof resample.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(resample.sourceHash)) {
        invalid(`${path}.audioResample.sourceHash`, "hash de revisión inválido");
      }
      const startTick = integer(resample.startTick, `${path}.audioResample.startTick`, 0);
      integer(resample.endTick, `${path}.audioResample.endTick`, startTick + 1);
      oneOf(resample.tap, `${path}.audioResample.tap`, ["post-bus-pre-master"]);
      const sourceIds = array(resample.sourceTrackIds, `${path}.audioResample.sourceTrackIds`, 256);
      if (sourceIds.length === 0) invalid(`${path}.audioResample.sourceTrackIds`, "faltan pistas fuente");
      const seenSources = new Set<string>();
      sourceIds.forEach((value, sourceIndex) => {
        const sourceId = id(value, `${path}.audioResample.sourceTrackIds[${sourceIndex}]`);
        if (sourceId === destinationTrackId || seenSources.has(sourceId)) {
          invalid(`${path}.audioResample.sourceTrackIds`, "destino incluido o fuente duplicada");
        }
        seenSources.add(sourceId);
      });
      const effectIds = array(resample.includedEffectIds, `${path}.audioResample.includedEffectIds`, 1024);
      const seenEffects = new Set<string>();
      effectIds.forEach((value, effectIndex) => {
        const effectId = id(value, `${path}.audioResample.includedEffectIds[${effectIndex}]`);
        if (seenEffects.has(effectId)) invalid(`${path}.audioResample.includedEffectIds`, "efecto duplicado");
        seenEffects.add(effectId);
      });
      if (resample.includedSendIds !== undefined) {
        const sends = array(resample.includedSendIds,
          `${path}.audioResample.includedSendIds`, 1024);
        const unique = new Set<string>();
        sends.forEach((value, index) => {
          const sendId = id(value, `${path}.audioResample.includedSendIds[${index}]`);
          if (unique.has(sendId)) invalid(`${path}.audioResample.includedSendIds`, "envío duplicado");
          unique.add(sendId);
        });
      }
      text(resample.seed, `${path}.audioResample.seed`);
      const sampleRate = integer(resample.sampleRate, `${path}.audioResample.sampleRate`, 8_000, 384_000);
      const channelCount = integer(resample.channelCount, `${path}.audioResample.channelCount`, 1, 2);
      const frameCount = integer(resample.frameCount, `${path}.audioResample.frameCount`, 1);
      integer(resample.tailFrames, `${path}.audioResample.tailFrames`, 0, frameCount);
      oneOf(resample.rendererVersion, `${path}.audioResample.rendererVersion`, ["bus-resample-v1"]);
      const asset = assets.get(take.assetId as string)!;
      if (asset.sourceKind !== "recorded" || asset.mimeType !== "audio/wav" ||
          asset.sampleRate !== sampleRate || asset.channelCount !== channelCount ||
          asset.frameCount !== frameCount) {
        invalid(`${path}.audioResample`, "metadatos no coinciden con WAV interno verificado");
      }
    }
    if (take.midiImport !== undefined) {
      if (take.kind !== "midi") invalid(`${path}.midiImport`, "sólo una toma MIDI tiene datos de conversión");
      const source = object(take.midiImport, `${path}.midiImport`);
      if (typeof source.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(source.sourceSha256)) {
        invalid(`${path}.midiImport.sourceSha256`, "SHA-256 inválido");
      }
      integer(source.sourceByteLength, `${path}.midiImport.sourceByteLength`, 14, 32 * 1024 * 1024);
      if (take.assetId !== undefined) {
        const asset = assets.get(take.assetId as string)!;
        if (asset.sha256 !== source.sourceSha256 || asset.byteLength !== source.sourceByteLength) {
          invalid(`${path}.assetId`, "bytes SMF no coinciden con hash y longitud originales");
        }
      }
      integer(source.sourcePpq, `${path}.midiImport.sourcePpq`, 1, 0x7fff);
      validateTempoMap(source.tempoMap);
      validateMeterMap(source.meterMap);
      for (const field of ["roundedPositions", "ignoredMetaEvents", "ignoredSysExEvents",
        "normalizedZeroDurations"] as const) integer(source[field], `${path}.midiImport.${field}`, 0);
      array(source.sourceTempoEvents, `${path}.midiImport.sourceTempoEvents`, 1_000_000).forEach((entry, atIndex) => {
        const eventPath = `${path}.midiImport.sourceTempoEvents[${atIndex}]`;
        const event = object(entry, eventPath);
        integer(event.sourceTick, `${eventPath}.sourceTick`, 0, 100_000_000_000);
        integer(event.sourceTrackIndex, `${eventPath}.sourceTrackIndex`, 0, 255);
        integer(event.sourceSequence, `${eventPath}.sourceSequence`, 0, 1_000_000);
        integer(event.microsPerQuarter, `${eventPath}.microsPerQuarter`, 60_000, 6_000_000);
      });
      array(source.sourceMeterEvents, `${path}.midiImport.sourceMeterEvents`, 1_000_000).forEach((entry, atIndex) => {
        const eventPath = `${path}.midiImport.sourceMeterEvents[${atIndex}]`;
        const event = object(entry, eventPath);
        integer(event.sourceTick, `${eventPath}.sourceTick`, 0, 100_000_000_000);
        integer(event.sourceTrackIndex, `${eventPath}.sourceTrackIndex`, 0, 255);
        integer(event.sourceSequence, `${eventPath}.sourceSequence`, 0, 1_000_000);
        integer(event.numerator, `${eventPath}.numerator`, 1, 32);
        const denominator = integer(event.denominator, `${eventPath}.denominator`, 1, 64);
        if ((denominator & (denominator - 1)) !== 0) invalid(eventPath, "denominador no es potencia de dos");
      });
    }
  });
  const checkedDocument = document as unknown as ProjectDocumentV1;
  const midiTakeIds = new Set(checkedDocument.takes.filter((take) => take.kind === "midi").map((take) => take.id));
  const audioTakeById = new Map(checkedDocument.takes.filter((take) => take.kind === "audio")
    .map((take) => [take.id, take]));
  for (const pattern of checkedDocument.patterns) {
    for (const note of pattern.notes) {
      if (note.origin.sourceTakeId !== undefined && !midiTakeIds.has(note.origin.sourceTakeId)) {
        invalid(`patterns.${pattern.id}.notes.${note.id}.origin.sourceTakeId`, "toma MIDI inexistente");
      }
    }
    for (const event of pattern.expression) {
      if (event.sourceTakeId !== undefined && !midiTakeIds.has(event.sourceTakeId)) {
        invalid(`patterns.${pattern.id}.expression.${event.id}.sourceTakeId`, "toma MIDI inexistente");
      }
    }
  }
  for (const clip of checkedDocument.clips) {
    if (clip.kind !== "audio" || clip.sourceTakeId === undefined) continue;
    const take = audioTakeById.get(clip.sourceTakeId);
    if (!take || take.assetId !== clip.sourceId) {
      invalid(`clips.${clip.id}.sourceTakeId`, "clip no corresponde a la toma de audio indicada");
    }
  }
  if (document.audioComps !== undefined) {
    const assignedClips = new Set<string>();
    array(document.audioComps, "audioComps", 100_000).forEach((entry, index) => {
      const path = `audioComps[${index}]`;
      const comp = object(entry, path);
      uniqueId(comp.id, `${path}.id`, allIds);
      text(comp.name, `${path}.name`, 100);
      const trackId = id(comp.trackId, `${path}.trackId`);
      if (tracks.get(trackId)?.kind !== "audio") invalid(`${path}.trackId`, "comp requiere pista de audio");
      const segments = array(comp.segments, `${path}.segments`, 100_000);
      if (segments.length === 0) invalid(path, "comp sin regiones seleccionadas");
      let previousStart = -1;
      let previousEnd = -1;
      let previousClipId = "";
      for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
        const segmentPath = `${path}.segments[${segmentIndex}]`;
        const segment = object(segments[segmentIndex], segmentPath);
        uniqueId(segment.id, `${segmentPath}.id`, allIds);
        const clipId = id(segment.clipId, `${segmentPath}.clipId`);
        const takeId = id(segment.takeId, `${segmentPath}.takeId`);
        const clip = clips.get(clipId);
        const take = audioTakeById.get(takeId);
        if (!clip || clip.kind !== "audio" || clip.trackId !== trackId || !take ||
            clip.sourceId !== take.assetId || clip.sourceTakeId !== takeId) {
          invalid(segmentPath, "comp referencia clip/toma/pista incompatibles");
        }
        if (assignedClips.has(clipId)) invalid(segmentPath, "clip asignado a más de un comp");
        assignedClips.add(clipId);
        const start = clip.timeMode === "absolute" ? clip.absoluteStartUs as number :
          Math.round(clock.tickToSeconds(clip.startTick as number) * 1_000_000);
        const end = clip.timeMode === "absolute" ? clip.absoluteEndUs as number :
          Math.round(clock.tickToSeconds((clip.startTick as number) +
            (clip.lengthTicks as number)) * 1_000_000);
        if (start < previousStart) invalid(segmentPath, "regiones de comp fuera de orden temporal");
        if (start < previousEnd && !checkedDocument.audioCrossfades?.some((fade) =>
          fade.outgoingClipId === previousClipId && fade.incomingClipId === clipId)) {
          invalid(segmentPath, "solape de comp requiere crossfade explícito");
        }
        previousStart = start;
        previousEnd = end;
        previousClipId = clipId;
      }
    });
  }
  validateAutomation(document.automation, tracks, clips, document.mix, allIds);
  const mix = object(document.mix, "mix");
  finite(mix.masterGainDb, "mix.masterGainDb", -120, 24);
  validateEffects(mix.masterEffects, "mix.masterEffects", allIds);
  validateRouting(tracks);
}
