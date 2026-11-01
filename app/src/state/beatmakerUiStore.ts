export type PianoRollTool = "select" | "draw" | "pan";

export interface BeatmakerUiSnapshot {
  readonly selectedNoteIds: ReadonlySet<string>;
  readonly tool: PianoRollTool;
  readonly snapTicks: number;
  readonly pixelsPerQuarter: number;
}

/** Editor interaction state only. Musical data remains in the project snapshot. */
export class BeatmakerUiStore {
  private readonly listeners = new Set<() => void>();
  private snapshot: BeatmakerUiSnapshot = {
    selectedNoteIds: new Set<string>(),
    tool: "select",
    snapTicks: 240,
    pixelsPerQuarter: 96,
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): BeatmakerUiSnapshot => this.snapshot;

  private publish(next: BeatmakerUiSnapshot): void {
    if (next === this.snapshot) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  setTool(tool: PianoRollTool): void {
    if (tool !== "select" && tool !== "draw" && tool !== "pan") throw new RangeError("Herramienta desconocida");
    if (tool !== this.snapshot.tool) this.publish({ ...this.snapshot, tool });
  }

  setSnapTicks(snapTicks: number): void {
    if (!Number.isSafeInteger(snapTicks) || snapTicks < 1) throw new RangeError("Rejilla inválida");
    if (snapTicks !== this.snapshot.snapTicks) this.publish({ ...this.snapshot, snapTicks });
  }

  setPixelsPerQuarter(pixelsPerQuarter: number): void {
    if (!Number.isFinite(pixelsPerQuarter)) throw new RangeError("Zoom inválido");
    const zoom = Math.min(320, Math.max(32, Math.round(pixelsPerQuarter)));
    if (zoom !== this.snapshot.pixelsPerQuarter) this.publish({ ...this.snapshot, pixelsPerQuarter: zoom });
  }

  selectOnly(id: string | null): void {
    const current = this.snapshot.selectedNoteIds;
    if (id !== null && current.size === 1 && current.has(id)) return;
    if (id === null && current.size === 0) return;
    this.publish({ ...this.snapshot, selectedNoteIds: id === null ? new Set<string>() : new Set([id]) });
  }

  toggleSelection(id: string): void {
    const next = new Set(this.snapshot.selectedNoteIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.publish({ ...this.snapshot, selectedNoteIds: next });
  }

  setSelection(ids: Iterable<string>): void {
    this.publish({ ...this.snapshot, selectedNoteIds: new Set(ids) });
  }

  retainSelection(ids: ReadonlySet<string>): void {
    const next = new Set([...this.snapshot.selectedNoteIds].filter((id) => ids.has(id)));
    if (next.size !== this.snapshot.selectedNoteIds.size) this.publish({ ...this.snapshot, selectedNoteIds: next });
  }
}
