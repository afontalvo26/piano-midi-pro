// ============================================================
// useAudioEngine — Encapsulates Tone.js audio graph lifecycle.
// Mirrors the original `initializeAudio` flow in App.tsx but
// exposes a typed API for consumers (refs + status + actions).
// Chain: vol → chorus → reverb → compressor → limiter → out
// Metronome: metronomeVol → limiter
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import * as Tone from "tone";
import {
  salamanderSamples,
  setMasterVolume,
  setReverbDecay,
  setChorusDepth,
} from "../services/audioService";
import { InstrumentEngineRegistry } from "../engine/InstrumentEngine";
import { disposeAllGMSamplers } from "../engine/GMSamplerEngine";

// ─── Public types ──────────────────────────────────────────────

export interface UseAudioEngineOptions {
  /** Master volume in dB. Clamped to [-40, 0] downstream. */
  masterVolume: number;
  /** Reverb decay time in seconds (must be > 0). */
  reverbDecay: number;
  /** Chorus wet amount, 0..1. */
  chorusDepth: number;
  /** Sustain/release time for the Salamander sampler in seconds. */
  sustainTime: number;
  /** Audio context tuning preset. */
  latencyMode: "ultra" | "balanced";
}

export interface UseAudioEngineState {
  isAudioReady: boolean;
  isSamplerActive: boolean;
  isAudioLoading: boolean;
  audioStatusMessage: string;
}

export interface UseAudioEngineRefs {
  samplerRef: RefObject<Tone.Sampler | null>;
  fallbackSynthsRef: RefObject<Record<number, Tone.PolySynth> | null>;
  reverbRef: RefObject<Tone.Reverb | null>;
  chorusRef: RefObject<Tone.Chorus | null>;
  volNodeRef: RefObject<Tone.Volume | null>;
  compressorRef: RefObject<Tone.Compressor | null>;
  metronomeRef: RefObject<Tone.MetalSynth | null>;
  metronomeVolRef: RefObject<Tone.Volume | null>;
  engineRegistryRef: RefObject<InstrumentEngineRegistry | null>;
  gmDestRef: RefObject<Tone.ToneAudioNode | null>;
}

export interface UseAudioEngineApi
  extends UseAudioEngineState,
    UseAudioEngineRefs {
  /** Idempotent. Starts Tone, builds the chain, loads the sampler. */
  initAudio: () => Promise<void>;
  /** Idempotent. Disposes all nodes and resets state. */
  disposeAudio: () => void;
}

// ─── Hook ──────────────────────────────────────────────────────

export function useAudioEngine(
  options: UseAudioEngineOptions,
): UseAudioEngineApi {
  // Status
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [isSamplerActive, setIsSamplerActive] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioStatusMessage, setAudioStatusMessage] =
    useState("Esperando activación");

  // Public refs (returned to callers)
  const samplerRef = useRef<Tone.Sampler | null>(null);
  const fallbackSynthsRef = useRef<Record<number, Tone.PolySynth> | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const chorusRef = useRef<Tone.Chorus | null>(null);
  const volNodeRef = useRef<Tone.Volume | null>(null);
  const compressorRef = useRef<Tone.Compressor | null>(null);
  const metronomeRef = useRef<Tone.MetalSynth | null>(null);
  const metronomeVolRef = useRef<Tone.Volume | null>(null);
  const engineRegistryRef = useRef<InstrumentEngineRegistry | null>(null);
  const gmDestRef = useRef<Tone.ToneAudioNode | null>(null);

  // Private refs
  const limiterRef = useRef<Tone.Limiter | null>(null);
  const initializingRef = useRef(false);

  // Mirror options into a ref so initAudio reads fresh values without
  // re-creating the callback each render.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const initAudio = useCallback(async (): Promise<void> => {
    if (isAudioReady || initializingRef.current) return;
    initializingRef.current = true;
    setIsAudioLoading(true);
    try {
      const opts = optionsRef.current;

      // Configure AudioContext BEFORE start for minimum latency.
      const ctx = Tone.getContext();
      const isUltra = opts.latencyMode === "ultra";
      ctx.lookAhead = isUltra ? 0 : 0.04;
      // @ts-expect-error updateInterval exists at runtime
      ctx.updateInterval = isUltra ? 0.01 : 0.025;

      await Tone.start();

      // Effects chain: vol → chorus → reverb → compressor → limiter → out
      const limiter = new Tone.Limiter(-2).toDestination();
      const compressor = new Tone.Compressor({
        threshold: -18,
        ratio: 5,
        attack: 0.003,
        release: 0.1,
        knee: 6,
      }).connect(limiter);
      const reverb = new Tone.Reverb({
        decay: opts.reverbDecay,
        wet: 0.18,
      }).connect(compressor);
      await reverb.generate();
      const chorus = new Tone.Chorus(4, 2.5, 0.5).connect(reverb);
      chorus.wet.value = Math.max(0, Math.min(1, opts.chorusDepth));
      chorus.start();
      const vol = new Tone.Volume(opts.masterVolume).connect(chorus);

      // Metronome path — independent of the master vol so its level is
      // unaffected by user volume tweaks.
      const metronomeVol = new Tone.Volume(-6).connect(limiter);
      const metronome = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
        harmonicity: 5.1,
        modulationIndex: 16,
        resonance: 4000,
        octaves: 1.5,
      }).connect(metronomeVol);
      metronome.frequency.value = 1000;
      metronome.volume.value = -6;

      // Wire refs
      reverbRef.current = reverb;
      chorusRef.current = chorus;
      volNodeRef.current = vol;
      compressorRef.current = compressor;
      limiterRef.current = limiter;
      metronomeRef.current = metronome;
      metronomeVolRef.current = metronomeVol;
      fallbackSynthsRef.current = {};
      engineRegistryRef.current = new InstrumentEngineRegistry(vol);
      gmDestRef.current = vol;

      setIsAudioReady(true);
      setAudioStatusMessage("Cargando piano real... (sintetizador activo)");

      // Load Salamander asynchronously. Resolve regardless of outcome so the
      // caller can proceed; sampler-active state reflects success.
      await new Promise<void>((resolve) => {
        const sampler = new Tone.Sampler({
          urls: salamanderSamples,
          baseUrl: "https://tonejs.github.io/audio/salamander/",
          release: opts.sustainTime,
          onload: () => {
            setIsSamplerActive(true);
            setAudioStatusMessage("Piano realista activo");
            resolve();
          },
          onerror: () => {
            setAudioStatusMessage("Sintetizador FM activo");
            resolve();
          },
        }).connect(vol);
        samplerRef.current = sampler;
      });
    } finally {
      initializingRef.current = false;
      setIsAudioLoading(false);
    }
  }, [isAudioReady]);

  const disposeAudio = useCallback((): void => {
    try {
      samplerRef.current?.dispose();
      const synths = fallbackSynthsRef.current;
      if (synths) {
        Object.values(synths).forEach((s) => s.dispose());
      }
      reverbRef.current?.dispose();
      chorusRef.current?.dispose();
      compressorRef.current?.dispose();
      limiterRef.current?.dispose();
      volNodeRef.current?.dispose();
      metronomeRef.current?.dispose();
      metronomeVolRef.current?.dispose();
      engineRegistryRef.current?.disposeAll();
      disposeAllGMSamplers();
    } catch {
      // Disposal is best-effort — never throw from cleanup.
    }
    samplerRef.current = null;
    fallbackSynthsRef.current = null;
    reverbRef.current = null;
    chorusRef.current = null;
    compressorRef.current = null;
    limiterRef.current = null;
    volNodeRef.current = null;
    metronomeRef.current = null;
    metronomeVolRef.current = null;
    engineRegistryRef.current = null;
    gmDestRef.current = null;
    setIsAudioReady(false);
    setIsSamplerActive(false);
    setAudioStatusMessage("Esperando activación");
  }, []);

  // ─── Reactive parameter sync ─────────────────────────────────
  // Only push to nodes once the chain exists.

  useEffect(() => {
    if (!isAudioReady) return;
    setMasterVolume(volNodeRef.current, options.masterVolume);
  }, [options.masterVolume, isAudioReady]);

  useEffect(() => {
    if (!isAudioReady) return;
    setReverbDecay(reverbRef.current, options.reverbDecay);
  }, [options.reverbDecay, isAudioReady]);

  useEffect(() => {
    if (!isAudioReady) return;
    setChorusDepth(chorusRef.current, options.chorusDepth);
  }, [options.chorusDepth, isAudioReady]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => disposeAudio();
  }, [disposeAudio]);

  return {
    isAudioReady,
    isSamplerActive,
    isAudioLoading,
    audioStatusMessage,
    samplerRef,
    fallbackSynthsRef,
    reverbRef,
    chorusRef,
    volNodeRef,
    compressorRef,
    metronomeRef,
    metronomeVolRef,
    engineRegistryRef,
    gmDestRef,
    initAudio,
    disposeAudio,
  };
}
