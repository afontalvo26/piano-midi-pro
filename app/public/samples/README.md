# Samples Reales de Instrumentos

## Trompeta y Trombón 100% Reales

Este directorio contiene samples reales de instrumentos de viento metal.

### Fuente recomendada: Philharmonia Orchestra (UK)
- **URL**: https://philharmonia.co.uk/resources/sound-samples/
- **Licencia**: CC BY-SA 3.0 (atribución requerida)
- **Calidad**: Orquesta profesional londinense, grabaciones individuales por nota

### Cómo descargar e instalar

1. Ve a https://philharmonia.co.uk/resources/sound-samples/
2. Descarga las secciones:
   - `trumpet` (trompeta)
   - `trombone` (trombón)
3. Convierte los archivos a `.ogg` (recomendado para web) o déjalos como `.wav`
4. Renombra cada archivo al formato:
   - `A3.ogg`, `Bb3.ogg`, `C4.ogg`, `Cs4.ogg` (sostenido = `s`), etc.
5. Coloca los archivos en:
   ```
   app/public/samples/trumpet/
   app/public/samples/trombone/
   ```

### Rangos necesarios

| Instrumento | Nota mínima | Nota máxima | Cantidad ~ |
|-------------|-------------|-------------|------------|
| Trumpet     | E3          | C6          | 32 notas   |
| Trombone    | E2          | F5          | 37 notas   |

### Formatos soportados
- `.ogg` — **Recomendado**, menor tamaño (~150KB por nota)
- `.wav` — Calidad máxima, tamaño mayor (~400KB por nota)
- `.mp3` — Compatible pero con latencia de decodificación

### Si no colocas samples
La app sigue funcionando 100% con el engine de síntesis actual (osciladores Sawtooth + filtros). Los samples reales solo se activan cuando existen los archivos.

### Alternativas gratuitas
- **Versilian VSCO2**: https://github.com/sgossner/VSCO2-CE (CC0)
- **University of Iowa**: http://theremin.music.uiowa.edu/MIS.html
