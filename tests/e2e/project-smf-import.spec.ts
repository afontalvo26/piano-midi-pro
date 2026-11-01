import { expect, test } from "@playwright/test";

test("an isolated historical take becomes an editable pattern without changing its MIDI bytes", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/smfImport.ts");
  const unique = crypto.randomUUID();
  const result = await page.evaluate(async (suffix) => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const { MidiRecorder } = await import("/src/midi/recorder.ts");
    const { parseMidiMessage } = await import("/src/midi/message.ts");
    const { convertRecordedTake } = await import("/src/project/smfImport.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const takeDb = `take-conversion-${suffix}`;
    const projectDb = `project-conversion-${suffix}`;
    const recorder = new MidiRecorder();
    recorder.start({ timeStamp: 1000, tempo: 120 });
    recorder.record(parseMidiMessage(Uint8Array.from([0x90, 60, 101]), "smk37-test", 1100));
    recorder.record(parseMidiMessage(Uint8Array.from([0x80, 60, 20]), "smk37-test", 1300));
    const snapshot = recorder.stop(1400);
    const bytes = recorder.toMidiBytes();
    const takes = new RecordingLibrary({ databaseName: takeDb });
    await takes.save(snapshot, bytes, { id: "take-1", createdAt: 1000, name: "Toma histórica" });
    const storedBefore = await takes.getBytes("take-1");
    const converted = await convertRecordedTake(takes, "take-1", { patternId: "pattern-from-take",
      nextId: (() => { let counter = 0; return () => `event-${counter++}`; })() });
    const project = createProjectDocument({ id: "project-from-take", at: 1000 });
    const withPattern = applyCommand(project, { kind: "createPattern", pattern: converted.pattern, at: 1100 });
    const repository = new ProjectRepository({ databaseName: projectDb });
    await repository.commitRevision(withPattern.document, 0);
    const reopened = await repository.read(project.id);
    const storedAfter = await takes.getBytes("take-1");
    const takeList = await takes.list();
    await repository.close();
    await takes.close();
    for (const database of [takeDb, projectDb]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return {
      bytesUnchanged: storedBefore?.every((byte, index) => byte === storedAfter?.[index]) ?? false,
      takeCount: takeList.length, takeName: takeList[0]?.name,
      sourcePitch: converted.pattern.notes[0]?.origin.sourcePitch ?? null,
      sourcePpq: converted.report.sourcePpq, sourceStartTick: converted.pattern.notes[0]?.origin.sourceStartTick,
      projectNoteCount: reopened?.status === "ready" ? reopened.value.document.patterns[0]?.notes.length : -1,
    };
  }, unique);
  expect(result).toEqual({ bytesUnchanged: true, takeCount: 1, takeName: "Toma histórica",
    sourcePitch: null, sourcePpq: 480, sourceStartTick: 96, projectNoteCount: 1 });
});
