import type { ProjectDocumentV1, ProjectInstrumentRef } from "./model.ts";
import { FREEPATS_HANDCLAP_VERSION } from "../audio/freePatsHandClap.ts";
import { VIRTUOSITY_CORE_VERSION } from "../audio/virtuosityCore.ts";
import { TR808_FISCHER_VERSION } from "../audio/tr808FischerCore.ts";

export type OfficialFileRole = "manifest" | "license" | "attribution" | "sample";

export interface OfficialBundleFile {
  readonly role: OfficialFileRole;
  /** Relative to the pinned pack root. Never used as a URL from an imported bundle. */
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface OfficialBundlePack {
  readonly instrumentId: string;
  readonly packageVersion: string;
  readonly presetId: string;
  readonly creator: string;
  readonly performer?: string;
  readonly license: string;
  readonly sourceUrl: string;
  readonly files: readonly OfficialBundleFile[];
}

interface PinnedFile {
  readonly role: Exclude<OfficialFileRole, "sample">;
  readonly path: string;
  readonly sha256: string;
}

export interface OfficialPackSpec {
  readonly instrumentId: string;
  readonly packageVersion: string;
  readonly presetId: string;
  readonly creator: string;
  readonly performer?: string;
  readonly license: string;
  readonly sourceUrl: string;
  readonly baseUrl: string;
  readonly files: readonly PinnedFile[];
  readonly sampleCount: number;
}

const CC0_HASH = "a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499";

/** Exact installed sample packages; a new bank needs an explicit licensed descriptor. */
export const OFFICIAL_PACKS: readonly OfficialPackSpec[] = [
  {
    instrumentId: "salamander-grand",
    packageVersion: "sha256:3554c3717e4a7f6cb343fd7c14cd515f22f735be20f67b5d75f2d93fe452ba10",
    presetId: "natural", creator: "Alexander Holm", license: "CC BY 3.0",
    sourceUrl: "https://github.com/sfzinstruments/SalamanderGrandPiano",
    baseUrl: "/audio/salamander/core/", sampleCount: 7,
    files: [
      { role: "manifest", path: "manifest.json",
        sha256: "3554c3717e4a7f6cb343fd7c14cd515f22f735be20f67b5d75f2d93fe452ba10" },
      { role: "attribution", path: "ATTRIBUTION.md",
        sha256: "efb7a8d459c1c315607ee6920c6fbb7ba478cedd855b7a57ade4b861baf85cb1" },
    ],
  },
  {
    instrumentId: "virtuosity-core", packageVersion: VIRTUOSITY_CORE_VERSION,
    presetId: "core", creator: "Versilian Studios LLC; Karoryfer Lecolds",
    performer: "Austin McMahon", license: "CC0-1.0",
    sourceUrl: `https://github.com/sfzinstruments/virtuosity_drums/tree/${VIRTUOSITY_CORE_VERSION}`,
    baseUrl: "/audio/virtuosity/core/", sampleCount: 38,
    files: [
      { role: "manifest", path: "manifest.json",
        sha256: "d58ba219cf99765a7ad752637e5e037d2e000e9fef44e079a3df97396dece93f" },
      { role: "license", path: "LICENSE", sha256: CC0_HASH },
    ],
  },
  {
    instrumentId: "freepats-handclap", packageVersion: FREEPATS_HANDCLAP_VERSION,
    presetId: "core", creator: "FreePats", performer: "Roberto", license: "CC0-1.0",
    sourceUrl: `https://github.com/freepats/world-percussion/tree/${FREEPATS_HANDCLAP_VERSION}`,
    baseUrl: "/audio/freepats-handclap/core/", sampleCount: 9,
    files: [
      { role: "manifest", path: "manifest.json",
        sha256: "21e46735d3f673908cb912ec5aca1ef858b684e19d4b5dc3b28ebac26acf0380" },
      { role: "license", path: "LICENSE.txt", sha256: CC0_HASH },
      { role: "attribution", path: "README-source.txt",
        sha256: "b24e433686aa99d3960c2608780c446e53bd6353cd4e6d3daf2c318922922151" },
    ],
  },
  {
    instrumentId: "tr808-fischer-core", packageVersion: TR808_FISCHER_VERSION,
    presetId: "core", creator: "Michael Fischer / Technopolis", license: "CC0-1.0",
    sourceUrl: `https://github.com/tidalcycles/sounds-tr808-fischer/tree/${TR808_FISCHER_VERSION}`,
    baseUrl: "/audio/tr808-fischer/core/", sampleCount: 17,
    files: [
      { role: "manifest", path: "manifest.json",
        sha256: "8ad182c610250de187daa8a5fd13c3c1348206cff146a60ef2a08e31293e82ba" },
      { role: "license", path: "LICENSE", sha256: CC0_HASH },
      { role: "attribution", path: "README-source.md",
        sha256: "9fd714352f477768fc6120d2225c9f1fb2a452e88ba337c9f8d896c6927682e1" },
    ],
  },
];

function specFor(ref: ProjectInstrumentRef): OfficialPackSpec {
  const spec = OFFICIAL_PACKS.find((item) => item.instrumentId === ref.instrumentId &&
    item.packageVersion === ref.packageVersion && item.presetId === ref.presetId);
  if (!spec || ref.sampleRegion !== undefined) {
    throw new Error(`Banco ${ref.instrumentId}/${ref.packageVersion}/${ref.presetId} sin paquete oficial portable aprobado`);
  }
  return spec;
}

export function requiredOfficialPacks(document: ProjectDocumentV1): readonly OfficialPackSpec[] {
  const required = new Map<string, OfficialPackSpec>();
  for (const track of document.tracks) {
    if (track.drumRack) {
      for (const pad of track.drumRack.pads) {
        if (pad.source?.kind !== "instrument") continue;
        const spec = specFor(pad.source.ref);
        required.set(spec.instrumentId, spec);
      }
    } else if (track.instrument && track.instrument.instrumentId !== "user-sampler") {
      const spec = specFor(track.instrument);
      required.set(spec.instrumentId, spec);
    }
  }
  return OFFICIAL_PACKS.filter((spec) => required.has(spec.instrumentId));
}

export async function hashOfficialBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} inválido`);
  return value as Record<string, unknown>;
}

function sampleFiles(spec: OfficialPackSpec, manifestBytes: Blob): Promise<readonly OfficialBundleFile[]> {
  return manifestBytes.text().then((text) => {
    const manifest = record(JSON.parse(text), "Manifiesto oficial");
    if (spec.instrumentId === "salamander-grand") {
      if (manifest.author !== "Alexander Holm" ||
          manifest.license !== "https://creativecommons.org/licenses/by/3.0/") {
        throw new Error("Atribución Salamander incompatible");
      }
    } else if (manifest.packId !== spec.instrumentId ||
        manifest.version !== spec.packageVersion || manifest.license !== spec.license) {
      throw new Error(`Manifiesto ${spec.instrumentId} incompatible`);
    }
    if (spec.instrumentId === "virtuosity-core" &&
        (!Array.isArray(manifest.creators) ||
          manifest.creators.join("; ") !== spec.creator ||
          manifest.performer !== spec.performer || manifest.source !== spec.sourceUrl)) {
      throw new Error("Créditos Virtuosity incompatibles");
    }
    if (spec.instrumentId === "freepats-handclap" &&
        (manifest.performer !== spec.performer || manifest.source !== spec.sourceUrl)) {
      throw new Error("Créditos FreePats incompatibles");
    }
    if (spec.instrumentId === "tr808-fischer-core" &&
        (manifest.creator !== spec.creator || manifest.source !== spec.sourceUrl ||
          typeof manifest.recording !== "string" ||
          !manifest.recording.includes("Roland TR-808 serial 103852"))) {
      throw new Error("Créditos o procedencia TR-808 incompatibles");
    }
    const rows = spec.instrumentId === "salamander-grand" ? manifest.files
      : spec.instrumentId === "tr808-fischer-core" && Array.isArray(manifest.samples)
        ? [...manifest.samples, manifest.bass] : manifest.samples;
    if (!Array.isArray(rows) || rows.length !== spec.sampleCount) {
      throw new Error(`Muestras ${spec.instrumentId} incompletas`);
    }
    const seen = new Set<string>();
    return rows.map((value, index): OfficialBundleFile => {
      const row = record(value, `Muestra ${index}`);
      const path = row.file;
      const size = spec.instrumentId === "salamander-grand" ? row.bytes : row.byteLength;
      if (typeof path !== "string" ||
          !/^(?:[A-Za-z0-9_-]+\/)?[A-Za-z0-9_-]+\.(?:ogg|wav)$/i.test(path) || seen.has(path) ||
          !Number.isSafeInteger(size) || (size as number) < 64 || (size as number) > 64 * 1024 * 1024 ||
          typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.sha256)) {
        throw new Error(`Muestra oficial ${index} inválida`);
      }
      seen.add(path);
      return { role: "sample", path, sha256: row.sha256, byteLength: size as number };
    });
  });
}

async function fetchChecked(spec: OfficialPackSpec,
  file: Pick<OfficialBundleFile, "path" | "sha256"> & { readonly byteLength?: number }): Promise<Blob> {
  const response = await fetch(`${spec.baseUrl}${file.path}`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Falta ${spec.instrumentId}/${file.path} (HTTP ${response.status})`);
  const blob = await response.blob();
  if (file.byteLength !== undefined && file.byteLength > 0 && blob.size !== file.byteLength) {
    throw new Error(`Tamaño inválido de ${spec.instrumentId}/${file.path}`);
  }
  if (await hashOfficialBlob(blob) !== file.sha256) {
    throw new Error(`Hash inválido de ${spec.instrumentId}/${file.path}`);
  }
  return blob;
}

/** Fetches and hashes the exact local recordings and their license/credit files. */
export async function collectOfficialPack(spec: OfficialPackSpec): Promise<{
  readonly entry: OfficialBundlePack; readonly blobs: readonly Blob[] }> {
  const manifest = await fetchChecked(spec, spec.files[0]!);
  const samples = await sampleFiles(spec, manifest);
  const expected = [...spec.files.map((file) => ({ ...file, byteLength: 0 })), ...samples];
  const blobs: Blob[] = [manifest];
  for (let offset = 1; offset < expected.length; offset += 4) {
    const batch = expected.slice(offset, offset + 4);
    blobs.push(...await Promise.all(batch.map((file) => fetchChecked(spec, file))));
  }
  const files = expected.map((file, index): OfficialBundleFile =>
    ({ ...file, byteLength: blobs[index]!.size }));
  return { entry: { instrumentId: spec.instrumentId, packageVersion: spec.packageVersion,
    presetId: spec.presetId, creator: spec.creator,
    ...(spec.performer === undefined ? {} : { performer: spec.performer }), license: spec.license,
    sourceUrl: spec.sourceUrl, files }, blobs };
}

/** Checks archive metadata and all bytes against pinned manifests before project import. */
export async function verifyOfficialPack(spec: OfficialPackSpec, entry: OfficialBundlePack,
  blobs: readonly Blob[]): Promise<void> {
  if (entry.instrumentId !== spec.instrumentId || entry.packageVersion !== spec.packageVersion ||
      entry.presetId !== spec.presetId || entry.creator !== spec.creator ||
      entry.performer !== spec.performer ||
      entry.license !== spec.license || entry.sourceUrl !== spec.sourceUrl ||
      !Array.isArray(entry.files) || entry.files.length !== blobs.length ||
      entry.files.length !== spec.files.length + spec.sampleCount) {
    throw new Error(`Banco ${spec.instrumentId} no coincide con el descriptor aprobado`);
  }
  const manifest = blobs[0]!;
  if (await hashOfficialBlob(manifest) !== spec.files[0]!.sha256) {
    throw new Error(`Manifiesto ${spec.instrumentId} alterado`);
  }
  const samples = await sampleFiles(spec, manifest);
  const expected = [...spec.files, ...samples];
  for (let index = 0; index < expected.length; index++) {
    const row = entry.files[index]!;
    const match = expected[index]!;
    const blob = blobs[index]!;
    if (row.role !== match.role || row.path !== match.path || row.sha256 !== match.sha256 ||
        (match.role === "sample" && row.byteLength !== match.byteLength) ||
        row.byteLength !== blob.size || row.byteLength < 1 ||
        await hashOfficialBlob(blob) !== match.sha256) {
      throw new Error(`Archivo ${spec.instrumentId}/${match.path} alterado o ausente`);
    }
  }
}
