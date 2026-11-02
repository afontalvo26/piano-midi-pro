import type { ProjectDocumentV1 } from "../../project/model.ts";

/** Resolve a one-based musical bar through explicit meter-map boundaries.
 * A meter point starts a new bar even when imported material contains a
 * non-grid-aligned change. This avoids pretending every bar stays 4/4. */
export function studioBarStartTick(
  meterMap: ProjectDocumentV1["meterMap"], barNumber: number,
): number {
  if (!Number.isSafeInteger(barNumber) || barNumber < 1 || barNumber > 1_000_000) {
    throw new RangeError("El número de compás debe estar entre 1 y 1000000");
  }
  if (!meterMap.length || meterMap[0]?.tick !== 0) {
    throw new RangeError("Compás del proyecto sin punto inicial válido");
  }
  let remaining = barNumber - 1;
  for (let index=0;index<meterMap.length;index++){
    const point=meterMap[index]!;
    const next=meterMap[index+1];
    const length=3840 * point.numerator / point.denominator;
    if(!Number.isSafeInteger(length) || length<1) throw new RangeError("Compás no representable en ticks");
    const barsAvailable=next ? Math.ceil((next.tick-point.tick)/length) : Infinity;
    if(remaining < barsAvailable){
      const tick=point.tick+remaining*length;
      if(!Number.isSafeInteger(tick))throw new RangeError("Posición musical fuera de rango");
      return tick;
    }
    remaining-=barsAvailable;
  }
  throw new RangeError("No se pudo resolver la posición musical");
}

/** Both ends are inclusive bar numbers in the UI; endTick is exclusive. */
export function studioLoopBarRange(
  meterMap: ProjectDocumentV1["meterMap"], firstBar: number, lastBar: number,
): {startTick:number;endTick:number}{
  if(!Number.isSafeInteger(firstBar)||!Number.isSafeInteger(lastBar)||
     firstBar<1||lastBar<firstBar||lastBar>999_999){
    throw new RangeError("El bucle requiere un inicio y un final de compás válidos");
  }
  return {startTick:studioBarStartTick(meterMap,firstBar),
    endTick:studioBarStartTick(meterMap,lastBar+1)};
}

/** One-based bar containing the given tick, including after meter changes. */
export function studioBarNumberAtTick(
  meterMap: ProjectDocumentV1["meterMap"], tick:number,
):number {
  if(!Number.isSafeInteger(tick)||tick<0)throw new RangeError("Tick musical inválido");
  let barsBefore=0;
  for(let index=0;index<meterMap.length;index++){
    const point=meterMap[index]!;
    const next=meterMap[index+1];
    const length=3840*point.numerator/point.denominator;
    if(next && tick>=next.tick){
      barsBefore+=Math.ceil((next.tick-point.tick)/length);
    }else{
      return barsBefore+Math.floor((tick-point.tick)/length)+1;
    }
  }
  throw new RangeError("Mapa de compases inválido");
}
