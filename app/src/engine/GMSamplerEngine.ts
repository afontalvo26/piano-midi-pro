/**
 * GMSamplerEngine — Real instrument samples for all 128 GM instruments.
 * Source: gleitz/midi-js-soundfonts (MusyngKite) — actual recordings, OGG high quality.
 * Caches loaded Tone.Samplers to avoid re-fetching on repeated use.
 *
 * ⚠️ La URL del CDN lleva GUIONES: `midi-js-soundfonts` (el repo de GitHub es
 * `gleitz/midi-js-soundfonts`). Durante mucho tiempo acá decía `midi.js-soundfonts`
 * (con punto): eso devolvía 404 en TODOS los instrumentos, el error se tragaba el
 * catch y cada pista no-piano terminaba sonando con los motores de síntesis
 * (sawtooth) — de ahí los bajos y la armónica "robóticos". No cambiar el guion.
 */

import * as Tone from "tone";
import {
  isButtonAccordionInstrument,
  loadButtonAccordion,
} from "./freePatsAccordion";

/** El set de soundfont se sirve desde el repo de gleitz en la rama gh-pages. */
const SOUNDFONT_SET = "MusyngKite";

/**
 * Espejos, en orden de preferencia. GitHub Pages a veces corta la conexión
 * bajo carga (ver `fetchSoundfontText`); jsDelivr sirve exactamente los mismos
 * archivos desde su propia infraestructura, así que un fallo del primero no
 * degrada el instrumento a síntesis.
 */
const CDN_BASES = [
  "https://gleitz.github.io/midi-js-soundfonts",
  "https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages",
];

// ─── Instrument → soundfont filename mapping ──────────────────────────────────

const SF_MAP: [RegExp, string][] = [
  // Piano family
  [/bright acoustic/i, "bright_acoustic_piano"],
  [/electric grand/i, "electric_grand_piano"],
  [/honky.?tonk/i, "honkytonk_piano"],
  [/electric piano 1/i, "electric_piano_1"],
  [/electric piano 2/i, "electric_piano_2"],
  [/harpsichord/i, "harpsichord"],
  [/clavinet/i, "clavinet"],
  [/acoustic grand|grand piano/i, "acoustic_grand_piano"],
  // Chromatic percussion
  [/celesta/i, "celesta"],
  [/glockenspiel/i, "glockenspiel"],
  [/music box/i, "music_box"],
  [/vibraphone/i, "vibraphone"],
  [/marimba/i, "marimba"],
  [/xylophone/i, "xylophone"],
  [/tubular bells?/i, "tubular_bells"],
  [/dulcimer/i, "dulcimer"],
  // Organ
  [/drawbar organ/i, "drawbar_organ"],
  [/percussive organ/i, "percussive_organ"],
  [/rock organ/i, "rock_organ"],
  [/church organ/i, "church_organ"],
  [/reed organ/i, "reed_organ"],
  [/tango accordion/i, "tango_accordion"],
  [/accordion/i, "accordion"],
  [/harmonica/i, "harmonica"],
  // Guitar
  [/acoustic guitar.*nylon|nylon.*guitar/i, "acoustic_guitar_nylon"],
  [/acoustic guitar.*steel|steel.*guitar/i, "acoustic_guitar_steel"],
  [/electric guitar.*jazz|jazz guitar/i, "electric_guitar_jazz"],
  [/electric guitar.*clean|clean guitar/i, "electric_guitar_clean"],
  [/electric guitar.*muted|muted guitar/i, "electric_guitar_muted"],
  [/overdriven/i, "overdriven_guitar"],
  [/distortion guitar/i, "distortion_guitar"],
  [/guitar harmonics/i, "guitar_harmonics"],
  // Bass
  [/acoustic bass/i, "acoustic_bass"],
  [/electric bass.*finger|finger.*bass/i, "electric_bass_finger"],
  [/electric bass.*pick|bass.*pick|picked bass/i, "electric_bass_pick"],
  [/fretless bass/i, "fretless_bass"],
  [/slap bass 1/i, "slap_bass_1"],
  [/slap bass 2/i, "slap_bass_2"],
  [/synth bass 1/i, "synth_bass_1"],
  [/synth bass 2/i, "synth_bass_2"],
  // Strings
  [/violin/i, "violin"],
  [/\bviola\b/i, "viola"],
  [/cello/i, "cello"],
  [/contrabass/i, "contrabass"],
  [/tremolo strings/i, "tremolo_strings"],
  [/pizzicato/i, "pizzicato_strings"],
  [/orchestral harp|harp/i, "orchestral_harp"],
  [/timpani/i, "timpani"],
  [/string ensemble 1/i, "string_ensemble_1"],
  [/string ensemble 2/i, "string_ensemble_2"],
  [/synth strings 1/i, "synth_strings_1"],
  [/synth strings 2/i, "synth_strings_2"],
  [/choir aahs/i, "choir_aahs"],
  [/voice oohs/i, "voice_oohs"],
  [/synth choir/i, "synth_choir"],
  [/orchestra hit/i, "orchestra_hit"],
  // Brass — muted before open
  [/muted trumpet/i, "muted_trumpet"],
  [/trumpet/i, "trumpet"],
  [/trombone/i, "trombone"],
  [/\btuba\b/i, "tuba"],
  [/french horn|\bhorn\b/i, "french_horn"],
  [/brass section/i, "brass_section"],
  [/synth brass 1/i, "synth_brass_1"],
  [/synth brass 2/i, "synth_brass_2"],
  // Woodwind / Reed
  [/soprano sax/i, "soprano_sax"],
  [/alto sax/i, "alto_sax"],
  [/tenor sax/i, "tenor_sax"],
  [/baritone sax/i, "baritone_sax"],
  [/oboe/i, "oboe"],
  [/english horn/i, "english_horn"],
  [/bassoon/i, "bassoon"],
  [/clarinet/i, "clarinet"],
  [/piccolo/i, "piccolo"],
  [/\bflute\b/i, "flute"],
  [/\brecorder\b/i, "recorder"],
  [/pan flute/i, "pan_flute"],
  [/blown bottle/i, "blown_bottle"],
  [/shakuhachi/i, "shakuhachi"],
  [/\bwhistle\b/i, "whistle"],
  [/ocarina/i, "ocarina"],
  // Synth lead
  [/lead 1|square/i, "lead_1_square"],
  [/lead 2|sawtooth/i, "lead_2_sawtooth"],
  [/lead 3|calliope/i, "lead_3_calliope"],
  [/lead 4|chiff/i, "lead_4_chiff"],
  [/lead 5|charang/i, "lead_5_charang"],
  [/lead 6|voice/i, "lead_6_voice"],
  [/lead 7|fifths/i, "lead_7_fifths"],
  [/lead 8|bass.lead/i, "lead_8_bass_lead"],
  // Synth pad
  [/pad 1|new age/i, "pad_1_new_age"],
  [/pad 2|warm/i, "pad_2_warm"],
  [/pad 3|polysynth/i, "pad_3_polysynth"],
  [/pad 4|choir/i, "pad_4_choir"],
  [/pad 5|bowed/i, "pad_5_bowed"],
  [/pad 6|metallic/i, "pad_6_metallic"],
  [/pad 7|halo/i, "pad_7_halo"],
  [/pad 8|sweep/i, "pad_8_sweep"],
  // Synth effects
  [/fx 1|rain/i, "fx_1_rain"],
  [/fx 2|soundtrack/i, "fx_2_soundtrack"],
  [/fx 3|crystal/i, "fx_3_crystal"],
  [/fx 4|atmosphere/i, "fx_4_atmosphere"],
  [/fx 5|brightness/i, "fx_5_brightness"],
  [/fx 6|goblins/i, "fx_6_goblins"],
  [/fx 7|echoes/i, "fx_7_echoes"],
  [/fx 8|sci.fi/i, "fx_8_scifi"],
  // Ethnic
  [/sitar/i, "sitar"],
  [/banjo/i, "banjo"],
  [/shamisen/i, "shamisen"],
  [/koto/i, "koto"],
  [/kalimba/i, "kalimba"],
  [/bagpipe/i, "bagpipe"],
  [/fiddle/i, "fiddle"],
  [/shanai/i, "shanai"],
  // Percussive
  [/tinkle bell/i, "tinkle_bell"],
  [/agogo/i, "agogo"],
  [/steel drum/i, "steel_drums"],
  [/woodblock/i, "woodblock"],
  [/taiko/i, "taiko_drum"],
  [/melodic tom/i, "melodic_tom"],
  [/synth drum/i, "synth_drum"],
  [/reverse cymbal/i, "reverse_cymbal"],
  // Sound effects
  [/guitar fret/i, "guitar_fret_noise"],
  [/breath noise/i, "breath_noise"],
  [/seashore/i, "seashore"],
  [/bird tweet/i, "bird_tweet"],
  [/telephone/i, "telephone_ring"],
  [/helicopter/i, "helicopter"],
  [/applause/i, "applause"],
  [/gunshot/i, "gunshot"],
  // Broad fallbacks — after specific ones
  [/organ/i, "church_organ"],
  [/bass/i, "acoustic_bass"],
  [/guitar/i, "acoustic_guitar_nylon"],
  [/\bsax\b/i, "alto_sax"],
  [/\bpad\b/i, "pad_2_warm"],
  [/\blead\b/i, "lead_2_sawtooth"],
  [/piano/i, "acoustic_grand_piano"],
];

/**
 * Resuelve el archivo de soundfont para un instrumento.
 *
 * Devuelve `null` cuando el nombre no matchea ninguna familia GM conocida:
 * el llamador NO debe asumir piano en ese caso (un "Congas" o un "Claves" no
 * son un piano — esos nombres los cubre el PercussionEngine).
 */
export function instrumentToSoundfont(instrument: string): string | null {
  for (const [rx, sf] of SF_MAP) {
    if (rx.test(instrument)) return sf;
  }
  return null;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

/** Resolved Sampler or in-flight Promise */
type CacheEntry = Tone.Sampler | Promise<Tone.Sampler>;
const _cache = new Map<string, CacheEntry>();
/** Soundfonts que ya fallaron definitivamente (no se reintenta en cada nota). */
const _failed = new Set<string>();
/** Carga en vuelo del acordeón de botones (no vive en `_cache` como promesa). */
let inFlightAccordion: Promise<Tone.Sampler> | null = null;
/** Blob URLs created per soundfont — must be revoked on dispose to free memory */
const _blobUrls = new Map<string, string[]>();

/** Estado de un instrumento para el ruteo de audio. */
export type SamplerStatus = "loaded" | "loading" | "failed" | "unmapped";

function cacheKey(sfName: string): string {
  return `${SOUNDFONT_SET}/${sfName}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a base64 data URI  →  Blob URL.
 * Tone.Sampler handles blob: URLs perfectly; data: URIs are unreliable in v15.
 */
function dataUriToBlobUrl(dataUri: string): string {
  const [header, base64] = dataUri.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "audio/ogg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/**
 * Reduce el mapa de samples a uno cada `maxGap` semitonos (conservando las
 * puntas).
 *
 * Los archivos de gleitz traen los 88 semitonos (A0…C8) *por instrumento*:
 * convertirlos a Blob y decodificarlos cuesta ~40 MB de AudioBuffer y un buen
 * tirón de main thread por instrumento, y en una canción de 6 pistas eso se
 * nota. `Tone.Sampler` ya repitchea la muestra más cercana, así que con un
 * salto de 3 semitonos el error máximo es ±1.5 semitonos — indistinguible — y
 * la carga baja a un tercio.
 */
function thinSampleMap(
  samples: Record<string, string>,
  maxGap = 3,
): Record<string, string> {
  const entries = Object.entries(samples)
    .map(([note, uri]) => {
      let midi = Number.NaN;
      try {
        midi = Tone.Frequency(note).toMidi();
      } catch {
        /* nombre raro: lo descartamos */
      }
      return { note, uri, midi };
    })
    .filter((e) => Number.isFinite(e.midi))
    .sort((a, b) => a.midi - b.midi);

  if (entries.length <= 2) return Object.fromEntries(entries.map((e) => [e.note, e.uri]));

  const kept: typeof entries = [entries[0]];
  for (const entry of entries.slice(1)) {
    if (entry.midi - kept[kept.length - 1].midi >= maxGap) kept.push(entry);
  }
  // La última nota siempre, para no perder el extremo agudo.
  const last = entries[entries.length - 1];
  if (kept[kept.length - 1].note !== last.note) {
    // Reemplazamos la anterior si quedó demasiado cerca del final.
    if (last.midi - kept[kept.length - 1].midi < maxGap / 2) kept.pop();
    kept.push(last);
  }

  return Object.fromEntries(kept.map((e) => [e.note, e.uri]));
}

/**
 * Extract the samples object from a gleitz soundfont file.
 *
 * ⚠️ El archivo es JavaScript, NO JSON:
 *
 *     if (typeof(MIDI) === 'undefined') var MIDI = {};
 *     if (typeof(MIDI.Soundfont) === 'undefined') MIDI.Soundfont = {};
 *     MIDI.Soundfont.harmonica = {
 *       "A0": "data:audio/ogg;base64,T2dnUwAC…",
 *       …
 *     }
 *
 * La versión anterior tomaba `text.indexOf("{")` — el `{` de `var MIDI = {}` —
 * y hacía `JSON.parse("{};…")`. Eso lanzaba
 * "Unexpected non-whitespace character after JSON at position 2", quedaba como
 * warning y **cada instrumento caía al sintetizador**: el reproductor nunca
 * sonó con samples reales, ni siquiera con la URL del CDN bien puesta.
 * Ahora anclamos en la asignación `MIDI.Soundfont.<nombre> = {…}`.
 */
function extractSoundfontJson(text: string): Record<string, string> {
  const anchor = text.lastIndexOf("MIDI.Soundfont");
  const braceAt = anchor === -1 ? text.indexOf("{") : text.indexOf("{", anchor);
  const end = text.lastIndexOf("}");
  const body =
    braceAt !== -1 && end > braceAt ? text.slice(braceAt, end + 1) : text;

  // Ojo: el objeto NO es JSON válido — la última entrada lleva coma colgante
  //    "B7": "data:…",
  //  }
  // así que `JSON.parse` revienta igual. Extraemos los pares nota → data URI
  // a mano: el base64 no tiene comillas ni comas, así que el patrón es exacto.
  const pairs = body.matchAll(/"([A-Ga-g][#b]?-?\d+)"\s*:\s*"(data:[^"]+)"/g);
  const samples: Record<string, string> = {};
  for (const [, note, dataUri] of pairs) samples[note] = dataUri;

  if (Object.keys(samples).length === 0)
    throw new Error(
      `GMSampler: el soundfont no trae samples (empieza con ${JSON.stringify(
        text.slice(0, 80),
      )})`,
    );

  return samples;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Fetch a soundfont file, retrying with backoff across every mirror.
 *
 * GitHub Pages does advertise `Access-Control-Allow-Origin: *`, but these
 * requests are fired while the app is also streaming piano samples and parsing
 * MIDI, and under that load the connection is sometimes reset before the
 * response headers arrive. Chromium then reports it as a CORS failure
 * (`MissingAllowOriginHeader`) even though the URL is fine.
 *
 * Retrying immediately is useless — the second attempt lands in the same load
 * spike — so back off and give the socket a chance to recover. Si el primer
 * espejo sigue fallando pasamos al siguiente (jsDelivr) en vez de degradar el
 * instrumento a síntesis por el resto de la sesión.
 */
async function fetchSoundfontText(
  sfName: string,
  set: string = SOUNDFONT_SET,
): Promise<{ text: string; base: string }> {
  const backoffMs = [400, 1500];
  let lastError: unknown;

  for (const base of CDN_BASES) {
    for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
      const url = `${base}/${set}/${sfName}-ogg.js`;
      try {
        const res = await fetch(url);
        if (!res.ok)
          throw new Error(`GMSampler: fetch failed ${url} (${res.status})`);
        return { text: await res.text(), base };
      } catch (err) {
        lastError = err;
        const wait = backoffMs[attempt];
        if (wait === undefined) break;
        console.warn(
          `[GMSampler] ${sfName}: intento ${attempt + 1} falló en ${base}, reintento en ${wait}ms…`,
          err,
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Baja un soundfont y lo convierte en un `Tone.Sampler` listo para tocar.
 *
 * Exportada porque la página de audición (`/audition.html`) necesita comparar
 * el MISMO instrumento en distintos sets sin tocar el cache del reproductor.
 */
export async function loadSoundfontSampler(
  sfName: string,
  dest: Tone.ToneAudioNode,
  set: string = SOUNDFONT_SET,
): Promise<Tone.Sampler> {
  console.log(`[GMSampler] Fetching ${sfName} (${set})...`);

  const { text, base } = await fetchSoundfontText(sfName, set);
  console.log(`[GMSampler] ${sfName}: servido por ${base}`);

  // Parse the soundfont JS → { "A0": "data:audio/ogg;base64,...", ... }
  const full = extractSoundfontJson(text);
  const rawData = thinSampleMap(full);
  console.log(
    `[GMSampler] ${sfName}: ${Object.keys(rawData).length}/${Object.keys(full).length} samples, converting to Blob URLs...`,
  );

  // ✔ Convert every data URI to a Blob URL — Tone.Sampler works reliably with these
  const blobUrls: Record<string, string> = {};
  const created: string[] = [];
  for (const [note, dataUri] of Object.entries(rawData)) {
    try {
      const blobUrl = dataUriToBlobUrl(dataUri);
      blobUrls[note] = blobUrl;
      created.push(blobUrl);
    } catch (e) {
      console.warn(`[GMSampler] ${sfName}: skip note ${note}`, e);
    }
  }
  _blobUrls.set(`${set}/${sfName}`, created);
  console.log(
    `[GMSampler] ${sfName}: ${created.length} Blob URLs ready, loading into Tone.Sampler...`,
  );

  return new Promise<Tone.Sampler>((resolve, reject) => {
    // Timeout safety: if onload never fires after 30s, reject
    const timeout = setTimeout(() => {
      reject(new Error(`GMSampler: timeout loading ${sfName}`));
    }, 30_000);

    const s = new Tone.Sampler({
      urls: blobUrls,
      onload: () => {
        clearTimeout(timeout);
        console.log(`[GMSampler] ✅ ${sfName} loaded and READY`);
        resolve(s);
      },
      onerror: (err) => {
        clearTimeout(timeout);
        console.error(`[GMSampler] ❌ ${sfName} onerror:`, err);
        reject(err);
      },
    }).connect(dest);
  });
}

const _fetchAndCreate = loadSoundfontSampler;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Clave de caché del acordeón de botones (FreePats). El acordeón vallenato no
 * es un soundfont GM: es una grabación dedicada (ver freePatsAccordion.ts), y
 * para el género es EL instrumento, así que gana sobre el `accordion` de GM.
 */
const BUTTON_ACCORDION_KEY = "freepats:button-accordion";

/**
 * Async — returns a real-instrument Tone.Sampler for the given GM instrument name.
 * Caches per soundfont file; subsequent calls return the cached instance immediately.
 *
 * Rechaza cuando el instrumento no tiene soundfont conocido: el llamador debe
 * rutearlo a otro motor (p. ej. percusión latina) en vez de asumir piano.
 */
export function getGMSampler(
  instrument: string,
  dest: Tone.ToneAudioNode,
): Promise<Tone.Sampler> {
  if (isButtonAccordionInstrument(instrument)) {
    const cached = _cache.get(BUTTON_ACCORDION_KEY);
    if (cached instanceof Tone.Sampler) return Promise.resolve(cached);
    const task = inFlightAccordion
      ? inFlightAccordion
      : loadButtonAccordion(dest)
          .then((s) => {
            _cache.set(BUTTON_ACCORDION_KEY, s);
            inFlightAccordion = null;
            return s;
          })
          .catch((err) => {
            inFlightAccordion = null;
            _failed.add(BUTTON_ACCORDION_KEY);
            console.warn(
              "[GMSampler] acordeón de botones no disponible, se usa el GM:",
              err,
            );
            throw err;
          });
    inFlightAccordion = task;
    return task;
  }

  const sfName = instrumentToSoundfont(instrument);
  if (!sfName) {
    return Promise.reject(
      new Error(`GMSampler: "${instrument}" no tiene soundfont GM asignado`),
    );
  }
  const key = cacheKey(sfName);

  if (_cache.has(key)) {
    const hit = _cache.get(key)!;
    return hit instanceof Tone.Sampler
      ? Promise.resolve(hit)
      : (hit as Promise<Tone.Sampler>);
  }

  const p = _fetchAndCreate(sfName, dest)
    .then((s) => {
      _cache.set(key, s); // replace promise with resolved sampler
      return s;
    })
    .catch((err) => {
      // Remove failed entry so retries are possible, and remember the failure
      // so the router can stop waiting for this instrument mid-song.
      _cache.delete(key);
      _failed.add(key);
      // Degrades gracefully — callers fall back to the synth engine — so this
      // is a warning, not a hard error.
      console.warn(
        `[GMSampler] No se pudo cargar "${sfName}" (se usará el sintetizador):`,
        err,
      );
      throw err;
    });

  _cache.set(key, p);
  return p;
}

/**
 * Sync — returns the Sampler only if already fully loaded, null otherwise.
 * Safe to call inside Tone.Transport.schedule callbacks.
 */
export function getGMSamplerSync(instrument: string): Tone.Sampler | null {
  if (isButtonAccordionInstrument(instrument)) {
    const hit = _cache.get(BUTTON_ACCORDION_KEY);
    return hit instanceof Tone.Sampler ? hit : null;
  }
  const sfName = instrumentToSoundfont(instrument);
  if (!sfName) return null;
  const hit = _cache.get(cacheKey(sfName));
  return hit instanceof Tone.Sampler ? hit : null;
}

/**
 * Estado del soundfont de un instrumento — lo usa el router de audio para
 * decidir entre sample real, motor especializado o sintetizador.
 *
 * `loading` es distinto de `failed`: mientras carga conviene un sintetizador
 * neutro y breve; si falló, el motor especializado (con articulaciones) es
 * mejor que nada.
 */
export function getSamplerStatus(instrument: string): SamplerStatus {
  if (isButtonAccordionInstrument(instrument)) {
    if (_failed.has(BUTTON_ACCORDION_KEY)) return "failed";
    const hit = _cache.get(BUTTON_ACCORDION_KEY);
    return hit instanceof Tone.Sampler ? "loaded" : "loading";
  }
  const sfName = instrumentToSoundfont(instrument);
  if (!sfName) return "unmapped";
  const key = cacheKey(sfName);
  if (_failed.has(key)) return "failed";
  const hit = _cache.get(key);
  if (hit instanceof Tone.Sampler) return "loaded";
  if (hit) return "loading";
  return "loading";
}

/** Dispara la carga en segundo plano sin esperar el resultado. */
export function prefetchGMSampler(
  instrument: string,
  dest: Tone.ToneAudioNode,
): Promise<Tone.Sampler | null> {
  if (!instrumentToSoundfont(instrument) && !isButtonAccordionInstrument(instrument))
    return Promise.resolve(null);
  return getGMSampler(instrument, dest).catch(() => null);
}


/** All currently loaded (resolved) samplers — for releaseAll / dispose. */
export function getLoadedGMSamplers(): Tone.Sampler[] {
  const out: Tone.Sampler[] = [];
  _cache.forEach((v) => {
    if (v instanceof Tone.Sampler) out.push(v);
  });
  return out;
}

/** Dispose all cached samplers, revoke Blob URLs, and clear caches. */
export function disposeAllGMSamplers() {
  _cache.forEach((v) => {
    if (v instanceof Tone.Sampler) v.dispose();
  });
  _cache.clear();
  _failed.clear();
  inFlightAccordion = null;
  _blobUrls.forEach((urls) => urls.forEach((u) => URL.revokeObjectURL(u)));
  _blobUrls.clear();
  console.log("[GMSampler] All samplers disposed");
}
