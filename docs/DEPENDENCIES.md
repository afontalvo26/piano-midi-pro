# Dependencias del Proyecto

## Archivo: `app/package.json`

---

## Dependencias de Producción

### React + TypeScript

| Paquete | Versión | Uso |
|---------|---------|-----|
| `react` | ^19.2.6 | Framework UI |
| `react-dom` | ^19.2.6 | Renderizado DOM |

React 19 incluye mejoras en concurrent features y el nuevo compilador, aunque en este proyecto se usa con el patrón tradicional de hooks.

### Audio

| Paquete | Versión | Uso |
|---------|---------|-----|
| `tone` | ^15.1.22 | Motor de síntesis de audio completo — Transport, efectos, osciladores |
| `@tonejs/midi` | ^2.0.28 | Parseo de archivos MIDI (.mid) |

**Tone.js** es la dependencia más crítica. Proporciona:
- `Tone.Transport`: scheduler de alta precisión sincronizado con el audio clock
- `Tone.Sampler`: reproductor de samples (Salamander Piano)
- `Tone.PolySynth`: síntesis polifónica (fallback y trumpet engine)
- `Tone.Reverb`, `Tone.Chorus`, `Tone.Compressor`, `Tone.Limiter`: cadena de efectos
- `Tone.Vibrato`, `Tone.Tremolo`: efectos LFO para instrumentos
- `Tone.Filter`, `Tone.Distortion`: shaping tímbrico (mutes de trompeta)
- `Tone.Volume`, `Tone.Gain`: control de dinámica

### Score Reader (nuevas)

| Paquete | Versión | Uso |
|---------|---------|-----|
| `opensheetmusicdisplay` | latest | Renderizado de MusicXML como SVG en el browser |
| `tonal` | latest | Librería de teoría musical: detección de acordes, análisis de tonalidad |
| `jszip` | latest | Descompresión de archivos .mxl (MusicXML comprimido = ZIP) |

**OpenSheetMusicDisplay (OSMD)**: La librería más completa para renderizar MusicXML en el browser. Convierte el XML a SVG con notación musical completa: pentagramas, figuras, ligaduras, dinámica, etc. Soporta MusicXML 3.1 y 4.0.

**tonal.js**: Suite de teoría musical en JavaScript. Se usa para:
- `Chord.detect(notes)` → detección de acorde a partir de notas
- `Key.majorKey(root)` → información de tonalidad
- Análisis de intervalos, escalas, modos

**jszip**: Los archivos `.mxl` son ZIPs que contienen el XML real. JSZip los descomprime en el browser sin necesidad de un backend.

---

## Dependencias de Desarrollo

| Paquete | Uso |
|---------|-----|
| `vite` ^8.0.12 | Build tool y dev server |
| `typescript` ~6.0.2 | Compilador TypeScript |
| `@vitejs/plugin-react` | Plugin React para Vite |
| `eslint` + plugins | Linting |
| `@types/react`, `@types/react-dom` | Tipos TypeScript para React |
| `@types/node` | Tipos TypeScript para Node.js APIs |

---

## Recursos Externos (Runtime)

### Salamander Piano Samples

```
URL: https://tonejs.github.io/audio/salamander/
```

Samples del famoso piano de concierto Salamander, grabado nota por nota. La app los carga lazy al iniciar el audio. Cada sample es un archivo `.mp3` que el `Tone.Sampler` descarga y cachea.

Samples cargados (30 notas, cobertura completa del teclado):
```
A0, C1, D#1, F#1, A1, C2, D#2, F#2, A2, C3, D#3, F#3,
A3, C4, D#4, F#4, A4, C5, D#5, F#5, A5, C6, D#6, F#6,
A6, C7, D#7, F#7, A7, C8
```

Ton.js interpola entre samples para notas intermedias. La calidad es indistinguible de un piano real en el rango dinámico normal.

### Fuentes Web (index.html)

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

- **Outfit**: Fuente principal de UI (sans-serif moderna)
- **Inter**: Fuente monoespaciada para valores numéricos

---

## Consideraciones de Bundle Size

El bundle actual supera los 500KB (warning de Vite). Las causas principales:

| Paquete | Tamaño estimado |
|---------|----------------|
| `opensheetmusicdisplay` | ~1.2MB minificado |
| `tone` | ~200KB |
| `tonal` | ~120KB |
| App code | ~150KB |

### Optimizaciones futuras

1. **Code splitting de OSMD**: Cargar solo cuando el usuario navega a la pantalla Partitura:
   ```typescript
   const ScoreViewer = React.lazy(() => import('./components/ScoreViewer'));
   ```

2. **Tree shaking de tonal**: Importar solo los módulos necesarios:
   ```typescript
   import { Chord } from 'tonal/chord';
   import { Key } from 'tonal/key';
   ```

3. **Split de App.tsx**: Extraer las canciones demo a un archivo separado (~800 líneas de datos).

4. **Dynamic import de JSZip**: Solo cargar cuando el archivo es .mxl:
   ```typescript
   if (file.name.endsWith('.mxl')) {
     const { default: JSZip } = await import('jszip');
   }
   ```

---

## Compatibilidad de Navegadores

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Web Audio API | ✅ | ✅ | ✅ | ✅ |
| Web MIDI API | ✅ | ❌ (plugin) | ❌ | ✅ |
| AudioWorklet | ✅ | ✅ | ✅ | ✅ |
| CSS `100dvh` | ✅ | ✅ | ✅ | ✅ |

**Web MIDI API** solo está disponible nativamente en Chrome/Edge. En Firefox requiere el plugin `Jazz-Soft`. En Safari no está disponible sin herramientas de terceros.

El piano virtual y la reproducción de partituras funcionan en todos los navegadores modernos. Solo el control de hardware MIDI requiere Chrome/Edge.

---

## Scripts Disponibles

```bash
npm run dev      # Servidor de desarrollo en http://localhost:5173
npm run build    # Build de producción → dist/
npm run preview  # Preview del build de producción
npm run lint     # ESLint sobre todo el código
```

El build de producción usa Rolldown (bundler de Vite 8) con minificación y tree-shaking automático.
