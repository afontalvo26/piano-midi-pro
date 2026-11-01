# CLK — Reloj, transporte y secuenciador: requisitos

Estado: pendiente. El transporte gobierna música propia de Studio y no crea un reproductor de canciones externo.

## Historias y criterios

- CLK-01 Play, Pause, Stop, Seek, BPM, compás, metrónomo y count-in comparten una posición musical. El cursor visual sigue el audio; sus repintados no activan notas.
- CLK-02 Un tempo map y cambios de compás colocan eventos de pista exactamente en la posición musical esperada. Las conversiones tick↔segundo son reversibles dentro de una tolerancia documentada.
- CLK-03 Un loop de cualquier longitud de compases repite el patrón sin ataques duplicados, huecos o notas eternas. En el límite de loop, notas que cruzan el borde siguen una política elegida por clip: cortar o continuar; se indica en UI.
- CLK-04 Seek, Stop, mute, solo, borrado de clip, cambio de escena y pérdida del lock cancelan solamente voces/programaciones afectadas. Una tecla física todavía presionada conserva su voz live.
- CLK-05 Latencia de entrada/salida y compensación de grabación se muestran y calibran; eventos MIDI mantienen su marca temporal original. No se promete cero latencia.
- CLK-06 Una única pestaña puede poseer salida. La segunda puede editar en solo lectura de audio y pedir toma de control; el relevo para el audio anterior y libera sus voces.
- CLK-07 La programación resiste pestaña en segundo plano, cambios de visibilidad y suspensión de AudioContext: al volver, reancla posición y cancela eventos vencidos de la generación anterior.
- CLK-08 El metrónomo suena en vivo y en count-in, pero sólo entra en exportación si se solicita. Play de proyecto y grabación no disparan dos relojes independientes.

## Aceptación

Fixture de 16 compases con cambios de tempo, notas que cruzan loop y 37 notas live: 100 vueltas no generan voces extra ni Note Off perdidos; Stop/Seek y relevo entre dos pestañas dejan silencio de transporte y mantienen/restituyen el live según dueño.
