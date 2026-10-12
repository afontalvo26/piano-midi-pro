/**
 * Live-note integrity — every key you press must reach the audio graph.
 *
 * Regression test for the "fast playing drops keys" report. The failure mode it
 * guards against:
 *
 *   `Tone.PolySynth` does not steal voices and does not report failure. Once its
 *   voice pool is exhausted it logs "Max polyphony exceeded. Note dropped." and
 *   the note never sounds. The fallback synth was capped at 6 voices, so a fast
 *   passage — or anything with the sustain pedal down, where each voice stays
 *   busy for the whole release time — silently lost notes.
 *
 * How it is measured
 * ──────────────────
 * A fake Web MIDI device is installed before boot (`installFakeMidi`), so the
 * spec drives the app's *real* `onmidimessage` handler. Sound is counted where
 * it actually starts: `AudioBufferSourceNode.start` (sampled piano layers) and
 * `OscillatorNode.start` (fallback synth voices). Any "Max polyphony exceeded"
 * warning fails the run, because that message means a key was dropped.
 */
import { test, expect } from "@playwright/test";
import { installFakeMidi } from "./helpers/fakeMidi";

type MidiMessage = { status: number; d1: number; d2: number; at: number };

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CC = 0xb0;
const CC_SUSTAIN = 64;

/** Fast single-note run — 40 notes, 62 ms apart (~16th notes at 240 bpm). */
function fastRun(count = 40, gapMs = 62): MidiMessage[] {
  const out: MidiMessage[] = [];
  for (let i = 0; i < count; i++) {
    const midi = 48 + (i % 24);
    out.push({ status: NOTE_ON, d1: midi, d2: 100, at: i * gapMs });
    out.push({ status: NOTE_OFF, d1: midi, d2: 0, at: i * gapMs + gapMs * 0.5 });
  }
  return out;
}

/** Ten-note chords, hammered — the classic "too many voices" case. */
function chords(repeats = 8, notes = 10): MidiMessage[] {
  const out: MidiMessage[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    const base = rep * 700;
    for (let k = 0; k < notes; k++) {
      out.push({ status: NOTE_ON, d1: 48 + k, d2: 100, at: base + k * 1.5 });
    }
    for (let k = 0; k < notes; k++) {
      out.push({ status: NOTE_OFF, d1: 48 + k, d2: 0, at: base + 500 });
    }
  }
  return out;
}

/** Sustain pedal held while playing fast — worst case for held voices. */
function sustainedRun(count = 40, gapMs = 90): MidiMessage[] {
  const out: MidiMessage[] = [{ status: CC, d1: CC_SUSTAIN, d2: 127, at: 0 }];
  for (let i = 0; i < count; i++) {
    const midi = 48 + (i % 24);
    out.push({ status: NOTE_ON, d1: midi, d2: 100, at: 20 + i * gapMs });
    out.push({ status: NOTE_OFF, d1: midi, d2: 0, at: 60 + i * gapMs });
  }
  out.push({ status: CC, d1: CC_SUSTAIN, d2: 0, at: 20 + count * gapMs + 200 });
  return out;
}

test.describe("integridad de notas en vivo", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installFakeMidi);
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const stats = { buffer: 0, osc: 0, polyphonyWarnings: 0 };
      w.__audioStats = stats;

      const patch = (
        proto: { start?: (...a: unknown[]) => unknown } | undefined,
        key: "buffer" | "osc",
      ) => {
        if (!proto || typeof proto.start !== "function") return;
        const orig = proto.start;
        proto.start = function (this: unknown, ...args: unknown[]) {
          (w.__audioStats as typeof stats)[key] += 1;
          return orig.apply(this, args);
        };
      };
      patch(
        (window.AudioBufferSourceNode as unknown as { prototype: never })
          ?.prototype,
        "buffer",
      );
      patch(
        (window.OscillatorNode as unknown as { prototype: never })?.prototype,
        "osc",
      );

      const origWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        if (args.map(String).join(" ").includes("polyphony")) {
          (w.__audioStats as typeof stats).polyphonyWarnings += 1;
        }
        origWarn.apply(console, args as never[]);
      };
    });

    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();

    // Unlock the AudioContext the way a user would.
    const firstWhite = page.locator(".piano-key-element.white").first();
    await firstWhite.dispatchEvent("mousedown");
    await page.waitForTimeout(60);
    await firstWhite.dispatchEvent("mouseup");
    await page.waitForTimeout(1500);
  });

  const play = async (
    page: import("@playwright/test").Page,
    messages: MidiMessage[],
  ) => {
    await page.evaluate(() => {
      const stats = (window as unknown as Record<string, { buffer: number; osc: number }>)
        .__audioStats;
      stats.buffer = 0;
      stats.osc = 0;
    });

    await page.evaluate(async (msgs) => {
      const w = window as unknown as Record<string, unknown>;
      const handler = (w.__midiListeners as ((e: unknown) => void)[])[0];
      if (!handler) throw new Error("el controlador MIDI falso no está enlazado");
      const start = performance.now();
      for (const m of msgs as MidiMessage[]) {
        const wait = m.at - (performance.now() - start);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        handler({
          data: new Uint8Array([m.status, m.d1, m.d2]),
          timeStamp: performance.now(),
          receivedTime: performance.now(),
        });
      }
    }, messages);

    return page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const stats = w.__audioStats as {
        buffer: number;
        osc: number;
        polyphonyWarnings: number;
      };
      return { ...stats };
    });
  };

  const expectEveryNoteSounded = (
    messages: MidiMessage[],
    stats: { buffer: number; osc: number; polyphonyWarnings: number },
  ) => {
    const requested = messages.filter((m) => m.status === NOTE_ON).length;
    const started = stats.buffer + stats.osc;

    expect(
      stats.polyphonyWarnings,
      `${stats.polyphonyWarnings} nota(s) descartada(s) por límite de voces de Tone.PolySynth`,
    ).toBe(0);
    expect(
      started,
      `se pidieron ${requested} notas y solo sonaron ${started} ` +
        `(sampler: ${stats.buffer}, sintetizador: ${stats.osc})`,
    ).toBeGreaterThanOrEqual(requested);
  };

  test("una escala rápida suena completa", async ({ page }) => {
    const messages = fastRun();
    const stats = await play(page, messages);
    expectEveryNoteSounded(messages, stats);
  });

  test("acordes de diez notas martillados suenan completos", async ({ page }) => {
    const messages = chords();
    const stats = await play(page, messages);
    expectEveryNoteSounded(messages, stats);
  });

  test("con el pedal de sustain no se pierde ninguna nota", async ({ page }) => {
    const messages = sustainedRun();
    const stats = await play(page, messages);
    expectEveryNoteSounded(messages, stats);
  });

  test("las teclas pulsadas se iluminan", async ({ page }) => {
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const handler = (w.__midiListeners as ((e: unknown) => void)[])[0];
      handler({
        data: new Uint8Array([0x90, 60, 100]),
        timeStamp: performance.now(),
        receivedTime: performance.now(),
      });
    });
    await expect(page.locator(".piano-key-element.white.active-press")).toHaveCount(1);

    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const handler = (w.__midiListeners as ((e: unknown) => void)[])[0];
      handler({
        data: new Uint8Array([0x80, 60, 0]),
        timeStamp: performance.now(),
        receivedTime: performance.now(),
      });
    });
    await expect(page.locator(".piano-key-element.white.active-press")).toHaveCount(0);
  });
});
