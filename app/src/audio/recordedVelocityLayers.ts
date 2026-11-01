import { bufferRmsDb, median } from "../engine/sampleLevels";

/** Per-layer trims preserve recorded timbre while MIDI velocity sets smooth loudness. */
export function recordedVelocityLayerTrims(layers: ReadonlyMap<number, readonly AudioBuffer[]>,
  referenceDb: number): ReadonlyMap<number, number> {
  if (!Number.isFinite(referenceDb) || layers.size === 0) {
    throw new RangeError("Referencia de capas grabadas inválida");
  }
  const trims = new Map<number, number>();
  for (const [layer, buffers] of layers) {
    if (!Number.isInteger(layer) || layer < 1 || buffers.length === 0) {
      throw new RangeError("Capa grabada vacía o inválida");
    }
    const level = median(buffers.map((buffer) => bufferRmsDb(buffer, 0.5)));
    if (!Number.isFinite(level) || level <= -100) {
      throw new Error(`Capa grabada ${layer} sin energía medible`);
    }
    // These pinned recordings need at most 21 dB. The cap guards future packs.
    trims.set(layer, Math.max(-24, Math.min(24, referenceDb - level)));
  }
  return trims;
}
