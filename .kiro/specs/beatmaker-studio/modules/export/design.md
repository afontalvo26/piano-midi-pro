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

`stems=buses` con cualquier envío se rechaza expresamente durante preflight.
Ese tipo de stem requiere una señal capturada en un bus aislado: filtrar sólo
las pistas que alcanzan el bus NO basta, porque pueden conservar otras rutas
a master y generar contenido incorrecto. Tampoco se habilita el tap AUD-06
en rutas con envíos sin aislamiento completo de la señal.

**Pruebas previstas:** `project-mixer-sends.spec.ts` compara energía de
master seco/con envío, un stem individual, frames WAV y metadatos, y
comprueba el rechazo específico del bus stem con sends. Sigue pendiente
ejecutar y pasar el gate completo.
