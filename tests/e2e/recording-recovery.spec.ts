import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("a failed recording save stays exportable and retries without duplicating the take", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.evaluate(async () => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const original = RecordingLibrary.prototype.save;
    (window as typeof window & { restoreRecordingSave?: () => void }).restoreRecordingSave = () => {
      RecordingLibrary.prototype.save = original;
    };
    RecordingLibrary.prototype.save = async () => {
      throw new DOMException("Cuota simulada", "QuotaExceededError");
    };
  });

  await page.getByRole("button", { name: /Grabar MIDI/ }).click();
  await page.locator(".white-keys-container .piano-key-element.white").first().click();
  await page.getByRole("button", { name: /Detener grabación/ }).click();

  await expect(page.getByRole("alert", { name: "" }).filter({ hasText: /sólo está en memoria/ })).toBeVisible();
  const exportButton = page.getByRole("button", { name: "Exportar última toma" });
  await expect(exportButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  expect(download.suggestedFilename()).toMatch(/\.mid$/);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("MThd");

  await page.getByRole("button", { name: /Grabar MIDI/ }).click();
  await expect(page.getByRole("button", { name: /Grabar MIDI/ })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Descartar toma sin guardar" }).click();
  await expect(page.getByRole("button", { name: "Reintentar guardado" })).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { restoreRecordingSave?: () => void }).restoreRecordingSave?.();
  });
  await page.getByRole("button", { name: "Reintentar guardado" }).click();
  await expect(page.getByRole("button", { name: "Reintentar guardado" })).toHaveCount(0);
  const stored = await page.evaluate(async () => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const db = new RecordingLibrary();
    const list = await db.list();
    const bytes = list[0] ? await db.getBytes(list[0].id) : null;
    await db.close();
    return { count: list.length, magic: bytes ? String.fromCharCode(...bytes.slice(0, 4)) : "" };
  });
  expect(stored).toEqual({ count: 1, magic: "MThd" });

  await page.evaluate(async () => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    RecordingLibrary.prototype.save = async () => { throw new Error("Fallo simulado"); };
  });
  await page.getByRole("button", { name: /Grabar MIDI/ }).click();
  await page.locator(".white-keys-container .piano-key-element.white").first().click();
  await page.getByRole("button", { name: /Detener grabación/ }).click();
  await expect(page.getByRole("button", { name: "Descartar toma sin guardar" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Descartar toma sin guardar" }).click();
  await expect(page.getByRole("button", { name: "Reintentar guardado" })).toHaveCount(0);
  await expect(exportButton).toBeDisabled();
  await page.evaluate(() => {
    (window as typeof window & { restoreRecordingSave?: () => void }).restoreRecordingSave?.();
  });
  await page.getByRole("button", { name: /Grabar MIDI/ }).click();
  await expect(page.getByRole("button", { name: /Detener grabación/ })).toBeVisible();
  await page.getByRole("button", { name: /Detener grabación/ }).click();
});

test("failed rename and delete keep their controls open and show the error", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  const id = await page.evaluate(async () => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const { MidiRecorder } = await import("/src/midi/recorder.ts");
    const { parseMidiMessage } = await import("/src/midi/message.ts");
    const recorder = new MidiRecorder();
    recorder.start({ timeStamp: 100, tempo: 120 });
    recorder.record(parseMidiMessage(Uint8Array.of(0x90, 60, 100), "qa", 120));
    recorder.record(parseMidiMessage(Uint8Array.of(0x80, 60, 0), "qa", 220));
    const snapshot = recorder.stop(250);
    const id = `qa-ui-failure-${crypto.randomUUID()}`;
    const db = new RecordingLibrary();
    await db.save(snapshot, recorder.toMidiBytes(), { id, name: "QA UI", createdAt: Date.now() });
    await db.close();
    return id;
  });

  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "QA UI" })).toBeVisible();
  await page.evaluate(async () => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const rename = RecordingLibrary.prototype.rename;
    const remove = RecordingLibrary.prototype.delete;
    (window as typeof window & { restoreRecordingActions?: () => void }).restoreRecordingActions = () => {
      RecordingLibrary.prototype.rename = rename;
      RecordingLibrary.prototype.delete = remove;
    };
    RecordingLibrary.prototype.rename = async () => { throw new Error("Fallo renombrar simulado"); };
    RecordingLibrary.prototype.delete = async () => { throw new Error("Fallo borrar simulado"); };
  });

  await page.getByRole("button", { name: "Renombrar" }).click();
  await page.getByRole("textbox", { name: "Nombre de la toma" }).fill("Otro nombre");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("textbox", { name: "Nombre de la toma" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Fallo renombrar simulado");
  await page.locator(".recorded-tracks__rename").getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Borrar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar borrado" }).click();
  await expect(page.getByRole("button", { name: "Confirmar borrado" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Fallo borrar simulado");
  await expect(page.getByRole("heading", { name: "QA UI" })).toBeVisible();

  await page.evaluate(async (takeId) => {
    (window as typeof window & { restoreRecordingActions?: () => void }).restoreRecordingActions?.();
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const db = new RecordingLibrary();
    await db.delete(takeId);
    await db.close();
  }, id);
});
