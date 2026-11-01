# PRJ — Proyecto y persistencia: requisitos

Estado: pendiente. Objetivo: que un beat propio continúe editable después de recargar, migrar, exportar y restaurar.

## Historias y criterios

- PRJ-01 Crear, renombrar, duplicar, archivar y abrir proyecto local. Cada proyecto tiene id, versión de esquema, fecha, tempo map, compás, pistas, patrones, clips, escenas, mezcla, automatización y referencias de activos. Los IDs permanecen estables entre guardados.
- PRJ-02 Autosave con indicador visible de guardado, pendiente o error. Un cierre a mitad de escritura devuelve la última revisión confirmada y ofrece recuperar cambios temporales verificables; nunca presenta datos incompletos como guardados.
- PRJ-03 Historial Deshacer/Rehacer por comandos de edición: agrupa gestos continuos, conserva el estado de selección cuando aporta contexto y no revierte grabaciones ya finalizadas sin acción explícita. Un comando fallido no altera el documento.
- PRJ-04 Guardar el proyecto editable y los bytes originales de las tomas MIDI existentes en almacenes separados. Pistas puede exportar una toma antigua byte a byte después de cualquier migración, limpieza de caché o actualización del service worker.
- PRJ-05 “Usar toma en proyecto” lee un SMF propio validado, crea patrón editable y conserva el original. Detecta archivo truncado, delta malformado, notas sin pareja y eventos desconocidos; informa la conversión parcial sin sobrescribir.
- PRJ-06 Audio y muestras se referencian por id/hash, longitud, formato, licencia/procedencia y estado. Si falta un archivo, el proyecto abre con advertencia y permite relocalizarlo o exportar lo salvable.
- PRJ-07 Copia portable versionada con manifiesto y hashes. Restaurar tiene previsualización y modo nueva copia; nunca sustituye un proyecto existente sólo por colisión de nombre.
- PRJ-08 Cuota y persistencia: estimación previa de importaciones grandes, respuesta a QuotaExceededError, uso visible, solicitud opcional de almacenamiento persistente y exportación de respaldo. No se declara durabilidad absoluta del navegador.

## Aceptación

Un fixture con 1000 notas, 20 clips, 10 activos y curvas se guarda, recarga y compara estructuralmente; se simula cierre antes de confirmar; una toma histórica conserva hash SHA-256; una muestra ausente no rompe la apertura; un paquete alterado falla la verificación sin reemplazar datos.
