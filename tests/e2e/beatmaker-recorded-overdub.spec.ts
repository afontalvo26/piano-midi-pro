import { expect, test } from "@playwright/test";

test("toma guardada previsualiza destino y se agrega con un undo sin alterar Pistas a 320 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { RecordedOverdubPanel } = await import("/src/components/beatmaker/RecordedOverdubPanel.tsx");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "overdub-mount";
    document.body.append(mount);
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const track = { id: "piano", name: "Piano propio", kind: "instrument", mix };
    const pattern = { id: "pattern", name: "Hook", version: 1, lengthTicks: 3840,
      notes: [], expression: [] };
    const clip = { id: "clip", kind: "pattern", trackId: track.id, sourceId: pattern.id,
      sourceVersion: 1, startTick: 0, lengthTicks: 3840, sourceOffsetTick: 0,
      loopMode: "loop", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false };
    let project = { ...createProjectDocument({ id: "overdub-e2e" }),
      tracks: [track], trackOrder: [track.id], patterns: [pattern],
      clips: [clip, { ...clip, id: "shared", startTick: 3840 }],
      tempoMap: [{ tick: 0, microsPerQuarter: 1_000_000 }] };
    const savedBytes = Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 1, 0xe0]);
    const bytesBefore = savedBytes.slice();
    const converted = { pattern: { id: "source", name: "Toma propia", version: 1,
      lengthTicks: 481, notes: [{ id: "source-note", startTick: 0, durationTick: 480,
        pitch: 60, velocity: 100, releaseVelocity: 64, channel: 0,
        origin: { kind: "imported", playedPitch: 60, sourcePpq: 480,
          sourceStartTick: 0, sourceDurationTick: 240, sourceTrackIndex: 1,
          sourceSequence: 0, originalVelocity: 100 } }], expression: [] },
      tempoMap: [{ tick: 0, microsPerQuarter: 500_000 }],
      meterMap: [{ tick: 0, numerator: 4, denominator: 4 }],
      report: { takeId: "own-take", sourceSha256: "a".repeat(64),
        sourceByteLength: savedBytes.length, sourcePpq: 480, trackCount: 2,
        noteCount: 1, expressionCount: 0, ignoredMetaEvents: 0, ignoredSysExEvents: 0,
        roundedPositions: 0, normalizedZeroDurations: 0, defaultTempoInserted: false,
        defaultMeterInserted: false, sourceTempoEvents: [], sourceMeterEvents: [] } };
    let propTick = 10;
    let inverse = null;
    let commitCount = 0;
    const root = ReactDOM.createRoot(mount);
    const render = () => root.render(React.createElement(RecordedOverdubPanel, {
      document: project, trackId: track.id, patternId: pattern.id, projectStartTick: propTick,
      takes: [{ id: "own-take", name: "Mi toma", durationMs: 250, tempoBpm: 120 },
        { id: "historic-take", name: "Toma histórica", durationMs: 250, tempoBpm: 120 }],
      startTickForTake: (recordingId) => recordingId === "historic-take" ? 480 : 10,
      onLoadTake: async () => converted,
      onCommit: async (request) => {
        const asset = { id: "smf-asset", sha256: "a".repeat(64), byteLength: savedBytes.length,
          mimeType: "audio/midi", sourceKind: "recorded", license: "user-owned" };
        const result = applyCommand(project, { kind: "overdubRecordedTake", ...request,
          take: { ...request.take, assetId: asset.id }, asset });
        project = result.document;
        inverse = result.inverse;
        commitCount++;
        render();
      },
    }));
    render();
    window.__overdubE2e = { snapshot: () => project, commits: () => commitCount,
      advanceTick: (tick) => { propTick = tick; render(); },
      bytesUnchanged: () => savedBytes.every((byte, index) => byte === bytesBefore[index]),
      undo: () => { const result = applyCommand(project, inverse); project = result.document; render(); } };
  });
  const panel = page.getByRole("region", { name: "Agregar toma al patrón" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Confirmar toma en patrón" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Previsualizar destino" }).click();
  await expect(panel.getByText("Destino confirmado antes de escribir")).toBeVisible();
  await expect(panel.getByText("Piano propio / Hook")).toBeVisible();
  await expect(panel.getByText("Este patrón tiene 2 clips compartidos.", { exact: false })).toBeVisible();
  await expect(panel.getByText("PPQ 480 → 960", { exact: false })).toBeVisible();
  const startTick = panel.getByRole("spinbutton", { name: "Inicio del overdub · tick" });
  await expect(startTick).toHaveValue("10");
  await page.evaluate(() => window.__overdubE2e.advanceTick(11));
  await expect(startTick).toHaveValue("10");
  await expect(panel.getByRole("button", { name: "Confirmar toma en patrón" })).toBeVisible();
  await startTick.fill("-1");
  await expect(panel.getByRole("button", { name: "Confirmar toma en patrón" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Previsualizar destino" })).toBeDisabled();
  await startTick.fill("960");
  await panel.getByRole("button", { name: "Previsualizar destino" }).click();
  await expect(panel.getByText("Tick 960")).toHaveCount(2);
  await panel.getByRole("button", { name: "Confirmar toma en patrón" }).click();
  await expect.poll(async () => page.evaluate(() => window.__overdubE2e.commits())).toBe(1);
  const snapshot = await page.evaluate(() => window.__overdubE2e.snapshot());
  expect(snapshot.patterns[0].version).toBe(2);
  expect(snapshot.patterns[0].notes).toHaveLength(1);
  expect(snapshot.patterns[0].notes[0].startTick).toBe(960);
  expect(snapshot.patterns[0].notes[0].durationTick).toBe(240);
  expect(snapshot.clips.map((item) => item.sourceVersion)).toEqual([2, 2]);
  expect(snapshot.takes).toHaveLength(1);
  expect(snapshot.assets).toHaveLength(1);
  expect(await page.evaluate(() => window.__overdubE2e.bytesUnchanged())).toBe(true);
  await page.evaluate(() => window.__overdubE2e.undo());
  const undone = await page.evaluate(() => window.__overdubE2e.snapshot());
  expect(undone.patterns[0].notes).toHaveLength(0);
  expect(undone.takes).toHaveLength(0);
  expect(undone.assets).toHaveLength(0);
  await panel.getByRole("combobox", { name: "Toma MIDI para agregar" }).selectOption("historic-take");
  await expect(startTick).toHaveValue("480");
  await panel.getByRole("button", { name: "Previsualizar destino" }).click();
  await expect(panel.getByText("Tick 480")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
