# Aplicación de piano y Beatmaker Studio

La entrada es `src/main.tsx`, que monta `PianoApp.tsx`. Studio utiliza `audio/liveStudioEngine.ts` y el catálogo curado `instruments/catalog.ts`; Pistas conserva las tomas del grabador en `midi/recordingLibrary.ts`. Los proyectos Beatmaker usan `project/`, `sequencer/`, `composition/` y los editores de `components/beatmaker/`. El alcance y el QA parcial están en `../.kiro/specs/beatmaker-studio/`, junto a las especificaciones del piano y los instrumentos.

Desde esta carpeta: `npm install`, `npm run build` y `npm run lint`. El servidor local se inicia desde la raíz con `pwsh -File scripts/start-servers.ps1`.

## Expresión del SMK-37

Studio muestra si una entrada MIDI está **realmente en escucha**, la fuente del último golpe y cinco velocidades MIDI físicas en orden. La curva nueva **Expresiva** conserva los 127 pasos de velocity y deja pianissimo mucho más bajo que la antigua curva **Suave**. Una curva Suave o Fija guardada se conserva; Studio ofrece cambiarla a Expresiva. En Configuración, la calibración automática y el piso de ganancia se ajustan para cada puerto MIDI, sin modificar la velocidad del teclado de computadora o del mouse.

Para comprobar el controlador físico, selecciona su entrada, toca cinco veces la misma nota de muy suave a fuerte y compara los números de «Velocidad recibida». Si el dispositivo envía casi el mismo número en los cinco golpes, el motor no puede inventar resolución física; ajusta la curva y el piso después de observar esos valores.

## Sonidos Salamander

**Salamander Grand · natural** sigue siendo el sonido predeterminado y utiliza las grabaciones locales de una capa. **Salamander Grand · 4 capas reales** se ofrece en Cambiar instrumento y sólo carga sus 52 grabaciones al seleccionarlo; una cancelación o fallo conserva el sonido anterior. La selección de cuatro capas no se restaura automáticamente en el siguiente arranque para evitar decodificar unos 255 MiB antes de tocar. Si el rango sale de C3–C6, las notas usan el banco Salamander original como respaldo mientras llegan las anclas necesarias.

Las cuatro capas son una adaptación del [Salamander Grand Piano V3](https://github.com/sfzinstruments/SalamanderGrandPiano) de Alexander Holm, bajo CC BY 3.0; el SFZ completo posee 16 capas y ruidos/resonancias adicionales que este preset no implementa. Procedencia, hashes y medidas: [`public/audio/salamander/multivelocity/ATTRIBUTION.md`](public/audio/salamander/multivelocity/ATTRIBUTION.md) y [`manifest.json`](public/audio/salamander/multivelocity/manifest.json).
