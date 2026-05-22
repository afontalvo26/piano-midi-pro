# Instrument Engine — Motor de Síntesis World-Class

## Archivo: `src/engine/InstrumentEngine.ts`

---

## Filosofía de Diseño

La diferencia entre un "piano digital barato" y un "piano de talla mundial" no está en las notas — está en todo lo que ocurre alrededor de cada nota:

- **Piano**: la diferencia entre staccato y legato es real (45% vs 98% de la duración); el pedal sostenuto mantiene notas específicas mientras permite que el bajo cambie; la voz de soprano en un acorde suena más fuerte que la voz interior
- **Trompeta**: double tongue suena diferente a single tongue (ataque 8ms vs 12ms); harmon mute es un bandpass filter centrado en 800Hz; un "fall" es una nota fantasma descendente que dura 300ms después de que termina la nota principal

El engine no simula estos efectos superficialmente — los implementa con la cadena de señal correcta en Tone.js.

---

## Arquitectura del Engine

### InstrumentEngineRegistry

Punto de entrada central. Gestiona instancias por `trackId`:

```typescript
class InstrumentEngineRegistry {
  private pianoEngines: Map<string, PianoEngine>
  private trumpetEngines: Map<string, TrumpetEngine>

  getPiano(trackId: string): PianoEngine    // lazy init
  getTrumpet(trackId: string): TrumpetEngine // lazy init
  getType(instrument: string): 'piano' | 'trumpet' | 'generic'
  disposeTrack(trackId: string): void
  disposeAll(): void
}
```

`getType()` detecta el instrumento por nombre:
- Piano: cualquier string que contenga "piano", "harpsichord", "electric piano"
- Trumpet: "trumpet", "trompeta", "muted trumpet"
- Generic: todo lo demás (usa el engine fallback legacy)

Cada track tiene su propio engine aislado — dos pistas de piano tienen pedales independientes.

---

## PianoEngine

### Cadena de Señal

```
PolySynth/Sampler
       │
       ▼
   Tone.Reverb (decay=1.8s, wet=15%)
       │
       ▼
   Tone.Volume (una corda: 0dB / -6dB)
       │
       ▼
   destination (master)
```

El `Tone.Sampler` (Salamander Piano) se carga asincrónicamente y reemplaza al `PolySynth` cuando está disponible. Mientras carga, el `PolySynth` con oscilador triangular produce un sonido funcional.

### Pedales

#### Sustain (pedal derecho)
- Implementado via `release time` extendido: cuando el pedal está bajado, la duración efectiva de la nota es `duration * 2.5`
- `pressSustainPedal()`: activa el estado; todas las notas siguientes suenan con el release largo
- `releaseSustainPedal()`: libera las notas sostenidas vía `triggerRelease()` en el sampler

#### Sostenuto (pedal central)
- Captura las notas **activas en el momento que se pisa**
- Notas capturadas: siguen sonando sin importar si el dedo se levanta
- Notas posteriores: NO son afectadas por el sostenuto
- `pressSostenuto()`: copia el Set de notas activas a `sostenutoHeldNotes`
- `releaseSostenuto()`: limpia `sostenutoHeldNotes`

#### Una Corda (pedal izquierdo)
- Implementado via `Tone.Volume.rampTo(-6dB, 0.05s)` — suaviza 6dB y oscurece ligeramente el timbre
- El rampTo suaviza la transición para evitar clicks

#### Half-Pedaling
- `halfPedalLevel: 0-1` → controla el `release time` del envelope
- Fórmula: `release = 0.4 + level * 2.6`
  - Level 0 (pedal suelto): release = 0.4s
  - Level 0.5 (half-pedal): release = 1.7s (blur armónico parcial)
  - Level 1 (pedal a fondo): release = 3.0s (máxima resonancia)

### Voice Layers

El piano puede tener hasta 4 voces simultáneas en un acorde. Cada voz tiene un multiplicador de velocidad:

| Voz | Multiplicador | Uso típico |
|-----|---------------|-----------|
| soprano | ×1.10 | Melodía principal, voz más aguda |
| alto | ×0.92 | Voz interior alta |
| tenor | ×0.85 | Voz interior baja |
| bass | ×0.95 | Bajo armónico |
| auto | ×1.00 | Default cuando no se especifica |

La inferencia de voz usa `staffNumber` y `voice` del `ScoreNote`:
- Staff 1, Voice 1 → soprano
- Staff 1, Voice 2 → alto
- Staff 2, Voice 1 → tenor
- Staff 2, Voice 2 → bass

### Articulaciones y Duraciones

La duración **notada** en la partitura no es igual a la duración **sonante**. El engine aplica un multiplicador:

| Articulación | Multiplicador | Duración sonante (negra a 120bpm) |
|--------------|--------------|----------------------------------|
| normal | 0.90 | 0.45s de 0.5s notado |
| staccato | 0.45 | 0.225s |
| staccatissimo | 0.22 | 0.11s |
| tenuto | 1.00 | 0.5s (completo) |
| marcato | 0.70 | 0.35s (acento + separación) |
| legato | 0.98 | 0.49s (casi conectado) |
| portato | 0.80 | 0.4s (tenuto suave + separación) |

El multiplicador de velocidad ajusta el ataque:

| Articulación | Velocidad | Resultado perceptual |
|--------------|-----------|---------------------|
| normal | ×1.00 | Toque normal |
| staccato | ×0.85 | Ligeramente más suave en el ataque |
| marcato | ×1.15 | Acento — más fuerte al inicio |
| legato | ×0.90 | Ataque suavizado |
| tenuto | ×0.95 | Casi sin cambio, sostenido |

### API Pública

```typescript
// Tocar una nota con expresión completa
pianoEngine.triggerNote(params: PianoNoteParams, startTime?: number)

// Gestión de pedales
pianoEngine.pressSustainPedal()
pianoEngine.releaseSustainPedal()
pianoEngine.pressSostenuto()
pianoEngine.releaseSostenuto()
pianoEngine.pressUnaCorda()
pianoEngine.releaseUnaCorda()
pianoEngine.setHalfPedalLevel(level: number) // 0-1

// Conectar Sampler Salamander cuando cargue
pianoEngine.setSampler(sampler: Tone.Sampler)
```

### PianoNoteParams

```typescript
interface PianoNoteParams {
  midi: number              // 21-108 (A0-C8)
  velocity: number          // 0-1
  duration: number          // segundos notados
  sustainPedal: boolean     // estado del pedal derecho
  sostenutoActive: boolean  // estado del pedal central
  unaChordaActive: boolean  // estado del pedal izquierdo
  halfPedalLevel: number    // 0-1
  voiceLayer: PianoVoiceLayer
  isArpeggio: boolean       // si true, aplica arpeggioDelay
  arpeggioDelay: number     // segundos de offset (para acordes arpegiados)
  articulation: PianoArticulation
}
```

---

## TrumpetEngine

### Cadena de Señal

```
PolySynth (sawtooth)
       │
       ▼
  Tone.Distortion (flutter tongue / growl — distortion=0 por defecto)
       │
       ▼
  Tone.Filter (mute character — LPF 8kHz por defecto, BPF para harmon)
       │
       ▼
  Tone.Tremolo (flutter tongue — wet=0 por defecto, wet=1 con flutter)
       │
       ▼
  Tone.Vibrato (pitch LFO — depth=0 por defecto, sube gradualmente)
       │
       ▼
  Tone.Reverb (decay=0.8s, wet=12%)
       │
       ▼
  Tone.Volume (ajuste por tipo de sordina)
       │
       ▼
  destination (master)
```

El oscilador `sawtooth` del PolySynth produce el espectro armónico rico de una trompeta (fundamental + armónicos 2, 3, 4, 5...). El Filter y la Distortion dan el timbre característico de cada sordina.

### Tipos de Sordina

| Sordina | Ganancia | Filter | Características |
|---------|----------|--------|----------------|
| none (abierta) | 0 dB | LPF 7000 Hz | Timbre natural, pleno |
| straight | -4 dB | LPF 8000 Hz | Brillante, nasal, Q normal |
| cup | -6 dB | LPF 4600 Hz | Oscura, redondeada |
| harmon | -8 dB | BPF 800 Hz, Q=4 | Carácter wah, Miles Davis, muy nasal |
| harmon-open | -5 dB | LPF 5800 Hz | Harmon sin el stem, más abierto |
| plunger | -3 dB | LPF 4200 Hz | Wah manual, oscuro |
| bucket | -10 dB | LPF 2900 Hz | Muy oscuro, distorsión suave |

El cambio de sordina usa `rampTo()` con 50ms de transición para evitar clicks.

La sordina harmon usa `filter.type = 'bandpass'` — es un filtro de banda estrecha centrado en 800Hz. Esto crea el efecto wah característico (solo las frecuencias medias pasan, los graves y agudos se atenúan).

### Tipos de Articulación de Lengua

La lengua controla el `attack time` del envelope:

| Lengua | Attack | Descripción física |
|--------|--------|-------------------|
| single | 12ms | Lengua toca el paladar: "ta" o "da" |
| double | 8ms | Alternancia lengua/garganta: "ta-ka" — permite el doble de velocidad |
| triple | 6ms | "ta-ta-ka" — para grupos de tres notas muy rápidas |
| flutter | 15ms | Lengua vibra: "rrrrr" — activa tremolo |
| slur | 1ms | Sin lengua — conexión suave entre notas |
| legato | 20ms | Lengua suave — "da" suave |

**Flutter tongue**: cuando `tonguing === 'flutter'`:
```typescript
tremolo.frequency.value = flutterRate  // 25-35 Hz
tremolo.depth.value = 0.45             // modulación de amplitud
tremolo.wet.value = 1                  // activa el tremolo
distortion.distortion = 0.08           // riqueza armónica del "rrr"
```

**Lip slur** (`tonguing === 'slur'`): no hay re-ataque de lengua. El attack se reduce a 1ms para que la transición sea imperceptible.

### Vibrato

El vibrato de trompeta es un LFO de pitch que:
1. **Empieza en 0** cuando inicia la nota
2. **Sube gradualmente** después del `vibratoDelay` (típicamente 150ms)
3. **Vuelve a 0** cuando termina la nota

```typescript
vibrato.frequency.value = vibratoRate      // 5.5 Hz típico
vibrato.depth.value = 0                    // inicia sin vibrato
// Después de vibratoDelay, sube gradualmente:
vibrato.depth.rampTo(depthNorm * 0.3, vibratoDelay, t + vibratoDelay)
```

Parámetros típicos por estilo:
| Estilo | Rate (Hz) | Depth (cents) | Delay (ms) |
|--------|-----------|---------------|-----------|
| Orquestal clásico | 5.5-6.0 | 20-40 | 150 |
| Jazz | 6.5-7.5 | 40-60 | 80 |
| Mariachi | 7.0-8.0 | 50-80 | 50 |
| Sin vibrato | cualquiera | 0 | N/A |

### Efectos Post-Nota

#### Fall ↘
Después de que termina la nota principal, suena una nota descendente breve:
```typescript
// fallSemitones = -5 (baja 5 semitonos), fall = 0.3s
const fallNote = Tone.Frequency(midi + fallSemitones, 'midi').toNote();
synth.triggerAttackRelease(fallNote, fall, Tone.now(), velocity * 0.35);
```
La nota del fall es más suave (×0.35 de la velocidad original) y corta (0.3s).

#### Doit ↗
Igual que el fall pero ascendente:
```typescript
// doitSemitones = +3, doit = 0.2s
const doitNote = Tone.Frequency(midi + doitSemitones, 'midi').toNote();
synth.triggerAttackRelease(doitNote, doit, Tone.now(), velocity * 0.35);
```

#### Shake ≋
Oscilación rápida entre la nota y una nota auxiliar (generalmente 2 semitonos arriba):
```typescript
// Se activa en el último 60% de la nota
// Alterna cada 80ms entre la nota y shakeNote
setInterval(() => {
  toggle = !toggle;
  if (toggle) synth.triggerAttack(shakeNote, now, velocity * 0.7);
  else        synth.triggerRelease(shakeNote, now);
}, 80);  // 80ms = ~12.5 Hz de oscilación
```

#### Half-Valve
Nota "fantasma" — detuneada y suave:
```typescript
synth.set({ detune: -80 })  // 80 cents abajo = pitch indefinido
vol.volume.rampTo(-10, 0.01) // 10dB más suave
```

### TrumpetNoteParams

```typescript
interface TrumpetNoteParams {
  midi: number
  velocity: number
  duration: number
  mute: BrassMuteType
  tonguing: TrumpetTonguing
  vibratoRate: number      // Hz (4-9)
  vibratoDepth: number     // cents (0-100)
  vibratoDelay: number     // segundos (0-0.5)
  fall?: number            // segundos del fall post-nota
  fallSemitones?: number   // semitonos del fall (negativo)
  doit?: number            // segundos del doit post-nota
  doitSemitones?: number   // semitonos del doit (positivo)
  shake?: boolean          // activar shake
  shakeSemitones?: number  // semitonos del shake (default 2)
  bend?: number            // cents de bend durante la nota
  halfValve?: boolean      // nota fantasma
  flutterRate?: number     // Hz del flutter tongue (25-35)
  articulation: TrumpetArticulation
}
```

---

## Inferencia Automática desde ScoreNote

Cuando se reproduce una partitura importada, los parámetros del engine se infieren automáticamente del `ScoreNote`:

### `inferPianoParams(note, sustainDown)`

```typescript
{
  midi: note.midi,
  velocity: note.velocity,          // ya viene del contexto dinámico
  duration: note.duration,
  sustainPedal: sustainDown,         // estado actual del pedal
  voiceLayer: inferVoiceLayer(note), // staff + voice → soprano/alto/tenor/bass
  articulation: inferPianoArticulation(note.articulations)
  // staccatissimo > staccato > marcato > tenuto > portato > normal
}
```

### `inferTrumpetParams(note)`

```typescript
{
  midi: note.midi,
  velocity: note.velocity,
  duration: note.duration,
  mute: note.muted ? 'straight' : 'none',
  tonguing: note.isTied ? 'slur' : inferFromArticulations(note.articulations),
  // tenuto → legato, stress → single, default → single
  vibratoDepth: note.duration > 0.4 ? 40 : 0, // vibrato solo en notas largas
  vibratoRate: 5.5,
  vibratoDelay: 0.15,
  articulation: inferTrumpetArticulation(note.articulations)
}
```

Las notas ligadas (`isTied = true`) siempre usan `tonguing = 'slur'` porque no hay re-ataque de lengua — es la misma nota sonando continuada.

---

## Stubs para Instrumentos Futuros

Las interfaces están definidas y listas para implementación:

```typescript
// Cuerdas (Violín, Viola, Cello, Contrabajo)
interface StringNoteParams {
  bowing: 'legato' | 'detache' | 'spiccato' | 'sautille' | 'martele' 
        | 'tremolo' | 'col-legno' | 'ricochet'
  contactPoint: 'ordinario' | 'sul-ponticello' | 'sul-tasto'
  pizzicato: boolean
  harmonic: boolean
  snapPizzicato: boolean  // Bartók
  vibrato: { rate: number; depth: number; delay: number }
}

// Maderas (Flauta, Oboe, Clarinete, Fagot, Saxofón)
interface WoodwindNoteParams {
  tonguing: 'single' | 'double' | 'flutter' | 'slur'
  vibrato: { rate: number; depth: number; delay: number }
  overblown: boolean  // sobresoflado para armónicos
}
```

Ver [FUTURE-INSTRUMENTS.md](./FUTURE-INSTRUMENTS.md) para la guía completa de implementación.

---

## Integración con Tone.js Transport

El engine recibe `audioTime` del scheduler de Tone.js — el tiempo exacto en el audio clock cuando debe sonar la nota. Esto garantiza sincronización de sample-accurate:

```typescript
// En scheduleSongOnTransport:
Tone.Transport.schedule((audioTime) => {
  const pianoEng = registry.getPiano(trackId);
  pianoEng.triggerNote(params, audioTime);  // ← audio time del transport
}, tickStart + "i");
```

**No** usar `Tone.now()` en el callback del transport — usar el `audioTime` recibido como argumento para máxima precisión.
