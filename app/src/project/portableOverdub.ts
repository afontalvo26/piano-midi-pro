import type { RecordingLibrary } from "../midi/recordingLibrary.ts";
import type { ProjectCommand } from "./commands.ts";
import type { ProjectAssetRef, ProjectPattern, ProjectTakeRef } from "./model.ts";
import type { ProjectRepository } from "./repository.ts";
import type { ProjectSession, ProjectSessionSnapshot } from "./session.ts";

export interface PortableRecordedOverdubRequest {
  readonly expectedVersion: number;
  /** Append-only pattern; newly added events may use take.id as temporary provenance. */
  readonly pattern: ProjectPattern;
  readonly take: ProjectTakeRef;
  readonly at: number;
  readonly assetId?: string;
  readonly gestureId?: string;
}

/** Copies the exact SMF into project assets, then applies one reversible project command and saves it. */
export async function commitPortableRecordedOverdub(
  library: Pick<RecordingLibrary, "getBytes">,
  repository: Pick<ProjectRepository, "stageAsset" | "readAsset">,
  session: Pick<ProjectSession, "getSnapshot" | "dispatch" | "save">,
  request: PortableRecordedOverdubRequest,
): Promise<ProjectSessionSnapshot> {
  if (request.take.kind !== "midi" || !request.take.recordingId || !request.take.midiImport) {
    throw new RangeError("La toma MIDI necesita origen y metadatos SMF completos");
  }
  const before = session.getSnapshot().document;
  const previous = before.patterns.find((pattern) => pattern.id === request.pattern.id);
  if (!previous || previous.version !== request.expectedVersion) {
    throw new RangeError("El patrón cambió antes de copiar la toma");
  }
  const existing = before.takes.find((take) => take.kind === "midi" &&
    take.recordingId === request.take.recordingId);
  if (existing?.midiImport && JSON.stringify(existing.midiImport) !==
      JSON.stringify(request.take.midiImport)) {
    throw new RangeError("La toma local no coincide con su referencia anterior");
  }
  const bytes = await library.getBytes(request.take.recordingId);
  if (!bytes || bytes.byteLength < 14 || bytes.byteLength > 32 * 1024 * 1024 ||
      bytes[0] !== 0x4d || bytes[1] !== 0x54 || bytes[2] !== 0x68 || bytes[3] !== 0x64) {
    throw new RangeError("Bytes SMF originales ausentes o inválidos en Pistas");
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));
  const sha256 = Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
  if (sha256 !== request.take.midiImport.sourceSha256 ||
      bytes.byteLength !== request.take.midiImport.sourceByteLength) {
    throw new RangeError("La toma MIDI cambió: hash o longitud no coinciden");
  }
  const assetId = existing?.assetId ?? request.assetId ?? crypto.randomUUID();
  const savedAsset = before.assets.find((asset) => asset.id === assetId);
  const asset: ProjectAssetRef = savedAsset ?? {
    id: assetId, sha256, byteLength: bytes.byteLength, mimeType: "audio/midi",
    sourceKind: "recorded", license: "user-owned",
  };
  if (asset.sha256 !== sha256 || asset.byteLength !== bytes.byteLength ||
      asset.mimeType !== "audio/midi" || asset.sourceKind !== "recorded") {
    throw new RangeError("El activo SMF del proyecto no coincide con Pistas");
  }
  let healthy = false;
  if (savedAsset) {
    try { healthy = (await repository.readAsset(asset)) !== null; }
    catch { /* the exact RecordingLibrary copy can repair the project asset */ }
  }
  if (!healthy) await repository.stageAsset(asset, new Blob([Uint8Array.from(bytes)], { type: "audio/midi" }));
  const take: ProjectTakeRef = existing
    ? { ...existing, midiImport: request.take.midiImport, assetId }
    : { ...request.take, assetId };
  const provenanceId = request.take.id;
  const pattern: ProjectPattern = { ...request.pattern,
    notes: request.pattern.notes.map((note, index) => index < previous.notes.length ? note : {
      ...note, origin: { ...note.origin, sourceTakeId: take.id,
        importedProjectStartTick: note.startTick,
        importedProjectDurationTick: note.durationTick },
    }),
    expression: request.pattern.expression.map((event, index) => index < previous.expression.length ? event : {
      ...event, sourceTakeId: take.id,
    }),
  };
  if (provenanceId !== take.id && [...pattern.notes.slice(previous.notes.length),
    ...pattern.expression.slice(previous.expression.length)].length === 0) {
    throw new RangeError("Overdub sin eventos nuevos");
  }
  const command: Extract<ProjectCommand, { kind: "overdubRecordedTake" }> = {
    kind: "overdubRecordedTake", expectedVersion: request.expectedVersion,
    pattern, take, asset, at: request.at,
  };
  session.dispatch(command, request.gestureId);
  await session.save();
  return session.getSnapshot();
}
