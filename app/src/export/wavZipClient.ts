import type { ProjectWavResult } from "./projectWav.ts";
import type { WavZipPackage, WavZipProgress } from "./wavZip.ts";

interface ZipReply {
  readonly kind: "progress" | "done" | "error";
  readonly progress?: WavZipProgress;
  readonly bundle?: WavZipPackage;
  readonly error?: string;
}

/** One ZIP download for master+stems. WAV buffers transfer and detach from `result`. */
export function zipProjectWavAsync(result: ProjectWavResult, signal?: AbortSignal,
  onProgress?: (progress: WavZipProgress) => void): Promise<WavZipPackage> {
  if (typeof Worker === "undefined") return Promise.reject(new Error("ZIP de WAV requiere Worker"));
  if (signal?.aborted) return Promise.reject(new DOMException("Exportación cancelada", "AbortError"));
  if (result.files.length < 2) return Promise.reject(new RangeError("ZIP requiere master y stems"));
  const worker = new Worker(new URL("./wavZip.worker.ts", import.meta.url), { type: "module" });
  const transfer = [...new Set(result.files.map((file) => file.bytes.buffer)
    .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer))];
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      finish();
      reject(error);
    };
    const onAbort = (): void => fail(new DOMException("Exportación cancelada", "AbortError"));
    const timer = setTimeout(() => fail(new Error("ZIP WAV excedió 180 segundos")), 180_000);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", (event: MessageEvent<ZipReply>) => {
      const reply = event.data;
      if (reply.kind === "progress" && reply.progress) {
        try { onProgress?.(reply.progress); } catch { /* UI progress cannot stop ZIP. */ }
      } else if (reply.kind === "error") {
        fail(new Error(reply.error ?? "Falló el ZIP WAV"));
      } else if (reply.kind === "done") {
        const bundle = reply.bundle;
        if (!bundle || !(bundle.blob instanceof Blob) || bundle.blob.size < 22 ||
            bundle.mimeType !== "application/zip" || !bundle.name.endsWith(".zip") ||
            !/^[a-f0-9]{64}$/.test(bundle.manifestSha256)) {
          fail(new Error("Worker devolvió ZIP WAV inválido"));
          return;
        }
        settled = true;
        finish();
        resolve(bundle);
      }
    });
    worker.addEventListener("error", () => fail(new Error("Falló Worker ZIP WAV")), { once: true });
    try {
      worker.postMessage({ result }, { transfer });
    } catch (error) {
      fail(error instanceof Error ? error : new Error("No se pudo enviar WAV al Worker ZIP"));
    }
  });
}
