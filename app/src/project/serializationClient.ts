import { hashProjectDocument } from "./canonical.ts";
import type { ProjectDocumentV1 } from "./model.ts";

interface HashReply {
  readonly id: number;
  readonly hash?: string;
  readonly error?: string;
  readonly errorName?: string;
}

/** Moves full validation, canonical JSON and SHA-256 off the browser's visual thread. */
export class ProjectSerializationClient {
  private worker: Worker | null = null;
  private workerUnavailable = false;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (hash: string) => void; reject: (error: Error) => void }>();

  get mode(): "worker" | "fallback" {
    return this.worker ? "worker" : "fallback";
  }

  private getWorker(): Worker | null {
    if (this.workerUnavailable || typeof Worker === "undefined") return null;
    if (this.worker) return this.worker;
    try {
      const worker = new Worker(new URL("./serialization.worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", (event: MessageEvent<HashReply>) => {
        const reply = event.data;
        const task = this.pending.get(reply.id);
        if (!task) return;
        this.pending.delete(reply.id);
        if (reply.error !== undefined) {
          const error = new Error(reply.error);
          error.name = reply.errorName ?? "Error";
          task.reject(error);
        } else if (typeof reply.hash === "string" && /^[0-9a-f]{64}$/.test(reply.hash)) {
          task.resolve(reply.hash);
        } else task.reject(new Error("El Worker devolvió un hash inválido"));
      });
      worker.addEventListener("error", () => {
        this.workerUnavailable = true;
        worker.terminate();
        this.worker = null;
        for (const task of this.pending.values()) task.reject(new Error("Falló el Worker de validación del proyecto"));
        this.pending.clear();
      });
      this.worker = worker;
      return worker;
    } catch {
      this.workerUnavailable = true;
      return null;
    }
  }

  hash(document: ProjectDocumentV1): Promise<string> {
    const worker = this.getWorker();
    if (!worker) return hashProjectDocument(document);
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { worker.postMessage({ id, document }); }
      catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("No se pudo enviar el proyecto al Worker"));
      }
    });
  }

  close(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const task of this.pending.values()) task.reject(new Error("Se cerró el Worker del proyecto"));
    this.pending.clear();
  }
}
