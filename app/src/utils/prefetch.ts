/**
 * Idle-time prefetch for non-critical resources.
 *
 * The browser will fetch + cache (via the service worker, if registered)
 * the Salamander piano samples + demo MIDI files when the main thread is idle.
 * This means the FIRST time a user hits Play they don't wait 5+ seconds
 * for the sampler to warm up over the network.
 */

const SALAMANDER_BASE = "https://tonejs.github.io/audio/salamander/";
const SALAMANDER_FILES = [
  "A0.ogg",
  "C1.ogg",
  "Ds1.ogg",
  "Fs1.ogg",
  "A1.ogg",
  "C2.ogg",
  "Ds2.ogg",
  "Fs2.ogg",
  "A2.ogg",
  "C3.ogg",
  "Ds3.ogg",
  "Fs3.ogg",
  "A3.ogg",
  "C4.ogg",
  "Ds4.ogg",
  "Fs4.ogg",
  "A4.ogg",
  "C5.ogg",
  "Ds5.ogg",
  "Fs5.ogg",
  "A5.ogg",
  "C6.ogg",
  "Ds6.ogg",
  "Fs6.ogg",
  "A6.ogg",
  "C7.ogg",
  "Ds7.ogg",
  "Fs7.ogg",
  "A7.ogg",
  "C8.ogg",
];

let prefetched = false;

interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Schedule a low-priority prefetch of the piano samples + manifest.
 * Skipped on slow networks or save-data mode to respect user constraints.
 */
export function schedulePianoPrefetch(): void {
  if (prefetched) return;
  if (typeof window === "undefined") return;

  const conn = (navigator as Navigator & { connection?: ConnectionLike }).connection;
  if (conn?.saveData) return; // user opted into data saver
  const slow = conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g";
  if (slow) return;

  prefetched = true;
  const run = () => {
    SALAMANDER_FILES.forEach((file, i) => {
      // Stagger requests so we don't saturate the connection
      setTimeout(() => {
        const init: RequestInit & { priority?: "high" | "low" | "auto" } = {
          mode: "cors",
          credentials: "omit",
          priority: "low",
        };
        fetch(SALAMANDER_BASE + file, init).catch(() => {
          /* prefetch is best-effort; ignore errors */
        });
      }, i * 80);
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 1500);
  }
}
