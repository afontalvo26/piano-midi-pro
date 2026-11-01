import { expect, test } from "@playwright/test";

test("IndexedDB keeps completed takes, renames and deletes metadata with MIDI bytes", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  // Establish the dev-server origin without mounting App while it is refactored.
  await page.goto("/src/midi/recordingLibrary.ts");
  const databaseName = `recording-library-e2e-${Date.now()}`;

  const result = await page.evaluate(async (name) => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const { MidiRecorder } = await import("/src/midi/recorder.ts");
    const { parseMidiMessage } = await import("/src/midi/message.ts");
    const event = (data: number[], timeStamp: number) =>
      parseMidiMessage(Uint8Array.from(data), "elite-main", timeStamp);
    const recorder = new MidiRecorder();
    recorder.start({ timeStamp: 1000, tempo: 96 });
    recorder.record(event([0x90, 60, 100], 1100));
    recorder.record(event([0xb0, 64, 127], 1150));
    recorder.record(event([0x80, 60, 0], 1300));
    recorder.record(event([0xb0, 64, 0], 1500));
    const snapshot = recorder.stop(1600);
    const bytes = recorder.toMidiBytes();

    const first = new RecordingLibrary({ databaseName: name });
    await first.save(snapshot, bytes, {
      id: "first-take", name: "Primera toma", createdAt: 1_800_000_000_000,
      durationMs: 600, inputNames: { "elite-main": "SMK-37 Elite" },
    });
    await first.close();

    const reopened = new RecordingLibrary({ databaseName: name });
    const savedList = await reopened.list();
    const storedBytes = await reopened.getBytes("first-take");
    let duplicateRejected = false;
    try {
      await reopened.save(snapshot, bytes, { id: "first-take", createdAt: 1_800_000_000_001 });
    } catch {
      duplicateRejected = true;
    }
    const afterDuplicate = await reopened.list();
    const bytesAfterDuplicate = await reopened.getBytes("first-take");
    const renamed = await reopened.rename("first-take", "  Toma final  ");
    await reopened.delete("first-take");
    const afterDelete = await reopened.list();
    const bytesAfterDelete = await reopened.getBytes("first-take");
    await reopened.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    return {
      savedList,
      byteLength: storedBytes?.byteLength ?? 0,
      duplicateRejected,
      afterDuplicateCount: afterDuplicate.length,
      bytesAfterDuplicateEqual: bytesAfterDuplicate?.every((byte, index) => byte === bytes[index]) ?? false,
      renamedName: renamed.name,
      afterDeleteCount: afterDelete.length,
      bytesAfterDelete,
    };
  }, databaseName);

  expect(result.savedList).toHaveLength(1);
  expect(result.savedList[0]).toMatchObject({
    id: "first-take", name: "Primera toma", durationMs: 600, tempoBpm: 96,
    eventCount: 4, tracks: [{ inputName: "SMK-37 Elite", channel: 0, noteCount: 1 }],
  });
  expect(result.byteLength).toBeGreaterThan(14);
  expect(result.duplicateRejected).toBe(true);
  expect(result.afterDuplicateCount).toBe(1);
  expect(result.bytesAfterDuplicateEqual).toBe(true);
  expect(result.renamedName).toBe("Toma final");
  expect(result.afterDeleteCount).toBe(0);
  expect(result.bytesAfterDelete).toBeNull();
});
