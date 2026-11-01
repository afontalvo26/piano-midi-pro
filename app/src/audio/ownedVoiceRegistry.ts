/** Opaque token for one audible attack. Identity is by object, never pitch. */
const ownedVoiceBrand: unique symbol = Symbol("owned-voice");

export interface OwnedVoiceHandle {
  readonly [ownedVoiceBrand]: true;
}

export interface OwnedVoiceRegistration {
  ownerId: string;
  epoch: number;
  release: (audioTime: number, fadeSeconds: number) => void;
}

interface VoiceEntry extends OwnedVoiceRegistration {
  releasing: boolean;
  stopDeadline: number;
}

export interface OwnedVoiceCounts {
  ownerId: string;
  active: number;
  releasing: number;
}

export interface OwnedVoiceSnapshot {
  active: number;
  releasing: number;
  allocated: number;
  released: number;
  ended: number;
  releaseErrors: number;
  byOwner: OwnedVoiceCounts[];
}

function validAudioTime(audioTime: number): void {
  if (!Number.isFinite(audioTime) || audioTime < 0) {
    throw new RangeError("audioTime must be a non-negative finite number");
  }
}

function validFade(fadeSeconds: number): void {
  if (!Number.isFinite(fadeSeconds) || fadeSeconds < 0 || fadeSeconds > 10) {
    throw new RangeError("fadeSeconds must be between 0 and 10");
  }
}

/**
 * Tracks the lifetime of voices independently of their pitch and audio engine.
 * A released source stays allocated until its onended callback calls finish().
 */
export class OwnedVoiceRegistry {
  private readonly entries = new Map<OwnedVoiceHandle, VoiceEntry>();
  private activeCountValue = 0;
  private released = 0;
  private ended = 0;
  private releaseErrors = 0;

  register(registration: OwnedVoiceRegistration): OwnedVoiceHandle {
    if (!registration.ownerId || typeof registration.release !== "function" ||
        !Number.isSafeInteger(registration.epoch) || registration.epoch < 0) {
      throw new RangeError("voice needs an ownerId, non-negative epoch and release callback");
    }
    const handle: OwnedVoiceHandle = Object.freeze({ [ownedVoiceBrand]: true as const });
    this.entries.set(handle, { ...registration, releasing: false, stopDeadline: Infinity });
    this.activeCountValue++;
    return handle;
  }

  get activeCount(): number {
    return this.activeCountValue;
  }

  has(handle: OwnedVoiceHandle): boolean {
    return this.entries.has(handle);
  }

  ownerIdOf(handle: OwnedVoiceHandle): string | null {
    return this.entries.get(handle)?.ownerId ?? null;
  }

  isReleasing(handle: OwnedVoiceHandle): boolean {
    return this.entries.get(handle)?.releasing ?? false;
  }

  /** Marks a natural Note Off or voice steal; the sample may still be fading. */
  markReleasing(handle: OwnedVoiceHandle): boolean {
    const entry = this.entries.get(handle);
    if (!entry) return false;
    if (!entry.releasing) {
      entry.releasing = true;
      this.activeCountValue--;
      this.released++;
    }
    return true;
  }

  /** Force-release one handle. Repeating this may shorten an existing tail. */
  releaseHandle(handle: OwnedVoiceHandle, audioTime: number, fadeSeconds = 0.012): boolean {
    validAudioTime(audioTime);
    validFade(fadeSeconds);
    const entry = this.entries.get(handle);
    if (!entry) return false;
    const deadline = audioTime + fadeSeconds;
    if (deadline >= entry.stopDeadline) return true;
    try {
      entry.release(audioTime, fadeSeconds);
      // A failing callback has not silenced anything. Keep its prior state so
      // diagnostics and a later Stop can retry the same handle.
      this.markReleasing(handle);
      entry.stopDeadline = deadline;
    } catch {
      // One faulty voice must not prevent the rest of an owner from stopping.
      this.releaseErrors++;
      return false;
    }
    return true;
  }

  /** Exact owner by default; descendants are matched only at a '/' boundary. */
  releaseOwner(ownerId: string, audioTime: number, fadeSeconds = 0.012,
    includeDescendants = false): number {
    if (!ownerId) throw new RangeError("ownerId is required");
    validAudioTime(audioTime);
    validFade(fadeSeconds);
    let count = 0;
    for (const [handle, entry] of [...this.entries]) {
      if (entry.ownerId === ownerId || (includeDescendants && entry.ownerId.startsWith(`${ownerId}/`))) {
        if (this.releaseHandle(handle, audioTime, fadeSeconds)) count++;
      }
    }
    return count;
  }

  releaseEpoch(ownerId: string, epoch: number, audioTime: number, fadeSeconds = 0.012,
    includeDescendants = false): number {
    if (!ownerId || !Number.isSafeInteger(epoch) || epoch < 0) {
      throw new RangeError("releaseEpoch needs ownerId and non-negative epoch");
    }
    validAudioTime(audioTime);
    validFade(fadeSeconds);
    let count = 0;
    for (const [handle, entry] of [...this.entries]) {
      if (entry.epoch === epoch &&
          (entry.ownerId === ownerId || (includeDescendants && entry.ownerId.startsWith(`${ownerId}/`))) &&
          this.releaseHandle(handle, audioTime, fadeSeconds)) count++;
    }
    return count;
  }

  panic(audioTime: number, fadeSeconds = 0.012): number {
    validAudioTime(audioTime);
    validFade(fadeSeconds);
    let count = 0;
    for (const handle of [...this.entries.keys()]) {
      if (this.releaseHandle(handle, audioTime, fadeSeconds)) count++;
    }
    return count;
  }

  /** Called exactly when the underlying audio source actually ends. */
  finish(handle: OwnedVoiceHandle): boolean {
    const entry = this.entries.get(handle);
    if (!entry) return false;
    this.entries.delete(handle);
    if (!entry.releasing) this.activeCountValue--;
    this.ended++;
    return true;
  }

  snapshot(): OwnedVoiceSnapshot {
    const byOwner = new Map<string, OwnedVoiceCounts>();
    for (const entry of this.entries.values()) {
      const counts = byOwner.get(entry.ownerId) ?? { ownerId: entry.ownerId, active: 0, releasing: 0 };
      if (entry.releasing) counts.releasing++;
      else counts.active++;
      byOwner.set(entry.ownerId, counts);
    }
    return {
      active: this.activeCountValue,
      releasing: this.entries.size - this.activeCountValue,
      allocated: this.entries.size,
      released: this.released,
      ended: this.ended,
      releaseErrors: this.releaseErrors,
      byOwner: [...byOwner.values()].sort((a, b) => a.ownerId.localeCompare(b.ownerId)),
    };
  }
}
