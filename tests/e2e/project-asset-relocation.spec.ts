import { expect, test } from "@playwright/test";

test("missing and corrupt project audio relinks only exact bytes without changing the project", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/assetRelocation.ts");
  const result = await page.evaluate(async () => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectAssetStore } = await import("/src/project/assets.ts");
    const { inspectProjectAssets, relocalizeProjectAsset } = await import("/src/project/assetRelocation.ts");
    const name = `qa-relink-${crypto.randomUUID()}`;
    const bytes = new Uint8Array(48);
    const view = new DataView(bytes.buffer);
    const ascii = (at: number, value: string) => {
      for (let index = 0; index < value.length; index++) view.setUint8(at + index, value.charCodeAt(index));
    };
    ascii(0, "RIFF"); view.setUint32(4, 40, true); ascii(8, "WAVE");
    ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, 48_000, true);
    view.setUint32(28, 96_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ascii(36, "data"); view.setUint32(40, 4, true);
    view.setInt16(44, 1000, true); view.setInt16(46, -1000, true);
    const wrong = bytes.slice();
    wrong[46] ^= 0x01;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
    const ref = { id: "sample-1", sha256: hash, byteLength: bytes.byteLength,
      mimeType: "audio/wav", sourceKind: "user" as const, license: "user-owned",
      frameCount: 2, sampleRate: 48_000, channelCount: 1 };
    const document = { ...createProjectDocument({ id: "project-relink", at: 1 }), assets: [ref] };
    const before = JSON.stringify(document);
    const store = new ProjectAssetStore({ databaseName: name });
    const missing = await inspectProjectAssets(store, document);
    let wrongCode = "";
    try {
      await relocalizeProjectAsset(store, document, ref.id,
        new Blob([wrong], { type: "application/octet-stream" }));
    } catch (error) { wrongCode = error && typeof error === "object" && "code" in error
      ? String(error.code) : "other"; }
    const afterWrong = await inspectProjectAssets(store, document);
    await relocalizeProjectAsset(store, document, ref.id,
      new Blob([bytes], { type: "application/octet-stream" }));
    const available = await inspectProjectAssets(store, document);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("assets", "readwrite");
      transaction.objectStore("assets").put({ sha256: hash, byteLength: ref.byteLength,
        mimeType: ref.mimeType, data: new Blob([wrong], { type: ref.mimeType }),
        stagedAt: Date.now(), everCommitted: true });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    const corrupt = await inspectProjectAssets(store, document);
    await relocalizeProjectAsset(store, document, ref.id, new Blob([bytes]));
    const repaired = await inspectProjectAssets(store, document);
    const restored = await store.readAsset(ref);
    const restoredHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
      await restored!.arrayBuffer())), (byte) => byte.toString(16).padStart(2, "0")).join("");
    let officialCode = "";
    try {
      await relocalizeProjectAsset(store, { ...document,
        assets: [{ ...ref, sourceKind: "official" as const }] }, ref.id, new Blob([bytes]));
    } catch (error) { officialCode = error && typeof error === "object" && "code" in error
      ? String(error.code) : "other"; }
    await store.close();
    return { missing, wrongCode, afterWrong, available, corrupt, repaired,
      restoredHash, originalHash: hash, documentUnchanged: JSON.stringify(document) === before,
      officialCode };
  });
  expect(result.missing[0]!.status).toBe("missing");
  expect(result.wrongCode).toBe("corrupt");
  expect(result.afterWrong[0]!.status).toBe("missing");
  expect(result.available[0]!.status).toBe("available");
  expect(result.corrupt[0]!.status).toBe("corrupt");
  expect(result.repaired[0]!.status).toBe("available");
  expect(result.restoredHash).toBe(result.originalHash);
  expect(result.documentUnchanged).toBe(true);
  expect(result.officialCode).toBe("invalid");
});
