/** Re-encode pinned CC0 OGG drum recordings as AAC-LC for older Safari. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packs = [
  { name: "virtuosity", count: 38,
    version: "9f04cf9a734527edfbb0a4eee1f674e45bbf71bc",
    manifestSha256: "d58ba219cf99765a7ad752637e5e037d2e000e9fef44e079a3df97396dece93f" },
  { name: "freepats-handclap", count: 9,
    version: "e54eb2912a0d6d4444ab205d52f778e27da0fc96",
    manifestSha256: "21e46735d3f673908cb912ec5aca1ef858b684e19d4b5dc3b28ebac26acf0380" },
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (binary, args) => {
  const result = spawnSync(binary, args, { encoding: "utf8", timeout: 30_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`${binary}: ${result.error?.message ?? result.stderr ?? result.status}`);
  }
  return result.stdout;
};
const encoder = run("ffmpeg", ["-version"]).split(/\r?\n/)[0];

for (const pack of packs) {
  const source = path.join(root, "app/public/audio", pack.name, "core");
  const output = path.join(root, "app/public/audio", pack.name, "core-aac");
  const manifestBytes = await readFile(path.join(source, "manifest.json"));
  if (sha256(manifestBytes) !== pack.manifestSha256) {
    throw new Error(`${pack.name}: source manifest changed`);
  }
  const original = JSON.parse(manifestBytes.toString("utf8"));
  if (original.version !== pack.version || original.license !== "CC0-1.0" ||
      original.samples?.length !== pack.count) {
    throw new Error(`${pack.name}: source version, CC0 or file count changed`);
  }
  await mkdir(output, { recursive: true });
  const files = [];
  for (const sample of original.samples) {
    if (!/^[A-Za-z0-9_-]+\.ogg$/.test(sample.file)) {
      throw new Error(`${pack.name}: unsafe source filename`);
    }
    const bytes = await readFile(path.join(source, sample.file));
    if (bytes.length !== sample.byteLength || sha256(bytes) !== sample.sha256 ||
        bytes.toString("ascii", 0, 4) !== "OggS") {
      throw new Error(`${sample.file}: source OGG does not match pinned manifest`);
    }
    const probe = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=sample_rate,channels", "-of", "json",
      path.join(source, sample.file)]));
    const input = probe.streams?.[0];
    const sampleRate = Number(input?.sample_rate);
    if (![44_100, 48_000].includes(sampleRate) || ![1, 2].includes(input?.channels)) {
      throw new Error(`${sample.file}: expected 44.1/48 kHz mono/stereo recording`);
    }
    const bitrate = input.channels === 1 ? "128k" : "192k";
    const file = sample.file.replace(/\.ogg$/, ".m4a");
    const target = path.join(output, file);
    run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-y",
      "-i", path.join(source, sample.file), "-map", "0:a:0", "-vn",
      "-map_metadata", "-1", "-c:a", "aac", "-b:a", bitrate,
      "-ar", String(sampleRate), "-ac", String(input.channels),
      "-movflags", "+faststart", target]);
    const rendered = await readFile(target);
    const outputProbe = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=codec_name,profile,sample_rate,channels",
      "-of", "json", target]));
    const stream = outputProbe.streams?.[0];
    if (rendered.length < 1000 || rendered.toString("ascii", 4, 8) !== "ftyp" ||
        stream?.codec_name !== "aac" || stream.profile !== "LC" ||
        Number(stream.sample_rate) !== sampleRate || stream.channels !== input.channels) {
      throw new Error(`${file}: invalid AAC-LC derivative`);
    }
    files.push({ id: sample.id, sourceFile: sample.file,
      sourceBytes: sample.byteLength, sourceSha256: sample.sha256,
      recordedSourcePath: sample.sourcePath,
      recordedSourceGitSha1: sample.sourceGitSha1,
      recordedSourceSha256: sample.sourceSha256,
      file, sampleRate, channels: input.channels, bitrate,
      bytes: rendered.length, sha256: sha256(rendered) });
  }
  await writeFile(path.join(output, "manifest.json"), `${JSON.stringify({
    packId: `${pack.name}-core-aac`, sourceVersion: pack.version,
    sourceManifestSha256: pack.manifestSha256, source: original.source,
    license: original.license, performer: original.performer,
    codec: "AAC-LC", container: "M4A/MP4", sampleRates: [44_100, 48_000],
    encoder, files,
  }, null, 2)}\n`);
  process.stdout.write(`${pack.name}: ${files.length} AAC-LC derivatives, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes\n`);
}
