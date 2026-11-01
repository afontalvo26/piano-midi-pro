# Virtuosity Drums — AAC de compatibilidad

Estas 38 muestras AAC-LC son conversiones de los OGG locales de
[Virtuosity Drums](../core/manifest.json), creados a partir de las grabaciones
profesionales de Austin McMahon para Versilian Studios LLC y Karoryfer Lecolds.
La [licencia original](../core/LICENSE) es CC0-1.0. Son los mismos golpes
grabados, con otra codificación; no hay síntesis de instrumentos.

El [manifiesto](manifest.json) conserva por archivo el hash del OGG, la ruta y
el hash de la grabación original, el codec, los canales y el hash del M4A.
`node scripts/build-recorded-drum-aac.mjs` reconstruye los derivados desde
los OGG verificados. Esta conversión con pérdida requiere escucha física antes
de aprobar su equivalencia sonora.
