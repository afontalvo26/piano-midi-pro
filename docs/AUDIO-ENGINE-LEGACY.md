# Audio Engine Legacy — Sistema de Audio Original

## Descripción

El sistema de audio original (pre-Score Reader) maneja la síntesis para todos los instrumentos que NO son Piano ni Trompeta, y también actúa como fallback cuando no hay `ScoreDocument` cargado.

---

## Cadena de Señal Maestra

```
triggerAttack() / triggerRelease()
        │
        ├── Tone.Sampler (Salamander) → para instrumento 'Acoustic Grand Piano'
        │        solo cuando isSamplerActive=true
        │
        └── Tone.PolySynth (por track) → fallback o instrumento no-piano
                 │
                 ▼
          Tone.Volume (masterVolume, -40 a 0 dB)
                 │
                 ▼
          Tone.Chorus (depth, wet)
                 │
                 ▼
          Tone.Reverb (decay, wet)
                 │
                 ▼
          Tone.Compressor (threshold=-18, ratio=5)
                 │
                 ▼
          Tone.Limiter (-2 dB)
                 │
                 ▼
           AudioContext.destination
```

El `Tone.Sampler` se conecta directamente al nodo `vol`, saltando el Chorus (el Salamander ya tiene reverb y espacialización propia).

---

## Configuración por Instrumento

`getInstrumentSynthSettings(instrument: string)` devuelve configuración de oscilador y envelope según el nombre del instrumento GM:

| Categoría | Osciladores | Envelope características |
|-----------|-------------|------------------------|
| Acoustic Piano | triangle | attack=0.002, decay=0.8, sustain=0.3 |
| String Ensemble | sawtooth | attack=0.4, sustain=0.7, release=1.0 (slow attack) |
| Strings (Violin/Cello) | sawtooth | attack=0.3 |
| Choir | sine | attack=0.8, release=1.5 |
| Brass (trompeta, trombón, etc.) | sawtooth | attack=0.02, sustain=0.8 |
| Winds (flauta, clarinete, etc.) | triangle | attack=0.05 |

El sistema crea un `PolySynth` por track index bajo demanda (`getOrCreateSynthForTrack`).

---

## triggerAttack / triggerRelease

```typescript
function triggerAttack(
  midi: number,
  velocity: number,
  trackIndex: number,
  instrument: string
): void
```

Lógica interna:
1. Convierte MIDI a frecuencia considerando `pitchBend` y `transpose`
2. Limita voces activas a máximo 16 (purga la más antigua con "last in, first out" inverso)
3. Si `isSamplerActive` Y el instrumento es piano → usa el Sampler
4. Si no → usa `getOrCreateSynthForTrack()` para el PolySynth del track

El tiempo de inicio usa `audioTime` (del callback de Transport) + `safeOffset` mínimo para evitar latencia negativa:

```typescript
const safeOffset = Math.max(0, audioTime - Tone.now() - 0.001);
const audioStartTime = Tone.now() + safeOffset;
```

---

## Metronome Engine

El metrónomo usa un `Tone.MetalSynth` independiente conectado a un `Tone.Volume` separado que va directo al `Limiter` (bypass del reverb/chorus):

```typescript
const metronomeVol = new Tone.Volume(-6).connect(limiter);
const metronome = new Tone.MetalSynth({
  envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
  harmonicity: 5.1,
  modulationIndex: 16,
  resonance: 4000,
  octaves: 1.5,
}).connect(metronomeVol);
metronome.frequency.value = 1000;  // 1kHz = click metálico
```

Se dispara en `setInterval` sincronizado con `song.bpm * playbackRate`.

---

## Humanización

`humanizeSong(song: SongData): SongData` aplica variaciones aleatorias menores para que las canciones demo suenen más naturales:

```typescript
// Para cada nota:
const timeOffset = (Math.random() - 0.5) * 0.015;    // ±7.5ms de timing
const newVelocity = velocity * (0.85 + Math.random() * 0.3); // ±15% velocity
const durationMultiplier = 0.85 + Math.random() * 0.2;       // 85-105% duración
```

La humanización se aplica a todas las canciones demo al cargar la app, pero NO a partituras importadas (las importadas preservan el valor exacto de la partitura).

---

## Sampler Salamander — Detalles de Carga

```typescript
const sampler = new Tone.Sampler({
  urls: SALAMANDER_SAMPLES,  // Mapa de nota → nombre de archivo
  baseUrl: "https://tonejs.github.io/audio/salamander/",
  release: 1.2,
  onload: () => {
    stateRef.current.isSamplerActive = true;  // sync (no espera React)
    setIsSamplerActive(true);                  // async (trigger re-render)
    setAudioStatusMessage("Piano realista activo");
  },
  onerror: () => {
    setAudioStatusMessage("Sintetizador FM activo");  // fallback gracioso
  },
}).connect(vol);
```

El `stateRef.current.isSamplerActive = true` es crítico — se actualiza sincrónicamente para que `triggerAttack()` (que lee `stateRef`, no el state de React) use el sampler inmediatamente sin esperar el siguiente ciclo de render.

---

## Pitch Bend

El pitch bend del controlador MIDI físico se aplica en `triggerAttack`:

```typescript
const pb = stateRef.current.pitchBend;          // -1.0 a 1.0
const pbr = stateRef.current.pitchBendRange;    // semitonos (default 2)
const bendOffset = pb * pbr;                     // semitonos de offset
const transposeOffset = stateRef.current.transpose;

// La frecuencia final incluye ambos offsets
const bentFreq = midiToFreq(midi + bendOffset + transposeOffset);
```

La fórmula `Math.pow(2, semitones/12)` convierte semitonos a multiplicador de frecuencia.

---

## Polyphony Management

Para evitar acumulación de voces (especialmente con sustain):

```typescript
const MAX_VOICES = 16;
if (activeVoicesRef.current.length >= MAX_VOICES) {
  const oldest = activeVoicesRef.current.shift();  // FIFO
  triggerRelease(oldest.midi, oldest.trackIndex);
}
```

Esto previene que el sistema quede "colgado" con notas que no se liberaron correctamente.

---

## Coexistencia con InstrumentEngine

El sistema legacy y el `InstrumentEngineRegistry` coexisten sin interferencia:

- **Legacy**: usado para MIDI sin ScoreDocument, y para todos los instrumentos genéricos
- **InstrumentEngineRegistry**: usado solo cuando hay `ScoreDocument` Y el instrumento es piano/trompeta
- Los engines de `InstrumentEngineRegistry` se conectan al mismo nodo `vol` del master chain
- Ambos sistemas suenan a través de la misma cadena Chorus→Reverb→Compressor→Limiter

La decisión de cuál usar ocurre en `scheduleSongOnTransport()`:

```typescript
const registry = engineRegistryRef.current;
const instType = registry?.getType(trackInst);

if (registry && instType === 'piano' && scoreDocument) {
  // → InstrumentEngineRegistry.getPiano()
} else if (registry && instType === 'trumpet' && scoreDocument) {
  // → InstrumentEngineRegistry.getTrumpet()
} else {
  // → triggerAttack() legacy
}
```
