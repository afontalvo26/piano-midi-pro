import * as Tone from "tone";
import type { ProjectAssetRef, ProjectDocumentV1 } from "../project/model";
import { createArrangementResolver } from "../composition/resolveProjectTimeline";
import { MusicalClock } from "../sequencer/musicalClock";
import { createBaseAutomationResolver } from "../sequencer/automationResolver.ts";
import { TransportScheduler, type TransportSnapshot } from "../sequencer/transportScheduler";
import { DecodedPianoSampleBank } from "./toneSampleVoiceFactory";
import { ProjectAudioSink, type ProjectAudioDiagnostics,
  PROJECT_PIANO_INSTRUMENT } from "./projectAudioSink";
import { loadVerifiedSalamanderCore } from "./verifiedSalamanderCore";
import { flushOfflineGraph } from "./offlineGraphRetention";
import type { RenderProjectOptions, RenderProgress } from "./renderProjectPcm";

interface RealmRequest {
  readonly kind: "render-project-pcm";
  readonly document: ProjectDocumentV1;
  readonly options: RenderProjectOptions;
  readonly selectedTrackIds: readonly string[];
  readonly assets: readonly { ref: ProjectAssetRef; blob: Blob }[];
}

function checkReport(transport: TransportSnapshot, audio: ProjectAudioDiagnostics): void {
  const trackError = audio.tracks.find((track) => track.error)?.error;
  if (audio.masterError || trackError) throw new Error(audio.masterError ?? trackError ?? "Banco no disponible");
  if (transport.skippedNotes || transport.skippedAudioClips || audio.missingAttacks ||
      audio.unsupportedControls) {
    throw new Error(`Exportación incompleta: ${transport.skippedNotes} notas, ` +
      `${transport.skippedAudioClips} clips y ${audio.missingAttacks} ataques omitidos; ` +
      `${audio.unsupportedControls} controles sin soporte`);
  }
}

async function render(request: RealmRequest, port: MessagePort): Promise<void> {
  const { document, options } = request;
  const clock = new MusicalClock(document.tempoMap, document.meterMap);
  const timelineSeconds = clock.secondsBetween(options.startTick, options.endTick);
  const duration = timelineSeconds + options.tailSeconds;
  const blobs = new Map(request.assets.map(({ ref, blob }) => [ref.id, blob]));
  let sink: ProjectAudioSink | null = null;
  let output: Tone.Limiter | Tone.Gain | null = null;
  let transport: TransportScheduler | null = null;
  let report: { transport: TransportSnapshot; audio: ProjectAudioDiagnostics } | null = null;
  let cancelled = false;
  port.addEventListener("message", (event: MessageEvent<{ kind?: string }>) => {
    if (event.data?.kind === "cancel") cancelled = true;
  });
  port.start();
  const progress = (phase: RenderProgress["phase"], completed: number, total: number): void => {
    port.postMessage({ kind: "progress", progress: { phase, completed, total } });
  };
  progress("preparing", 0, 1);
  let offlineRaw: BaseAudioContext | null = null;
  const rendered = await Tone.Offline(async () => {
    offlineRaw = Tone.getContext().rawContext;
    if (cancelled) throw new DOMException("Exportación cancelada", "AbortError");
    const needPiano = document.tracks.some((track) => track.kind === "instrument" &&
      track.instrument?.instrumentId === PROJECT_PIANO_INSTRUMENT.instrumentId);
    const bank = needPiano
      ? await loadVerifiedSalamanderCore(Tone.getContext().rawContext)
      : new DecodedPianoSampleBank();
    if (cancelled) throw new DOMException("Exportación cancelada", "AbortError");
    output = options.tapBusTrackId || options.tapDirectMaster
      ? new Tone.Gain(1).toDestination() : new Tone.Limiter(-2).toDestination();
    sink = new ProjectAudioSink(document, output, bank, () => !cancelled,
      { readAsset: async (ref) => blobs.get(ref.id) ?? null },
      options.tapBusTrackId || options.tapDirectMaster
        ? { busTrackId: options.tapBusTrackId, directMaster: options.tapDirectMaster }
        : undefined);
    const prepared = await sink.prepare({ metronome: false });
    if (prepared.masterError || prepared.tracks.some((track) => track.error)) {
      checkReport({ state: "stopped", tick: options.startTick, iteration: 0, epoch: 0,
        scheduledEvents: 0, skippedNotes: 0, skippedAudioClips: 0, lateEvents: 0 }, prepared);
    }
    if (cancelled) throw new DOMException("Exportación cancelada", "AbortError");
    progress("rendering", 0, 1);
    const audio = { currentTime: 0, state: "running" as const };
    const resolver = createArrangementResolver(document,
      options.seed === undefined ? {} : { probabilitySeed: options.seed });
    const automation = createBaseAutomationResolver(document, clock);
    transport = new TransportScheduler({ rootOwnerId: sink.rootOwnerId,
      clock, audio, sink, autoPump: false, startLeadSeconds: 0, horizonSeconds: 0.5,
      resolve: (start, end, iteration) => start >= options.endTick ? []
        : resolver(start, Math.min(end, options.endTick), iteration),
      resolveAutomation: (start, end, iteration) => start >= options.endTick ? []
        : automation(start, Math.min(end, options.endTick), iteration) });
    if (!transport.start(options.startTick)) throw new Error("Render sin dueño de audio aislado");
    for (let seconds = 0.2; seconds <= timelineSeconds + 0.2; seconds += 0.2) {
      if (cancelled) throw new DOMException("Exportación cancelada", "AbortError");
      audio.currentTime = seconds;
      transport.pump();
    }
    report = { transport: transport.snapshot(), audio: sink.diagnostics() };
    checkReport(report.transport, report.audio);
  }, duration, 2, options.sampleRate).finally(() => {
    if (offlineRaw) flushOfflineGraph(offlineRaw);
  });
  const completedReport = report as { transport: TransportSnapshot;
    audio: ProjectAudioDiagnostics } | null;
  if (cancelled || !completedReport) throw new DOMException("Exportación cancelada", "AbortError");
  const buffer = rendered.get();
  if (!buffer || buffer.numberOfChannels !== 2 || buffer.length < 1) {
    throw new Error("Render PCM estéreo vacío");
  }
  const left = buffer.getChannelData(0).slice();
  const right = buffer.getChannelData(1).slice();
  progress("done", 1, 1);
  port.postMessage({ kind: "done", left, right, sampleRate: options.sampleRate,
    report: { ...completedReport, selectedTrackIds: request.selectedTrackIds } },
  [left.buffer, right.buffer]);
  (transport as TransportScheduler | null)?.dispose();
  (sink as ProjectAudioSink | null)?.dispose();
  (output as Tone.Limiter | Tone.Gain | null)?.dispose();
}

// about:blank inherits same-origin access but serializes its own origin as
// "null"; use the parent document's concrete origin for postMessage.
const parentOrigin = window.parent.location.origin;
window.parent.postMessage({ kind: "pmp-offline-realm-ready" }, parentOrigin);
window.addEventListener("message", (event: MessageEvent<RealmRequest>) => {
  if (event.origin !== parentOrigin || event.source !== window.parent ||
      event.data?.kind !== "render-project-pcm" || !event.ports[0]) return;
  const port = event.ports[0];
  void render(event.data, port).catch((error: unknown) => {
    port.postMessage({ kind: "error", error: error instanceof Error ? error.message : String(error) });
    port.close();
  });
});
