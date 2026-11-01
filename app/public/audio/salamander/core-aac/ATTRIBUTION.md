# Salamander Grand Piano — AAC para compatibilidad

Estas siete muestras son **conversiones con pérdida** de los siete OGG núcleo
grabados por **Alexander Holm**. Se distribuyen bajo la licencia
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). La conversión a
AAC-LC/M4A se hizo para navegadores Safari anteriores a iOS 18.4 que no
decodifican Ogg Vorbis. No son grabaciones nuevas ni sonidos sintetizados.

El [manifiesto](manifest.json) enlaza cada derivado a su archivo OGG fuente
mediante SHA-256 e incluye codec, herramienta, parámetros de codificación y
hash del archivo resultante. Se pueden reconstruir con
`node scripts/build-salamander-core-aac.mjs` desde los OGG verificados del
proyecto. La [atribución original](../core/ATTRIBUTION.md) conserva las fuentes
y el aviso de licencia. La calidad del derivado requiere escucha física antes
de aprobarse como sustituto sonoro.
