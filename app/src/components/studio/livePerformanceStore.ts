export interface LiveStrike {
  source: "midi" | "keyboard" | "mouse";
  inputName: string;
  physicalNote: number;
  playedNote: number;
  rawVelocity: number;
  normalizedVelocity: number;
  gain: number;
  curveLabel: string;
}

export interface LivePerformanceSnapshot {
  readonly lastStrike: LiveStrike | null;
  readonly recentMidi: readonly LiveStrike[];
}

let snapshot: LivePerformanceSnapshot = { lastStrike: null, recentMidi: [] };
let notificationFrame = 0;
const subscribers = new Set<() => void>();

function notifySubscribers(): void {
  notificationFrame = 0;
  for (const subscriber of subscribers) subscriber();
}

function scheduleNotification(): void {
  if (notificationFrame !== 0 || subscribers.size === 0 || document.hidden) return;
  notificationFrame = requestAnimationFrame(notifySubscribers);
}

export function subscribeLivePerformance(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  if (subscribers.size === 1) document.addEventListener("visibilitychange", scheduleNotification);
  scheduleNotification();
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      document.removeEventListener("visibilitychange", scheduleNotification);
      if (notificationFrame !== 0) cancelAnimationFrame(notificationFrame);
      notificationFrame = 0;
    }
  };
}

export function publishLiveStrike(strike: LiveStrike): void {
  snapshot = {
    lastStrike: strike,
    recentMidi: strike.source === "midi" ? [...snapshot.recentMidi, strike].slice(-5) : snapshot.recentMidi,
  };
  scheduleNotification();
}

export function clearLiveStrikeHistory(): void {
  snapshot = { ...snapshot, recentMidi: [] };
  scheduleNotification();
}

export function getLivePerformanceSnapshot(): LivePerformanceSnapshot {
  return snapshot;
}
