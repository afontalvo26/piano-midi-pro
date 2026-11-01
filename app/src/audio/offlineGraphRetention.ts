/** Tone.Offline runs onended timers before native OfflineAudioContext.startRendering. */
const pending = new WeakMap<BaseAudioContext, Array<() => void>>();

interface GraphContext {
  readonly isOffline: boolean;
  readonly rawContext: BaseAudioContext;
}

/** Keep a finished source connected until its offline PCM has actually rendered. */
export function retainUntilOfflineRender(context: GraphContext, dispose: () => void): boolean {
  if (!context.isOffline) return false;
  const raw = context.rawContext;
  const callbacks = pending.get(raw) ?? [];
  callbacks.push(dispose);
  pending.set(raw, callbacks);
  return true;
}

/** Call only after Tone.Offline resolves or rejects and no render can use this graph. */
export function flushOfflineGraph(raw: BaseAudioContext): void {
  const callbacks = pending.get(raw);
  if (!callbacks) return;
  pending.delete(raw);
  for (const dispose of callbacks) dispose();
}
