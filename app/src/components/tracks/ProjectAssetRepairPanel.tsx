import type { ProjectAssetStatus } from "../../project/assets";
import type { ProjectAssetRef } from "../../project/model";
import "./ProjectAssetRepairPanel.css";

export interface ProjectAssetRepairPanelProps {
  assets: readonly ProjectAssetRef[];
  statuses: readonly ProjectAssetStatus[];
  busyAssetId: string | null;
  notice: string;
  onRelocate: (assetId: string, file: File) => void;
}

export function ProjectAssetRepairPanel({ assets, statuses, busyAssetId, notice,
  onRelocate }: ProjectAssetRepairPanelProps) {
  const assetIds = new Set(assets.map((asset) => asset.id));
  const unavailable = statuses.filter((entry) => entry.status !== "available" && assetIds.has(entry.id));
  if (!unavailable.length) return null;
  return <section className="project-asset-repair" aria-label="Reparar muestras del proyecto">
    <div><h2>Muestras pendientes</h2>
      <p>El proyecto se abrió sin borrar sus referencias. Selecciona el archivo original; se compara su tamaño y SHA-256 antes de volver a usarlo.</p></div>
    <div className="project-asset-repair__list">
      {unavailable.map((status) => {
        const asset = assets.find((entry) => entry.id === status.id);
        if (!asset) return null;
        const label = `Activo ${asset.id.slice(0, 8)}`;
        return <div key={asset.id} className="project-asset-repair__item">
          <div><strong>{label}</strong><small>{status.status === "missing" ? "Archivo faltante" : "Archivo corrupto"} · {asset.byteLength.toLocaleString("es-CO")} bytes · SHA-256 {asset.sha256.slice(0, 12)}…</small></div>
          {asset.sourceKind === "official" ? <span>Restaura el banco oficial aprobado.</span>
            : <label>Buscar archivo original
              <input type="file" accept=".wav,.wave,.ogg,audio/*" disabled={busyAssetId !== null}
                aria-label={`Archivo original para ${label}`}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) onRelocate(asset.id, file);
                }} /></label>}
        </div>;
      })}
    </div>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
