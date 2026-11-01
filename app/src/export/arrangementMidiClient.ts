import type { ProjectDocumentV1 } from "../project/model.ts";
import type { ArrangementMidiOptions, ArrangementMidiReport, ArrangementMidiResult } from "./arrangementMidi.ts";

interface ExportReply {
  readonly id: number;
  readonly bytes?: ArrayBuffer;
  readonly report?: ArrangementMidiReport;
  readonly error?: string;
  readonly errorName?: string;
}

/** Browser entrypoint. No synchronous fallback: export fails explicitly if Worker is unavailable. */
export class ArrangementMidiExporter {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: ArrangementMidiResult) => void;
    reject: (error: Error) => void }>();

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined") throw new Error("Exportación MIDI requiere Worker en este navegador");
    const worker = new Worker(new URL("./arrangementMidi.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<ExportReply>) => {
      const reply = event.data;
      const task = this.pending.get(reply.id);
      if (!task) return;
      this.pending.delete(reply.id);
      if (reply.error !== undefined) {
        const error = new Error(reply.error);
        error.name = reply.errorName ?? "Error";
        task.reject(error);
      } else if (reply.bytes instanceof ArrayBuffer && reply.report?.smfType === 1) {
        task.resolve({ bytes: new Uint8Array(reply.bytes), report: reply.report });
      } else task.reject(new Error("El Worker devolvió un SMF inválido"));
    });
    worker.addEventListener("error", () => {
      worker.terminate();
      this.worker = null;
      for (const task of this.pending.values()) task.reject(new Error("Falló el Worker de exportación MIDI"));
      this.pending.clear();
    });
    this.worker = worker;
    return worker;
  }

  export(document: ProjectDocumentV1, options: ArrangementMidiOptions = {}): Promise<ArrangementMidiResult> {
    const worker = this.getWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { worker.postMessage({ id, document, options }); }
      catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("No se pudo enviar el proyecto al Worker"));
      }
    });
  }

  close(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const task of this.pending.values()) task.reject(new Error("Se cerró el exportador MIDI"));
    this.pending.clear();
  }
}

export async function exportArrangementMidi(document: ProjectDocumentV1,
  options: ArrangementMidiOptions = {}): Promise<ArrangementMidiResult> {
  const exporter = new ArrangementMidiExporter();
  try { return await exporter.export(document, options); }
  finally { exporter.close(); }
}
