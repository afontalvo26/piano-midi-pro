import { expect, test } from "@playwright/test";

test("portable bundle verifies recorded banks, credits, license and user bytes", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/bundle.ts");
  const databaseName = `official-bundle-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { OFFICIAL_PACKS } = await import("/src/project/officialPacks.ts");
    const { exportProjectBundle, importProjectBundle, ProjectBundleError } =
      await import("/src/project/bundle.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const data = new Blob([new Uint8Array(128).fill(7)], { type: "audio/wav" });
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await data.arrayBuffer())),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const asset = { id: "owned-asset", sha256, byteLength: data.size, mimeType: data.type,
      sourceKind: "user" as const, license: "user-controlled" };
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const piano = { id: "piano", name: "Piano", kind: "instrument" as const,
      instrument: { instrumentId: OFFICIAL_PACKS[0]!.instrumentId,
        packageVersion: OFFICIAL_PACKS[0]!.packageVersion, presetId: OFFICIAL_PACKS[0]!.presetId }, mix };
    const rack = { pads: Array.from({ length: 16 }, (_, index) => ({
      id: `pad-${index}`, name: `Pad ${index + 1}`, color: "#334455",
      midiNote: 36 + index, channel: 9,
      source: index < 2 ? { kind: "instrument" as const, sourceNote: index === 0 ? 36 : 39,
        ref: { instrumentId: OFFICIAL_PACKS[index + 1]!.instrumentId,
          packageVersion: OFFICIAL_PACKS[index + 1]!.packageVersion,
          presetId: OFFICIAL_PACKS[index + 1]!.presetId } } : null,
      gainDb: 0, pan: 0, pitchSemitones: 0, startFrame: 0, attackMs: 0, decayMs: 20,
      playMode: "oneShot" as const, mute: false, solo: false, stepTicks: 240, stepCount: 16,
    })) };
    const drum = { id: "drum", name: "Batería", kind: "drum" as const, drumRack: rack, mix };
    const base = createProjectDocument({ id: "official-source", at: 1000 });
    const document = { ...base, tracks: [piano, drum], trackOrder: [piano.id, drum.id],
      assets: [asset] };
    await repository.stageAsset(asset, data);
    await repository.commitRevision(document, 0);
    const bundle = await exportProjectBundle(repository, document.id);
    const bytes = new Uint8Array(await bundle.arrayBuffer());
    const length = new DataView(bytes.buffer).getUint32(8, true);
    const manifest = JSON.parse(new TextDecoder().decode(bytes.slice(12, 12 + length)));
    const credit = manifest.officialPacks.map((pack: { creator: string; performer?: string; license: string;
      files: readonly { role: string }[] }) => ({ creator: pack.creator, license: pack.license,
        performer: pack.performer ?? null,
        files: pack.files.length, roles: [...new Set(pack.files.map((file) => file.role))] }));
    const tampered = bytes.slice();
    const attributionOffset = 12 + length + data.size + manifest.officialPacks[0].files[0].byteLength;
    tampered[attributionOffset] ^= 1;
    let licenseTamperRejected = false;
    try { await importProjectBundle(repository, new Blob([tampered]), { id: "tampered-license", at: 2000 }); }
    catch (error) { licenseTamperRejected = error instanceof ProjectBundleError && error.code === "invalid"; }
    let missingBankRejected = false;
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/audio/salamander/core/manifest.json")
        ? new Response("", { status: 404 }) : originalFetch(input, init);
    try { await importProjectBundle(repository, bundle, { id: "missing-bank", at: 2500 }); }
    catch (error) { missingBankRejected = error instanceof ProjectBundleError && error.code === "assets-pending"; }
    finally { window.fetch = originalFetch; }
    const countBeforeValidImport = (await repository.list()).length;
    const copied = await importProjectBundle(repository, bundle, { id: "official-copy", at: 3000 });
    const copiedAsset = await repository.readAsset(copied.document.assets[0]!);
    const unsupported = { ...base, id: "unsupported-bank", tracks: [{ ...piano, id: "other-piano",
      instrument: { instrumentId: "unknown-synth", packageVersion: "1", presetId: "default" } }],
      trackOrder: ["other-piano"] };
    await repository.commitRevision(unsupported, 0);
    let unsupportedRejected = false;
    try { await exportProjectBundle(repository, unsupported.id); }
    catch (error) { unsupportedRejected = error instanceof ProjectBundleError && error.code === "assets-pending"; }
    const midi = { ...base, id: "midi-source", takes: [{ id: "midi-take", kind: "midi" as const,
      recordingId: "legacy-local", createdAt: 1000 }] };
    await repository.commitRevision(midi, 0);
    let missingMidiRejected = false;
    try { await exportProjectBundle(repository, midi.id); }
    catch (error) { missingMidiRejected = error instanceof ProjectBundleError && error.code === "assets-pending"; }
    await repository.close();
    for (const database of [name, `${name}-assets`, `${name}-drafts`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return { magic: new TextDecoder().decode(bytes.slice(0, 8)),
      version: manifest.version, portability: manifest.portability,
      credit, licenseTamperRejected, missingBankRejected, countBeforeValidImport,
      copyId: copied.document.id, copiedAssetSize: copiedAsset?.size,
      unsupportedRejected, missingMidiRejected };
  }, databaseName);
  expect(result).toEqual({ magic: "PMPBND3!", version: 3, portability: "complete",
    credit: [
      { creator: "Alexander Holm", performer: null, license: "CC BY 3.0", files: 9,
        roles: ["manifest", "attribution", "sample"] },
      { creator: "Versilian Studios LLC; Karoryfer Lecolds", performer: "Austin McMahon",
        license: "CC0-1.0", files: 40,
        roles: ["manifest", "license", "sample"] },
      { creator: "FreePats", performer: "Roberto", license: "CC0-1.0", files: 12,
        roles: ["manifest", "license", "attribution", "sample"] },
    ], licenseTamperRejected: true, missingBankRejected: true,
    countBeforeValidImport: 1, copyId: "official-copy", copiedAssetSize: 128,
    unsupportedRejected: true, missingMidiRejected: true });
});
