// ============================================================
// PartMixer - Advanced multi-instrument mixer
// Volume, Pan, Mute, Solo, Visibility, Color per part
// ============================================================

import type { ScorePart } from '../../types/score';

interface PartMixerProps {
  parts: ScorePart[];
  onVolumeChange: (partId: string, volume: number) => void;
  onPanChange: (partId: string, pan: number) => void;
  onMuteToggle: (partId: string) => void;
  onSoloToggle: (partId: string) => void;
  onVisibilityToggle: (partId: string) => void;
  onInstrumentChange: (partId: string, instrument: string) => void;
  onColorChange: (partId: string, color: string) => void;
}

const INSTRUMENT_GROUPS: Record<string, string[]> = {
  'Teclados': [
    'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano',
    'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
    'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone', 'Marimba',
    'Xylophone', 'Tubular Bells', 'Drawbar Organ', 'Church Organ',
  ],
  'Cuerdas': [
    'Violin', 'Viola', 'Cello', 'Contrabass',
    'Pizzicato Strings', 'String Ensemble 1', 'String Ensemble 2',
    'Orchestral Harp',
  ],
  'Metales': [
    'Trumpet', 'Trombone', 'Tuba', 'French Horn', 'Brass Section',
    'Muted Trumpet', 'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
  ],
  'Maderas': [
    'Flute', 'Piccolo', 'Oboe', 'Clarinet', 'Bassoon', 'Recorder',
    'Pan Flute', 'English Horn',
  ],
  'Guitarras / Bajo': [
    'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)',
    'Electric Guitar (jazz)', 'Electric Guitar (clean)',
    'Distortion Guitar', 'Acoustic Bass', 'Electric Bass (finger)',
    'Electric Bass (pick)',
  ],
  'Voces / Coro': [
    'Choir Aahs', 'Voice Oohs', 'Synth Choir',
  ],
  'Percusion': [
    'Timpani', 'Percussion',
  ],
};

const PRESET_COLORS = [
  '#a78bfa', '#60a5fa', '#fb923c', '#34d399',
  '#f472b6', '#fbbf24', '#e879f9', '#38bdf8',
  '#4ade80', '#f87171', '#c084fc', '#2dd4bf',
];

function partTypeIcon(instrument: string): string {
  const lower = instrument.toLowerCase();
  if (lower.includes('piano') || lower.includes('organ') || lower.includes('harpsichord')) return '🎹';
  if (lower.includes('violin') || lower.includes('viola') || lower.includes('cello') || lower.includes('string')) return '🎻';
  if (lower.includes('trumpet') || lower.includes('trombone') || lower.includes('brass') || lower.includes('horn') || lower.includes('tuba')) return '🎺';
  if (lower.includes('flute') || lower.includes('oboe') || lower.includes('clarinet') || lower.includes('bassoon') || lower.includes('sax')) return '🎷';
  if (lower.includes('guitar') || lower.includes('bass')) return '🎸';
  if (lower.includes('drum') || lower.includes('percussion') || lower.includes('timpani')) return '🥁';
  if (lower.includes('harp')) return '🪕';
  if (lower.includes('choir') || lower.includes('voice')) return '🎤';
  return '🎵';
}

export function PartMixer({
  parts,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  onVisibilityToggle,
  onInstrumentChange,
  onColorChange,
}: PartMixerProps) {
  const hasSolo = parts.some(p => p.solo);

  return (
    <div className="part-mixer">
      <div className="part-mixer-header">
        <span className="part-mixer-title">Mixer de Instrumentos</span>
        <span className="part-mixer-count">{parts.length} parte{parts.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="part-mixer-channels">
        {parts.map(part => {
          const isEffectivelyMuted = part.muted || (hasSolo && !part.solo);
          return (
            <div
              key={part.id}
              className={`part-channel ${part.muted ? 'part-channel--muted' : ''} ${part.solo ? 'part-channel--solo' : ''}`}
            >
              {/* Color bar + instrument icon */}
              <div className="part-channel-header">
                <div
                  className="part-channel-color-bar"
                  style={{ backgroundColor: part.color }}
                />
                <div className="part-channel-title">
                  <span className="part-channel-icon">{partTypeIcon(part.instrument)}</span>
                  <div className="part-channel-names">
                    <span className="part-channel-name" title={part.name}>{part.name}</span>
                    <span className="part-channel-instrument">{part.instrument}</span>
                  </div>
                </div>
                <div className="part-channel-note-count">
                  {part.noteCount} notas
                </div>
              </div>

              {/* Volume slider */}
              <div className="part-channel-control">
                <label>Vol</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={part.volume}
                  onChange={e => onVolumeChange(part.id, parseFloat(e.target.value))}
                  className="part-slider part-slider--volume"
                  style={{ '--track-color': isEffectivelyMuted ? '#555' : part.color } as React.CSSProperties}
                />
                <span className="part-slider-value">{Math.round(part.volume * 100)}%</span>
              </div>

              {/* Pan slider */}
              <div className="part-channel-control">
                <label>Pan</label>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={part.pan}
                  onChange={e => onPanChange(part.id, parseFloat(e.target.value))}
                  className="part-slider part-slider--pan"
                />
                <span className="part-slider-value">
                  {part.pan === 0 ? 'C' : part.pan > 0 ? `R${Math.round(part.pan * 100)}` : `L${Math.round(Math.abs(part.pan) * 100)}`}
                </span>
              </div>

              {/* Instrument selector */}
              <div className="part-channel-control part-channel-control--instrument">
                <label>Instrumento</label>
                <select
                  value={part.instrument}
                  onChange={e => onInstrumentChange(part.id, e.target.value)}
                  className="part-instrument-select"
                >
                  {Object.entries(INSTRUMENT_GROUPS).map(([group, instruments]) => (
                    <optgroup key={group} label={group}>
                      {instruments.map(inst => (
                        <option key={inst} value={inst}>{inst}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Action buttons */}
              <div className="part-channel-actions">
                <button
                  className={`part-btn ${part.muted ? 'part-btn--active-mute' : ''}`}
                  onClick={() => onMuteToggle(part.id)}
                  title={part.muted ? 'Activar' : 'Silenciar'}
                >
                  {part.muted ? '🔇' : '🔊'}
                </button>
                <button
                  className={`part-btn ${part.solo ? 'part-btn--active-solo' : ''}`}
                  onClick={() => onSoloToggle(part.id)}
                  title={part.solo ? 'Quitar Solo' : 'Solo'}
                >
                  S
                </button>
                <button
                  className={`part-btn ${!part.visible ? 'part-btn--active-hide' : ''}`}
                  onClick={() => onVisibilityToggle(part.id)}
                  title={part.visible ? 'Ocultar en partitura' : 'Mostrar en partitura'}
                >
                  {part.visible ? '👁' : '🙈'}
                </button>
              </div>

              {/* Color picker swatches */}
              <div className="part-color-swatches">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    className={`part-color-swatch ${part.color === color ? 'part-color-swatch--active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => onColorChange(part.id, color)}
                    title={color}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {parts.length === 0 && (
          <div className="part-mixer-empty">
            <span>Sin instrumentos cargados</span>
            <p>Importa una partitura MusicXML para ver los instrumentos aquí</p>
          </div>
        )}
      </div>
    </div>
  );
}
