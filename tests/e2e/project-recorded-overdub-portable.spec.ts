import { expect, test } from "@playwright/test";

test("overdub copies exact local SMF into a portable project and restores it by bundle", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/portableOverdub.ts");
  const suffix = crypto.randomUUID();
  const result = await page.evaluate(async (unique) => {
    const { RecordingLibrary } = await import("/src/midi/recordingLibrary.ts");
    const { MidiRecorder } = await import("/src/midi/recorder.ts");
    const { parseMidiMessage } = await import("/src/midi/message.ts");
    const { convertRecordedTake } = await import("/src/project/smfImport.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { commitPortableRecordedOverdub } = await import("/src/project/portableOverdub.ts");
    const { exportProjectBundle, importProjectBundle } = await import("/src/project/bundle.ts");
    const libraryName = `overdub-takes-${unique}`;
    const projectName = `overdub-project-${unique}`;
    const library = new RecordingLibrary({ databaseName: libraryName });
    const repository = new ProjectRepository({ databaseName: projectName });
    const recorder = new MidiRecorder();
    const event = (data: number[], at: number) => parseMidiMessage(Uint8Array.from(data), "smk37", at);
    recorder.start({ timeStamp: 1000, tempo: 120 });
    recorder.record(event([0x90, 60, 103], 1100));
    recorder.record(event([0xe0, 0, 80], 1200));
    recorder.record(event([0x80, 60, 42], 1400));
    const snapshot = recorder.stop(1500);
    await library.save(snapshot, recorder.toMidiBytes(), { id: "own-smf", createdAt: 1000, name: "Toma real" });
    const original = await library.getBytes("own-smf");
    let sequence = 0;
    const converted = await convertRecordedTake(library, "own-smf", {
      patternId: "converted", nextId: () => `converted-event-${sequence++}` });
    const base = createProjectDocument({ id: "original-project", at: 1000 });
    const pattern = { id: "target-pattern", name: "Beat", version: 1,
      lengthTicks: Math.max(3840, converted.pattern.lengthTicks), notes: [], expression: [] };
    const document = { ...base, patterns: [pattern] };
    const session = await ProjectSession.create(repository, document,
      { autosaveDelayMs: 60_000, draftDelayMs: 60_000 });
    const report = converted.report;
    const take = { id: "take-ref", kind: "midi" as const, recordingId: "own-smf",
      createdAt: 2000, midiImport: {
        sourceSha256: report.sourceSha256, sourceByteLength: report.sourceByteLength,
        sourcePpq: report.sourcePpq, tempoMap: converted.tempoMap, meterMap: converted.meterMap,
        sourceTempoEvents: report.sourceTempoEvents, sourceMeterEvents: report.sourceMeterEvents,
        roundedPositions: report.roundedPositions, ignoredMetaEvents: report.ignoredMetaEvents,
        ignoredSysExEvents: report.ignoredSysExEvents,
        normalizedZeroDurations: report.normalizedZeroDurations,
      } };
    const saved = await commitPortableRecordedOverdub(library, repository, session, {
      expectedVersion: 1, pattern: { ...pattern, version: 2,
        notes: converted.pattern.notes, expression: converted.pattern.expression },
      take, assetId: "source-smf-asset", at: 2000,
    });
    const sourceRef = saved.document.assets[0];
    const staged = await repository.readAsset(sourceRef);
    const bundle = await exportProjectBundle(repository, document.id);
    const restored = await importProjectBundle(repository, bundle, { id: "restored-project", at: 3000 });
    const restoredBlob = await repository.readAsset(restored.document.assets[0]);
    const after = await library.getBytes("own-smf");
    const match = (left: Uint8Array | null, right: Uint8Array | null) =>
      left !== null && right !== null && left.length === right.length &&
      left.every((value, index) => value === right[index]);
    const originalUnchanged = match(original, after);
    const stagedMatches = match(original,
      staged ? new Uint8Array(await staged.arrayBuffer()) : null);
    const restoredMatches = match(original,
      restoredBlob ? new Uint8Array(await restoredBlob.arrayBuffer()) : null);
    const bundleBytes = new Uint8Array(await bundle.arrayBuffer());
    bundleBytes[bundleBytes.length - 1] ^= 1;
    let tamperRejected = false;
    try { await importProjectBundle(repository, new Blob([bundleBytes]), { id: "tampered", at: 4000 }); }
    catch { tamperRejected = true; }
    await session.close();
    await library.close();
    await repository.close();
    for (const name of [libraryName, projectName, `${projectName}-assets`]) {
      await new Promise<void>((resolve, reject) => {
        const deletion = indexedDB.deleteDatabase(name);
        deletion.onsuccess = () => resolve();
        deletion.onerror = () => reject(deletion.error);
      });
    }
    return { originalUnchanged, stagedMatches, restoredMatches, tamperRejected,
      status: saved.status, takeAssetId: saved.document.takes[0].assetId,
      sourceNoteCount: saved.document.patterns[0].notes.length,
      sourceExpressionCount: saved.document.patterns[0].expression.length,
      restoredSourceTakeId: restored.document.patterns[0].notes[0]?.origin.sourceTakeId,
      bundleType: bundle.type };
  }, suffix);
  expect(result).toEqual({ originalUnchanged: true, stagedMatches: true,
    restoredMatches: true, tamperRejected: true, status: "clean",
    takeAssetId: "source-smf-asset", sourceNoteCount: 1,
    sourceExpressionCount: 1, restoredSourceTakeId: "take-ref",
    bundleType: "application/vnd.piano-midi-pro.project" });
});
