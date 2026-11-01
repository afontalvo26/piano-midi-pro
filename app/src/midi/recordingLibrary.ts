import type { MidiRecorderSnapshot } from "./recorder.ts";

export interface RecordedNoteSummary {
  readonly note: number;
  readonly count: number;
}

export interface RecordedTrackSummary {
  readonly inputId: string;
  readonly inputName: string;
  /** Zero based channel written to the exported MIDI file. */
  readonly channel: number;
  /** Zero based channels received from the device before app routing. */
  readonly sourceChannels: readonly number[];
  readonly eventCount: number;
  readonly noteCount: number;
  readonly notes: readonly RecordedNoteSummary[];
}

export interface RecordedTakeSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly durationMs: number;
  readonly tempoBpm: number;
  readonly eventCount: number;
  readonly byteLength: number;
  readonly tracks: readonly RecordedTrackSummary[];
}

export interface SaveRecordingOptions {
  readonly id?: string;
  readonly name?: string;
  readonly createdAt?: number;
  /** Time between recorder.start and recorder.stop; defaults to the last event. */
  readonly durationMs?: number;
  readonly inputNames?: Readonly<Record<string, string>>;
}

const DATABASE_NAME = "piano-midi-pro-recordings";
const DATABASE_VERSION = 1;
const METADATA_STORE = "recordings";
const MIDI_STORE = "midiBytes";

function normalizeName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 100) {
    throw new RangeError("El nombre de la toma debe tener entre 1 y 100 caracteres");
  }
  return name;
}

function messageFor(error: unknown, action: string): Error {
  const name = error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError") {
    return new Error("No hay espacio disponible para guardar la toma MIDI");
  }
  const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
  return new Error(`No se pudo ${action} la biblioteca de tomas${detail}`);
}

/** Calculate metadata without parsing or altering the already exported SMF. */
export function summarizeRecording(
  snapshot: MidiRecorderSnapshot,
  bytes: Uint8Array,
  options: SaveRecordingOptions = {},
): RecordedTakeSummary {
  if (snapshot.recording) throw new Error("La grabación MIDI debe estar detenida antes de guardarla");
  if (snapshot.overflowed) throw new Error("La grabación MIDI superó la capacidad y no se puede guardar incompleta");
  if (snapshot.events.length === 0) throw new Error("La grabación MIDI no contiene eventos");
  if (bytes.length < 14 || bytes[0] !== 0x4d || bytes[1] !== 0x54 || bytes[2] !== 0x68 || bytes[3] !== 0x64) {
    throw new Error("Los datos de la toma no son un archivo MIDI válido");
  }
  const createdAt = options.createdAt ?? Date.now();
  let lastEventMs = 0;
  for (const item of snapshot.events) lastEventMs = Math.max(lastEventMs, item.relativeMs);
  const durationMs = options.durationMs ?? lastEventMs;
  const tempoBpm = snapshot.tempoChanges[0]?.bpm;
  if (!Number.isFinite(createdAt) || createdAt < 0 || createdAt > 8.64e15 ||
      !Number.isFinite(durationMs) || durationMs < 0 ||
      !Number.isFinite(tempoBpm) || tempoBpm === undefined || tempoBpm <= 0) {
    throw new RangeError("Fecha, duración o tempo de la toma no válido");
  }
  const id = options.id ?? globalThis.crypto.randomUUID();
  if (!id || id.length > 128) throw new RangeError("Identificador de toma no válido");
  const name = normalizeName(options.name ?? `Toma ${new Date(createdAt).toLocaleString("es-CO")}`);

  interface BuildingTrack {
    inputId: string;
    inputName: string;
    channel: number;
    sourceChannels: Set<number>;
    eventCount: number;
    noteCount: number;
    notes: Map<number, number>;
  }
  const grouped = new Map<string, BuildingTrack>();
  for (const item of snapshot.events) {
    const inputId = item.event.inputId;
    const channel = item.playedChannel;
    const key = `${inputId}\0${channel}`;
    let track = grouped.get(key);
    if (!track) {
      track = {
        inputId,
        inputName: options.inputNames?.[inputId]?.trim() || inputId,
        channel,
        sourceChannels: new Set<number>(),
        eventCount: 0,
        noteCount: 0,
        notes: new Map<number, number>(),
      };
      grouped.set(key, track);
    }
    track.eventCount++;
    track.sourceChannels.add(item.event.channel);
    if (item.event.kind === "noteOn") {
      const note = item.playedNote ?? item.event.note;
      track.noteCount++;
      track.notes.set(note, (track.notes.get(note) ?? 0) + 1);
    }
  }
  const tracks = Array.from(grouped.values(), (track): RecordedTrackSummary => ({
    inputId: track.inputId,
    inputName: track.inputName,
    channel: track.channel,
    sourceChannels: Array.from(track.sourceChannels).sort((a, b) => a - b),
    eventCount: track.eventCount,
    noteCount: track.noteCount,
    notes: Array.from(track.notes, ([note, count]) => ({ note, count })).sort((a, b) => a.note - b.note),
  }));
  return {
    id,
    name,
    createdAt,
    updatedAt: createdAt,
    durationMs,
    tempoBpm,
    eventCount: snapshot.events.length,
    byteLength: bytes.byteLength,
    tracks,
  };
}

/** IndexedDB keeps compact list metadata separate from potentially large MIDI files. */
export class RecordingLibrary {
  private readonly databaseName: string;
  private readonly factory: IDBFactory | undefined;
  private opening: Promise<IDBDatabase> | null = null;

  constructor(options: { databaseName?: string; indexedDB?: IDBFactory } = {}) {
    this.databaseName = options.databaseName ?? DATABASE_NAME;
    this.factory = options.indexedDB ?? globalThis.indexedDB;
  }

  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    if (!this.factory) return Promise.reject(new Error("IndexedDB no está disponible en este navegador"));
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(METADATA_STORE)) db.createObjectStore(METADATA_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(MIDI_STORE)) db.createObjectStore(MIDI_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.opening = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(messageFor(request.error, "abrir"));
      request.onblocked = () => reject(new Error("Otra pestaña impide abrir la biblioteca de tomas MIDI"));
    }).catch((error: unknown) => {
      this.opening = null;
      throw error;
    });
    return this.opening;
  }

  async close(): Promise<void> {
    if (!this.opening) return;
    const db = await this.opening;
    db.close();
    this.opening = null;
  }

  async save(snapshot: MidiRecorderSnapshot, bytes: Uint8Array, options: SaveRecordingOptions = {}): Promise<RecordedTakeSummary> {
    const summary = summarizeRecording(snapshot, bytes, options);
    // Copy before opening IndexedDB: the recorder may be reset for the next take.
    const ownedBytes = Uint8Array.from(bytes);
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([METADATA_STORE, MIDI_STORE], "readwrite");
      transaction.objectStore(METADATA_STORE).add(summary);
      transaction.objectStore(MIDI_STORE).add({ id: summary.id, bytes: ownedBytes });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(messageFor(transaction.error, "guardar"));
    });
    return summary;
  }

  async list(): Promise<RecordedTakeSummary[]> {
    const db = await this.open();
    return new Promise<RecordedTakeSummary[]>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, "readonly");
      const request = transaction.objectStore(METADATA_STORE).getAll();
      let items: RecordedTakeSummary[] = [];
      request.onsuccess = () => { items = request.result as RecordedTakeSummary[]; };
      transaction.oncomplete = () => resolve(items.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)));
      transaction.onabort = () => reject(messageFor(transaction.error, "leer"));
    });
  }

  async getBytes(id: string): Promise<Uint8Array | null> {
    const db = await this.open();
    return new Promise<Uint8Array | null>((resolve, reject) => {
      const transaction = db.transaction(MIDI_STORE, "readonly");
      const request = transaction.objectStore(MIDI_STORE).get(id);
      let bytes: Uint8Array | null = null;
      request.onsuccess = () => {
        const row = request.result as { bytes: Uint8Array } | undefined;
        bytes = row ? Uint8Array.from(row.bytes) : null;
      };
      transaction.oncomplete = () => resolve(bytes);
      transaction.onabort = () => reject(messageFor(transaction.error, "leer"));
    });
  }

  async rename(id: string, name: string): Promise<RecordedTakeSummary> {
    const normalizedName = normalizeName(name);
    const db = await this.open();
    return new Promise<RecordedTakeSummary>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, "readwrite");
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get(id);
      let updated: RecordedTakeSummary | undefined;
      let missing = false;
      request.onsuccess = () => {
        const existing = request.result as RecordedTakeSummary | undefined;
        if (!existing) {
          missing = true;
          transaction.abort();
          return;
        }
        updated = { ...existing, name: normalizedName, updatedAt: Math.max(existing.updatedAt, Date.now()) };
        store.put(updated);
      };
      transaction.oncomplete = () => resolve(updated!);
      transaction.onabort = () => reject(missing
        ? new Error("No se encontró la toma MIDI para renombrar")
        : messageFor(transaction.error, "renombrar"));
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([METADATA_STORE, MIDI_STORE], "readwrite");
      transaction.objectStore(METADATA_STORE).delete(id);
      transaction.objectStore(MIDI_STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(messageFor(transaction.error, "borrar"));
    });
  }
}
