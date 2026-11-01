import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 780 }, hasTouch: true, isMobile: true });

test("audio beat/absolute, crossfade dual, split y undo funcionan en arreglo de 320 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { Arrangement } = await import("/src/components/beatmaker/Arrangement.tsx");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { applyCommand } = await import("/src/project/commands.ts");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    document.body.append(mount);
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const track = { id: "audio-track", name: "Voz", kind: "audio", mix };
    const asset = { id: "asset-voice", sha256: "a".repeat(64), byteLength: 96000,
      mimeType: "audio/wav", sourceKind: "recorded", license: "Propio", frameCount: 48000,
      sampleRate: 48000, channelCount: 1 };
    const outgoing = { id: "clip-out", kind: "audio", trackId: track.id, sourceId: asset.id,
      startTick: 0, lengthTicks: 1920, sourceOffsetTick: 0, loopMode: "none",
      tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false,
      sourceStartFrame: 0, sourceEndFrame: 48000, fadeInFrames: 0, fadeOutFrames: 0 };
    const incoming = { ...outgoing, id: "clip-in", startTick: 960, lengthTicks: 1920,
      timeMode: "absolute", absoluteStartUs: 499740, absoluteEndUs: 1499740,
      envelopeStartFrame: 0, envelopeEndFrame: 48000 };
    let project = { ...createProjectDocument({ id: "arr-audio-ui" }),
      tracks: [track], trackOrder: [track.id], assets: [asset], clips: [outgoing, incoming] };
    let inverse = null;
    const root = ReactDOM.createRoot(mount);
    const render = () => root.render(React.createElement(Arrangement, { document: project,
      playheadTick: 1920, onCommand: (command) => {
        const result = applyCommand(project, command);
        project = result.document; inverse = result.inverse; render();
      }, onUndo: () => { const result = applyCommand(project, inverse);
        project = result.document; render(); }, canUndo: true }));
    render();
    window.__arrAudioE2e = { snapshot: () => project };
  });

  const arrangement = page.getByRole("region", { name: "Arreglo" });
  await expect(arrangement).toBeVisible();
  await arrangement.getByRole("button", { name: "Audio, tick 960, duración 1920" }).tap();
  await expect(arrangement.getByRole("combobox", { name: "Par de clips para crossfade" })).toBeVisible();
  await arrangement.getByRole("button", { name: "Crear crossfade" }).tap();
  await expect(arrangement.getByRole("button", { name: "Quitar crossfade" })).toBeVisible();
  expect((await page.evaluate(() => window.__arrAudioE2e.snapshot())).audioCrossfades).toHaveLength(1);
  await arrangement.getByRole("button", { name: "Quitar crossfade" }).tap();
  await expect(arrangement.getByRole("button", { name: "Crear crossfade" })).toBeVisible();
  expect((await page.evaluate(() => window.__arrAudioE2e.snapshot())).audioCrossfades).toHaveLength(0);

  await expect(arrangement.getByRole("combobox", { name: "Modo temporal del clip" })).toHaveValue("absolute");
  await arrangement.getByRole("spinbutton", { name: "Inicio absoluto del clip en microsegundos" }).fill("600000");
  await arrangement.getByRole("spinbutton", { name: "Fin absoluto del clip en microsegundos" }).fill("1600000");
  await expect(arrangement.getByText("Proyección actual: tick 1152–3072")).toBeVisible();
  await arrangement.getByRole("button", { name: "Aplicar audio" }).tap();
  await expect(arrangement.getByRole("button", { name: "Audio, tick 1152, duración 1920" })).toBeVisible();
  const moved = await page.evaluate(() => window.__arrAudioE2e.snapshot());
  expect(moved.clips.find((clip) => clip.id === "clip-in").absoluteStartUs).toBe(600000);
  await arrangement.getByRole("button", { name: "Cortar audio en cabezal" }).tap();
  const split = await page.evaluate(() => window.__arrAudioE2e.snapshot());
  expect(split.clips).toHaveLength(3);
  const children = split.clips.filter((clip) => clip.id !== "clip-out");
  expect(children[0].sourceEndFrame).toBe(children[1].sourceStartFrame);
  expect(children[0].absoluteEndUs).toBe(children[1].absoluteStartUs);
  await arrangement.getByRole("button", { name: "Deshacer" }).tap();
  expect((await page.evaluate(() => window.__arrAudioE2e.snapshot())).clips).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
