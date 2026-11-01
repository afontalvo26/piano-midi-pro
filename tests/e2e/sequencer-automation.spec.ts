import { expect, test } from "@playwright/test";
import { createProjectDocument } from "../../app/src/project/model.ts";
import { createBaseAutomationResolver } from "../../app/src/sequencer/automationResolver.ts";
import { MusicalClock } from "../../app/src/sequencer/musicalClock.ts";
import { TransportScheduler } from "../../app/src/sequencer/transportScheduler.ts";
import type { ProjectDocumentV1 } from "../../app/src/project/model.ts";
import type { ScheduledAutomation, SequencerSink, TimelineNote } from "../../app/src/sequencer/timelineEvents.ts";

function documentWithLane(): ProjectDocumentV1 {
  const base = createProjectDocument({ id: "aut-test", at: 1 });
  return { ...base, tempoMap: [
    { tick: 0, microsPerQuarter: 500_000 },
    { tick: 960, microsPerQuarter: 250_000 },
  ], trackOrder: ["piano"], tracks: [{ id: "piano", name: "Piano", kind: "instrument",
    mix: { gainDb: -3, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } }],
  automation: [{ id: "gain-lane", target: { scope: "track", ownerId: "piano",
    parameterId: "gainDb" }, points: [
    { id: "p0", tick: 0, value: -12, shape: "linear" },
    { id: "p1", tick: 1920, value: 0, shape: "step" },
  ] }] };
}

test("AUT step/linear usa ticks y divide rampa en cambio de tempo", () => {
  const document = documentWithLane();
  const clock = new MusicalClock(document.tempoMap, document.meterMap);
  const resolver = createBaseAutomationResolver(document, clock);
  expect(resolver(0, 1920, 0).map((event) => [event.tick, event.endTick,
    event.startValue, event.endValue, event.shape])).toEqual([
    [0, 960, -12, -6, "linear"],
    [960, 1920, -6, 0, "linear"],
  ]);
  expect(resolver.snapshot(480)[0]).toMatchObject({ value: -9, owner: "read" });
  const shifted = { ...document, automation: [{ ...document.automation[0]!, points: [
    { id: "p0", tick: 960, value: -12, shape: "step" as const },
    { id: "p1", tick: 1920, value: 0, shape: "step" as const },
  ] }] };
  const shiftedResolver = createBaseAutomationResolver(shifted, clock);
  expect(shiftedResolver.snapshot(0)[0]).toMatchObject({ value: -3, owner: "base" });
  const emptyResolver = createBaseAutomationResolver({ ...document,
    automation: [{ ...document.automation[0]!, points: [] }] }, clock);
  expect(emptyResolver.snapshot(1440)[0]).toMatchObject({ value: -3, owner: "base" });
  expect(emptyResolver(0, 1920, 0)).toEqual([]);
  expect(shiftedResolver(0, 960, 0)).toEqual([]);
  expect(shiftedResolver(960, 1920, 0)[0]).toMatchObject({ startValue: -12,
    endValue: -12, shape: "step" });
});

test("AUT rechaza curvas sin motor y replanea parámetros sin reatacar notas", () => {
  const document = documentWithLane();
  const clock = new MusicalClock(document.tempoMap, document.meterMap);
  expect(() => createBaseAutomationResolver({ ...document,
    automation: [{ ...document.automation[0]!, points: [
      { id: "p0", tick: 0, value: -12, shape: "bezier" },
    ] }] }, clock)).toThrow(/bezier/);
  const automation: ScheduledAutomation[] = [];
  let attacks = 0;
  let parameterCancels = 0;
  let voiceCancels = 0;
  const sink: SequencerSink = {
    hasAudioOwnership: () => true,
    noteOn: () => { attacks++; return null; },
    noteOff() {}, control() {},
    automation(event) { automation.push(event); },
    cancelAutomationEpoch() { parameterCancels++; },
    cancelEpoch() { voiceCancels++; },
  };
  const note: TimelineNote = { kind: "note", eventId: "n0", sourceKind: "pattern",
    ownerPath: "track/piano/clip/c", trackId: "piano", clipId: "c", tick: 0,
    sequence: 0, channel: 0, pitch: 60, playedPitch: 60, velocity: 100,
    releaseVelocity: 64, durationTicks: 960, tailPolicy: "cut" };
  const audio = { currentTime: 1, state: "running" as const };
  const resolver = createBaseAutomationResolver(document, clock);
  const scheduler = new TransportScheduler({ rootOwnerId: "transport/aut-test", clock,
    audio, sink, autoPump: false, resolve: (start, end) =>
      note.tick >= start && note.tick < end ? [note] : [],
    resolveAutomation: resolver });
  expect(scheduler.start(0)).toBe(true);
  expect(attacks).toBe(1);
  expect(automation.length).toBeGreaterThan(0);
  const before = automation.length;
  scheduler.replanAutomation();
  expect(parameterCancels).toBe(1);
  expect(automation.length).toBeGreaterThan(before);
  expect(attacks).toBe(1);
  expect(voiceCancels).toBe(0);
  scheduler.stop();
  expect(voiceCancels).toBe(1);
});
