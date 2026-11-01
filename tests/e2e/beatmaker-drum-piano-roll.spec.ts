import { expect, test } from "@playwright/test";

test("piano roll del rack dibuja sólo disparos válidos y conserva canal al mover con teclado", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root")?.remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "roll-drum-mount";
    document.body.append(mount);
    const pads = Array.from({ length: 16 }, (_, index) => ({
      id: `pad-${index}`, name: index === 0 ? "Kick" : index === 1 ? "Snare" : `Pad ${index + 1}`,
      color: "#8758ad", midiNote: index === 0 ? 36 : index === 1 ? 38 : 40 + index,
      channel: index === 1 ? 10 : 9, source: null, gainDb: 0, pan: 0,
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
    let snapshot = { ...createProjectDocument({ id: "roll-drum-e2e", at: 1000 }),
      tracks: [track], trackOrder: [track.id], patterns: [pattern], clips: [clip] };
    const root = ReactDOM.createRoot(mount);
    let undo = null;
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
      root.render(React.createElement(PianoRoll, {
        pattern: snapshot.patterns[0], padNames: { 36: "Kick", 38: "Snare" },
        allowedPadTriggers: pads.map((pad) => ({ pitch: pad.midiNote,
          channel: pad.channel, label: pad.name })),
        onCommand: apply, onUndo: undoEdit, canUndo: !!undo,
      }));
    }
    render();
    window.__rollDrumPattern = () => snapshot.patterns[0];
  });
  const roll = page.locator("#roll-drum-mount .piano-roll");
  await expect(roll).toBeVisible();
  await roll.getByRole("button", { name: "Dibujar" }).click();
  const canvas = roll.locator(".piano-roll__canvas");
  const y36 = await roll.locator(".piano-roll__viewport").evaluate((element: HTMLElement) =>
    (127 - 36) * 22 - element.scrollTop + 11);
  await canvas.click({ position: { x: 124, y: y36 } });
  await expect.poll(async () => page.evaluate(() => window.__rollDrumPattern().notes.length)).toBe(1);
  expect(await page.evaluate(() => window.__rollDrumPattern().notes[0].channel)).toBe(9);
  await roll.getByRole("button", { name: /Inspector/ }).click();
  await roll.getByLabel("Nota MIDI").fill("37");
  await roll.getByRole("button", { name: "Aplicar valores" }).click();
  await expect(roll.getByRole("alert")).toContainText("16 pads");
  expect(await page.evaluate(() => window.__rollDrumPattern().notes[0].pitch)).toBe(36);
  await roll.getByLabel("Nota MIDI").fill("38");
  await roll.getByLabel("Canal MIDI · 1–16").fill("11");
  await roll.getByRole("button", { name: "Aplicar valores" }).click();
  await expect.poll(async () => page.evaluate(() => window.__rollDrumPattern().notes[0].pitch)).toBe(38);
  expect(await page.evaluate(() => window.__rollDrumPattern().notes[0].channel)).toBe(10);
  await roll.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => page.evaluate(() => window.__rollDrumPattern().notes[0].pitch)).toBe(36);
  await canvas.focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => page.evaluate(() => window.__rollDrumPattern().notes[0].pitch)).toBe(38);
  expect(await page.evaluate(() => window.__rollDrumPattern().notes[0].channel)).toBe(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
