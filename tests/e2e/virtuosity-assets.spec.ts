import { expect, test } from "@playwright/test";

test("subconjunto Virtuosity conserva integridad y decodifica en Chromium", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  const audit = await page.evaluate(async () => {
    const base = "/audio/virtuosity/core/";
    const response = await fetch(`${base}manifest.json`);
    if (!response.ok) throw new Error(`Manifiesto HTTP ${response.status}`);
    const manifest = await response.json() as {
      samples: { file: string; sha256: string; articulation: string; byteLength: number }[];
    };
    const context = new AudioContext();
    const observed = new Set<string>();
    let totalBytes = 0;
    try {
      for (const sample of manifest.samples) {
        const source = await fetch(`${base}${sample.file}`);
        if (!source.ok) throw new Error(`${sample.file}: HTTP ${source.status}`);
        const bytes = await source.arrayBuffer();
        if (bytes.byteLength !== sample.byteLength) throw new Error(`${sample.file}: longitud incorrecta`);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        if (hex !== sample.sha256) throw new Error(`${sample.file}: hash incorrecto`);
        const audio = await context.decodeAudioData(bytes.slice(0));
        if (audio.length < 100 || audio.duration > 15 || audio.numberOfChannels < 1) {
          throw new Error(`${sample.file}: audio vacío o duración inválida`);
        }
        let peak = 0;
        for (let channel = 0; channel < audio.numberOfChannels; channel++) {
          const pcm = audio.getChannelData(channel);
          for (let frame = 0; frame < pcm.length; frame += 16) peak = Math.max(peak, Math.abs(pcm[frame]!));
        }
        if (peak < 0.001) throw new Error(`${sample.file}: audio silencioso`);
        observed.add(sample.articulation);
        totalBytes += bytes.byteLength;
      }
    } finally {
      await context.close();
    }
    return { count: manifest.samples.length, articulations: [...observed].sort(), totalBytes };
  });
  expect(audit).toEqual({ count: 38, articulations: ["cowbell", "hatClosed", "hatOpen", "kick", "snare"], totalBytes: 2_019_621 });
});
