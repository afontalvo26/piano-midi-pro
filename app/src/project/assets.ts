import type { ProjectAssetRef } from "./model.ts";

const DEFAULT_DATABASE_NAME = "piano-midi-pro-project-assets";
const ASSET_STORE = "assets";
const MAX_ASSET_BYTES = 64 * 1024 * 1024;

interface StoredAsset {
  readonly sha256: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly data: Blob;
  readonly stagedAt: number;
  readonly everCommitted: boolean;
}

export interface ProjectAssetStatus {
  readonly id: string;
  readonly sha256: string;
  readonly status: "available" | "missing" | "corrupt";
}

export class ProjectAssetError extends Error {
  readonly code: "invalid" | "oversize" | "missing" | "corrupt" | "quota" | "future-version";

  constructor(code: ProjectAssetError["code"], message: string) {
    super(message);
    this.name = "ProjectAssetError";
    this.code = code;
  }
}

function errorFromTransaction(error: unknown): Error {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new ProjectAssetError("quota", "No hay espacio para guardar el activo de audio");
  }
  return error instanceof Error ? error : new Error("No se pudo acceder al almacén de activos");
}

async function digest(blob: Blob): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(hash, (value) => value.toString(16).padStart(2, "0")).join("");
}

function assertRef(ref: ProjectAssetRef): void {
  if (!ref || typeof ref.id !== "string" || !ref.id ||
      typeof ref.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(ref.sha256) ||
      !Number.isSafeInteger(ref.byteLength) || ref.byteLength < 1 ||
      ref.byteLength > MAX_ASSET_BYTES || typeof ref.mimeType !== "string" || !ref.mimeType) {
    throw new ProjectAssetError("invalid", "Referencia de activo inválida");
  }
}

/** Immutable, content-addressed bytes. Staging happens before a project revision refers to them. */
export class ProjectAssetStore {
  private readonly databaseName: string;
  private readonly factory: IDBFactory | undefined;
  private opening: Promise<IDBDatabase> | null = null;

  constructor(options: { readonly databaseName?: string; readonly indexedDB?: IDBFactory } = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.factory = options.indexedDB ?? globalThis.indexedDB;
  }

  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    if (!this.factory) return Promise.reject(new Error("IndexedDB no está disponible para activos"));
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(this.databaseName);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(ASSET_STORE)) {
          request.result.createObjectStore(ASSET_STORE, { keyPath: "sha256" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.opening = null; };
        resolve(db);
      };
      request.onerror = () => reject(errorFromTransaction(request.error));
      request.onblocked = () => reject(new Error("Otra pestaña impide abrir los activos"));
    }).catch((error: unknown) => { this.opening = null; throw error; });
    return this.opening;
  }

  async close(): Promise<void> {
    if (!this.opening) return;
    const db = await this.opening;
    db.close();
    this.opening = null;
  }

  /** Verifies the declared bytes before the only write. Equal hashes can be shared by project copies. */
  async stageAsset(ref: ProjectAssetRef, data: Blob): Promise<void> {
    assertRef(ref);
    if (!(data instanceof Blob)) throw new ProjectAssetError("invalid", "Los bytes del activo no son un Blob");
    if (data.size > MAX_ASSET_BYTES) throw new ProjectAssetError("oversize", "El activo excede 64 MiB");
    if (data.size !== ref.byteLength || (data.type && data.type !== ref.mimeType)) {
      throw new ProjectAssetError("invalid", "Tamaño o formato del activo no coincide");
    }
    const key = ref.sha256.toLowerCase();
    if (await digest(data) !== key) {
      throw new ProjectAssetError("corrupt", "El hash SHA-256 del activo no coincide");
    }
    const db = await this.open();
    if (db.version > 1) throw new ProjectAssetError("future-version", "Almacén de activos de versión futura");
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(ASSET_STORE, "readwrite");
      const store = transaction.objectStore(ASSET_STORE);
      const request = store.get(key);
      let failure: Error | undefined;
      request.onsuccess = () => {
        const existing = request.result as StoredAsset | undefined;
        if (existing && (existing.byteLength !== ref.byteLength || existing.mimeType !== ref.mimeType)) {
          failure = new ProjectAssetError("corrupt", "Un activo con ese hash tiene metadatos incompatibles");
          transaction.abort();
        } else {
          // A verified re-stage also repairs a row whose stored bytes were corrupted.
          store.put({ sha256: key, byteLength: ref.byteLength, mimeType: ref.mimeType,
            data: new Blob([data], { type: ref.mimeType }), stagedAt: Date.now(),
            everCommitted: existing?.everCommitted === true } satisfies StoredAsset);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? errorFromTransaction(transaction.error));
    });
  }

  /** Returns null for missing bytes and rejects a mismatched stored hash or metadata. */
  async readAsset(ref: ProjectAssetRef): Promise<Blob | null> {
    assertRef(ref);
    const db = await this.open();
    const row = await new Promise<StoredAsset | undefined>((resolve, reject) => {
      const transaction = db.transaction(ASSET_STORE, "readonly");
      const request = transaction.objectStore(ASSET_STORE).get(ref.sha256.toLowerCase());
      let found: StoredAsset | undefined;
      request.onsuccess = () => { found = request.result as StoredAsset | undefined; };
      transaction.oncomplete = () => resolve(found);
      transaction.onabort = () => reject(errorFromTransaction(transaction.error));
    });
    if (!row) return null;
    if (row.sha256 !== ref.sha256.toLowerCase() || row.byteLength !== ref.byteLength ||
        row.mimeType !== ref.mimeType || !(row.data instanceof Blob) ||
        row.data.size !== ref.byteLength || await digest(row.data) !== ref.sha256.toLowerCase()) {
      throw new ProjectAssetError("corrupt", `Activo ${ref.id} dañado o alterado`);
    }
    return row.data;
  }

  async inspectAssets(refs: readonly ProjectAssetRef[]): Promise<ProjectAssetStatus[]> {
    const result: ProjectAssetStatus[] = [];
    for (const ref of refs) {
      let status: ProjectAssetStatus["status"];
      try { status = await this.readAsset(ref) ? "available" : "missing"; }
      catch (error) {
        if (!(error instanceof ProjectAssetError) || error.code !== "corrupt") throw error;
        status = "corrupt";
      }
      result.push({ id: ref.id, sha256: ref.sha256, status });
    }
    return result;
  }

  async assertAssetsAvailable(refs: readonly ProjectAssetRef[]): Promise<void> {
    const unavailable = (await this.inspectAssets(refs)).find((asset) => asset.status !== "available");
    if (unavailable) {
      throw new ProjectAssetError(unavailable.status === "missing" ? "missing" : "corrupt",
        `Activo ${unavailable.id} ${unavailable.status === "missing" ? "ausente" : "dañado"}`);
    }
  }

  /** Marks refs before CAS and reports only hashes that changed from staged to committed. */
  async markCommitted(refs: readonly ProjectAssetRef[]): Promise<readonly string[]> {
    if (refs.length === 0) return [];
    const db = await this.open();
    if (db.version > 1) throw new ProjectAssetError("future-version", "Almacén de activos de versión futura");
    return new Promise<readonly string[]>((resolve, reject) => {
      const transaction = db.transaction(ASSET_STORE, "readwrite");
      const store = transaction.objectStore(ASSET_STORE);
      let failure: Error | undefined;
      const newlyMarked = new Set<string>();
      const uniqueRefs = new Map(refs.map((ref) => [ref.sha256.toLowerCase(), ref]));
      for (const ref of uniqueRefs.values()) {
        const request = store.get(ref.sha256.toLowerCase());
        request.onsuccess = () => {
          const existing = request.result as StoredAsset | undefined;
          if (!existing || existing.byteLength !== ref.byteLength || existing.mimeType !== ref.mimeType) {
            failure = new ProjectAssetError("missing", `Activo ${ref.id} ausente antes del commit`);
            transaction.abort();
          } else if (!existing.everCommitted) {
            newlyMarked.add(existing.sha256);
            store.put({ ...existing, everCommitted: true });
          }
        };
      }
      transaction.oncomplete = () => resolve([...newlyMarked]);
      transaction.onabort = () => reject(failure ?? errorFromTransaction(transaction.error));
    });
  }

  /** Call only while holding the same cross-tab asset lock after a failed CAS. */
  async restoreStagedAfterFailedCommit(hashes: readonly string[]): Promise<void> {
    if (hashes.length === 0) return;
    const db = await this.open();
    if (db.version > 1) throw new ProjectAssetError("future-version", "Almacén de activos de versión futura");
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(ASSET_STORE, "readwrite");
      const store = transaction.objectStore(ASSET_STORE);
      for (const hash of new Set(hashes)) {
        const request = store.get(hash);
        request.onsuccess = () => {
          const row = request.result as StoredAsset | undefined;
          if (row?.everCommitted) store.put({ ...row, everCommitted: false });
        };
      }
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(errorFromTransaction(transaction.error));
    });
  }

  /** Deletes only old, never-committed staging rows absent from all confirmed projects and drafts. */
  async collectUncommitted(referencedHashes: ReadonlySet<string>, cutoffMs: number): Promise<{
    deletedCount: number; deletedBytes: number }> {
    const db = await this.open();
    if (db.version > 1) throw new ProjectAssetError("future-version", "Almacén de activos de versión futura");
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(ASSET_STORE, "readwrite");
      const store = transaction.objectStore(ASSET_STORE);
      const request = store.getAll();
      let deletedCount = 0;
      let deletedBytes = 0;
      request.onsuccess = () => {
        for (const row of request.result as StoredAsset[]) {
          if (row.everCommitted !== false || !Number.isSafeInteger(row.stagedAt) ||
              row.stagedAt > cutoffMs || referencedHashes.has(row.sha256)) continue;
          store.delete(row.sha256);
          deletedCount++;
          deletedBytes += row.byteLength;
        }
      };
      transaction.oncomplete = () => resolve({ deletedCount, deletedBytes });
      transaction.onabort = () => reject(errorFromTransaction(transaction.error));
    });
  }
}
