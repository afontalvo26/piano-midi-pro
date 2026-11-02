# QLT — diseño

## Matriz de evidencia

Cada requisito guarda id, fixture, entorno, resultado esperado, medición, archivo/log, fecha y estado. El fixture transversal construye kick/snare/hats, 808 y piano, edita cinco notas, graba overdub, duplica loop, arregla intro/verso/hook, guarda, recarga, exporta WAV/stems/MIDI y restaura paquete. La prueba de regresión corre sobre una copia local; no borra tomas del navegador.

Audio automatizado usa render determinista para medir picos, silencios, DC, continuidad de envolvente, afinación de notas estables y diferencias de tempo/eventos. Escucha humana compara A/B con nivel igualado y salida conocida; registra auriculares/altavoces y observaciones, incluyendo sonidos bajos, repetición y pedal. Medición física loopback usa entrada MIDI real, salida cableada y captura de señal para latencia; reporta sistema/driver/buffer/sampleRate.

## Indicadores y presupuestos

La línea base captura p50/p95/p99, dropouts, CPU, memoria, descarga y primer sonido. Antes de la primera implementación se aprueban valores numéricos de release por equipo de referencia y se almacenan en validation.md; una mejora medida en una máquina no se generaliza a todos los equipos. Para el scheduler, eventos del mismo tick deben producir el mismo tiempo programado; para datos, tolerancia de round-trip en ticks es cero salvo conversión PPQ documentada.

El audio de exportación no debe contener valores no finitos ni clipping no solicitado; el pico final se revisa con medidor de sample y true peak externo cuando sea posible. Las muestras piano con stretch tuning se comparan contra su tabla de referencia, no contra una A440 igual en todas las notas.

## Puertas

Pre-merge: estático, unitario, focales y build. Pre-release: suite transversal, inspección de dist, import/export, dos pestañas, offline y stress. Aprobación sonora: escucha física Elite y, para afirmar Pro, prueba Pro. Se conserva un reporte de diferencias conocidas, con bloqueo si afectan expresión, estabilidad o datos.


## Diagnóstico de plataforma GitHub Actions — 2026-11-01

En el workflow `studio-quality.yml`, el run 41364098020 presenta
dos jobs `failure` en 2–3 segundos, ambos con
`runner_id=0` y `steps=[]`. **No ejecutaron TypeScript, ESLint, Vite
ni Playwright.** Los logs de jobs no son accesibles en la conexión actual.
No se atribuye el error a compilación sin logs reales. Investigar permisos,
facturación/cuota o disponibilidad de runners en la interfaz Actions antes
de tratarlo como regresión del código.

Como respaldo reproducible en Windows, `scripts/validate-studio.ps1`
ejecuta `run-bounded.ps1` y deja todos los resultados en `.logs/`.
La salida exit 0 de cada comprobación y el commit exacto deben registrarse
en `validation.md` o evidencia por requisito. Ni la ausencia de logs ni
la existencia de scripts puede sustituir a una corrida real.
