import { expect, test } from "@playwright/test";

test("Pistas filtra y ordena tomas MIDI propias en móvil", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/src/midi/recordingLibrary.ts");
  await page.evaluate(async () => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const { MidiRecorder } = await import("/src/midi/recorder.ts");
    const { parseMidiMessage } = await import("/src/midi/message.ts");
    const library = new RecordingLibrary();
    for (const [index, name, inputName] of [
      [0, "Zeta", "SMK-37 Elite"], [1, "Alfa", "Controlador genérico"],
    ] as const) {
      const recorder = new MidiRecorder();
      recorder.start({ timeStamp: 1000, tempo: 120 });
      recorder.record(parseMidiMessage(Uint8Array.from([0x90, 60 + index, 100]), `port-${index}`, 1100));
      recorder.record(parseMidiMessage(Uint8Array.from([0x80, 60 + index, 0]), `port-${index}`, 1300));
      await library.save(recorder.stop(1500), recorder.toMidiBytes(), {
        id: `search-take-${index}`, name, createdAt: 1_800_000_000_000 + index,
        durationMs: 500, inputNames: { [`port-${index}`]: inputName },
      });
    }
    await library.close();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  const section = page.getByRole("region", { name: "Pistas de tus grabaciones MIDI" });
  await expect(section.getByRole("article")).toHaveCount(2);
  await section.getByRole("combobox", { name: "Ordenar tomas" }).selectOption("name");
  await expect(section.getByRole("article").first()).toContainText("Alfa");
  await section.getByRole("searchbox", { name: "Buscar tomas" }).fill("SMK-37");
  await expect(section.getByRole("article")).toHaveCount(1);
  await expect(section.getByRole("article")).toContainText("Zeta");
  await section.getByRole("searchbox", { name: "Buscar tomas" }).fill("ausente");
  await expect(section.getByText("Ninguna toma coincide con la búsqueda.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
