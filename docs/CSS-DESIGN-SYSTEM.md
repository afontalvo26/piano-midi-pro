# CSS Design System

## Archivos: `src/index.css`, `src/App.css`

---

## Design Tokens (CSS Variables)

Definidos en `:root` de `index.css`:

### Colores

```css
/* Backgrounds */
--bg-app: #07070a;                        /* Negro profundo — fondo principal */
--bg-sidebar: rgba(13, 13, 18, 0.6);      /* Sidebar semi-transparente */
--bg-card: rgba(20, 20, 28, 0.45);        /* Cards y paneles */
--bg-input: rgba(30, 30, 42, 0.5);        /* Inputs y selects */

/* Borders */
--border-color: rgba(255, 255, 255, 0.08);   /* Borde sutil */
--border-hover: rgba(255, 255, 255, 0.15);   /* Borde en hover */

/* Texto */
--text-primary: #f4f4f7;     /* Texto principal — casi blanco */
--text-secondary: #a1a1aa;   /* Texto secundario — gris claro */
--text-muted: #52525b;       /* Texto atenuado — gris oscuro */

/* Acento */
--accent-primary: #8b5cf6;              /* Violeta — botones principales, enfoque */
--accent-secondary: #d946ef;            /* Fucsia — gradientes secundarios */
--accent-glow: rgba(139, 92, 246, 0.3); /* Glow violeta para efectos */

/* Semánticos */
--success: #10b981;   /* Verde esmeralda */
--warning: #f59e0b;   /* Ámbar */
--danger: #ef4444;    /* Rojo */

/* Específicos de instrumento */
--sustain-color: #f59e0b;   /* Color del pedal sustain */
--pitch-color: #3b82f6;     /* Color del pitch bend */
```

### Layout

```css
--sidebar-width: 80px;
--topbar-height: 70px;
```

---

## Componentes Base

### Botones

```css
.btn              /* Botón base: dark, borde sutil */
.btn.primary      /* Violeta — acciones principales */
.btn-file         /* Botón que envuelve un input[type=file] */
.btn-mute-solo    /* Botones Mute/Solo en el mixer legacy */
.active-mute      /* Estado: muted (fondo rojo suave) */
.active-solo      /* Estado: solo (fondo amarillo suave) */
```

### Inputs

```css
.slider-custom    /* Range input estilizado */
.search-field     /* Input de búsqueda */
.input-custom     /* Input de texto genérico */
.track-instrument-select  /* Select de instrumento */
```

### Layout containers

```css
.app-container    /* flex row: sidebar + main */
.sidebar-rail     /* Barra lateral de navegación */
.main-workspace   /* Área principal: topbar + content */
.topbar-header    /* Header superior con título y pills */
.playback-bar     /* Barra de reproducción (play/pause/seek) */
.panel-screen     /* Pantalla de panel (Tracks, MIDI, Settings) */
.studio-workspace /* Studio: panel-left + center-stage + panel-right */
```

---

## Pantalla Studio

```css
.studio-workspace
  ├── .panel-left          /* Panel izquierdo: rango, sustain, controles */
  ├── .center-stage        /* Centro: canvas + piano */
  │   ├── .visualizer-container  /* Falling notes canvas */
  │   ├── .visualizer-canvas     /* <canvas> element */
  │   └── .piano-wrapper         /* Teclado virtual */
  │       ├── .white-keys-container
  │       └── .black-keys-overlay
  └── .panel-right         /* Panel derecho: métricas */
```

### Teclas de piano

```css
.piano-key-element          /* Tecla base */
.piano-key-element.white    /* Tecla blanca */
.piano-key-element.black    /* Tecla negra (posición absoluta) */
.piano-key-element.active-press  /* Tecla presionada */
.piano-key-element.practice-target  /* Tecla objetivo en modo práctica */
```

Las teclas activas usan la variable `--active-key-color` para permitir colores diferentes por track:

```css
.piano-key-element.active-press {
  background: var(--active-key-color, #8b5cf6);
}
```

---

## Pantalla Score

### Layout de tres columnas

```css
.score-screen           /* flex column: info-bar + body */
.score-screen-body      /* grid: 280px + 1fr + 320px */
  ├── .score-screen-sidebar   /* Izquierda: import + estadísticas */
  ├── .score-screen-main      /* Centro: partitura OSMD / toggle */
  └── .score-screen-mixer     /* Derecha: PartMixer */
```

### ScoreInfoBar

```css
.score-info-bar              /* Flex row con chips de info */
.score-info-chip             /* Chip individual */
.score-info-chip-label       /* Etiqueta pequeña arriba */
.score-info-chip-value       /* Valor principal */
.score-info-chip--chord      /* Chip con color violeta para acordes */
.score-info-chip--dynamic    /* Chip con símbolo dinámico en cursiva */
.score-info-progress-bar     /* Barra de progreso */
.score-info-progress-fill    /* Fill de progreso (animado con transition) */
```

---

## PartMixer

```css
.part-mixer                  /* flex column */
.part-mixer-channels         /* Lista scrollable de canales */
.part-channel                /* Card por instrumento */
.part-channel--muted         /* opacity: 0.45 */
.part-channel--solo          /* border amarillo + shadow */
.part-channel-color-bar      /* Barra de color de 4px en el lado izquierdo */
.part-slider                 /* Range input personalizado */
.part-slider-value           /* Valor numérico a la derecha */
.part-instrument-select      /* Select de instrumento GM */
.part-btn                    /* Botones Mute/Solo/Visibility */
.part-btn--active-mute       /* Fondo rojo suave */
.part-btn--active-solo       /* Fondo amarillo suave */
.part-color-swatch           /* Círculo de 16px para selector de color */
.part-color-swatch--active   /* border blanco cuando está seleccionado */
```

---

## ImportPanel

```css
.import-panel                /* flex column */
.import-dropzone             /* Zona de drop con borde punteado */
.import-dropzone--active     /* Hover: borde violeta, fondo violeta suave */
.import-dropzone--loading    /* pointer-events: none, opacity: 0.7 */
.import-error                /* Panel rojo con mensaje de error */
.import-success              /* Panel verde con confirmación */
.import-format-ext           /* Badge de extensión (.xml, .mid, etc.) */
```

---

## InstrumentControls

### Piano

```css
.piano-controls              /* Contenedor del panel piano */
.ic-pedals                   /* Flex row de 3 pedales */
.ic-pedal                    /* Botón individual de pedal */
.ic-pedal--active            /* Pedal presionado (border accent-primary) */
.ic-pedal--sustain.ic-pedal--active   /* Pedal sustain: borde amarillo */
.ic-pedal--sostenuto.ic-pedal--active /* Pedal sostenuto: borde azul */
.ic-half-pedal-hints         /* Hints "Silencio / Blur / Full" */
.ic-shortcuts                /* Atajos de teclado documentados */
```

### Trompeta

```css
.trumpet-controls            /* Contenedor del panel trompeta */
.ic-mute-grid                /* Grid 4 columnas de sordinas */
.ic-mute-btn                 /* Botón de sordina */
.ic-mute-btn--active         /* Sordina seleccionada (border violeta) */
.ic-tongue-grid              /* Grid 3 columnas de articulaciones */
.ic-tongue-btn               /* Botón de articulación */
.ic-tongue-btn--active       /* Articulación activa (borde amarillo) */
.ic-vibrato-controls         /* Panel colapsable del vibrato */
.ic-effects-row              /* Fila Fall / Doit / Shake */
.ic-effect-btn               /* Botón de efecto jazz */
.ic-effect-btn--active       /* Efecto activo (borde naranja) */
```

---

## Sistema de Status Pills

En el topbar:

```css
.status-pills                /* Flex row */
.status-pill                 /* Pill individual: texto + dot */
.status-pill-dot             /* Círculo de estado */
.status-pill-dot.success     /* Verde: MIDI conectado, audio activo */
.status-pill-dot.warning     /* Amarillo: pendiente, esperando */
```

---

## Spinner

```css
.spinner                     /* Circular loading indicator */
```

Implementado con CSS `@keyframes`:

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinner {
  animation: spin 0.8s linear infinite;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
}
```

---

## Rail de Navegación

```css
.rail-item                   /* Botón de navegación */
.rail-item.active            /* Pantalla activa: fondo violeta */
.rail-item--has-score        /* Punto verde cuando hay ScoreDocument cargado */

/* El indicador de score cargado */
.rail-item--has-score::after {
  content: '';
  position: absolute;
  top: 6px; right: 8px;
  width: 6px; height: 6px;
  background: #34d399;
  border-radius: 50%;
  box-shadow: 0 0 6px #34d399;
}
```

---

## Paleta de Colores de Tracks

Los 6 colores base para tracks (usados en el piano roll / falling notes):

```css
#a78bfa  /* Violeta suave */
#60a5fa  /* Azul claro */
#fb923c  /* Naranja */
#34d399  /* Esmeralda */
#f472b6  /* Rosa */
#fbbf24  /* Ámbar */
```

Extendida a 12 colores para el PartMixer:

```css
/* Colores adicionales */
#e879f9  /* Fucsia */
#38bdf8  /* Celeste */
#4ade80  /* Verde claro */
#f87171  /* Rojo suave */
#c084fc  /* Lavanda */
#2dd4bf  /* Turquesa */
```

---

## Scrollbars

Personalizados via `-webkit-scrollbar` para coherencia visual:

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.12);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.25);
}
```

---

## Responsive

La app está diseñada para pantallas de escritorio (1024px+). El layout usa `overflow: hidden` en `html, body, #root` para evitar scroll en el contenedor raíz. El scroll interno ocurre en paneles individuales (`.part-mixer-channels`, `.score-screen-sidebar`, etc.).

El teclado de piano usa `flexGrow: 1` para cada tecla blanca, adaptándose automáticamente al ancho disponible del `center-stage`.
