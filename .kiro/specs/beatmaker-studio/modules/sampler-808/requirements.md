# SMP — Sampler, slicing y 808: requisitos

Estado: pendiente. Material del usuario y un bajo 808 afinado se integran en proyectos propios.

## Historias y criterios

- SMP-01 Importar WAV, OGG y formatos que el navegador confirme; rechazar tipo no soportado, archivo desproporcionado o encabezado inválido con error claro. No ejecutar metadatos como código ni enviar el archivo a un servidor.
- SMP-02 Preescuchar y editar inicio/fin, fades, reverse, root note, tuning, envolvente, loop y velocidad sin reescribir el origen. Se guarda transformación y referencia al hash original.
- SMP-03 Slicing manual o por transientes con sensibilidad ajustable; mapear cortes a pads conservando offset exacto. El algoritmo informa falsos positivos/negativos y permite corregirlos.
- SMP-04 Loops con repitch y time-stretch son modos distintos, visibles. Si time-stretch de calidad aceptable no está disponible para un formato/longitud, deshabilitarlo con motivo; no simularlo con cambio de tono oculto.
- SMP-05 808 monofónico o legato, root note calibrada, glide en tiempo configurable, retrigger policy, envelope, saturación opcional y control de subgrave. El tono no salta por una octava ni genera clic al cambiar nota.
- SMP-06 Carga progresiva/por demanda con límite de PCM residente, liberación de buffers sin referencias y estados instalado/faltante/error. La primera nota de un pad preparado no depende de descarga inesperada.
- SMP-07 Un sample aportado por el usuario se empaqueta sólo bajo su acción y responsabilidad; la app no lo incorpora al catálogo público. Los samples de terceros sólo se distribuyen según la revisión INS.

## Aceptación

Importar un break, crear ocho slices, cambiar dos límites, asignar a pads, guardar/reabrir y exportar con offsets idénticos. Un 808 toca una escala medida, glide y cambios rápidos sin discontinuidades audibles ni clipping.
