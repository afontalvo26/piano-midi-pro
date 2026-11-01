import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

interface AssetManifest {
  author: string;
  license: string;
  files: Array<{ note: string; file: string; bytes: number; sha256: string }>;
}

const base = join(process.cwd(), "app", "public", "audio", "salamander");

test("las 30 anclas locales de Salamander conservan integridad, formato y atribución", () => {
  const seen = new Set<string>();
  let count = 0;
  for (const folder of ["core", "anchors"]) {
    const manifest = JSON.parse(readFileSync(join(base, folder, "manifest.json"), "utf8")) as AssetManifest;
    assert.equal(manifest.author, "Alexander Holm");
    assert.equal(manifest.license, "https://creativecommons.org/licenses/by/3.0/");
    for (const entry of manifest.files) {
      assert.ok(!seen.has(entry.note), `ancla duplicada: ${entry.note}`);
      seen.add(entry.note);
      const bytes = readFileSync(join(base, folder, entry.file));
      assert.equal(bytes.length, entry.bytes, entry.file);
      assert.equal(bytes.subarray(0, 4).toString("ascii"), "OggS", entry.file);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, entry.file);
      count++;
    }
  }
  assert.equal(count, 30);
});
