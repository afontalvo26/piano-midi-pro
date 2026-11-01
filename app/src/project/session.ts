import { applySessionCommand, duplicateProjectDocument, type ProjectCommand } from "./commands.ts";
import type { ProjectAssetRef, ProjectDocumentV1 } from "./model.ts";
import { FutureProjectVersionError, ProjectConflictError, type ProjectReadResult,
  type ProjectRevision } from "./repository.ts";

export type ProjectSaveStatus = "clean" | "pending" | "saving" | "error" | "conflict";
export type ProjectDraftStatus = "idle" | "pending" | "writing" | "ready" | "error";

export interface ProjectSessionSnapshot {
  readonly document: ProjectDocumentV1;
  readonly revision: number;
  readonly hash: string;
  readonly status: ProjectSaveStatus;
  readonly error: string | null;
  readonly draftStatus: ProjectDraftStatus;
  readonly draftError: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface ProjectSessionOptions {
  readonly autosaveDelayMs?: number;
  readonly historyLimit?: number;
  readonly draftDelayMs?: number;
}

export interface ProjectSessionRepository {
  commitRevision(document: ProjectDocumentV1, expectedRevision: number): Promise<ProjectRevision>;
  read(projectId: string): Promise<ProjectReadResult | null>;
  assertAssetsAvailable?(refs: readonly ProjectAssetRef[]): Promise<void>;
  writeDraft?(document: ProjectDocumentV1, baseRevision: number, sessionId: string,
    generation: number): Promise<unknown>;
  discardDraft?(projectId: string, sessionId: string): Promise<void>;
}

interface GestureEntry {
  readonly id: string | null;
  readonly undo: ProjectCommand[];
  readonly redo: ProjectCommand[];
}

function option(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < min || selected > max) throw new RangeError(`${label} inválido`);
  return selected;
}

function freezeDocument<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDocument(child);
    Object.freeze(value);
  }
  return value;
}

/** One mutable session per editing tab; audio and React never own the project document. */
export class ProjectSession {
  private readonly repository: ProjectSessionRepository;
  private document: ProjectDocumentV1;
  private confirmed: ProjectRevision;
  private status: ProjectSaveStatus = "clean";
  private error: string | null = null;
  private snapshot: ProjectSessionSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly undoStack: GestureEntry[] = [];
  private readonly redoStack: GestureEntry[] = [];
  private readonly autosaveDelayMs: number;
  private readonly historyLimit: number;
  private readonly draftDelayMs: number;
  private readonly draftSessionId = crypto.randomUUID();
  private draftGeneration = 0;
  private draftStatus: ProjectDraftStatus = "idle";
  private draftError: string | null = null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private draftQueue: Promise<void> = Promise.resolve();
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private closed = false;

  private constructor(repository: ProjectSessionRepository, confirmed: ProjectRevision,
    options: ProjectSessionOptions) {
    this.repository = repository;
    this.confirmed = confirmed;
    this.document = freezeDocument(confirmed.document);
    this.autosaveDelayMs = option(options.autosaveDelayMs, 300, 0, 60_000, "Demora de autoguardado");
    this.historyLimit = option(options.historyLimit, 64, 1, 500, "Límite de historial");
    this.draftDelayMs = option(options.draftDelayMs, 80, 0, 60_000, "Demora de journal");
    this.snapshot = this.makeSnapshot();
  }

  static async create(repository: ProjectSessionRepository, document: ProjectDocumentV1,
    options: ProjectSessionOptions = {}): Promise<ProjectSession> {
    const confirmed = await repository.commitRevision(document, 0);
    return new ProjectSession(repository, confirmed, options);
  }

  static async open(repository: ProjectSessionRepository, projectId: string,
    options: ProjectSessionOptions = {}): Promise<ProjectSession> {
    const read = await repository.read(projectId);
    if (!read) throw new Error("Proyecto no encontrado");
    if (read.status === "future-version" || read.readOnly) throw new FutureProjectVersionError();
    return new ProjectSession(repository, read.value, options);
  }

  getSnapshot(): ProjectSessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    if (this.closed) throw new Error("Sesión de proyecto cerrada");
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private makeSnapshot(): ProjectSessionSnapshot {
    return {
      document: this.document, revision: this.confirmed.revision, hash: this.confirmed.hash,
      status: this.status, error: this.error,
      draftStatus: this.draftStatus, draftError: this.draftError,
      canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0,
    };
  }

  private emit(): void {
    this.snapshot = this.makeSnapshot();
    for (const listener of this.listeners) listener();
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Sesión de proyecto cerrada");
  }

  private clearAutosave(): void {
    if (this.autosaveTimer !== null) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
  }

  private clearDraftTimer(): void {
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    this.draftTimer = null;
  }

  private writeDraftNow(): Promise<void> {
    const write = this.repository.writeDraft;
    if (!write) return Promise.resolve();
    const document = this.document;
    const baseRevision = this.confirmed.revision;
    const generation = ++this.draftGeneration;
    this.draftStatus = "writing";
    this.draftError = null;
    this.emit();
    const task = this.draftQueue.then(() => write.call(this.repository, document,
      baseRevision, this.draftSessionId, generation));
    this.draftQueue = task.then(() => undefined, () => undefined);
    return task.then(() => {
      if (this.document === document) {
        this.draftStatus = "ready";
        this.emit();
      }
    }, (error: unknown) => {
      if (this.document === document) {
        this.draftStatus = "error";
        this.draftError = error instanceof Error ? error.message : "No se pudo escribir journal";
        this.emit();
      }
      throw error;
    });
  }

  private scheduleDraft(): void {
    if (!this.repository.writeDraft || this.closed) return;
    this.clearDraftTimer();
    this.draftStatus = "pending";
    this.draftError = null;
    this.draftTimer = setTimeout(() => {
      this.draftTimer = null;
      void this.writeDraftNow().catch(() => { /* snapshot exposes journal failure */ });
    }, this.draftDelayMs);
  }

  /** Forces a verified draft before a risky navigation; it does not mark the project as saved. */
  flushDraft(): Promise<void> {
    this.assertOpen();
    if (this.status === "clean") return Promise.resolve();
    this.clearDraftTimer();
    return this.writeDraftNow();
  }

  private async discardOwnDraft(expectedDocument: ProjectDocumentV1 = this.document): Promise<void> {
    if (this.document !== expectedDocument) return;
    this.clearDraftTimer();
    await this.draftQueue;
    if (this.document !== expectedDocument) return;
    if (!this.repository.discardDraft) return;
    try {
      await this.repository.discardDraft(this.document.id, this.draftSessionId);
      this.draftStatus = "idle";
      this.draftError = null;
      this.emit();
    } catch (error) {
      this.draftStatus = "error";
      this.draftError = error instanceof Error ? error.message : "No se pudo limpiar journal";
      this.emit();
    }
  }

  private scheduleAutosave(): void {
    if (this.status === "conflict" || this.status === "error" || this.closed) return;
    this.clearAutosave();
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.save().catch(() => { /* error/conflict is exposed in the snapshot */ });
    }, this.autosaveDelayMs);
  }

  private changed(document: ProjectDocumentV1): void {
    this.document = freezeDocument(document);
    this.scheduleDraft();
    if (this.status !== "conflict") {
      this.status = "pending";
      this.error = null;
      this.scheduleAutosave();
    }
    this.emit();
  }

  /** Pass one stable gestureId for all commands in a drag; confirm a drag with one replacePattern when possible. */
  dispatch(command: ProjectCommand, gestureId?: string): ProjectSessionSnapshot {
    this.assertOpen();
    if (command.kind === "installBusResample") {
      const source = command.take.audioResample;
      if (!source || this.status !== "clean" ||
          source.sourceRevision !== this.confirmed.revision ||
          source.sourceHash !== this.confirmed.hash) {
        throw new RangeError("Resampling exige la misma revisión confirmada que se renderizó");
      }
    }
    const applied = applySessionCommand(this.document, command);
    const group = gestureId?.trim() || null;
    const last = this.undoStack.at(-1);
    if (group !== null && last?.id === group) {
      last.undo.unshift(applied.inverse);
      last.redo.push(command.kind === "replacePattern" ? { ...command,
        pattern: applied.document.patterns.find((pattern) => pattern.id === command.pattern.id)! } : structuredClone(command));
    } else {
      this.undoStack.push({ id: group, undo: [applied.inverse], redo: [command.kind === "replacePattern" ?
        { ...command, pattern: applied.document.patterns.find((pattern) => pattern.id === command.pattern.id)! } : structuredClone(command)] });
      if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.changed(applied.document);
    return this.snapshot;
  }

  undo(): ProjectSessionSnapshot {
    this.assertOpen();
    const entry = this.undoStack.at(-1);
    if (!entry) return this.snapshot;
    let document = this.document;
    for (const command of entry.undo) document = applySessionCommand(document, command).document;
    this.undoStack.pop();
    this.redoStack.push(entry);
    this.changed(document);
    return this.snapshot;
  }

  redo(): ProjectSessionSnapshot {
    this.assertOpen();
    const entry = this.redoStack.at(-1);
    if (!entry) return this.snapshot;
    let document = this.document;
    for (const command of entry.redo) document = applySessionCommand(document, command).document;
    this.redoStack.pop();
    this.undoStack.push(entry);
    this.changed(document);
    return this.snapshot;
  }

  private async commitPending(): Promise<ProjectRevision> {
    if (this.status === "clean") return this.confirmed;
    if (this.status === "conflict") throw new Error(this.error ?? "Conflicto de revisión sin resolver");
    const document = this.document;
    const expectedRevision = this.confirmed.revision;
    this.status = "saving";
    this.error = null;
    this.emit();
    try {
      const committed = await this.repository.commitRevision(document, expectedRevision);
      this.confirmed = committed;
      this.status = this.document === document ? "clean" : "pending";
      this.emit();
      if (this.status === "pending") this.scheduleAutosave();
      else await this.discardOwnDraft(document);
      return committed;
    } catch (error) {
      this.status = error instanceof ProjectConflictError ||
        (error instanceof Error && error.name === "ProjectConflictError") ? "conflict" : "error";
      this.error = error instanceof Error ? error.message : "No se pudo guardar el proyecto";
      this.clearAutosave();
      this.emit();
      throw error;
    }
  }

  /** Serializes writes; a failed save keeps local edits and can be retried. */
  save(): Promise<ProjectRevision> {
    this.assertOpen();
    this.clearAutosave();
    const task = this.saveQueue.then(() => this.commitPending());
    this.saveQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  retrySave(): Promise<ProjectRevision> {
    this.assertOpen();
    if (this.status === "conflict") return Promise.reject(new Error("Conflicto: conserva los cambios locales y abre una copia o resuelve la revisión"));
    return this.save();
  }

  /** Saves the current local edits under a new project ID, then retires this session. */
  async saveAsCopy(options: { readonly id: string; readonly name?: string; readonly at: number }): Promise<ProjectSession> {
    this.assertOpen();
    this.clearAutosave();
    await this.saveQueue;
    let committed: ProjectRevision;
    try {
      if (this.document.assets.length > 0) {
        if (!this.repository.assertAssetsAvailable) {
          throw new Error("No hay verificación de activos disponible para crear la copia");
        }
        await this.repository.assertAssetsAvailable(this.document.assets);
      }
      const copy = duplicateProjectDocument(this.document,
        { id: options.id, name: options.name ?? this.document.name, at: options.at });
      committed = await this.repository.commitRevision(copy, 0);
    } catch (error) {
      if (this.status === "pending") this.scheduleAutosave();
      throw error;
    }
    this.closed = true;
    this.clearAutosave();
    await this.discardOwnDraft();
    this.listeners.clear();
    return new ProjectSession(this.repository, committed,
      { autosaveDelayMs: this.autosaveDelayMs, historyLimit: this.historyLimit,
        draftDelayMs: this.draftDelayMs });
  }

  /** Flush before releasing the session; errors leave it available for recovery. */
  async close(): Promise<void> {
    this.assertOpen();
    await this.save();
    if (this.status !== "clean") throw new Error("El proyecto tiene cambios sin confirmar");
    this.closed = true;
    this.clearAutosave();
    this.clearDraftTimer();
    this.listeners.clear();
  }
}
