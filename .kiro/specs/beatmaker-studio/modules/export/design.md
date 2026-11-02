# EXP — diseño

## Snapshot y render

ExportJob fija projectId, revisionHash, rango tick, sampleRate, formato, seed y opciones de cola/stems. El job lee un snapshot PRJ y congela referencias de paquete; ediciones posteriores no cambian el render en marcha. CLK/ARR generan eventos con el mismo código musical en modo offline; INS/SMP/MIX/AUT instancian un grafo de render compatible o informan incompatibilidad antes de iniciar.

WAV se codifica desde PCM float a profundidad elegida con limitación/dither según política documentada. El validador revisa encabezado, tamaño, duración, clipping sample peak y no finitos. Stems son renders de un grafo con fuente por pista/bus y sincronización común; los efectos de send compartidos requieren política explícita para evitar doble conteo al sumar stems.

SMF writer usa resolución del proyecto o conversión comprobada a PPQ; ordena tempo, time signature, CC, Note Off/On y end-of-track. La política de notas con probabilidad/ratchet decide si exporta eventos resueltos de una semilla concreta o metadatos propios; el archivo estándar contiene la ejecución resuelta.

## Paquete

Archivo con manifest JSON canónico, revisión, assets por hash y documentos de licencia. La importación se delega a PRJ, que valida rutas, tamaños, hashes, versión y colisiones antes de confirmar. Los paquetes oficiales con CC BY incorporan créditos; material del usuario se incluye por acción explícita.


## Corte EXP-02 — matriz de rutas con sends (sin aceptación)

El planificador permite `stems=none` y `stems=tracks` cuando hay envíos:
el renderer reconstruye todos los buses alcanzables por salida principal
**y** envíos desde las fuentes seleccionadas. Un stem de pista representa la
pista con todos sus envíos y retornos; incluye los efectos de buses y master
que pasan por la salida general. Los stems con buses compartidos no son
aditivos ni reconstruyen necesariamente la mezcla al sumarlos, en especial
con procesadores no lineales. La metadata `sendsIncluded` del WAV/ZIP
refleja la topología real, sin afirmar aditividad.

`stems=buses` con envíos ahora utiliza un tap aislado al bus elegido
después de sus inserts, volumen y panorama, pero antes de sus buses padre
y del master. La salida directa al master se captura por separado con
`tapDirectMaster`; las rutas paralelas hacia otros buses permanecen fuera
de cada salida capturada. Las fuentes capaces de alimentar un bus se
calculan por cualquiera de sus aristas de salida principal o send, sin
volver a crear los clips de la pista destino del resampling.

Los stems de buses anidados, los directos y los retornos de sends pueden
**solaparse**; el manifiesto establece `stemsAdditive=false` y
`busStemsOverlap` para no prometer reconstrucción por suma.

**Pruebas previstas:** `project-mixer-sends.spec.ts` compara energía de
master seco/con envío, stem de pista, bus aislado y salida directa;
`project-bus-resample.spec.ts` comprueba resampling de una fuente que
sólo llega al bus por un send, excluyendo destino y master. Sigue
pendiente ejecutar y pasar la regresión real.


### Selección audible de fuentes

El preflight `audioPlan.sourceCanReachOutput` recorre salida principal
y envíos, conservando los caminos hacia master que no tienen un bus
silenciado y pasando por buses solo cuando hay Solo activo. Una fuente
que alcanza un bus activo por envío no desaparece por estar silenciada
su otra salida principal. Los tests de MIX/EXP fijan el caso con bus
principal silenciado y send activo. Esta regla sólo se considera
aprobada después de ejecutar las pruebas focales y transversales.
