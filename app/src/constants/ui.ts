/**
 * UI Constants
 * 
 * Contains all UI-related constants including colors, track colors,
 * and color manipulation utilities.
 */

// Track Colors (for visual representation)
export const TRACK_COLORS = [
  "#a78bfa", // Purple
  "#60a5fa", // Blue
  "#fb923c", // Orange
  "#34d399", // Emerald
  "#f472b6", // Pink
  "#fbbf24", // Amber
] as const;

// Difficulty Colors
export const DIFFICULTY_COLORS = {
  easy: "#34d399",    // Green
  normal: "#60a5fa",  // Blue
  hard: "#fb923c",    // Orange
  expert: "#ef4444",  // Red
} as const;

// Game Status Colors
export const STATUS_COLORS = {
  idle: "#6b7280",      // Gray
  playing: "#34d399",   // Green
  paused: "#fbbf24",    // Amber
  finished: "#60a5fa",  // Blue
} as const;

// Hit Grade Colors
export const HIT_GRADE_COLORS = {
  "perfect+": "#fbbf24", // Yellow/Gold
  perfect: "#34d399",    // Green
  great: "#60a5fa",      // Blue
  good: "#a78bfa",       // Purple
  miss: "#ef4444",       // Red
} as const;

// UI Breakpoints (responsive design)
export const BREAKPOINTS = {
  mobile: 640,   // < 640px
  tablet: 1024,  // 640px - 1024px
  desktop: 1440, // > 1024px
} as const;

// Animation Durations (in milliseconds)
export const ANIMATION_DURATIONS = {
  fast: 150,
  normal: 300,
  slow: 500,
  verySlow: 1000,
} as const;

// Z-Index Layers
export const Z_INDEX = {
  background: 0,
  content: 1,
  overlay: 10,
  modal: 20,
  toast: 30,
  tooltip: 40,
} as const;

// Helper: clamp value between min and max
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Helper: hex color → rgba string for canvas
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

// Helper: lighten a hex color by mixing with white
export function lightenHex(hex: string, amount: number): string {
  const r = Math.round(
    (parseInt(hex.slice(1, 3), 16) || 0) +
      (255 - (parseInt(hex.slice(1, 3), 16) || 0)) * amount,
  );
  const g = Math.round(
    (parseInt(hex.slice(3, 5), 16) || 0) +
      (255 - (parseInt(hex.slice(3, 5), 16) || 0)) * amount,
  );
  const b = Math.round(
    (parseInt(hex.slice(5, 7), 16) || 0) +
      (255 - (parseInt(hex.slice(5, 7), 16) || 0)) * amount,
  );
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Helper: darken a hex color by mixing with black
export function darkenHex(hex: string, amount: number): string {
  const r = Math.round((parseInt(hex.slice(1, 3), 16) || 0) * (1 - amount));
  const g = Math.round((parseInt(hex.slice(3, 5), 16) || 0) * (1 - amount));
  const b = Math.round((parseInt(hex.slice(5, 7), 16) || 0) * (1 - amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Helper: get track color by index (cycles through colors)
export function getTrackColor(index: number): string {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}

// Helper: get difficulty color
export function getDifficultyColor(difficulty: keyof typeof DIFFICULTY_COLORS): string {
  return DIFFICULTY_COLORS[difficulty];
}

// Helper: get hit grade color
export function getHitGradeColor(grade: keyof typeof HIT_GRADE_COLORS): string {
  return HIT_GRADE_COLORS[grade];
}

// Helper: format time as MM:SS
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Helper: format time as HH:MM:SS
export function formatTimeDetailed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Helper: format number with commas (e.g., 1000 -> 1,000)
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

// Helper: format percentage (e.g., 0.95 -> 95%)
export function formatPercentage(value: number, decimals: number = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// Helper: interpolate between two colors
export function interpolateColor(color1: string, color2: string, factor: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Made with Bob
