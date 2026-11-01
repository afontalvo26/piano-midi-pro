import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

type WireMessage = { data: Uint8Array; timeStamp: number; receivedTime: number };
type FakeBridge = {
  __smkHandlers: () => string[];
  __smkSend: (port: string, bytes: number[], timeStamp?: number) => void;
};

const requireFromApp = createRequire(resolve("app/package.json"));
const { Midi } = requireFromApp("@tonejs/midi") as {
  Midi: new (bytes: ArrayBuffer) => {
    tracks: {
      channel: number;
      notes: { midi: number }[];
      controlChanges: Record<number, { value: number }[] | undefined>;
      pitchBends: { value: number }[];
    }[];
  };
};

function installEliteMidi(): void {
  class FakeInput {
    state = "connected";
    type = "input";
    connection = "open";
    manufacturer = "M-VAVE";
    onmidimessage: ((message: WireMessage) => void) | null = null;

    constructor(readonly id: string, readonly name: string) {}
  }

  const inputs = new Map([
    ["smk-main", new FakeInput("smk-main", "SMK-37 Elite MIDI USB 1")],
    ["smk-second", new FakeInput("smk-second", "SMK-37 Elite MIDI USB 2")],
    ["smk-third", new FakeInput("smk-third", "SMK-37 Elite MIDI USB 3")],
  ]);
  const access = { inputs, outputs: new Map(), onstatechange: null, sysexEnabled: false };
  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    value: async () => access,
  });
  const bridge = window as unknown as FakeBridge;
  bridge.__smkHandlers = () => [...inputs.values()].filter((input) => input.onmidimessage).map((input) => input.id);
  bridge.__smkSend = (port, bytes, timeStamp = performance.now()) => {
    const input = inputs.get(port);
    if (!input?.onmidimessage) throw new Error(`Sin handler para ${port}`);
    input.onmidimessage({ data: Uint8Array.from(bytes), timeStamp, receivedTime: timeStamp });
  };
}

async function boot(page: Page): Promise<void> {
  page.setDefaultTimeout(20_000);
  await page.addInitScript(installEliteMidi);
  await page.goto("/");
  await page.waitForSelector(".piano-app__studio", { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as FakeBridge).__smkHandlers?.())).toEqual(["smk-main"]);
}

async function send(page: Page, bytes: number[], timeStamp?: number): Promise<void> {
  await page.evaluate(({ bytes, timeStamp }) =>
    (window as unknown as FakeBridge).__smkSend("smk-main", bytes, timeStamp),
  { bytes, timeStamp });
}

test("PianoApp conserva tres vistas y dos tomas SMK-37 tras recargar", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await boot(page);

  const nav = page.getByRole("navigation", { name: "Secciones principales" });
  await expect(nav.getByRole("button")).toHaveCount(3);
  expect(await nav.getByRole("button").allTextContents()).toEqual(["Studio", "Pistas", "Configuración"]);
  await expect(page.getByRole("button", { name: /^(Música|Canciones|Juego|Partitura)$/ })).toHaveCount(0);

  const sustain = page.locator(".piano-app__pedals button").filter({ hasText: "Sustain" });
  await send(page, [0xb0, 64, 127]);
  await expect(sustain).toHaveAttribute("aria-pressed", "true");
  await send(page, [0xb0, 64, 0]);
  await expect(sustain).toHaveAttribute("aria-pressed", "false");

  await page.evaluate(() => {
    const bridge = window as unknown as FakeBridge;
    const now = performance.now();
    for (let note = 48; note < 85; note++) bridge.__smkSend("smk-main", [0x90, note, 90], now + note / 100);
  });
  await expect(page.locator(".piano-key-element.active-press")).toHaveCount(37);
  await page.evaluate(() => {
    const bridge = window as unknown as FakeBridge;
    const now = performance.now();
    for (let note = 48; note < 85; note++) bridge.__smkSend("smk-main", [0x80, note, 0], now + note / 100);
  });
  await expect(page.locator(".piano-key-element.active-press")).toHaveCount(0);

  await page.getByRole("button", { name: /Grabar MIDI/ }).click();
  await expect(page.getByRole("button", { name: /Detener grabación/ })).toBeVisible();
  await send(page, [0x90, 60, 100]);
  await send(page, [0xb0, 64, 127]);
  await send(page, [0xe0, 0, 80]);
  await send(page, [0x80, 60, 0]);
  await send(page, [0xb0, 64, 0]);
  await page.getByRole("button", { name: /Detener grabación/ }).click();
  await expect(page.locator(".piano-app__record-state")).toContainText("5 eventos");

  await nav.getByRole("button", { name: "Pistas" }).click();
  await page.waitForSelector(".recorded-tracks__take", { timeout: 15_000 });
  await expect(page.locator(".recorded-tracks__take")).toHaveCount(1);
  await expect(page.locator(".recorded-tracks__take")).toContainText("5 eventos");
  await expect(page.locator(".recorded-tracks__track summary")).toContainText("SMK-37 Elite MIDI USB 1 · Canal 1");

  await page.reload();
  await page.waitForSelector(".recorded-tracks__take", { timeout: 15_000 });
  await expect(page.locator(".recorded-tracks__take")).toHaveCount(1);
  await page.getByRole("button", { name: "Renombrar" }).click();
  await page.getByRole("textbox", { name: "Nombre de la toma" }).fill("Mi ensayo");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator(".recorded-tracks__take h3")).toHaveText("Mi ensayo");

  await nav.getByRole("button", { name: "Studio" }).click();
  await page.getByRole("button", { name: /Grabar MIDI/ }).click();
  await send(page, [0x90, 64, 90]);
  await send(page, [0x80, 64, 0]);
  await page.getByRole("button", { name: /Detener grabación/ }).click();
  await nav.getByRole("button", { name: "Pistas" }).click();
  await expect(page.locator(".recorded-tracks__take")).toHaveCount(2);
  const firstTake = page.locator(".recorded-tracks__take").filter({ has: page.getByRole("heading", { name: "Mi ensayo" }) });
  const secondTake = page.locator(".recorded-tracks__take").filter({ hasText: "2 eventos" });
  await expect(firstTake).toContainText("5 eventos");
  await expect(secondTake).toContainText("2 eventos");
  await page.reload();
  await expect(page.locator(".recorded-tracks__take")).toHaveCount(2);
  await expect(firstTake).toContainText("5 eventos");
  await expect(secondTake).toContainText("2 eventos");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    firstTake.getByRole("button", { name: "Exportar .mid" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Mi-ensayo.mid");
  const filename = testInfo.outputPath("mi-ensayo.mid");
  await download.saveAs(filename);
  const fileBytes = await readFile(filename);
  expect(fileBytes.subarray(0, 4).toString()).toBe("MThd");
  const parsed = new Midi(Uint8Array.from(fileBytes).buffer);
  expect(parsed.tracks.some((track) => track.notes.some((note) => note.midi === 60))).toBe(true);
  expect(parsed.tracks.some((track) => (track.controlChanges[64]?.length ?? 0) === 2)).toBe(true);
  expect(parsed.tracks.some((track) => track.pitchBends.length === 1)).toBe(true);

  await firstTake.getByRole("button", { name: "Borrar", exact: true }).click();
  await firstTake.getByRole("button", { name: "Confirmar borrado" }).click();
  await expect(page.locator(".recorded-tracks__take")).toHaveCount(1);
  await page.reload();
  await expect(secondTake).toContainText("2 eventos");
  await secondTake.getByRole("button", { name: "Borrar", exact: true }).click();
  await secondTake.getByRole("button", { name: "Confirmar borrado" }).click();
  await expect(page.locator(".recorded-tracks__empty")).toContainText("Aún no hay tomas guardadas");
});
