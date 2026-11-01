# QLT — Calidad y aceptación transversal: requisitos

Estado: pendiente. La calidad del piano y del DAW se prueba con datos, audio y dispositivo físico.

## Contratos medibles

- QLT-01 Suite de nota live: 37 Note On simultáneos, 37 Note Off, sustain parcial/completo, dos acordes sucesivos, pads y loop en reproducción. Cero notas colgadas, cero pérdida de entrada, contadores de voces vuelven a cero y el instrumento sigue sonando después.
- QLT-02 Dinámica: velocidades 1–127 conservan los 127 valores de MIDI 1.0, sin aplanamiento accidental. En notas representativas se mide energía por velocity y continuidad de capas; se escuchan pp/p/mp/mf/f/ff con SMK-37. Se documenta cualquier piso de audibilidad/ruido inherente a muestra.
- QLT-03 Calidad: calibración de pitch por banco respetando la afinación real documentada, ausencia de NaN/DC/clic/truncamiento no intencionado, sample peak y true peak de exportación revisados, estéreo coherente y ausencia de clipping no solicitado.
- QLT-04 Latencia y estabilidad: medir MIDI→audio con loopback cableado por dispositivo/navegador/salida, p50/p95/p99 y jitter, antes y después; registrar objetivo de release y regresión máxima antes de implementar. Bluetooth y efectos del sistema se reportan como configuraciones separadas.
- QLT-05 Rendimiento: medir CPU/audio dropouts, PCM residente, tiempo de primera nota y scrolling con beat + 37 live; presupuestos por dispositivo de referencia se fijan tras línea base y se revisan en cada release.
- QLT-06 Fidelidad: igualdad estructural de proyecto tras guardar/reabrir, evento MIDI tras SMF round-trip, seed de probabilidad, paridad temporal live/offline, stems alineados y paquete restaurable.
- QLT-07 Robustez: cuota agotada, falta de activo/red, permisos denegados, desconexión MIDI/mic, cierre durante guardado, dos pestañas, service worker nuevo y suspensión de AudioContext no causan pérdida silenciosa ni dejan audio colgado.
- QLT-08 Evidencia por nivel: unit/contract, Chromium simulado, build de producción, medición loopback y audición Elite/Pro. Una simulación no valida timbre físico; Elite no valida Pro.
- QLT-09 Cada tanda de código corre tsc -b, ESLint de archivos tocados, Vite build y pruebas focales mediante run-bounded; suite completa sólo al cerrar cambios transversales. El dist no contiene demo/, covers/, samples/ ni player/ y sí siete OGG núcleo.

Las metas cuantitativas iniciales y el formato de evidencia están en [validation.md](../../validation.md). Si una medición demuestra que una meta es irreal para el equipo de referencia, se revisa por decisión documentada antes del cierre y nunca se rebaja para ocultar una regresión.

## Puerta de entrega

No cerrar un módulo con casillas de tareas únicamente: adjuntar fixture, versión, entorno, métricas, escucha cuando aplique y límites conocidos. Un fallo de sonido feo, clipping, lag persistente o nota pegada bloquea la aprobación sonora aunque los tests de UI pasen.
