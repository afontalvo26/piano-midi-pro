# ADR-UXP-001 — Lectura de notas propia dentro del Studio aprobado

**Fecha:** 2026-11-02  
**Estado:** decisión de producto fijada; implementación pendiente de QA de release  
**Ámbito:** UXP-01 y ROL-05; no crea un requisito nuevo ni cambia los 113 IDs.

## Contexto

La especificación inicial elimina la **antigua pantalla autónoma de Partitura** y el reproductor de archivos MIDI de catálogo. Posteriormente, el usuario aprobó un mockup de Studio que incluye una pestaña visible «Partitura» junto al Piano Roll.

Ocultar el conflicto o modificar silenciosamente los requisitos fue un error. La UI aprobada es autoridad para el contenido visible, pero no habilita automáticamente la reinstalación del catálogo eliminado.

## Decisión de implementación

- Mantener el texto «Partitura» en el editor contextual para preservar la imagen aprobada.
- Su comportamiento es **visualización de lectura de las notas del patrón propio seleccionado**, dentro de Studio; comparte el proyecto versionado y no crea una nueva colección de canciones.
- No reutilizar el módulo `player/`, canciones MIDI de terceros, karaoke, Juego, rutas de biblioteca heredada ni la app autónoma de partituras.
- Se conserva el Piano Roll como única autoridad editable de notas. La pestaña de lectura no afirma soporte para grabado completo de símbolos, voces o partituras profesionales.
- El usuario puede volver al Piano Roll. Si el patrón no existe, se muestra estado vacío real.
- Todo archivo o recurso de la antigua app queda excluido del build de producción y de la navegación activa.

## Criterios de aceptación (sin aprobar)

1. Abrir un proyecto propio y seleccionar un patrón con notas; la pestaña muestra exclusivamente sus notas, no un catálogo.
2. Cambiar patrón actualiza la representación; las notas originales no se mutan al consultar la vista.
3. «Editar notas en Piano Roll» abre el editor real sin detener audio ni perder el proyecto.
4. No existen rutas ni archivos activos que revivan la antigua aplicación Partitura; verificar el `dist`.
5. Probar ausencia de notas, 10 000 notas, cambios de compás, zoom 200%, navegador real y pantalla de 390 px; documentar limitaciones de legibilidad.
6. Obtener comparación visual aprobada con el mockup a 1586×992.

**Decisión fijada:** se conserva la pestaña contextual «Partitura» porque forma parte del Studio visual aprobado, pero queda expresamente fuera de alcance cualquier pantalla/ruta/catálogo heredado de Partitura. Esto resuelve el conflicto de alcance de SDD-01; **no** aprueba UXP-01 ni autoriza merge/release sin sus pruebas.
