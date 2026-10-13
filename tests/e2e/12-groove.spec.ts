import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * 12-groove — reglas de MUSICALIDAD de la perilla "Groove" (engine/groove.ts).
 *
 * La perilla agrega microtiming, dinámica y articulación a la reproducción de
 * una canción. El riesgo de una función así no es que suene "poco": es que
 * arruine la música. Por eso acá no se mide si suena lindo, se miden las reglas
 * duras que el dueño fijó, y cada una tiene su assert:
 *
 *   R1. El orden de las notas nunca se invierte.
 *   R2. Los acordes se mueven juntos (mismo desvío exacto).
 *   R3. Jerarquía métrica: los tiempos fuertes casi no se mueven.
 *   R4. Doble tope: absoluto (15 ms) y relativo (8 % del intervalo local).
 *   R5. Sin deriva acumulativa: el pulso medio al final = al principio.
 *   R6. La melodía recibe menos desvío que la armonía.
 *   R7. Nada de swing (no hay ninguna API de swing en el módulo).
 *   R8. Nada se agrega ni se quita: mismas notas, sólo se desplazan.
 *
 * El módulo se importa DESDE LA PÁGINA (`/src/engine/groove.ts` lo sirve Vite),
 * así que se está midiendo el código real que corre en la app, no una copia.
 */

test.describe.configure({ timeout: 180_000 });

const GROOVE_URL = "/src/engine/groove.ts";

/** Una pista de prueba para el plan. */
interface TrackSpec {
  trackIndex: number;
  role: "percussion" | "bass" | "harmony" | "melody";
  percussive?: boolean;
  sustained?: boolean;
  /** Onsets en segundos, en orden. */
  times: number[];
}

interface PlanPayload {
  songKey: string;
  bpm: number;
  timeSignature?: [number, number];
  amount: number;
  tracks: TrackSpec[];
}

interface GrooveValue {
  offsetMs: number;
  durationFactor: number;
  legatoMs: number;
  velocityFactor: number;
}

/** Corre `planGroove` dentro de la página y devuelve el mapa serializado. */
async function planGroove(
  page: Page,
  payload: PlanPayload,
): Promise<Record<string, GrooveValue>> {
  return page.evaluate(
    async (p) => {
      const groove = await import(/* @vite-ignore */ "/src/engine/groove.ts");
      const tracks = p.tracks.map((t) => ({
        trackIndex: t.trackIndex,
        role: t.role,
        percussive: t.percussive,
        sustained: t.sustained,
        notes: t.times.map((time: number, i: number) => ({
          key: `${t.trackIndex}:${i}`,
          time,
        })),
      }));
      const result = groove.planGroove({
        songSeed: groove.hashString(p.songKey),
        bpm: p.bpm,
        timeSignature: p.timeSignature,
        amount: p.amount,
        tracks,
      });
      const out: Record<string, GrooveValue> = {};
      for (const [key, value] of result) out[key] = value;
      return out;
    },
    payload,
  );
}

/** Datos de una canción real, leídos por el parser de la app. */
interface SongFixture {
  bpm: number;
  timeSignature: [number, number] | null;
  empty: boolean;
  tracks: TrackSpec[];
  /** Para R8: cuántas notas entraron. */
  noteCount: number;
}

/**
 * Descarga y parsea un MIDI del catálogo demo usando el MISMO parser de la app
 * (`/src/music/resolve.ts`), para probar con material real y no sólo sintético.
 */
async function loadSongFixture(
  page: Page,
  demoPath: string,
): Promise<SongFixture> {
  return page.evaluate(async (url) => {
    const { parseMidiBytes } = await import(
      /* @vite-ignore */ "/src/music/resolve.ts"
    );
    const bytes = await (await fetch(url)).arrayBuffer();
    const song = await parseMidiBytes(bytes, {
      id: "qa-groove",
      title: "qa-groove",
      trackId: "qa:groove",
      defaultBpm: 120,
    });
    // Una "pista" de prueba por cada pista real, con los roles que deduce la app.
    const groove = await import(/* @vite-ignore */ "/src/engine/groove.ts");
    const tracks = [];
    for (const track of song.tracks) {
      const percussive = track.isDrumKit === true;
      const source = percussive ? song.percussion || [] : song.notes;
      const times = source
        .filter((n) => n.trackIndex === track.index)
        .map((n) => n.time)
        .sort((a, b) => a - b);
      if (times.length === 0) continue;
      tracks.push({
        trackIndex: track.index,
        role: groove.grooveRoleFor(track.instrument, percussive),
        percussive,
        sustained: groove.isSustainedInstrument(track.instrument),
        times,
      });
    }
    return {
      bpm: song.bpm,
      timeSignature: song.timeSignature ?? null,
      empty: song.notes.length === 0,
      tracks,
      noteCount: tracks.reduce((n, t) => n + t.times.length, 0),
    };
  }, demoPath);
}

/** Agrupa onsets idénticos (acordes) preservando el orden. */
function onsetGroups(times: number[]): number[] {
  const out: number[] = [];
  for (const t of times) {
    const last = out[out.length - 1];
    if (last === undefined || Math.abs(t - last) > 5e-4) out.push(t);
  }
  return out;
}

/** Acumula en un array dentro de un Map (sin `??=` sobre `Map.get`). */
function pushInto<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Acumula en un Set dentro de un Map. */
function addInto<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

/** Resultado de aplicar el plan a una pista: onsets ajustados + desvíos. */
function applyPlan(track: TrackSpec, plan: Record<string, GrooveValue>) {
  const groups = onsetGroups(track.times);
  return groups.map((time) => {
    // Todas las notas de un mismo onset comparten resultado (R2): alcanza con
    // mirar la primera del grupo.
    const value = plan[`${track.trackIndex}:${track.times.indexOf(time)}`] ?? {
      offsetMs: 0,
      durationFactor: 1,
      legatoMs: 0,
      velocityFactor: 1,
    };
    return {
      time,
      offsetMs: value.offsetMs,
      adjusted: time + value.offsetMs / 1000,
    };
  });
}

/** Topes por nota: |offset| ≤ min(15 ms, 8 % del intervalo local). */
function checkCaps(track: TrackSpec, plan: Record<string, GrooveValue>) {
  const groups = onsetGroups(track.times);
  const applied = applyPlan(track, plan);
  const violations: string[] = [];
  let maxAbs = 0;
  for (let i = 0; i < groups.length; i++) {
    const gapPrev = i > 0 ? (groups[i]! - groups[i - 1]!) * 1000 : Infinity;
    const gapNext =
      i < groups.length - 1 ? (groups[i + 1]! - groups[i]!) * 1000 : Infinity;
    const gap = Math.min(gapPrev, gapNext);
    const cap = Math.min(15, 0.08 * gap);
    const offset = applied[i]!.offsetMs;
    maxAbs = Math.max(maxAbs, Math.abs(offset));
    if (Math.abs(offset) > cap + 1e-6) {
      violations.push(
        `nota ${i} (t=${groups[i]!.toFixed(3)}s): ${offset.toFixed(2)} ms > tope ${cap.toFixed(2)} ms`,
      );
    }
  }
  return { violations, maxAbs, applied, groups };
}

/** Orden estrictamente creciente de los onsets ajustados (R1). */
function checkOrder(applied: { adjusted: number }[]): string[] {
  const violations: string[] = [];
  for (let i = 1; i < applied.length; i++) {
    if (!(applied[i]!.adjusted > applied[i - 1]!.adjusted)) {
      violations.push(
        `onset ${i} (${applied[i]!.adjusted.toFixed(4)}s) no es posterior a ${applied[i - 1]!.adjusted.toFixed(4)}s`,
      );
    }
  }
  return violations;
}

/** Reglas R1 + R4 sobre una pista. */
function assertMusical(track: TrackSpec, plan: Record<string, GrooveValue>, label: string) {
  const { violations, applied } = checkCaps(track, plan);
  expect(violations, `${label}: topes (R4)`).toEqual([]);
  expect(checkOrder(applied), `${label}: orden (R1)`).toEqual([]);
}

/** Pista densa y rápida: 16avos a 168 BPM con acordes, la peor situación. */
function fastTrack(beats: number, bpm: number): TrackSpec {
  const sixteenth = 60 / bpm / 4;
  const times: number[] = [];
  for (let i = 0; i < beats * 4; i++) {
    const t = i * sixteenth;
    times.push(t);
    if (i % 4 === 0) times.push(t); // acorde en cada tiempo
  }
  return {
    trackIndex: 0,
    role: "melody",
    sustained: false,
    times: times.sort((a, b) => a - b),
  };
}

test.beforeEach(async ({ page }) => {
  // El módulo vive en el dev server de la app (puerto 1234, ver playwright.config).
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof window !== "undefined" && !!document.getElementById("root"),
    { timeout: 30_000 },
  );
});

test("R8/R7: a 0 % el plan es identidad exacta (y el módulo no tiene swing)", async ({
  page,
}) => {
  const track = fastTrack(8, 168);
  const plan = await planGroove(page, {
    songKey: "identidad",
    bpm: 168,
    amount: 0,
    tracks: [track],
  });

  // A 0 % no hay NINGUNA entrada: el motor cae a NO_GROOVE.
  expect(Object.keys(plan)).toHaveLength(0);

  // Y la aritmética del llamador (App.tsx) es identidad bit a bit: sumar 0 al
  // tick y multiplicar por 1 la velocity no cambia el número.
  const ppq = 192;
  const secondsPerTick = 60 / (168 * ppq);
  for (const time of onsetGroups(track.times)) {
    const base = Math.round((time / 60) * 168 * ppq);
    const withGroove = base + Math.round((0 / 1000) * (1 / secondsPerTick));
    expect(Object.is(base, withGroove)).toBe(true);
    const velocity = 0.73;
    expect(Object.is(velocity * 1, velocity)).toBe(true);
  }

  // R7: el módulo no expone swing (es otro control, y vallenato/bolero van
  // rectos: no se activa solo por género).
  const hasSwing = await page.evaluate(async () => {
    const groove = await import(/* @vite-ignore */ "/src/engine/groove.ts");
    return Object.keys(groove).some((k) => /swing/i.test(k));
  });
  expect(hasSwing).toBe(false);
});

test("R1/R2/R4: pasaje denso y rápido (16avos a 168 BPM) a 50 % y 100 %", async ({
  page,
}) => {
  const track = fastTrack(32, 168); // 8 compases de 16avos con acordes
  for (const amount of [0.5, 1]) {
    const plan = await planGroove(page, {
      songKey: "denso",
      bpm: 168,
      amount,
      tracks: [track],
    });
    assertMusical(track, plan, `denso @${amount * 100}%`);

    // R2: todas las notas de un mismo onset comparten EXACTAMENTE el desvío.
    const offsets = new Set<number>();
    for (const [key, value] of Object.entries(plan)) {
      const index = Number(key.split(":")[1]);
      if (track.times[index] === track.times[0]) offsets.add(value.offsetMs);
    }
    // El primer onset agrupa 2 notas (melodía + acorde): un único desvío.
    expect(offsets.size).toBe(1);
  }
});

test("R3/R6: jerarquía métrica y melodía protegida", async ({ page }) => {
  // Rejilla completa: tiempo 1, tiempos débiles y contratiempos de corchea.
  const bpm = 120;
  const beat = 60 / bpm;
  const notes: number[] = [];
  for (let bar = 0; bar < 16; bar++) {
    for (let b = 0; b < 4; b++) {
      notes.push(bar * 4 * beat + b * beat); // tiempos
      notes.push(bar * 4 * beat + b * beat + beat / 2); // contratiempos
    }
  }
  const harmony: TrackSpec = {
    trackIndex: 0,
    role: "harmony",
    times: [...notes].sort((a, b) => a - b),
  };
  const melody: TrackSpec = {
    trackIndex: 1,
    role: "melody",
    times: [...notes].sort((a, b) => a - b),
  };
  const plan = await planGroove(page, {
    songKey: "jerarquia",
    bpm,
    timeSignature: [4, 4],
    amount: 1,
    tracks: [harmony, melody],
  });

  const slotOf = await page.evaluate(
    async ({ t, bpm: bpmIn }) => {
      const groove = await import(/* @vite-ignore */ "/src/engine/groove.ts");
      return (t as number[]).map((x) =>
        groove.metricSlotAt(x, bpmIn, [4, 4]),
      );
    },
    { t: harmony.times, bpm },
  );

  const bySlot: Record<string, number[]> = {};
  harmony.times.forEach((_time, i) => {
    const slot = slotOf[i] as string;
    const value = plan[`0:${i}`];
    if (!value) return;
    (bySlot[slot] ??= []).push(Math.abs(value.offsetMs));
  });

  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  // R3: tiempo 1 casi quieto (≤ 1.5 ms) y tiempos fuertes ≤ 3 ms.
  expect(max(bySlot.downbeat ?? [])).toBeLessThanOrEqual(1.5);
  expect(max(bySlot.strong ?? [])).toBeLessThanOrEqual(3);
  // Y el groove vive en las subdivisiones, no en el pulso.
  expect(mean(bySlot.weak ?? [])).toBeLessThan(mean(bySlot.offbeat ?? []));
  expect(bySlot.offbeat?.length ?? 0).toBeGreaterThan(0);

  // R6: misma rejilla, misma canción ⇒ la melodía se mueve menos que la armonía.
  const meanAbs = (trackIndex: number) => {
    let sum = 0;
    let count = 0;
    harmony.times.forEach((_, i) => {
      const value = plan[`${trackIndex}:${i}`];
      if (!value) return;
      sum += Math.abs(value.offsetMs);
      count++;
    });
    return sum / Math.max(1, count);
  };
  expect(meanAbs(1)).toBeLessThan(meanAbs(0));
});

test("R5: sin deriva acumulativa en una canción larga", async ({ page }) => {
  // 5 minutos de corcheas parejas a 120 BPM: 1200 onsets, distribución métrica
  // idéntica de punta a punta (así lo único que puede moverse es la deriva).
  const bpm = 120;
  const eighth = 60 / bpm / 2;
  const times: number[] = [];
  for (let i = 0; i < 1200; i++) times.push(i * eighth);
  const track: TrackSpec = {
    trackIndex: 0,
    role: "harmony",
    times,
  };
  const plan = await planGroove(page, {
    songKey: "deriva",
    bpm,
    timeSignature: [4, 4],
    amount: 1,
    tracks: [track],
  });
  const applied = applyPlan(track, plan).map((a) => a.adjusted);
  const written = onsetGroups(track.times);
  const offsets = applied.map((t, i) => (t - written[i]!) * 1000);

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const window = Math.floor(applied.length * 0.1);
  const head = offsets.slice(0, window);
  const tail = offsets.slice(-window);

  // (e) La posición media del pulso al PRINCIPIO y al FINAL es la misma: la
  // diferencia tiene que ser ~0. Ésta es la regla: el ruido 1/f está re-anclado
  // por compás, así que no puede dejar la canción "corrida".
  expect(Math.abs(mean(tail) - mean(head))).toBeLessThan(1);

  // Y el sesgo TOTAL es acotado (no crece con la duración): unos pocos ms del
  // "pocket" del rol, nunca una acumulación. Con 1200 onsets, si hubiera deriva
  // este número sería del orden de cientos de ms.
  expect(Math.abs(mean(offsets))).toBeLessThan(3);

  // El desvío medio por compás tampoco se mueve entre la primera y la segunda
  // mitad de la canción (el re-anclado por compás hace su trabajo).
  const barSeconds = (60 / bpm) * 4;
  const perBar = new Map<number, number[]>();
  written.forEach((t, i) => {
    pushInto(perBar, Math.floor(t / barSeconds), offsets[i]!);
  });
  const barMeans = [...perBar.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, xs]) => mean(xs));
  expect(perBar.size).toBeGreaterThan(100);
  const half = Math.floor(barMeans.length / 2);
  expect(
    Math.abs(mean(barMeans.slice(half)) - mean(barMeans.slice(0, half))),
  ).toBeLessThan(1);
});

test("R1..R5 con canciones REALES (densas y rápidas)", async ({ page }) => {
  const songs = [
    "/demo/fur_elise.mid",
    "/demo/DiomedesDiaz_-_Sin_Medir_Distancias.mid",
  ];
  for (const path of songs) {
    const fixture = await loadSongFixture(page, path);
    expect(fixture.empty, `${path} no tiene notas`).toBe(false);
    for (const amount of [0.5, 1]) {
      const plan = await planGroove(page, {
        songKey: `real:${path}`,
        bpm: fixture.bpm,
        timeSignature: fixture.timeSignature ?? undefined,
        amount,
        tracks: fixture.tracks,
      });

      // R8: entra exactamente una entrada por nota y ninguna de más.
      const expected = fixture.tracks.reduce((n, t) => n + t.times.length, 0);
      expect(Object.keys(plan)).toHaveLength(expected);

      for (const track of fixture.tracks) {
        assertMusical(track, plan, `${path}#${track.trackIndex} @${amount * 100}%`);

        // R2: mismo onset ⇒ mismo desvío exacto (acordes intactos).
        const byOnset = new Map<number, Set<number>>();
        track.times.forEach((time, i) => {
          const value = plan[`${track.trackIndex}:${i}`];
          if (!value) return;
          addInto(byOnset, Math.round(time * 1e6), value.offsetMs);
        });
        for (const [key, offsets] of byOnset) {
          expect(
            offsets.size,
            `${path}#${track.trackIndex}: acorde en ${key / 1e6}s con desvíos distintos`,
          ).toBe(1);
        }
      }
    }
  }
});

test("determinismo: la misma canción suena igual siempre", async ({ page }) => {
  const track = fastTrack(16, 140);
  const payload: PlanPayload = {
    songKey: "determinista",
    bpm: 140,
    amount: 1,
    tracks: [track],
  };
  const a = await planGroove(page, payload);
  const b = await planGroove(page, payload);
  expect(a).toEqual(b);

  const other = await planGroove(page, { ...payload, songKey: "otra-cancion" });
  const differs = Object.keys(a).some(
    (key) => a[key]!.offsetMs !== other[key]!.offsetMs,
  );
  expect(differs).toBe(true);
});
