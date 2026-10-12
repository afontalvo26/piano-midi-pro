"""
analyze-audio-glitches.py — reports the audio-scheduling headroom measured by
`tests/e2e/verify-audio-glitches.spec.ts`, and compares two captures.

The measurement is the *lead* of every note-scheduling callback:

    lead = (the audio time the note was scheduled for) − (the audio clock when
            the callback actually ran)

`lead > 0` — the note was handed to Web Audio before it had to be rendered.
`lead <= 0` — it was scheduled in the past. Web Audio clamps it to "now", so it
lands on top of whatever is already sounding: that collision is the click, and a
run of them is the crackle heard on monitors.

Usage
-----
    python scripts/analyze-audio-glitches.py                 # report both
    python scripts/analyze-audio-glitches.py after           # report one

Inputs are `test-results/audio/summary-<label>.json`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "test-results" / "audio"


def load(label: str) -> dict | None:
    path = AUDIO_DIR / f"summary-{label}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def verdict(past_due_pct: float | None) -> str:
    if past_due_pct is None:
        return "sin datos"
    if past_due_pct >= 50:
        return "ROTO — la mayoría de las notas se programan tarde"
    if past_due_pct >= 10:
        return "FRÁGIL — crujidos frecuentes bajo carga"
    if past_due_pct >= 3:
        return "ACEPTABLE — crujidos raros"
    return "SANO"


def report(label: str, data: dict, stream) -> None:
    steady = data.get("steady", {})
    startup = data.get("startup", {})
    pct = steady.get("leadMsPercentiles", {}) or {}
    spct = startup.get("leadMsPercentiles", {}) or {}

    print(f"\n=== {label.upper()} ===", file=stream)
    print(f"  ventana de scheduling       : {data.get('windowOverrideMs') if data.get('windowOverrideMs') is not None else '60 ms (por defecto)'}", file=stream)
    print(f"  callbacks observados        : {data.get('callbacks')}", file=stream)
    print(f"  ARRANQUE DE CANCIÓN (primeros 0.5 s)", file=stream)
    print(f"    callbacks                 : {startup.get('callbacks')}", file=stream)
    print(f"    programadas en el pasado  : {startup.get('pastDue')} ({startup.get('pastDuePct')}%)", file=stream)
    print(f"    margen min / p50 / max    : {spct.get('min')} / {spct.get('p50')} / {spct.get('max')} ms", file=stream)
    print(f"  RÉGIMEN ESTABLE (resto de la canción)", file=stream)
    print(f"    callbacks                 : {steady.get('callbacks')}", file=stream)
    print(f"    programadas en el pasado  : {steady.get('pastDue')} ({steady.get('pastDuePct')}%)", file=stream)
    print(f"    margen min / p50 / p90    : {pct.get('min')} / {pct.get('p50')} / {pct.get('p90')} ms", file=stream)
    print(f"  NOTAS (buffer sources)", file=stream)
    print(f"    iniciadas en el pasado    : {data.get('notesStartedPastDue')} de {data.get('notesStarted')} ({data.get('notesStartedPastDuePct')}%)", file=stream)
    print(f"    peor retraso              : {data.get('worstNotePastDueMs')} ms", file=stream)
    print(f"  DIAGNÓSTICO                 : {verdict(steady.get('pastDuePct'))}", file=stream)


def main() -> int:
    # The measurements are printed to a Windows console, whose default codec
    # cannot represent the arrows and accents used below.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    wanted = sys.argv[1:] or ["before", "after"]

    reports = {label: load(label) for label in wanted}
    missing = [label for label, data in reports.items() if data is None]
    if missing:
        print(
            f"faltan capturas: {', '.join(missing)} — corré "
            f"`npx playwright test verify-audio-glitches` (con AUDIT_MODE=before "
            f"para el caso previo)",
            file=sys.stderr,
        )

    for label, data in reports.items():
        if data is not None:
            report(label, data, sys.stdout)

    before, after = reports.get("before"), reports.get("after")
    if before and after:
        b = (before.get("steady") or {}).get("pastDuePct")
        a = (after.get("steady") or {}).get("pastDuePct")
        bp = ((before.get("steady") or {}).get("leadMsPercentiles") or {}).get("p50")
        ap = ((after.get("steady") or {}).get("leadMsPercentiles") or {}).get("p50")

        print("\n=== COMPARACIÓN ===")
        if b is not None and a is not None:
            print(f"  notas programadas en el pasado : {b}%  →  {a}%")
            if a > 0:
                print(f"  reducción                      : {round((1 - a / b) * 100, 1)}%")
        if bp is not None and ap is not None:
            print(f"  margen mediano (p50)           : {bp} ms  →  {ap} ms")

        out = AUDIO_DIR / "comparison.json"
        out.write_text(
            json.dumps({"before": before, "after": after}, indent=2, ensure_ascii=False)
        )
        print(f"\n  detalle: {out.relative_to(ROOT)}")

    return 0 if not missing else 2


if __name__ == "__main__":
    raise SystemExit(main())
