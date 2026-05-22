# Components — Documentación de Componentes UI

## Directorio: `src/components/`

---

## ScoreViewer

**Archivo**: `src/components/ScoreViewer.tsx`  
**Dependencia**: `opensheetmusicdisplay` (OSMD)

Wrapper de OpenSheetMusicDisplay que renderiza MusicXML como partitura tradicional en SVG, con cursor animado sincronizado a la reproducción.

### Props

```typescript
interface ScoreViewerProps {
  score: ScoreDocument | null      // null muestra pantalla vacía
  currentTime: number              // Posición de reproducción en segundos
  onMeasureClick?: (measureNumber: number, time: number) => void
  visiblePartIds?: string[]        // IDs de partes a mostrar (resto se atenúa)
}
```

### Comportamiento

**Carga inicial**: Cuando `score` cambia (por `score.id`), OSMD recibe el XML. Se usa el XML original cacheado en `sessionStorage` si está disponible; si no, se construye uno simplificado desde el modelo de datos.

```typescript
// XML cacheado = fiel al original (conserva todos los detalles visuales)
// XML reconstruido = funcional pero puede perder detalles de notación visual
const xml = getCachedScoreXML(score.id) ?? buildXmlFromScore(score);
await osmd.load(xml);
osmd.render();
```

**Cursor animado**: El cursor de OSMD se mueve medida a medida. No es sample-accurate (solo cambia de compás, no de nota) porque OSMD no expone posición intra-compás sin acceder a APIs internas.

```typescript
// Cuando currentTime cambia, busca el compás correspondiente
// y avanza el cursor hasta ese compás
if (targetMeasure !== lastMeasureRef.current) {
  cursor.reset();
  for (let i = 1; i < targetMeasure; i++) cursor.next();
}
```

**Visibilidad de partes**: Cuando `visiblePartIds` no incluye una parte, se aplica `opacity: 0.15` a los elementos SVG correspondientes.

### Funciones Exportadas

```typescript
// Guardar XML original para renderizado fiel
cacheScoreXML(scoreId: string, xml: string): void

// Recuperar XML cacheado
getCachedScoreXML(scoreId: string): string | null
```

### Configuración OSMD

```typescript
new OpenSheetMusicDisplay(container, {
  autoResize: true,
  drawTitle: true,
  drawComposer: true,
  drawMeasureNumbers: true,
  coloringMode: 0,          // Sin coloreo por defecto
  followCursor: true,
  cursorsOptions: [{
    type: 0,
    color: '#ef4444',       // Rojo
    alpha: 0.25,
    follow: true
  }]
})
```

---

## PartMixer

**Archivo**: `src/components/PartMixer.tsx`

Mixer multi-canal con control completo por instrumento. Se muestra en la pantalla Partitura y también en Pistas cuando hay un ScoreDocument cargado.

### Props

```typescript
interface PartMixerProps {
  parts: ScorePart[]
  onVolumeChange: (partId: string, volume: number) => void      // 0-1
  onPanChange: (partId: string, pan: number) => void            // -1 a 1
  onMuteToggle: (partId: string) => void
  onSoloToggle: (partId: string) => void
  onVisibilityToggle: (partId: string) => void
  onInstrumentChange: (partId: string, instrument: string) => void
  onColorChange: (partId: string, color: string) => void
}
```

### Funcionalidades

**Icono por instrumento**: `partTypeIcon()` asigna emoji según el instrumento:
- 🎹 Piano, órgano, clavicémbalo
- 🎻 Cuerdas (violín, viola, cello)
- 🎺 Metales (trompeta, trombón, tuba, corno)
- 🎷 Maderas con boquilla (clarinete, saxofón, oboe)
- 🎸 Guitarra y bajo
- 🥁 Percusión y timbales
- 🪕 Arpa
- 🎤 Coro y voces

**Solo logic**: Cuando al menos una parte tiene `solo=true`, todas las partes con `solo=false` se muestran con opacidad reducida (`part-channel--muted`).

**Selector de instrumento**: Agrupa los 127 instrumentos GM en categorías:
- Teclados, Cuerdas, Metales, Maderas, Guitarras/Bajo, Voces/Coro, Percusión

**12 colores predefinidos** en `PRESET_COLORS` para los swatches de color de canal.

**Display del Pan**: Usa notación de audio estudio:
- `-0` a `L100` para izquierda
- `C` para centro (pan=0)
- `R1` a `R100` para derecha

---

## ImportPanel

**Archivo**: `src/components/ImportPanel.tsx`

Panel de importación de archivos con drag & drop, file picker, feedback de estado y guía de formatos.

### Props

```typescript
interface ImportPanelProps {
  onFileSelect: (file: File) => void
  isLoading: boolean
  error?: string | null
  lastImported?: string | null
}
```

### Comportamiento

**Drag & Drop**: Maneja `onDrop`, `onDragOver`, `onDragLeave`. Durante el hover, la clase `import-dropzone--active` aplica el estilo visual de "soltar aquí".

**File Input oculto**: El botón visible dispara `fileInputRef.current?.click()`. El `<input type="file">` permanece oculto con `display: none`.

**Formatos aceptados**: `.xml,.mxl,.mid,.midi`

**Reset del input**: Después de seleccionar un archivo, `e.target.value = ''` permite seleccionar el mismo archivo dos veces consecutivas.

**Estados visuales**:
- Normal: zona punteada con icono de partitura
- Cargando: spinner animado + texto "Analizando partitura..."
- Error: panel rojo con mensaje de error
- Éxito: panel verde con nombre del archivo importado

**Guía de Software**: Instrucciones específicas para exportar desde MuseScore, Finale y Sibelius.

---

## ScoreInfoBar

**Archivo**: `src/components/ScoreInfoBar.tsx`

Barra horizontal de información musical en tiempo real. Se muestra en la pantalla Partitura sobre la vista de score.

### Props

```typescript
interface ScoreInfoBarProps {
  score: ScoreDocument | null
  analysis: AnalysisResult | null
  currentTime: number
}
```

### Información Mostrada

**Sección izquierda**: Título y compositor de la pieza

**Sección central** (chips actualizados en tiempo real):
- **Tonalidad**: `analysis.detectedKey` o `score.metadata.keySignature.name`
- **Compás**: Métrica actual (ej: "4/4", "6/8")
- **Posición**: "C.12 · T.3" (Compás 12, Tiempo 3)
- **Tempo**: BPM actual (considerando cambios de tempo)
- **Dinámica**: símbolo en cursiva (p, mf, ff, sfz...)
- **Acorde**: etiqueta del acorde activo (Cmaj7, Dm/F...)

**Sección derecha**:
- Nivel de dificultad con color semántico
- Tiempo actual / duración total (formato MM:SS / MM:SS)
- Barra de progreso
- Conteo de instrumentos y compases

### Cálculos Internos

```typescript
// Posición en el compás
function getCurrentMeasureAndBeat(score, currentTime) {
  // Busca el compás cuyo startTime <= currentTime < startTime + duration
  // Calcula beat = Math.floor((currentTime - measure.startTime) / quarterSeconds) + 1
}

// BPM considerando cambios de tempo
function getCurrentTempo(score, currentTime) {
  // Itera tempoMap y retorna el último bpm cuyo time <= currentTime
}

// Dinámica activa
function getCurrentDynamic(score, currentTime) {
  // Itera globalDynamics y retorna la última dinámica cuyo time <= currentTime
}
```

**Símbolos de dinámica**: Renderizados en font-family Georgia (serif) con `font-style: italic` para aproximar la notación musical tradicional.

**Colores de dificultad**:
| Nivel | Color |
|-------|-------|
| Principiante | #34d399 (verde) |
| Intermedio | #fbbf24 (amarillo) |
| Avanzado | #fb923c (naranja) |
| Experto | #ef4444 (rojo) |

---

## InstrumentControlsPanel

**Archivo**: `src/components/InstrumentControls.tsx`

Panel combinado de controles avanzados para Piano y Trompeta. Se muestra en el panel izquierdo de Studio.

### Props del Panel Combinado

```typescript
interface InstrumentControlsPanelProps {
  activeInstrument: string   // Detecta si mostrar Piano, Trompeta, o genérico

  // Piano
  pianoPedalSustain: boolean
  pianoPedalSostenuto: boolean
  pianoPedalUnaCorda: boolean
  pianoHalfPedal: number     // 0-1
  onPianoSustain: (v: boolean) => void
  onPianoSostenuto: (v: boolean) => void
  onPianoUnaCorda: (v: boolean) => void
  onPianoHalfPedal: (v: number) => void

  // Trompeta
  trumpetMute: BrassMuteType
  trumpetTonguing: TrumpetTonguing
  trumpetVibratoDepth: number
  trumpetVibratoRate: number
  trumpetVibratoDelay: number
  trumpetFall: boolean
  trumpetDoit: boolean
  trumpetShake: boolean
  onTrumpetMute: (v: BrassMuteType) => void
  onTrumpetTonguing: (v: TrumpetTonguing) => void
  onTrumpetVibrato: (depth: number, rate: number, delay: number) => void
  onTrumpetFall: (v: boolean) => void
  onTrumpetDoit: (v: boolean) => void
  onTrumpetShake: (v: boolean) => void
}
```

**Detección de instrumento**: Basada en el nombre del instrumento activo (`activeInstrument.toLowerCase()`):
- Contiene "piano" o "harpsichord" → muestra `PianoControls`
- Contiene "trumpet" o "trompeta" → muestra `TrumpetControls`
- Otro → muestra mensaje genérico

### PianoControls

**Pedales**: Tres botones con `onMouseDown` / `onMouseUp` / `onMouseLeave`. El `onMouseLeave` previene que el pedal quede "pegado" si el cursor sale del botón mientras está presionado.

Cada pedal tiene estilos distintos cuando está activo:
- Una Corda: borde violeta (accent-primary)
- Sostenuto: borde azul (#60a5fa)
- Sustain: borde amarillo (#fbbf24)

**Half-Pedal**: Range input `0-1` con step `0.01`. Hints "Silencio / Blur / Full" debajo del slider.

**Atajos de teclado**: Solo documentación visual — la integración de los atajos reales de teclado está pendiente.

### TrumpetControls

**Sordinas**: Grid de 4 columnas con 7 botones (7 tipos de sordina). El botón activo tiene borde y background violeta.

**Lengua**: Grid de 3 columnas con 6 botones. El activo tiene borde amarillo.

**Vibrato**: Panel colapsable (click en el label para expandir). Cuando `vibratoDepth > 0`, el badge muestra el valor en cents.

**Efectos Jazz**: 3 botones en fila horizontal. Los activos tienen borde y background naranja.

---

## CSS Naming Convention

Todos los componentes nuevos usan el sistema BEM con prefijos específicos:

| Prefijo | Componente |
|---------|-----------|
| `.score-` | ScoreViewer, ScoreInfoBar, Score screen |
| `.import-` | ImportPanel |
| `.part-` | PartMixer |
| `.ic-` | InstrumentControls |

Los estados se expresan como modificadores BEM:
- `.part-channel--muted` (muted state)
- `.part-channel--solo` (solo active)
- `.ic-pedal--active` (pedal pressed)
- `.ic-pedal--sustain` (sustain type)
- `.ic-mute-btn--active` (selected mute)
- `.import-dropzone--active` (drag over)

---

## Ciclo de Vida y Efectos

### ScoreViewer

```
score cambia (nuevo score.id)
  └── useEffect → loadScore()
      ├── setLoading(true)
      ├── osmd.load(xml)
      ├── osmd.render()
      ├── cursor.reset() / cursor.show()
      └── setLoaded(true)

currentTime cambia (durante reproducción)
  └── useEffect → mover cursor al compás correcto
      └── solo si targetMeasure !== lastMeasureRef.current

visiblePartIds cambia
  └── useEffect → ajustar opacity en SVG elements
```

### InstrumentControlsPanel

Sin efectos — completamente stateless (estado gestionado en App.tsx).

---

## ProfilePanel

**Archivo**: `src/components/ProfilePanel.tsx`

Panel modal completo del perfil del jugador con sistema de gamificación. Muestra estadísticas, logros y progreso de canciones.

### Props

```typescript
interface ProfilePanelProps {
  profile: PlayerProfile
  onProfileUpdate: (profile: PlayerProfile) => void
  onClose: () => void
}
```

### Estructura del Panel

```
ProfilePanel
├── Overlay (backdrop con blur)
└── Modal Container
    ├── Header
    │   ├── Avatar Picker (10 emojis)
    │   ├── Username (editable on click)
    │   ├── Rank Title (basado en nivel)
    │   ├── Level Badge
    │   └── XP Progress Bar
    ├── Tab Navigation
    │   ├── Statistics
    │   ├── Achievements
    │   └── Songs
    └── Content Area (scrolleable)
        ├── [Statistics Tab]
        ├── [Achievements Tab]
        └── [Songs Tab]
```

### Header Section

**Avatar Picker**: Grid de 10 emojis predefinidos:
```typescript
const AVATAR_OPTIONS = [
  '🎹', '🎵', '🎼', '🎹', '🎸',
  '🎺', '🎷', '🎻', '🥁', '🎤'
];
```

**Username Editing**: Click en el username activa modo edición con input inline. Enter o blur guarda el cambio.

**Rank Title**: Calculado automáticamente por nivel:
```typescript
Level 1-9:   "Novice"
Level 10-24: "Apprentice"
Level 25-49: "Expert"
Level 50-74: "Master"
Level 75-99: "Virtuoso"
Level 100:   "Legend"
```

**XP Progress Bar**: Barra de progreso con texto detallado:
```
"Level 5 • 2,500 / 11,180 XP (22%)"
```

### Statistics Tab

**8 Stat Cards principales** en grid responsive:

| Stat | Icon | Descripción |
|------|------|-------------|
| Games Played | 🎮 | Total de partidas jugadas |
| Total Score | 🏆 | Score acumulado de todas las partidas |
| Best Combo | 🔥 | Combo máximo alcanzado |
| Average Accuracy | 🎯 | Accuracy promedio (%) |
| Total Stars | ⭐ | Estrellas totales ganadas |
| Songs Completed | 🎵 | Canciones completadas (≥1 estrella) |
| Playtime | ⏱️ | Tiempo total jugado (formato HH:MM:SS) |
| Achievements | 🏅 | Logros desbloqueados / 20 |

**Hit Distribution Chart**: Gráfico de barras horizontal mostrando distribución de hits:
- Perfect+ (amarillo #fbbf24)
- Perfect (verde #34d399)
- Great (azul #60a5fa)
- Good (púrpura #a78bfa)

Cada barra muestra:
- Nombre del grado
- Cantidad de hits
- Barra de progreso proporcional
- Porcentaje del total

### Achievements Tab

**Grid de Achievements** (responsive: 1-3 columnas según viewport):

**Achievement Card (Unlocked)**:
```
┌─────────────────────────┐
│ 🏆 (icono grande)       │
│ Achievement Name        │
│ Description text        │
│ +500 XP                 │
│ Unlocked: May 21, 2026  │
└─────────────────────────┘
```

**Achievement Card (Locked)**:
```
┌─────────────────────────┐
│ 🔒 (grayscale)          │
│ Achievement Name        │
│ Description text        │
│ +500 XP                 │
│ ▓▓▓▓▓░░░░░ 50%         │ ← Progress bar
└─────────────────────────┘
```

**Categorías de Achievements**:
1. **First Steps** (5 logros) - Primeros pasos
2. **Combo Master** (5 logros) - Maestría de combos
3. **Accuracy Expert** (5 logros) - Precisión perfecta
4. **Score Hunter** (3 logros) - Cazador de puntos
5. **Dedication** (2 logros) - Dedicación

**Estados visuales**:
- Unlocked: Color completo, borde violeta, sin progress bar
- Locked: Grayscale, borde gris, con progress bar
- Hover: Escala 1.02, sombra más pronunciada

### Songs Tab

**Lista de canciones completadas** ordenada por total de estrellas (descendente):

**Song Progress Card**:
```
┌─────────────────────────────────────────┐
│ 🎵 Für Elise                            │
│                                         │
│ Easy:   ⭐⭐⭐⭐⭐  45,000 pts          │
│ Normal: ⭐⭐⭐⭐☆  38,000 pts          │
│ Hard:   ⭐⭐⭐☆☆  25,000 pts          │
│ Expert: ⭐⭐☆☆☆  15,000 pts          │
│                                         │
│ Total: 16 ⭐                            │
└─────────────────────────────────────────┘
```

**Difficulty Badges** con colores semánticos:
- Easy: Verde (#34d399)
- Normal: Azul (#60a5fa)
- Hard: Naranja (#fb923c)
- Expert: Rojo (#ef4444)

**Star Display**: Estrellas llenas (⭐) y vacías (☆) según rating.

**Ordenamiento**: Canciones con más estrellas totales primero.

### Comportamiento Interactivo

**Avatar Selection**:
```typescript
const handleAvatarSelect = (avatar: string) => {
  const updated = { ...profile, avatar };
  onProfileUpdate(updated);
};
```

**Username Editing**:
```typescript
const handleUsernameEdit = () => {
  setEditingUsername(true);
  // Focus en input después de render
};

const handleUsernameSave = () => {
  if (tempUsername.trim()) {
    const updated = { ...profile, username: tempUsername.trim() };
    onProfileUpdate(updated);
  }
  setEditingUsername(false);
};
```

**Tab Navigation**:
```typescript
const [activeTab, setActiveTab] = useState<'stats' | 'achievements' | 'songs'>('stats');
```

**Close Panel**:
- Click en overlay (backdrop)
- Click en botón X
- Tecla Escape (pendiente implementar)

### Estado Interno

```typescript
const [activeTab, setActiveTab] = useState<'stats' | 'achievements' | 'songs'>('stats');
const [editingUsername, setEditingUsername] = useState(false);
const [tempUsername, setTempUsername] = useState(profile.username);
const [showAvatarPicker, setShowAvatarPicker] = useState(false);
```

### Cálculos Derivados

**Hit Distribution**:
```typescript
const totalHits = stats.perfectHits + stats.greatHits + 
                  stats.goodHits + stats.missedNotes;
const perfectPercent = (stats.perfectHits / totalHits) * 100;
// ... similar para otros grados
```

**Achievements Progress**:
```typescript
const unlockedCount = achievements.filter(a => a.unlocked).length;
const totalCount = achievements.length;
const completionPercent = (unlockedCount / totalCount) * 100;
```

**Songs Completed**:
```typescript
const completedSongs = getAllSongProgress()
  .filter(song => song.totalStars > 0)
  .sort((a, b) => b.totalStars - a.totalStars);
```

### Animaciones

**Panel Entrance**:
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Achievement Unlock** (cuando se desbloquea):
```css
@keyframes starPop {
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}
```

**Hover Effects**:
- Avatar options: `transform: scale(1.1)`
- Achievement cards: `transform: scale(1.02)`
- Tab buttons: `background-color` transition

### CSS Classes

**Prefijo**: `.profile-`

| Clase | Descripción |
|-------|-------------|
| `.profile-panel-overlay` | Backdrop con blur |
| `.profile-panel` | Modal container |
| `.profile-header` | Header section |
| `.profile-avatar` | Avatar display |
| `.profile-avatar-picker` | Avatar selection grid |
| `.profile-username` | Username display/input |
| `.profile-rank-title` | Rank badge |
| `.profile-level-badge` | Level badge |
| `.profile-xp-bar` | XP progress bar |
| `.profile-tabs` | Tab navigation |
| `.profile-tab` | Individual tab button |
| `.profile-tab--active` | Active tab |
| `.profile-content` | Scrolleable content area |
| `.stats-grid` | Statistics grid |
| `.stat-card` | Individual stat card |
| `.hit-distribution` | Hit distribution chart |
| `.hit-bar` | Individual hit bar |
| `.achievements-grid` | Achievements grid |
| `.achievement-card` | Individual achievement |
| `.achievement-card--locked` | Locked achievement |
| `.achievement-icon` | Achievement icon |
| `.achievement-icon--locked` | Grayscale icon |
| `.progress-bar` | Progress bar container |
| `.progress-fill` | Progress bar fill |
| `.songs-list` | Songs list container |
| `.song-progress-card` | Individual song card |
| `.difficulty-row` | Difficulty rating row |
| `.difficulty-badge` | Difficulty label |
| `.stars-display` | Star rating display |

### Responsive Design

**Breakpoints**:
```css
/* Mobile: < 640px */
.stats-grid { grid-template-columns: 1fr; }
.achievements-grid { grid-template-columns: 1fr; }

/* Tablet: 640px - 1024px */
.stats-grid { grid-template-columns: repeat(2, 1fr); }
.achievements-grid { grid-template-columns: repeat(2, 1fr); }

/* Desktop: > 1024px */
.stats-grid { grid-template-columns: repeat(4, 1fr); }
.achievements-grid { grid-template-columns: repeat(3, 1fr); }
```

**Modal Width**:
- Mobile: 95vw
- Tablet: 90vw
- Desktop: max-width 1200px

### Integración con App.tsx

**Mostrar Panel**:
```typescript
const [showProfilePanel, setShowProfilePanel] = useState(false);

// En el JSX
{showProfilePanel && (
  <ProfilePanel
    profile={playerProfile}
    onProfileUpdate={(updated) => {
      setPlayerProfile(updated);
      saveProfile(updated);
    }}
    onClose={() => setShowProfilePanel(false)}
  />
)}
```

**Profile Button en Header**:
```typescript
<button 
  className="profile-button"
  onClick={() => setShowProfilePanel(true)}
>
  <span className="profile-button-avatar">{playerProfile.avatar}</span>
  <span className="profile-button-level">Lv.{playerProfile.level}</span>
</button>
```

### Dependencias

**Utilities**:
- `getOrCreateProfile()` - Cargar perfil
- `saveProfile()` - Guardar cambios
- `getAchievementDefinitions()` - Obtener logros
- `getAllSongProgress()` - Obtener progreso de canciones
- `formatPlaytime()` - Formatear tiempo de juego
- `getRankTitle()` - Obtener título por nivel

**Types**:
- `PlayerProfile`
- `PlayerStats`
- `Achievement`
- `SongProgress`

### Performance

**Optimizaciones**:
- `useMemo` para cálculos derivados (hit distribution, achievement progress)
- `useCallback` para handlers de eventos
- Lazy rendering de tabs (solo renderiza tab activo)
- Virtual scrolling pendiente para listas largas de canciones

**Re-renders**:
- Solo re-renderiza cuando `profile` cambia (por referencia)
- Tabs inactivos no se re-renderizan
- Avatar picker solo renderiza cuando está abierto

---

## Gamification UI Components

Además del ProfilePanel, el sistema de gamificación incluye varios componentes UI inline:

### XP Notification Toast

**Ubicación**: Top-right corner  
**Duración**: 3 segundos  
**Animación**: slideInRight + fadeOut

```typescript
{xpNotification.show && (
  <div className="xp-notification">
    <span className="xp-icon">✨</span>
    <span className="xp-text">+{xpNotification.amount} XP</span>
  </div>
)}
```

### Level Up Modal

**Ubicación**: Center screen  
**Backdrop**: Semi-transparent overlay  
**Animación**: levelUpPulse

```typescript
{levelUpEvent && (
  <div className="level-up-modal">
    <div className="level-up-content">
      <h2>🎉 Level Up!</h2>
      <div className="level-display">
        <span className="old-level">{levelUpEvent.oldLevel}</span>
        <span className="arrow">→</span>
        <span className="new-level">{levelUpEvent.newLevel}</span>
      </div>
      <p className="rank-title">{levelUpEvent.newRankTitle}</p>
      <button onClick={dismissLevelUp}>Continue</button>
    </div>
  </div>
)}
```

### Achievement Toast

**Ubicación**: Bottom-right corner  
**Duración**: 5 segundos  
**Animación**: slideUp + fadeOut  
**Stack**: Múltiples toasts se apilan verticalmente

```typescript
{achievementToasts.map(achievement => (
  <div key={achievement.id} className="achievement-toast">
    <span className="achievement-icon">{achievement.icon}</span>
    <div className="achievement-info">
      <div className="achievement-name">{achievement.name}</div>
      <div className="achievement-desc">{achievement.description}</div>
    </div>
  </div>
))}
```

### Star Power Bar

**Ubicación**: Top of game area  
**Animación**: starPowerPulse cuando activo  
**Color**: Gradiente violeta cuando acumulando, dorado cuando activo

```typescript
<div className="star-power-bar">
  <div className="star-power-label">
    {starPower.active ? '🔥 PIANO FURY!' : '⭐ Star Power'}
  </div>
  <div className="star-power-progress">
    <div 
      className={`star-power-fill ${starPower.active ? 'active' : ''}`}
      style={{ width: `${starPower.amount}%` }}
    />
  </div>
  {starPower.amount >= 50 && !starPower.active && (
    <button 
      className="star-power-activate"
      onClick={activateStarPower}
    >
      Activate (Space)
    </button>
  )}
</div>
```

### Stars Display (Results Screen)

**Ubicación**: Results panel  
**Animación**: starPop secuencial (cada estrella aparece con delay)

```typescript
<div className="stars-earned">
  <div className="stars-label">Stars Earned</div>
  <div className="stars-display">
    {[1, 2, 3, 4, 5].map(star => (
      <span 
        key={star}
        className={`star ${star <= starsEarned ? 'earned' : 'empty'}`}
        style={{ animationDelay: `${star * 0.1}s` }}
      >
        {star <= starsEarned ? '⭐' : '☆'}
      </span>
    ))}
  </div>
</div>
```

---

El panel solo renderiza controles y dispara callbacks. El estado real (pedales, mute, etc.) vive en App.tsx y se pasa a los engines.
