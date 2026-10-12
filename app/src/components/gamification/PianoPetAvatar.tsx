// ============================================================
// PianoPetAvatar — the Neon Runner avatar overlay.
//
// Two things make this a wrapper component rather than an inline call:
//
//  * It measures its own container with a ResizeObserver instead of reading
//    `canvasRef.current` during App's render (a ref read React cannot track).
//  * It subscribes to `pianoKeyboardStore` for the sounding notes, so a keypress
//    animates the avatar without re-rendering the whole studio — see
//    `state/pianoKeyboardStore.ts` for the measurements behind that split.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useStorePoll } from "../../hooks/useStorePoll";
import { NeonRunnerAvatar } from "./NeonRunnerAvatar";

export interface PianoPetAvatarProps {
  keyPositions: Map<number, { x: number; width: number }>;
  fxColor: string;
}

export function PianoPetAvatar({ keyPositions, fxColor }: PianoPetAvatarProps) {
  const [liveNotes, playbackNotes] = useStorePoll((s) => [
    s.midiNotes,
    s.playbackNotes,
  ]);

  const activeKeys = new Set<number>(playbackNotes);
  liveNotes.forEach((midi) => activeKeys.add(midi));

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.width - rect.width) < 0.5 &&
        Math.abs(prev.height - rect.height) < 0.5
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="canvas-overlay-layer"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {size.width > 0 && size.height > 0 && (
        <NeonRunnerAvatar
          canvasWidth={size.width}
          canvasHeight={size.height}
          groundY={size.height - 2}
          activeKeys={activeKeys}
          keyPositions={keyPositions}
          show
          fxColor={fxColor}
        />
      )}
    </div>
  );
}
