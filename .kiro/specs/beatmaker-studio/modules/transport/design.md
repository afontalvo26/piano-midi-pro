# CLK — diseño

## Reloj y plan

TransportState: stopped, countingIn, playing, recording, paused o suspended, con projectRevision, epoch, originAudioTime, originTick y loopRange. El tempo map es una secuencia ordenada de puntos; sus segmentos precomputan integrales tick→segundo. El scheduler lee un snapshot PRJ, genera un plan acotado por horizonte y coloca eventos en AudioContext.currentTime. El horizonte se mide; no se usa setInterval como reloj de notas.

Cada evento tiene eventId, trackId, sourceKind (arrangement, launcher, live, preview), voiceOwner, tick y epoch. Al cambiar estado se incrementa epoch, se invalida la cola futura y se libera por owner. La tabla de voces live pertenece a LiveStudioEngine o a su adaptador; CLK no hace all-notes-off global. La orden de parar incluye rampa corta para evitar clic.

## Dependencias

PRJ provee revisión inmutable; ARR resuelve qué clip domina por pista; INS/MIX proveen buses por pista; MID estampa entrada; EXP usa el mismo resolvedor musical en modo offline. Una interfaz SequencerSink común admite noteOn, noteOff, CC, bend, pressure y audioClip con tiempos absolutos; la latencia se suma una sola vez en el borde de entrada.

## Condiciones límite

Las notas sostenidas se identifican por origen y contador de repetición, no sólo por pitch. Los eventos simultáneos tienen orden estable: configuración/control, Note Off, Note On; sustain conserva semántica por canal. El sistema separa pausa musical, suspensión del navegador y pérdida del dueño de audio. Un salto de tempo invalida y recalcula la ventana futura sin alterar ticks almacenados.
