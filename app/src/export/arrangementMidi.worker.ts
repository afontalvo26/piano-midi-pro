import { renderArrangementMidi, type ArrangementMidiOptions } from "./arrangementMidi.ts";
import type { ProjectDocumentV1 } from "../project/model.ts";

interface ExportRequest {
  readonly id: number;
  readonly document: ProjectDocumentV1;
  readonly options: ArrangementMidiOptions;
}

self.addEventListener("message", (event: MessageEvent<ExportRequest>) => {
  const { id, document, options } = event.data;
  try {
    const result = renderArrangementMidi(document, options);
    self.postMessage({ id, bytes: result.bytes.buffer, report: result.report },
      { transfer: [result.bytes.buffer] });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "No se pudo exportar MIDI",
      errorName: error instanceof Error ? error.name : "Error" });
  }
});
