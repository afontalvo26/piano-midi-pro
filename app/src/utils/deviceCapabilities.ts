/**
 * Device capability detection.
 *
 * Inspects the runtime environment (CPU cores, RAM, connection, prefers-reduced-motion)
 * and returns a quality preset. The app then scales rendering complexity accordingly:
 *
 *   high  → 60 FPS, full DPR, particles ON, glow blur, all effects
 *   medium → 60 FPS, capped DPR=2, particles ON limited, lighter glow
 *   low   → 30 FPS frame-skip, capped DPR=1.5, particles OFF, no shadow blur
 *
 * Re-evaluated on demand (no auto-recompute) so the user can override via Settings.
 */

export type DeviceTier = "high" | "medium" | "low";

export interface DeviceProfile {
  tier: DeviceTier;
  hardwareConcurrency: number;
  deviceMemoryGB: number | null;
  effectiveType: string | null;
  prefersReducedMotion: boolean;
  isMobile: boolean;
  isTouchOnly: boolean;
  /** Cap on devicePixelRatio used for canvas backing store. */
  maxDpr: number;
  /** Target FPS — when below the loop will frame-skip. */
  targetFps: number;
  /** Whether to render particle effects. */
  enableParticles: boolean;
  /** Whether to use shadowBlur on canvas (expensive). */
  enableShadowBlur: boolean;
  /** Whether to render the falling-notes glow halo. */
  enableNoteGlow: boolean;
  /** Max simultaneous particles in the pool. */
  maxParticles: number;
  /** Multiplier applied to canvas filter blur radii (0..1). */
  effectsScale: number;
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
}

function detectTier(nav: NavigatorWithDeviceMemory): DeviceTier {
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? null;
  const conn = nav.connection?.effectiveType ?? null;
  const saveData = nav.connection?.saveData ?? false;

  // User explicitly opted into data-saver → low tier
  if (saveData) return "low";

  // Slow connection alone doesn't drop tier (we're cached) but combined with weak hw it does
  const slowNetwork = conn === "slow-2g" || conn === "2g";

  if (mem !== null) {
    if (mem <= 2 || cores <= 2) return "low";
    if (mem <= 4 || cores <= 4) return slowNetwork ? "low" : "medium";
    return "high";
  }
  // No deviceMemory hint — fall back to cores
  if (cores <= 2) return "low";
  if (cores <= 4) return "medium";
  return "high";
}

export function detectDeviceProfile(): DeviceProfile {
  const nav = navigator as NavigatorWithDeviceMemory;
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? null;
  const eff = nav.connection?.effectiveType ?? null;

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ua = navigator.userAgent || "";
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const isTouchOnly = isMobile || (window.matchMedia?.("(pointer: coarse)").matches ?? false);

  const tier = detectTier(nav);

  // Build preset
  if (tier === "low" || prefersReducedMotion) {
    return {
      tier: prefersReducedMotion ? "low" : tier,
      hardwareConcurrency: cores,
      deviceMemoryGB: mem,
      effectiveType: eff,
      prefersReducedMotion,
      isMobile,
      isTouchOnly,
      maxDpr: 1.25,
      targetFps: 30,
      enableParticles: false,
      enableShadowBlur: false,
      enableNoteGlow: false,
      maxParticles: 0,
      effectsScale: 0.4,
    };
  }
  if (tier === "medium") {
    return {
      tier,
      hardwareConcurrency: cores,
      deviceMemoryGB: mem,
      effectiveType: eff,
      prefersReducedMotion: false,
      isMobile,
      isTouchOnly,
      maxDpr: 1.75,
      targetFps: 60,
      enableParticles: true,
      enableShadowBlur: false, // medium skips shadow blur (GPU-heavy on integrated GPUs)
      enableNoteGlow: true,
      maxParticles: 60,
      effectsScale: 0.7,
    };
  }
  // high
  return {
    tier,
    hardwareConcurrency: cores,
    deviceMemoryGB: mem,
    effectiveType: eff,
    prefersReducedMotion: false,
    isMobile,
    isTouchOnly,
    maxDpr: Math.min(window.devicePixelRatio || 1, 2),
    targetFps: 60,
    enableParticles: true,
    enableShadowBlur: true,
    enableNoteGlow: true,
    maxParticles: 120,
    effectsScale: 1,
  };
}

let cachedProfile: DeviceProfile | null = null;
export function getDeviceProfile(): DeviceProfile {
  if (cachedProfile === null) {
    cachedProfile = detectDeviceProfile();
  }
  return cachedProfile;
}

export function refreshDeviceProfile(): DeviceProfile {
  cachedProfile = detectDeviceProfile();
  return cachedProfile;
}
