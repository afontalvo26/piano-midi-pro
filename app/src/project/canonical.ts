import type { ProjectDocumentV1 } from "./model.ts";
import { validateProjectDocument } from "./validate.ts";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError("Valor no serializable en proyecto");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

/** Deterministic UTF-8 JSON payload. Revision and hash are deliberately absent. */
export function canonicalizeProjectDocument(document: ProjectDocumentV1): string {
  validateProjectDocument(document);
  return stableJson(document);
}

export async function hashProjectDocument(document: ProjectDocumentV1): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeProjectDocument(document));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
