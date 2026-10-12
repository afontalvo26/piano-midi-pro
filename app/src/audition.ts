/**
 * Página de audición — /audition.html
 *
 * Escuchar es la única forma de decidir si un instrumento suena real. Esta
 * página toca el MISMO riff con el MISMO instrumento desde cada fuente
 * disponible (soundfonts GM reales) y desde el sintetizador viejo, para que la
 * elección sea por oído y no por fe.
 *
 * No la usa el reproductor: es una herramienta de decisión. Una vez elegido el
 * set por instrumento, se fija en `GMSamplerEngine` (tabla de overrides).
 */

import * as Tone from "tone";
import {
  instrumentToSoundfont,
  loadSoundfontSampler,
} from "./engine/GMSamplerEngine";
import { WAF_SUGGESTIONS, loadWebAudioFontSampler } from "./engine/WebAudioFont";
import { loadButtonAccordion } from "./engine/freePatsAccordion";
import { DrumKitEngine } from "./engine/DrumKitEngine";
import { InstrumentEngineRegistry } from "./engine/InstrumentEngine";
import { getInstrumentSynthSettings } from "./utils/instrumentMapping";
import { GM_DRUMS } from "./utils/gmDrums";

const SETS = ["MusyngKite", "FluidR3_GM", "FatBoy"] as const;

/** Una fuente concreta de sonido para un instrumento. */
interface Source {
  /** Identificador único (clave de caché). */
  id: string;
  /** Etiqueta del botón. */
  label: string;
  kind: "gleitz" | "waf" | "synth" | "accordion";
}

interface Phrase {
  /** Nombre del instrumento tal como lo asigna el reproductor. */
  instrument: string;
  /** Por qué importa (género). */
  why: string;
  /** [nota, inicio en beats, duración en beats, velocity 0..1] */
  notes: [string, number, number, number][];
  bpm: number;
}

const PHRASES: Phrase[] = [
  {
    instrument: "Accordion",
    why: "Vallenato — es EL instrumento del género",
    bpm: 120,
    notes: [
      ["C4", 0, 0.5, 0.85], ["E4", 0.5, 0.5, 0.8], ["G4", 1, 0.5, 0.85],
      ["C5", 1.5, 0.75, 0.9], ["G4", 2.25, 0.25, 0.7], ["E4", 2.5, 1, 0.8],
      ["F4", 3.5, 0.5, 0.8], ["A4", 4, 1.5, 0.9],
    ],
  },
  {
    instrument: "Tango Accordion",
    why: "Vallenato/bolero — acordeón con otra afinación",
    bpm: 120,
    notes: [
      ["A3", 0, 0.5, 0.85], ["C4", 0.5, 0.5, 0.8], ["E4", 1, 0.5, 0.85],
      ["A4", 1.5, 1, 0.9], ["G4", 2.5, 0.5, 0.8], ["E4", 3, 1.5, 0.85],
    ],
  },
  {
    instrument: "Harmonica",
    why: "Bolero/vallenato — antes sonaba a sirena de terror",
    bpm: 100,
    notes: [
      ["G3", 0, 0.5, 0.85], ["C4", 0.5, 0.5, 0.8], ["E4", 1, 0.5, 0.85],
      ["G4", 1.5, 1, 0.9], ["E4", 2.5, 0.5, 0.8], ["C4", 3, 1.5, 0.8],
    ],
  },
  {
    instrument: "Acoustic Bass",
    why: "Bolero — el bajo que sonaba a growl",
    bpm: 100,
    notes: [
      ["C2", 0, 1, 0.9], ["G2", 1, 0.5, 0.75], ["C3", 1.5, 0.5, 0.8],
      ["E2", 2, 1, 0.85], ["A2", 3, 0.5, 0.75], ["G2", 3.5, 1, 0.8],
    ],
  },
  {
    instrument: "Electric Bass (finger)",
    why: "Vallenato moderno / tropical",
    bpm: 100,
    notes: [
      ["E2", 0, 0.75, 0.9], ["E2", 0.75, 0.25, 0.6], ["G2", 1, 0.5, 0.8],
      ["A2", 1.5, 0.5, 0.8], ["B2", 2, 0.75, 0.85], ["A2", 2.75, 0.25, 0.6],
      ["G2", 3, 1, 0.8],
    ],
  },
  {
    instrument: "Acoustic Guitar (nylon)",
    why: "Bolero — base de guitarras",
    bpm: 96,
    notes: [
      ["A2", 0, 0.5, 0.7], ["E3", 0.5, 0.5, 0.6], ["A3", 1, 0.5, 0.65],
      ["C4", 1.5, 0.5, 0.6], ["E3", 2, 0.5, 0.6], ["A3", 2.5, 0.5, 0.65],
      ["D3", 3, 0.5, 0.6], ["A3", 3.5, 1, 0.65],
    ],
  },
  {
    instrument: "Electric Piano 2",
    why: "Bolero/tropical — antes sonaba a piano de concierto",
    bpm: 96,
    notes: [
      ["F3", 0, 0.5, 0.75], ["A3", 0.5, 0.5, 0.7], ["C4", 1, 0.75, 0.8],
      ["F4", 1.75, 0.75, 0.75], ["A4", 2.5, 0.5, 0.7], ["C5", 3, 1, 0.75],
    ],
  },
  {
    instrument: "Alto Sax",
    why: "Bolero/tropical — sax lead",
    bpm: 92,
    notes: [
      ["C4", 0, 0.75, 0.85], ["D4", 0.75, 0.25, 0.7], ["E4", 1, 1, 0.85],
      ["G4", 2, 0.5, 0.8], ["A4", 2.5, 1.5, 0.9],
    ],
  },
  {
    instrument: "Trumpet",
    why: "Vallenato/tropical — metales",
    bpm: 104,
    notes: [
      ["G4", 0, 0.5, 0.85], ["C5", 0.5, 0.5, 0.9], ["E5", 1, 0.5, 0.9],
      ["D5", 1.5, 0.5, 0.8], ["C5", 2, 1.5, 0.85],
    ],
  },
  {
    instrument: "Trombone",
    why: "Tropical — sección de metales",
    bpm: 104,
    notes: [
      ["F3", 0, 0.75, 0.85], ["A3", 0.75, 0.25, 0.7], ["C4", 1, 1, 0.85],
      ["B3", 2, 0.5, 0.8], ["A3", 2.5, 1.5, 0.85],
    ],
  },
  {
    instrument: "Flute",
    why: "Tropical — flauta / caña",
    bpm: 108,
    notes: [
      ["C5", 0, 0.5, 0.8], ["E5", 0.5, 0.5, 0.8], ["G5", 1, 0.5, 0.85],
      ["A5", 1.5, 0.5, 0.8], ["G5", 2, 1, 0.8],
    ],
  },
  {
    instrument: "String Ensemble 1",
    why: "Bolero — colchón de cuerdas",
    bpm: 92,
    notes: [
      ["C4", 0, 1, 0.75], ["E4", 1, 1, 0.7], ["G4", 2, 1, 0.75],
      ["A4", 3, 2, 0.8],
    ],
  },
  {
    instrument: "Violin",
    why: "Bolero — violín lead",
    bpm: 92,
    notes: [
      ["G4", 0, 0.75, 0.8], ["A4", 0.75, 0.25, 0.7], ["B4", 1, 1, 0.85],
      ["D5", 2, 0.5, 0.8], ["C5", 2.5, 1.5, 0.8],
    ],
  },
  {
    instrument: "Acoustic Grand Piano",
    why: "Referencia — este es el piano que ya te gusta",
    bpm: 96,
    notes: [
      ["C4", 0, 0.5, 0.8], ["E4", 0.5, 0.5, 0.75], ["G4", 1, 0.5, 0.8],
      ["C5", 1.5, 0.5, 0.8], ["E4", 2, 0.5, 0.7], ["G4", 2.5, 0.5, 0.75],
      ["C5", 3, 1, 0.85],
    ],
  },
  {
    instrument: "Drawbar Organ",
    why: "Tropical — órgano (antes caía en el motor de piano)",
    bpm: 104,
    notes: [
      ["C4", 0, 1, 0.8], ["E4", 1, 1, 0.75], ["G4", 2, 1, 0.8],
      ["B3", 3, 1, 0.75],
    ],
  },
];

// ── Estado ───────────────────────────────────────────────────────────────────

const samplers = new Map<string, Tone.Sampler>();
const inFlight = new Map<string, Promise<Tone.Sampler>>();
const synths = new Map<string, Tone.PolySynth>();
let master: Tone.Volume | null = null;
let started = false;
let currentStop: (() => void) | null = null;
let loopRiff = false;

function getMaster(): Tone.Volume {
  if (!master) master = new Tone.Volume(-6).toDestination();
  return master;
}

async function ensureAudio(): Promise<void> {
  if (started) return;
  await Tone.start();
  started = true;
}

/** Fuentes disponibles para un instrumento: sets GM + variantes + synth. */
function sourcesFor(instrument: string): Source[] {
  const list: Source[] = [];
  // El acordeón de botones real va PRIMERO: es el que usa el reproductor para
  // vallenato, así que es contra ese que hay que comparar.
  if (/accordion|acorde/i.test(instrument) && !/tango|bandone/i.test(instrument)) {
    list.push({
      id: "accordion:freepats",
      label: "Botones (real)",
      kind: "accordion",
    });
  }
  for (const set of SETS) {
    list.push({ id: `gleitz:${set}`, label: set, kind: "gleitz" });
  }
  for (const code of WAF_SUGGESTIONS[instrument] ?? []) {
    // "0210_GeneralUserGS" → "GeneralUserGS 0210"
    const [num, bank] = code.split("_");
    list.push({
      id: `waf:${code}`,
      label: `${bank} ${num}`,
      kind: "waf",
    });
  }
  list.push({ id: "synth", label: "Synth viejo", kind: "synth" });
  return list;
}

async function loadSource(
  source: Source,
  instrument: string,
): Promise<Tone.Sampler | null> {
  if (source.kind === "synth") return null;
  const cached = samplers.get(source.id);
  if (cached) return cached;
  const pending = inFlight.get(source.id);
  if (pending) return pending;

  const task = (async () => {
    if (source.kind === "accordion") {
      return loadButtonAccordion(getMaster());
    }
    if (source.kind === "gleitz") {
      const sf = instrumentToSoundfont(instrument);
      if (!sf) throw new Error(`"${instrument}" no tiene soundfont`);
      const set = source.id.split(":")[1];
      return loadSoundfontSampler(sf, getMaster(), set);
    }
    const code = source.id.split(":")[1];
    return loadWebAudioFontSampler(code, getMaster());
  })()
    .then((s) => {
      samplers.set(source.id, s);
      inFlight.delete(source.id);
      updateCacheInfo();
      return s;
    })
    .catch((err) => {
      inFlight.delete(source.id);
      updateCacheInfo();
      throw err;
    });

  inFlight.set(source.id, task);
  return task;
}

function getSynth(instrument: string): Tone.PolySynth {
  let synth = synths.get(instrument);
  if (!synth) {
    // El respaldo neutro actual (el "synth viejo" era un sawtooth pelado).
    const settings = getInstrumentSynthSettings(instrument);
    synth = new Tone.PolySynth(Tone.Synth, settings).connect(getMaster());
    synth.maxPolyphony = 16;
    synths.set(instrument, synth);
  }
  return synth;
}

function stopAll(): void {
  currentStop?.();
  currentStop = null;
  synths.forEach((s) => s.releaseAll());
  samplers.forEach((s) => s.releaseAll());
  document
    .querySelectorAll("button.src.playing")
    .forEach((b) => b.classList.remove("playing"));
}

function playPhrase(
  phrase: Phrase,
  source: Source,
  sampler: Tone.Sampler | null,
): () => void {
  const spb = 60 / phrase.bpm;
  const t0 = Tone.now() + 0.08;
  const ends: number[] = [];

  if (source.kind === "synth" || !sampler) {
    const synth = getSynth(phrase.instrument);
    for (const [note, at, dur, vel] of phrase.notes) {
      synth.triggerAttackRelease(note, dur * spb, t0 + at * spb, vel);
      ends.push(t0 + at * spb + dur * spb);
    }
  } else {
    for (const [note, at, dur, vel] of phrase.notes) {
      sampler.triggerAttackRelease(note, dur * spb, t0 + at * spb, vel);
      ends.push(t0 + at * spb + dur * spb);
    }
  }

  const endAt = Math.max(...ends) + 0.4;
  const timer = window.setTimeout(() => {
    document
      .querySelectorAll("button.src.playing")
      .forEach((b) => b.classList.remove("playing"));
    if (loopRiff) {
      const btn = document.querySelector<HTMLButtonElement>(
        `button.src.playing`,
      );
      if (btn) btn.click();
    }
  }, Math.max(200, (endAt - Tone.now()) * 1000));
  return () => window.clearTimeout(timer);
}

// ── UI ───────────────────────────────────────────────────────────────────────

const grid = document.getElementById("grid")!;
const cacheInfo = document.getElementById("cacheInfo")!;

function updateCacheInfo(): void {
  cacheInfo.textContent = `${samplers.size} instrumento(s) en memoria${
    inFlight.size ? `, ${inFlight.size} cargando…` : ""
  }`;
}

function buildCard(phrase: Phrase): HTMLElement {
  const sf = instrumentToSoundfont(phrase.instrument);
  const card = document.createElement("section");
  card.className = "card";

  const h2 = document.createElement("h2");
  h2.textContent = phrase.instrument;
  card.appendChild(h2);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${phrase.why} · soundfont: ${sf ?? "—"}`;
  card.appendChild(meta);

  const row = document.createElement("div");
  row.className = "row";

  const status = document.createElement("div");
  status.className = "status";

  const sources = sourcesFor(phrase.instrument);
  for (const source of sources) {
    const btn = document.createElement("button");
    btn.className = `src${source.kind === "synth" ? " synth" : ""}`;
    btn.textContent = source.label;
    btn.title =
      source.kind === "waf"
        ? `WebAudioFont ${source.id.split(":")[1]}`
        : source.kind === "gleitz"
          ? `soundfont ${source.id.split(":")[1]}`
          : "sintetizador (oscilador, sin sample)";
    btn.addEventListener("click", async () => {
      stopAll();
      btn.classList.add("playing");
      try {
        await ensureAudio();
        const t0 = performance.now();
        if (source.kind !== "synth" && !samplers.has(source.id)) {
          status.className = "status";
          status.textContent = `bajando ${source.label}…`;
        }
        const sampler = await loadSource(source, phrase.instrument);
        if (source.kind !== "synth") {
          status.className = "status ok";
          status.textContent = `${source.label}: listo (${Math.round(
            performance.now() - t0,
          )} ms)`;
        } else {
          status.className = "status";
          status.textContent = "sintetizador (oscilador, sin sample)";
        }
        currentStop = playPhrase(phrase, source, sampler);
      } catch (err) {
        btn.classList.remove("playing");
        status.className = "status err";
        status.textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
    row.appendChild(btn);
  }

  card.appendChild(row);
  card.appendChild(status);
  return card;
}

PHRASES.forEach((p) => grid.appendChild(buildCard(p)));
updateCacheInfo();

// ── Ritmos: percusión real vs. la que sonaba antes ───────────────────────────
//
// El reproductor descartaba el canal 10 entero. Acá se escucha lo que se estaba
// perdiendo: el mismo patrón con samples reales (FreePats + kit GM, con
// round-robin) y con el PercussionEngine sintetizado de antes.

interface Rhythm {
  label: string;
  why: string;
  bpm: number;
  /** [nota GM, inicio en beats, velocity] */
  hits: [number, number, number][];
}

const RHYTHMS: Rhythm[] = [
  {
    label: "Vallenato — caja y guacharaca",
    why: "Cajón ≈ caja vallenata, shaker ≈ guacharaca (no existe pack libre de las reales)",
    bpm: 110,
    hits: [
      // Guacharaca: 16avos constantes.
      ...[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75].map(
        (t) => [82, t, t % 0.5 === 0 ? 0.8 : 0.45] as [number, number, number],
      ),
      // Caja: acentos del patrón de merengue vallenato.
      [36, 0, 0.95],
      [37, 1.5, 0.7],
      [36, 2, 0.9],
      [37, 2.75, 0.65],
      [36, 3.5, 0.8],
    ],
  },
  {
    label: "Bolero — maracas y bongó",
    why: "Maracas en corcheas + bongó sincopado + claves",
    bpm: 88,
    hits: [
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(
        (t) => [70, t, t % 1 === 0 ? 0.85 : 0.5] as [number, number, number],
      ),
      [60, 0.5, 0.8],
      [61, 1.25, 0.7],
      [60, 1.75, 0.75],
      [61, 2.5, 0.7],
      [60, 3.25, 0.8],
      [75, 0, 0.9],
      [75, 2, 0.85],
    ],
  },
  {
    label: "Cumbia — llamador y tambora",
    why: "Congas + pandereta + bombo",
    bpm: 96,
    hits: [
      [36, 0, 0.95],
      [36, 2, 0.9],
      [63, 0.5, 0.8],
      [64, 1, 0.85],
      [62, 1.5, 0.7],
      [63, 2.5, 0.8],
      [64, 3, 0.85],
      [62, 3.5, 0.7],
      ...[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75].map(
        (t) => [54, t, 0.45] as [number, number, number],
      ),
    ],
  },
  {
    label: "Kit estándar — rock/pop",
    why: "Bombo, redoblante y hi-hats del kit GM",
    bpm: 100,
    hits: [
      [36, 0, 0.95], [42, 0, 0.7], [38, 1, 0.9], [42, 1, 0.7],
      [36, 2, 0.9], [42, 2, 0.7], [38, 3, 0.9], [42, 3, 0.7],
      [36, 3.5, 0.8], [46, 3.75, 0.6],
    ],
  },
];

let drumEngine: DrumKitEngine | null = null;
let synthPercussion: InstrumentEngineRegistry | null = null;

function getDrumEngine(): DrumKitEngine {
  if (!drumEngine) {
    synthPercussion = new InstrumentEngineRegistry(getMaster());
    drumEngine = new DrumKitEngine(
      getMaster(),
      synthPercussion.getPercussion("audition"),
    );
  }
  return drumEngine;
}

function buildRhythmCard(rhythm: Rhythm): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";

  const h2 = document.createElement("h2");
  h2.textContent = rhythm.label;
  card.appendChild(h2);

  const meta = document.createElement("div");
  meta.className = "meta";
  const pieces = [...new Set(rhythm.hits.map(([n]) => n))]
    .map((n) => GM_DRUMS[n]?.name ?? `nota ${n}`)
    .join(", ");
  meta.textContent = `${rhythm.why} · piezas: ${pieces}`;
  card.appendChild(meta);

  const row = document.createElement("div");
  row.className = "row";
  const status = document.createElement("div");
  status.className = "status";

  const play = (real: boolean) => async () => {
    stopAll();
    const btn = real
      ? row.querySelector<HTMLButtonElement>("button.real")
      : row.querySelector<HTMLButtonElement>("button.synth");
    btn?.classList.add("playing");
    try {
      await ensureAudio();
      const spb = 60 / rhythm.bpm;
      const t0 = Tone.now() + 0.1;
      const engine = getDrumEngine();
      const notes = [...new Set(rhythm.hits.map(([n]) => n))];
      if (real) {
        const pending = notes.filter((n) => !engine.has(n));
        if (pending.length) {
          status.className = "status";
          status.textContent = `bajando ${pending.length} pieza(s)…`;
          await engine.prefetch(notes);
        }
        status.className = "status ok";
        status.textContent = `real: ${engine.loadedCount()} piezas con sample`;
      } else {
        status.className = "status";
        status.textContent = "percussion sintetizada (lo de antes)";
      }
      for (const [note, at, vel] of rhythm.hits) {
        const time = t0 + at * spb;
        if (real) {
          if (!engine.trigger(note, vel, time)) engine.triggerSynth(note, vel, time);
        } else {
          engine.triggerSynth(note, vel, time);
        }
      }
      const endAt = Math.max(...rhythm.hits.map(([, at]) => at)) * spb;
      currentStop = () => window.clearTimeout(timer);
      const timer = window.setTimeout(() => {
        row.querySelectorAll("button.playing").forEach((b) => b.classList.remove("playing"));
      }, Math.max(300, (t0 + endAt + 0.6 - Tone.now()) * 1000));
    } catch (err) {
      btn?.classList.remove("playing");
      status.className = "status err";
      status.textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  const realBtn = document.createElement("button");
  realBtn.className = "src real";
  realBtn.textContent = "Percusión real";
  realBtn.addEventListener("click", play(true));
  row.appendChild(realBtn);

  const synthBtn = document.createElement("button");
  synthBtn.className = "src synth";
  synthBtn.textContent = "Synth viejo";
  synthBtn.addEventListener("click", play(false));
  row.appendChild(synthBtn);

  card.appendChild(row);
  card.appendChild(status);
  return card;
}

const rhythmsHost = document.getElementById("rhythms");
if (rhythmsHost) {
  RHYTHMS.forEach((r) => rhythmsHost.appendChild(buildRhythmCard(r)));
}

document.getElementById("panic")!.addEventListener("click", stopAll);

document.getElementById("clear")!.addEventListener("click", () => {
  stopAll();
  samplers.forEach((s) => s.dispose());
  samplers.clear();
  inFlight.clear();
  updateCacheInfo();
});

document.getElementById("loop")!.addEventListener("change", (e) => {
  loopRiff = (e.target as HTMLInputElement).checked;
});
