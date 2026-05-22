/**
 * Game/canvas rendering helpers.
 *
 * Reserved namespace for future canvas drawing utilities.
 * Currently exports types and constants used by the in-app canvas.
 */

export const PARTICLE_DEFAULTS = {
  COUNT_PER_HIT: 8,
  GRAVITY: 0.18,
  FRICTION: 0.95,
  LIFE_FRAMES: 38,
  SPREAD_X: 1.6,
  UPWARD_VEL: 2.4,
} as const;

export interface CanvasNoteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KeyPosition {
  x: number;
  width: number;
}

/**
 * Compute white/black key x-positions for a 37-key visible window.
 * Returns a map keyed by MIDI note number.
 */
export function computeKeyPositions(
  visibleNotes: number[],
  canvasWidth: number,
  isBlackKeyFn: (midi: number) => boolean,
): Map<number, KeyPosition> {
  const visibleWhiteNotes = visibleNotes.filter((m) => !isBlackKeyFn(m));
  const numWhiteKeys = visibleWhiteNotes.length;
  if (numWhiteKeys === 0) return new Map();

  const whiteKeyWidth = canvasWidth / numWhiteKeys;
  const positions = new Map<number, KeyPosition>();

  visibleNotes.forEach((midi) => {
    if (!isBlackKeyFn(midi)) {
      const whiteIndex = visibleWhiteNotes.indexOf(midi);
      if (whiteIndex !== -1) {
        positions.set(midi, {
          x: whiteIndex * whiteKeyWidth,
          width: whiteKeyWidth,
        });
      }
    } else {
      const prevWhiteIndex = visibleWhiteNotes.indexOf(midi - 1);
      const blackWidth = whiteKeyWidth * 0.6;
      if (prevWhiteIndex !== -1) {
        const borderX = (prevWhiteIndex + 1) * whiteKeyWidth;
        positions.set(midi, {
          x: borderX - blackWidth / 2,
          width: blackWidth,
        });
      } else {
        const nextWhiteIndex = visibleWhiteNotes.indexOf(midi + 1);
        if (nextWhiteIndex !== -1) {
          const borderX = nextWhiteIndex * whiteKeyWidth;
          positions.set(midi, {
            x: borderX - blackWidth / 2,
            width: blackWidth,
          });
        }
      }
    }
  });

  return positions;
}
