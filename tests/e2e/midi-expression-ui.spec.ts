import { expect, test } from "@playwright/test";

type FakeBridge = {
  __attachedInputs: () => string[];
  __sendMidi: (inputId: string, bytes: number[]) => void;
};

function installAmbiguousMidi(): void {
  class FakeInput {
    state = "connected";
    type = "input";
    connection = "open";
    manufacturer = "Prueba";
    onmidimessage: ((message: { data: Uint8Array; timeStamp: number; receivedTime: number }) => void) | null = null;

    constructor(readonly id: string, readonly name: string) {}
  }
  const inputs = new Map([
    ["port-a", new FakeInput("port-a", "Controlador A")],
    ["port-b", new FakeInput("port-b", "Controlador B")],
  ]);
  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    value: async () => ({ inputs, outputs: new Map(), onstatechange: null, sysexEnabled: false }),
  });
  const bridge = window as unknown as FakeBridge;
  bridge.__attachedInputs = () => [...inputs.values()]
    .filter((input) => input.onmidimessage).map((input) => input.id);
  bridge.__sendMidi = (inputId, bytes) => {
    const input = inputs.get(inputId);
    if (!input?.onmidimessage) throw new Error(`Puerto ${inputId} sin listener`);
    const timeStamp = performance.now();
    input.onmidimessage({ data: Uint8Array.from(bytes), timeStamp, receivedTime: timeStamp });
  };
}

test("MIDI ambiguo se declara sin escucha hasta elegir puerto; cinco intensidades muestran dinámica física", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.addInitScript(installAmbiguousMidi);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const nav = page.getByRole("navigation", { name: "Secciones principales" });
  await expect(page.locator(".live-performance__port")).toHaveText("Sin entrada MIDI en escucha");
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as FakeBridge).__attachedInputs?.())).toEqual([]);

  await nav.getByRole("button", { name: "Configuración" }).click();
  await expect(page.getByLabel("Entrada activa")).toHaveValue("__auto__");
  await page.getByLabel("Entrada activa").selectOption("port-b");
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as FakeBridge).__attachedInputs?.())).toEqual(["port-b"]);
  await nav.getByRole("button", { name: "Studio" }).click();
  await expect(page.locator(".live-performance__port")).toHaveText("Entrada MIDI escuchando");

  for (const velocity of [8, 32, 64, 96, 127]) {
    await page.evaluate((value) => {
      const bridge = window as unknown as FakeBridge;
      bridge.__sendMidi("port-b", [0x90, 60, value]);
      bridge.__sendMidi("port-b", [0x80, 60, 0]);
    }, velocity);
  }
  const readout = page.getByRole("region", { name: "Expresión de la última pulsación" });
  await expect(readout).toContainText("MIDI físico · Controlador B");
  await expect(readout).toContainText("127 / 127");
  await expect(page.locator(".live-performance__history strong")).toHaveText([
    "8 / 127", "32 / 127", "64 / 127", "96 / 127", "127 / 127",
  ]);
  const db = await page.locator(".live-performance__history small").allTextContents();
  const numeric = db.map((text) => Number(text.replace(/[−]/g, "-").replace(" dB", "")));
  expect(numeric.every(Number.isFinite)).toBe(true);
  for (let i = 1; i < numeric.length; i++) expect(numeric[i]).toBeGreaterThan(numeric[i - 1]);
  expect(numeric[0]).toBeLessThan(-30);
  expect(numeric[4]).toBe(0);

  await page.locator(".piano-app__studio").click();
  await page.keyboard.press("z");
  await expect(readout).toContainText("Teclado de computadora");
  await expect(page.locator(".live-performance__history strong")).toHaveText([
    "8 / 127", "32 / 127", "64 / 127", "96 / 127", "127 / 127",
  ]);
});

test("un puerto guardado pero ausente aparece desconectado y no simula entrada MIDI", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.addInitScript(installAmbiguousMidi);
  await page.addInitScript(() => {
    localStorage.setItem("piano_selected_midi_input_id", JSON.stringify("port-unplugged"));
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await expect(page.locator(".live-performance__port")).toHaveText("Sin entrada MIDI en escucha");
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as FakeBridge).__attachedInputs?.())).toEqual([]);
  await expect(page.locator(".piano-app__status")).toContainText("desconectada");
});

test("una curva Suave guardada puede cambiarse a Expresiva sin borrar ajustes", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.addInitScript(installAmbiguousMidi);
  await page.addInitScript(() => localStorage.setItem("piano_velocity_curve", JSON.stringify("soft")));
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Usar curva Expresiva" })).toBeVisible();
  await page.getByRole("button", { name: "Usar curva Expresiva" }).click();
  await expect(page.getByRole("button", { name: "Usar curva Expresiva" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Secciones principales" })
    .getByRole("button", { name: "Configuración" }).click();
  await expect(page.getByLabel("Curva de velocidad")).toHaveValue("expressive");
});

test("una pulsación física se conserva si la pestaña se recarga antes del guardado diferido", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.addInitScript(installAmbiguousMidi);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const nav = page.getByRole("navigation", { name: "Secciones principales" });
  await nav.getByRole("button", { name: "Configuración" }).click();
  await page.getByLabel("Entrada activa").selectOption("port-b");
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as FakeBridge).__attachedInputs?.())).toEqual(["port-b"]);
  await page.evaluate(() => (window as unknown as FakeBridge).__sendMidi("port-b", [0x90, 60, 40]));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Calibración de Controlador B: 1 pulsación MIDI observada/)).toBeVisible();
});
