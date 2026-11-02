import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { ProjectDocumentV1, ProjectTrack } from "../../project/model";
import referenceGrandPiano from "./reference-grand-piano.svg";
import "./ReferenceStudio.css";

export type StudioWorkspace =
  | "performance" | "piano-roll" | "drums" | "arrangement" | "sampler"
  | "audio" | "mixer" | "automation" | "export";

type IconName =
  | "piano" | "play" | "pause" | "stop" | "back" | "forward" | "record"
  | "layers" | "sliders" | "library" | "export" | "edit" | "spark"
  | "folder" | "settings" | "chevron" | "metronome" | "wave"
  | "close" | "plus" | "maximize" | "music" | "heart" | "headphones"
  | "grid" | "scissors" | "select" | "volume" | "keyboard" | "save";

const paths: Record<IconName, string> = {
  piano: "M4 4h16v16H4z M9 4v16 M14 4v16 M19 4v16 M7 4v8h3V4 M12 4v8h3V4",
  play: "M8 5v14l11-7z",
  pause: "M7 5h3v14H7z M14 5h3v14h-3z",
  stop: "M6 6h12v12H6z",
  back: "M5 5v14 M18 6l-10 6 10 6z",
  forward: "M19 5v14 M6 6l10 6-10 6z",
  record: "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z",
  layers: "m12 3 9 5-9 5-9-5 9-5z M3 12l9 5 9-5 M3 16l9 5 9-5",
  sliders: "M5 3v18 M12 3v18 M19 3v18 M2 8h6 M9 15h6 M16 10h6",
  library: "M4 4h4v16H4z M10 4h4v16h-4z M17 4l3-1 3 17-4 1z",
  export: "M12 16V3 m-5 5 5-5 5 5 M4 12v8h16v-8",
  edit: "m4 17 1-5L17 0l5 5L10 17l-6 1z",
  spark: "M9 18h6 M10 21h4 M8 15c-2-2-3-4-3-7a7 7 0 0 1 14 0c0 3-1 5-3 7l-1 2H9z",
  folder: "M3 6h7l2 3h9v11H3z",
  settings: "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  chevron: "m6 9 6 6 6-6",
  metronome: "m12 3-7 18h14L12 3z M12 8l3 7 M10 17h4",
  wave: "M2 12h3l2-7 3 14 3-14 2 7h7",
  close: "M5 5l14 14 M19 5 5 19",
  plus: "M12 4v16 M4 12h16",
  maximize: "M8 3H3v5 M16 3h5v5 M21 16v5h-5 M3 16v5h5",
  music: "M9 18V5l12-2v13 M9 9l12-2 M7 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M19 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  heart: "M12 20S3 14 3 8c0-5 6-7 9-2 3-5 9-3 9 2 0 6-9 12-9 12z",
  headphones: "M4 14v-3a8 8 0 0 1 16 0v3 M4 14h4v7H4z M16 14h4v7h-4z",
  grid: "M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z",
  scissors: "M7 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M9 9l10 10 M9 18 19 8",
  select: "M4 3l15 9-7 1-3 7-5-17z",
  volume: "M3 9h5l5-5v16l-5-5H3z M17 9q4 3 0 6",
  keyboard: "M2 5h20v14H2z M7 5v8 M12 5v8 M17 5v8 M9 13v6 M14 13v6",
  save: "M4 3h14l3 3v15H3V3z M7 3v7h10V3 M7 21v-8h10v8",
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]} />
  </svg>;
}

const TRACK_COLORS = ["violet","green","cyan","purple"] as const;
const NAV: { id: StudioWorkspace | "library"; label: string; icon: IconName }[] = [
  { id: "performance", label: "Interpretar", icon: "play" },
  { id: "piano-roll", label: "Crear", icon: "edit" },
  { id: "arrangement", label: "Arreglo", icon: "layers" },
  { id: "mixer", label: "Mezcla", icon: "sliders" },
  { id: "export", label: "Exportar", icon: "export" },
  { id: "library", label: "Biblioteca", icon: "library" },
];

export interface ReferenceStudioProps {
  document: ProjectDocumentV1 | null;
  workspace: StudioWorkspace;
  activeTrackId?: string;
  saveStatus: string;
  transport: string;
  tick: number;
  bpm: string;
  metronome: boolean;
  recording: boolean;
  midiConnected: boolean;
  midiStatus: string;
  instrumentName: string;
  instrumentCategory: string;
  masterLevel?: { peak: number; rms: number; clipped: boolean };
  trackLevels?: Readonly<Record<string, { peak: number; rms: number; clipped: boolean }>>;
  editor: ReactNode;
  onWorkspace: (value: StudioWorkspace) => void;
  onLibrary: () => void;
  onProjects: () => void;
  onSettings: () => void;
  onNew: () => void;
  onPlay: () => void;
  onStop: () => void;
  onRecord: () => void;
  onMetronome: () => void;
  onTempoDraft: (value: string) => void;
  onTempoCommit: () => void;
  onTrackSelect: (track: ProjectTrack) => void;
  onOpenPattern: (trackId: string, patternId: string) => void;
  onTrackMix: (trackId: string, mix: ProjectTrack["mix"]) => void;
  onMasterGain: (gainDb: number) => void;
  onFullEditor: () => void;
  onFullMixer: () => void;
}

function Meter({ peak, tall = false }: { peak?: number; tall?: boolean }) {
  const level = Math.min(1, Math.max(0, peak ?? 0));
  return <div className={tall ? "ref-meter is-tall" : "ref-meter"} aria-label={
    peak === undefined ? "Medidor sin datos" : "Pico " + Math.round(level * 100) + "%"
  } aria-hidden="true">
    {Array.from({ length: tall ? 14 : 7 }, (_, i) =>
      <i key={i} className={level > i / (tall ? 14 : 7) ? "lit" : ""}/>)}
  </div>;
}

export function ReferenceStudio({
  document, workspace, activeTrackId, saveStatus, transport, tick, bpm,
  metronome, recording, midiConnected, midiStatus, instrumentName, instrumentCategory,
  masterLevel, trackLevels, editor, onWorkspace, onLibrary, onProjects, onSettings,
  onNew, onPlay, onStop, onRecord, onMetronome, onTempoDraft, onTempoCommit,
  onTrackSelect, onOpenPattern, onTrackMix, onMasterGain, onFullEditor, onFullMixer,
}: ReferenceStudioProps) {
  const [tool, setTool] = useState<"select" | "draw" | "cut">("select");
  const [inspector, setInspector] = useState<"instrument" | "inspect">("instrument");
  const [mixerOpen, setMixerOpen] = useState(true);
  const [loopOn, setLoopOn] = useState(false);
  const [macroValues, setMacroValues] = useState([72, 85, 28, 78]);
  const [channelDrafts, setChannelDrafts] = useState<Record<string, {pan?: number; gainDb?: number}>>({});
  const [masterDraft, setMasterDraft] = useState<number | null>(null);
  const [playingSelection, setPlayingSelection] = useState<string | null>(null);
  const tracks = useMemo(() => {
    if (!document) return [] as ProjectTrack[];
    return document.trackOrder.map((id) =>
      document.tracks.find((track) => track.id === id)).filter(
      (track): track is ProjectTrack => !!track && track.kind !== "bus");
  }, [document]);
  const meter = document?.meterMap[0];
  const ticksPerBar = 960 * 4 * (meter?.numerator ?? 4) / (meter?.denominator ?? 4);
  const bars = 16;
  const endTick = ticksPerBar * bars;
  const playheadPercent = Math.min(100, Math.max(0, tick / endTick * 100));
  const clockPosition = Math.floor(tick / ticksPerBar) + 1;
  const selectedTrack = tracks.find((track) => track.id === activeTrackId) ?? tracks[0];
  const panelTitle = selectedTrack?.name ?? instrumentName;
  const isPlaying = transport === "playing";
  const saveLabel = saveStatus === "clean" ? "Guardado" :
    saveStatus === "saving" ? "Guardando…" : saveStatus === "pending" ? "Por guardar" :
    saveStatus === "conflict" ? "Conflicto" : saveStatus === "error" ? "Error al guardar" : "Sin proyecto";
  function updateChannelDraft(id: string, field: "pan" | "gainDb", value: number) {
    setChannelDrafts((previous) => ({...previous, [id]: {...previous[id], [field]: value}}));
  }
  function commitChannelDraft(track: ProjectTrack, field: "pan" | "gainDb") {
    const draft = channelDrafts[track.id]?.[field];
    if (draft === undefined) return;
    setChannelDrafts((previous) => {
      const next = {...previous};
      const current = {...next[track.id]};
      delete current[field];
      if (Object.keys(current).length) next[track.id] = current;
      else delete next[track.id];
      return next;
    });
    if (Number.isFinite(draft) && draft !== track.mix[field]) {
      onTrackMix(track.id, {...track.mix, [field]: draft});
    }
  }
  function commitMasterDraft() {
    if (masterDraft === null) return;
    const value = masterDraft;
    setMasterDraft(null);
    if (Number.isFinite(value) && value !== (document?.mix.masterGainDb ?? 0)) onMasterGain(value);
  }


  return <div className="ref-studio" data-testid="reference-studio" data-tool={tool}>
    <header className="ref-topbar">
      <div className="ref-brand">
        <span className="ref-brand-icon" aria-hidden="true"><i/><i/><i/><i/></span>
        <span><strong>Piano MIDI Pro</strong><small>Beatmaker Studio</small></span>
      </div>
      <button className="ref-project-select" type="button" onClick={onProjects}
        title="Abrir y gestionar proyectos">
        <Icon name="folder" size={23}/>
        <span><strong>{document?.name ?? "Nuevo proyecto"}</strong>
          <small>{document ? "Proyecto · " + tracks.length + " pistas · compás " + clockPosition : "Crea tu primera sesión"}</small></span>
        <Icon name="chevron" size={15}/>
      </button>
      <div className={"ref-save-status " + (saveStatus === "error" ? "is-error" : "")}
        role="status"><Icon name="save" size={15}/>{saveLabel}</div>
      <div className="ref-transport" role="group" aria-label="Transporte">
        <button type="button" aria-label="Ir al inicio" onClick={onStop}><Icon name="back" size={18}/></button>
        <button type="button" aria-label="Detener" onClick={onStop}><Icon name="stop" size={17}/></button>
        <button type="button" className={isPlaying ? "ref-playing" : "ref-play"} aria-label={isPlaying ? "Pausar" : "Reproducir"}
          onClick={onPlay} disabled={!document}><Icon name={isPlaying ? "pause" : "play"} size={20}/></button>
        <button type="button" aria-label="Continuar o pausar" onClick={onPlay} disabled={!document}><Icon name="forward" size={18}/></button>
        <button type="button" className={"ref-record" + (recording ? " is-active" : "")}
          aria-label={recording ? "Detener grabación MIDI" : "Grabar MIDI"} aria-pressed={recording}
          onClick={onRecord}><Icon name="record" size={19}/></button>
      </div>
      <label className="ref-tempo">Tempo
        <input type="number" min={30} max={300} aria-label="Tempo del proyecto" value={bpm || "120"}
          onChange={(event) => onTempoDraft(event.target.value)} onBlur={onTempoCommit}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      </label>
      <button className={"ref-metronome" + (metronome ? " is-on" : "")} type="button"
        aria-pressed={metronome} onClick={onMetronome}>
        <Icon name="metronome" size={18}/><span> Metrónomo<strong>{metronome ? "ON" : "OFF"}</strong></span>
      </button>
      <div className="ref-signature"><small>Compás</small><strong>{meter?.numerator ?? 4} / {meter?.denominator ?? 4}</strong></div>
      <div className="ref-system-status"><small>CPU</small><strong>—</strong></div>
      <div className="ref-system-status"><span className="ref-state-dot"/><small>Latencia</small><strong>Sin medir</strong></div>
      <button className="ref-midi-summary" type="button" onClick={onSettings} title={midiStatus}>
        <span className={"ref-state-dot" + (midiConnected ? " is-online" : "")}/>
        <span>MIDI<small>{midiConnected ? midiStatus : "Sin conectar"}</small></span>
      </button>
      <button type="button" className="ref-top-icon" title="Configuración" aria-label="Configuración"
        onClick={onSettings}><Icon name="settings" size={21}/></button>
    </header>
    <aside className="ref-sidebar" aria-label="Navegación musical">
      <nav className="ref-nav" aria-label="Flujos de trabajo">
        {NAV.map((item) => <button type="button" key={item.id}
          className={workspace === item.id ? "is-current" : ""}
          aria-current={workspace === item.id ? "page" : undefined}
          onClick={() => item.id === "library" ? onLibrary() : onWorkspace(item.id)}>
          <Icon name={item.icon} size={24}/><span>{item.label}</span>
        </button>)}
      </nav>
      <div className="ref-quick-links">
        <p>ACCESO RÁPIDO</p>
        <button type="button" className="ref-quick-record" onClick={onRecord} aria-pressed={recording}>
          <span className="ref-record-dot"/> <span><strong>{recording ? "Detener toma" : "Grabar toma"}</strong>
          <small>Captura tu interpretación</small></span><Icon name="chevron" size={17}/>
        </button>
        <button type="button" onClick={onNew}><Icon name="spark" size={23}/>
          <span><strong>Nueva idea</strong><small>Boceto rápido en MIDI</small></span><Icon name="chevron" size={16}/>
        </button>
        <button type="button" className={"ref-device-card" + (midiConnected ? " is-online" : "")}
          onClick={onSettings}><Icon name="keyboard" size={24}/>
          <span><strong>{midiConnected ? "SMK-37 conectado" : "Conectar MIDI"}</strong>
          <small>Controlador MIDI</small></span><span className="ref-state-dot"/>
        </button>
      </div>
      <div className="ref-sidebar-decoration" aria-hidden="true"><i/><i/><i/></div>
      <div className="ref-sidebar-footer"><strong>UN SOLO FLUJO CREATIVO</strong>
        <span>Interpreta · Crea · Arregla · Mezcla · Exporta</span></div>
    </aside>
    <div className="ref-main-grid">
      <div className="ref-center-stack">
        <section className="ref-arrangement" aria-label="Arreglo del proyecto">
          <div className="ref-arrangement-toolbar">
            <div className="ref-segmented" role="group" aria-label="Vista musical">
              <button type="button" className="is-selected" aria-label="Vista arreglo" onClick={()=>onWorkspace("arrangement")}><Icon name="grid" size={18}/></button>
              <button type="button" aria-label="Ver batería" onClick={()=>onWorkspace("drums")}><Icon name="wave" size={18}/></button>
              <button type="button" aria-label="Ver mezclador" onClick={()=>onWorkspace("mixer")}><Icon name="sliders" size={18}/></button>
            </div>
            <div className="ref-loop-region">
              <button type="button" onClick={()=>setLoopOn(!loopOn)} aria-pressed={loopOn}>
                <Icon name="layers" size={16}/> Región de bucle</button>
              <button type="button" className={loopOn ? "is-selected" : ""} onClick={()=>setLoopOn(!loopOn)}>
                Compás 5 – 12 <Icon name="chevron" size={14}/></button>
            </div>
            <div className="ref-arrangement-tools" role="group" aria-label="Herramientas de edición">
              {(["select","draw","cut"] as const).map((value) =>
                <button type="button" key={value} className={tool === value ? "is-selected" : ""}
                  aria-label={value === "select" ? "Seleccionar" : value === "draw" ? "Dibujar" : "Cortar"}
                  aria-pressed={tool === value} onClick={()=>setTool(value)}>
                  <Icon name={value === "select" ? "select" : value === "draw" ? "edit" : "scissors"} size={17}/></button>)}
              <button type="button" title="Editor completo" aria-label="Editor de arreglo completo"
                onClick={()=>{onWorkspace("arrangement");onFullEditor();}}><Icon name="maximize" size={17}/></button>
            </div>
            <button type="button" className="ref-quantize" onClick={onFullEditor}>Cuantizar&nbsp; 1/16 <Icon name="chevron" size={13}/></button>
            <button type="button" className="ref-more" onClick={onFullEditor} aria-label="Más herramientas">···</button>
          </div>
          <div className="ref-arrange-canvas">
            <div className="ref-track-ruler">
              <div className="ref-ruler-label"/>
              <div className="ref-ruler-numbers">
                {Array.from({length:bars},(_,index)=><span key={index}>{index+1}</span>)}
                {loopOn && <div className="ref-loop-marker" style={{left:"25%",width:"50%"}} />}
                <div className="ref-playhead-triangle" style={{left:playheadPercent+"%"}}/>
              </div>
            </div>
            <div className="ref-track-scroll">
              {tracks.length===0 && <div className="ref-empty-arrangement">
                <strong>Tu próxima sesión empieza aquí</strong>
                <button type="button" onClick={onNew}>Crear un proyecto</button>
              </div>}
              {tracks.map((track,index)=>{
                const color=TRACK_COLORS[index%TRACK_COLORS.length];
                const clipList=document?.clips.filter((clip)=>clip.trackId===track.id)??[];
                const isActive=track.id===(selectedTrack?.id??"");
                return <div className={"ref-track-row"+(isActive?" is-active":"")} key={track.id}>
                  <div className="ref-track-info" onClick={()=>onTrackSelect(track)}>
                    <span className="ref-track-number">{index+1}</span>
                    <span className={"ref-track-icon is-"+color}><Icon name={track.kind==="drum"?"wave":track.kind==="instrument"?"piano":"music"} size={20}/></span>
                    <span className="ref-track-identity"><strong title={track.name}>{track.name}</strong>
                      <span className="ref-track-level"><i style={{width: Math.round(Math.min(1,trackLevels?.[track.id]?.peak??0)*100)+"%"}}/></span></span>
                    <span className="ref-track-toggles">
                      <button type="button" aria-pressed={track.mix.mute} title="Silenciar pista"
                        onClick={(event)=>{event.stopPropagation();onTrackMix(track.id,{...track.mix,mute:!track.mix.mute});}}>M</button>
                      <button type="button" aria-pressed={track.mix.solo} title="Pista en solo"
                        onClick={(event)=>{event.stopPropagation();onTrackMix(track.id,{...track.mix,solo:!track.mix.solo});}}>S</button>
                    </span>
                  </div>
                  <div className="ref-track-lane" onClick={()=>onTrackSelect(track)}>
                    {clipList.map(clip=>{
                      const pattern=clip.kind==="pattern"?document?.patterns.find(p=>p.id===clip.sourceId):null;
                      const left=Math.max(0,clip.startTick/endTick*100);
                      const width=Math.min(100-left,clip.lengthTicks/endTick*100);
                      if(width<=0)return null;
                      const notes=pattern?.notes.slice(0,75)??[];
                      return <button type="button" key={clip.id}
                        className={"ref-clip is-"+color+(clip.muted?" is-muted":"")}
                        style={{left:left+"%",width:width+"%"}}
                        title={pattern?.name??"Clip de audio"}
                        onClick={(event)=>{
                          event.stopPropagation();
                          onTrackSelect(track);
                          setPlayingSelection(clip.id);
                          if(clip.kind==="pattern")onOpenPattern(track.id,clip.sourceId);
                          else onWorkspace("arrangement");
                        }}
                        aria-pressed={playingSelection===clip.id}>
                        <span className="ref-clip-title"><Icon name={clip.kind==="audio"?"wave":"piano"} size={12}/>
                          {pattern?.name??(track.kind==="audio"?"Audio":"Clip")}</span>
                        {clip.kind==="audio"
                          ? <span className="ref-clip-wave" aria-hidden="true"/>
                          : <span className="ref-mini-notes" aria-hidden="true">
                            {notes.map((note,n)=> <i key={note.id||n} style={{
                              left:Math.max(0,Math.min(98,note.startTick/Math.max(pattern?.lengthTicks??1,1)*100))+"%",
                              width:Math.max(1.5,Math.min(35,note.durationTick/Math.max(pattern?.lengthTicks??1,1)*100))+"%",
                              top:Math.max(8,Math.min(85,(96-note.pitch)/72*100))+"%",
                            }}/>)}
                          </span>}
                      </button>;
                    })}
                  </div>
                </div>;
              })}
              <div className="ref-arrangement-playhead" style={{left:"calc(295px + (100% - 295px) * "+(playheadPercent/100)+")"}} aria-hidden="true"/>
            </div>
          </div>
        </section>
        <section className="ref-editor" aria-label="Editor musical">
          <div className="ref-editor-toolbar">
            <div className="ref-editor-tabs" role="group" aria-label="Editor">
              <button type="button" className={workspace==="piano-roll"?"is-selected":""}
                onClick={()=>onWorkspace("piano-roll")}><Icon name="piano" size={16}/> Piano Roll</button>
              <button type="button" className={workspace==="automation"?"is-selected":""}
                onClick={()=>onWorkspace("automation")}><Icon name="wave" size={16}/> Automatización</button>
              <button type="button" onClick={onFullEditor} title="Abrir herramientas completas">
                <Icon name="music" size={16}/> Partitura</button>
            </div>
            <div className="ref-editor-context">
              <span><Icon name="keyboard" size={15}/>{panelTitle}</span>
              <button type="button" title="Abrir el editor completo" aria-label="Editor completo" onClick={onFullEditor}><Icon name="maximize" size={17}/></button>
            </div>
          </div>
          <div className="ref-editor-slot">{editor}</div>
        </section>
      </div>
      <aside className="ref-inspector" aria-label="Instrumento e inspector">
        <div className="ref-inspector-tabs">
          <button type="button" className={inspector==="instrument"?"is-selected":""}
            onClick={()=>setInspector("instrument")}>Instrumento</button>
          <button type="button" className={inspector==="inspect"?"is-selected":""}
            onClick={()=>setInspector("inspect")}>Inspector</button>
        </div>
        {inspector==="instrument"?<>
          <button type="button" className="ref-instrument-card" onClick={onLibrary}
            title="Elegir instrumento">
            <span className="ref-instrument-title">
              <strong>{instrumentName}</strong><small>{instrumentCategory}</small>
            </span>
            <Icon name="heart" size={19}/>
            <img className="ref-grand-piano" src={referenceGrandPiano} alt="" />
            <span className="ref-instrument-tags"><span>✓ Activo</span><span>MIDI</span></span>
          </button>
          <div className="ref-macros">
            <h3>Controles del instrumento</h3>
            <div className="ref-macro-list">
              {["Brillo","Cuerpo","Reverb","Dinámica"].map((name,index)=>
                <label className="ref-macro" key={name} title="Control de interfaz: conexión al motor pendiente">
                  <input type="range" min={0} max={100} value={macroValues[index]} aria-label={name}
                    onChange={(event)=>setMacroValues(values=>values.map((v,i)=>i===index?Number(event.target.value):v))}/>
                  <span className="ref-knob" style={{"--dial-progress":(macroValues[index]/100*280)+"deg"} as CSSProperties}/>
                  <strong>{name}</strong><small>{macroValues[index]}%</small>
                </label>)}
            </div>
          </div>
        </>:<div className="ref-inspection-content">
          <h3>{panelTitle}</h3><p>Selecciona un clip, una pista o un instrumento para ver sus propiedades.</p>
          <button type="button" onClick={onFullEditor}>Abrir inspector completo</button>
        </div>}
        <div className="ref-midi-panel">
          <div className="ref-midi-title"><span className={"ref-state-dot"+(midiConnected?" is-online":"")}/>
            <strong>Entrada MIDI</strong><Icon name="chevron" size={16}/></div>
          <div className="ref-midi-inner">
            <span className="ref-midi-device-icon"><Icon name="keyboard" size={24}/></span>
            <span><strong>{midiConnected?midiStatus:"Sin entrada MIDI"}</strong><small>{midiConnected?"Notas en tiempo real":"Conecta tu controlador"}</small></span>
            <Meter peak={midiConnected?masterLevel?.peak:0}/>
          </div>
          <div className="ref-mini-keyboard" aria-hidden="true">
            {Array.from({length:21},(_,i)=><span key={i} className={i%7===1||i%7===2||i%7===4||i%7===5||i%7===6?"is-black":""}/>)}
          </div>
        </div>
      </aside>
      <section className={"ref-mixer"+(!mixerOpen?" is-collapsed":"")} aria-label="Mezcla rápida">
        <button className="ref-mixer-title" type="button" onClick={()=>setMixerOpen(!mixerOpen)}
          aria-expanded={mixerOpen}><Icon name="sliders" size={18}/> Mezcla <Icon name="chevron" size={15}/></button>
        {mixerOpen&&<div className="ref-mixer-channels">
          {tracks.slice(0,5).map((track,index)=>{
            const color=TRACK_COLORS[index%TRACK_COLORS.length];
            return <div className={"ref-channel is-"+color} key={track.id}>
              <button type="button" className="ref-channel-label" onClick={()=>onTrackSelect(track)}
                title={track.name}><Icon name={track.kind==="drum"?"wave":track.kind==="instrument"?"piano":"music"} size={19}/><strong>{track.name}</strong></button>
              <div className="ref-channel-controls">
                <label className="ref-pan"><span>Pan</span><input type="range" min="-1" max="1" step=".01"
                  value={channelDrafts[track.id]?.pan ?? track.mix.pan} aria-label={"Pan de "+track.name}
                  onChange={e=>updateChannelDraft(track.id,"pan",Number(e.target.value))}
                  onPointerUp={()=>commitChannelDraft(track,"pan")}
                  onKeyUp={()=>commitChannelDraft(track,"pan")}
                  onBlur={()=>commitChannelDraft(track,"pan")}/></label>
                <div className="ref-channel-fader">
                  <input type="range" min="-60" max="6" step=".1" aria-label={"Ganancia de "+track.name}
                    value={channelDrafts[track.id]?.gainDb ?? Math.max(-60,Math.min(6,track.mix.gainDb))}
                    onChange={e=>updateChannelDraft(track.id,"gainDb",Number(e.target.value))}
                    onPointerUp={()=>commitChannelDraft(track,"gainDb")}
                    onKeyUp={()=>commitChannelDraft(track,"gainDb")}
                    onBlur={()=>commitChannelDraft(track,"gainDb")}/>
                  <Meter peak={trackLevels?.[track.id]?.peak} tall/>
                </div>
              </div>
              <div className="ref-channel-foot">
                <span><button type="button" aria-label={"Silenciar "+track.name} aria-pressed={track.mix.mute}
                  onClick={()=>onTrackMix(track.id,{...track.mix,mute:!track.mix.mute})}>M</button>
                  <button type="button" aria-label={"Solo "+track.name} aria-pressed={track.mix.solo}
                    onClick={()=>onTrackMix(track.id,{...track.mix,solo:!track.mix.solo})}>S</button></span>
                <output>{track.mix.gainDb.toFixed(1)} dB</output>
              </div>
            </div>;
          })}
          <div className="ref-channel ref-master">
            <span className="ref-channel-label"><Icon name="volume" size={20}/><strong>Master</strong></span>
            <div className="ref-channel-controls">
              <div className="ref-channel-fader">
                <input type="range" min="-60" max="6" step=".1" aria-label="Ganancia master"
                  value={masterDraft ?? (document?.mix.masterGainDb ?? 0)}
                  onChange={(event)=>setMasterDraft(Number(event.target.value))}
                  onPointerUp={commitMasterDraft}
                  onKeyUp={commitMasterDraft}
                  onBlur={commitMasterDraft}/>
                <Meter peak={masterLevel?.peak} tall/>
              </div>
              <label className="ref-master-send" title="Abrir mezcla detallada">
                <button type="button" onClick={onFullMixer}><Icon name="sliders" size={19}/></button>
                <span>Reverb</span><small>Envíos</small>
              </label>
              <button className="ref-add-send" type="button" title="Añadir envío" onClick={onFullMixer}><Icon name="plus" size={17}/><span>Enviar</span></button>
            </div>
            <output>{(document?.mix.masterGainDb??0).toFixed(1)} dB</output>
          </div>
        </div>}
      </section>
    </div>
  </div>;
}
