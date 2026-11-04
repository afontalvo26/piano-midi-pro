import { expect, test } from "@playwright/test";

test("rack real de 16 pads edita pasos, fuente y ciclo a 320 px con teclado y undo", async ({ page }, testInfo) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { DrumMachine } = await import("/src/components/beatmaker/DrumMachine.tsx");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root")?.remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "rack-e2e-mount";
    document.body.append(mount);
    const asset = { id: "asset-kick", sha256: "a".repeat(64), byteLength: 4096,
      mimeType: "audio/wav", sourceKind: "user", license: "Propio", frameCount: 16000,
      sampleRate: 48000, channelCount: 1 };
    const source = { kind: "asset", assetId: asset.id, sha256: asset.sha256 };
    const pads = Array.from({ length: 16 }, (_, index) => ({
      id: `pad-${index}`, name: `Pad ${index + 1}`, color: "#8758ad", midiNote: 36 + index,
      channel: 9, source: index === 0 ? source : null, gainDb: 0, pan: 0,
      pitchSemitones: 0, startFrame: 0, attackMs: 0, decayMs: 20,
      playMode: "oneShot", mute: false, solo: false, stepTicks: 240, stepCount: 64,
    }));
    const track = { id: "track-drum", name: "Batería", kind: "drum", drumRack: { pads },
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
    const pattern = { id: "pattern-drum", name: "Ritmo", version: 1,
      lengthTicks: 15360, notes: [], expression: [] };
    const clip = { id: "clip-drum", trackId: track.id, kind: "pattern", sourceId: pattern.id,
      sourceVersion: 1, startTick: 0, lengthTicks: 15360, sourceOffsetTick: 0,
      loopMode: "none", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false };
    const initial = createProjectDocument({ id: "rack-e2e-project", at: 1000 });
    let documentSnapshot = { ...initial, tracks: [track], trackOrder: [track.id],
      patterns: [pattern], clips: [clip], assets: [asset] };
    let undo = null;
    let redo = null;
    let learnAction = null;
    const root = ReactDOM.createRoot(mount);
    const apply = (command) => {
      const result = applyCommand(documentSnapshot, command);
      documentSnapshot = result.document;
      undo = result.inverse;
      redo = null;
      render();
    };
    const undoEdit = () => {
      if (!undo) return;
      const result = applyCommand(documentSnapshot, undo);
      documentSnapshot = result.document;
      redo = result.inverse;
      undo = null;
      render();
    };
    const redoEdit = () => {
      if (!redo) return;
      const result = applyCommand(documentSnapshot, redo);
      documentSnapshot = result.document;
      undo = result.inverse;
      redo = null;
      render();
    };
    function render() {
      const current = documentSnapshot.tracks[0];
      const statuses = current.drumRack.pads.map((pad) => ({ padId: pad.id,
        note: pad.midiNote, channel: pad.channel, label: pad.name,
        assetStatus: pad.source ? "ready" : "error", sourceLabel: pad.source ? "Muestra propia" : "Sin fuente",
        error: pad.source ? null : "Pad sin muestra asignada", muted: pad.mute }));
      root.render(React.createElement(DrumMachine, {
        document: documentSnapshot, track: current, pattern: documentSnapshot.patterns[0],
        pads: [], padStatuses: statuses, sourceOptions: [{ id: "own-kick", label: "Kick propio", source }],
        saveState: "clean", onCommand: apply, onUndo: undoEdit, onRedo: redoEdit,
        canUndo: !!undo, canRedo: !!redo, midiLearnAction: learnAction,
        onMidiLearnPad: (padId) => { learnAction = `drum.pad:${padId}`; render(); },
        onCancelMidiLearn: () => { learnAction = null; render(); },
      }));
    }
    render();
    window.__rackE2eDocument = () => documentSnapshot;
    window.__rackE2eLearnAction = () => learnAction;
  });
  const rack = page.locator("#rack-e2e-mount .drum-rack");
  await expect(rack).toBeVisible();
  await expect(rack.locator(".drum-rack__pad")).toHaveCount(16);
  await expect(rack.locator(".drum-rack__step")).toHaveCount(256);
  await expect(rack.getByRole("button", { name: /Pad 2, paso 1,/ })).toBeDisabled();
  const first = rack.getByRole("button", { name: /Pad 1, paso 1, vacío/ });
  await first.focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => page.evaluate(() => window.__rackE2eDocument().patterns[0].notes.length)).toBe(1);
  await expect(rack.getByLabel("Velocidad", { exact: true })).toBeVisible();
  await rack.getByLabel("Velocidad", { exact: true }).fill("115");
  await rack.getByRole("button", { name: "Aplicar valores" }).click();
  await expect.poll(async () => page.evaluate(() => window.__rackE2eDocument().patterns[0].notes[0].velocity)).toBe(115);
  await rack.getByRole("button", { name: "Deshacer" }).click();
  await expect(rack.getByLabel("Velocidad", { exact: true })).toHaveValue("100");
  await rack.getByRole("button", { name: "Configurar Pad 1", exact: true }).click();
  const inspector = rack.getByRole("region", { name: "Configuración de pad" });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "MIDI Learn de este pad" }).click();
  await expect(inspector.getByRole("button", { name: "Cancelar MIDI Learn" })).toBeVisible();
  expect(await page.evaluate(() => window.__rackE2eLearnAction())).toBe("drum.pad:pad-0");
  await inspector.getByRole("button", { name: "Cancelar MIDI Learn" }).click();
  await expect(inspector.getByRole("button", { name: "MIDI Learn de este pad" })).toBeVisible();
  await inspector.getByLabel("Ganancia dB").fill("-5");
  await inspector.getByLabel("Pan −1 a 1").fill("0.25");
  await inspector.getByLabel("Tono semitonos").fill("-3");
  await inspector.getByLabel("Ataque ms").fill("4");
  await inspector.getByLabel("Decaimiento ms").fill("50");
  await inspector.getByLabel("Grupo choke").fill("hats");
  await inspector.getByLabel("Ticks por paso").fill("180");
  await inspector.getByLabel("Modo").selectOption("gate");
  await inspector.getByLabel("Silenciar").check();
  await inspector.getByRole("button", { name: "Guardar pad" }).click();
  await expect.poll(async () => page.evaluate(() => window.__rackE2eDocument().patterns[0].lengthTicks)).toBe(46080);
  const saved = await page.evaluate(() => window.__rackE2eDocument());
  expect(saved.tracks[0].drumRack.pads[0].gainDb).toBe(-5);
  expect(saved.tracks[0].drumRack.pads[0].pan).toBe(0.25);
  expect(saved.tracks[0].drumRack.pads[0].pitchSemitones).toBe(-3);
  expect(saved.tracks[0].drumRack.pads[0].playMode).toBe("gate");
  expect(saved.tracks[0].drumRack.pads[0].mute).toBe(true);
  expect(saved.tracks[0].drumRack.pads[0].chokeGroup).toBe("hats");
  expect(saved.clips[0].sourceVersion).toBe(3);
  await rack.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => page.evaluate(() => window.__rackE2eDocument().patterns[0].lengthTicks)).toBe(15360);
  expect(await page.evaluate(() => window.__rackE2eDocument().tracks[0].drumRack.pads[0].gainDb)).toBe(0);
  await rack.getByRole("button", { name: /Pad 1, paso 2, vacío/ }).click();
  await expect.poll(async () => page.evaluate(() => window.__rackE2eDocument().patterns[0].notes.length)).toBe(2);
  await rack.getByRole("button", { name: "Prever swing" }).click();
  await expect(rack.getByRole("button", { name: "Aplicar swing" })).toBeVisible();
  await rack.getByRole("button", { name: "Aplicar swing" }).click();
  await expect.poll(async () => page.evaluate(() => window.__rackE2eDocument().patterns[0].notes[1].startTick)).toBe(270);
  await rack.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => page.evaluate(() => window.__rackE2eDocument().patterns[0].notes[1].startTick)).toBe(240);
  await rack.getByRole("button", { name: "Siguiente ▶" }).click();
  await expect(rack.getByRole("button", { name: /Pad 1, paso 17,/ })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await rack.screenshot({ path: testInfo.outputPath("drum-rack-320.png") });
});
