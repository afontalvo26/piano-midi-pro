import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 780 }, hasTouch: true, isMobile: true });

test("duplicar sección táctil copia audio absoluto, crossfade, comp y curva con un Undo", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { Arrangement } = await import("/src/components/beatmaker/Arrangement.tsx");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { validateProjectDocument } = await import("/src/project/validate.ts");
    document.getElementById("root")?.remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "arr-section-audio-mount";
    document.body.append(mount);
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const track = { id: "voice-track", name: "Voz", kind: "audio", mix };
    const asset = (id: string) => ({ id, sha256: "a".repeat(64), byteLength: 192044,
      mimeType: "audio/wav", sourceKind: "recorded", license: "Propio", frameCount: 96000,
      sampleRate: 48000, channelCount: 1 });
    const take = (id: string, assetId: string, startTick: number, startAudioTime: number) => ({
      id, kind: "audio", assetId, createdAt: 1000, audioCapture: { startTick, startAudioTime,
        frameCount: 96000, sampleRate: 48000, channelCount: 1,
        latencyOffsetFrames: 480, incomplete: false } });
    const audioClip = (id: string, sourceId: string, sourceTakeId: string,
      startTick: number, absoluteStartUs: number) => ({
      id, kind: "audio", trackId: track.id, sourceId, sourceTakeId,
      startTick, lengthTicks: 3840, sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut",
      transpose: 0, gainDb: 0, muted: false, timeMode: "absolute", absoluteStartUs,
      absoluteEndUs: absoluteStartUs + 2_000_000, sourceStartFrame: 0,
      sourceEndFrame: 96000, fadeInFrames: 0, fadeOutFrames: 0 });
    const voiceA = audioClip("voice-a", "asset-a", "take-a", 1901, 990_000);
    const voiceB = audioClip("voice-b", "asset-b", "take-b", 4781, 2_490_000);
    let project = { ...createProjectDocument({ id: "arr-section-audio" }),
      tracks: [track], trackOrder: [track.id], assets: [asset("asset-a"), asset("asset-b")],
      takes: [take("take-a", "asset-a", 1920, 1), take("take-b", "asset-b", 4800, 2.5)],
      clips: [voiceA, voiceB], sections: [{ id: "section-a", name: "Verso",
        startTick: 0, lengthTicks: 9600 }],
      audioCrossfades: [{ id: "voice-fade", outgoingClipId: voiceA.id,
        incomingClipId: voiceB.id, curve: "equalPower" }],
      audioComps: [{ id: "voice-comp", name: "Voz elegida", trackId: track.id,
        segments: [{ id: "seg-a", clipId: voiceA.id, takeId: "take-a" },
          { id: "seg-b", clipId: voiceB.id, takeId: "take-b" }] }],
      automation: [{ id: "voice-lane", target: { scope: "clip", ownerId: voiceA.id,
        parameterId: "gainDb" }, points: [{ id: "voice-point", tick: 120,
        value: -3, shape: "linear" }] }] };
    validateProjectDocument(project);
    const original = structuredClone(project);
    let inverse: ReturnType<typeof applyCommand>["inverse"] | null = null;
    let error = "";
    const root = ReactDOM.createRoot(mount);
    const render = () => root.render(React.createElement(Arrangement, { document: project,
      playheadTick: 0, canUndo: !!inverse,
      onCommand: (command: Parameters<typeof applyCommand>[1]) => {
        try {
          const result = applyCommand(project, command);
          project = result.document;
          inverse = result.inverse;
          render();
        } catch (cause) { error = String(cause); }
      },
      onUndo: () => {
        if (!inverse) return;
        const result = applyCommand(project, inverse);
        project = result.document;
        inverse = null;
        render();
      } }));
    render();
    window.__arrSectionAudio = { snapshot: () => project, original: () => original,
      error: () => error };
  });

  const arrangement = page.getByRole("region", { name: "Arreglo" });
  await expect(arrangement).toBeVisible();
  await arrangement.getByRole("button", { name: "Verso" }).tap();
  await arrangement.getByRole("button", { name: "Duplicar sección y contenido" }).tap();
  await expect.poll(async () => page.evaluate(() => window.__arrSectionAudio.snapshot().sections.length)).toBe(2);
  const project = await page.evaluate(() => window.__arrSectionAudio.snapshot());
  expect(project.clips).toHaveLength(4);
  expect(project.audioCrossfades).toHaveLength(2);
  expect(project.audioComps).toHaveLength(2);
  expect(project.automation).toHaveLength(2);
  const copied = project.clips.slice(2);
  expect(copied.map((clip) => [clip.absoluteStartUs, clip.absoluteEndUs])).toEqual([
    [5_990_000, 7_990_000], [7_490_000, 9_490_000],
  ]);
  expect(project.audioCrossfades[1].outgoingClipId).toBe(copied[0].id);
  expect(project.audioCrossfades[1].incomingClipId).toBe(copied[1].id);
  expect(project.audioComps[1].segments.map((segment) => segment.clipId)).toEqual(copied.map((clip) => clip.id));
  expect(project.automation[1].target.ownerId).toBe(copied[0].id);
  expect(project.automation[1].points[0].tick).toBe(120);
  expect(await page.evaluate(() => window.__arrSectionAudio.error())).toBe("");
  await arrangement.getByRole("button", { name: "Deshacer" }).tap();
  expect(await page.evaluate(() => window.__arrSectionAudio.snapshot())).toEqual(
    await page.evaluate(() => window.__arrSectionAudio.original()));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth)).toBe(true);
});
