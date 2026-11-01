/** Re-encode the seven pinned Alexander Holm recordings for older Safari. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "app/public/audio/salamander/core");
const output = path.join(root, "app/public/audio/salamander/core-aac");
const sourceManifestSha256 = "3554c3717e4a7f6cb343fd7c14cd515f22f735be20f67b5d75f2d93fe452ba10";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (binary, args) => {
  const result = spawnSync(binary, args, { encoding: "utf8", timeout: 30_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`${binary}: ${result.error?.message ?? result.stderr ?? result.status}`);
  }
  return result.stdout;
};

const manifestBytes = await readFile(path.join(source, "manifest.json"));
if (sha256(manifestBytes) !== sourceManifestSha256) {
  throw new Error("Salamander OGG source manifest differs from the pinned version");
}
const sourceManifest = JSON.parse(manifestBytes.toString("utf8"));
if (sourceManifest.author !== "Alexander Holm" ||
    sourceManifest.license !== "https://creativecommons.org/licenses/by/3.0/" ||
    sourceManifest.files?.length !== 7) {
  throw new Error("Salamander source attribution or seven-file contract changed");
}
const encoder = run("ffmpeg", ["-version"]).split(/\r?\n/)[0];
await mkdir(output, { recursive: true });
const files = [];
for (const item of sourceManifest.files) {
  const sourceBytes = await readFile(path.join(source, item.file));
  if (sourceBytes.length !== item.bytes || sha256(sourceBytes) !== item.sha256 ||
      sourceBytes.toString("ascii", 0, 4) !== "OggS") {
    throw new Error(`${item.file}: source bytes do not match pinned manifest`);
  }
  const name = item.file.replace(/\.ogg$/, ".m4a");
  if (name === item.file) throw new Error(`${item.file}: expected OGG source`);
  const target = path.join(output, name);
  run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    "-i", path.join(source, item.file), "-map", "0:a:0", "-vn",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
    "-movflags", "+faststart", target]);
  const probe = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,profile,sample_rate,channels",
    "-of", "json", target]));
  const stream = probe.streams?.[0];
  if (stream?.codec_name !== "aac" || stream.profile !== "LC" ||
      Number(stream.sample_rate) !== 44_100 || stream.channels !== 2) {
    throw new Error(`${name}: expected stereo AAC-LC 44.1 kHz`);
  }
  const derived = await readFile(target);
  if (derived.length < 1000 || derived.toString("ascii", 4, 8) !== "ftyp") {
    throw new Error(`${name}: invalid MP4 container`);
  }
  files.push({ note: item.note, sourceFile: item.file,
    sourceBytes: item.bytes, sourceSha256: item.sha256,
    file: name, bytes: derived.length, sha256: sha256(derived) });
}
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify({
  sourceManifestSha256, author: sourceManifest.author, license: sourceManifest.license,
  sourceBaseUrl: sourceManifest.sourceBaseUrl,
  codec: "AAC-LC", container: "M4A/MP4", sampleRate: 44_100, channels: 2,
  encode: { encoder, bitrate: "192k", command: "ffmpeg -i SOURCE -map 0:a:0 -vn -c:a aac -b:a 192k -ar 44100 -ac 2 -movflags +faststart OUTPUT" },
  files,
}, null, 2)}\n`);
process.stdout.write(`Salamander AAC-LC: ${files.length} verified derivatives, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes\n`);
