import type { ProjectInstrumentRef } from "../project/model.ts";
import { SALAMANDER_CORE_PACKAGE_VERSION } from "../audio/verifiedSalamanderCore.ts";
import { TR808_FISCHER_VERSION } from "../audio/tr808FischerCore.ts";

export interface ProjectInstrumentDescriptor {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly engine: "sample-map" | "sample-808";
  readonly source: string;
  readonly license: string;
  readonly packageState: "installed";
  readonly packageVersion: string;
  readonly presetId: string;
  readonly sizeLabel: string;
  readonly ref: ProjectInstrumentRef;
}

/**
 * Only banks in this registry may be selected for a project track.
 * Live-only/network instruments intentionally do not appear here until they
 * have a verified local package and the offline renderer supports them.
 */
export const PROJECT_INSTRUMENTS: readonly ProjectInstrumentDescriptor[] = [
  {
    id: "salamander-grand",
    label: "Piano Salamander · núcleo local",
    family: "Pianos acústicos",
    engine: "sample-map",
    source: "Salamander Grand Piano V3 · Alexander Holm",
    license: "CC BY 3.0",
    packageState: "installed",
    packageVersion: SALAMANDER_CORE_PACKAGE_VERSION,
    presetId: "natural",
    sizeLabel: "Incluido en la app",
    ref: {
      instrumentId: "salamander-grand",
      packageVersion: SALAMANDER_CORE_PACKAGE_VERSION,
      presetId: "natural",
    },
  },
  {
    id: "tr808-fischer-core",
    label: "Bajo 808 Fischer · núcleo local",
    family: "Bajos / percusión afinada",
    engine: "sample-808",
    source: "TR-808 sample source verificada en el manifiesto del proyecto",
    license: "Ver manifiesto del paquete",
    packageState: "installed",
    packageVersion: TR808_FISCHER_VERSION,
    presetId: "core",
    sizeLabel: "Incluido en la app",
    ref: {
      instrumentId: "tr808-fischer-core",
      packageVersion: TR808_FISCHER_VERSION,
      presetId: "core",
    },
  },
] as const;

export function getProjectInstrument(id: string): ProjectInstrumentDescriptor | undefined {
  return PROJECT_INSTRUMENTS.find((item) => item.id === id);
}

export function matchesProjectInstrument(ref: ProjectInstrumentRef | undefined,
  descriptor: ProjectInstrumentDescriptor): boolean {
  return !!ref && ref.instrumentId === descriptor.ref.instrumentId &&
    ref.packageVersion === descriptor.ref.packageVersion &&
    ref.presetId === descriptor.ref.presetId;
}
