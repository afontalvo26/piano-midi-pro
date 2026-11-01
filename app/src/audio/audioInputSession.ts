import type { ProjectAssetRef, ProjectTakeRef } from "../project/model";

const PROCESSOR_NAME = "pmp-studio-capture-v1";
const MAX_PCM_BYTES = 64 * 1024 * 1024;
const MAX_DURATION_SECONDS = 180;
const workletLoads = new WeakMap<AudioContext, Promise<void>>();

export type AudioInputState = "idle" | "requesting" | "armed" | "starting" |
  "recording" | "stopping" | "ready" | "interrupted" | "error";

export interface AudioInputSnapshot {
  readonly state: AudioInputState;
  readonly permission: "unknown" | "prompt" | "granted" | "denied";
  readonly deviceId: string | null;
  readonly deviceLabel: string | null;
  readonly monitorEnabled: boolean;
  readonly feedbackRisk: boolean;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly recordedFrames: number;
  readonly peak: number;
  readonly rms: number;
  readonly clippedSamples: number;
  readonly error: string | null;
}

export interface AudioCaptureTake {
  readonly data: Blob;
  readonly ref: ProjectAssetRef;
  readonly trackId: string;
  readonly epoch: number;
  readonly startTick: number;
  /** Song-zero microseconds at the first confirmed capture frame. */
  readonly startProjectUs?: number;
  readonly startAudioTime: number;
  readonly endAudioTime: number;
  readonly frameCount: number;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly deviceId: string | null;
  readonly latencyOffsetFrames: number;
  readonly incomplete: boolean;
  readonly reason: string;
  readonly clippedSamples: number;
  readonly punch?: { readonly startTick: number; readonly endTick: number;
    readonly startAudioTime: number; readonly endAudioTime: number };
}

/** PRJ stages capture.ref/data first, then commits this editable take reference. */
export function projectTakeFromCapture(capture: AudioCaptureTake,
  takeId: string, createdAt: number): ProjectTakeRef {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(takeId) ||
      !Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new RangeError("Identidad de toma de audio inválida");
  }
  return { id: takeId, kind: "audio", assetId: capture.ref.id, createdAt,
    audioCapture: { startTick: capture.startTick,
      ...(capture.startProjectUs === undefined ? {} : { startProjectUs: capture.startProjectUs }),
      startAudioTime: capture.startAudioTime,
      frameCount: capture.frameCount, sampleRate: capture.sampleRate,
      channelCount: capture.channelCount,
      ...(capture.deviceId ? { deviceId: capture.deviceId } : {}),
      latencyOffsetFrames: capture.latencyOffsetFrames, incomplete: capture.incomplete,
      ...(capture.punch ? { punch: capture.punch } : {}),
      ...(capture.incomplete ? { reason: capture.reason } : {}) } };
}

export interface AudioInputOptions {
  readonly context: AudioContext;
  /** Must match the Studio tab lock; capture cannot create a second owner. */
  readonly ownsAudio: () => boolean;
  /** Monitor is always off until explicitly enabled with feedback acknowledgement. */
  readonly monitorDestination?: AudioNode;
  /** Adapters such as Tone may wrap the native AudioContext constructor. */
  readonly createWorkletNode?: (name: string, options: AudioWorkletNodeOptions) => AudioWorkletNode;
  readonly onState?: (snapshot: AudioInputSnapshot) => void;
  readonly onTake?: (take: AudioCaptureTake) => void;
  readonly onChunk?: (chunk: { readonly sequence: number; readonly frameCount: number;
    readonly left: Float32Array; readonly right: Float32Array | null }) => void;
  /** Read the project clock at the worklet-confirmed AudioContext time. */
  readonly projectPositionAtAudioTime?: (audioTime: number) =>
    { readonly projectUs: number; readonly projectTick: number } | null;
}

export interface AudioCaptureStart {
  readonly assetId: string;
  readonly trackId: string;
  readonly epoch: number;
  readonly startTick: number;
  /** Optional planned anchor; the callback above replaces it at actual start. */
  readonly startProjectUs?: number;
  /** Optional future AudioContext time for count-in/punch. */
  readonly audioTime?: number;
  /** Metadata only; original frames are never shifted. */
  readonly latencyOffsetFrames?: number;
  readonly punch?: { readonly startTick: number; readonly endTick: number;
    readonly startAudioTime: number; readonly endAudioTime: number };
}

interface PcmChunk {
  readonly sequence: number;
  readonly frameCount: number;
  readonly left: Float32Array;
  readonly right: Float32Array | null;
}

interface CaptureIdentity extends AudioCaptureStart {
  readonly audioTime: number;
}

type WorkletMessage =
  | { type: "started"; frame: number; audioTime: number }
  | { type: "chunk"; sequence: number; frameCount: number;
      left: Float32Array; right: Float32Array | null }
  | { type: "stopped"; frame: number; frameCount: number; reason: string }
  | { type: "cancelled" };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadCaptureWorklet(context: AudioContext): Promise<void> {
  let task = workletLoads.get(context);
  if (!task) {
    task = context.audioWorklet.addModule(new URL("./audioCaptureProcessor.js", import.meta.url).href);
    workletLoads.set(context, task);
  }
  try { await task; }
  catch (error) { workletLoads.delete(context); throw error; }
}

function wavFromChunks(chunks: readonly PcmChunk[], frames: number, channels: number,
  sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(bytes);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  ascii(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, "WAVE");
  ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, frames * channels * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (let frame = 0; frame < chunk.frameCount; frame++) {
      const left = Math.max(-1, Math.min(1, chunk.left[frame] ?? 0));
      view.setInt16(offset, left < 0 ? Math.round(left * 32768) : Math.round(left * 32767), true);
      offset += 2;
      if (channels === 2) {
        const right = Math.max(-1, Math.min(1, chunk.right?.[frame] ?? 0));
        view.setInt16(offset, right < 0 ? Math.round(right * 32768) : Math.round(right * 32767), true);
        offset += 2;
      }
    }
  }
  if (offset !== bytes.byteLength) throw new Error("Bloques de audio incompletos");
  return new Blob([bytes], { type: "audio/wav" });
}

/** One armed input, one capture generation, and a silent monitor by default. */
export class AudioInputSession {
  private readonly options: AudioInputOptions;
  private readonly context: AudioContext;
  private armGeneration = 0;
  private stateValue: AudioInputState = "idle";
  private permissionValue: AudioInputSnapshot["permission"] = "unknown";
  private errorValue: string | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private monitor: GainNode | null = null;
  private silent: GainNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private channels = 1;
  private monitorEnabled = false;
  private chunks: PcmChunk[] = [];
  private nextSequence = 0;
  private recordedFrames = 0;
  private clippedSamples = 0;
  private peak = 0;
  private identity: CaptureIdentity | null = null;
  private startedAudioTime = 0;
  private lastTake: AudioCaptureTake | null = null;
  private stopReason = "stop";
  private startWait: { resolve: (time: number) => void; reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout> } | null = null;
  private stopWait: { resolve: (take: AudioCaptureTake | null) => void;
    timer: ReturnType<typeof setTimeout> } | null = null;
  private stopPromise: Promise<AudioCaptureTake | null> | null = null;
  private stopAudioTime: number | null = null;

  constructor(options: AudioInputOptions) {
    this.options = options;
    this.context = options.context;
    if (!options.context?.audioWorklet || !globalThis.navigator?.mediaDevices?.getUserMedia) {
      throw new Error("Grabación de audio no disponible en este navegador");
    }
    if (options.monitorDestination && options.monitorDestination.context !== options.context) {
      throw new Error("Monitor y captura deben compartir AudioContext");
    }
  }

  get state(): AudioInputState { return this.stateValue; }

  snapshot(): AudioInputSnapshot {
    let rms = 0;
    let peak = this.peak;
    if (this.analyser && this.stream?.active) {
      const values = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(values);
      let power = 0;
      for (const value of values) { power += value * value; peak = Math.max(peak, Math.abs(value)); }
      rms = Math.sqrt(power / values.length);
    }
    const track = this.stream?.getAudioTracks()[0];
    return { state: this.stateValue, permission: this.permissionValue,
      deviceId: track?.getSettings().deviceId ?? null, deviceLabel: track?.label || null,
      monitorEnabled: this.monitorEnabled, feedbackRisk: this.monitorEnabled,
      sampleRate: this.context.sampleRate, channelCount: this.channels,
      recordedFrames: this.recordedFrames, peak, rms,
      clippedSamples: this.clippedSamples, error: this.errorValue };
  }

  private publish(state: AudioInputState): void {
    this.stateValue = state;
    try { this.options.onState?.(this.snapshot()); } catch { /* UI cannot break capture. */ }
  }

  /** The only permission request. Call from an explicit Arm action. */
  async arm(deviceId?: string, requestedChannels: 1 | 2 = 1): Promise<AudioInputSnapshot> {
    if (this.stateValue === "recording" || this.stateValue === "starting" ||
        this.stateValue === "stopping") throw new Error("Detén la toma antes de armar otra entrada");
    if (this.stream) return this.snapshot();
    if (!this.options.ownsAudio()) throw new Error("La pestaña no posee la salida de audio");
    this.permissionValue = "prompt";
    this.errorValue = null;
    this.publish("requesting");
    const generation = ++this.armGeneration;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        channelCount: { ideal: requestedChannels }, echoCancellation: false,
        noiseSuppression: false, autoGainControl: false,
      } });
      if (generation !== this.armGeneration || !this.options.ownsAudio()) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("La solicitud de entrada fue cancelada o se perdió el dueño de audio");
      }
      this.stream = stream;
      this.permissionValue = "granted";
      await loadCaptureWorklet(this.context);
      if (generation !== this.armGeneration || !this.options.ownsAudio()) {
        throw new Error("La entrada se canceló antes de preparar la captura");
      }
      const reported = stream.getAudioTracks()[0]?.getSettings().channelCount;
      this.channels = reported === 2 ? 2 : 1;
      const maxFrames = Math.min(Math.floor(this.context.sampleRate * MAX_DURATION_SECONDS),
        Math.floor(MAX_PCM_BYTES / (this.channels * 4)));
      this.source = this.context.createMediaStreamSource(stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.monitor = this.context.createGain();
      this.monitor.gain.value = 0;
      this.silent = this.context.createGain();
      this.silent.gain.value = 0;
      const workletOptions: AudioWorkletNodeOptions = {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
        channelCount: this.channels, channelCountMode: "explicit",
        processorOptions: { channels: this.channels, maxFrames },
      };
      this.worklet = this.options.createWorkletNode
        ? this.options.createWorkletNode(PROCESSOR_NAME, workletOptions)
        : new AudioWorkletNode(this.context, PROCESSOR_NAME, workletOptions);
      this.worklet.port.onmessage = (event: MessageEvent<WorkletMessage>) => this.onWorkletMessage(event.data);
      this.source.connect(this.analyser);
      this.source.connect(this.monitor).connect(this.options.monitorDestination ?? this.context.destination);
      this.source.connect(this.worklet).connect(this.silent).connect(this.context.destination);
      stream.getAudioTracks()[0]?.addEventListener("ended", () => this.interrupt("input-disconnected"), { once: true });
      this.publish("armed");
      return this.snapshot();
    } catch (error) {
      if (generation !== this.armGeneration) throw error;
      this.permissionValue = error instanceof DOMException && error.name === "NotAllowedError"
        ? "denied" : this.permissionValue;
      this.errorValue = `No se pudo armar la entrada: ${message(error)}`;
      this.disconnect();
      this.publish("error");
      throw error;
    }
  }

  setMonitorEnabled(enabled: boolean, acknowledgeFeedback = false): AudioInputSnapshot {
    if (!this.monitor || !this.stream) throw new Error("Arma una entrada antes de monitorizar");
    if (enabled && !acknowledgeFeedback) {
      throw new Error("Activa el monitor sólo tras revisar el riesgo de realimentación");
    }
    if (!this.options.ownsAudio()) throw new Error("La pestaña no posee la salida de audio");
    this.monitorEnabled = enabled;
    this.monitor.gain.setTargetAtTime(enabled ? 0.25 : 0, this.context.currentTime, 0.01);
    this.publish(this.stateValue);
    return this.snapshot();
  }

  /** Resolves when the worklet confirms its actual first captured frame. */
  start(options: AudioCaptureStart): Promise<number> {
    if (this.stateValue !== "armed" || !this.worklet || !this.stream?.active) {
      return Promise.reject(new Error("La entrada no está armada"));
    }
    if (!this.options.ownsAudio() || this.context.state !== "running") {
      return Promise.reject(new Error("Audio suspendido o sin dueño"));
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(options.assetId) ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(options.trackId) ||
        !Number.isSafeInteger(options.epoch) || options.epoch < 0 ||
        !Number.isSafeInteger(options.startTick) || options.startTick < 0 ||
        (options.startProjectUs !== undefined &&
          (!Number.isSafeInteger(options.startProjectUs) || options.startProjectUs < 0)) ||
        !Number.isSafeInteger(options.latencyOffsetFrames ?? 0) ||
        Math.abs(options.latencyOffsetFrames ?? 0) > this.context.sampleRate * 2 ||
        (options.punch !== undefined &&
          (!Number.isSafeInteger(options.punch.startTick) ||
            !Number.isSafeInteger(options.punch.endTick) ||
            options.punch.startTick !== options.startTick ||
            options.punch.endTick <= options.punch.startTick ||
            !Number.isFinite(options.punch.startAudioTime) ||
            !Number.isFinite(options.punch.endAudioTime) ||
            options.punch.endAudioTime <= options.punch.startAudioTime))) {
      return Promise.reject(new RangeError("Identidad o marca de toma inválida"));
    }
    const audioTime = options.audioTime ?? this.context.currentTime + 0.08;
    if (!Number.isFinite(audioTime) || audioTime < this.context.currentTime + 0.025 ||
        audioTime > this.context.currentTime + 60) {
      return Promise.reject(new RangeError("Inicio debe programarse 25 ms a 60 s en el futuro"));
    }
    if (options.punch && Math.abs(options.punch.startAudioTime - audioTime) > 1 / this.context.sampleRate) {
      return Promise.reject(new RangeError("Punch no coincide con el inicio programado"));
    }
    this.identity = { ...options, audioTime };
    this.chunks = [];
    this.recordedFrames = 0;
    this.nextSequence = 0;
    this.clippedSamples = 0;
    this.peak = 0;
    this.lastTake = null;
    this.stopPromise = null;
    this.stopAudioTime = null;
    this.stopReason = "stop";
    this.publish("starting");
    const atFrame = Math.round(audioTime * this.context.sampleRate);
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.startWait = null;
        this.errorValue = "El procesador de captura no confirmó el inicio";
        this.cancel();
        reject(new Error(this.errorValue));
      }, Math.max(2_000, Math.round((audioTime - this.context.currentTime) * 1000) + 2_000));
      this.startWait = { resolve, reject, timer };
      this.worklet!.port.postMessage({ type: "start", atFrame });
    });
  }

  /** Punch-out may be scheduled at a future AudioContext time. */
  stop(audioTime = this.context.currentTime + 0.025): Promise<AudioCaptureTake | null> {
    if (this.stopPromise) {
      if (this.stopAudioTime !== null && audioTime < this.stopAudioTime &&
          audioTime >= this.context.currentTime && this.worklet) {
        this.stopAudioTime = audioTime;
        this.worklet.port.postMessage({ type: "stop",
          atFrame: Math.round(audioTime * this.context.sampleRate) });
      }
      return this.stopPromise;
    }
    if (!this.worklet || !this.identity ||
        (this.stateValue !== "recording" && this.stateValue !== "starting")) {
      return Promise.resolve(this.lastTake);
    }
    if (!Number.isFinite(audioTime) || audioTime < 0 ||
        audioTime > this.context.currentTime + 60) {
      return Promise.reject(new RangeError("Final de toma fuera del reloj de audio"));
    }
    if (this.stateValue === "starting" && audioTime <= this.identity.audioTime) {
      this.cancel();
      return Promise.resolve(null);
    }
    if (this.stateValue !== "starting") this.publish("stopping");
    this.stopAudioTime = audioTime;
    this.stopPromise = new Promise<AudioCaptureTake | null>((resolve) => {
      const timer = setTimeout(() => {
        this.stopWait = null;
        void this.finalize(this.context.currentTime, "capture-timeout").then(resolve);
      }, Math.max(2_000, Math.round((audioTime - this.context.currentTime) * 1000) + 2_000));
      this.stopWait = { resolve, timer };
      this.worklet!.port.postMessage({ type: "stop",
        atFrame: Math.round(audioTime * this.context.sampleRate) });
    });
    return this.stopPromise;
  }

  /** Lock loss, permission revocation and device disconnect preserve confirmed chunks. */
  interrupt(reason: string): void {
    if (this.stateValue !== "recording" && this.stateValue !== "starting" &&
        this.stateValue !== "stopping") return;
    this.stopReason = reason || "interrupted";
    if (this.stateValue === "starting" && this.identity &&
        this.identity.audioTime > this.context.currentTime + 0.025) {
      this.cancel();
      return;
    }
    void this.stop(this.context.currentTime + 0.025);
  }

  /** Explicit discard: no take/ref is produced. */
  cancel(): void {
    this.armGeneration++;
    this.worklet?.port.postMessage({ type: "cancel" });
    this.chunks = [];
    this.recordedFrames = 0;
    this.identity = null;
    this.lastTake = null;
    if (this.startWait) {
      clearTimeout(this.startWait.timer);
      this.startWait.reject(new Error("Toma cancelada"));
      this.startWait = null;
    }
    if (this.stopWait) {
      clearTimeout(this.stopWait.timer);
      this.stopWait.resolve(null);
      this.stopWait = null;
    }
    this.stopPromise = null;
    this.stopAudioTime = null;
    this.disconnect();
    this.publish("idle");
  }

  dispose(): void {
    if (this.stateValue === "recording" || this.stateValue === "starting" ||
        this.stateValue === "stopping") {
      this.interrupt("session-disposed");
      return;
    }
    this.cancel();
  }

  private onWorkletMessage(data: WorkletMessage): void {
    if (data.type === "started") {
      if (!this.identity || !this.startWait) return;
      if (this.options.projectPositionAtAudioTime) {
        let position: ReturnType<NonNullable<AudioInputOptions["projectPositionAtAudioTime"]>>;
        try { position = this.options.projectPositionAtAudioTime(data.audioTime); }
        catch { position = null; }
        if (!position || !Number.isSafeInteger(position.projectUs) || position.projectUs < 0 ||
            !Number.isSafeInteger(position.projectTick) || position.projectTick < 0) {
          this.errorValue = "Se perdió el reloj del proyecto antes del primer frame";
          this.cancel();
          return;
        }
        this.identity = { ...this.identity, startTick: position.projectTick,
          startProjectUs: position.projectUs,
          ...(this.identity.punch ? { punch: { ...this.identity.punch,
            startTick: position.projectTick,
            endTick: Math.max(this.identity.punch.endTick, position.projectTick + 1),
            startAudioTime: data.audioTime } } : {}) };
      } else if (this.identity.punch) {
        this.identity = { ...this.identity, punch: { ...this.identity.punch,
          startAudioTime: data.audioTime } };
      }
      this.startedAudioTime = data.audioTime;
      const pending = this.startWait;
      this.startWait = null;
      clearTimeout(pending.timer);
      if (this.stateValue === "starting") this.publish(this.stopPromise ? "stopping" : "recording");
      pending.resolve(data.audioTime);
    } else if (data.type === "chunk") {
      if (!this.identity || (this.stateValue !== "recording" && this.stateValue !== "stopping") ||
          data.sequence !== this.nextSequence || !Number.isSafeInteger(data.frameCount) ||
          data.frameCount < 1 || data.frameCount > 4096 ||
          !(data.left instanceof Float32Array) || data.left.length < data.frameCount ||
          (this.channels === 2 && (!(data.right instanceof Float32Array) ||
            data.right.length < data.frameCount))) {
        this.interrupt("capture-chunk-invalid");
        return;
      }
      for (let frame = 0; frame < data.frameCount; frame++) {
        const left = Math.abs(data.left[frame]!);
        const right = this.channels === 2 ? Math.abs(data.right![frame]!) : 0;
        if (!Number.isFinite(left) || !Number.isFinite(right)) {
          this.interrupt("capture-nonfinite");
          return;
        }
        this.peak = Math.max(this.peak, left, right);
        if (left >= 0.98) this.clippedSamples++;
        if (right >= 0.98) this.clippedSamples++;
      }
      this.nextSequence++;
      this.chunks.push(data);
      this.recordedFrames += data.frameCount;
      try { this.options.onChunk?.({ sequence: data.sequence, frameCount: data.frameCount,
        left: data.left.slice(0, data.frameCount),
        right: data.right?.slice(0, data.frameCount) ?? null }); }
      catch { /* persistence callback cannot block the audio thread. */ }
      if (this.recordedFrames * this.channels * 4 > MAX_PCM_BYTES) this.interrupt("capture-memory-limit");
    } else if (data.type === "stopped") {
      if (!this.identity) return;
      const pending = this.stopWait;
      this.stopWait = null;
      if (pending) clearTimeout(pending.timer);
      void this.finalize(data.frame / this.context.sampleRate,
        this.stopReason === "stop" ? data.reason : this.stopReason).then((take) => pending?.resolve(take));
    }
  }

  private async finalize(endAudioTime: number, reason: string): Promise<AudioCaptureTake | null> {
    const identity = this.identity;
    const deviceId = this.stream?.getAudioTracks()[0]?.getSettings().deviceId ?? null;
    this.identity = null;
    this.disconnect();
    if (!identity || this.recordedFrames === 0) {
      this.errorValue = "La toma terminó sin frames confirmados";
      this.publish("error");
      return null;
    }
    try {
      const data = wavFromChunks(this.chunks, this.recordedFrames,
        this.channels, this.context.sampleRate);
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await data.arrayBuffer()));
      const sha256 = Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const ref: ProjectAssetRef = { id: identity.assetId, sha256,
        byteLength: data.size, mimeType: "audio/wav", sourceKind: "recorded",
        license: "user-controlled", frameCount: this.recordedFrames,
        sampleRate: this.context.sampleRate, channelCount: this.channels };
      const take: AudioCaptureTake = { data, ref, trackId: identity.trackId,
        epoch: identity.epoch, startTick: identity.startTick,
        ...(identity.startProjectUs === undefined ? {} : { startProjectUs: identity.startProjectUs }),
        startAudioTime: this.startedAudioTime, endAudioTime,
        frameCount: this.recordedFrames, sampleRate: this.context.sampleRate,
        channelCount: this.channels, deviceId,
        latencyOffsetFrames: identity.latencyOffsetFrames ?? 0,
        ...(identity.punch ? { punch: identity.punch } : {}),
        incomplete: reason !== "stop", reason, clippedSamples: this.clippedSamples };
      this.lastTake = take;
      this.chunks = [];
      this.publish(take.incomplete ? "interrupted" : "ready");
      try { this.options.onTake?.(take); } catch { /* app callback cannot alter captured bytes */ }
      return take;
    } catch (error) {
      this.errorValue = `No se pudo cerrar la toma: ${message(error)}`;
      this.publish("error");
      return null;
    }
  }

  private disconnect(): void {
    this.monitorEnabled = false;
    this.monitor?.disconnect();
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.worklet?.disconnect();
    this.worklet?.port.close();
    this.silent?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.monitor = null;
    this.silent = null;
    this.worklet = null;
  }
}
