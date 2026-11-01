import { expect, test } from "@playwright/test";

test("un borrador verificado se recupera como copia sin sobrescribir el proyecto", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await expect(page.getByRole("region", { name: "Piano roll" })).toBeVisible();
  await page.evaluate(async () => {
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const repository = new ProjectRepository();
    const project = (await repository.list())[0]!;
    const current = await repository.read(project.id);
    if (!current || current.status !== "ready") throw new Error("Revisión ausente");
    const draft = structuredClone(current.value.document);
    Object.assign(draft, {
      tracks: draft.tracks.map((track) => track.kind === "instrument"
        ? { ...track, name: "Piano recuperado" } : track),
      updatedAt: Date.now(),
    });
    await repository.writeDraft(draft, current.value.revision, "simulated-crash", 1);
    await repository.close();
  });

  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  const browser = page.getByRole("region", { name: "Tus proyectos" });
  await browser.getByRole("button", { name: "Borradores" }).click();
  await expect(browser.getByText("hash verificado")).toBeVisible();
  await browser.getByRole("button", { name: "Recuperar como copia" }).click();
  await expect(page.getByRole("region", { name: "Piano roll" })).toContainText("Piano recuperado");
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await expect(browser.getByText("Proyecto sin título", { exact: true })).toBeVisible();
  await expect(browser.getByText("Proyecto sin título recuperado", { exact: true })).toBeVisible();
});
