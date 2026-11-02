import type { ProjectPattern } from "../../project/model.ts";
import "./StudioScore.css";

interface StudioScoreProps {
  pattern: ProjectPattern | null;
  meter?: { readonly numerator: number; readonly denominator: number };
  onOpenEditor: () => void;
}

/** Read-only musical staff; editing stays in the real Piano Roll. */
export function StudioScore({pattern,meter,onOpenEditor}:StudioScoreProps) {
  if (!pattern) return <div className="ref-score-empty">
    <strong>Partitura</strong>
    <span>Selecciona un patrón MIDI para ver sus notas.</span>
    <button type="button" onClick={onOpenEditor}>Abrir Piano Roll</button>
  </div>;
  const ticksPerBar = 960 * 4 * (meter?.numerator ?? 4) / (meter?.denominator ?? 4);
  const bars = Math.max(1, Math.ceil(pattern.lengthTicks / ticksPerBar));
  const barWidth = 188;
  const width = bars * barWidth + 82;
  const staffTop = 48;
  const staffBottom = staffTop + 4*17;
  const stepFor = (midi:number):number => {
    const degree=[0,0,1,1,2,3,3,4,4,5,5,6][midi%12]!;
    return Math.floor(midi/12)*7+degree;
  };
  const noteY = (midi:number):number => staffBottom-(stepFor(midi)-30)*8.5;
  return <section className="ref-score" aria-label="Partitura de lectura">
    <div className="ref-score-heading">
      <span><strong>{pattern.name}</strong> · {meter?.numerator??4}/{meter?.denominator??4} · {pattern.notes.length} notas</span>
      <button type="button" onClick={onOpenEditor}>Editar notas en Piano Roll</button>
    </div>
    <div className="ref-score-scroll">
      <svg viewBox={`0 0 ${width} 200`} width={width} height="200" role="img"
        aria-label={`Partitura de ${pattern.name}, ${bars} compases`}>
        <rect width={width} height="200" rx="5" fill="#101528"/>
        {Array.from({length:5},(_,i)=><line key={i} x1="70" x2={width-14}
          y1={staffTop+i*17} y2={staffTop+i*17} stroke="#787597" strokeWidth="1"/>)}
        {Array.from({length:bars},(_,i)=><g key={i}>
          <line x1={70+i*barWidth} x2={70+i*barWidth}
            y1={staffTop} y2={staffBottom} stroke="#625f83" strokeWidth={i===0?2:1}/>
          <text x={76+i*barWidth} y={23} fill="#c7c0e1" fontSize="13">{i+1}</text>
        </g>)}
        <line x1={width-14} x2={width-14} y1={staffTop} y2={staffBottom}
          stroke="#787597" strokeWidth="2"/>
        <text x="15" y="118" fontSize="66" fill="#c6a5ff" fontFamily="serif">𝄞</text>
        {pattern.notes.slice(0,1500).map((note)=>{
          const x=70+note.startTick/ticksPerBar*barWidth+18;
          const y=noteY(note.pitch);
          if(x>=width-6)return null;
          const upper = y < staffTop;
          const lower = y > staffBottom;
          const ledger: number[] = [];
          if(upper) for(let line=staffTop-17;line>=y-2;line-=17)ledger.push(line);
          if(lower) for(let line=staffBottom+17;line<=y+2;line+=17)ledger.push(line);
          const stemUp=y>=staffTop+34;
          return <g key={note.id} title={`MIDI ${note.pitch}, tick ${note.startTick}`}>
            {ledger.map((line,i)=><line key={i} x1={x-13} x2={x+14} y1={line} y2={line}
              stroke="#b4add6" strokeWidth="1"/>)}
            <ellipse cx={x} cy={y} rx="9" ry="5.5" transform={`rotate(-20 ${x} ${y})`}
              fill="#b78bff" stroke="#e2c9ff" strokeWidth="1"/>
            <line x1={stemUp?x+8:x-8} x2={stemUp?x+8:x-8}
              y1={y} y2={stemUp?y-37:y+37} stroke="#d6c2fa" strokeWidth="1.5"/>
          </g>;
        })}
      </svg>
    </div>
  </section>;
}
