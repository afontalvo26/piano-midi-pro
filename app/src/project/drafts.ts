import type { ProjectDocumentV1 } from "./model.ts";
import { ProjectSerializationClient } from "./serializationClient.ts";

const DEFAULT_DATABASE_NAME = "piano-midi-pro-project-drafts";
const DRAFT_STORE = "drafts";

interface StoredDraft {
  readonly key: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly baseRevision: number;
  readonly generation: number;
  readonly schemaVersion: 1;
  readonly hash: string;
  readonly writtenAt: number;
  readonly document: ProjectDocumentV1;
}

export interface ProjectDraft {
  readonly projectId: string;
  readonly sessionId: string;
  readonly baseRevision: number;
  readonly generation: number;
  readonly hash: string;
  readonly writtenAt: number;
  readonly document: ProjectDocumentV1;
}

export interface ProjectDraftSummary {
  readonly projectId: string;
  readonly sessionId: string;
  readonly baseRevision: number;
  readonly generation: number;
  readonly hash: string;
  readonly writtenAt: number;
  readonly status: "verified" | "corrupt" | "future-version";
}

function keyFor(projectId: string, sessionId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(projectId) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(sessionId)) {
    throw new RangeError("ID de borrador inválido");
  }
  return `${projectId}\0${sessionId}`;
}

/** Separate journal: each editing tab gets its own hash-verified draft row. */
export class ProjectDraftStore {
  private readonly databaseName: string;
  private readonly factory: IDBFactory | undefined;
  private readonly serialization = new ProjectSerializationClient();
  private opening: Promise<IDBDatabase> | null = null;

  constructor(options: { readonly databaseName?: string; readonly indexedDB?: IDBFactory } = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.factory = options.indexedDB ?? globalThis.indexedDB;
  }

  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    if (!this.factory) return Promise.reject(new Error("IndexedDB no está disponible para borradores"));
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(this.databaseName);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DRAFT_STORE)) {
          request.result.createObjectStore(DRAFT_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.opening = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error("No se pudo abrir journal"));
      request.onblocked = () => reject(new Error("Otra pestaña bloquea el journal"));
    }).catch((error: unknown) => { this.opening = null; throw error; });
    return this.opening;
  }

  async close(): Promise<void> {
    if (this.opening) {
      const db = await this.opening;
      db.close();
      this.opening = null;
    }
    this.serialization.close();
  }

  /** Hashes an owned document before a single atomic journal row write. */
  async write(document: ProjectDocumentV1, baseRevision: number, sessionId: string,
    generation: number): Promise<ProjectDraft> {
    const key = keyFor(document.id, sessionId);
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 1 ||
        !Number.isSafeInteger(generation) || generation < 1) throw new RangeError("Versión de borrador inválida");
    const owned = structuredClone(document);
    const hash = await this.serialization.hash(owned);
    const db = await this.open();
    if (db.version > 1) throw new Error("Journal de versión futura en modo solo lectura");
    const row: StoredDraft = { key, projectId: owned.id, sessionId, baseRevision,
      generation, schemaVersion: 1, hash, writtenAt: Date.now(), document: owned };
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DRAFT_STORE, "readwrite");
      const store = transaction.objectStore(DRAFT_STORE);
      const request = store.get(key);
      let failure: Error | undefined;
      request.onsuccess = () => {
        const current = request.result as StoredDraft | undefined;
        if (current && current.generation > generation) {
          failure = new RangeError("Borrador más reciente ya guardado");
          transaction.abort();
        } else store.put(row);
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("No se pudo guardar borrador"));
    });
    return row;
  }

  private async rows(): Promise<StoredDraft[]> {
    const db = await this.open();
    return new Promise<StoredDraft[]>((resolve, reject) => {
      const transaction = db.transaction(DRAFT_STORE, "readonly");
      const request = transaction.objectStore(DRAFT_STORE).getAll();
      let found: StoredDraft[] = [];
      request.onsuccess = () => { found = request.result as StoredDraft[]; };
      transaction.oncomplete = () => resolve(found);
      transaction.onabort = () => reject(transaction.error ?? new Error("No se pudo leer journal"));
    });
  }

  private async verify(row: StoredDraft): Promise<ProjectDraftSummary["status"]> {
    if (row.schemaVersion > 1) return "future-version";
    if (row.schemaVersion !== 1 || row.document?.id !== row.projectId ||
        !Number.isSafeInteger(row.baseRevision) || row.baseRevision < 1 ||
        !Number.isSafeInteger(row.generation) || row.generation < 1 ||
        typeof row.hash !== "string") return "corrupt";
    try { return await this.serialization.hash(row.document) === row.hash ? "verified" : "corrupt"; }
    catch { return "corrupt"; }
  }

  async list(projectId: string): Promise<ProjectDraftSummary[]> {
    const drafts = (await this.rows()).filter((row) => row.projectId === projectId);
    const result: ProjectDraftSummary[] = [];
    for (const row of drafts) result.push({ projectId: row.projectId, sessionId: row.sessionId,
      baseRevision: row.baseRevision, generation: row.generation, hash: row.hash,
      writtenAt: row.writtenAt, status: await this.verify(row) });
    return result.sort((a, b) => b.writtenAt - a.writtenAt || a.sessionId.localeCompare(b.sessionId));
  }

  async read(projectId: string, sessionId: string): Promise<ProjectDraft | null> {
    const key = keyFor(projectId, sessionId);
    const db = await this.open();
    const row = await new Promise<StoredDraft | undefined>((resolve, reject) => {
      const transaction = db.transaction(DRAFT_STORE, "readonly");
      const request = transaction.objectStore(DRAFT_STORE).get(key);
      let found: StoredDraft | undefined;
      request.onsuccess = () => { found = request.result as StoredDraft | undefined; };
      transaction.oncomplete = () => resolve(found);
      transaction.onabort = () => reject(transaction.error ?? new Error("No se pudo leer borrador"));
    });
    if (!row) return null;
    if (await this.verify(row) !== "verified") throw new Error("Borrador dañado o de versión futura");
    return row;
  }

  async discard(projectId: string, sessionId: string): Promise<void> {
    const db = await this.open();
    if (db.version > 1) throw new Error("Journal de versión futura en modo solo lectura");
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DRAFT_STORE, "readwrite");
      transaction.objectStore(DRAFT_STORE).delete(keyFor(projectId, sessionId));
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("No se pudo descartar borrador"));
    });
  }

  /** GC must keep every asset in every draft, even a damaged draft that cannot be recovered yet. */
  async referencedHashes(): Promise<Set<string>> {
    const hashes = new Set<string>();
    for (const row of await this.rows()) {
      if (await this.verify(row) !== "verified" || !Array.isArray(row.document?.assets)) {
        throw new Error("Journal dañado o futuro: se suspende limpieza de activos");
      }
      for (const asset of row.document.assets) {
        if (typeof asset?.sha256 === "string" && /^[a-f0-9]{64}$/i.test(asset.sha256)) {
          hashes.add(asset.sha256.toLowerCase());
        }
      }
    }
    return hashes;
  }
}
