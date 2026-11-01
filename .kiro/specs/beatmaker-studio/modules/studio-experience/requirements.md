# UXP — Studio, Pistas y Configuración: requisitos

Estado: pendiente. Interfaz moderna para producir sin ocultar estado técnico ni operaciones editables.

## Historias y criterios

- UXP-01 Sólo tres secciones principales: Studio, Pistas y Configuración. Studio muestra proyecto, guardado, transporte y espacios Pads/Pasos, Piano roll, Arreglo, Sampler y Mixer; cambiar espacio no detiene audio ni pierde selección.
- UXP-02 Ruta inicial completa en pasos claros: crear proyecto, elegir kit, hacer loop, dibujar/grabar 808 y piano, variar, ordenar intro/verso/hook, mezclar y exportar. No usa canciones demo retiradas ni datos falsos.
- UXP-03 Pistas distingue tomas MIDI propias de proyectos propios, con metadatos, búsqueda/orden, abrir, renombrar, exportar y eliminación explícita. Una toma antigua puede importarse a proyecto sin dejar de existir.
- UXP-04 Configuración ofrece entrada/salida y latencia, permisos, diagnóstico MIDI físico, perfiles Elite/Pro, MIDI Learn, bibliotecas instaladas, créditos/licencias, cuota y respaldo. Estado no verificado se nombra así.
- UXP-05 Transporte muestra pista armada, grabando/capturando, loop, metrónomo, BPM, compás, posición y dueño de audio. Errores de banco/permiso/guardado/clipping aparecen en el contexto donde ocurren.
- UXP-06 Atajos editables o documentados sin conflicto con teclado de interpretación; foco visible, ARIA/labels, contraste, tamaño táctil y edición numérica accesible. Undo/redo y cancelación de operaciones de riesgo tienen feedback.
- UXP-07 Layout ancho y estrecho: paneles que se repliegan manteniendo pista/clip activo, sin exigir scroll horizontal de toda la app. Navegar miles de notas/clips mantiene controles operables.
- UXP-08 Primer uso offline toca el núcleo local; paquetes remotos requieren decisión visible de descarga. El estado “descargado” se basa en integridad/hash local, no en un enlace HTTP.

## Aceptación

Usuario completa el beat fixture con mouse/teclado y con SMK-37; auditoría de foco/lectores de pantalla en flujos críticos; Pistas conserva tomas; ninguna ruta o asset activo reintroduce Música/Canciones/player/Juego/Partitura.
