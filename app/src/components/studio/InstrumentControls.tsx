// ============================================================
// InstrumentControls — Per-instrument real-time controls
// Piano: pedals (sustain/sostenuto/una-corda), half-pedal, arpeggio
// Trumpet: mute selector, tonguing, vibrato, falls/doits
// ============================================================

import { useState } from 'react';
import type { BrassMuteType, TrumpetTonguing } from '../../engine/InstrumentEngine';

// ---- Piano Controls ----

interface PianoControlsProps {
  sustainDown: boolean;
  sostenutoDown: boolean;
  unaChordaDown: boolean;
  halfPedalLevel: number;
  onSustainChange: (down: boolean) => void;
  onSostenutoChange: (down: boolean) => void;
  onUnaChordaChange: (down: boolean) => void;
  onHalfPedalChange: (level: number) => void;
}

export function PianoControls({
  sustainDown, sostenutoDown, unaChordaDown, halfPedalLevel,
  onSustainChange, onSostenutoChange, onUnaChordaChange, onHalfPedalChange,
}: PianoControlsProps) {
  return (
    <div className="instrument-controls piano-controls">
      <div className="ic-header">
        <span className="ic-icon">🎹</span>
        <span className="ic-title">Piano</span>
      </div>

      {/* Three pedals */}
      <div className="ic-pedals">
        <button
          className={`ic-pedal ${unaChordaDown ? 'ic-pedal--active' : ''}`}
          onMouseDown={() => onUnaChordaChange(true)}
          onMouseUp={() => onUnaChordaChange(false)}
          onMouseLeave={() => { if (unaChordaDown) onUnaChordaChange(false); }}
          title="Una corda — suaviza y oscurece el timbre"
        >
          <span className="ic-pedal-symbol">⬤</span>
          <span className="ic-pedal-label">Una Corda</span>
          <span className="ic-pedal-sub">Izquierdo</span>
        </button>

        <button
          className={`ic-pedal ${sostenutoDown ? 'ic-pedal--active ic-pedal--sostenuto' : ''}`}
          onMouseDown={() => onSostenutoChange(true)}
          onMouseUp={() => onSostenutoChange(false)}
          onMouseLeave={() => { if (sostenutoDown) onSostenutoChange(false); }}
          title="Sostenuto — mantiene solo notas activas al pisarlo"
        >
          <span className="ic-pedal-symbol">⬤</span>
          <span className="ic-pedal-label">Sostenuto</span>
          <span className="ic-pedal-sub">Centro</span>
        </button>

        <button
          className={`ic-pedal ${sustainDown ? 'ic-pedal--active ic-pedal--sustain' : ''}`}
          onMouseDown={() => onSustainChange(true)}
          onMouseUp={() => onSustainChange(false)}
          onMouseLeave={() => { if (sustainDown) onSustainChange(false); }}
          title="Sustain — resonancia de todas las cuerdas"
        >
          <span className="ic-pedal-symbol">⬤</span>
          <span className="ic-pedal-label">Sustain</span>
          <span className="ic-pedal-sub">Derecho</span>
        </button>
      </div>

      {/* Half-pedal */}
      <div className="ic-row">
        <label className="ic-label">
          Half-Pedal
          <span className="ic-value">{Math.round(halfPedalLevel * 100)}%</span>
        </label>
        <input
          type="range" min={0} max={1} step={0.01}
          value={halfPedalLevel}
          onChange={e => onHalfPedalChange(parseFloat(e.target.value))}
          className="ic-slider"
          title="Half-pedaling — blur armónico controlado"
          aria-label="Half-pedaling — blur armónico controlado"
        />
        <div className="ic-half-pedal-hints">
          <span>Silencio</span><span>Blur</span><span>Full</span>
        </div>
      </div>

      {/* Keyboard shortcuts reminder */}
      <div className="ic-shortcuts">
        <div className="ic-shortcut-item">
          <kbd>Espacio</kbd> <span>Sustain</span>
        </div>
        <div className="ic-shortcut-item">
          <kbd>Shift</kbd> <span>Sostenuto</span>
        </div>
        <div className="ic-shortcut-item">
          <kbd>Ctrl</kbd> <span>Una Corda</span>
        </div>
      </div>
    </div>
  );
}

// ---- Trumpet Controls ----

interface TrumpetControlsProps {
  mute: BrassMuteType;
  tonguing: TrumpetTonguing;
  vibratoDepth: number;
  vibratoRate: number;
  vibratoDelay: number;
  fallEnabled: boolean;
  doitEnabled: boolean;
  shakeEnabled: boolean;
  onMuteChange: (mute: BrassMuteType) => void;
  onTonguingChange: (t: TrumpetTonguing) => void;
  onVibratoChange: (depth: number, rate: number, delay: number) => void;
  onFallChange: (v: boolean) => void;
  onDoitChange: (v: boolean) => void;
  onShakeChange: (v: boolean) => void;
}

const MUTE_OPTIONS: { value: BrassMuteType; label: string; desc: string }[] = [
  { value: 'none',         label: 'Abierta',      desc: 'Sin sordina' },
  { value: 'straight',     label: 'Straight',     desc: 'Nasal, brillante' },
  { value: 'cup',          label: 'Cup',          desc: 'Oscura, redonda' },
  { value: 'harmon',       label: 'Harmon',       desc: 'Wah, Miles Davis' },
  { value: 'harmon-open',  label: 'Harmon Open',  desc: 'Harmon abierto' },
  { value: 'plunger',      label: 'Plunger',      desc: 'Wah manual' },
  { value: 'bucket',       label: 'Bucket',       desc: 'Muy oscura, suave' },
];

const TONGUING_OPTIONS: { value: TrumpetTonguing; label: string; desc: string }[] = [
  { value: 'single',  label: 'Simple',        desc: 'ta/da — default' },
  { value: 'double',  label: 'Doble',         desc: 'ta-ka — rápido' },
  { value: 'triple',  label: 'Triple',        desc: 'ta-ta-ka — tríos' },
  { value: 'flutter', label: 'Flutter',       desc: 'rrr — trémolo timbre' },
  { value: 'slur',    label: 'Ligado',        desc: 'Sin lengua' },
  { value: 'legato',  label: 'Legato',        desc: 'Lengua suave' },
];

export function TrumpetControls({
  mute, tonguing, vibratoDepth, vibratoRate, vibratoDelay,
  fallEnabled, doitEnabled, shakeEnabled,
  onMuteChange, onTonguingChange, onVibratoChange,
  onFallChange, onDoitChange, onShakeChange,
}: TrumpetControlsProps) {
  const [vibratoExpanded, setVibratoExpanded] = useState(false);

  return (
    <div className="instrument-controls trumpet-controls">
      <div className="ic-header">
        <span className="ic-icon">🎺</span>
        <span className="ic-title">Trompeta</span>
      </div>

      {/* Mute selector */}
      <div className="ic-section">
        <div className="ic-section-label">Sordina</div>
        <div className="ic-mute-grid">
          {MUTE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`ic-mute-btn ${mute === opt.value ? 'ic-mute-btn--active' : ''}`}
              onClick={() => onMuteChange(opt.value)}
              title={opt.desc}
            >
              <span className="ic-mute-label">{opt.label}</span>
              <span className="ic-mute-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tonguing */}
      <div className="ic-section">
        <div className="ic-section-label">Articulacion (Lengua)</div>
        <div className="ic-tongue-grid">
          {TONGUING_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`ic-tongue-btn ${tonguing === opt.value ? 'ic-tongue-btn--active' : ''}`}
              onClick={() => onTonguingChange(opt.value)}
              title={opt.desc}
            >
              <span>{opt.label}</span>
              <span className="ic-tongue-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Vibrato */}
      <div className="ic-section">
        <div
          className="ic-section-label ic-section-label--clickable"
          onClick={() => setVibratoExpanded(v => !v)}
        >
          Vibrato
          <span className="ic-section-badge">{vibratoDepth > 0 ? `${Math.round(vibratoDepth)}c` : 'OFF'}</span>
          <span>{vibratoExpanded ? '▲' : '▼'}</span>
        </div>
        {vibratoExpanded && (
          <div className="ic-vibrato-controls">
            <div className="ic-row">
              <label className="ic-label">
                Profundidad
                <span className="ic-value">{Math.round(vibratoDepth)} cents</span>
              </label>
              <input type="range" min={0} max={100} step={1}
                value={vibratoDepth}
                onChange={e => onVibratoChange(parseInt(e.target.value), vibratoRate, vibratoDelay)}
                className="ic-slider"
              />
            </div>
            <div className="ic-row">
              <label className="ic-label">
                Velocidad
                <span className="ic-value">{vibratoRate.toFixed(1)} Hz</span>
              </label>
              <input type="range" min={4} max={9} step={0.1}
                value={vibratoRate}
                onChange={e => onVibratoChange(vibratoDepth, parseFloat(e.target.value), vibratoDelay)}
                className="ic-slider"
              />
            </div>
            <div className="ic-row">
              <label className="ic-label">
                Retraso
                <span className="ic-value">{(vibratoDelay * 1000).toFixed(0)} ms</span>
              </label>
              <input type="range" min={0} max={0.5} step={0.01}
                value={vibratoDelay}
                onChange={e => onVibratoChange(vibratoDepth, vibratoRate, parseFloat(e.target.value))}
                className="ic-slider"
              />
            </div>
          </div>
        )}
      </div>

      {/* Jazz effects: Fall, Doit, Shake */}
      <div className="ic-section">
        <div className="ic-section-label">Efectos Jazz</div>
        <div className="ic-effects-row">
          <button
            className={`ic-effect-btn ${fallEnabled ? 'ic-effect-btn--active' : ''}`}
            onClick={() => onFallChange(!fallEnabled)}
            title="Fall — el pitch baja al terminar la nota"
          >
            <span>Fall ↘</span>
          </button>
          <button
            className={`ic-effect-btn ${doitEnabled ? 'ic-effect-btn--active' : ''}`}
            onClick={() => onDoitChange(!doitEnabled)}
            title="Doit — el pitch sube al terminar la nota"
          >
            <span>Doit ↗</span>
          </button>
          <button
            className={`ic-effect-btn ${shakeEnabled ? 'ic-effect-btn--active' : ''}`}
            onClick={() => onShakeChange(!shakeEnabled)}
            title="Shake — oscilación rápida entre dos notas"
          >
            <span>Shake ≋</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Combined panel ----

interface InstrumentControlsPanelProps {
  activeInstrument: string;
  // Piano
  pianoPedalSustain: boolean;
  pianoPedalSostenuto: boolean;
  pianoPedalUnaCorda: boolean;
  pianoHalfPedal: number;
  onPianoSustain: (v: boolean) => void;
  onPianoSostenuto: (v: boolean) => void;
  onPianoUnaCorda: (v: boolean) => void;
  onPianoHalfPedal: (v: number) => void;
  // Trumpet
  trumpetMute: BrassMuteType;
  trumpetTonguing: TrumpetTonguing;
  trumpetVibratoDepth: number;
  trumpetVibratoRate: number;
  trumpetVibratoDelay: number;
  trumpetFall: boolean;
  trumpetDoit: boolean;
  trumpetShake: boolean;
  onTrumpetMute: (v: BrassMuteType) => void;
  onTrumpetTonguing: (v: TrumpetTonguing) => void;
  onTrumpetVibrato: (depth: number, rate: number, delay: number) => void;
  onTrumpetFall: (v: boolean) => void;
  onTrumpetDoit: (v: boolean) => void;
  onTrumpetShake: (v: boolean) => void;
}

export function InstrumentControlsPanel(props: InstrumentControlsPanelProps) {
  const lowerInstrument = props.activeInstrument.toLowerCase();
  const isPiano = lowerInstrument.includes('piano') || lowerInstrument.includes('harpsichord');
  const isTrumpet = lowerInstrument.includes('trumpet') || lowerInstrument.includes('trompeta');

  if (!isPiano && !isTrumpet) {
    return (
      <div className="instrument-controls instrument-controls--generic">
        <div className="ic-header">
          <span className="ic-icon">🎵</span>
          <span className="ic-title">{props.activeInstrument}</span>
        </div>
        <p className="ic-generic-msg">Controles avanzados disponibles para Piano y Trompeta</p>
      </div>
    );
  }

  return (
    <>
      {isPiano && (
        <PianoControls
          sustainDown={props.pianoPedalSustain}
          sostenutoDown={props.pianoPedalSostenuto}
          unaChordaDown={props.pianoPedalUnaCorda}
          halfPedalLevel={props.pianoHalfPedal}
          onSustainChange={props.onPianoSustain}
          onSostenutoChange={props.onPianoSostenuto}
          onUnaChordaChange={props.onPianoUnaCorda}
          onHalfPedalChange={props.onPianoHalfPedal}
        />
      )}
      {isTrumpet && (
        <TrumpetControls
          mute={props.trumpetMute}
          tonguing={props.trumpetTonguing}
          vibratoDepth={props.trumpetVibratoDepth}
          vibratoRate={props.trumpetVibratoRate}
          vibratoDelay={props.trumpetVibratoDelay}
          fallEnabled={props.trumpetFall}
          doitEnabled={props.trumpetDoit}
          shakeEnabled={props.trumpetShake}
          onMuteChange={props.onTrumpetMute}
          onTonguingChange={props.onTrumpetTonguing}
          onVibratoChange={props.onTrumpetVibrato}
          onFallChange={props.onTrumpetFall}
          onDoitChange={props.onTrumpetDoit}
          onShakeChange={props.onTrumpetShake}
        />
      )}
    </>
  );
}
