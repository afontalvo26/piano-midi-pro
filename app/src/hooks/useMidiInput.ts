import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorageState } from "../utils/settings";

export type VelocityCurveType = "linear" | "logarithmic" | "exponential";

export interface MidiDevice {
  id: string;
  name: string;
  state: string;
}

export interface UseMidiInputOptions {
  onNoteOn?: (midi: number, velocity: number, timestamp: number) => void;
  onNoteOff?: (midi: number) => void;
  onPitchBend?: (value: number) => void;
  onSustain?: (down: boolean) => void;
  onModulation?: (value: number) => void;
}

export interface UseMidiInputApi {
  midiPermission: string;
  midiStatus: string;
  midiError: string;
  midiInputs: MidiDevice[];
  isMidiScanning: boolean;
  selectedInputId: string;
  setSelectedInputId: (id: string) => void;
  midiMode: "anchor" | "shift";
  setMidiMode: (mode: "anchor" | "shift") => void;
  midiPhysicalBase: number;
  setMidiPhysicalBase: (base: number) => void;
  lastPhysicalMidi: number | null;
  requestMidiAccess: () => Promise<void>;
  refreshDevices: () => void;
}

/**
 * Manages Web MIDI API access, device discovery, message routing,
 * and exposes device state without coupling to the audio engine.
 *
 * Note: actual note-on/off sound triggering is still in App.tsx via
 * the handleMidiMessage callback. This hook manages the connection layer.
 */
export function useMidiInput(options: UseMidiInputOptions = {}): UseMidiInputApi {
  const [midiPermission, setMidiPermission] = useState("unknown");
  const [midiStatus, setMidiStatus] = useState("Buscando controlador MIDI...");
  const [midiError, setMidiError] = useState("");
  const [midiInputs, setMidiInputs] = useState<MidiDevice[]>([]);
  const [isMidiScanning, setIsMidiScanning] = useState(true);
  const [lastPhysicalMidi, setLastPhysicalMidi] = useState<number | null>(null);

  const [selectedInputId, setSelectedInputId] = useLocalStorageState<string>(
    "piano_selected_midi_input_id",
    "__all__",
  );
  const [midiMode, setMidiMode] = useLocalStorageState<"anchor" | "shift">(
    "piano_midi_mode",
    "shift",
  );
  const [midiPhysicalBase, setMidiPhysicalBase] = useLocalStorageState<number>(
    "piano_midi_physical_base",
    48,
  );

  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);

  const applyVelocityCurve = (raw: number, curve: VelocityCurveType): number => {
    const v = raw / 127;
    if (curve === "logarithmic") return Math.log(1 + v * 9) / Math.log(10);
    if (curve === "exponential") return v * v;
    return v;
  };

  const handleMessage = useCallback((event: MIDIMessageEvent) => {
    if (!event.data || event.data.length < 2) return;
    const [status, data1, data2 = 0] = event.data;
    const type = status & 0xf0;

    if (type === 0x90 && data2 > 0) {
      // Note On
      setLastPhysicalMidi(data1);
      const velocity = applyVelocityCurve(data2, "exponential");
      optionsRef.current.onNoteOn?.(data1, velocity, event.timeStamp);
    } else if (type === 0x80 || (type === 0x90 && data2 === 0)) {
      // Note Off
      optionsRef.current.onNoteOff?.(data1);
    } else if (type === 0xe0) {
      // Pitch Bend: 14-bit signed value centered at 8192
      const raw = ((data2 << 7) | data1) - 8192;
      const normalized = raw / 8192; // -1.0 .. 1.0
      optionsRef.current.onPitchBend?.(normalized * 100); // scale to -100..100
    } else if (type === 0xb0) {
      if (data1 === 64) {
        // Sustain pedal (CC64)
        optionsRef.current.onSustain?.(data2 >= 64);
      } else if (data1 === 1) {
        // Modulation wheel (CC1)
        optionsRef.current.onModulation?.(data2 / 127);
      }
    }
  }, []);

  const connectToInputs = useCallback(
    (inputId: string) => {
      const access = midiAccessRef.current;
      if (!access) return;
      // Clear existing handlers
      for (const input of access.inputs.values()) {
        input.onmidimessage = null;
      }
      if (inputId === "__all__") {
        for (const input of access.inputs.values()) {
          input.onmidimessage = handleMessage;
        }
      } else {
        const input = access.inputs.get(inputId);
        if (input) input.onmidimessage = handleMessage;
      }
    },
    [handleMessage],
  );

  const refreshDevices = useCallback(() => {
    const access = midiAccessRef.current;
    if (!access) return;

    const inputs = Array.from(access.inputs.values())
      .filter((i) => i.state === "connected")
      .map((i) => ({ id: i.id, name: i.name ?? "Dispositivo MIDI", state: i.state }));

    setMidiInputs(inputs);
    setIsMidiScanning(false);

    if (inputs.length === 0) {
      setMidiStatus("Esperando controlador MIDI");
      setMidiError("Conecta tu controlador y espera detección automática.");
      setSelectedInputId("__all__");
      return;
    }

    const saved = localStorage.getItem("piano_selected_midi_input_id");
    const savedClean = saved ? JSON.parse(saved) as string : "__all__";
    const target =
      inputs.some((i) => i.id === savedClean) ? savedClean : inputs[0].id;

    const name = inputs.find((i) => i.id === target)?.name;
    setMidiStatus(name ? `Controlador activo: ${name}` : "Controlador MIDI activo");
    setMidiError("");
    setSelectedInputId(target);
  }, [setSelectedInputId]);

  const requestMidiAccess = useCallback(async () => {
    setIsMidiScanning(true);
    setMidiStatus("Buscando controlador MIDI...");

    if (!("requestMIDIAccess" in navigator)) {
      setMidiPermission("unsupported");
      setMidiStatus("Navegador incompatible con Web MIDI");
      setMidiError("Usa Chrome, Edge u Opera para MIDI real.");
      setIsMidiScanning(false);
      return;
    }

    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      setMidiPermission("granted");
      access.onstatechange = () => refreshDevices();
      refreshDevices();
    } catch {
      setMidiPermission("denied");
      setIsMidiScanning(false);
      setMidiStatus("Acceso MIDI denegado");
      setMidiError("Concede permisos MIDI en la barra de direcciones.");
    }
  }, [refreshDevices]);

  // Re-bind inputs when selectedInputId changes
  useEffect(() => {
    connectToInputs(selectedInputId);
  }, [selectedInputId, connectToInputs]);

  return {
    midiPermission,
    midiStatus,
    midiError,
    midiInputs,
    isMidiScanning,
    selectedInputId,
    setSelectedInputId,
    midiMode,
    setMidiMode,
    midiPhysicalBase,
    setMidiPhysicalBase,
    lastPhysicalMidi,
    requestMidiAccess,
    refreshDevices,
  };
}
