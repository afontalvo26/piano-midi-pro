# Piano MIDI Pro - Especificación de Requisitos

**Nombre del Proyecto:** Piano MIDI Pro  
**Fecha:** Mayo 11, 2026  
**Versión:** 1.0  
**Objetivo:** Aplicación web de piano MIDI profesional optimizada para controladores de 37 teclas con transposición dinámica

---

## 1. VISIÓN GENERAL

### 1.1 Propósito
Crear una aplicación web moderna de aprendizaje y reproducción de piano que:
- Esté optimizada para controladores MIDI de 37 teclas
- Permita transposición dinámica del rango de octavas por software
- Replique todas las funcionalidades de Midiano con diseño moderno
- Soporte completo para Pitch Bend y Velocity Sensitivity

### 1.2 Usuarios Objetivo
- Pianistas con controladores MIDI de 37 teclas
- Estudiantes de piano que practican con teclados compactos
- Músicos que necesitan flexibilidad en el rango de octavas

---

## 2. REQUISITOS FUNCIONALES PRINCIPALES

### 2.1 Sistema de Transposición de Octavas (CARACTERÍSTICA ÚNICA)

#### RF-001: Selector de Rango Dinámico
**Prioridad:** CRÍTICA  
**Descripción:** Control visual para ajustar el rango de 37 teclas sobre un piano virtual de 88 teclas

**Criterios de Aceptación:**
- [ ] Mostrar piano visual de 88 teclas (A0 a C8)
- [ ] Resaltar visualmente el rango activo de 37 teclas
- [ ] Permitir desplazar el rango con controles de scroll/flechas
- [ ] Mostrar indicadores de nota (C2, C3, C4, etc.) en el rango activo
- [ ] Actualizar en tiempo real sin interrumpir la reproducción

**Controles Requeridos:**
- Botones de flecha izquierda/derecha (mover 1 tecla)
- Botones de octava izquierda/derecha (mover 12 teclas)
- Slider horizontal para posicionamiento rápido
- Atajos de teclado (← → para teclas, Ctrl+← Ctrl+→ para octavas)
- Presets rápidos: C2-C5, C3-C6, C4-C7, etc.

#### RF-002: Mapeo MIDI Inteligente
**Prioridad:** CRÍTICA  
**Descripción:** Mapear las 37 teclas físicas al rango seleccionado en el piano virtual

**Criterios de Aceptación:**
- [ ] Detectar automáticamente controlador MIDI de 37 teclas
- [ ] Mapear tecla física 1 → nota virtual según rango seleccionado
- [ ] Mantener mapeo consistente durante transposición
- [ ] Mostrar feedback visual de teclas presionadas en ambos pianos (físico y virtual)
- [ ] Guardar último rango usado en localStorage

#### RF-003: Visualización de Piano Adaptativa
**Prioridad:** CRÍTICA  
**Descripción:** Piano visual de 88 teclas que muestra solo las 37 teclas del rango seleccionado

**Criterios de Aceptación:**
- [ ] Piano completo de 88 teclas en el fondo (contexto)
- [ ] Solo las 37 teclas del rango seleccionado son visibles/destacadas
- [ ] Teclas fuera del rango: ocultas o muy atenuadas
- [ ] Animación suave al cambiar rango (300ms)
- [ ] Mostrar etiquetas de nota solo en teclas visibles
- [ ] Indicador numérico: "Rango: C3 - C6" (37 teclas)
- [ ] Zoom automático para centrar las 37 teclas visibles

---

### 2.2 Soporte MIDI Avanzado

#### RF-004: Pitch Bend
**Prioridad:** ALTA  
**Descripción:** Soporte completo para rueda de pitch bend del controlador

**Criterios de Aceptación:**
- [ ] Detectar mensajes MIDI Pitch Bend (0xE0)
- [ ] Rango configurable: ±1, ±2, ±7, ±12 semitonos
- [ ] Aplicar pitch bend a todas las notas activas
- [ ] Indicador visual de pitch bend en UI
- [ ] Suavizado de pitch bend para evitar saltos
- [ ] Configuración por track (habilitar/deshabilitar)

#### RF-005: Velocity Sensitivity (Sensibilidad de Fuerza)
**Prioridad:** ALTA  
**Descripción:** Responder a la fuerza con la que se presionan las teclas

**Criterios de Aceptación:**
- [ ] Leer valores MIDI velocity (0-127)
- [ ] Ajustar volumen de nota según velocity
- [ ] Curva de velocity configurable: Lineal, Logarítmica, Exponencial
- [ ] Rango de velocity ajustable (min/max)
- [ ] Indicador visual de velocity en teclas presionadas
- [ ] Configuración por track

#### RF-006: Aftertouch (Opcional - Fase 2)
**Prioridad:** MEDIA  
**Descripción:** Soporte para presión después de presionar tecla

**Criterios de Aceptación:**
- [ ] Detectar Channel Aftertouch (0xD0)
- [ ] Detectar Polyphonic Aftertouch (0xA0)
- [ ] Aplicar modulación de volumen/vibrato
- [ ] Configuración de sensibilidad

#### RF-007: Sustain Pedal
**Prioridad:** ALTA  
**Descripción:** Soporte para pedal de sustain

**Criterios de Aceptación:**
- [ ] Detectar Control Change 64 (Sustain)
- [ ] Mantener notas sonando mientras pedal está presionado
- [ ] Indicador visual de estado del pedal
- [ ] Configuración de comportamiento (half-pedal si es soportado)

---

### 2.3 Reproducción de Archivos MIDI

#### RF-008: Carga de Archivo MIDI
**Prioridad:** CRÍTICA  
**Descripción:** Cargar y parsear archivos MIDI estándar

**Criterios de Aceptación:**
- [ ] Soportar formato MIDI 0 y 1
- [ ] Drag & drop de archivos .mid
- [ ] Botón "Abrir archivo"
- [ ] Incluir "Für Elise" por defecto
- [ ] Mostrar información: título, duración, tracks, tempo
- [ ] Validar integridad del archivo

#### RF-009: Controles de Reproducción
**Prioridad:** CRÍTICA  
**Descripción:** Controles estándar de reproductor

**Criterios de Aceptación:**
- [ ] Play/Pause/Stop
- [ ] Barra de progreso interactiva (seek)
- [ ] Indicador de tiempo: actual / total
- [ ] Control de velocidad: 25%, 50%, 75%, 100%, 125%, 150%, 200%
- [ ] Loop de sección seleccionada
- [ ] Saltar por compases (← →)
- [ ] Saltar por beats (Shift+← Shift+→)

#### RF-010: Visualización de Notas Cayendo
**Prioridad:** CRÍTICA  
**Descripción:** Sistema de falling notes como Midiano

**Criterios de Aceptación:**
- [ ] Notas caen desde arriba hacia piano
- [ ] Velocidad de caída sincronizada con tempo
- [ ] Colores por track (configurables)
- [ ] Línea roja de "impacto" en el piano
- [ ] Renderizado suave (60 FPS mínimo)
- [ ] Zoom horizontal (ver más/menos tiempo)
- [ ] Scroll vertical para ver diferentes octavas

---

### 2.4 Gestión de Tracks

#### RF-011: Panel de Tracks
**Prioridad:** ALTA  
**Descripción:** Configuración individual por track

**Criterios de Aceptación:**
- [ ] Listar todos los tracks del MIDI
- [ ] Nombre de track editable
- [ ] Selector de instrumento (128 instrumentos GM)
- [ ] Control de volumen (0-100%)
- [ ] Mute/Solo por track
- [ ] Selector de color (2 colores por track)
- [ ] Botón "Reset" para valores por defecto
- [ ] Mostrar número de notas por track

#### RF-012: Instrumentos MIDI
**Prioridad:** ALTA  
**Descripción:** Soporte completo para General MIDI

**Criterios de Aceptación:**
- [ ] 128 instrumentos GM Level 1
- [ ] Soundfont de alta calidad (FluidR3_GM o similar)
- [ ] Cambio de instrumento en tiempo real
- [ ] Previsualización de instrumento (tocar nota de prueba)
- [ ] Búsqueda de instrumentos por nombre
- [ ] Categorías: Piano, Chromatic, Organ, Guitar, Bass, Strings, etc.

---

### 2.5 Configuraciones Avanzadas

#### RF-013: Configuración de Audio
**Prioridad:** ALTA  
**Descripción:** Ajustes de calidad y rendimiento de audio

**Criterios de Aceptación:**
- [ ] Volumen maestro (0-100%)
- [ ] Reverb (tipo y cantidad)
- [ ] Chorus (activar/desactivar, intensidad)
- [ ] Latencia de audio ajustable
- [ ] Selector de soundfont (múltiples opciones)
- [ ] Calidad de audio: Baja, Media, Alta

#### RF-014: Configuración Visual
**Prioridad:** MEDIA  
**Descripción:** Personalización de la interfaz

**Criterios de Aceptación:**
- [ ] Tema oscuro/claro
- [ ] Tamaño de piano (pequeño, mediano, grande)
- [ ] Mostrar/ocultar nombres de notas en teclas
- [ ] Efectos de partículas (activar/desactivar)
- [ ] Grosor de líneas de compás/beat
- [ ] Color de líneas de compás/beat
- [ ] Transparencia de notas cayendo

#### RF-015: Configuración MIDI
**Prioridad:** ALTA  
**Descripción:** Ajustes específicos de MIDI

**Criterios de Aceptación:**
- [ ] Selección de dispositivo MIDI de entrada
- [ ] Selección de dispositivo MIDI de salida
- [ ] Canal MIDI (1-16)
- [ ] Transposición global (±24 semitonos)
- [ ] Offset de latencia MIDI
- [ ] Modo de entrada: Espera notas correctas / Libre

---

### 2.6 Diseño Moderno y Profesional

#### RF-016: Interfaz de Usuario Moderna
**Prioridad:** ALTA  
**Descripción:** Diseño visual atractivo y profesional

**Criterios de Aceptación:**
- [ ] Diseño glassmorphism o neumorphism
- [ ] Gradientes y sombras suaves
- [ ] Animaciones fluidas (CSS transitions)
- [ ] Iconos modernos (Lucide, Heroicons, o similar)
- [ ] Tipografía profesional (Inter, Poppins, o similar)
- [ ] Responsive design (desktop, tablet, mobile)
- [ ] Paleta de colores musical (púrpuras, azules, dorados)

#### RF-017: Experiencia de Usuario
**Prioridad:** ALTA  
**Descripción:** Interacciones intuitivas y fluidas

**Criterios de Aceptación:**
- [ ] Tooltips informativos
- [ ] Feedback visual en todas las acciones
- [ ] Atajos de teclado documentados
- [ ] Tutorial interactivo para nuevos usuarios
- [ ] Mensajes de error claros
- [ ] Loading states elegantes
- [ ] Confirmaciones para acciones destructivas

---

## 3. REQUISITOS NO FUNCIONALES

### 3.1 Rendimiento

#### RNF-001: Latencia de Audio
- Latencia máxima: 20ms desde presionar tecla hasta escuchar sonido
- Latencia objetivo: <10ms

#### RNF-002: Renderizado Visual
- 60 FPS constante en visualización de notas
- Tiempo de carga inicial: <3 segundos
- Cambio de rango de octavas: <100ms

#### RNF-003: Uso de Recursos
- Uso de CPU: <30% en reproducción normal
- Uso de RAM: <500MB
- Tamaño de soundfont: <50MB (comprimido)

### 3.2 Compatibilidad

#### RNF-004: Navegadores
- Chrome/Edge 90+ (soporte completo Web MIDI)
- Firefox 90+ (sin Web MIDI, solo reproducción)
- Safari 14+ (sin Web MIDI, solo reproducción)

#### RNF-005: Dispositivos MIDI
- Controladores de 25, 37, 49, 61, 88 teclas
- Detección automática de número de teclas
- Soporte para pitch bend wheel
- Soporte para modulation wheel
- Soporte para pedales (sustain, expression)

### 3.3 Usabilidad

#### RNF-006: Accesibilidad
- Navegación por teclado completa
- Contraste WCAG AA mínimo
- Etiquetas ARIA para lectores de pantalla
- Tamaños de fuente ajustables

#### RNF-007: Internacionalización
- Interfaz en español (prioridad)
- Soporte para inglés (futuro)
- Notación musical internacional

---

## 4. CONTENIDO Y RECURSOS

### 4.1 Canciones Incluidas

#### RC-001: Für Elise
**Prioridad:** CRÍTICA  
- Archivo MIDI completo de Für Elise
- Tracks originales de Midiano
- Metadata: compositor, año, dificultad

#### RC-002: Biblioteca Futura (Fase 2)
- Canciones para principiantes
- Obras clásicas populares
- Sistema de categorías por compositor

### 4.2 Soundfonts

#### RC-003: Soundfont Principal
- FluidR3_GM o equivalente de alta calidad
- 128 instrumentos GM
- Samples de percusión completos

#### RC-004: Soundfonts Adicionales (Fase 2)
- Piano de concierto premium
- Instrumentos orquestales realistas
- Sintetizadores modernos

---

## 5. CASOS DE USO PRINCIPALES

### CU-001: Ajustar Rango de Octavas
**Actor:** Usuario con piano de 37 teclas  
**Flujo:**
1. Usuario conecta controlador MIDI de 37 teclas
2. Sistema detecta y muestra piano virtual de 88 teclas
3. Sistema resalta rango activo (por defecto C3-C6)
4. Usuario necesita tocar nota B2 (una tecla antes del rango)
5. Usuario hace clic en botón "← Octava" o presiona Ctrl+←
6. Sistema desplaza rango a C2-C5
7. Usuario puede tocar B2 en su controlador
8. Sistema guarda nuevo rango en localStorage

### CU-002: Practicar con Für Elise
**Actor:** Estudiante de piano  
**Flujo:**
1. Usuario abre aplicación
2. Sistema carga Für Elise por defecto
3. Usuario ajusta velocidad a 75%
4. Usuario activa modo "Espera notas correctas"
5. Usuario presiona Play
6. Sistema espera a que usuario toque primera nota correcta
7. Usuario toca nota en controlador MIDI
8. Sistema valida nota y continúa reproducción
9. Sistema muestra feedback visual (verde = correcto, rojo = incorrecto)

### CU-003: Usar Pitch Bend
**Actor:** Músico expresivo  
**Flujo:**
1. Usuario está tocando una melodía
2. Usuario mueve rueda de pitch bend hacia arriba
3. Sistema detecta mensaje MIDI Pitch Bend
4. Sistema aplica pitch bend a notas activas
5. Sistema muestra indicador visual de pitch bend
6. Usuario suelta rueda, vuelve a posición central
7. Sistema restaura pitch normal

### CU-004: Configurar Velocity Sensitivity
**Actor:** Usuario avanzado  
**Flujo:**
1. Usuario abre panel de configuración MIDI
2. Usuario selecciona curva de velocity "Exponencial"
3. Usuario ajusta rango mínimo a 40, máximo a 127
4. Usuario toca teclas suavemente → volumen bajo
5. Usuario toca teclas fuerte → volumen alto
6. Sistema respeta configuración en tiempo real

---

## 6. RESTRICCIONES Y SUPUESTOS

### 6.1 Restricciones Técnicas
- Debe funcionar en navegadores web (no app nativa)
- Requiere Web Audio API
- Requiere Web MIDI API para entrada MIDI
- No puede acceder a drivers de sistema directamente

### 6.2 Supuestos
- Usuario tiene controlador MIDI con drivers instalados
- Usuario usa navegador compatible (Chrome/Edge)
- Usuario tiene conexión a internet para carga inicial
- Usuario tiene altavoces o audífonos funcionales

### 6.3 Dependencias
- Librería de parsing MIDI (midi-parser-js o similar)
- Librería de audio (Tone.js o Web Audio API nativo)
- Librería de UI (React, Vue, o Svelte)
- Soundfont loader (soundfont-player o similar)

---

## 7. CRITERIOS DE ÉXITO

### 7.1 Métricas de Éxito
- [ ] Usuario puede cambiar rango de octavas en <2 segundos
- [ ] Latencia de audio <15ms en promedio
- [ ] 60 FPS en visualización de notas
- [ ] Pitch bend responde sin lag perceptible
- [ ] Velocity sensitivity es natural y expresiva
- [ ] Für Elise se reproduce perfectamente
- [ ] Interfaz es intuitiva (usuario nuevo puede usar en <5 min)

### 7.2 Pruebas de Aceptación
- [ ] Prueba con controlador de 37 teclas real
- [ ] Prueba de transposición durante reproducción
- [ ] Prueba de pitch bend en diferentes rangos
- [ ] Prueba de velocity con diferentes curvas
- [ ] Prueba de rendimiento con múltiples tracks
- [ ] Prueba de usabilidad con 5 usuarios

---

## 8. ROADMAP DE IMPLEMENTACIÓN

### Fase 1: MVP (4-6 semanas)
- Sistema de transposición de octavas
- Carga y reproducción de MIDI
- Visualización de notas cayendo
- Soporte MIDI básico (entrada, velocity)
- Für Elise incluido
- Diseño moderno básico

### Fase 2: Características Avanzadas (3-4 semanas)
- Pitch bend completo
- Panel de tracks con configuración
- Todos los instrumentos GM
- Configuraciones avanzadas
- Efectos de audio (reverb, chorus)
- Modo de práctica (espera notas)

### Fase 3: Pulido y Optimización (2-3 semanas)
- Optimización de rendimiento
- Animaciones y efectos visuales
- Tutorial interactivo
- Biblioteca de canciones expandida
- Pruebas exhaustivas
- Documentación

---

## 9. CARACTERÍSTICAS CONFIRMADAS

### ✅ Incluidas:
1. **Grabar interpretación MIDI** - Sí
2. **Exportar audio (WAV/MP3)** - Sí
3. **Compartir presets** - Sí
4. **Integración con cloud storage** - Sí
5. **Modo offline (PWA)** - Sí
6. **Estadísticas de práctica** - Sí

### ❌ Excluidas:
1. **Múltiples controladores simultáneos** - No

### 🎹 Visualización de Piano:
- Piano visual de 88 teclas (contexto completo)
- **Solo 37 teclas visibles** del rango seleccionado
- Teclas fuera del rango: ocultas o muy atenuadas
- Independiente del hardware del controlador
- Zoom automático en las 37 teclas activas

---

## 10. REQUISITOS ADICIONALES

### 10.1 Grabación y Exportación

#### RF-018: Grabación MIDI
**Prioridad:** ALTA  
**Descripción:** Grabar interpretación del usuario

**Criterios de Aceptación:**
- [ ] Botón "Grabar" en controles principales
- [ ] Grabar notas MIDI con timing preciso
- [ ] Grabar pitch bend, velocity, pedales
- [ ] Indicador visual de grabación activa
- [ ] Reproducir grabación inmediatamente
- [ ] Guardar como archivo MIDI (.mid)
- [ ] Nombre automático con fecha/hora

#### RF-019: Exportación de Audio
**Prioridad:** MEDIA  
**Descripción:** Exportar reproducción como audio

**Criterios de Aceptación:**
- [ ] Exportar a WAV (sin pérdida)
- [ ] Exportar a MP3 (comprimido)
- [ ] Calidad configurable: 128kbps, 192kbps, 320kbps
- [ ] Incluir efectos (reverb, chorus) en exportación
- [ ] Barra de progreso durante exportación
- [ ] Nombre de archivo personalizable

### 10.2 Compartir y Sincronización

#### RF-020: Sistema de Presets
**Prioridad:** MEDIA  
**Descripción:** Guardar y compartir configuraciones

**Criterios de Aceptación:**
- [ ] Guardar preset: nombre, configuración completa
- [ ] Exportar preset como archivo JSON
- [ ] Importar preset desde archivo
- [ ] Compartir preset por URL
- [ ] Galería de presets de la comunidad
- [ ] Presets por defecto incluidos

#### RF-021: Integración Cloud
**Prioridad:** BAJA (Fase 3)  
**Descripción:** Sincronizar con servicios de almacenamiento

**Criterios de Aceptación:**
- [ ] Conectar con Google Drive
- [ ] Conectar con Dropbox
- [ ] Guardar archivos MIDI en cloud
- [ ] Guardar presets en cloud
- [ ] Sincronización automática
- [ ] Acceso desde múltiples dispositivos

### 10.3 Modo Offline y PWA

#### RF-022: Progressive Web App
**Prioridad:** MEDIA  
**Descripción:** Funcionar sin conexión a internet

**Criterios de Aceptación:**
- [ ] Service Worker para cache
- [ ] Funcionalidad completa offline
- [ ] Instalar como app de escritorio
- [ ] Icono y splash screen
- [ ] Actualización automática en background
- [ ] Notificaciones de nueva versión

### 10.4 Estadísticas y Progreso

#### RF-023: Sistema de Estadísticas
**Prioridad:** MEDIA  
**Descripción:** Seguimiento de práctica y progreso

**Criterios de Aceptación:**
- [ ] Tiempo total de práctica
- [ ] Canciones practicadas
- [ ] Notas correctas vs incorrectas
- [ ] Precisión de timing
- [ ] Gráficas de progreso semanal/mensual
- [ ] Racha de días consecutivos
- [ ] Logros y badges
- [ ] Exportar estadísticas como PDF/CSV

---

**Próximo Paso:** Revisar y aprobar requisitos, luego pasar a Diseño Técnico
