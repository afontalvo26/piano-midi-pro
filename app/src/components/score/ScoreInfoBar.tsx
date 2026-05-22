// ============================================================
// ScoreInfoBar - Real-time musical information overlay
// Shows: key, chord, measure, beat, tempo, dynamic
// ============================================================

import type { ScoreDocument, ChordEvent } from '../../types/score';
import type { AnalysisResult } from '../../analysis/MusicAnalyzer';
import { getChordAtTime } from '../../analysis/MusicAnalyzer';

interface ScoreInfoBarProps {
  score: ScoreDocument | null;
  analysis: AnalysisResult | null;
  currentTime: number;
}

const DIFFICULTY_LABELS = {
  beginner: { label: 'Principiante', color: '#34d399' },
  intermediate: { label: 'Intermedio', color: '#fbbf24' },
  advanced: { label: 'Avanzado', color: '#fb923c' },
  expert: { label: 'Experto', color: '#ef4444' },
};

const QUALITY_SYMBOLS: Record<string, string> = {
  major: '',
  minor: 'm',
  diminished: 'dim',
  augmented: 'aug',
  dominant7: '7',
  major7: 'maj7',
  minor7: 'm7',
  'diminished7': 'dim7',
  'half-diminished': 'm7b5',
  sus2: 'sus2',
  sus4: 'sus4',
  add9: 'add9',
  power: '5',
};

const DYNAMIC_LABELS: Record<string, { symbol: string; name: string }> = {
  ppp: { symbol: 'ppp', name: 'Pianississimo' },
  pp: { symbol: 'pp', name: 'Pianissimo' },
  p: { symbol: 'p', name: 'Piano' },
  mp: { symbol: 'mp', name: 'Mezzo-Piano' },
  mf: { symbol: 'mf', name: 'Mezzo-Forte' },
  f: { symbol: 'f', name: 'Forte' },
  ff: { symbol: 'ff', name: 'Fortissimo' },
  fff: { symbol: 'fff', name: 'Fortississimo' },
  sfz: { symbol: 'sfz', name: 'Sforzando' },
  fp: { symbol: 'fp', name: 'Forte-Piano' },
  sf: { symbol: 'sf', name: 'Sforzato' },
};

function getCurrentMeasureAndBeat(score: ScoreDocument, currentTime: number): { measure: number; beat: number; timeSig: string } {
  let measure = 1;
  let beat = 1;
  let timeSig = '4/4';

  for (const part of score.parts) {
    for (const m of part.measures) {
      if (m.startTime <= currentTime && m.startTime + m.duration > currentTime) {
        measure = m.number;
        const sig = m.timeSignature ?? score.metadata.timeSignature;
        timeSig = sig.display;
        const quarterSeconds = 60 / (score.tempoMap.find(t => t.measureNumber <= m.number)?.bpm ?? score.metadata.bpm);
        beat = Math.floor((currentTime - m.startTime) / quarterSeconds) + 1;
        break;
      }
    }
    break;
  }

  return { measure, beat, timeSig };
}

function getCurrentTempo(score: ScoreDocument, currentTime: number): number {
  let tempo = score.metadata.bpm;
  for (const t of score.tempoMap) {
    if (t.time <= currentTime) tempo = t.bpm;
    else break;
  }
  return tempo;
}

function getCurrentDynamic(score: ScoreDocument, currentTime: number): string | null {
  let lastDynamic: string | null = null;
  for (const dyn of score.globalDynamics) {
    if (dyn.time <= currentTime) lastDynamic = dyn.type;
    else break;
  }
  return lastDynamic;
}

function formatChord(chord: ChordEvent): string {
  const qualSym = QUALITY_SYMBOLS[chord.quality] ?? '';
  const baseName = chord.bass ? `${chord.root}${qualSym}/${chord.bass}` : `${chord.root}${qualSym}`;
  return baseName;
}

export function ScoreInfoBar({ score, analysis, currentTime }: ScoreInfoBarProps) {
  if (!score) return null;

  const { measure, beat, timeSig } = getCurrentMeasureAndBeat(score, currentTime);
  const tempo = getCurrentTempo(score, currentTime);
  const dynamic = getCurrentDynamic(score, currentTime);
  const currentChord = analysis ? getChordAtTime(analysis.chords, currentTime) : null;
  const difficulty = analysis?.difficulty;

  const totalMin = Math.floor(score.metadata.duration / 60);
  const totalSec = Math.floor(score.metadata.duration % 60);
  const curMin = Math.floor(currentTime / 60);
  const curSec = Math.floor(currentTime % 60);
  const progress = score.metadata.duration > 0 ? (currentTime / score.metadata.duration) * 100 : 0;

  return (
    <div className="score-info-bar">
      {/* Left: score metadata */}
      <div className="score-info-section">
        <div className="score-info-title">{score.metadata.title}</div>
        {score.metadata.composer && (
          <div className="score-info-composer">{score.metadata.composer}</div>
        )}
      </div>

      {/* Center: real-time musical info */}
      <div className="score-info-section score-info-live">
        {/* Key */}
        <div className="score-info-chip">
          <span className="score-info-chip-label">Tonalidad</span>
          <span className="score-info-chip-value">
            {analysis?.detectedKey ?? score.metadata.keySignature.name}
          </span>
        </div>

        {/* Time signature */}
        <div className="score-info-chip">
          <span className="score-info-chip-label">Compas</span>
          <span className="score-info-chip-value">{timeSig}</span>
        </div>

        {/* Current position */}
        <div className="score-info-chip score-info-chip--pos">
          <span className="score-info-chip-label">Posicion</span>
          <span className="score-info-chip-value">C.{measure} · T.{beat}</span>
        </div>

        {/* Tempo */}
        <div className="score-info-chip">
          <span className="score-info-chip-label">Tempo</span>
          <span className="score-info-chip-value">{Math.round(tempo)} <span style={{ fontSize: '0.7em', opacity: 0.7 }}>BPM</span></span>
        </div>

        {/* Dynamic */}
        {dynamic && DYNAMIC_LABELS[dynamic] && (
          <div className="score-info-chip score-info-chip--dynamic">
            <span className="score-info-chip-label">Dinamica</span>
            <span className="score-info-chip-value score-info-dynamic-symbol" title={DYNAMIC_LABELS[dynamic].name}>
              {DYNAMIC_LABELS[dynamic].symbol}
            </span>
          </div>
        )}

        {/* Current chord */}
        {currentChord && (
          <div className="score-info-chip score-info-chip--chord">
            <span className="score-info-chip-label">Acorde</span>
            <span className="score-info-chip-value score-info-chord-label">
              {formatChord(currentChord)}
            </span>
          </div>
        )}
      </div>

      {/* Right: stats */}
      <div className="score-info-section score-info-right">
        {difficulty && (
          <span
            className="score-info-difficulty"
            style={{ color: DIFFICULTY_LABELS[difficulty].color }}
          >
            {DIFFICULTY_LABELS[difficulty].label}
          </span>
        )}
        <div className="score-info-time">
          {String(curMin).padStart(2, '0')}:{String(curSec).padStart(2, '0')}
          <span style={{ opacity: 0.4 }}> / </span>
          {String(totalMin).padStart(2, '0')}:{String(totalSec).padStart(2, '0')}
        </div>
        <div className="score-info-progress-bar">
          <div
            className="score-info-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="score-info-parts">
          {score.parts.length} instrumento{score.parts.length !== 1 ? 's' : ''}
          &nbsp;·&nbsp;{score.metadata.totalMeasures} compases
        </div>
      </div>
    </div>
  );
}
