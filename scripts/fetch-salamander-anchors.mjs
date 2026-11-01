/** Fetch the non-core Tone.js Salamander anchors with integrity metadata. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "app", "public", "audio", "salamander", "anchors");
const sourceBaseUrl = "https://tonejs.github.io/audio/salamander/";
const files = [
  ["A0", "A0.ogg"], ["C1", "C1.ogg"], ["D#1", "Ds1.ogg"],
  ["F#1", "Fs1.ogg"], ["A1", "A1.ogg"], ["C2", "C2.ogg"],
  ["D#2", "Ds2.ogg"], ["F#2", "Fs2.ogg"], ["A2", "A2.ogg"],
  ["D#3", "Ds3.ogg"], ["A3", "A3.ogg"], ["D#4", "Ds4.ogg"],
  ["A4", "A4.ogg"], ["D#5", "Ds5.ogg"], ["A5", "A5.ogg"],
  ["D#6", "Ds6.ogg"], ["F#6", "Fs6.ogg"], ["A6", "A6.ogg"],
  ["C7", "C7.ogg"], ["D#7", "Ds7.ogg"], ["F#7", "Fs7.ogg"],
  ["A7", "A7.ogg"], ["C8", "C8.ogg"],
];

await mkdir(output, { recursive: true });
const records = [];
for (let index = 0; index < files.length; index += 3) {
  const batch = files.slice(index, index + 3);
  const results = await Promise.all(batch.map(async ([note, file]) => {
    const response = await fetch(`${sourceBaseUrl}${file}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000 || bytes.toString("ascii", 0, 4) !== "OggS") {
      throw new Error(`${file}: no es audio OGG`);
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await writeFile(path.join(output, file), bytes);
    process.stdout.write(`${file} ${bytes.length} ${sha256}\n`);
    return { note, file, bytes: bytes.length, sha256 };
  }));
  records.push(...results);
}
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify({
  sourceBaseUrl,
  license: "https://creativecommons.org/licenses/by/3.0/",
  author: "Alexander Holm",
  files: records,
}, null, 2)}\n`);
