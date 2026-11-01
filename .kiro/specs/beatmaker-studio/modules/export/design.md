# EXP — diseño

## Snapshot y render

ExportJob fija projectId, revisionHash, rango tick, sampleRate, formato, seed y opciones de cola/stems. El job lee un snapshot PRJ y congela referencias de paquete; ediciones posteriores no cambian el render en marcha. CLK/ARR generan eventos con el mismo código musical en modo offline; INS/SMP/MIX/AUT instancian un grafo de render compatible o informan incompatibilidad antes de iniciar.

WAV se codifica desde PCM float a profundidad elegida con limitación/dither según política documentada. El validador revisa encabezado, tamaño, duración, clipping sample peak y no finitos. Stems son renders de un grafo con fuente por pista/bus y sincronización común; los efectos de send compartidos requieren política explícita para evitar doble conteo al sumar stems.

SMF writer usa resolución del proyecto o conversión comprobada a PPQ; ordena tempo, time signature, CC, Note Off/On y end-of-track. La política de notas con probabilidad/ratchet decide si exporta eventos resueltos de una semilla concreta o metadatos propios; el archivo estándar contiene la ejecución resuelta.

## Paquete

Archivo con manifest JSON canónico, revisión, assets por hash y documentos de licencia. La importación se delega a PRJ, que valida rutas, tamaños, hashes, versión y colisiones antes de confirmar. Los paquetes oficiales con CC BY incorporan créditos; material del usuario se incluye por acción explícita.
