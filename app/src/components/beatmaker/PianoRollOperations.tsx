import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProjectNote, ProjectPattern } from "../../project/model.ts";
import { duplicatePianoRollNotes, humanizePianoRollNotes, joinPianoRollNotes,
  pastePianoRollNotes, quantizePianoRollNotes, resizePianoRollNotes, setPianoRollMuted,
  splitPianoRollNotes, restorePianoRollSourceTiming } from "../../composition/pianoRollModel.ts";

export interface PianoRollOperationsProps {
  readonly pattern: ProjectPattern;
  readonly selectedIds: ReadonlySet<string>;
  readonly snapTicks: number;
  readonly playheadTick?: number;
  readonly readPlayheadTick?: () => number;
  readonly busy: boolean;
  readonly onCommit: (next: ProjectPattern) => Promise<boolean>;
  readonly onSelect: (ids: Iterable<string>) => void;
  readonly onPreview: (notes: readonly ProjectNote[] | null) => void;
}

interface TransformPreview {
  readonly kind: "cuantización" | "humanización";
  readonly sourceVersion: number;
  readonly pattern: ProjectPattern;
}

export function PianoRollOperations({ pattern, selectedIds, snapTicks, playheadTick, readPlayheadTick, busy,
  onCommit, onSelect, onPreview }: PianoRollOperationsProps) {
  const [clipboard, setClipboard] = useState<readonly ProjectNote[]>([]);
  const [selectionQuery, setSelectionQuery] = useState("");
  const [pasteTick, setPasteTick] = useState("");
  const [splitTick, setSplitTick] = useState("");
  const [strength, setStrength] = useState("100");
  const [swing, setSwing] = useState("0");
  const [groove, setGroove] = useState("0,0,0,0");
  const [humanizeSeed, setHumanizeSeed] = useState("beat-1");
  const [timing, setTiming] = useState("10");
  const [velocity, setVelocity] = useState("5");
  const [preview, setPreview] = useState<TransformPreview | null>(null);
  const previewRef = useRef<TransformPreview | null>(null);
  const onPreviewRef = useRef(onPreview);
  useEffect(() => { onPreviewRef.current = onPreview; }, [onPreview]);
  const [error, setError] = useState("");
  const chosen = pattern.notes.filter((note) => selectedIds.has(note.id));
  const allMuted = chosen.length > 0 && chosen.every((note) => !!note.muted);
  const canEdit = selectedIds.size > 0 && !busy;
  const canJoin = selectedIds.size > 1 && !busy;
  const canRestoreSource = canEdit && chosen.every((note) => note.origin.sourceTakeId
    ? note.origin.importedProjectStartTick !== undefined &&
      note.origin.importedProjectDurationTick !== undefined
    : note.origin.sourcePpq !== undefined && note.origin.sourceStartTick !== undefined);

  function clearPreview(): void {
    previewRef.current = null;
    setPreview(null);
    onPreview(null);
  }

  useEffect(() => {
    if (!previewRef.current) return;
    previewRef.current = null;
    setPreview(null);
    onPreviewRef.current(null);
  }, [pattern.id, pattern.version, selectedIds, snapTicks]);

  function updateOption(setter: (value: string) => void, value: string): void {
    setter(value);
    clearPreview();
  }

  function run(makeNext: () => ProjectPattern, after?: (accepted: boolean) => void): void {
    setError("");
    clearPreview();
    try { void onCommit(makeNext()).then((accepted) => after?.(accepted)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Operación inválida"); }
  }

  function copy(): void {
    setError("");
    setClipboard(chosen.map((note) => structuredClone(note)));
  }

  function selectExact(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const ids = [...new Set(selectionQuery.split(/[\s,;]+/).map((id) => id.trim()).filter(Boolean))];
    const available = new Set(pattern.notes.map((note) => note.id));
    if (!ids.length || ids.some((id) => !available.has(id))) {
      setError("Escribe IDs existentes separados por coma, espacio o punto y coma");
      return;
    }
    setError("");
    onSelect(ids);
  }

  function duplicate(): void {
    const ids: string[] = [];
    run(() => duplicatePianoRollNotes(pattern, selectedIds, snapTicks, () => {
      const id = crypto.randomUUID(); ids.push(id); return id;
    }), (accepted) => { if (accepted) onSelect(ids); });
  }

  function paste(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const atTick = pasteTick.trim() ? Number(pasteTick) : readPlayheadTick?.() ?? playheadTick;
    if (atTick === undefined) { setError("Escribe el tick de pegado o sitúa el cabezal"); return; }
    const ids: string[] = [];
    run(() => pastePianoRollNotes(pattern, clipboard, atTick, () => {
      const id = crypto.randomUUID(); ids.push(id); return id;
    }), (accepted) => { if (accepted) onSelect(ids); });
  }

  function split(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const atTick = splitTick.trim() ? Number(splitTick) : readPlayheadTick?.() ?? playheadTick;
    if (atTick === undefined) { setError("Escribe el tick de corte o sitúa el cabezal"); return; }
    run(() => splitPianoRollNotes(pattern, selectedIds, atTick));
  }

  function join(): void {
    const first = [...chosen].sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))[0];
    run(() => joinPianoRollNotes(pattern, selectedIds), (accepted) => {
      if (accepted && first) onSelect([first.id]);
    });
  }

  function prepare(kind: TransformPreview["kind"]): void {
    setError("");
    clearPreview();
    try {
      const next = kind === "cuantización"
        ? quantizePianoRollNotes(pattern, selectedIds, { gridTicks: snapTicks,
          strength: Number(strength) / 100, swing: Number(swing) / 100,
          grooveOffsets: groove.split(",").map((offset) => Number(offset.trim())) })
        : humanizePianoRollNotes(pattern, selectedIds, { seed: humanizeSeed,
          timingTicks: Number(timing), velocity: Number(velocity) });
      if (next === pattern) { setError("La selección ya coincide con esos valores"); return; }
      const proposal = { kind, sourceVersion: pattern.version, pattern: next };
      previewRef.current = proposal;
      setPreview(proposal);
      onPreview(next.notes.filter((note) => selectedIds.has(note.id)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Transformación inválida"); }
  }

  function applyPreview(): void {
    if (!preview) return;
    if (preview.sourceVersion !== pattern.version) {
      setError("La fuente cambió; genera otra vista previa antes de aplicar");
      clearPreview();
      return;
    }
    setError("");
    void onCommit(preview.pattern).then((accepted) => { if (accepted) clearPreview(); });
  }

  return <details className="piano-roll__operations">
    <summary>Operaciones de selección · {selectedIds.size} notas</summary>
    <div className="piano-roll__operation-grid">
      <div className="piano-roll__operation-card">
        <strong>Copiar y editar</strong>
        <form className="piano-roll__operation-form" onSubmit={selectExact}>
          <label>Selección exacta por ID<input aria-label="IDs de notas para seleccionar" value={selectionQuery}
            onChange={(event) => setSelectionQuery(event.target.value)} placeholder="id-1, id-2, id-3" /></label>
          <button type="submit" disabled={!selectionQuery.trim()}>Seleccionar IDs</button>
        </form>
        <div className="piano-roll__operation-actions">
          <button type="button" disabled={!canEdit} onClick={copy}>Copiar</button>
          <button type="button" disabled={!canEdit} onClick={duplicate}>Duplicar +{snapTicks} ticks</button>
          <button type="button" disabled={!canEdit}
            onClick={() => run(() => setPianoRollMuted(pattern, selectedIds, !allMuted))}>
            {allMuted ? "Activar notas" : "Silenciar notas"}</button>
          <button type="button" disabled={!canJoin} onClick={join}>Unir contiguas</button>
          <button type="button" disabled={!canEdit}
            onClick={() => run(() => resizePianoRollNotes(pattern, selectedIds, -snapTicks))}>Acortar −{snapTicks}</button>
          <button type="button" disabled={!canEdit}
            onClick={() => run(() => resizePianoRollNotes(pattern, selectedIds, snapTicks))}>Alargar +{snapTicks}</button>
          {canRestoreSource && <button type="button"
            onClick={() => run(() => restorePianoRollSourceTiming(pattern, selectedIds))}>Restaurar tiempo de toma</button>}
        </div>
        <form className="piano-roll__operation-form" onSubmit={split}>
          <label>Cortar en tick<input aria-label="Tick de corte de notas" type="number" inputMode="numeric" min={0}
            value={splitTick} placeholder={playheadTick === undefined ? "Tick exacto" : `Cabezal ${playheadTick}`}
            onChange={(event) => setSplitTick(event.target.value)} /></label>
          <button type="submit" disabled={!canEdit}>Dividir selección</button>
        </form>
        <form className="piano-roll__operation-form" onSubmit={paste}>
          <label>Pegar desde tick<input aria-label="Tick de pegado" type="number" inputMode="numeric" min={0}
            value={pasteTick} placeholder={playheadTick === undefined ? "Tick exacto" : `Cabezal ${playheadTick}`}
            onChange={(event) => setPasteTick(event.target.value)} /></label>
          <button type="submit" disabled={busy || !clipboard.length}>Pegar {clipboard.length || ""} notas</button>
        </form>
      </div>
      <div className="piano-roll__operation-card">
        <strong>Cuantización y humanización</strong>
        <p>La vista previa sólo dibuja la propuesta. Aplicar crea un único paso reversible.</p>
        <div className="piano-roll__operation-fields">
          <label>Fuerza · %<input aria-label="Fuerza de cuantización" type="number" min={0} max={100} step={1}
            value={strength} onChange={(event) => updateOption(setStrength, event.target.value)} /></label>
          <label>Swing · %<input aria-label="Swing de cuantización" type="number" min={-100} max={100} step={1}
            value={swing} onChange={(event) => updateOption(setSwing, event.target.value)} /></label>
          <label>Groove · offsets en ticks<input aria-label="Offsets de groove" inputMode="text"
            value={groove} onChange={(event) => updateOption(setGroove, event.target.value)}
            title="Ejemplo: 0,20,-5,15; un offset por paso, hasta 64 pasos" /></label>
          <label>Semilla<input aria-label="Semilla de humanización" maxLength={128} value={humanizeSeed}
            onChange={(event) => updateOption(setHumanizeSeed, event.target.value)} /></label>
          <label>Tiempo · ticks<input aria-label="Desviación de tiempo" type="number" min={0} max={960} step={1}
            value={timing} onChange={(event) => updateOption(setTiming, event.target.value)} /></label>
          <label>Velocidad · ±<input aria-label="Desviación de velocidad" type="number" min={0} max={127} step={1}
            value={velocity} onChange={(event) => updateOption(setVelocity, event.target.value)} /></label>
        </div>
        <div className="piano-roll__operation-actions">
          <button type="button" disabled={!canEdit} onClick={() => prepare("cuantización")}>Prever cuantización</button>
          <button type="button" disabled={!canEdit} onClick={() => prepare("humanización")}>Prever humanización</button>
          {preview && <button type="button" className="piano-roll__primary" disabled={busy}
            onClick={applyPreview}>Aplicar {preview.kind}</button>}
          {preview && <button type="button" disabled={busy} onClick={clearPreview}>Descartar vista previa</button>}
        </div>
      </div>
    </div>
    {error && <p className="piano-roll__error" role="alert">{error}</p>}
  </details>;
}
