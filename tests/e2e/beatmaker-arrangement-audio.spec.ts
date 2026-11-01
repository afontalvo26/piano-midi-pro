import { expect, test } from "@playwright/test";

test("arreglo de audio a 320 px edita trim/fades, oculta modos inválidos y deshace", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { Arrangement } = await import("/src/components/beatmaker/Arrangement.tsx");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root")?.remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "arr-audio-mount";
    document.body.append(mount);
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const track = { id: "voice-track", name: "Voz", kind: "audio", mix };
    const asset = { id: "voice-asset", sha256: "a".repeat(64), byteLength: 4096,
      mimeType: "audio/wav", sourceKind: "recorded", license: "Propio", frameCount: 24000,
      sampleRate: 48000, channelCount: 1 };
    const clip = { id: "voice-clip", kind: "audio", trackId: track.id, sourceId: asset.id,
      startTick: 0, lengthTicks: 1920, sourceOffsetTick: 0, loopMode: "none",
      tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false,
      sourceStartFrame: 0, sourceEndFrame: 20000, fadeInFrames: 0, fadeOutFrames: 0 };
    let snapshot = { ...createProjectDocument({ id: "arr-audio-e2e", at: 1000 }),
      tracks: [track], trackOrder: [track.id], clips: [clip], assets: [asset] };
    let undo = null;
    const root = ReactDOM.createRoot(mount);
    const apply = (command) => {
      const result = applyCommand(snapshot, command);
      snapshot = result.document;
      undo = result.inverse;
      render();
    };
    const undoEdit = () => {
      if (!undo) return;
      const result = applyCommand(snapshot, undo);
      snapshot = result.document;
      undo = null;
      render();
    };
    function render() {
      root.render(React.createElement(Arrangement, { document: snapshot,
        onCommand: apply, onUndo: undoEdit, canUndo: !!undo }));
    }
    render();
    window.__arrAudioSnapshot = () => snapshot;
  });
  const arrangement = page.locator("#arr-audio-mount .arrangement");
  await expect(arrangement).toBeVisible();
  const clip = arrangement.locator(".arrangement__clip").first();
  await clip.focus();
  await page.keyboard.press("Enter");
  await expect(arrangement.getByText("Audio a velocidad original · sin ajuste automático al BPM")).toBeVisible();
  await expect(arrangement.getByLabel("Offset fuente · tick")).toHaveCount(0);
  await expect(arrangement.getByLabel("Transposición")).toHaveCount(0);
  await expect(arrangement.getByLabel("Repetir fuente")).toHaveCount(0);
  await arrangement.getByLabel("Inicio fuente · frame").fill("200");
  await arrangement.getByLabel("Fin fuente · frame").fill("19000");
  await arrangement.getByLabel("Entrada · frames").fill("240");
  await arrangement.getByLabel("Salida · frames").fill("480");
  await arrangement.getByRole("button", { name: "Aplicar cambios" }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrAudioSnapshot().clips[0].sourceStartFrame)).toBe(200);
  const saved = await page.evaluate(() => window.__arrAudioSnapshot().clips[0]);
  expect(saved.sourceEndFrame).toBe(19000);
  expect(saved.fadeInFrames).toBe(240);
  expect(saved.fadeOutFrames).toBe(480);
  await arrangement.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrAudioSnapshot().clips[0].sourceStartFrame)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
