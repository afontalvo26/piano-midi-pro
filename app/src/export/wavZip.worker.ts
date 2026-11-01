import type { ProjectWavResult } from "./projectWav.ts";
import { createWavZip } from "./wavZip.ts";

self.addEventListener("message", (event: MessageEvent<{ readonly result: ProjectWavResult }>) => {
  void createWavZip(event.data.result, (progress) => {
    self.postMessage({ kind: "progress", progress });
  }).then((bundle) => {
    self.postMessage({ kind: "done", bundle });
  }, (error: unknown) => {
    self.postMessage({ kind: "error",
      error: error instanceof Error ? error.message : "No se pudo empaquetar WAV" });
  });
});
