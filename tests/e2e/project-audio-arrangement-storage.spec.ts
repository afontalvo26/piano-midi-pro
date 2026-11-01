import { expect, test } from "@playwright/test";

test("absolute audio and crossfade persist, reproject on tempo edit, and survive portable bundle", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/bundle.ts");
  const name = `audio-arrangement-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (databaseName) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { exportProjectBundle, importProjectBundle } = await import("/src/project/bundle.ts");
    const repository = new ProjectRepository({ databaseName });
    const wav = (sample: number) => {
      const frames = 192_000;
      const bytes = new Uint8Array(44 + frames * 2);
      const view = new DataView(bytes.buffer);
      const fourcc = (at: number, value: string) => value.split("").forEach((char, index) =>
        { bytes[at + index] = char.charCodeAt(0); });
      fourcc(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); fourcc(8, "WAVE");
      fourcc(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, 48_000, true);
      view.setUint32(28, 96_000, true); view.setUint16(32, 2, true);
      view.setUint16(34, 16, true); fourcc(36, "data");
      view.setUint32(40, frames * 2, true);
      for (let index = 0; index < frames; index++) view.setInt16(44 + index * 2, sample, true);
      return bytes;
    };
    const refs = [];
    for (const [id, sample] of [["audio-one", 1000], ["audio-two", -1000]] as const) {
      const bytes = wav(sample);
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (value) => value.toString(16).padStart(2, "0")).join("");
      const ref = { id, sha256, byteLength: bytes.length, mimeType: "audio/wav",
        sourceKind: "recorded" as const, license: "user-owned", frameCount: 192_000,
        sampleRate: 48_000, channelCount: 1 };
      await repository.stageAsset(ref, new Blob([bytes], { type: "audio/wav" }));
      refs.push(ref);
    }
    const base = createProjectDocument({ id: "audio-original", at: 1000 });
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false,
      armed: false, sends: [], effects: [] };
    const clip = (id: string, sourceId: string, startTick: number, startUs: number,
      endUs: number) => ({ id, kind: "audio" as const, trackId: "audio",
      sourceId, startTick, lengthTicks: 3840, sourceOffsetTick: 0,
      loopMode: "none" as const, tailPolicy: "continue" as const,
      transpose: 0, gainDb: 0, muted: false, timeMode: "absolute" as const,
      absoluteStartUs: startUs, absoluteEndUs: endUs,
      sourceStartFrame: 0, sourceEndFrame: 96_000,
      fadeInFrames: 240, fadeOutFrames: 240 });
    const first = clip("first-clip", "audio-one", 0, 0, 2_000_000);
    const second = clip("second-clip", "audio-two", 2880, 1_500_000, 3_500_000);
    const document = { ...base, assets: refs, trackOrder: ["audio"],
      tracks: [{ id: "audio", name: "Audio", kind: "audio" as const, mix }],
      clips: [first, second], audioCrossfades: [{ id: "fade", outgoingClipId: first.id,
        incomingClipId: second.id, curve: "equalPower" as const }] };
    const session = await ProjectSession.create(repository, document,
      { autosaveDelayMs: 60_000, draftDelayMs: 60_000 });
    session.dispatch({ kind: "replaceTempoMap", at: 2000,
      tempoMap: [{ tick: 0, microsPerQuarter: 1_000_000 }] });
    const shifted = session.getSnapshot().document;
    await session.save();
    const bundle = await exportProjectBundle(repository, document.id);
    const imported = await importProjectBundle(repository, bundle, { id: "audio-restored", at: 3000 });
    const stored = await repository.read(imported.projectId);
    session.dispatch({ kind: "replaceAudioArrangement", at: 4000,
      expected: { clips: shifted.clips, audioCrossfades: shifted.audioCrossfades },
      clips: shifted.clips, audioCrossfades: [] });
    session.dispatch({ kind: "splitAudioClip", clipId: first.id,
      newClipId: "split-clip", splitUs: 1_000_000, at: 5000 });
    const split = session.getSnapshot().document;
    session.undo();
    const undoCount = session.getSnapshot().document.clips.length;
    session.redo();
    await session.save();
    const splitBundle = await exportProjectBundle(repository, document.id);
    const splitImported = await importProjectBundle(repository, splitBundle,
      { id: "audio-split-restored", at: 6000 });
    const persistedSplit = await repository.read(splitImported.projectId);
    await session.close();
    await repository.close();
    for (const db of [databaseName, `${databaseName}-assets`]) {
      await new Promise<void>((resolve, reject) => {
        const deletion = indexedDB.deleteDatabase(db);
        deletion.onsuccess = () => resolve();
        deletion.onerror = () => reject(deletion.error);
      });
    }
    return {
      shifted: shifted.clips.map((item) => [item.startTick, item.lengthTicks,
        item.absoluteStartUs, item.absoluteEndUs]),
      crossfade: shifted.audioCrossfades?.[0]?.curve,
      restored: stored?.status === "ready" ? {
        clips: stored.value.document.clips.length,
        crossfades: stored.value.document.audioCrossfades?.length,
        timeMode: stored.value.document.clips[0]?.kind === "audio"
          ? stored.value.document.clips[0].timeMode : undefined,
      } : null,
      splitFrames: split.clips.filter((item) => item.sourceId === first.sourceId)
        .map((item) => item.kind === "audio" ? [item.sourceStartFrame,
          item.sourceEndFrame, item.envelopeStartFrame, item.envelopeEndFrame] : []),
      undoCount,
      persistedSplitCount: persistedSplit?.status === "ready"
        ? persistedSplit.value.document.clips.length : -1,
      bundleType: bundle.type,
    };
  }, name);
  expect(result).toEqual({ shifted: [[0, 1920, 0, 2_000_000],
    [1440, 1920, 1_500_000, 3_500_000]], crossfade: "equalPower",
  restored: { clips: 2, crossfades: 1, timeMode: "absolute" },
  splitFrames: [[0, 48_000, 0, 96_000], [48_000, 96_000, 0, 96_000]],
  undoCount: 2, persistedSplitCount: 3,
  bundleType: "application/vnd.piano-midi-pro.project" });
});
