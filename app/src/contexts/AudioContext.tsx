/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import { useAudioEngine, type UseAudioEngineApi } from "../hooks/useAudioEngine";
import { useLocalStorageState } from "../utils/settings";

interface AudioProviderProps {
  children: ReactNode;
}

type LatencyMode = "ultra" | "balanced";

export interface AudioContextValue extends UseAudioEngineApi {
  masterVolume: number;
  setMasterVolume: (db: number) => void;
  reverbDecay: number;
  setReverbDecay: (decay: number) => void;
  chorusDepth: number;
  setChorusDepth: (depth: number) => void;
  sustainTime: number;
  setSustainTime: (s: number) => void;
  latencyMode: LatencyMode;
  setLatencyMode: (m: LatencyMode) => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: AudioProviderProps) {
  const [masterVolume, setMasterVolume] = useLocalStorageState<number>("piano_master_volume", -10);
  const [reverbDecay, setReverbDecay] = useLocalStorageState<number>("piano_reverb_decay", 1.5);
  const [chorusDepth, setChorusDepth] = useLocalStorageState<number>("piano_chorus_depth", 0.0);
  const [sustainTime, setSustainTime] = useLocalStorageState<number>("piano_sustain_time", 1.2);
  const [latencyMode, setLatencyMode] = useLocalStorageState<LatencyMode>("piano_latency_mode", "ultra");

  const audio = useAudioEngine({ masterVolume, reverbDecay, chorusDepth, sustainTime, latencyMode });

  const value: AudioContextValue = {
    ...audio,
    masterVolume,
    setMasterVolume,
    reverbDecay,
    setReverbDecay,
    chorusDepth,
    setChorusDepth,
    sustainTime,
    setSustainTime,
    latencyMode,
    setLatencyMode,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudioContext(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudioContext must be used within <AudioProvider>");
  return ctx;
}
