import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 780 }, hasTouch: true,
  isMobile: true, deviceScaleFactor: 2 });

test("10.000 notas: carriles de velocity, CC, bend y presión responden al gesto a 320 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "lane-gesture-mount";
    document.body.append(mount);
    const notes = [{ id: "target", startTick: 240, durationTick: 240,
      pitch: 60, velocity: 90, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" } },
    ...Array.from({ length: 9999 }, (_, index) => ({ id: `n-${index}`,
      startTick: 3840 + index * 30, durationTick: 24, pitch: 36 + index % 48,
      velocity: 90, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" } }))];
    const pattern = { id: "lane-gesture", name: "Piano propio", version: 1,
      lengthTicks: 304000, notes, expression: [
        { id: "cc", kind: "cc", tick: 480, sequence: 0,
          channel: 0, controller: 11, value: 64 },
        { id: "bend", kind: "pitchBend", tick: 960, sequence: 1,
          channel: 0, value14: 8192 },
      ] };
    let project = { ...createProjectDocument({ id: "lane-gesture-project" }), patterns: [pattern] };
    let inverse = null;
    const root = ReactDOM.createRoot(mount);
    function render() {
      root.render(React.createElement(PianoRoll, { pattern: project.patterns[0],
        onCommand: (command) => { const result = applyCommand(project, command);
          project = result.document; inverse = result.inverse; render(); },
        onUndo: () => { const result = applyCommand(project, inverse);
          project = result.document; inverse = null; render(); }, canUndo: !!inverse }));
    }
    render();
    window.__laneGesturePattern = () => project.patterns[0];
  });
  const roll = page.locator("#lane-gesture-mount .piano-roll");
  await expect(roll).toBeVisible();
  const canvas = roll.locator(".piano-roll__lane-canvas");
  const drag = async (fromX: number, fromY: number, toX: number, toY: number) => {
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + fromX, bounds!.y + fromY);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + toX, bounds!.y + toY, { steps: 5 });
    await page.mouse.up();
  };
  await drag(72, 40, 72, 20);
  await expect.poll(async () => page.evaluate(() => window.__laneGesturePattern()
    .notes.find((note) => note.id === "target").velocity)).toBe(115);
  expect(await page.evaluate(() => window.__laneGesturePattern().notes.length)).toBe(10_000);

  await roll.getByLabel("Tipo de carril").selectOption("cc");
  await drag(96, 60, 120, 20);
  await expect.poll(async () => page.evaluate(() => {
    const event = window.__laneGesturePattern().expression.find((item) => item.id === "cc");
    return [event.tick, event.value];
  })).toEqual([720, 115]);
  await canvas.click({ position: { x: 192, y: 50 } });
  await expect.poll(async () => page.evaluate(() => window.__laneGesturePattern()
    .expression.filter((item) => item.kind === "cc").length)).toBe(2);

  await roll.getByLabel("Tipo de carril").selectOption("pitchBend");
  await drag(144, 60, 168, 30);
  await expect.poll(async () => page.evaluate(() => {
    const event = window.__laneGesturePattern().expression.find((item) => item.id === "bend");
    return [event.tick, event.value14 > 8192];
  })).toEqual([1200, true]);

  await roll.getByLabel("Tipo de carril").selectOption("polyPressure");
  await canvas.click({ position: { x: 216, y: 30 } });
  await expect.poll(async () => page.evaluate(() => window.__laneGesturePattern()
    .expression.filter((item) => item.kind === "polyPressure").length)).toBe(1);
  const pressure = await page.evaluate(() => window.__laneGesturePattern()
    .expression.find((item) => item.kind === "polyPressure"));
  expect([pressure.tick, pressure.pitch, pressure.channel]).toEqual([1680, 60, 0]);
  await expect(roll.getByText("pitch 60", { exact: false })).toBeVisible();
  await roll.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => page.evaluate(() => window.__laneGesturePattern()
    .expression.filter((item) => item.kind === "polyPressure").length)).toBe(0);
  expect(await roll.locator("[data-note-id]").count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth)).toBe(true);
});
