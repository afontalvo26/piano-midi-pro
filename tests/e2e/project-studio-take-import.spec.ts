import { expect, test } from "@playwright/test";

test("toma MIDI propia se convierte en pistas editables sin alterar sus bytes", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/src/midi/recordingLibrary.ts");
  const originalHash = await page.evaluate(async () => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const { MidiRecorder } = await import("/src/midi/recorder.ts");
    const { parseMidiMessage } = await import("/src/midi/message.ts");
    const message = (bytes: number[], at: number) =>
      parseMidiMessage(Uint8Array.from(bytes), "smk37-elite", at);
    const recorder = new MidiRecorder();
    recorder.start({ timeStamp: 1000, tempo: 96 });
    recorder.record(message([0x90, 60, 100], 1100));
    recorder.record(message([0x99, 36, 115], 1120));
    recorder.record(message([0x99, 35, 105], 1130));
    recorder.record(message([0x80, 60, 0], 1300));
    recorder.record(message([0x89, 36, 0], 1320));
    recorder.record(message([0x89, 35, 0], 1330));
    const snapshot = recorder.stop(1600);
    const bytes = recorder.toMidiBytes();
    const library = new RecordingLibrary();
    await library.save(snapshot, bytes, { id: "take-own", name: "Ritmo del SMK-37",
      createdAt: Date.now(), durationMs: 600, inputNames: { "smk37-elite": "SMK-37 Elite" } });
    await library.close();
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  const takes = page.getByRole("region", { name: "Pistas de tus grabaciones MIDI" });
  await expect(takes.getByRole("heading", { name: "Ritmo del SMK-37" })).toBeVisible();
  await takes.getByRole("button", { name: "Añadir al proyecto" }).click();
  await expect(page.getByRole("region", { name: "Arreglo" })).toBeVisible();
  await expect(page.getByText("3 notas importadas", { exact: false })).toBeVisible();
  await expect(page.getByText("Batería sin muestra para notas MIDI 35", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Arreglo" }).locator(".arrangement__clip")).toHaveCount(4);

  const afterHash = await page.evaluate(async () => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const library = new RecordingLibrary();
    const bytes = await library.getBytes("take-own");
    await library.close();
    if (!bytes) return null;
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
  });
  expect(afterHash).toBe(originalHash);
});
