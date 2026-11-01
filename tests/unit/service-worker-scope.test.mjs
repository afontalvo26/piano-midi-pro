import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../app/public/sw.js", import.meta.url), "utf8");
const origin = "https://piano.example";

function harness() {
  const listeners = new Map();
  const deleted = [];
  const precached = [];
  const fetched = [];
  const opened = [];
  const stored = new Map();
  const cache = (name) => ({
    addAll: async (urls) => { precached.push(...urls); },
    put: async (request, response) => { stored.set(`${name}:${request.url ?? request}`, response); },
    match: async (request) => stored.get(`${name}:${request.url ?? request}`),
  });
  const caches = {
    keys: async () => ["pmp-app-v4", "pmp-demos-v4", "pmp-covers-v4", "pmp-app-v5", "pmp-samples-v5", "other-app-cache"],
    delete: async (name) => { deleted.push(name); return true; },
    open: async (name) => { opened.push(name); return cache(name); },
  };
  const self = {
    location: { origin },
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const fetch = async (request) => {
    fetched.push(request.url);
    return { status: 200, clone() { return this; } };
  };
  runInNewContext(source, { URL, Set, Promise, Error, self, caches, fetch });

  async function dispatch(type, event) {
    let work;
    listeners.get(type)({
      ...event,
      waitUntil: (promise) => { work = promise; },
      respondWith: (promise) => { work = promise; },
    });
    if (work) await work;
    return Boolean(work);
  }
  const request = (path, mode = "cors") => ({ url: `${origin}${path}`, method: "GET", mode });
  return { dispatch, request, deleted, precached, fetched, opened, stored };
}

test("activation removes old app caches only and precaches recorded cores", async () => {
  const sw = harness();
  await sw.dispatch("install", {});
  await sw.dispatch("activate", {});
  assert.deepEqual(sw.deleted.sort(), ["pmp-app-v4", "pmp-app-v5", "pmp-covers-v4", "pmp-demos-v4", "pmp-samples-v5"]);
  for (const note of ["C3", "Fs3", "C4", "Fs4", "C5", "Fs5", "C6"]) {
    assert.ok(sw.precached.includes(`/audio/salamander/core/${note}.ogg`));
  }
  assert.equal(sw.precached.filter((url) => url.startsWith("/audio/salamander/core-aac/")).length, 0);
  assert.equal(sw.precached.filter((url) => url.includes("/core-aac/")).length, 0);
  assert.equal(sw.precached.filter((url) => url.startsWith("/audio/virtuosity/core/") && url.endsWith(".ogg")).length, 38);
  assert.ok(sw.precached.includes("/audio/virtuosity/core/manifest.json"));
  assert.ok(sw.precached.includes("/audio/virtuosity/core/LICENSE"));
  assert.equal(sw.precached.filter((url) => url.startsWith("/audio/freepats-handclap/core/") && url.endsWith(".ogg")).length, 9);
  assert.ok(sw.precached.includes("/audio/freepats-handclap/core/manifest.json"));
  assert.ok(sw.precached.includes("/audio/freepats-handclap/core/LICENSE.txt"));
  assert.equal(sw.precached.filter((url) => url.startsWith("/audio/tr808-fischer/core/") &&
    url.endsWith(".WAV")).length, 17);
  assert.ok(sw.precached.includes("/audio/tr808-fischer/core/manifest.json"));
  assert.ok(sw.precached.includes("/audio/tr808-fischer/core/LICENSE"));
});

test("fetch cache handles shell, core and local anchors without retrying cached audio", async () => {
  const sw = harness();
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/demo/old.kar") }), false);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/covers/old.webp") }), false);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/other-app/data.json") }), false);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/studio", "navigate") }), false);
  assert.equal(sw.fetched.length, 0);

  assert.equal(await sw.dispatch("fetch", { request: sw.request("/", "navigate") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/assets/index-123.js") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/salamander/core/C4.ogg") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/salamander/anchors/Ds4.ogg") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/salamander/anchors/Ds4.ogg") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/virtuosity/core/Cowbell1_Normal_v1_rr1_Close.ogg") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/virtuosity/core/Cowbell1_Normal_v1_rr1_Close.ogg") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/freepats-handclap/core/01_02.ogg") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/freepats-handclap/core/01_02.ogg") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/tr808-fischer/core/BD5010.WAV") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/tr808-fischer/core/BD5010.WAV") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/salamander/core-aac/manifest.json") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/salamander/core-aac/C4.m4a") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/salamander/core-aac/C4.m4a") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/virtuosity/core-aac/kickmic_kick_snoff_vl1_rr1.m4a") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/virtuosity/core-aac/kickmic_kick_snoff_vl1_rr1.m4a") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/freepats-handclap/core-aac/01_02.m4a") }), true);
  assert.equal(await sw.dispatch("fetch", { request: sw.request("/audio/freepats-handclap/core-aac/01_02.m4a") }), true);
  assert.equal(sw.fetched.length, 11);
  assert.ok(sw.opened.every((name) => name === "pmp-app-v10"));
});
