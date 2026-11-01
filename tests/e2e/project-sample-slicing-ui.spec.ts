import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

/** Deterministic QA audio, never an application instrument or shipped asset. */
function makeBreakFixture(): Buffer {
  const sampleRate = 48_000;
  const frames = sampleRate;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let beat = 0; beat < 8; beat++) {
    const start = beat * 6_000;
    for (let offset = 0; offset < 240; offset++) {
      const value = Math.round(Math.sin(offset * 0.21) * 20_000 * (1 - offset / 240));
      bytes.writeInt16LE(value, 44 + (start + offset) * 2);
    }
  }
  return bytes;
}

test("Sampler instala ocho cortes editables en pads, conserva SHA y los recupera a 320 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Sampler" }).click();
  const fixture = makeBreakFixture();
  await page.getByLabel("Elegir muestra propia").setInputFiles({
    name: "qa-break.wav", mimeType: "audio/wav", buffer: fixture,
  });
  await expect(page.getByRole("status").filter({ hasText: "SHA-256 verificado" })).toBeVisible();
  const slicer = page.getByRole("region", { name: "Cortes de muestra para pads" });
  await expect(slicer).toContainText("qa-break.wav");
  await slicer.getByRole("button", { name: "Detectar transientes" }).click();
  await expect(slicer.locator(".sample-slices__notice"))
    .toContainText(/cortes sugeridos|transientes fiables/);
  await slicer.getByRole("button", { name: "Dividir en partes iguales" }).click();
  await expect(slicer.locator(".sample-slices__row")).toHaveCount(8);
  const smallTargets = await slicer.evaluate((root) => [...root.querySelectorAll("button,input,select")]
    .filter((control) => !(control as HTMLButtonElement).disabled)
    .filter((control) => { const box = control.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44); })
    .map((control) => control.getAttribute("aria-label") || control.textContent?.trim() || control.tagName));
  expect(smallTargets).toEqual([]);
  await slicer.getByRole("spinbutton", { name: "Fin exclusivo (frame)" }).first().fill("5900");
  await slicer.getByRole("spinbutton", { name: "Inicio (frame)" }).nth(1).fill("6100");
  await slicer.getByRole("button", { name: "Guardar cortes en pads" }).click();
  await expect(page.getByRole("region", { name: "Rack de batería de 16 pads" })).toBeVisible();

  async function readSlices() {
    return page.evaluate(async () => {
      const projectId = localStorage.getItem("pmp_active_project_id")!;
      const { ProjectRepository } = await import("/src/project/repository.ts");
      const repository = new ProjectRepository();
      try {
        const result = await repository.read(projectId);
        if (!result || result.status !== "ready") throw new Error("Proyecto no legible");
        const { document } = result.value;
        const rack = document.tracks.find((track) => track.kind === "drum")?.drumRack;
        const asset = document.assets.find((item) => item.sourceKind === "user");
        if (!rack || !asset) throw new Error("Rack o muestra no guardados");
        const audio = await repository.readAsset(asset);
        return { sha256: asset.sha256, byteLength: audio?.size ?? 0,
          pads: rack.pads.slice(0, 8).map((pad) => ({ assetId: pad.source?.kind === "asset"
            ? pad.source.assetId : null, startFrame: pad.startFrame, endFrame: pad.endFrame })) };
      } finally { await repository.close(); }
    });
  }
  const saved = await readSlices();
  expect(saved.sha256).toBe(createHash("sha256").update(fixture).digest("hex"));
  expect(saved.byteLength).toBe(fixture.length);
  expect(saved.pads).toHaveLength(8);
  expect(saved.pads.every((pad) => pad.assetId !== null)).toBe(true);
  expect(saved.pads[0]?.endFrame).toBe(5900);
  expect(saved.pads[1]?.startFrame).toBe(6100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  expect(await readSlices()).toEqual(saved);
});
