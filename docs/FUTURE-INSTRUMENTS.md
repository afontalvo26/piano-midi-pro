# Guía para Añadir Instrumentos Futuros

## Estado Actual

| Instrumento | Engine | Controles UI | Inferencia auto |
|-------------|--------|-------------|----------------|
| Piano | ✅ Completo | ✅ Completo | ✅ |
| Trompeta | ✅ Completo | ✅ Completo | ✅ |
| Cuerdas (Violín/Viola/Cello/CB) | ⬜ Stub | ⬜ Pendiente | ⬜ Pendiente |
| Maderas (Flauta/Oboe/Clarinete/Fagot/Sax) | ⬜ Stub | ⬜ Pendiente | ⬜ Pendiente |
| Metales graves (Trombón/Tuba/Corno) | ⬜ Pendiente | ⬜ Pendiente | ⬜ Pendiente |
| Guitarra/Bajo | ⬜ Pendiente | ⬜ Pendiente | ⬜ Pendiente |
| Percusión | ⬜ Pendiente | ⬜ Pendiente | ⬜ Pendiente |

Los stubs (`StringNoteParams`, `WoodwindNoteParams`) ya están definidos en `InstrumentEngine.ts` y listos para implementación.

---

## Cómo Añadir un Instrumento Nuevo

El proceso tiene 5 pasos para cualquier instrumento:

### Paso 1 — Definir la interfaz de parámetros

En `src/engine/InstrumentEngine.ts`, agregar la interfaz de parámetros del instrumento:

```typescript
// Ejemplo para Trombón
export interface TromboneNoteParams {
  midi: number
  velocity: number
  duration: number

  // Físico del trombón
  slidePosition: 1 | 2 | 3 | 4 | 5 | 6 | 7  // posiciones de vara
  portamentoTime: number    // segundos para deslizar entre posiciones (0 = sin portamento)
  portamentoShape: 'linear' | 'exponential'

  // Expresión
  mute: BrassMuteType       // mismos tipos que trompeta
  tonguing: TrumpetTonguing // mismos tipos que trompeta
  vibratoRate: number
  vibratoDepth: number      // cents
  vibratoDelay: number

  // Técnicas específicas
  multiphonic: boolean      // cantar mientras toca
  pedalTone: boolean        // notas pedales (muy graves, timbre especial)
  fall?: number
  doit?: number

  articulation: TromboneArticulation
}

export type TromboneArticulation = 'normal' | 'staccato' | 'marcato' | 'tenuto' | 'legato'
```

### Paso 2 — Implementar la clase del engine

```typescript
export class TromboneEngine {
  private vol: Tone.Volume;
  private filter: Tone.Filter;         // mute + bright/dark character
  private vibrato: Tone.Vibrato;
  private portamento: Tone.AutoFilter; // simula portamento de vara
  private reverbNode: Tone.Reverb;
  private synth: Tone.PolySynth;
  private currentMidiRef = 0;          // nota anterior para portamento

  constructor(destination: Tone.ToneAudioNode) {
    // Cadena de señal para trombón:
    // PolySynth → Filter → Vibrato → Reverb → Volume → dest
    this.reverbNode = new Tone.Reverb({ decay: 1.0, wet: 0.14 });
    this.vol = new Tone.Volume(0).connect(destination);
    this.reverbNode.connect(this.vol);

    this.vibrato = new Tone.Vibrato({ frequency: 5.0, depth: 0, wet: 1 })
      .connect(this.reverbNode);

    this.filter = new Tone.Filter({ type: 'lowpass', frequency: 7000 })
      .connect(this.vibrato);

    // Trombón: sonido más oscuro y lleno que trompeta
    // Usar sawtooth + mezcla de square para el cuerpo del tono
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.3 },
    }).connect(this.filter);
    this.synth.maxPolyphony = 2; // trombón es monofónico en práctica

    this.reverbNode.generate();
  }

  triggerNote(params: TromboneNoteParams, startTime?: number): void {
    const t = startTime ?? Tone.now();
    const note = Tone.Frequency(params.midi, 'midi').toNote();

    // 1. Portamento — deslizamiento natural de vara
    if (params.portamentoTime > 0 && this.currentMidiRef !== 0) {
      // Programar glissando desde nota anterior a nota actual
      // OSMD no tiene glissando nativo en Tone.js PolySynth fácilmente,
      // pero se puede simular con Tone.Synth monofónico y portamento
      this.synth.set({ portamento: params.portamentoTime });
    }

    // 2. Articulación
    const durMult = TROMBONE_DURATION_MULT[params.articulation];
    const soundingDuration = params.duration * durMult;

    // 3. Vibrato
    this.vibrato.frequency.value = params.vibratoRate;
    this.vibrato.depth.value = 0;
    if (params.vibratoDepth > 0) {
      const depth = Math.min(1, params.vibratoDepth / 100) * 0.3;
      this.vibrato.depth.rampTo(depth, params.vibratoDelay, t + params.vibratoDelay);
    }

    // 4. Mute (igual que trompeta, reusar MUTE_PARAMS)
    this.applyMute(params.mute);

    // 5. Tocar
    this.synth.triggerAttack(note, t, params.velocity);
    this.synth.triggerRelease(note, t + soundingDuration);

    // Limpiar vibrato después
    Tone.Transport.scheduleOnce(() => {
      this.vibrato.depth.value = 0;
    }, `+${soundingDuration + 0.05}`);

    this.currentMidiRef = params.midi;
  }

  // Reutilizar applyMute de TrumpetEngine (mismo mecanismo físico)
  private applyMute(mute: BrassMuteType) {
    const p = MUTE_PARAMS[mute];
    this.vol.volume.rampTo(p.gain, 0.05);
    this.filter.frequency.rampTo(p.tone * 8000 + 200, 0.05);
  }

  dispose() {
    this.synth.dispose();
    this.filter.dispose();
    this.vibrato.dispose();
    this.reverbNode.dispose();
    this.vol.dispose();
  }
}
```

### Paso 3 — Registrar en InstrumentEngineRegistry

```typescript
export class InstrumentEngineRegistry {
  // Agregar
  private tromboneEngines = new Map<string, TromboneEngine>();

  // Agregar método getter
  getTrombone(trackId: string): TromboneEngine {
    if (!this.tromboneEngines.has(trackId)) {
      this.tromboneEngines.set(trackId, new TromboneEngine(this.destination));
    }
    return this.tromboneEngines.get(trackId)!;
  }

  // Actualizar getType()
  getType(instrument: string): InstrumentType {
    const l = instrument.toLowerCase();
    // Agregar al bloque de detección:
    if (l.includes('trombone') || l.includes('trombón')) return 'trombone';
    // ...
  }

  // Actualizar disposeAll()
  disposeAll() {
    // Agregar:
    this.tromboneEngines.forEach(e => e.dispose());
    this.tromboneEngines.clear();
  }
}

// Actualizar el tipo union
type InstrumentType = 'piano' | 'trumpet' | 'trombone' | 'generic';
```

### Paso 4 — Función de inferencia automática

```typescript
export function inferTromboneParams(note: ScoreNote): TromboneNoteParams {
  return {
    midi: note.midi,
    velocity: note.velocity,
    duration: note.duration,

    // Posición de vara inferida del MIDI
    // (En práctica real, múltiples posiciones dan la misma nota)
    slidePosition: inferSlidePosition(note.midi),

    // Portamento: si la nota está ligada, deslizar desde la anterior
    portamentoTime: note.isTied ? 0.08 : 0,
    portamentoShape: 'linear',

    mute: note.muted ? 'straight' : 'none',
    tonguing: note.isTied ? 'slur' : 'single',
    vibratoRate: 5.0,
    vibratoDepth: note.duration > 0.5 ? 35 : 0,
    vibratoDelay: 0.2,
    articulation: inferTromboneArticulation(note.articulations),
  };
}

// Las 7 posiciones del trombón (Bb tenon, sin trigger)
function inferSlidePosition(midi: number): 1|2|3|4|5|6|7 {
  const positions: Record<number, 1|2|3|4|5|6|7> = {
    58: 1, 57: 2, 56: 3, 55: 4, 54: 5, 53: 6, 52: 7,
    // ... mapeo completo de todos los MIDI a posiciones
  };
  return positions[midi % 12] ?? 1;
}
```

### Paso 5 — Integrar en App.tsx scheduler

En `scheduleSongOnTransport()`, agregar el caso:

```typescript
} else if (registry && instType === 'trombone' && scoreDocument) {
  const scoreNote = /* buscar por id */;
  if (scoreNote) {
    const tromboneEng = registry.getTrombone(String(note.trackIndex));
    tromboneEng.triggerNote({
      ...inferTromboneParams(scoreNote),
      velocity: scoreNote.velocity * trackVol,
      mute: /* estado de sordina del mixer */,
    }, audioTime);
  } else {
    triggerAttack(/* fallback */);
  }
}
```

---

## Implementación de Cuerdas (Guía Completa)

Las cuerdas son el instrumento más complejo de sintetizar debido a los tipos de arco.

### Cadena de señal propuesta

```
PolySynth (sawtooth con filtro)
    │
    ▼
Tone.Chebyshev (armónicos de arco, intensidad según tipo)
    │
    ▼
Tone.Filter (LPF: sul-tasto, BPF: sul-ponticello)
    │
    ▼
Tone.Tremolo (bow tremolo)
    │
    ▼
Tone.Vibrato (dedo en cuerda)
    │
    ▼
Tone.Reverb (decay=2.5s, wet=20% — sala de concierto)
    │
    ▼
Tone.Volume → destination
```

### Técnicas de arco y su implementación

| Técnica | Implementación Tone.js |
|---------|----------------------|
| détaché | Attack normal (20ms), nota separada |
| legato | Attack suave (5ms), notas conectadas sin re-ataque |
| spiccato | Attack muy corto (8ms), duration=15% del notado, Chebyshev off |
| sautillé | Como spiccato pero con tremolo rápido (8-10 Hz) |
| martelé | Attack brusco (5ms) + ramp de volumen rápido down |
| col legno | Distortion alto + filter muy cerrado (LPF 800Hz), sin vibrato |
| tremolo | Tremolo a 10-14 Hz (bow tremolo) |
| sul ponticello | Filter BPF centrado en 2000-4000 Hz, Chebyshev alto |
| sul tasto | Filter LPF 1200 Hz, Chebyshev bajo, más suave |
| snap pizzicato | Tone.Synth con envelope attack=0.001, decay=0.1, sustain=0, Distortion |
| pizzicato | Envelope corto (attack=0.001, decay=0.3, sustain=0), sin vibrato |
| armónico | Filter BPF estrecho, -8dB, velocity muy baja |

### Vibrato de cuerda

El vibrato de cuerdas es más intenso y con mayor variación que el de trompeta:
- Rate: 5-7 Hz (más rápido que trompeta)
- Depth: 30-80 cents (más profundo)
- Delay: 50-200ms según el músico
- La intensidad puede variar dentro de una nota (crescendo de vibrato)

```typescript
// Vibrato gradual que crece hacia el final de la nota
vibrato.depth.value = 0;
vibrato.depth.rampTo(depthNorm, params.vibratoBuildTime, t + params.vibratoDelay);
```

### Portamento (glissando de cuerdas)

El portamento es completamente natural en cuerdas (el dedo desliza por la cuerda).

Con `Tone.PolySynth`, el portamento no está disponible directamente. Para notas ligadas con glissando, usar `Tone.Synth` monofónico con `portamento`:

```typescript
// Para notas con portamento explícito
const monoSynth = new Tone.Synth({ portamento: 0.05 });
monoSynth.triggerAttack(note1Freq, t1);
monoSynth.triggerAttack(note2Freq, t2); // desliza desde note1 a note2
```

---

## Implementación de Maderas (Guía Completa)

### Diferencias por instrumento

| Instrumento | Oscilador base | Filtro | Carácter |
|-------------|---------------|--------|---------|
| Flauta | Sine + ruido suave | LPF 4000 Hz | Suave, aéreo |
| Oboe | Sawtooth + square | BPF 800-1200 Hz | Nasal, penetrante |
| Clarinete | Square (solo impares) | LPF variable | Oscuro en grave, brillante en agudo |
| Fagot | Sawtooth | LPF 2000 Hz | Oscuro, grave, lleno |
| Saxofón | Sawtooth | BPF 600-2000 Hz | Rico, entre madera y metal |

### Ruido de aliento (breathiness)

La flauta especialmente tiene ruido de aliento. Se puede simular:

```typescript
const noise = new Tone.Noise('white');
const noiseFilter = new Tone.Filter({ type: 'bandpass', frequency: 3000 });
const noiseGain = new Tone.Volume(-30);  // -30dB = muy sutil
noise.connect(noiseFilter).connect(noiseGain).connect(destination);
noise.start();
// Al tocar notas suaves, aumentar noiseGain ligeramente
```

### Registro de clarinete

El clarinete tiene un "break" de registro famoso (entre Bb3 y B3) donde el timbre cambia dramáticamente. A implementar con cambio de preset del oscilador según la octava de la nota.

---

## Implementación de Guitarra

### Técnicas de mano derecha

| Técnica | Implementación |
|---------|---------------|
| Fingerpicking | Envelope corto (attack=0.001), resonancia media |
| Strumming | Múltiples notas en secuencia rápida (2-5ms apart) |
| Palm mute | Filter LPF 400 Hz + envelope muy corto |
| Harmonic | Envelope muy corto, +12 o +7 semitonos del fundamental |
| Tap | Envelope percusivo sin ataque de plectro |

### Técnicas de mano izquierda

| Técnica | Implementación |
|---------|---------------|
| Hammer-on | Segunda nota sin re-ataque plectro (como slur de viento) |
| Pull-off | Idem |
| Bend | Ramp de pitch +50 a +200 cents durante la nota |
| Vibrato | LFO pitch ±20-40 cents a 5-7 Hz |
| Slide up | Portamento desde nota grave |
| Slide down | Portamento hacia nota grave |

---

## Criterios de Prioridad para Implementación

Ordenados por impacto musical vs complejidad técnica:

1. **Cuerdas (violín/cello)** — Alta prioridad. Presentes en 80% del repertorio orquestal clásico. Técnica de arco da variedad tímbrica mayor.

2. **Maderas graves (fagot, clarinete)** — Media-alta. El clarinete es el instrumento transpositor más común después de la trompeta.

3. **Trombón** — Media. El portamento natural lo diferencia fundamentalmente de la trompeta (que requiere glissando artificial).

4. **Saxofón** — Media. Muy presente en jazz y bandas. Timbre intermedio entre madera y metal.

5. **Flauta** — Media. El instrumento de madera más común. El breathiness lo diferencia del resto.

6. **Guitarra/Bajo** — Baja-media. El fingerpicking y el palm mute son las técnicas más importantes.

7. **Percusión** — Baja (por complejidad — necesita SoundFont de percusión mapeado correctamente por canal 10 GM).
