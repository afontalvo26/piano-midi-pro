import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import { transportService } from "../services/transportService";
import { useLocalStorageState } from "../utils/settings";

export interface UseTransportOptions {
  duration: number;
  onComplete?: () => void;
  onTick?: (currentTime: number) => void;
}

export interface UseTransportApi {
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  play: (offsetSec?: number) => void;
  pause: () => void;
  stop: () => void;
  seek: (sec: number) => void;
  toggle: () => void;
}

/**
 * React wrapper around transportService (Tone.Transport) that exposes
 * play/pause/stop/seek state plus an rAF-driven currentTime.
 */
export function useTransport(options: UseTransportOptions): UseTransportApi {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRateState] = useLocalStorageState<number>(
    "piano_playback_rate",
    1,
  );
  const rafRef = useRef<number | null>(null);
  const onCompleteRef = useRef(options.onComplete);
  const onTickRef = useRef(options.onTick);
  const durationRef = useRef(options.duration);

  useEffect(() => {
    onCompleteRef.current = options.onComplete;
  }, [options.onComplete]);
  useEffect(() => {
    onTickRef.current = options.onTick;
  }, [options.onTick]);
  useEffect(() => {
    durationRef.current = options.duration;
  }, [options.duration]);

  // rAF loop: poll transport position while playing.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = () => {
      const pos = transportService.getPosition();
      setCurrentTime(pos);
      onTickRef.current?.(pos);
      const dur = durationRef.current;
      if (dur > 0 && pos >= dur) {
        setIsPlaying(false);
        transportService.stop();
        setCurrentTime(0);
        onCompleteRef.current?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying]);

  const play = useCallback((offsetSec?: number) => {
    transportService.start(offsetSec);
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    transportService.pause();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    transportService.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const seek = useCallback((sec: number) => {
    transportService.seek(sec);
    setCurrentTime(sec);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play(currentTime);
  }, [isPlaying, currentTime, play, pause]);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      setPlaybackRateState(rate);
      Tone.getTransport().bpm.rampTo(120 * rate, 0.05);
    },
    [setPlaybackRateState],
  );

  return {
    isPlaying,
    currentTime,
    playbackRate,
    setPlaybackRate,
    play,
    pause,
    stop,
    seek,
    toggle,
  };
}
