/**
 * One audible Studio tab per origin. BroadcastChannel asks the current tab to
 * silence its voices before announcing release; Web Locks add arbitration when
 * the browser shares them across tabs. The channel and lock names retain their
 * previous values so already-open tabs can still negotiate the hand-off.
 */

const LOCK_NAME = "piano-midi-pro:audio";
const CHANNEL_NAME = "piano-midi-pro:audio-owner";
export const LIVE_STUDIO_AUDIO_OWNER = "studio-live";

export type AudioLockState = {
  /** `true` cuando otra pestaña tiene el audio y ésta no puede sonar. */
  heldElsewhere: boolean;
  /** `true` cuando ESTA pestaña es la dueña del audio. */
  owns: boolean;
};

type Listener = (state: AudioLockState) => void;

let channel: BroadcastChannel | null = null;
let release: (() => void) | null = null;
let pendingClaim: Promise<boolean> | null = null;
let owns = false;
let heldElsewhere = false;
const listeners = new Set<Listener>();
const localOwners = new Set<string>();
const additionalYieldHandlers = new Set<AudioYieldHandler>();
let yielding = false;

/** Identificador de esta pestaña, sólo para no confundirnos con nosotros mismos. */
const TAB_ID =
  globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`;

function snapshot(): AudioLockState {
  return { heldElsewhere, owns };
}

function emit(): void {
  const state = snapshot();
  for (const listener of listeners) listener(state);
}

function setState(next: Partial<AudioLockState>): void {
  let changed = false;
  if (next.owns !== undefined && next.owns !== owns) {
    owns = next.owns;
    changed = true;
  }
  if (next.heldElsewhere !== undefined && next.heldElsewhere !== heldElsewhere) {
    heldElsewhere = next.heldElsewhere;
    changed = true;
  }
  if (changed) emit();
}

function ensureChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === "undefined") return null;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; from?: string } | null;
    if (!data || data.from === TAB_ID) return;

    if (data.type === "claim") {
      // El motor de Studio silencia todas sus voces antes de anunciar release.
      // La pestaña nueva espera ese aviso para evitar audio simultáneo.
      yielding = true;
      localOwners.clear();
      setState({ owns: false, heldElsewhere: true });
      void (async () => {
        await Promise.allSettled(
          [...additionalYieldHandlers].map((handler) => Promise.resolve().then(handler)),
        );
        await releaseLock();
        yielding = false;
        announce();
      })();
    }

    if (data.type === "release") {
      // La dueña soltó (y, con el orden de arriba, ya se calló): se puede tomar.
      setState({ heldElsewhere: false });
      pendingYield?.();
    }
  };
  return channel;
}

/** El motor debe silenciarse antes de que esta pestaña anuncie release. */
export type AudioYieldHandler = () => void | Promise<void>;

/** Registra el apagado de voces del Studio ante el traspaso entre pestañas. */
export function subscribeAudioYield(handler: AudioYieldHandler): () => void {
  additionalYieldHandlers.add(handler);
  return () => additionalYieldHandlers.delete(handler);
}

/** Resolución pendiente del traspaso: la otra pestaña avisó que ya se calló. */
let pendingYield: (() => void) | null = null;

/** Espera a que la otra pestaña avise `release`. `false` si no llegó a tiempo. */
function waitForYield(timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (yielded: boolean): void => {
      if (settled) return;
      settled = true;
      pendingYield = null;
      resolve(yielded);
    };
    pendingYield = () => finish(true);
    setTimeout(() => finish(false), timeoutMs);
  });
}

/** Avisa a las demás pestañas de quién tiene el audio ahora. */
function announce(): void {
  const ch = ensureChannel();
  if (!ch) return;
  ch.postMessage({ type: owns ? "claim" : "release", from: TAB_ID, at: Date.now() });
}

function releaseLock(): Promise<void> {
  const fn = release;
  release = null;
  if (!fn) return Promise.resolve();
  try {
    fn();
  } catch {
    /* el lock ya se había liberado */
  }
  return Promise.resolve();
}

/** Puede pedirse el lock en este navegador. */
export function supportsAudioLock(): boolean {
  return typeof navigator !== "undefined" && "locks" in navigator;
}

/**
 * Intenta quedarse con el audio, SIN esperar.
 *
 * @returns `true` si esta pestaña puede reproducir, `false` si otra lo tiene.
 */
export async function claimAudio(owner = LIVE_STUDIO_AUDIO_OWNER): Promise<boolean> {
  ensureChannel();

  if (!supportsAudioLock()) {
    // Sin Web Locks el canal es todo lo que hay: se avisa y se asume que se puede.
    // Es más débil ante una carrera, pero deja el comportamiento correcto en el
    // caso normal (una pestaña ya sonando).
    if (owns) {
      localOwners.add(owner);
      return true;
    }
    if (heldElsewhere) return false;
    localOwners.add(owner);
    setState({ owns: true, heldElsewhere: false });
    announce();
    return true;
  }

  // Si ya era la dueña, no hay nada que hacer.
  if (owns && release) {
    localOwners.add(owner);
    return true;
  }

  // Two engines in this tab may request the device in the same tick. They
  // must share one lock request; a second ifAvailable request would falsely
  // report that the *other tab* owns the lock.
  if (pendingClaim) {
    const granted = await pendingClaim;
    if (granted) localOwners.add(owner);
    return granted;
  }

  const request = new Promise<boolean>((resolve) => {
    let settled = false;
    void navigator.locks
      .request(LOCK_NAME, { mode: "exclusive", ifAvailable: true }, (lock) => {
        if (!lock) {
          // Otra pestaña lo tiene.
          setState({ owns: false, heldElsewhere: true });
          settled = true;
          resolve(false);
          return undefined;
        }

        // Se lo queda hasta que se libere explícitamente. El lock se libera solo
        // si la pestaña se cierra, así que no puede quedar pegado para siempre.
        localOwners.add(owner);
        setState({ owns: true, heldElsewhere: false });
        announce();
        settled = true;
        resolve(true);

        return new Promise<void>((releaseTheLock) => {
          release = releaseTheLock;
        });
      })
      .catch(() => {
        // Si falla Web Locks, BroadcastChannel aún coordina la pestaña activa.
        if (!settled) {
          localOwners.add(owner);
          setState({ owns: true, heldElsewhere: false });
          resolve(true);
        }
      });
  });
  pendingClaim = request.finally(() => {
    pendingClaim = null;
  });
  return pendingClaim;
}

/**
 * Suelta el audio para que otra pestaña pueda tomarlo.
 *
 * Se llama cuando el Studio deja de emitir voces para ceder el dispositivo.
 */
export function releaseAudio(owner = LIVE_STUDIO_AUDIO_OWNER): void {
  localOwners.delete(owner);
  if (yielding || localOwners.size > 0) return;
  if (!owns && !release) return;
  setState({ owns: false, heldElsewhere: false });
  void releaseLock();
  announce();
}

/**
 * Toma el audio a la fuerza, pausando a la que lo tuviera.
 *
 * Espera el release de la pestaña activa, con tope de 3 s si ésta se cierra
 * o deja de responder. El aviso llega después de silenciar sus voces.
 *
 * @returns `true` si esta pestaña se quedó con el audio.
 */
export async function takeAudioOver(owner = LIVE_STUDIO_AUDIO_OWNER): Promise<boolean> {
  // Si nadie lo tiene, no hay nada que negociar (y no se espera de más).
  if (await claimAudio(owner)) return true;

  setState({ owns: false, heldElsewhere: false });

  const ch = ensureChannel();
  const yielded = waitForYield(3000);
  ch?.postMessage({ type: "claim", from: TAB_ID, at: Date.now() });
  await yielded;

  // Recién ahora se suelta lo propio y se pide el audio: la otra pestaña ya avisó
  // que se calló (o se agotó el tope, y entonces decide el lock).
  await releaseLock();
  const granted = await claimAudio(owner);
  setState({ heldElsewhere: !granted });
  return granted;
}

/** El estado actual, para leerlo fuera de React. */
export function audioLockState(): AudioLockState {
  return snapshot();
}

/** Se suscribe a los cambios. Devuelve la función para desuscribirse. */
export function subscribeAudioLock(listener: Listener): () => void {
  ensureChannel();
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

/** Sólo para las pruebas: suelta todo y cierra el canal. */
export function resetAudioLockForTests(): void {
  void releaseLock();
  owns = false;
  heldElsewhere = false;
  channel?.close();
  channel = null;
  listeners.clear();
  localOwners.clear();
  additionalYieldHandlers.clear();
  yielding = false;
  pendingClaim = null;
}

