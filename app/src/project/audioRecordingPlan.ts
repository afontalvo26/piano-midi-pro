import type { ProjectAudioRecordingPlan, ProjectDocumentV1 } from "./model.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";

const MAX_SCHEDULE_SECONDS = 59.975;

/** Validates a transient plan against the active project clock and AudioInputSession's 60 s window. */
export function validateProjectAudioRecordingPlan(document: ProjectDocumentV1,
  plan: ProjectAudioRecordingPlan): void {
  if (!Number.isSafeInteger(plan.startTick) || plan.startTick < 0 ||
      !Number.isSafeInteger(plan.countInBars) || plan.countInBars < 0 || plan.countInBars > 4) {
    throw new RangeError("Inicio o count-in fuera del rango admitido");
  }
  const clock = new MusicalClock(document.tempoMap, document.meterMap);
  const meter = clock.meterAt(plan.startTick);
  const tempo = clock.tempoAt(plan.startTick);
  const countInSeconds = plan.countInBars * meter.numerator * 4 / meter.denominator *
    tempo.microsPerQuarter / 1_000_000;
  if (countInSeconds > MAX_SCHEDULE_SECONDS) {
    throw new RangeError("Count-in excede la ventana programable de 60 segundos");
  }
  if (plan.punch !== undefined) {
    if (!Number.isSafeInteger(plan.punch.startTick) ||
        !Number.isSafeInteger(plan.punch.endTick) ||
        plan.punch.startTick !== plan.startTick || plan.punch.endTick <= plan.startTick) {
      throw new RangeError("Punch requiere entrada igual al inicio y salida posterior");
    }
    const duration = clock.secondsBetween(plan.punch.startTick, plan.punch.endTick);
    if (countInSeconds + duration > MAX_SCHEDULE_SECONDS) {
      throw new RangeError("Count-in y punch exceden la ventana programable de 60 segundos");
    }
  }
}
