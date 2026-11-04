const PROCESSOR_NAME = "pmp-sidechain-detector-v1";

function bounded(value, low, high, fallback) {
  return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
}

class PmpSidechainDetectorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = options.processorOptions || {};
    this.thresholdDb = bounded(settings.thresholdDb, -60, 0, -24);
    this.ratio = bounded(settings.ratio, 1, 20, 4);
    this.attackMs = bounded(settings.attackMs, 0.1, 250, 5);
    this.releaseMs = bounded(settings.releaseMs, 1, 2000, 120);
    this.maxReductionDb = bounded(settings.maxReductionDb, 0, 36, 12);
    this.envelope = 0;
    this.peakReductionDb = 0;
    this.blockCount = 0;
    this.attackCoefficient = Math.exp(-1 / (sampleRate * this.attackMs / 1000));
    this.releaseCoefficient = Math.exp(-1 / (sampleRate * this.releaseMs / 1000));
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0]?.[0];
    if (!output) return true;
    let blockReduction = 0;
    for (let frame = 0; frame < output.length; frame++) {
      let detector = 0;
      for (let channel = 0; channel < input.length; channel++) {
        detector = Math.max(detector, Math.abs(input[channel]?.[frame] || 0));
      }
      const coefficient = detector > this.envelope
        ? this.attackCoefficient : this.releaseCoefficient;
      this.envelope = coefficient * this.envelope + (1 - coefficient) * detector;
      const levelDb = 20 * Math.log10(Math.max(1e-9, this.envelope));
      const overDb = Math.max(0, levelDb - this.thresholdDb);
      const reductionDb = Math.min(this.maxReductionDb,
        overDb * (1 - 1 / Math.max(1, this.ratio)));
      blockReduction = Math.max(blockReduction, reductionDb);
      this.peakReductionDb = Math.max(this.peakReductionDb, reductionDb);
      output[frame] = Math.pow(10, -reductionDb / 20);
    }
    this.blockCount++;
    if (this.blockCount % 8 === 0) {
      this.port.postMessage({ reductionDb: blockReduction,
        peakReductionDb: this.peakReductionDb });
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, PmpSidechainDetectorProcessor);
