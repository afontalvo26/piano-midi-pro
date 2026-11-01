# UXP — diseño

## Mapa de pantallas

Barra Studio persistente: nombre/revisión/guardado, transporte, BPM/compás, loop, grabación, metrónomo, audio/MIDI, clipping. Lateral izquierdo: pistas, kits, instrumentos y assets instalados. Centro: Pads/Pasos, Piano roll o Arreglo. Inspector derecho/inferior: nota/pad/clip, velocity/CC, sampler o mixer. Vista de interpretación conserva las 37 teclas. En ancho pequeño, una zona principal y un inspector desplegable.

Pistas presenta pestañas o filtro “Tomas MIDI” y “Proyectos”, ambos locales. El menú de una toma ofrece “Usar copia en proyecto”, exportar bytes y renombrar; no abre un reproductor heredado. Configuración separa dispositivo MIDI, audio/latencia, bibliotecas, almacenamiento/respaldo y diagnóstico.

## Estado de interacción

UI store contiene selección, zoom, panel y foco; PRJ contiene datos musicales. Los medidores y teclas live repintan por frame y no disparan rerender de PianoApp por cada nota. Las operaciones largas muestran progreso/cancelación; la UI distingue listo para tocar de descargando o renderizando. Los errores se conectan a acciones recuperables y no se esconden en consola.

Los atajos respetan foco en campos de texto y modo de interpretación; toda acción de arrastre tiene equivalente contextual/numérico. Un borrado de proyecto muestra identificación y resultado reversible cuando sea posible; borrar una toma original requiere confirmación específica de esa toma. La configuración de SMK-37 muestra etiqueta de evidencia por control.

## Validación visual

Prototipo y pruebas a 1440×900, 1024×768 y 390×844, zoom 200%, con teclado, puntero y lector de pantalla. Se comprueba que el espacio de notas, el mixer y los diálogos siguen operables y que no aparece contenido heredado en build.
