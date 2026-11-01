# MID — diseño

## Tubería

Web MIDI Input → decodificador validado → secuenciador de eventos por timestamp → router de dispositivo/canal → destinos live, grabador y MIDI Learn. Los destinos reciben el mismo eventId y el mismo tiempo normalizado para evitar dobles notas. El grabador registra mensaje crudo, canal fuente, nota fuente y nota interpretada cuando es observable.

Perfiles: generic, SMK-37 Elite y SMK-37 Pro, versionados y ligados a identificadores de puerto/observaciones. Un perfil contiene mapeos learned, rango, transpose, curvas de velocidad, zonas pad y evidencia por control; no incorpora IDs/CC “de fábrica” sin captura física o documento oficial comprobado. La UI ofrece captura guiada por grupos con log de bytes y timestamp. ARP/Scale/Chord internos sólo se representan como capacidad del hardware si no emiten mensajes de control.

La grabación mantiene pares de notas por (puerto, canal, pitch fuente, ordinal de pulsación). Sustain/sostenuto preservan Note Off original y liberación efectiva como eventos distintos. Pitch bend tiene rango acordado por instrumento; poly pressure se guarda por nota, channel pressure por canal. Para MIDI 1.0 no se promete bend independiente en acordes sin MPE.

## Integración

CLK entrega tick de captura a partir de timestamp y calibración; PRJ almacena takes/proyecto; ROL edita copias; LiveStudioEngine reproduce inmediatamente. El diagnóstico y los perfiles no bloquean tocar si un control todavía no está mapeado.
