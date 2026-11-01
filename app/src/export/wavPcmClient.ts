import { validateWavPcm, WavPcmError, type EncodedWavPcm,
  type StereoPcm, type WavPcmOptions, type WavPcmReport } from "./wavPcm.ts";

interface WavReply {
  readonly bytes?: ArrayBuffer;
  readonly report?: WavPcmReport;
  readonly error?: string;
  readonly code?: WavPcmError["code"];
}

/** Transfers PCM to a dedicated Worker; the caller's channel arrays are detached. */
export function encodeWavPcmAsync(pcm: StereoPcm, options: WavPcmOptions,
  signal?: AbortSignal): Promise<EncodedWavPcm> {
  if (typeof Worker === "undefined") return Promise.reject(new Error("WAV requiere Worker en este navegador"));
  if (signal?.aborted) return Promise.reject(new DOMException("Exportación cancelada", "AbortError"));
  const left = pcm.left.buffer instanceof ArrayBuffer ? pcm.left : pcm.left.slice();
  const right = pcm.right.buffer instanceof ArrayBuffer ? pcm.right : pcm.right.slice();
  const transfers = [...new Set([left.buffer, right.buffer])];
  const worker = new Worker(new URL("./wavPcm.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = (): void => {
      finish();
      reject(new DOMException("Exportación cancelada", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", (event: MessageEvent<WavReply>) => {
      finish();
      const reply = event.data;
      if (reply.error) {
        reject(new WavPcmError(reply.code ?? "invalid-pcm", reply.error));
        return;
      }
      if (!(reply.bytes instanceof ArrayBuffer) || !reply.report) {
        reject(new WavPcmError("invalid-pcm", "Worker devolvió WAV incompleto"));
        return;
      }
      const bytes = new Uint8Array(reply.bytes);
      try {
        const header = validateWavPcm(bytes);
        if (header.frames !== reply.report.frames ||
            header.sampleRate !== reply.report.sampleRate ||
            header.format !== reply.report.format ||
            bytes.byteLength !== reply.report.byteLength) {
          throw new WavPcmError("invalid-pcm", "WAV y reporte no coinciden");
        }
        resolve({ bytes, report: reply.report });
      } catch (error) { reject(error); }
    }, { once: true });
    worker.addEventListener("error", () => {
      finish();
      reject(new WavPcmError("invalid-pcm", "Falló el Worker de WAV"));
    }, { once: true });
    try {
      worker.postMessage({ pcm: { sampleRate: pcm.sampleRate, left, right }, options },
        { transfer: transfers as ArrayBuffer[] });
    } catch (error) {
      finish();
      reject(error instanceof Error ? error : new WavPcmError("invalid-pcm", "No se pudo enviar PCM al Worker"));
    }
  });
}
