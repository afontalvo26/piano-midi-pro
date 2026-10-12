// ============================================================
// verify-audio-glitches.spec.ts — measures the defect that makes playback
// crackle, at its source: how late the audio scheduler runs.
//
// Why not record the waveform
// ───────────────────────────
// Capturing the master output needs Chromium to actually pull the audio graph,
// and headless Chromium renders a null device — an AudioWorklet tap on
// `destination` never receives a single process() callback. What *can* be
// measured deterministically is the quantity that decides whether the output
// crackles at all:
//
//     lead = (the audio time the note was scheduled for) − (the audio clock
//             at the moment the scheduling callback ran)
//
// `lead > 0` means the note was handed to Web Audio *before* it had to be
// rendered — clean. `lead <= 0` means it was scheduled in the past: Web Audio
// clamps it to "now", the note collides with whatever is already sounding, and
// that collision is the click. A burst of them is the crackle.
//
// Tone hands every `Transport.schedule` callback the exact audio time its event
// belongs to, so this needs no guessing: the callbacks are wrapped and the
// difference against `AudioContext.currentTime` is recorded.
//
// A second, independent counter watches the native calls the instrument layer
// makes (`AudioParam.setValueAtTime`, `AudioBufferSourceNode.start`), which is
// where a past-due timestamp would actually become audible.
//
// The spec writes `test-results/audio/summary.json`, which
// `scripts/analyze-audio-glitches.py` turns into a report.
// ============================================================

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const MIDI_FIXTURE = path.join(
  __dirname,
  "..",
  "..",
  "app",
  "public",
  "demo",
  "fur_elise.mid",
);
const OUT_DIR = path.join(__dirname, "..", "..", "test-results", "audio");

/** Seconds of playback analysed. */
const PLAY_SECONDS = 12;

/**
 * Installed before any app code runs. Self-contained by necessity: it is
 * serialised into the page.
 */
const INSTRUMENT_SCRIPT = `(() => {
  window.__AUDIT_FAILURE = null;
  try {
  if (window.__SCHEDULE_AUDIT) return;

  const audio = {
    leadMs: [],            // lead of every scheduling callback, in ms
    negativeLead: 0,       // callbacks that ran at or after their audio time
    callbacks: 0,
    // Startup and steady state are reported apart on purpose: the opening
    // events of a song are a different regime from the body of the piece, and
    // mixing them hides which one regressed.
    startup: { leadMs: [], negative: 0 },
    steady: { leadMs: [], negative: 0 },
  };
  window.__SCHEDULE_AUDIT = audio;

  // ── Native-call side: would a past-due timestamp become audible? ──
  //
  // Only buffer-source starts are counted: they are what a note actually is.
  // Param writes are deliberately excluded — Tone writes plenty of legitimate
  // automation (the master volume ramp, release envelopes) against the present,
  // so counting those produces a large number that means nothing.
  const native = { sourcePastDue: 0, worstPastDueMs: 0, starts: 0 };
  window.__NATIVE_AUDIT = native;

  const sourceProto = AudioBufferSourceNode.prototype;
  const realStart = sourceProto.start;
  sourceProto.start = function (when, offset, duration) {
    if (window.__AUDIT_CTX_READY && Number.isFinite(when)) {
      native.starts++;
      const lateMs = (window.__AUDIT_CTX_READY.currentTime - when) * 1000;
      if (lateMs > 1) {
        native.sourcePastDue++;
        if (lateMs > native.worstPastDueMs) native.worstPastDueMs = lateMs;
      }
    }
    return realStart.call(this, when, offset, duration);
  };

  // ── Scheduler side: wrap the Transport's schedule ─────────────────
  //
  // window.__PMP_TRANSPORT__ is published by App.tsx in dev builds only;
  // Tone is an ES module here and never reaches window on its own.
  let patched = false;
  let transport: any = null;
  let scheduleCalls = 0;
  function patchTransport() {
    if (patched) return true;
    transport = window.__PMP_TRANSPORT__;
    if (!transport || typeof transport.schedule !== "function") return false;
    try {
      window.__AUDIT_CTX_READY = transport.context.rawContext;
    } catch (e) {
      return false;
    }
    const realSchedule = transport.schedule.bind(transport);
    transport.schedule = function (callback, time) {
      scheduleCalls++;
      if (typeof callback !== "function") return realSchedule(callback, time);
      return realSchedule((audioTime) => {
        const ctx = window.__AUDIT_CTX_READY;
        if (ctx && Number.isFinite(audioTime)) {
          const leadMs = (audioTime - ctx.currentTime) * 1000;
          let positionSec = 0;
          try {
            positionSec = transport.seconds;
          } catch (e) {
            positionSec = 0;
          }
          const bucket = positionSec < 0.5 ? audio.startup : audio.steady;
          audio.callbacks++;
          if (audio.leadMs.length < 200000) audio.leadMs.push(leadMs);
          if (leadMs <= 0) audio.negativeLead++;
          if (bucket.leadMs.length < 200000) bucket.leadMs.push(leadMs);
          if (leadMs <= 0) bucket.negative++;
        }
        return callback(audioTime);
      }, time);
    };
    patched = true;
    return true;
  }

  const poll = setInterval(() => {
    if (patchTransport()) clearInterval(poll);
  }, 15);
  window.__AUDIT_STOP_POLL = () => clearInterval(poll);
  window.__AUDIT_PROBE = () => ({
    hasGlobal: Boolean(window.__PMP_TRANSPORT__),
    patched: patched,
    scheduleCalls: scheduleCalls,
    state: (() => {
      try {
        return transport && transport.state;
      } catch (e) {
        return "err";
      }
    })(),
    callbackFired: audio.callbacks,
  });
  } catch (err) {
    window.__AUDIT_FAILURE = String((err && err.stack) || err);
  }
})();`;

async function loadSong(page: Page): Promise<void> {
  await expect(page.locator(".title-container p")).toContainText("Sin canción cargada");
  await page
    .locator('input[aria-label="Cargar archivo MIDI"]')
    .setInputFiles(MIDI_FIXTURE);
  await expect
    .poll(
      async () =>
        Number(
          await page.locator(".seeker-container input[type=range]").getAttribute("max"),
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
}

test.describe("Audio glitch audit", () => {
  test.describe.configure({ timeout: 240_000 });

  test("measures how late the audio scheduler runs", async ({ page }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // AUDIT_MODE=before forces the old 0 ms scheduling window so the same
    // material can be measured both ways. Read by `audio/audioTiming.ts`.
    const mode = process.env.AUDIT_MODE ?? "after";
    const label = mode === "before" ? "before" : "after";

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.addInitScript(
      `window.__AUDIO_WINDOW_OVERRIDE__ = ${mode === "before" ? 0 : "undefined"};`,
    );
    await page.addInitScript(`(() => { ${INSTRUMENT_SCRIPT} })();`);
    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();

    await loadSong(page);

    const playBtn = page.locator(".playback-bar .btn.primary").first();
    await playBtn.click();
    await expect(playBtn).toContainText("Pausa");

    await page.waitForTimeout(PLAY_SECONDS * 1000);

    // Exercise the release paths (pause → resume → stop): these are the ones
    // that used to cut sounding voices with a hard `releaseAll`.
    await playBtn.click(); // pause
    await page.waitForTimeout(500);
    await playBtn.click(); // resume
    await page.waitForTimeout(3_000);
    await page.locator(".playback-bar button", { hasText: "Detener" }).click();
    await page.waitForTimeout(700);

    const result = (await page.evaluate(() => {
      const w = window as unknown as {
        __SCHEDULE_AUDIT?: {
          leadMs: number[];
          negativeLead: number;
          callbacks: number;
          startup: { leadMs: number[]; negative: number };
          steady: { leadMs: number[]; negative: number };
        };
        __NATIVE_AUDIT?: {
          sourcePastDue: number;
          worstPastDueMs: number;
          starts: number;
        };
        __AUDIT_PROBE?: () => Record<string, unknown>;
        __AUDIT_FAILURE?: string | null;
        __AUDIT_STOP_POLL?: () => void;
      };
      const probe = w.__AUDIT_PROBE?.() ?? null;
      const failure = w.__AUDIT_FAILURE ?? null;
      w.__AUDIT_STOP_POLL?.();
      return {
        schedule: w.__SCHEDULE_AUDIT ?? null,
        native: w.__NATIVE_AUDIT ?? null,
        probe,
        failure,
      };
    })) as {
      schedule: {
        leadMs: number[];
        negativeLead: number;
        callbacks: number;
        startup: { leadMs: number[]; negative: number };
        steady: { leadMs: number[]; negative: number };
      } | null;
      native: { sourcePastDue: number; worstPastDueMs: number; starts: number } | null;
      probe: Record<string, unknown> | null;
      failure: string | null;
    };

    const leads = result.schedule?.leadMs ?? [];
    const pct = (negative: number, total: number) =>
      total > 0 ? Number(((negative / total) * 100).toFixed(2)) : null;

    const summary = {
      label,
      probe: result.probe,
      instrumentFailure: result.failure,
      windowOverrideMs: mode === "before" ? 0 : null,
      callbacks: result.schedule?.callbacks ?? 0,
      /** Callbacks that ran at or after the audio time they were scheduled for. */
      pastDue: result.schedule?.negativeLead ?? 0,
      pastDuePct: pct(result.schedule?.negativeLead ?? 0, leads.length),
      leadMsPercentiles: percentileSummary(leads),
      startup: {
        callbacks: result.schedule?.startup.leadMs.length ?? 0,
        pastDue: result.schedule?.startup.negative ?? 0,
        pastDuePct: pct(
          result.schedule?.startup.negative ?? 0,
          result.schedule?.startup.leadMs.length ?? 0,
        ),
        leadMsPercentiles: percentileSummary(result.schedule?.startup.leadMs ?? []),
      },
      steady: {
        callbacks: result.schedule?.steady.leadMs.length ?? 0,
        pastDue: result.schedule?.steady.negative ?? 0,
        pastDuePct: pct(
          result.schedule?.steady.negative ?? 0,
          result.schedule?.steady.leadMs.length ?? 0,
        ),
        leadMsPercentiles: percentileSummary(result.schedule?.steady.leadMs ?? []),
      },
      /** Buffer sources (notes) started with a timestamp already in the past. */
      notesStartedPastDue: result.native?.sourcePastDue ?? 0,
      notesStarted: result.native?.starts ?? 0,
      notesStartedPastDuePct: pct(
        result.native?.sourcePastDue ?? 0,
        result.native?.starts ?? 0,
      ),
      worstNotePastDueMs: Number((result.native?.worstPastDueMs ?? 0).toFixed(2)),
      consoleErrors: consoleErrors.slice(0, 10),
    };

    fs.writeFileSync(
      path.join(OUT_DIR, `summary-${label}.json`),
      JSON.stringify(summary, null, 2),
    );
    fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));

    console.log("[audio-audit]", JSON.stringify(summary));

    // The harness has to have observed real scheduling, or the numbers are
    // meaningless.
    expect(
      summary.callbacks,
      `no scheduling callbacks were observed — probe=${JSON.stringify(result.probe)} failure=${result.failure}`,
    ).toBeGreaterThan(20);
  });
});

function percentileSummary(values: number[]): Record<string, number> {
  if (values.length === 0) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    Number(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(2));
  return {
    count: sorted.length,
    min: Number(sorted[0].toFixed(2)),
    p50: at(0.5),
    p90: at(0.9),
    p99: at(0.99),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}
