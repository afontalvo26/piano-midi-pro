import { expect, test } from "@playwright/test";

test("user sampler voice policy and exact source bytes survive portable bundle", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/bundle.ts");
  const name = `sample-voice-bundle-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (databaseName) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { exportProjectBundle, importProjectBundle } = await import("/src/project/bundle.ts");
    const repository = new ProjectRepository({ databaseName });
    const frames = 100;
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
    for (let index = 0; index < frames; index++) view.setInt16(44 + index * 2, index * 100, true);
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const asset = { id: "own-sample", sha256, byteLength: bytes.length,
      mimeType: "audio/wav", sourceKind: "user" as const, license: "user-owned",
      frameCount: frames, sampleRate: 48_000, channelCount: 1 };
    await repository.stageAsset(asset, new Blob([bytes], { type: "audio/wav" }));
    const sampleVoice = { mode: "mono" as const, retrigger: "legato" as const,
      glideMs: 180, attackMs: 12, releaseMs: 0 };
    const sampleRegion = { startFrame: 0, endFrame: frames,
      fadeInFrames: 0, fadeOutFrames: 0, rootMidi: 60, cents: 0,
      reverse: false, loopMode: "loop" as const, playMode: "gate" as const };
    const base = createProjectDocument({ id: "sampler-original", at: 1000 });
    const document = { ...base, assets: [asset], trackOrder: ["sampler"], tracks: [{
      id: "sampler", name: "Muestra propia", kind: "instrument" as const,
      instrument: { instrumentId: "user-sampler", packageVersion: `sha256:${sha256}`,
        presetId: "asset:own-sample", sampleRegion, sampleVoice },
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
        sends: [], effects: [] },
    }] };
    await repository.commitRevision(document, 0);
    const bundle = await exportProjectBundle(repository, document.id);
    const imported = await importProjectBundle(repository, bundle,
      { id: "sampler-restored", at: 2000 });
    const restored = await repository.read(imported.projectId);
    const restoredBytes = await repository.readAsset(imported.document.assets[0]);
    const exact = restoredBytes !== null && new Uint8Array(await restoredBytes.arrayBuffer())
      .every((value, index) => value === bytes[index]);
    await repository.close();
    for (const db of [databaseName, `${databaseName}-assets`]) {
      await new Promise<void>((resolve, reject) => {
        const deletion = indexedDB.deleteDatabase(db);
        deletion.onsuccess = () => resolve();
        deletion.onerror = () => reject(deletion.error);
      });
    }
    const instrument = restored?.status === "ready" ? restored.value.document.tracks[0].instrument : null;
    return { exact, bundleType: bundle.type,
      sampleVoice: instrument?.sampleVoice, sampleRegion: instrument?.sampleRegion,
      packageVersion: instrument?.packageVersion };
  }, name);
  expect(result).toEqual({ exact: true,
    bundleType: "application/vnd.piano-midi-pro.project",
    sampleVoice: { mode: "mono", retrigger: "legato", glideMs: 180,
      attackMs: 12, releaseMs: 0 },
    sampleRegion: { startFrame: 0, endFrame: 100, fadeInFrames: 0, fadeOutFrames: 0,
      rootMidi: 60, cents: 0, reverse: false, loopMode: "loop", playMode: "gate" },
    packageVersion: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) });
});
