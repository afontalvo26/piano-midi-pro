/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import { useLocalStorageState } from "../utils/settings";

export type ShowNoteNamesMode = "none" | "name" | "binding";
export type VelocityCurve = "linear" | "logarithmic" | "exponential";

interface SettingsApi {
  showNoteNames: ShowNoteNamesMode;
  setShowNoteNames: (v: ShowNoteNamesMode) => void;
  showParticles: boolean;
  setShowParticles: (v: boolean) => void;
  pitchPractice: boolean;
  setPitchPractice: (v: boolean) => void;
  scrollSensitivity: number;
  setScrollSensitivity: (v: number) => void;
  velocityCurve: VelocityCurve;
  setVelocityCurve: (v: VelocityCurve) => void;
  mouseVelocity: number;
  setMouseVelocity: (v: number) => void;
  pitchBendRange: number;
  setPitchBendRange: (v: number) => void;
  transpose: number;
  setTranspose: (v: number) => void;
  metronomeOn: boolean;
  setMetronomeOn: (v: boolean) => void;
  pianoOnlyMode: boolean;
  setPianoOnlyMode: (v: boolean) => void;
  showPet: boolean;
  setShowPet: (v: boolean) => void;
}

const SettingsContext = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [showNoteNames, setShowNoteNames] = useLocalStorageState<ShowNoteNamesMode>("piano_show_note_names", "name");
  const [showParticles, setShowParticles] = useLocalStorageState<boolean>("piano_show_particles", true);
  const [pitchPractice, setPitchPractice] = useLocalStorageState<boolean>("piano_pitch_practice", false);
  const [scrollSensitivity, setScrollSensitivity] = useLocalStorageState<number>("piano_scroll_sensitivity", 1.2);
  const [velocityCurve, setVelocityCurve] = useLocalStorageState<VelocityCurve>("piano_velocity_curve", "exponential");
  const [mouseVelocity, setMouseVelocity] = useLocalStorageState<number>("piano_mouse_velocity", 0.75);
  const [pitchBendRange, setPitchBendRange] = useLocalStorageState<number>("piano_pitch_bend_range", 2);
  const [transpose, setTranspose] = useLocalStorageState<number>("piano_transpose", 0);
  const [metronomeOn, setMetronomeOn] = useLocalStorageState<boolean>("piano_metronome_on", false);
  const [pianoOnlyMode, setPianoOnlyMode] = useLocalStorageState<boolean>("piano_piano_only_mode", false);
  const [showPet, setShowPet] = useLocalStorageState<boolean>("piano_pet_show", true);

  const value: SettingsApi = {
    showNoteNames,
    setShowNoteNames,
    showParticles,
    setShowParticles,
    pitchPractice,
    setPitchPractice,
    scrollSensitivity,
    setScrollSensitivity,
    velocityCurve,
    setVelocityCurve,
    mouseVelocity,
    setMouseVelocity,
    pitchBendRange,
    setPitchBendRange,
    transpose,
    setTranspose,
    metronomeOn,
    setMetronomeOn,
    pianoOnlyMode,
    setPianoOnlyMode,
    showPet,
    setShowPet,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettingsContext(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsContext must be used within <SettingsProvider>");
  return ctx;
}
