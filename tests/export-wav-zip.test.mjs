import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeWavPcm } from "../app/src/export/wavPcm.ts";
import { createWavZip } from "../app/src/export/wavZip.ts";

function fixture() {
  const pcm = { sampleRate: 48000, left: new Float32Array([0.2, 0.4, -0.2]),
    right: new Float32Array([0.1, 0.3, -0.1]) };
  const master = encodeWavPcm(pcm, { format: "pcm16", dither: false });
  const stem = encodeWavPcm({ ...pcm, left: new Float32Array([0.1, 0.2, -0.1]),
    right: new Float32Array([0.05, 0.15, -0.05]) },
  { format: "pcm16", dither: false });
  const name = "Beat-demo-r1-aaaaaaaaaaaa";
  const file = (id, kind, encoded) => ({ name: `${name}-${id}.wav`,
    mimeType: "audio/wav", kind, id,
    sourceTrackIds: kind === "master" ? ["source"] : [id],
    bytes: encoded.bytes, pcm: encoded.report, render: {} });
  return { projectId: "demo", projectName: "Beat demo", revision: 1,
    revisionHash: "a".repeat(64), format: "pcm16", seed: "seed",
    plan: { startTick: 0, endTick: 960, durationSeconds: 0.5, tailSeconds: 0,
      sampleRate: 48000, stems: [], omittedSourceTrackIds: [], stemsAdditive: false,
      busStemsOverlap: false, projectLimiterIncluded: true,
      excludedStudioChain: ["chorus", "reverb", "compressor", "piano-live-master-volume"] },
    files: [file("master", "master", master), file("source", "track", stem)],
    stemsAdditive: false, projectLimiterIncluded: true,
    sendsIncluded: false, masterEffectsIncluded: false, sidechainIncluded: false,
    studioGlobalChainIncluded: false, omittedStemIds: [],
    officialCredits: [{ instrumentId: "salamander-grand", packageVersion: "sha256:abc",
      presetId: "natural", creator: "Alexander Holm",
      license: "CC BY 3.0", sourceUrl: "https://example.test/source" }] };
}

function entriesOf(bytes, count) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  const entries = [];
  for (let index = 0; index < count; index++) {
    assert.equal(view.getUint32(offset, true), 0x04034b50);
    assert.equal(view.getUint16(offset + 8, true), 0);
    assert.equal(view.getUint16(offset + 6, true), 0x0800);
    const size = view.getUint32(offset + 18, true);
    const length = view.getUint16(offset + 26, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + length));
    entries.push({ name, data: bytes.subarray(offset + 30 + length,
      offset + 30 + length + size), localOffset: offset,
      crc: view.getUint32(offset + 14, true) });
    offset += 30 + length + size;
  }
  const centralOffset = offset;
  for (const entry of entries) {
    assert.equal(view.getUint32(offset, true), 0x02014b50);
    assert.equal(view.getUint32(offset + 16, true), entry.crc);
    assert.equal(view.getUint32(offset + 42, true), entry.localOffset);
    offset += 46 + view.getUint16(offset + 28, true);
  }
  assert.equal(view.getUint32(offset, true), 0x06054b50);
  assert.equal(view.getUint16(offset + 10, true), count);
  assert.equal(view.getUint32(offset + 16, true), centralOffset);
  assert.equal(offset + 22, bytes.byteLength);
  return entries;
}

test("ZIP32 contains aligned PCM WAVs and a revision, credit and hash manifest", async () => {
  const source = fixture();
  const progress = [];
  const bundle = await createWavZip(source, (state) => progress.push(state.phase));
  assert.equal(bundle.name, "Beat-demo-r1-aaaaaaaaaaaa-stems.zip");
  assert.equal(bundle.mimeType, "application/zip");
  assert.equal(bundle.blob.type, "application/zip");
  const entries = entriesOf(new Uint8Array(await bundle.blob.arrayBuffer()), 3);
  assert.deepEqual(entries.map((entry) => entry.name),
    ["manifest.json", ...source.files.map((file) => file.name)]);
  assert.deepEqual(entries.slice(1).map((entry) => entry.data),
    source.files.map((file) => file.bytes));
  const manifest = JSON.parse(new TextDecoder().decode(entries[0].data));
  assert.deepEqual(manifest, bundle.manifest);
  assert.equal(manifest.project.revisionHash, source.revisionHash);
  assert.equal(manifest.render.projectLimiterIncluded, true);
  assert.equal(manifest.render.stemsAdditive, false);
  assert.equal(manifest.officialCredits[0].creator, "Alexander Holm");
  assert.equal(manifest.files[0].frames, 3);
  assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/);
  const manifestHash = new Uint8Array(await crypto.subtle.digest("SHA-256", entries[0].data));
  assert.equal(bundle.manifestSha256, Buffer.from(manifestHash).toString("hex"));
  assert.ok(progress.includes("hashing"));
  assert.ok(progress.includes("done"));
});

test("ZIP rejects duplicate/unsafe names, missing stems, tampered WAV and frame drift", async () => {
  const original = fixture();
  await assert.rejects(createWavZip({ ...original, files: original.files.slice(0, 1) }), /master y pistas/);
  const duplicate = { ...original, files: [original.files[0],
    { ...original.files[1], name: original.files[0].name }] };
  await assert.rejects(createWavZip(duplicate), /repetidos/);
  const unsafe = { ...original, files: [original.files[0],
    { ...original.files[1], name: "../out.wav" }] };
  await assert.rejects(createWavZip(unsafe), /inseguro/);
  const altered = original.files[1].bytes.slice();
  altered[22] = 1;
  await assert.rejects(createWavZip({ ...original, files: [original.files[0],
    { ...original.files[1], bytes: altered }] }), /Cabecera/);
  const other = encodeWavPcm({ sampleRate: 48000,
    left: new Float32Array([0.1, 0.2]), right: new Float32Array([0.1, 0.2]) },
  { format: "pcm16", dither: false });
  await assert.rejects(createWavZip({ ...original, files: [original.files[0],
    { ...original.files[1], bytes: other.bytes, pcm: other.report }] }), /no coincide/);
});

test("ZIP accepts long safe exported filenames below the filesystem limit", async () => {
  const original = fixture();
  const name = `${"A".repeat(220)}.wav`;
  const bundle = await createWavZip({ ...original, files: [original.files[0],
    { ...original.files[1], name }] });
  assert.ok(bundle.manifest.files.some((file) => file.name === name));
});
