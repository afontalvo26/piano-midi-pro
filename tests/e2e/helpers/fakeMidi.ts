/**
 * Fake Web MIDI device for tests — a real Map subclass (so `.get()`, `.values()`,
 * `.forEach()` all behave) whose `values()` yields the fake input objects the
 * app expects, including a working `onmidimessage` setter.
 *
 * Install with `page.addInitScript(installFakeMidi)`.
 */
export function installFakeMidi(): void {
  const w = window as unknown as Record<string, unknown>;
  const listeners: ((e: unknown) => void)[] = [];
  let setterCalls = 0;

  class FakeInput {
    id = "fake-input-1";
    name = "Fake MIDI Keyboard";
    manufacturer = "Test";
    state = "connected";
    type = "input";
    connection = "open";
    get onmidimessage(): ((e: unknown) => void) | null {
      return listeners[0] ?? null;
    }
    set onmidimessage(fn: ((e: unknown) => void) | null) {
      setterCalls += 1;
      listeners.length = 0;
      if (fn) listeners.push(fn);
    }
  }

  class FakeInputMap extends Map<string, FakeInput> {
    override values(): MapIterator<FakeInput> {
      return super.values();
    }
  }

  const inputMap = new FakeInputMap();
  inputMap.set("fake-input-1", new FakeInput());

  const access = {
    inputs: inputMap,
    outputs: new Map(),
    onstatechange: null as null | (() => void),
    sysexEnabled: false,
  };

  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    value: async () => {
      w.__midiCalls = ((w.__midiCalls as number) || 0) + 1;
      return access;
    },
  });

  w.__midiListeners = listeners;
  w.__midiSetterCalls = () => setterCalls;
  w.__fakeMidiAccess = access;
}
