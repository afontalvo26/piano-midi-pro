/* AudioWorklet scope. Captures PCM in 4096-frame transferable blocks. */
class StudioCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channels = options.processorOptions?.channels === 2 ? 2 : 1;
    this.maxFrames = Math.min(sampleRate * 180, options.processorOptions?.maxFrames ?? sampleRate * 90);
    this.left = new Float32Array(4096);
    this.right = this.channels === 2 ? new Float32Array(4096) : null;
    this.fill = 0;
    this.sequence = 0;
    this.frames = 0;
    this.startFrame = null;
    this.stopFrame = null;
    this.active = false;
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'start' && Number.isSafeInteger(data.atFrame) && data.atFrame >= 0) {
        this.startFrame = data.atFrame;
        this.stopFrame = null;
        this.frames = 0;
        this.sequence = 0;
        this.fill = 0;
      } else if (data?.type === 'stop' && Number.isSafeInteger(data.atFrame)) {
        this.stopFrame = Math.max(0, data.atFrame);
      } else if (data?.type === 'cancel') {
        this.active = false;
        this.startFrame = null;
        this.stopFrame = null;
        this.fill = 0;
        this.port.postMessage({ type: 'cancelled' });
      }
    };
  }

  flush() {
    if (this.fill === 0) return;
    const message = { type: 'chunk', sequence: this.sequence++, frameCount: this.fill,
      left: this.left, right: this.right };
    const transfer = [this.left.buffer];
    if (this.right) transfer.push(this.right.buffer);
    this.port.postMessage(message, transfer);
    this.left = new Float32Array(4096);
    this.right = this.channels === 2 ? new Float32Array(4096) : null;
    this.fill = 0;
  }

  finish(frame, reason) {
    this.flush();
    this.active = false;
    this.startFrame = null;
    this.stopFrame = null;
    this.port.postMessage({ type: 'stopped', frame, frameCount: this.frames, reason });
  }

  process(inputs) {
    const input = inputs[0] ?? [];
    const first = input[0];
    const second = input[1] ?? first;
    const block = first?.length ?? 128;
    for (let index = 0; index < block; index++) {
      const frame = currentFrame + index;
      if (!this.active && this.startFrame !== null && frame >= this.startFrame) {
        this.active = true;
        this.port.postMessage({ type: 'started', frame, audioTime: frame / sampleRate });
      }
      if (this.active && this.stopFrame !== null && frame >= this.stopFrame) {
        this.finish(frame, 'stop');
        break;
      }
      if (!this.active) continue;
      this.left[this.fill] = first?.[index] ?? 0;
      if (this.right) this.right[this.fill] = second?.[index] ?? 0;
      this.fill++;
      this.frames++;
      if (this.fill === 4096) this.flush();
      if (this.frames >= this.maxFrames) {
        this.finish(frame + 1, 'limit');
        break;
      }
    }
    return true;
  }
}

registerProcessor('pmp-studio-capture-v1', StudioCaptureProcessor);
