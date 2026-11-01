import { duplicateProjectDocument } from "./commands.ts";
import type { ProjectAssetRef, ProjectDocumentV1 } from "./model.ts";
import type { ProjectRepository, ProjectRevision } from "./repository.ts";
import { ProjectSerializationClient } from "./serializationClient.ts";
import { collectOfficialPack, requiredOfficialPacks, verifyOfficialPack,
  type OfficialBundlePack, type OfficialPackSpec } from "./officialPacks.ts";

const FORMAT = "piano-midi-pro-project-bundle";
const VERSION = 1;
const MAGIC_V2 = "PMPBND2!";
const MAGIC_V3 = "PMPBND3!";
const HEADER_BYTES = 12;
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 256 * 1024 * 1024;

interface BundleV1 {
  readonly format: typeof FORMAT;
  readonly version: 1;
  readonly revision: number;
  readonly hash: string;
  readonly document: ProjectDocumentV1;
  readonly assets: readonly [];
}

interface BundleAsset {
  readonly sha256: string;
  readonly byteLength: number;
  readonly mimeType: string;
}

interface BundleV2 {
  readonly format: typeof FORMAT;
  readonly version: 2;
  readonly revision: number;
  readonly hash: string;
  readonly document: ProjectDocumentV1;
  /** Bytes follow the manifest in exactly this order; no untrusted paths are used. */
  readonly assets: readonly BundleAsset[];
}

interface BundleV3 extends Omit<BundleV2, "version"> {
  readonly version: 3;
  readonly portability: "complete";
  /** Complete shipped OGG bank, pinned manifest, license and attribution files. */
  readonly officialPacks: readonly OfficialBundlePack[];
}

interface VerifiedBundle {
  readonly formatVersion: 1 | 2 | 3;
  readonly sourceRevision: number;
  readonly sourceHash: string;
  readonly document: ProjectDocumentV1;
  readonly assets: readonly { readonly ref: ProjectAssetRef; readonly data: Blob }[];
  readonly officialPacks: readonly OfficialPackSpec[];
  readonly byteLength: number;
}

/** Read-only result after verifying the document, every bundled byte and required licenses. */
export interface ProjectBundlePreview {
  readonly formatVersion: 1 | 2 | 3;
  readonly projectId: string;
  readonly name: string;
  readonly schemaVersion: number;
  readonly sourceRevision: number;
  readonly sourceHash: string;
  readonly tracks: number;
  readonly patterns: number;
  readonly clips: number;
  readonly takes: number;
  readonly assets: readonly ProjectAssetRef[];
  readonly officialPacks: readonly {
    readonly instrumentId: string;
    readonly packageVersion: string;
    readonly presetId: string;
    readonly creator: string;
    readonly license: string;
  }[];
  readonly byteLength: number;
  /** Bundled banks pass integrity checks, but playback still requires the pinned same-origin installation. */
  readonly requiresInstalledOfficialPacks: boolean;
}

async function hashBlob(blob: Blob): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

function uniqueAssetRefs(refs: readonly ProjectAssetRef[]): ProjectAssetRef[] {
  const byHash = new Map<string, ProjectAssetRef>();
  for (const ref of refs) {
    const key = ref.sha256.toLowerCase();
    const previous = byHash.get(key);
    if (previous && (previous.byteLength !== ref.byteLength || previous.mimeType !== ref.mimeType)) {
      throw new ProjectBundleError("invalid", "Dos referencias del mismo hash declaran metadatos distintos");
    }
    if (!previous) byHash.set(key, ref);
  }
  return [...byHash.values()];
}

export class ProjectBundleError extends Error {
  readonly code: "invalid" | "oversize" | "assets-pending";

  constructor(code: "invalid" | "oversize" | "assets-pending", message: string) {
    super(message);
    this.name = "ProjectBundleError";
    this.code = code;
  }
}

function portableDependencies(document: ProjectDocumentV1, allowOfficial: boolean): readonly OfficialPackSpec[] {
  if (document.takes.some((take) => take.kind === "midi" && !take.assetId)) {
    throw new ProjectBundleError("assets-pending",
      "La toma MIDI original está en la biblioteca local y sus bytes no están en este paquete");
  }
  if (document.assets.some((asset) => asset.sourceKind === "official")) {
    throw new ProjectBundleError("assets-pending",
      "Un activo oficial suelto requiere manifiesto y licencia antes de un paquete portable");
  }
  let packs: readonly OfficialPackSpec[];
  try { packs = requiredOfficialPacks(document); }
  catch (error) {
    throw new ProjectBundleError("assets-pending", error instanceof Error ? error.message :
      "Banco oficial no aprobado para paquete portable");
  }
  if (!allowOfficial && packs.length > 0) {
    throw new ProjectBundleError("assets-pending", "Este respaldo antiguo no incluye los bancos oficiales");
  }
  return packs;
}

function binaryBundle(manifest: BundleV2 | BundleV3, data: readonly Blob[], magic: string): Blob {
  const encoded = new TextEncoder().encode(JSON.stringify(manifest));
  if (encoded.byteLength > MAX_MANIFEST_BYTES) {
    throw new ProjectBundleError("oversize", "El manifiesto excede 32 MiB");
  }
  const header = new Uint8Array(HEADER_BYTES);
  header.set(new TextEncoder().encode(magic));
  new DataView(header.buffer).setUint32(8, encoded.byteLength, true);
  const bundle = new Blob([header, encoded, ...data], { type: "application/vnd.piano-midi-pro.project" });
  if (bundle.size > MAX_BUNDLE_BYTES) throw new ProjectBundleError("oversize", "El paquete excede 256 MiB");
  return bundle;
}

/** JSON v1 for asset-free projects; binary v2 with verified bytes for asset-bearing projects. */
export async function exportProjectBundle(repository: ProjectRepository, projectId: string): Promise<Blob> {
  const read = await repository.read(projectId);
  if (!read || read.status !== "ready") throw new ProjectBundleError("invalid", "Proyecto no disponible para exportar");
  const { revision, hash, document } = read.value;
  const packs = portableDependencies(document, true);
  const refs = uniqueAssetRefs(document.assets);
  if (refs.length > 0 || packs.length > 0) {
    const data: Blob[] = [];
    for (const ref of refs) {
      let blob: Blob | null;
      try { blob = await repository.readAsset(ref); }
      catch { throw new ProjectBundleError("assets-pending", `Activo ${ref.id} dañado: relocalízalo antes de exportar`); }
      if (!blob) throw new ProjectBundleError("assets-pending", `Activo ${ref.id} ausente: relocalízalo antes de exportar`);
      data.push(blob);
    }
    const official: { entry: OfficialBundlePack; blobs: readonly Blob[] }[] = [];
    for (const spec of packs) {
      try { official.push(await collectOfficialPack(spec)); }
      catch (error) {
        throw new ProjectBundleError("assets-pending", error instanceof Error ? error.message :
          `Banco ${spec.instrumentId} incompleto`);
      }
    }
    if (official.length > 0) {
      const manifest: BundleV3 = { format: FORMAT, version: 3, revision, hash, document,
        portability: "complete",
        assets: refs.map((ref) => ({ sha256: ref.sha256.toLowerCase(),
          byteLength: ref.byteLength, mimeType: ref.mimeType })),
        officialPacks: official.map((pack) => pack.entry) };
      return binaryBundle(manifest, [...data, ...official.flatMap((pack) => pack.blobs)], MAGIC_V3);
    }
    const manifest: BundleV2 = {
      format: FORMAT, version: 2, revision, hash, document,
      assets: refs.map((ref) => ({ sha256: ref.sha256.toLowerCase(),
        byteLength: ref.byteLength, mimeType: ref.mimeType })),
    };
    return binaryBundle(manifest, data, MAGIC_V2);
  }
  const bundle: BundleV1 = {
    format: FORMAT, version: VERSION, revision, hash, document, assets: [],
  };
  const content = JSON.stringify(bundle);
  if (new TextEncoder().encode(content).byteLength > MAX_JSON_BYTES) {
    throw new ProjectBundleError("oversize", "El respaldo del proyecto excede 64 MiB");
  }
  return new Blob([content], { type: "application/vnd.piano-midi-pro.project+json" });
}

async function verifyJsonBundle(blob: Blob): Promise<VerifiedBundle> {
  if (blob.size > MAX_JSON_BYTES) throw new ProjectBundleError("oversize", "El respaldo JSON excede 64 MiB");
  let parsed: unknown;
  try { parsed = JSON.parse(await blob.text()); }
  catch { throw new ProjectBundleError("invalid", "El respaldo no contiene JSON válido"); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProjectBundleError("invalid", "Manifiesto de respaldo inválido");
  }
  const manifest = parsed as Record<string, unknown>;
  if (manifest.format !== FORMAT || manifest.version !== VERSION || !Number.isSafeInteger(manifest.revision) ||
      (manifest.revision as number) < 1 || typeof manifest.hash !== "string" ||
      !/^[0-9a-f]{64}$/.test(manifest.hash) || !Array.isArray(manifest.assets) || manifest.assets.length !== 0) {
    throw new ProjectBundleError("invalid", "Versión, hash o activos del manifiesto inválidos");
  }
  const document = manifest.document as ProjectDocumentV1;
  const serialization = new ProjectSerializationClient();
  let computedHash: string;
  try { computedHash = await serialization.hash(document); }
  catch { throw new ProjectBundleError("invalid", "Documento del respaldo inválido"); }
  finally { serialization.close(); }
  if (computedHash !== manifest.hash) throw new ProjectBundleError("invalid", "El respaldo fue alterado: hash no coincide");
  portableDependencies(document, false);
  if (document.assets.length > 0) {
    throw new ProjectBundleError("assets-pending", "El respaldo contiene referencias de audio sin archivos verificados");
  }
  return { formatVersion: 1, sourceRevision: manifest.revision as number,
    sourceHash: manifest.hash, document, assets: [], officialPacks: [], byteLength: blob.size };
}

async function verifyBinaryBundle(blob: Blob, header: Uint8Array,
  version: 2 | 3): Promise<VerifiedBundle> {
  if (header.byteLength !== HEADER_BYTES) throw new ProjectBundleError("invalid", "Cabecera truncada");
  const manifestLength = new DataView(header.buffer).getUint32(8, true);
  if (manifestLength < 1 || manifestLength > MAX_MANIFEST_BYTES || HEADER_BYTES + manifestLength > blob.size) {
    throw new ProjectBundleError("invalid", "Longitud del manifiesto inválida");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(await blob.slice(HEADER_BYTES, HEADER_BYTES + manifestLength).text()); }
  catch { throw new ProjectBundleError("invalid", "Manifiesto JSON inválido"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProjectBundleError("invalid", "Manifiesto inválido");
  }
  const manifest = parsed as Record<string, unknown>;
  if (manifest.format !== FORMAT || manifest.version !== version ||
      !Number.isSafeInteger(manifest.revision) || (manifest.revision as number) < 1 ||
      typeof manifest.hash !== "string" || !/^[0-9a-f]{64}$/.test(manifest.hash) ||
      !Array.isArray(manifest.assets)) {
    throw new ProjectBundleError("invalid", "Versión, hash o activos del manifiesto inválidos");
  }
  const document = manifest.document as ProjectDocumentV1;
  const serialization = new ProjectSerializationClient();
  let computedHash: string;
  try { computedHash = await serialization.hash(document); }
  catch { throw new ProjectBundleError("invalid", "Documento del respaldo inválido"); }
  finally { serialization.close(); }
  if (computedHash !== manifest.hash) throw new ProjectBundleError("invalid", "El respaldo fue alterado: hash no coincide");
  const packs = portableDependencies(document, version === 3);
  if (version === 3 && (manifest.portability !== "complete" || !Array.isArray(manifest.officialPacks))) {
    throw new ProjectBundleError("invalid", "El paquete portable no declara bancos oficiales completos");
  }
  const refs = uniqueAssetRefs(document.assets);
  const entries = manifest.assets as unknown[];
  if (entries.length !== refs.length) throw new ProjectBundleError("invalid", "Faltan activos o sobran entradas");
  const verified: { ref: ProjectAssetRef; data: Blob }[] = [];
  let offset = HEADER_BYTES + manifestLength;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const ref = refs[index]!;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ProjectBundleError("invalid", "Entrada de activo inválida");
    }
    const row = entry as Record<string, unknown>;
    if (row.sha256 !== ref.sha256.toLowerCase() || row.byteLength !== ref.byteLength ||
        row.mimeType !== ref.mimeType || !Number.isSafeInteger(row.byteLength) ||
        (row.byteLength as number) < 1 || offset + ref.byteLength > blob.size) {
      throw new ProjectBundleError("invalid", `Metadatos o longitud inválidos para ${ref.id}`);
    }
    const data = blob.slice(offset, offset + ref.byteLength, ref.mimeType);
    if (await hashBlob(data) !== ref.sha256.toLowerCase()) {
      throw new ProjectBundleError("invalid", `Activo ${ref.id} alterado`);
    }
    verified.push({ ref, data });
    offset += ref.byteLength;
  }
  if (version === 3) {
    const official = manifest.officialPacks as unknown[];
    if (official.length !== packs.length) {
      throw new ProjectBundleError("invalid", "Faltan bancos oficiales o sobran entradas");
    }
    for (let index = 0; index < packs.length; index++) {
      const entry = official[index];
      const spec = packs[index]!;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new ProjectBundleError("invalid", `Banco ${spec.instrumentId} inválido`);
      }
      const pack = entry as OfficialBundlePack;
      if (!Array.isArray(pack.files) || pack.files.length > 256) {
        throw new ProjectBundleError("invalid", `Archivos de ${spec.instrumentId} inválidos`);
      }
      const blobs: Blob[] = [];
      for (const file of pack.files) {
        if (!file || !Number.isSafeInteger(file.byteLength) || file.byteLength < 1 ||
            file.byteLength > 64 * 1024 * 1024 || offset + file.byteLength > blob.size) {
          throw new ProjectBundleError("invalid", `Longitud de ${spec.instrumentId} inválida`);
        }
        blobs.push(blob.slice(offset, offset + file.byteLength));
        offset += file.byteLength;
      }
      try { await verifyOfficialPack(spec, pack, blobs); }
      catch (error) {
        throw new ProjectBundleError("invalid", error instanceof Error ? error.message :
          `Banco ${spec.instrumentId} alterado`);
      }
    }
  }
  if (offset !== blob.size) throw new ProjectBundleError("invalid", "El paquete contiene bytes adicionales");
  return { formatVersion: version, sourceRevision: manifest.revision as number,
    sourceHash: manifest.hash, document, assets: verified, officialPacks: packs,
    byteLength: blob.size };
}

async function verifyProjectBundle(blob: Blob): Promise<VerifiedBundle> {
  if (!(blob instanceof Blob)) throw new ProjectBundleError("invalid", "El respaldo no es un archivo válido");
  if (blob.size > MAX_BUNDLE_BYTES) throw new ProjectBundleError("oversize", "El paquete excede 256 MiB");
  const header = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer());
  const magic = new TextDecoder().decode(header.slice(0, 8));
  if (magic === MAGIC_V2) return verifyBinaryBundle(blob, header, 2);
  if (magic === MAGIC_V3) return verifyBinaryBundle(blob, header, 3);
  return verifyJsonBundle(blob);
}

/** Verifies a candidate without creating a database, staging assets or changing a project. */
export async function previewProjectBundle(blob: Blob): Promise<ProjectBundlePreview> {
  const verified = await verifyProjectBundle(blob);
  const { document } = verified;
  return { formatVersion: verified.formatVersion, projectId: document.id,
    name: document.name, schemaVersion: document.schemaVersion,
    sourceRevision: verified.sourceRevision, sourceHash: verified.sourceHash,
    tracks: document.tracks.length, patterns: document.patterns.length,
    clips: document.clips.length, takes: document.takes.length,
    assets: document.assets, officialPacks: verified.officialPacks.map((pack) => ({
      instrumentId: pack.instrumentId, packageVersion: pack.packageVersion,
      presetId: pack.presetId, creator: pack.creator, license: pack.license,
    })), byteLength: verified.byteLength,
    requiresInstalledOfficialPacks: verified.officialPacks.length > 0 };
}

/** Never replaces an existing project; failed import may leave staged, unreferenced bytes for later GC. */
export async function importProjectBundle(repository: ProjectRepository, blob: Blob,
  options: { readonly id: string; readonly name?: string; readonly at: number }): Promise<ProjectRevision> {
  // Preview and import share the exact verifier. All bytes pass before the first IndexedDB write.
  const verified = await verifyProjectBundle(blob);
  const copy = duplicateProjectDocument(verified.document,
    { id: options.id, name: options.name ?? verified.document.name, at: options.at });
  // Imported banks are verified in the bundle, but the runtime currently loads same-origin pins.
  // This is deliberately import-only: preview must work before a bank is installed locally.
  for (const spec of verified.officialPacks) {
    try { await collectOfficialPack(spec); }
    catch (error) {
      throw new ProjectBundleError("assets-pending", error instanceof Error ? error.message :
        `Instala ${spec.instrumentId} antes de abrir el proyecto`);
    }
  }
  if (await repository.read(copy.id)) throw new ProjectBundleError("invalid", "Ya existe un proyecto con ese ID");
  for (const asset of verified.assets) await repository.stageAsset(asset.ref, asset.data);
  return repository.commitRevision(copy, 0);
}
