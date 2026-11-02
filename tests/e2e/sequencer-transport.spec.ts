import { expect, test } from "@playwright/test";
import { OwnedVoiceRegistry, type OwnedVoiceHandle } from "../../app/src/audio/ownedVoiceRegistry";
import { LiveVoiceController, type LiveVoiceFactory, type LiveVoiceHandle } from "../../app/src/audio/liveVoiceController";
import { MusicalClock } from "../../app/src/sequencer/musicalClock";
import { TransportScheduler, type AudioClockSource } from "../../app/src/sequencer/transportScheduler";
import type {
  ScheduledControl, ScheduledNoteOff, ScheduledNoteOn, SequencerSink,
  TimelineAudioClip, TimelineNote,
} from "../../app/src/sequencer/timelineEvents";

const clock = new MusicalClock([{ tick: 0, microsPerQuarter: 500_000 }],
  [{ tick: 0, numerator: 4, denominator: 4 }]);

test("inicio futuro usa AudioContext como ancla sin ataques previos al count-in", () => {
  const audio = { currentTime: 1, state: "running" as AudioClockSource["state"] };
  const attacks: number[] = [];
  const sink: SequencerSink = {
    hasAudioOwnership: () => true,
    noteOn(event) { attacks.push(event.audioTime); return null; },
    noteOff() {}, control() {}, cancelEpoch() {},
  };
  const transport = new TransportScheduler({ rootOwnerId: "transport/capture", clock,
    audio, sink, autoPump: false, resolve: (start, end) => [note(0)]
      .filter((event) => event.tick >= start && event.tick < end) });
  expect(transport.startAt(0, 2)).toBe(true);
  expect(attacks).toHaveLength(0);
  expect(transport.positionAtAudioTime(2).projectUs).toBe(0);
  audio.currentTime = 1.7;
  transport.pump();
  expect(attacks).toHaveLength(0);
  audio.currentTime = 1.91;
  transport.pump();
  expect(attacks).toEqual([2]);
  expect(transport.positionAtAudioTime(2.123).projectUs).toBe(123_000);
  transport.stop();
});

test("ticks absolutos de loop usan tempo repetido para punch futuro", () => {
  const loopClock = new MusicalClock([
    { tick: 0, microsPerQuarter: 500_000 },
    { tick: 1440, microsPerQuarter: 250_000 },
  ], [{ tick: 0, numerator: 4, denominator: 4 }]);
  const audio = { currentTime: 1, state: "running" as AudioClockSource["state"] };
  const sink: SequencerSink = { hasAudioOwnership: () => true,
    noteOn: () => null, noteOff() {}, control() {}, cancelEpoch() {} };
  const transport = new TransportScheduler({ rootOwnerId: "transport/loop-capture",
    clock: loopClock, audio, sink, autoPump: false,
    loop: { startTick: 960, endTick: 1920 }, resolve: () => [] });
  expect(transport.startAt(960, 1.1)).toBe(true);
  const secondLoop = transport.projectUsAtAbsoluteTick(2880);
  const expected = Math.round((loopClock.tickToSeconds(960) +
    2 * loopClock.secondsBetween(960, 1920)) * 1_000_000);
  expect(secondLoop).toBe(expected);
  expect(secondLoop).not.toBe(Math.round(loopClock.tickToSeconds(2880) * 1_000_000));
  expect(transport.audioTimeAtAbsoluteTick(2880)).toBeCloseTo(1.1 +
    2 * loopClock.secondsBetween(960, 1920), 6);
  transport.stop();
});

function note(tick: number, id = `n-${tick}`, durationTicks = 960): TimelineNote {
  return { kind: "note", eventId: id, sourceKind: "pattern", ownerPath: "track/t/clip/c",
    trackId: "t", clipId: "c", tick, sequence: 1, channel: 0,
    pitch: 60, playedPitch: 60, velocity: 100, releaseVelocity: 64,
    durationTicks, tailPolicy: "cut" };
}

test("horizonte: control, Note Off, Note On estables en borde de loop sin duplicar ataques", () => {
  const audio = { currentTime: 1, state: "running" as AudioClockSource["state"] };
  const registry = new OwnedVoiceRegistry();
  const order: string[] = [];
  const sink: SequencerSink = {
    hasAudioOwnership: () => true,
    noteOn(event) {
      order.push(`on:${event.iteration}`);
      return registry.register({ ownerId: event.ownerId, epoch: event.epoch, release: () => {} });
    },
    noteOff(handle, event) { order.push(`off:${event.iteration}`); registry.releaseHandle(handle, event.audioTime); },
    control(event) { order.push(`cc:${event.iteration}`); },
    cancelEpoch(root, epoch, time) { registry.releaseEpoch(root, epoch, time, 0.012, true); },
  };
  const transport = new TransportScheduler({ rootOwnerId: "transport/p", clock, audio, sink,
    loop: { startTick: 960, endTick: 1080 }, horizonSeconds: 0.14, autoPump: false,
    resolve: (start, end) => [
      { ...note(960, "loop-note", 200), tailPolicy: "cut" as const },
      { kind: "cc" as const, eventId: "cc", sourceKind: "pattern", ownerPath: "track/t/clip/c",
        tick: 960, sequence: 0, channel: 0, controller: 11, value: 100 },
    ].filter((event) => event.tick >= start && event.tick < end),
  });
  expect(transport.start(960)).toBe(true);
  expect(order.slice(0, 8)).toEqual(["cc:0", "on:0", "cc:1", "off:1", "on:1", "cc:2", "off:2", "on:2"]);
  expect(transport.snapshot()).toMatchObject({ state: "playing", tick: 960, iteration: 0, epoch: 1 });
  audio.currentTime += 0.06;
  transport.pump();
  const ons = order.filter((item) => item.startsWith("on:"));
  expect(new Set(ons).size).toBe(ons.length);
  audio.currentTime += 0.14;
  transport.pump();
  transport.pause();
  expect(transport.snapshot().state).toBe("paused");
  expect(transport.snapshot().iteration).toBeGreaterThanOrEqual(2);
  expect(transport.resume()).toBe(true);
  expect(transport.epoch).toBe(2);
  transport.stop();
  expect(registry.snapshot().active).toBe(0);
});

test("Stop y Seek cancelan sólo epoch del transporte; 37 teclas físicas siguen vivas", () => {
  const releases: Array<{ inputId: string; time: number }> = [];
  const factory: LiveVoiceFactory = { create(attack): LiveVoiceHandle {
    return { release: (time) => { releases.push({ inputId: attack.inputId, time }); },
      setGain: () => {}, setBend: () => {}, setSoftPedal: () => {}, setModulation: () => {} };
  } };
  const voices = new LiveVoiceController(factory);
  for (let pitch = 48; pitch <= 84; pitch++) voices.noteOn({ inputId: "smk-37", channel: 0,
    originalNote: pitch, mappedMidi: pitch, rawVelocity: 100, amplitude: 0.7, audioTime: 1 });
  const audio = { currentTime: 1, state: "running" as AudioClockSource["state"] };
  const sink: SequencerSink = {
    hasAudioOwnership: () => true,
    noteOn(event: ScheduledNoteOn): OwnedVoiceHandle | null {
      return voices.noteOnOwned({ inputId: "transport", channel: event.channel,
        originalNote: event.pitch, mappedMidi: event.pitch, rawVelocity: event.velocity,
        amplitude: 0.7, audioTime: event.audioTime }, event.ownerId, event.epoch);
    },
    noteOff(handle: OwnedVoiceHandle, event: ScheduledNoteOff) { voices.noteOffHandle(handle, event.audioTime); },
    control(_event: ScheduledControl) {},
    cancelEpoch(root, epoch, time) { voices.releaseEpoch(root, epoch, time, true); },
  };
  const transport = new TransportScheduler({ rootOwnerId: "transport/p", clock, audio, sink,
    autoPump: false, resolve: (start, end) => Array.from({ length: 8 }, (_, index) => note(0, `n-${index}`))
      .filter((event) => event.tick >= start && event.tick < end) });
  expect(transport.start(0)).toBe(true);
  expect(voices.snapshot().activeVoiceCount).toBe(45);
  transport.seek(960);
  expect(transport.epoch).toBe(2);
  expect(voices.snapshot().activeVoiceCount).toBe(37);
  expect(releases.filter((entry) => entry.inputId === "smk-37")).toHaveLength(0);
  transport.stop();
  expect(voices.snapshot().activeVoiceCount).toBe(37);
  for (let pitch = 48; pitch <= 84; pitch++) voices.noteOff({ inputId: "smk-37",
    channel: 0, originalNote: pitch, audioTime: 1.2 });
  expect(releases.filter((entry) => entry.inputId === "smk-37")).toHaveLength(37);
});

test("suspensión y pérdida del lock invalidan planes; reanudar crea otro epoch", () => {
  const audio = { currentTime: 1, state: "running" as AudioClockSource["state"] };
  let owns = true;
  const registry = new OwnedVoiceRegistry();
  const canceled: number[] = [];
  const sink: SequencerSink = {
    hasAudioOwnership: () => owns,
    noteOn(event) { return registry.register({ ownerId: event.ownerId, epoch: event.epoch, release: () => {} }); },
    noteOff(handle, event) { registry.releaseHandle(handle, event.audioTime); },
    control() {},
    cancelEpoch(root, epoch, time) { canceled.push(epoch); registry.releaseEpoch(root, epoch, time, 0.012, true); },
  };
  const transport = new TransportScheduler({ rootOwnerId: "transport/p", clock, audio, sink,
    autoPump: false, resolve: (start, end) => [note(0)].filter((event) => event.tick >= start && event.tick < end) });
  expect(transport.start(0)).toBe(true);
  audio.state = "suspended";
  transport.pump();
  expect(transport.snapshot().state).toBe("suspended");
  expect(canceled).toEqual([1]);
  expect(registry.snapshot().active).toBe(0);
  expect(transport.resume()).toBe(false);
  audio.state = "running";
  expect(transport.resume()).toBe(true);
  expect(transport.epoch).toBe(2);
  owns = false;
  transport.pump();
  expect(transport.snapshot().state).toBe("blocked");
  expect(canceled).toEqual([1, 2]);
  expect(transport.resume()).toBe(false);
});

test("100 vueltas de loop no duplican ni pierden ataques en el borde", () => {
  const audio = { currentTime: 1, state: "running" as AudioClockSource["state"] };
  const registry = new OwnedVoiceRegistry();
  const attacks: Array<{ iteration: number; at: number }> = [];
  const sink: SequencerSink = {
    hasAudioOwnership: () => true,
    noteOn(event) {
      attacks.push({ iteration: event.iteration, at: event.audioTime });
      return registry.register({ ownerId: event.ownerId, epoch: event.epoch, release: () => {} });
    },
    noteOff(handle, event) { registry.releaseHandle(handle, event.audioTime); },
    control() {},
    cancelEpoch(root, epoch, at) { registry.releaseEpoch(root, epoch, at, 0.012, true); },
  };
  const scheduler = new TransportScheduler({ rootOwnerId: "transport/p", clock, audio, sink,
    loop: { startTick: 0, endTick: 120 }, horizonSeconds: 0.03, autoPump: false,
    resolve: (start, end) => [note(0, "loop", 120)].filter((event) => event.tick >= start && event.tick < end) });
  expect(scheduler.start(0)).toBe(true);
  for (let index = 0; index < 100; index++) {
    audio.currentTime = 1 + (index + 1) * 0.0625;
    scheduler.pump();
  }
  expect(attacks.length).toBeGreaterThanOrEqual(100);
  expect(attacks.length).toBeLessThanOrEqual(101);
  expect(new Set(attacks.map((attack) => attack.iteration)).size).toBe(attacks.length);
  expect(attacks.every((attack, index) => index === 0 || attack.at > attacks[index - 1]!.at)).toBe(true);
  scheduler.stop();
  expect(registry.snapshot().active).toBe(0);
});

test("clip audio se reanuda por tiempo musical en Seek y 100 loops no lo duplican", () => {
  const audio = { currentTime: 1, state: "running" as AudioClockSource["state"] };
  const events: Array<{ iteration: number; elapsed: number; end: number; at: number }> = [];
  const registry = new OwnedVoiceRegistry();
  const sink: SequencerSink = {
    hasAudioOwnership: () => true,
    noteOn: () => null,
    noteOff() {},
    control() {},
    audioClip(event) {
      events.push({ iteration: event.iteration, elapsed: event.elapsedSeconds,
        end: event.endAudioTime, at: event.audioTime });
      return registry.register({ ownerId: event.ownerId, epoch: event.epoch, release: () => {} });
    },
    cancelEpoch(root, epoch, at) { registry.releaseEpoch(root, epoch, at, 0.008, true); },
  };
  const clip: TimelineAudioClip = { kind: "audioClip", eventId: "audio:c:segment-0",
    sourceKind: "arrangement", ownerPath: "track/t/clip/c", trackId: "t", clipId: "c",
    tick: 0, sequence: 0, channel: 0, clipStartTick: 0, clipEndTick: 120,
    assetId: "take", sourceStartFrame: 0, sourceEndFrame: 6_000,
    fadeInFrames: 0, fadeOutFrames: 0, gainDb: 0, tailPolicy: "cut" };
  const scheduler = new TransportScheduler({ rootOwnerId: "transport/p", clock, audio, sink,
    loop: { startTick: 0, endTick: 120 }, horizonSeconds: 0.03, autoPump: false,
    resolve: (start, end) => clip.tick < end && clip.clipEndTick > start ? [clip] : [] });
  expect(scheduler.start(60)).toBe(true);
  expect(events[0]?.elapsed).toBeCloseTo(0.03125, 5);
  expect(events[0]!.end).toBeGreaterThan(events[0]!.at);
  scheduler.seek(0);
  events.length = 0;
  for (let index = 0; index < 100; index++) {
    audio.currentTime = 1 + (index + 1) * 0.0625;
    scheduler.pump();
  }
  expect(events.length).toBeGreaterThanOrEqual(99);
  expect(events.length).toBeLessThanOrEqual(101);
  expect(new Set(events.map((event) => event.iteration)).size).toBe(events.length);
  expect(events.every((event) => event.end <= event.at + 0.0625 + 1e-8)).toBe(true);
  scheduler.stop();
  expect(registry.snapshot().active).toBe(0);
});

test("clips absolutos se programan por microsegundos y no por redondeo a tick", () => {
  const audio = { currentTime: 1, state: "running" as AudioClockSource["state"] };
  const scheduled: Array<{ id: string; at: number; elapsed: number; end: number; iteration: number }> = [];
  const registry = new OwnedVoiceRegistry();
  const sink: SequencerSink = {
    hasAudioOwnership: () => true, noteOn: () => null, noteOff() {}, control() {},
    audioClip(event) {
      scheduled.push({ id: event.eventId, at: event.audioTime,
        elapsed: event.elapsedSeconds, end: event.endAudioTime,
        iteration: event.iteration });
      return registry.register({ ownerId: event.ownerId, epoch: event.epoch, release: () => {} });
    },
    cancelEpoch(root, epoch, at) { registry.releaseEpoch(root, epoch, at, 0.008, true); },
  };
  const clip = (id: string, startUs: number): TimelineAudioClip => ({
    kind: "audioClip", eventId: `audio:${id}:us-${startUs}`, sourceKind: "arrangement",
    ownerPath: `track/t/clip/${id}`, trackId: "t", clipId: id,
    timeMode: "absolute", absoluteStartUs: startUs, absoluteEndUs: 230_000,
    segmentStartUs: startUs, segmentEndUs: 230_000,
    tick: clock.secondsToTick(startUs / 1_000_000, "nearest"),
    clipStartTick: clock.secondsToTick(startUs / 1_000_000, "nearest"),
    clipEndTick: 442,
    sequence: 0, channel: 0, assetId: id,
    sourceStartFrame: 0, sourceEndFrame: 12_000,
    fadeInFrames: 0, fadeOutFrames: 0, gainDb: 0, tailPolicy: "cut",
  });
  const clips = [clip("a", 100_000), clip("b", 100_300)];
  const scheduler = new TransportScheduler({ rootOwnerId: "transport/p", clock, audio,
    sink, loop: { startTick: 0, endTick: 960 }, autoPump: false,
    startLeadSeconds: 0, horizonSeconds: 0.3,
    resolve: (start, end) => clips.filter((item) => item.tick < end && item.clipEndTick > start),
  });
  expect(scheduler.start(0)).toBe(true);
  expect(scheduled.map((event) => event.id)).toEqual(["audio:a:us-100000", "audio:b:us-100300"]);
  expect(scheduled[0]!.at).toBeCloseTo(1.1, 6);
  expect(scheduled[1]!.at).toBeCloseTo(1.1003, 6);
  expect(scheduled[0]!.end).toBeCloseTo(1.23, 6);
  audio.currentTime = 1.5;
  scheduler.pump();
  expect(scheduled.some((event) => event.iteration === 1 &&
    Math.abs(event.at - 1.6) < 1e-6)).toBe(true);
  scheduler.seek(300);
  const resumed = scheduled.findLast((event) => event.id === "audio:a:us-100000");
  expect(resumed?.elapsed).toBeCloseTo(0.05625, 6);
  scheduler.stop();
  expect(registry.snapshot().active).toBe(0);
  audio.currentTime = 2;
  expect(scheduler.start(193)).toBe(true);
  const subTickSeek = scheduled.findLast((event) => event.id === "audio:b:us-100300");
  expect(subTickSeek?.at).toBeCloseTo(2, 6);
  expect(subTickSeek?.elapsed).toBeCloseTo(clock.tickToSeconds(193) - 0.1003, 6);
  scheduler.stop();
});

test("audio capture anchor keeps song microseconds across loop and Seek", () => {
  const clock = new MusicalClock([
    { tick: 0, microsPerQuarter: 500_000 },
    { tick: 960, microsPerQuarter: 1_000_000 },
  ], [{ tick: 0, numerator: 4, denominator: 4 }]);
  const audio = { currentTime: 1, state: "running" as AudioClockSource["state"] };
  const sink: SequencerSink = {
    hasAudioOwnership: () => true, noteOn: () => null, noteOff() {}, control() {},
    cancelEpoch() {},
  };
  const scheduler = new TransportScheduler({ rootOwnerId: "transport/capture", clock,
    audio, sink, loop: { startTick: 0, endTick: 960 }, autoPump: false,
    startLeadSeconds: 0, resolve: () => [] });
  expect(scheduler.start(0)).toBe(true);
  const first = scheduler.positionAtAudioTime(1.123_456);
  expect(first.projectUs).toBe(123_456);
  expect(first.projectTick).toBe(clock.secondsToTick(0.123_456));
  const repeated = scheduler.positionAtAudioTime(1.75);
  expect(repeated).toMatchObject({ tick: 480, absoluteTick: 1440,
    iteration: 1, projectUs: 750_000, projectTick: 1200 });
  audio.currentTime = 1.51;
  scheduler.seek(120);
  const resumed = scheduler.positionAtAudioTime(1.55);
  expect(resumed.projectUs).toBe(102_500);
  expect(resumed.projectTick).toBe(clock.secondsToTick(0.1025));
  scheduler.stop();
});


test("reference Studio loop switch replans epoch without duplicate events",()=>{
  const audio={currentTime:1,state:"running" as AudioClockSource["state"]};
  const canceled:number[]=[];
  const sink:SequencerSink={hasAudioOwnership:()=>true,noteOn:()=>null,
    noteOff(){},control(){},cancelEpoch(_root,epoch){canceled.push(epoch);}};
  const transport=new TransportScheduler({rootOwnerId:"transport/reference-loop",
    clock,audio,sink,autoPump:false,resolve:()=>[]});
  expect(transport.start(0)).toBe(true);
  expect(transport.epoch).toBe(1);
  transport.setLoopRange({startTick:960,endTick:1920});
  expect(transport.snapshot().state).toBe("playing");
  expect(transport.epoch).toBe(2);
  expect(canceled).toEqual([1]);
  audio.currentTime=1.3;
  transport.pump();
  expect(transport.snapshot().tick).toBeGreaterThan(0);
  transport.setLoopRange(null);
  expect(transport.epoch).toBe(3);
  expect(canceled).toEqual([1,2]);
  transport.stop();
  expect(canceled).toEqual([1,2,3]);
});
