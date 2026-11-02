# Auditoría de desviaciones Spec-Driven — Studio de referencia

**Corte:** 2026-11-02 · rama `design/studio-reference-ui-20261101` · PR [#5](https://github.com/afontalvo26/piano-midi-pro/pull/5) (borrador, sin merge).

## Jerarquía de contratos

1. El contrato de producto y los 113 IDs viven en [requirements.md](requirements.md), [README.md](README.md) y `modules/*/requirements.md`.
2. Las reglas de implementación viven en `contracts.md` y en el diseño de cada módulo.
3. Las tareas no equivalen a aceptación: `tasks.md` describe trabajo y `acceptance-evidence.json` conserva el estado de cada ID.
4. [docs/UI-REFERENCE-1586.md](../../../docs/UI-REFERENCE-1586.md) fija geometría y apariencia del mockup, pero **no puede modificar silenciosamente el alcance funcional ni reemplazar las pruebas**.
5. Un requisito se marca `approved` sólo después de ejecutar las pruebas pertinentes y archivar evidencia por commit, con entorno, artefacto y resultado. Ninguno de los cambios de este PR está así certificado.

## Desviaciones concretas

| Hallazgo | IDs | Diagnóstico frente al spec | Acción y situación |
|---|---|---|---|
| SDD-01 · **Conflicto de alcance** | UXP-01, UXP-08 | El contrato excluye la *Partitura* heredada. El mockup aprobado contiene una pestaña «Partitura» y el PR incorporó `StudioScore.tsx` sin decisión explícita de cambio. | **Bloqueado por decisión de producto:** la vista actual es un lector interno del patrón propio, sin ruta heredada ni canciones externas. No equivale a aceptación del feature. Requiere decisión documentada de conservar esta lectura interna o retirarla antes de release; no alterar el contrato a posteriori para declarar éxito. |
| SDD-02 · **Sin QA ejecutado** | QLT-08, QLT-09 | PR con comprobaciones de GitHub Actions que terminan en fallo sin `steps` ni logs de build. | **Bloqueado:** no afirmar TypeScript, ESLint, build o Playwright aprobados. Reparar ejecución del runner y ejecutar suites antes de merge. |
| SDD-03 · **Fidelidad pixel no verificada** | UXP-06, UXP-07 | Existe CSS, pero no captura comparada en navegador real a 1586×992 ni auditoría a 320/390/200% zoom. | **Pendiente:** screenshot pixel-diff, foco, targets táctiles, errores y estados de carga. |
| SDD-04 · Dispositivo MIDI inventado | MID-01, UXP-04 | La UI anterior ponía «SMK-37 conectado» al detectar cualquier entrada MIDI. | **Corregido en código, no aceptado:** etiqueta genérica y nombre de entrada real; falta navegador con puerto genérico. |
| SDD-05 · Transporte mal enlazado | CLK-01, UXP-05 | El botón visual «avanzar» llamaba Play/Pause. | **Corregido en código:** avance de un compás por tick; falta prueba con audio. |
| SDD-06 · Bucle fijo y métrica errónea | CLK-02, CLK-03 | Bucle rígido 5–12 y cálculo uniforme desde primer compás, contradiciendo rango libre y meterMap. | **Corregido en código:** edición de inicio/final de compás y conversión de tick con meterMap; pendientes 100 vueltas y cambios métricos durante playback real. |
| SDD-07 · Errores ocultos | PRJ-02, UXP-05 | La nueva pantalla escondía el header anterior, sin errores completos de guardado, proyecto, MIDI o banco. | **Corregido en código:** alerta, indicador de preparación y reintento de guardado; falta QA de permisos, cuota y pérdida de activo. |
| SDD-08 · Undo/Redo ausentes | PRJ-02, UXP-06 | Los comandos eran reversibles pero no había acción visible en la nueva pantalla. | **Corregido en código:** acciones reales de sesión y estado `canUndo/canRedo`; falta prueba end-to-end de persistencia/revertir. |
| SDD-09 · Instrumento por pista no satisfecho | INS-01, INS-06 | El navegador integrado selecciona **sonido live global**, no preset de la pista del proyecto; el sink de proyecto no replica toda la librería WAF. | **Pendiente:** resolver selección/versionado/bancos por pista y paridad live/exportación; no declararlo funcional por el control de biblioteca. |
| SDD-10 · Cuantización rápida parcial | ROL-04 | El botón del arreglo cuantiza destructivamente el patrón fuente (incluidas otras instancias) sin preescucha/fuerza/swing. | **Parcial:** algoritmo reversible añadido; editor ROL original tiene herramientas avanzadas. Se requiere etiqueta explícita de edición compartida y confirmación/alternativa segura. |
| SDD-11 · Arreglo limitado | ARR-01, ARR-02, ARR-07 | La vista compacta enseña 16 compases y operaciones básicas, sin todos los gestos avanzados ni navegación de proyectos largos. | **Parcial:** editor Arrangement completo sigue accesible. No afirmar integración completa mientras haya fuga a vista antigua. |
| SDD-12 · Deshacer visual no equivale a save | PRJ-01, PRJ-02 | El nuevo shell despacha comandos, pero aún no hay prueba completa crear→editar→save→reload→undo/redo→export tras rediseño. | **Pendiente:** fixture real sin datos inventados; inyección de errores de cuota, bloqueo de IndexedDB y CAS. |
| SDD-13 · Macro no validado por audio audible | MIX-02, MIX-03 | Los mandos se conectan a procesadores reales y dispatch, pero falta evidencia de PCM/escucha, cambios suaves y equivalencia de render. | **Parcial:** no aceptar por simple test de estructura de efectos. |
| SDD-14 · Latencia física desconocida | CLK-05, QLT-04 | `baseLatency/outputLatency` dan un estimado del búfer, no MIDI→altavoz p95/p99. CPU real tampoco está medida. | **Pendiente físico:** mantener etiqueta honesta y no certificar SMK-37 Elite/Pro sin loopback y 37+37. |
| SDD-15 · Gate transversal abierto | UXP-02, QLT-06, QLT-09 | No hay recorrido completo del **nuevo** Studio: batería + 808 + piano, cinco ediciones, intro/verso/hook, overdub, paquete, stems y WAV cotejados. | **Pendiente:** ejecutar desde proyecto propio sin recurrir a datos de demo y adjuntar capturas, audio y hashes. |

Los cambios señalados como **corregidos en código** son propuestas no verificadas con build ni navegador. El estado de aceptación de esos IDs permanece **pending**.

## Evidencia que bloquea el cierre

- **Inventario:** `acceptance-evidence.json` sigue con 113/113 `pending`, 0/113 `approved`. Mantenerlos así hasta registrar pruebas reales.
- **CI:** [workflow Studio reference visual QA](https://github.com/afontalvo26/piano-midi-pro/actions) termina en fallo antes de pasos observables; no heredar resultados del corte de Codex del 2026-11-01 para commits nuevos.
- **Línea base:** `implementation-status.md` documenta pruebas históricas previas a esta rama. No acredita la nueva UI.
- **Hardware:** `smk37-elite-physical-evidence.json` aún no demuestra ciclos 37+37 con CC64/66/67, audio loopback y latencia.
- **Aceptación visual:** los tests geométricos de cajas son necesarios pero no sustituyen pixel-diff del mockup aprobado ni revisión de todos los estados.

## Puertas operativas para este PR

1. **Contrato:** resolver SDD-01, probar SDD-09, SDD-10, SDD-11 y completar criterios de interacción/navegación.
2. **Ejecutabilidad:** recuperar runner o ejecutar `scripts/validate-studio.ps1` en checkout real y publicar logs para el SHA exacto.
3. **Verificación:** TypeScript, ESLint de archivos tocados, Vite build, Playwright y tests de scheduler; analizar audio PCM, no sólo DOM.
4. **UX:** comparar screenshot y estados con referencia 1586×992; repetir 1440×900, 1024×768, 390×844, 320×568 y zoom 200%.
5. **Aceptación:** probar escenario musical transversal, conservación de tomas, permisos/cuota y guardado; crear evidencia asociada a cada ID. Sólo `scripts/verify-beatmaker-acceptance.mjs --release` puede liberar un corte con evidencias completas.

## Cómo corregir el proceso

Para cada cambio siguiente: **ID de spec → criterio Given/When/Then → diseño/contrato técnico → prueba que falla → implementación → pruebas ejecutadas + métricas → evidencia con SHA → aceptación**. Si el mockup contradice la spec, abrir primero una decisión de cambio, no decidirlo silenciosamente desde JSX.

**Estado final de este documento:** auditoría abierta, sin certificación de release.


## Continuación de correcciones del código (2026-11-02; sin aceptación)

Estas intervenciones posteriores **no** cambian el estado de los 113 criterios ni certifican un build:

- **INS-01/INS-06:** se añadió `replaceTrackInstrument` al comando CAS con Undo/Redo y un selector de **bancos instalados reconocidos por el sink del proyecto** (Salamander y bajo 808 Fischer) por pista. El catálogo WebAudioFont sigue siendo **global para tocar en vivo** y debe identificarse así; no se promete paridad live/export para presets WebAudioFont. Pendiente instalar/validar otras familias por pista.
- **MID/UXP-02:** se integró el componente real `RecordedOverdubPanel` en el inspector contextual para previsualizar/confirmar tomas MIDI guardadas, sin borrar originales. Se añadieron reintento y exportación de emergencia cuando una toma falla al guardar. Falta prueba real de capturar→guardado→previsualizar→commit→recarga.
- **ARR-02/ROL-04:** cuantización rápida bloquea ahora una fuente utilizada por varios clips sin separación; «Hacer único» reutiliza el comando reversible existente. Falta comprobar Undo/Redo y render de la señal después del cambio.
- **CLK-01:** «Ir al inicio» ya no detiene el transporte, ejecuta Seek a tick 0. «Avanzar un compás» mantiene su significado. La región de bucle es editable y respeta cambios de métrica.
- **UXP-06:** los gestos de ganancia, panorámica y macros usan un borrador sincronizado para confirmar cada valor **una sola vez** al soltar; una pérdida de foco posterior no debe enviar un comando duplicado.
- **QLT-08/QLT-09:** el gate `--release` exige varias clases de evidencia por criterio, incluyendo pruebas de código y producción, además de física/licencias para casos aplicables. Se añadió `tests/unit/beatmaker-acceptance-gate.test.mjs`, aún sin ejecutar.
- **Decisión de producto pendiente:** [ADR-UXP-001](decisions/ADR-UXP-001-score-preview.md) distingue explícitamente la pantalla heredada de Partitura (excluida) de un visor contextual de notas propias dentro del mockup aprobado. No es aprobación automática.

**Riesgos no resueltos:** runners de GitHub Actions sin pasos ejecutados; QA real de navegador/CPU/audio/fidelidad; SMK-37 físico Elite y Pro; 113 expedientes de aceptación sin evidencias completas. La palabra `implemented` significa cambios propuestos en código, no un criterio verde.


## Continuación de controles ARR-07, PRJ-01 y MIX-05 (mismo corte, aún no certificada)

| Contrato | Corrección en código | Prueba añadida y límites |
|---|---|---|
| ARR-07, CLK-02 | Arreglo ahora permite desplazamiento musical por páginas y zoom **4/8/16/32 compases**. El cálculo de posiciones usa `meterMap` y no 4/4 uniforme. La ventana acota correctamente clips, guía de bucle y cabezal; el botón «Centrar cabezal» vuelve a la región actual. | `studio-reference-ui.spec.ts` cubre dibujo en compases 17–24 y retorno. No acredita 500+ compases reales, carga de documentos grandes ni precisión a 200% de zoom. |
| ARR-01, UXP-07 | «Cortar» usa el tiempo audible de la porción visible de un clip que cruza el borde de la ventana. El cabezal utiliza la misma medida de columna que los carriles en 320, 390 y 1586 px. | Prueba de alineación añadida; falta ejecución de navegador y captura comparable. |
| MIX-05 | `ProjectAudioSink` ya no emite simultáneamente al master y a un bus aislado al activar solo sobre un bus auxiliar: añadió gate post-fader de salida principal, mantuvo gates separados de los sends y preservó en el stem directo la ruta que realmente llega al master. | `project-mixer-sends.spec.ts` compara energía PCM de bus solo vs ruta aislada, sin solo y punto directo; **prueba escrita no ejecutada**. Confirmar mezcla audible y ausencia de regresiones en buses encadenados. |
| PRJ-01, UXP-03 | Se reutiliza `ProjectBrowser` en una ventana modal dentro del Studio aprobado: crear, abrir, renombrar, duplicar, archivar, importar/exportar y recuperar borradores. `RecordedTracks` también se monta ahí para gestionar tomas sin regresar a la pantalla antigua. | `studio-reference-ui.spec.ts` cubre abrir/cerrar, crear proyecto y biblioteca. Faltan recuperación CAS, restauración de paquete y pérdida de permiso bajo overlay. |
| QLT-09 | Se amplió el workflow de referencia para incluir regresiones de routing PCM además de UI/transport. | GitHub Actions sigue sin ejecutar pasos del job; no asumir build o test verde. |

**Regla:** todos los criterios siguen `pending` hasta obtener artefactos firmados/identificados por el commit que superan sus pruebas de producción, audio y hardware pertinentes. Este documento no altera la matriz de aceptación.


### Instrument inspector after playback preparation

- **INS-06 / UXP-05:** the instrument card no longer displays an unconditional «✓ Activo». It reads the true `ProjectAudioDiagnostics.tracks` status of the selected project track: **Audio sin preparar**, **Preparando**, **Audio listo** or **Error de banco**, including the concrete error string. «Preparar audio del proyecto» calls the real preparation path.
- The sound displayed follows the **selected track bank** (Salamander or 808), not the separate global live-instrument picker. The project engine still needs browser validation, integrity verification of installed banks, and audio-loopback tests.
- Written regression: `tests/e2e/studio-reference-ui.spec.ts` checks an unloaded bank is not falsely labeled ready and that changing the selected project track updates the visible bank.
- **MIX-04 is still missing:** sidechain audio detector, explicit kick source, attack/release/ratio, live/offline equivalence and reduction meter. The solo/send isolation fix belongs to **MIX-05**, not MIX-04.
