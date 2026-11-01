import { hashProjectDocument } from "./canonical.ts";
import type { ProjectDocumentV1 } from "./model.ts";

interface HashRequest {
  readonly id: number;
  readonly document: ProjectDocumentV1;
}

globalThis.addEventListener("message", (event: MessageEvent<HashRequest>) => {
  const { id, document } = event.data;
  void hashProjectDocument(document).then(
    (hash) => globalThis.postMessage({ id, hash }),
    (error: unknown) => globalThis.postMessage({
      id, error: error instanceof Error ? error.message : "No se pudo validar el proyecto",
      errorName: error instanceof Error ? error.name : "Error",
    }),
  );
});
