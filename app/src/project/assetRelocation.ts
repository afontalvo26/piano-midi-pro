import { ProjectAssetError, type ProjectAssetStatus } from "./assets.ts";
import type { ProjectAssetRef, ProjectDocumentV1 } from "./model.ts";
import type { ProjectRepository } from "./repository.ts";

export type AssetRelocationRepository = Pick<ProjectRepository, "stageAsset" | "inspectAssets">;

/** Read-only health check after opening a project; missing bytes never block document recovery. */
export function inspectProjectAssets(repository: AssetRelocationRepository,
  document: ProjectDocumentV1): Promise<ProjectAssetStatus[]> {
  return repository.inspectAssets(document.assets);
}

/** Reattach only byte-identical user/recorded content; project IDs and revisions stay fixed. */
export async function relocalizeProjectAsset(repository: AssetRelocationRepository,
  document: ProjectDocumentV1, assetId: string, candidate: Blob): Promise<ProjectAssetRef> {
  const ref = document.assets.find((asset) => asset.id === assetId);
  if (!ref) throw new ProjectAssetError("missing", `Activo ${assetId} no figura en el proyecto`);
  if (ref.sourceKind !== "user" && ref.sourceKind !== "recorded") {
    throw new ProjectAssetError("invalid", "Un banco oficial se restaura desde su paquete aprobado");
  }
  if (!(candidate instanceof Blob) || candidate.size !== ref.byteLength) {
    throw new ProjectAssetError("invalid", `Activo ${assetId}: tamaño de archivo distinto al original`);
  }
  // File.type is browser supplied and may differ for the same bytes. SHA-256 remains authoritative.
  await repository.stageAsset(ref, candidate.slice(0, candidate.size, ref.mimeType));
  const status = (await repository.inspectAssets([ref]))[0];
  if (status?.status !== "available") {
    throw new ProjectAssetError("corrupt", `Activo ${assetId}: los bytes siguen ausentes o dañados`);
  }
  return ref;
}
