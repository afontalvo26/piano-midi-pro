import { expect, test } from "@playwright/test";
import { OwnedVoiceRegistry } from "../../app/src/audio/ownedVoiceRegistry";
import {
  LiveVoiceController,
  type LiveVoiceAttack,
  type LiveVoiceFactory,
  type LiveVoiceHandle,
} from "../../app/src/audio/liveVoiceController";

function attack(inputId: string, note: number, audioTime = 1): Omit<LiveVoiceAttack, "attackId"> {
  return {
    inputId, channel: 0, originalNote: note, mappedMidi: note,
    rawVelocity: 100, amplitude: 0.6, audioTime,
  };
}

function fakeFactory(): { factory: LiveVoiceFactory; sounds: Array<{
  attack: LiveVoiceAttack; releases: Array<[number, number]>; end(): void;
}> } {
  const sounds: Array<{ attack: LiveVoiceAttack; releases: Array<[number, number]>; end(): void }> = [];
  const factory: LiveVoiceFactory = {
    create(note, _initial, onEnded): LiveVoiceHandle {
      const sound = { attack: note, releases: [] as Array<[number, number]>, end: onEnded };
      sounds.push(sound);
      return {
        release: (time, fade) => { sound.releases.push([time, fade]); },
        setGain: () => {}, setBend: () => {}, setSoftPedal: () => {}, setModulation: () => {},
      };
    },
  };
  return { factory, sounds };
}

test("registro: handle opaco, owner exacto, descendientes, epoch y fin real", () => {
  const registry = new OwnedVoiceRegistry();
  const other = new OwnedVoiceRegistry();
  const released: string[] = [];
  const a = registry.register({ ownerId: "project/track-a", epoch: 1,
    release: () => { released.push("a"); } });
  const b = registry.register({ ownerId: "project/track-b", epoch: 1,
    release: () => { released.push("b"); } });
  const preview = registry.register({ ownerId: "preview", epoch: 2,
    release: () => { released.push("preview"); } });

  expect(other.releaseHandle(a, 1)).toBe(false);
  expect(registry.releaseOwner("project", 1)).toBe(0);
  expect(registry.releaseOwner("project/track-a", 1)).toBe(1);
  expect(registry.snapshot()).toMatchObject({ active: 2, releasing: 1, allocated: 3, released: 1 });
  expect(registry.releaseOwner("project", 1.1, 0.012, true)).toBe(2);
  expect(released).toEqual(["a", "b"]); // A later Stop cannot prolong A's tail.
  expect(registry.releaseHandle(a, 1.005, 0.005)).toBe(true);
  expect(released.at(-1)).toBe("a"); // An earlier deadline may shorten it.
  expect(registry.snapshot()).toMatchObject({ active: 1, releasing: 2, released: 2 });
  expect(registry.releaseEpoch("project", 2, 1.2, 0.012, true)).toBe(0);
  expect(registry.releaseEpoch("preview", 2, 1.2)).toBe(1);
  expect(released.at(-1)).toBe("preview");
  expect(registry.finish(b)).toBe(true);
  expect(registry.finish(b)).toBe(false);
  expect(registry.snapshot()).toMatchObject({ active: 0, releasing: 2, allocated: 2, ended: 1 });
  expect(registry.has(a)).toBe(true);
  expect(registry.has(preview)).toBe(true);
});

test("release fallido conserva voz activa y permite reintentar Stop", () => {
  const registry = new OwnedVoiceRegistry();
  let fail = true;
  let calls = 0;
  const handle = registry.register({ ownerId: "project/track", epoch: 1, release: () => {
    calls++;
    if (fail) throw new Error("falló el nodo de audio");
  } });
  expect(registry.releaseOwner("project/track", 1)).toBe(0);
  expect(registry.snapshot()).toMatchObject({ active: 1, releasing: 0, releaseErrors: 1 });
  fail = false;
  expect(registry.releaseHandle(handle, 1.01)).toBe(true);
  expect(calls).toBe(2);
  expect(registry.snapshot()).toMatchObject({ active: 0, releasing: 1, releaseErrors: 1 });
});

test("Note Off por handle respeta sustain y no suelta otra pulsación del mismo pitch", () => {
  const { factory, sounds } = fakeFactory();
  const voices = new LiveVoiceController(factory);
  const first = voices.noteOnOwned(attack("transport", 60), "project/track-a", 3);
  const second = voices.noteOnOwned(attack("transport", 60, 1.1), "project/track-b", 3);
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  voices.setSustain({ inputId: "transport", channel: 0 }, 127, 1.15);
  expect(voices.noteOffHandle(second!, 1.2)).toBe(true);
  expect(sounds[0]!.releases).toHaveLength(0);
  expect(sounds[1]!.releases).toHaveLength(0);
  voices.setSustain({ inputId: "transport", channel: 0 }, 0, 1.3);
  expect(sounds[1]!.releases[0]![0]).toBe(1.3);
  expect(sounds[0]!.releases).toHaveLength(0);
  expect(voices.releaseOwner("project/track-a", 1.4)).toBe(1);
  expect(sounds[0]!.releases[0]).toEqual([1.4, 0.012]);
  sounds.forEach((sound) => sound.end());
  expect(voices.ownedVoiceSnapshot()).toMatchObject({ active: 0, allocated: 0, ended: 2 });
  expect(voices.snapshot().pendingSilentNoteCount).toBe(0);
});

test("Stop del transporte deja las 37 teclas físicas vivas", () => {
  const { factory, sounds } = fakeFactory();
  const voices = new LiveVoiceController(factory);
  const live = { inputId: "smk-37", channel: 0 };
  for (let pitch = 48; pitch <= 84; pitch++) {
    expect(voices.noteOn(attack(live.inputId, pitch))).not.toBeNull();
  }
  for (let pitch = 48; pitch <= 55; pitch++) {
    expect(voices.noteOnOwned(attack("transport", pitch), "project/track/clip/0", 4)).not.toBeNull();
  }
  expect(voices.snapshot().activeVoiceCount).toBe(45);
  expect(voices.releaseOwner("project", 1.2, true)).toBe(8);
  expect(sounds.filter((sound) => sound.attack.inputId === "transport" && sound.releases.length)).toHaveLength(8);
  expect(sounds.filter((sound) => sound.attack.inputId === live.inputId && sound.releases.length)).toHaveLength(0);
  expect(voices.snapshot().activeVoiceCount).toBe(37);
  for (let pitch = 48; pitch <= 84; pitch++) {
    expect(voices.noteOff({ ...live, originalNote: pitch, audioTime: 1.3 })).not.toBeNull();
  }
  expect(sounds.filter((sound) => sound.attack.inputId === live.inputId && sound.releases.length)).toHaveLength(37);
  sounds.forEach((sound) => sound.end());
  expect(voices.snapshot()).toMatchObject({ activeVoiceCount: 0, allocatedVoiceCount: 0 });
  expect(voices.ownedVoiceSnapshot()).toMatchObject({ allocated: 0, ended: 8 });
});

test("beat denso sacrifica voces programadas antes que 37 teclas físicas", () => {
  const { factory, sounds } = fakeFactory();
  const voices = new LiveVoiceController(factory);
  for (let pitch = 48; pitch <= 84; pitch++) {
    voices.noteOn(attack("smk-37", pitch));
  }
  for (let index = 0; index < 45; index++) {
    voices.noteOnOwned(attack("transport", 48 + index % 37, 1.1 + index / 1000),
      `transport/p/track/${index}`, 1);
  }
  expect(voices.snapshot().activeVoiceCount).toBe(56);
  expect(sounds.filter((sound) => sound.attack.inputId === "smk-37" && sound.releases.length)).toHaveLength(0);
  expect(sounds.filter((sound) => sound.attack.inputId === "transport" && sound.releases.length).length).toBeGreaterThan(0);
  voices.releaseOwner("transport", 1.5, true);
  expect(voices.snapshot().activeVoiceCount).toBe(37);
});

test("37 Note Off físicos bajo sustain sobreviven Stop y se liberan al soltar pedal", () => {
  const { factory, sounds } = fakeFactory();
  const voices = new LiveVoiceController(factory);
  const origin = { inputId: "smk-37-elite", channel: 4 };
  voices.setSustain(origin, 127, 1);
  for (let pitch = 48; pitch <= 84; pitch++) {
    expect(voices.noteOn({ ...attack(origin.inputId, pitch), channel: origin.channel })).not.toBeNull();
  }
  for (let pitch = 48; pitch <= 84; pitch++) {
    expect(voices.noteOff({ ...origin, originalNote: pitch, audioTime: 1.1 })).not.toBeNull();
  }
  expect(voices.snapshot().activeVoiceCount).toBe(37);
  expect(voices.releaseOwner("transport/project", 1.2, true)).toBe(0);
  expect(sounds.filter((sound) => sound.releases.length)).toHaveLength(0);
  voices.setSustain(origin, 0, 1.3);
  expect(sounds.filter((sound) => sound.releases.length)).toHaveLength(37);
  sounds.forEach((sound) => sound.end());
  expect(voices.snapshot().activeVoiceCount).toBe(0);
});

test("batería programada libera sólo los golpes de su owner", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/engine/DrumKitEngine.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se encontró el módulo Tone del kit");
    const Tone = await import(toneUrl);
    const { DrumKitEngine } = await import("/src/engine/DrumKitEngine.ts");
    await Tone.start();
    const destination = new Tone.Gain(0).toDestination();
    const drums = new DrumKitEngine(destination);
    const raw = Tone.getContext().rawContext as AudioContext;
    const buffer = raw.createBuffer(1, Math.round(raw.sampleRate * 0.3), raw.sampleRate);
    const pcm = buffer.getChannelData(0);
    for (let index = 0; index < pcm.length; index++) pcm[index] = 0.1;
    // Deterministic in-memory fixture; no catalog asset or network fetch.
    (drums as unknown as { variants: Map<number, AudioBuffer[]> }).variants.set(36, [buffer]);
    const at = Tone.immediate() + 0.02;
    const transport = drums.triggerOwned(36, 0.8, "project/track-a", 1, at);
    const preview = drums.triggerOwned(36, 0.8, "preview", 2, at);
    if (!transport || !preview) throw new Error("Los golpes preparados no arrancaron");
    const before = drums.voiceSnapshot();
    const stopped = drums.releaseOwner("project/track-a", at + 0.03);
    const afterStop = drums.voiceSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const afterEnd = drums.voiceSnapshot();
    drums.dispose();
    destination.dispose();
    return { before, stopped, afterStop, afterEnd };
  });
  expect(result.before).toMatchObject({ active: 2, allocated: 2 });
  expect(result.stopped).toBe(1);
  expect(result.afterStop).toMatchObject({ active: 1, releasing: 1 });
  expect(result.afterEnd).toMatchObject({ active: 0, allocated: 0, ended: 2 });
});
