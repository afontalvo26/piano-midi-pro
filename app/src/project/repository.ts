import { duplicateProjectDocument } from "./commands.ts";
import { ProjectAssetStore, type ProjectAssetStatus } from "./assets.ts";
import { ProjectDraftStore, type ProjectDraft, type ProjectDraftSummary } from "./drafts.ts";
import { PROJECT_SCHEMA_VERSION, type ProjectAssetRef, type ProjectDocumentV1 } from "./model.ts";
import { ProjectSerializationClient } from "./serializationClient.ts";

const DATABASE_NAME = "piano-midi-pro-projects";
const DOCUMENT_STORE = "projectRevisions";
const INDEX_STORE = "projectIndex";
const STAGING_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredRevision {
  readonly id: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly hash: string;
  readonly committedAt: number;
  readonly document: unknown;
}

interface StoredIndex {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly updatedAt: number;
  readonly archived: boolean;
}

export interface ProjectRevision {
  readonly projectId: string;
  readonly revision: number;
  readonly hash: string;
  readonly committedAt: number;
  readonly document: ProjectDocumentV1;
}

export type ProjectReadResult =
  | { readonly status: "ready"; readonly value: ProjectRevision; readonly readOnly: boolean }
  | { readonly status: "future-version"; readonly projectId: string; readonly schemaVersion: number; readonly revision: number };

export interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly updatedAt: number;
  readonly archived: boolean;
  readonly readOnly: boolean;
}

export interface ProjectAssetGcReport {
  readonly status: "completed" | "unsupported";
  readonly deletedCount: number;
  readonly deletedBytes: number;
}

export class ProjectConflictError extends Error {
  constructor(projectId: string, expectedRevision: number, actualRevision: number) {
    super(`El proyecto ${projectId} cambió en otra pestaña: se esperaba revisión ${expectedRevision}, existe ${actualRevision}`);
    this.name = "ProjectConflictError";
  }
}

export class FutureProjectVersionError extends Error {
  constructor() {
    super("El proyecto usa una versión futura; ábrelo en modo de solo lectura");
    this.name = "FutureProjectVersionError";
  }
}

export class ProjectIntegrityError extends Error {
  constructor(projectId: string) {
    super(`La revisión guardada de ${projectId} no coincide con su hash`);
    this.name = "ProjectIntegrityError";
  }
}

function databaseError(error: unknown, action: string): Error {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError") return new Error("No hay espacio disponible para guardar el proyecto");
  const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
  return new Error(`No se pudo ${action} el proyecto${detail}`);
}

/** Separate IndexedDB database; never upgrades or deletes the existing MIDI-take database. */
export class ProjectRepository {
  private readonly databaseName: string;
  private readonly factory: IDBFactory | undefined;
  private readonly serialization = new ProjectSerializationClient();
  private readonly assets: ProjectAssetStore;
  private readonly drafts: ProjectDraftStore;
  private readonly gcSafe: boolean;
  private opening: Promise<IDBDatabase> | null = null;

  constructor(options: { databaseName?: string; assetDatabaseName?: string;
    draftDatabaseName?: string; indexedDB?: IDBFactory } = {}) {
    this.databaseName = options.databaseName ?? DATABASE_NAME;
    this.factory = options.indexedDB ?? globalThis.indexedDB;
    this.gcSafe = options.assetDatabaseName === undefined && options.draftDatabaseName === undefined;
    this.assets = new ProjectAssetStore({
      databaseName: options.assetDatabaseName ?? (options.databaseName ? `${options.databaseName}-assets` : undefined),
      indexedDB: options.indexedDB,
    });
    this.drafts = new ProjectDraftStore({
      databaseName: options.draftDatabaseName ?? (options.databaseName ? `${options.databaseName}-drafts` : undefined),
      indexedDB: options.indexedDB,
    });
  }

  get serializationMode(): "worker" | "fallback" {
    return this.serialization.mode;
  }

  private withAssetLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request(`pmp-project-assets:${this.databaseName}`, task) : task();
  }

  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    if (!this.factory) return Promise.reject(new Error("IndexedDB no está disponible en este navegador"));
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      // Opening without a version permits safe reads of a database upgraded by a newer app.
      const request = this.factory!.open(this.databaseName);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DOCUMENT_STORE)) db.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(INDEX_STORE)) db.createObjectStore(INDEX_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.opening = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(databaseError(request.error, "abrir"));
      request.onblocked = () => reject(new Error("Otra pestaña impide abrir la base de proyectos"));
    }).catch((error: unknown) => {
      this.opening = null;
      throw error;
    });
    return this.opening;
  }

  async close(): Promise<void> {
    if (this.opening) {
      const db = await this.opening;
      db.close();
      this.opening = null;
    }
    this.serialization.close();
    await this.assets.close();
    await this.drafts.close();
  }

  writeDraft(document: ProjectDocumentV1, baseRevision: number, sessionId: string,
    generation: number): Promise<ProjectDraft> {
    return this.withAssetLock(() => this.drafts.write(document, baseRevision, sessionId, generation));
  }

  listDrafts(projectId: string): Promise<ProjectDraftSummary[]> {
    return this.drafts.list(projectId);
  }

  readDraft(projectId: string, sessionId: string): Promise<ProjectDraft | null> {
    return this.drafts.read(projectId, sessionId);
  }

  discardDraft(projectId: string, sessionId: string): Promise<void> {
    return this.drafts.discard(projectId, sessionId);
  }

  /** Recovery never overwrites either the confirmed project or a newer tab's revision. */
  async recoverDraftAsCopy(projectId: string, sessionId: string,
    options: { readonly id: string; readonly name?: string; readonly at: number }): Promise<ProjectRevision> {
    const draft = await this.readDraft(projectId, sessionId);
    if (!draft) throw new Error("Borrador no encontrado");
    await this.assertAssetsAvailable(draft.document.assets);
    const copy = duplicateProjectDocument(draft.document,
      { id: options.id, name: options.name ?? draft.document.name, at: options.at });
    return this.commitRevision(copy, 0);
  }

  stageAsset(ref: ProjectAssetRef, data: Blob): Promise<void> {
    return this.withAssetLock(() => this.assets.stageAsset(ref, data));
  }

  readAsset(ref: ProjectAssetRef): Promise<Blob | null> {
    return this.assets.readAsset(ref);
  }

  inspectAssets(refs: readonly ProjectAssetRef[]): Promise<ProjectAssetStatus[]> {
    return this.assets.inspectAssets(refs);
  }

  assertAssetsAvailable(refs: readonly ProjectAssetRef[]): Promise<void> {
    return this.assets.assertAssetsAvailable(refs);
  }

  /** expectedRevision=0 creates a new project; all other commits are compare-and-swap. */
  async commitRevision(document: ProjectDocumentV1, expectedRevision: number): Promise<ProjectRevision> {
    return this.withAssetLock(() => this.commitRevisionUnlocked(document, expectedRevision));
  }

  private async commitRevisionUnlocked(document: ProjectDocumentV1, expectedRevision: number): Promise<ProjectRevision> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new RangeError("Revisión esperada inválida");
    const ownedDocument = structuredClone(document);
    // Bytes are staged and verified before a revision can refer to them.
    await this.assertAssetsAvailable(ownedDocument.assets);
    // Hashing validates this owned copy; the caller cannot mutate it while digest runs.
    const hash = await this.serialization.hash(ownedDocument);
    // Mark before CAS to protect successful history, including an Undo reference no longer in the head.
    const newlyMarked = await this.assets.markCommitted(ownedDocument.assets);
    try {
      return await this.writeRevisionCas(ownedDocument, hash, expectedRevision);
    } catch (error) {
      // The same Web Lock excludes another commit using these hashes while CAS runs. Only marks
      // introduced by this failed attempt may return to staging; legacy committed bytes stay pinned.
      if (this.gcSafe && globalThis.navigator?.locks) {
        try { await this.assets.restoreStagedAfterFailedCommit(newlyMarked); }
        catch { /* Retaining an orphan is safer than masking a failed CAS or deleting history. */ }
      }
      // A browser crash between markCommitted and CAS cannot be rolled back here. GC keeps
      // those bytes until a durable successful-commit ledger can distinguish them from history.
      throw error;
    }
  }

  private async writeRevisionCas(ownedDocument: ProjectDocumentV1, hash: string,
    expectedRevision: number): Promise<ProjectRevision> {
    const db = await this.open();
    if (db.version > PROJECT_SCHEMA_VERSION) throw new FutureProjectVersionError();
    const revision = expectedRevision + 1;
    if (!Number.isSafeInteger(revision)) throw new RangeError("Límite de revisiones excedido");
    const committedAt = Date.now();
    const record: StoredRevision = {
      id: ownedDocument.id, schemaVersion: PROJECT_SCHEMA_VERSION,
      revision, hash, committedAt, document: ownedDocument,
    };
    const index: StoredIndex = {
      id: ownedDocument.id, name: ownedDocument.name, schemaVersion: PROJECT_SCHEMA_VERSION,
      revision, updatedAt: ownedDocument.updatedAt, archived: ownedDocument.archived,
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([DOCUMENT_STORE, INDEX_STORE], "readwrite");
      const store = transaction.objectStore(DOCUMENT_STORE);
      const request = store.get(ownedDocument.id);
      let failure: Error | undefined;
      request.onsuccess = () => {
        try {
          const current = request.result as StoredRevision | undefined;
          const actualRevision = current?.revision ?? 0;
          if (current && (current.schemaVersion > PROJECT_SCHEMA_VERSION || db.version > PROJECT_SCHEMA_VERSION)) {
            throw new FutureProjectVersionError();
          }
          if (actualRevision !== expectedRevision) {
            throw new ProjectConflictError(ownedDocument.id, expectedRevision, actualRevision);
          }
          store.put(record);
          transaction.objectStore(INDEX_STORE).put(index);
        } catch (error) {
          failure = error instanceof Error ? error : databaseError(error, "guardar");
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? databaseError(transaction.error, "guardar"));
    });
    return { projectId: ownedDocument.id, revision, hash, committedAt, document: ownedDocument };
  }

  /** Conservative GC: only never-committed staging bytes older than seven days. */
  async collectStagedAssets(): Promise<ProjectAssetGcReport> {
    if (!this.gcSafe || !globalThis.navigator?.locks) {
      return { status: "unsupported", deletedCount: 0, deletedBytes: 0 };
    }
    return this.withAssetLock(async () => {
      const referenced = new Set<string>();
      for (const item of await this.list()) {
        if (item.readOnly) throw new FutureProjectVersionError();
        const read = await this.read(item.id);
        if (!read || read.status !== "ready") throw new ProjectIntegrityError(item.id);
        for (const asset of read.value.document.assets) referenced.add(asset.sha256.toLowerCase());
      }
      for (const hash of await this.drafts.referencedHashes()) referenced.add(hash);
      const deleted = await this.assets.collectUncommitted(referenced, Date.now() - STAGING_GRACE_MS);
      return { status: "completed", ...deleted };
    });
  }

  async read(projectId: string): Promise<ProjectReadResult | null> {
    const db = await this.open();
    const record = await new Promise<StoredRevision | undefined>((resolve, reject) => {
      const transaction = db.transaction(DOCUMENT_STORE, "readonly");
      const request = transaction.objectStore(DOCUMENT_STORE).get(projectId);
      let result: StoredRevision | undefined;
      request.onsuccess = () => { result = request.result as StoredRevision | undefined; };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(databaseError(transaction.error, "leer"));
    });
    if (!record) return null;
    if (record.schemaVersion > PROJECT_SCHEMA_VERSION) {
      return { status: "future-version", projectId, schemaVersion: record.schemaVersion, revision: record.revision };
    }
    const storedDocument = record.document as ProjectDocumentV1;
    if (record.id !== projectId || record.schemaVersion !== PROJECT_SCHEMA_VERSION ||
        storedDocument?.id !== projectId || !Number.isSafeInteger(record.revision) || record.revision < 1 ||
        typeof record.hash !== "string") {
      throw new ProjectIntegrityError(projectId);
    }
    const hash = await this.serialization.hash(storedDocument);
    if (hash !== record.hash) throw new ProjectIntegrityError(projectId);
    return {
      status: "ready", readOnly: db.version > PROJECT_SCHEMA_VERSION,
      value: {
        projectId, revision: record.revision, hash: record.hash,
        committedAt: record.committedAt, document: storedDocument,
      },
    };
  }

  /** New document identity; immutable asset bytes are shared by hash after re-verification. */
  async duplicate(projectId: string, options: { readonly id: string; readonly name: string; readonly at: number }): Promise<ProjectRevision> {
    const read = await this.read(projectId);
    if (!read) throw new Error("Proyecto no encontrado para duplicar");
    if (read.status === "future-version" || read.readOnly) throw new FutureProjectVersionError();
    await this.assertAssetsAvailable(read.value.document.assets);
    return this.commitRevision(duplicateProjectDocument(read.value.document, options), 0);
  }

  async list(): Promise<ProjectListItem[]> {
    const db = await this.open();
    const rows = await new Promise<StoredIndex[]>((resolve, reject) => {
      const transaction = db.transaction(INDEX_STORE, "readonly");
      const request = transaction.objectStore(INDEX_STORE).getAll();
      let result: StoredIndex[] = [];
      request.onsuccess = () => { result = request.result as StoredIndex[]; };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(databaseError(transaction.error, "listar"));
    });
    return rows.map((row) => ({
      id: row.id, name: row.name, schemaVersion: row.schemaVersion,
      revision: row.revision, updatedAt: row.updatedAt, archived: row.archived ?? false,
      readOnly: db.version > PROJECT_SCHEMA_VERSION || row.schemaVersion > PROJECT_SCHEMA_VERSION,
    })).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }
}
