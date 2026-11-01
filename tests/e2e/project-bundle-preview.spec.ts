import { expect, test } from "@playwright/test";

test("bundle preview verifies JSON and binary bytes without writing IndexedDB", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/bundle.ts");
  const name = `bundle-preview-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (databaseName) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { exportProjectBundle, previewProjectBundle } = await import("/src/project/bundle.ts");
    const repository = new ProjectRepository({ databaseName });
    const plain = createProjectDocument({ id: "plain-project", name: "Sin activos", at: 1000 });
    await repository.commitRevision(plain, 0);
    const json = await exportProjectBundle(repository, plain.id);
    const jsonPreview = await previewProjectBundle(json);
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 87, 65, 86, 69]);
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const asset = { id: "user-asset", sha256, byteLength: bytes.length,
      mimeType: "audio/wav", sourceKind: "user" as const, license: "user-owned",
      frameCount: 1, sampleRate: 48_000, channelCount: 1 };
    await repository.stageAsset(asset, new Blob([bytes], { type: asset.mimeType }));
    const binaryDocument = { ...createProjectDocument({ id: "binary-project",
      name: "Con activos", at: 1100 }), assets: [asset] };
    await repository.commitRevision(binaryDocument, 0);
    const binary = await exportProjectBundle(repository, binaryDocument.id);
    const databasesBefore = (await indexedDB.databases()).map((entry) => entry.name).sort();
    const preview = await previewProjectBundle(binary);
    const databasesAfter = (await indexedDB.databases()).map((entry) => entry.name).sort();
    const corrupted = new Uint8Array(await binary.arrayBuffer());
    corrupted[corrupted.length - 1] ^= 1;
    let corruptRejected = false;
    try { await previewProjectBundle(new Blob([corrupted], { type: binary.type })); }
    catch { corruptRejected = true; }
    const databasesAfterCorrupt = (await indexedDB.databases()).map((entry) => entry.name).sort();
    const index = await repository.list();
    await repository.close();
    for (const database of [databaseName, `${databaseName}-assets`, `${databaseName}-drafts`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return {
      json: [jsonPreview.formatVersion, jsonPreview.name, jsonPreview.assets.length],
      binary: [preview.formatVersion, preview.name, preview.assets[0]?.sha256,
        preview.assets[0]?.license, preview.byteLength],
      sameDatabases: JSON.stringify(databasesBefore) === JSON.stringify(databasesAfter) &&
        JSON.stringify(databasesBefore) === JSON.stringify(databasesAfterCorrupt),
      projectIds: index.map((entry) => entry.id).sort(), corruptRejected,
      bundleBytes: binary.size,
    };
  }, name);
  expect(result.json).toEqual([1, "Sin activos", 0]);
  expect(result.binary.slice(0, 4)).toEqual([2, "Con activos",
    expect.stringMatching(/^[a-f0-9]{64}$/), "user-owned"]);
  expect(result.binary[4]).toBe(result.bundleBytes);
  expect(result.sameDatabases).toBe(true);
  expect(result.projectIds).toEqual(["binary-project", "plain-project"]);
  expect(result.corruptRejected).toBe(true);
});

test("official bundle previews its licensed bytes without a local bank but import remains blocked", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/src/project/bundle.ts");
  const result = await page.evaluate(async (databaseName) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { OFFICIAL_PACKS } = await import("/src/project/officialPacks.ts");
    const { exportProjectBundle, importProjectBundle, previewProjectBundle,
      ProjectBundleError } = await import("/src/project/bundle.ts");
    const repository = new ProjectRepository({ databaseName });
    const pack = OFFICIAL_PACKS[0]!;
    const piano = { id: "piano", name: "Piano", kind: "instrument" as const,
      instrument: { instrumentId: pack.instrumentId, packageVersion: pack.packageVersion,
        presetId: pack.presetId },
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
        sends: [], effects: [] } };
    const base = createProjectDocument({ id: "official-source", at: 1000 });
    await repository.commitRevision({ ...base, tracks: [piano], trackOrder: [piano.id] }, 0);
    const bundle = await exportProjectBundle(repository, base.id);
    const before = (await repository.list()).map((row) => row.id);
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/audio/salamander/core/manifest.json")
        ? new Response("", { status: 404 }) : originalFetch(input, init);
    let preview;
    let importBlocked = false;
    try {
      preview = await previewProjectBundle(bundle);
      await importProjectBundle(repository, bundle, { id: "should-not-import", at: 2000 });
    } catch (error) {
      importBlocked = error instanceof ProjectBundleError && error.code === "assets-pending";
    } finally { window.fetch = originalFetch; }
    const after = (await repository.list()).map((row) => row.id);
    const bytes = new Uint8Array(await bundle.arrayBuffer());
    bytes[bytes.length - 1] ^= 1;
    let damagedRejected = false;
    try { await previewProjectBundle(new Blob([bytes])); }
    catch (error) { damagedRejected = error instanceof ProjectBundleError && error.code === "invalid"; }
    await repository.close();
    for (const database of [databaseName, `${databaseName}-assets`, `${databaseName}-drafts`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return { formatVersion: preview?.formatVersion, license: preview?.officialPacks[0]?.license,
      bankRequired: preview?.requiresInstalledOfficialPacks, count: preview?.officialPacks.length,
      importBlocked, before, after, damagedRejected };
  }, `official-preview-${crypto.randomUUID()}`);
  expect(result).toEqual({ formatVersion: 3, license: "CC BY 3.0", bankRequired: true,
    count: 1, importBlocked: true, before: ["official-source"],
    after: ["official-source"], damagedRejected: true });
});
