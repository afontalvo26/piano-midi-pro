import { encodeWavPcm, type StereoPcm, type WavPcmOptions } from "./wavPcm.ts";

self.addEventListener("message", (event: MessageEvent<{
  readonly pcm: StereoPcm; readonly options: WavPcmOptions }>) => {
  try {
    const result = encodeWavPcm(event.data.pcm, event.data.options);
    self.postMessage({ bytes: result.bytes.buffer, report: result.report },
      { transfer: [result.bytes.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "No se pudo codificar WAV",
      code: error instanceof Error && "code" in error ? error.code : "invalid-pcm" });
  }
});
