import { expect, test } from "@playwright/test";

test("mixed historical take imports atomically into drum and piano tracks without changing bytes", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/takeImport.ts");
  const suffix = crypto.randomUUID();
  const result = await page.evaluate(async (unique) => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const { MidiRecorder } = await import("/src/midi/recorder.ts");
    const { parseMidiMessage } = await import("/src/midi/message.ts");
    const { convertRecordedTake } = await import("/src/project/smfImport.ts");
    const { prepareRecordedTakeImport } = await import("/src/project/takeImport.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { PROJECT_PIANO_INSTRUMENT, PROJECT_DRUM_INSTRUMENT } = await import("/src/audio/projectAudioSink.ts");
    const takeDb = `mixed-take-${unique}`;
    const projectDb = `mixed-project-${unique}`;
    const recorder = new MidiRecorder();
    const event = (data: number[], at: number) => parseMidiMessage(Uint8Array.from(data), "own-controller", at);
    recorder.start({ timeStamp: 1000, tempo: 120 });
    recorder.record(event([0x90, 60, 104], 1100));
    recorder.record(event([0x99, 36, 115], 1150));
    recorder.record(event([0xb0, 64, 127], 1200));
    recorder.record(event([0xb9, 7, 95], 1250));
    recorder.record(event([0x89, 36, 12], 1300));
    recorder.record(event([0x99, 35, 80], 1350));
    recorder.record(event([0x89, 35, 5], 1400));
    recorder.record(event([0x80, 60, 18], 1450));
    const recorderSnapshot = recorder.stop(1500);
    const bytes = recorder.toMidiBytes();
    const takes = new RecordingLibrary({ databaseName: takeDb });
    await takes.save(recorderSnapshot, bytes, { id: "own-take", createdAt: 1000, name: "Beat propio" });
    const before = await takes.getBytes("own-take");
    let eventId = 0;
    const converted = await convertRecordedTake(takes, "own-take", { patternId: "import-pattern",
      nextId: () => `source-event-${eventId++}` });
    let id = 0;
    const prepared = prepareRecordedTakeImport(converted, { takeId: "own-take", at: 2000,
      pianoInstrument: PROJECT_PIANO_INSTRUMENT, drumInstrument: PROJECT_DRUM_INSTRUMENT,
      nextId: () => `import-id-${id++}` });
    const original = createProjectDocument({ id: "mixed-project", at: 1000 });
    let wrongRoutingRejected = false;
    try {
      applyCommand(original, { ...prepared.command, tracks: prepared.command.tracks.map((track) =>
        track.kind === "drum" ? { ...track, instrument: PROJECT_PIANO_INSTRUMENT } : track) });
    } catch { wrongRoutingRejected = true; }
    const repository = new ProjectRepository({ databaseName: projectDb });
    const session = await ProjectSession.create(repository, original, { autosaveDelayMs: 60_000 });
    session.dispatch(prepared.command);
    const imported = session.getSnapshot();
    session.undo();
    const undone = session.getSnapshot();
    session.redo();
    const redone = session.getSnapshot();
    await session.save();
    await session.close();
    const loaded = await repository.read(original.id);
    const after = await takes.getBytes("own-take");
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
    const persisted = loaded?.status === "ready" ? loaded.value.document : null;
    return {
      originalBytes: before?.every((byte, index) => byte === after?.[index]) ?? false,
      takeListCount: takeList.length, wrongRoutingRejected,
      imported: { tracks: imported.document.tracks.map((track) => [track.kind, track.instrument?.instrumentId]),
        pianoChannels: imported.document.patterns[0]?.notes.map((note) => note.channel),
        drumChannels: imported.document.patterns[1]?.notes.map((note) => note.channel),
        pianoExpressionChannels: imported.document.patterns[0]?.expression.map((event) => event.channel),
        drumExpressionChannels: imported.document.patterns[1]?.expression.map((event) => event.channel),
        tempoUnchanged: imported.document.tempoMap[0]?.microsPerQuarter === 500000,
        sourcePpq: imported.document.takes[0]?.midiImport?.sourcePpq,
        sourceTempoEvents: imported.document.takes[0]?.midiImport?.sourceTempoEvents.length,
      },
      undone: [undone.document.tracks.length, undone.document.patterns.length,
        undone.document.clips.length, undone.document.takes.length],
      redone: [redone.document.tracks.length, redone.document.patterns.length,
        redone.document.clips.length, redone.document.takes.length],
      persistedIdsMatch: persisted?.patterns.every((pattern, index) => pattern.id === redone.document.patterns[index]?.id),
      unsupportedDrumPitches: prepared.unsupportedDrumPitches,
    };
  }, suffix);
  expect(result).toEqual({
    originalBytes: true, takeListCount: 1, wrongRoutingRejected: true,
    imported: { tracks: [["instrument", "salamander-grand"], ["drum", "virtuosity-core"]],
      pianoChannels: [0], drumChannels: [9, 9], pianoExpressionChannels: [0, 0],
      drumExpressionChannels: [9], tempoUnchanged: true, sourcePpq: 480, sourceTempoEvents: 1 },
    undone: [0, 0, 0, 0], redone: [2, 2, 2, 1], persistedIdsMatch: true,
    unsupportedDrumPitches: [35],
  });
});
