import type {ProjectDocumentV1,ProjectTrack} from "./model.ts";

/** MIDI recording target: an explicitly armed instrument or drum track wins
 * over a stale editor selection. Multiple armed tracks require a selected one,
 * preventing silently writing a take to the wrong source. */
export function selectMidiRecordingTarget(
  document:ProjectDocumentV1|null,
  selectedTrackId:string|null,
):ProjectTrack|null {
  const eligible=document?.tracks.filter((track)=>
    track.kind==="instrument"||track.kind==="drum")??[];
  const selected=eligible.find((track)=>track.id===selectedTrackId);
  const armed=eligible.filter((track)=>track.mix.armed);
  if(armed.length>1){
    if(!selected?.mix.armed)
      throw new RangeError("Hay varias pistas MIDI armadas. Selecciona la pista destino antes de grabar");
    return selected;
  }
  if(armed.length===1)return armed[0]!;
  return selected??eligible[0]??null;
}
