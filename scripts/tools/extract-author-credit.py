#!/usr/bin/env python3
"""Extrae el mensaje que el autor dejó dentro de cada MIDI de `app/public/demo`.

QUÉ BUSCA
---------
Los autores de MIDI y karaoke firman dentro del archivo con meta-eventos:

    0x01 Text       — su saludo, su dedicatoria, "Secuencia de X"
    0x02 Copyright  — "(C)1991 Roland Corporation", "© 1999 by Alfredo Solines"
    0x03 Track name — a veces ahí va la firma partida en trozos

La letra también viaja en eventos `Text` en muchos `.kar`, así que hay que
separarla: una línea cantada no es un mensaje del autor.

CÓMO SE DECIDE
--------------
 1. Se descartan los eventos que son ruido de herramienta (`@KMIDI`, `AMC-`,
    `Dispositivo GM`, `DEVICE=`, marcas de agua).
 2. Se descarta la letra: un payload que aparece en la pista con más eventos de
    texto, o que son sílabas cortas encadenadas, no es un mensaje.
 3. Del resto se prefiere, en este orden: un saludo/dedicatoria explícito, un
    crédito con nombre ("Secuencia de…", "por…", "by…", "Syncro by…"), y recién
    después el aviso de copyright, que suele nombrar a un sello y no a la
    persona que armó el archivo.

El texto NO se reescribe: se muestra como lo escribió su autor. Lo único que se
repara son bytes que la herramienta de autor corrompió al guardar (por ejemplo
0x9C donde iba "ú", que en CP1252 sale "œ").
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

TEXT_META = {0x01: "text", 0x02: "copyright", 0x03: "track_name", 0x05: "lyric"}

# Ruido de herramienta: no lo escribió una persona.
TOOL = re.compile(
    r"""^(
        @                                   # @KMIDI, @T..., @I..., @L...
      | amc\s*-
      | gs\s*reset
      | gm\s*$ | xg\s*$ | midi\s*$
      | device\s*=
      | mmopt\s*:
      | dispositivo\s+gm
      | gm\s+device
      | all\s+channels
      | soft\s+karaoke
      | kmidi
      | words\s*$
      | untitled\s*$
      | \d+\.\s*\w                        # "36.Fretless Bass"
      | [/\\=*_.\-]{4,}\s*$
      | karmaker
      | created\s+with
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# Marcas de agua que algunos autores estampan; no son un mensaje.
WATERMARK = re.compile(r"(karaokegratis|karkaman|lardj|midiclub\.com)", re.IGNORECASE)

# Un saludo o una dedicatoria: lo que el autor dijo para quien lo escuche.
GREETING = re.compile(
    r"""(
        \b(?:saludo|saludos|hola|bienvenid[oa]s?|gracias|agradec)\b
      | \bdedicad[oa]s?\b | \bdedico\b
      | \b(?:homenaje|abrazo)\b
      | \bpara\s+(?:los|las|mis|todos|quien|ti\b)
      | \bamig[oa]s?\b | \bkaraokel\w+
      | \b(?:disfruta|disfruten|espero\s+que|ojal[áa]|que\s+dios)\b
      | \b(?:joya|recuerdo|cl[áa]sico)\b
      | \b(?:tema\s+aportado|aporte)\b
      | \bpresenta\b
      | \b(?:reservados|prohibida?|no\s+duplicar|advertencia)
      | \b(?:pide|pedido|petici[oó]n|sugerencia|escr[ií]beme|env[ií]ame)
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# Un crédito con nombre: quién hizo el archivo.
CREDIT = re.compile(
    r"""(
        \b(?:secuencia|secuenciad[oa]|sincronizad[oa]|sincronizaci[oó]n|arreglad[oa]s?
           |arreglos?|editad[oa]|convertido|realizad[oa]|hecho|midi|mid|kar
           |karaoke|rmx|remix|orq|autor|letra|synchro|synchronized|by)\b
        [^a-z0-9]{0,12}
        \b(?:por|by|de|:)\b
    )""",
    re.IGNORECASE | re.VERBOSE,
)

URL = re.compile(r"(https?://|www\.)", re.IGNORECASE)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")

# Correcciones de bytes que la herramienta de autor destrozó al guardar. Son
# sustituciones inequívocas *dentro de una palabra*; nada más se toca.
REPAIRS = (
    ("\u0153", "\u00fa"),  # œ -> ú   ("Mœsica" -> "Música")
    ("\u0152", "\u00da"),
    ("\u00ab ", "\u00a9 "),  # « -> ©  ("Copyright « 2004")
    ("\u2039", "\u00ed"),
    ("\u203a", "\u00f3"),
    ("\u0161", "\u00f1"),
)


def decode(payload: bytes) -> str:
    text = payload.decode("cp1252", errors="replace")
    for wrong, right in REPAIRS:
        text = text.replace(wrong, right)
    return text


def read_var_len(raw: bytes, pos: int, limit: int) -> tuple[int, int]:
    value = 0
    for _ in range(4):
        if pos >= limit:
            break
        byte = raw[pos]
        pos += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            break
    return value, pos


def walk(raw: bytes, start: int, end: int) -> list[dict]:
    """Meta-eventos de texto de un chunk, en orden."""
    events: list[dict] = []
    pos, tick, running = start, 0, 0
    while pos < end:
        delta, pos = read_var_len(raw, pos, end)
        tick += delta
        if pos >= end:
            break
        status = raw[pos]
        if status & 0x80:
            pos += 1
            running = status
        else:
            status = running
            if running == 0:
                break
        if status == 0xFF:
            if pos >= end:
                break
            meta_type = raw[pos]
            pos += 1
            length, pos = read_var_len(raw, pos, end)
            if pos + length > end:
                break
            payload = raw[pos : pos + length]
            pos += length
            if meta_type in TEXT_META:
                events.append(
                    {"tick": tick, "meta": TEXT_META[meta_type], "raw": decode(payload)}
                )
            if meta_type == 0x2F:
                break
        elif status in (0xF0, 0xF7):
            length, pos = read_var_len(raw, pos, end)
            pos += length
        elif (status & 0xF0) in range(0x80, 0xF0):
            step = 1 if (status & 0xF0) in (0xC0, 0xD0) else 2
            if pos + step > end:
                break
            pos += step
        else:
            break
    return events


def normalise(text: str) -> str:
    """Códigos de salto del karaoke -> saltos reales, sin tocar las palabras."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\\", "\n")
    text = re.sub(r"(^|\s)/", r"\1\n", text)
    return text.strip()


def is_printable(text: str) -> bool:
    if not text or any(ord(c) < 32 and c not in "\t\n" for c in text):
        return False
    return text.count("\ufffd") <= 2


def is_junk(text: str) -> bool:
    stripped = re.sub(r"[\s.·•\-_=~^]", "", text)
    if not stripped:
        return True
    return len(stripped) / max(len(text), 1) < 0.4


def lyric_fragments(tracks: list[list[dict]]) -> set[str]:
    """Lo que el archivo declara como LETRA, normalizado.

    Sólo cuenta la pista de letra (meta 0x05) y los eventos `Text` que aparecen
    en la MISMA pista que ella: ahí es donde los `.kar` escriben la letra con
    `Text` en vez de `Lyric`. Un `Text` en la pista de metadatos es un mensaje
    del autor, no una sílaba cantada, y compararlo contra sí mismo borraría
    justamente lo que hay que mostrar.
    """
    out: set[str] = set()
    for events in tracks:
        has_lyric_track = any(e["meta"] == "lyric" for e in events)
        if not has_lyric_track:
            continue
        for event in events:
            if event["meta"] not in ("lyric", "text"):
                continue
            flat = re.sub(r"[^0-9a-záéíóúñü]", "", event["raw"].lower())
            if len(flat) >= 3:
                out.add(flat)
    return out


def pick(tracks: list[list[dict]]) -> dict | None:
    """El mensaje del autor, si el archivo trae uno."""
    sung = lyric_fragments(tracks)
    candidates: list[dict] = []

    for events in tracks:
        for event in events:
            text = normalise(event["raw"])
            if not is_printable(text) or is_junk(text):
                continue
            if TOOL.match(text) or WATERMARK.search(text):
                continue
            flat = re.sub(r"[^0-9a-záéíóúñü]", "", text.lower())
            # Es letra, no un mensaje del autor.
            if flat and flat in sung:
                continue
            # Una sílaba suelta tampoco.
            if len(flat) < 4 and "@" not in text:
                continue

            kind = (
                "greeting"
                if GREETING.search(text)
                else "credit"
                if CREDIT.search(text) or EMAIL.search(text) or URL.search(text)
                else "copyright"
                if event["meta"] == "copyright"
                else "other"
            )
            candidates.append(
                {"meta": event["meta"], "kind": kind, "text": text, "tick": event["tick"]}
            )

    if not candidates:
        return None

    # Preferencia: lo que el autor dijo > quién es > el aviso legal.
    rank = {"greeting": 0, "credit": 1, "copyright": 2, "other": 3}
    best = min(candidates, key=lambda c: (rank[c["kind"]], c["tick"]))
    chosen = [c for c in candidates if c["kind"] == best["kind"]]

    # Varias líneas del mismo rango de prioridad se muestran juntas: los autores
    # parten su firma en pedazos ("Synchro by" / "Gerardo Marquina").
    lines: list[str] = []
    for candidate in sorted(chosen, key=lambda c: c["tick"]):
        for piece in candidate["text"].split("\n"):
            piece = piece.strip()
            if piece and piece not in lines:
                lines.append(piece)

    return {"kind": best["kind"], "lines": lines[:4]}


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("app/public/demo")
    destination = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".logs/author-credits.json")

    files = sorted(
        p for p in root.rglob("*") if p.suffix.lower() in (".mid", ".kar", ".midi")
    )

    out: dict[str, dict] = {}
    for path in files:
        raw = path.read_bytes()
        if len(raw) < 14 or raw[0:4] != b"MThd":
            continue
        n_tracks = int.from_bytes(raw[10:12], "big")

        # Los límites de chunk se localizan por firma: hay archivos que declaran
        # un largo que se come el encabezado siguiente.
        offsets: list[int] = []
        index = raw.find(b"MTrk")
        while index != -1:
            offsets.append(index)
            index = raw.find(b"MTrk", index + 1)

        tracks: list[list[dict]] = []
        for i, offset in enumerate(offsets):
            declared = int.from_bytes(raw[offset + 4 : offset + 8], "big")
            declared_end = offset + 8 + declared
            next_offset = offsets[i + 1] if i + 1 < len(offsets) else len(raw)
            tracks.append(
                walk(raw, offset + 8, min(declared_end, next_offset, len(raw)))
            )
        if not tracks:
            continue

        picked = pick(tracks)
        if picked:
            out[path.name] = picked

    destination.write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    counts: dict[str, int] = {}
    for credit in out.values():
        counts[credit["kind"]] = counts.get(credit["kind"], 0) + 1
    print(f"archivos leídos : {len(files)}")
    print(f"con firma       : {len(out)}")
    print(f"por tipo        : {counts}")
    print()
    for name, credit in sorted(out.items(), key=lambda kv: kv[1]["kind"]):
        print(f"[{credit['kind']:9}] {name}")
        for line in credit["lines"]:
            print(f"      {line!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
