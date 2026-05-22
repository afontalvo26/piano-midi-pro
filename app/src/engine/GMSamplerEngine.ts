/**
 * GMSamplerEngine — Real instrument samples for all 128 GM instruments.
 * Source: gleitz/midi.js-soundfonts (MusyngKite) — actual recordings, OGG high quality.
 * Caches loaded Tone.Samplers to avoid re-fetching on repeated use.
 */

import * as Tone from "tone";

const CDN = "https://gleitz.github.io/midi.js-soundfonts/MusyngKite";

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

export function instrumentToSoundfont(instrument: string): string {
  for (const [rx, sf] of SF_MAP) {
    if (rx.test(instrument)) return sf;
  }
  return "acoustic_grand_piano";
}

// ─── Cache ────────────────────────────────────────────────────────────────────

/** Resolved Sampler or in-flight Promise */
type CacheEntry = Tone.Sampler | Promise<Tone.Sampler>;
const _cache = new Map<string, CacheEntry>();
/** Blob URLs created per soundfont — must be revoked on dispose to free memory */
const _blobUrls = new Map<string, string[]>();

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
 * Robustly extract the JSON object from a gleitz soundfont JS file.
 * Format: MIDI.Soundfont.name = { "A0": "data:audio/ogg;base64,...", ... };
 */
function extractSoundfontJson(text: string): Record<string, string> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start)
    throw new Error("GMSampler: no JSON object found in soundfont");
  return JSON.parse(text.slice(start, end + 1));
}

// ─── Loader ───────────────────────────────────────────────────────────────────

async function _fetchAndCreate(
  sfName: string,
  dest: Tone.ToneAudioNode,
): Promise<Tone.Sampler> {
  const url = `${CDN}/${sfName}-ogg.js`;
  console.log(`[GMSampler] Fetching ${sfName}...`);

  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`GMSampler: fetch failed ${url} (${res.status})`);
  const text = await res.text();

  // Parse the soundfont JS → { "A0": "data:audio/ogg;base64,...", ... }
  const rawData = extractSoundfontJson(text);
  const noteCount = Object.keys(rawData).length;
  console.log(
    `[GMSampler] ${sfName}: ${noteCount} samples, converting to Blob URLs...`,
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
  _blobUrls.set(sfName, created);
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Async — returns a real-instrument Tone.Sampler for the given GM instrument name.
 * Caches per soundfont file; subsequent calls return the cached instance immediately.
 */
export function getGMSampler(
  instrument: string,
  dest: Tone.ToneAudioNode,
): Promise<Tone.Sampler> {
  const sfName = instrumentToSoundfont(instrument);

  if (_cache.has(sfName)) {
    const hit = _cache.get(sfName)!;
    return hit instanceof Tone.Sampler
      ? Promise.resolve(hit)
      : (hit as Promise<Tone.Sampler>);
  }

  const p = _fetchAndCreate(sfName, dest)
    .then((s) => {
      _cache.set(sfName, s); // replace promise with resolved sampler
      return s;
    })
    .catch((err) => {
      // Remove failed entry so retries are possible
      _cache.delete(sfName);
      console.error(`[GMSampler] Failed to load "${sfName}":`, err);
      throw err;
    });

  _cache.set(sfName, p);
  return p;
}

/**
 * Sync — returns the Sampler only if already fully loaded, null otherwise.
 * Safe to call inside Tone.Transport.schedule callbacks.
 */
export function getGMSamplerSync(instrument: string): Tone.Sampler | null {
  const sfName = instrumentToSoundfont(instrument);
  const hit = _cache.get(sfName);
  return hit instanceof Tone.Sampler ? hit : null;
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
  _blobUrls.forEach((urls) => urls.forEach((u) => URL.revokeObjectURL(u)));
  _blobUrls.clear();
  console.log("[GMSampler] All samplers disposed");
}
