/**
 * Karaoke lyric extraction for Standard MIDI Files.
 *
 * Why this exists instead of using `@tonejs/midi`'s `header.meta`:
 * that library only looks at **track 0** (`midiData.tracks[0]`) for text meta
 * events. In real .kar files the lyrics almost always live on another track —
 * measured across this project's demo library, only 4 of the 19 files that
 * carry lyrics have them on track 0; the rest are on tracks 1, 2, 4, 8, 10
 * and 12. So we walk every track ourselves.
 *
 * Two other things this handles that the library does not:
 *  - Lyric text is Latin-1/CP1252, not UTF-8. Decoding as UTF-8 turns
 *    "BARRANQUILLA" into "BARRANQUI�LLA" and "más" into "m�s".
 *  - Karaoke files use `\` and `/` as line-break control codes, so syllables
 *    have to be assembled into lines rather than rendered one by one.
 *
 * Timings are returned in **seconds in the song's own time domain** — the same
 * domain as `SongNote.time`. That is what makes the lyrics stay locked to the
 * music: the transport converts both with the identical formula, so changing
 * BPM or playback rate scales lyrics and notes together and they cannot drift.
 */

export type LyricLine = {
  /** Seconds, same domain as SongNote.time. */
  time: number;
  /** Display text for the whole line. */
  text: string;
};

/** Meta event types we treat as lyric carriers. */
const META_TEXT = 0x01; // Text
const META_LYRIC = 0x05; // Lyric
const META_TRACK_NAME = 0x03;
const META_END_OF_TRACK = 0x2f;

/** A track needs at least this many text events to be considered lyrics. */
const MIN_LYRIC_EVENTS = 12;

/** Text decoding: MIDI lyric data is CP1252/Latin-1, never UTF-8. */
const decoder = new TextDecoder("windows-1252");

type RawEvent = { tick: number; text: string; isLyric: boolean };

/**
 * Walk every track of an SMF and return, per track, its text/lyric meta events
 * with absolute tick positions.
 */
function collectTextEvents(buffer: ArrayBuffer): RawEvent[][] {
  const buf = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const perTrack: RawEvent[][] = [];

  if (buf.length < 14) return perTrack;
  // "MThd"
  if (!(buf[0] === 0x4d && buf[1] === 0x54 && buf[2] === 0x68 && buf[3] === 0x64))
    return perTrack;

  const nTracks = view.getUint16(10);
  let pos = 14;

  const readVarLen = (): number => {
    let value = 0;
    for (let i = 0; i < 4 && pos < buf.length; i++) {
      const b = buf[pos++];
      value = (value << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return value;
  };

  for (let t = 0; t < nTracks && pos + 8 <= buf.length; t++) {
    // "MTrk"
    if (!(buf[pos] === 0x4d && buf[pos + 1] === 0x54 && buf[pos + 2] === 0x72 && buf[pos + 3] === 0x6b))
      break;
    const len = view.getUint32(pos + 4);
    const end = Math.min(pos + 8 + len, buf.length);
    pos += 8;

    const events: RawEvent[] = [];
    let tick = 0;
    let runningStatus = 0;

    while (pos < end) {
      tick += readVarLen();
      if (pos >= end) break;

      let status = buf[pos];
      if (status & 0x80) {
        pos++;
        runningStatus = status;
      } else {
        // Running status: reuse the previous status byte
        status = runningStatus;
      }

      if (status === 0xff) {
        const type = buf[pos++];
        const dataLen = readVarLen();
        const start = pos;
        pos += dataLen;

        if (type === META_LYRIC || type === META_TEXT) {
          events.push({
            tick,
            text: decoder.decode(buf.subarray(start, start + dataLen)),
            isLyric: type === META_LYRIC,
          });
        } else if (type === META_TRACK_NAME) {
          // Keep track names out of the way; they are not lyrics.
        }
        if (type === META_END_OF_TRACK) break;
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx — skip payload
        pos += readVarLen();
      } else {
        const hi = status & 0xf0;
        pos += hi === 0xc0 || hi === 0xd0 ? 1 : 2;
      }
    }
    pos = end;
    perTrack.push(events);
  }

  return perTrack;
}

/** Metadata noise that ships inside karaoke files but is not a lyric. */
const NOT_LYRICS = [
  /^@/i, // @KMIDI KARAOKE FILE, @T..., @I...
  /^creator\s*:/i,
  /^remarks?\s*:/i,
  /^\(c\)/i,
  /^copyright/i,
  /^https?:/i,
  /^www\./i,
  /^amc[\s-]/i,
  /^karmaker/i,
  /^midiclub/i,
  /^kar\s?maker/i,
  /^\*{2,}/, // ***Sirena Encantada***
  // Watermarks left by karaoke authoring tools. These often arrive mangled
  // ("...u..f..rwww.karaokegratis.com.ar"), so match on the payload, not the
  // start of the string.
  /karaokegratis/i,
  /karkaman/i,
  /lardj/i,
  /\.com(\.\w{2})?\s*$/i,
  /^[\s.·•\-_=]*$/,
];

/**
 * A line that is mostly dots/control characters is a watermark, not a lyric.
 */
function looksLikeJunk(text: string): boolean {
  const stripped = text.replace(/[\s.·•\-_=]/g, "");
  if (stripped.length === 0) return true;
  // e.g. ".u..f..rwww..." — very few real characters spread over a long string
  return stripped.length / text.length < 0.35;
}

function isNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (NOT_LYRICS.some((rx) => rx.test(t))) return true;
  return looksLikeJunk(t);
}

/**
 * Normalise karaoke line-break control codes into real newlines.
 *
 * Convention: `\` is always a line break. `/` is a line break when it starts a
 * piece or follows whitespace — that covers both "/que es" and
 * "KARkaman /LARDJ" while leaving legitimate slashes like "y/o" intact.
 */
function normaliseBreaks(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\n")
    .replace(/(^|\s)\//g, "$1\n");
}

/** A single timed syllable/text chunk, before it is grouped into a line. */
type Piece = { time: number; text: string; breakBefore: boolean };

/** Max characters per line when we have to synthesise the breaks ourselves. */
const WRAP_CHARS = 42;

/** Below this many lines we assume the file has no usable break markers. */
const MIN_AUTHORED_LINES = 4;

/**
 * Flatten events into timed pieces, preserving which ones start a new line.
 */
function toPieces(events: RawEvent[], ticksToSeconds: (t: number) => number): Piece[] {
  const pieces: Piece[] = [];
  for (const ev of events) {
    const time = ticksToSeconds(ev.tick);
    const segments = normaliseBreaks(ev.text).split("\n");
    segments.forEach((text, idx) => {
      const breakBefore = idx > 0 || pieces.length === 0;
      if (!text) {
        // An empty segment still marks a pending break for the next piece
        if (pieces.length) pieces[pieces.length - 1].text += "";
        return;
      }
      pieces.push({ time, text, breakBefore });
    });
  }
  return pieces;
}

/** Group pieces where the authoring tool marked a break. */
function groupByBreaks(pieces: Piece[]): LyricLine[] {
  const lines: LyricLine[] = [];
  let current: { time: number; parts: string[] } | null = null;

  for (const p of pieces) {
    if (p.breakBefore && current) {
      pushLine(lines, current);
      current = null;
    }
    if (!current) current = { time: p.time, parts: [] };
    current.parts.push(p.text);
  }
  if (current) pushLine(lines, current);
  return lines;
}

/**
 * Fallback for karaoke files that carry per-syllable timing but no break
 * markers at all (measured: Bolero_-_Quien_Sera.kar has 208 timed events and
 * only 3 break characters). Wrapping greedily at word boundaries keeps the
 * sync perfectly accurate — every line is stamped with the time of the
 * syllable that starts it — while still being readable.
 */
function wrapByWidth(pieces: Piece[]): LyricLine[] {
  const lines: LyricLine[] = [];
  let current: { time: number; parts: string[] } | null = null;
  let length = 0;

  for (const p of pieces) {
    const text = p.text.replace(/\s+/g, " ");
    const isBlank = text.trim().length === 0;
    if (isBlank && !current) continue;

    const wouldBe = length + text.length;
    if (current && wouldBe > WRAP_CHARS) {
      pushLine(lines, current);
      current = null;
      length = 0;
    }
    if (!current) current = { time: p.time, parts: [] };
    current.parts.push(text);
    length += text.length;
  }
  if (current) pushLine(lines, current);
  return lines;
}

function pushLine(
  out: LyricLine[],
  line: { time: number; parts: string[] },
): void {
  const text = line.parts.join("").replace(/\s+/g, " ").trim();
  if (text) out.push({ time: line.time, text });
}

/**
 * Turn a flat list of syllable events into display lines.
 *
 * Everything that is not a break is a continuation of the current line —
 * karaoke authoring tools split syllables arbitrarily ("cor" + "da" + "te ").
 */
function buildLines(events: RawEvent[], ticksToSeconds: (t: number) => number): LyricLine[] {
  const pieces = toPieces(events, ticksToSeconds);
  let lines = groupByBreaks(pieces);

  // A file that collapsed into a couple of enormous lines has no real break
  // markers — synthesise them so the lyrics are still usable and still synced.
  if (lines.length < MIN_AUTHORED_LINES && pieces.length >= MIN_LYRIC_EVENTS) {
    const wrapped = wrapByWidth(pieces);
    if (wrapped.length > lines.length) lines = wrapped;
  }

  // Drop lines that are pure metadata (usually a header block at the start)
  const cleaned = lines.filter((l) => !isNoise(l.text));

  // De-duplicate identical lines landing on the same timestamp
  const out: LyricLine[] = [];
  for (const l of cleaned) {
    const prev = out[out.length - 1];
    if (prev && prev.time === l.time && prev.text === l.text) continue;
    out.push(l);
  }
  return out;
}

/**
 * Extract synchronised lyrics from a Standard MIDI File.
 *
 * Returns `[]` when the file carries no usable lyric track (most plain .mid
 * files — e.g. classical piano pieces — have none).
 *
 * @param buffer        Raw MIDI bytes.
 * @param ticksToSeconds Tempo-map aware converter. Pass
 *                      `midi.header.ticksToSeconds.bind(midi.header)` so lyric
 *                      times are computed exactly like `Note.time` and the two
 *                      can never disagree.
 */
export function extractLyrics(
  buffer: ArrayBuffer,
  ticksToSeconds: (ticks: number) => number,
): LyricLine[] {
  let perTrack: RawEvent[][];
  try {
    perTrack = collectTextEvents(buffer);
  } catch {
    return [];
  }

  // The lyric track is the one with the most text events. This is far more
  // robust than filtering events: files often carry a handful of metadata
  // text events on track 0 while the real lyrics sit on track 10+.
  let best: RawEvent[] = [];
  for (const events of perTrack) {
    if (events.length > best.length) best = events;
  }
  if (best.length < MIN_LYRIC_EVENTS) return [];

  try {
    return buildLines(best, ticksToSeconds);
  } catch {
    return [];
  }
}
