"""Read raw short MIDI messages from a connected Windows MIDI input, locally.

This probe does not send MIDI, alter device settings, or touch browser storage.
"""

import argparse
import ctypes
import json
import sys
import time
from ctypes import wintypes
from pathlib import Path


if sys.platform != "win32":
    raise SystemExit("Este diagnóstico requiere Windows")

winmm = ctypes.WinDLL("winmm")


class MidiInCaps(ctypes.Structure):
    _fields_ = [
        ("manufacturer", wintypes.WORD),
        ("product", wintypes.WORD),
        ("driver_version", wintypes.DWORD),
        ("name", wintypes.WCHAR * 32),
        ("support", wintypes.DWORD),
    ]


winmm.midiInGetNumDevs.restype = wintypes.UINT
winmm.midiInGetDevCapsW.argtypes = [ctypes.c_size_t, ctypes.POINTER(MidiInCaps), wintypes.UINT]
winmm.midiInGetDevCapsW.restype = wintypes.UINT
winmm.midiInOpen.argtypes = [ctypes.POINTER(ctypes.c_void_p), wintypes.UINT, ctypes.c_void_p, ctypes.c_size_t, wintypes.DWORD]
winmm.midiInOpen.restype = wintypes.UINT
winmm.midiInStart.argtypes = [ctypes.c_void_p]
winmm.midiInStart.restype = wintypes.UINT
winmm.midiInStop.argtypes = [ctypes.c_void_p]
winmm.midiInStop.restype = wintypes.UINT
winmm.midiInReset.argtypes = [ctypes.c_void_p]
winmm.midiInReset.restype = wintypes.UINT
winmm.midiInClose.argtypes = [ctypes.c_void_p]
winmm.midiInClose.restype = wintypes.UINT

MIM_DATA = 0x3C3
CALLBACK_FUNCTION = 0x00030000
MidiCallback = ctypes.WINFUNCTYPE(None, ctypes.c_void_p, wintypes.UINT,
                                 ctypes.c_size_t, ctypes.c_size_t, ctypes.c_size_t)


def devices():
    rows = []
    for index in range(winmm.midiInGetNumDevs()):
        caps = MidiInCaps()
        result = winmm.midiInGetDevCapsW(index, ctypes.byref(caps), ctypes.sizeof(caps))
        if result == 0:
            rows.append({"index": index, "name": caps.name, "manufacturer": caps.manufacturer,
                         "product": caps.product})
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture", type=int, default=0, help="seconds to capture; 0 only lists inputs")
    parser.add_argument("--device", type=int, help="WinMM index, otherwise first SMK-37 input")
    parser.add_argument("--output", type=Path, help="local JSONL path for captured events")
    args = parser.parse_args()
    rows = devices()
    print(json.dumps({"midiInputs": rows}, ensure_ascii=False), flush=True)
    if args.capture <= 0:
        return
    if args.capture > 180:
        raise SystemExit("Límite de captura: 180 segundos")
    selected = next((row for row in rows if row["index"] == args.device), None) if args.device is not None else next(
        (row for row in rows if row["name"].startswith("SMK-37 Elite Midi")), None)
    if selected is None:
        raise SystemExit("No se encontró la entrada MIDI elegida")
    output = args.output or Path(".logs/smk37-physical-midi.jsonl")
    output.parent.mkdir(parents=True, exist_ok=True)
    received = []

    def on_midi(_handle, message, _instance, packed, timestamp_ms):
        if message != MIM_DATA:
            return
        status = packed & 0xFF
        data1 = (packed >> 8) & 0xFF
        data2 = (packed >> 16) & 0xFF
        received.append({"timestampMs": timestamp_ms, "bytes": [status, data1, data2],
                         "channel": status & 0x0F, "kind": status & 0xF0})

    callback = MidiCallback(on_midi)
    handle = ctypes.c_void_p()
    result = winmm.midiInOpen(ctypes.byref(handle), selected["index"],
                              ctypes.cast(callback, ctypes.c_void_p), 0, CALLBACK_FUNCTION)
    if result != 0:
        raise SystemExit(f"midiInOpen falló: MMRESULT {result}")
    try:
        result = winmm.midiInStart(handle)
        if result != 0:
            raise SystemExit(f"midiInStart falló: MMRESULT {result}")
        print(json.dumps({"capturing": selected, "seconds": args.capture, "output": str(output)},
                         ensure_ascii=False), flush=True)
        time.sleep(args.capture)
        winmm.midiInStop(handle)
        winmm.midiInReset(handle)
    finally:
        winmm.midiInClose(handle)

    with output.open("w", encoding="utf-8") as stream:
        for event in received:
            stream.write(json.dumps(event, separators=(",", ":")) + "\n")
    note_on = [event for event in received if event["kind"] == 0x90 and event["bytes"][2] > 0]
    note_off = [event for event in received if event["kind"] == 0x80 or
                event["kind"] == 0x90 and event["bytes"][2] == 0]
    print(json.dumps({"events": len(received), "noteOn": len(note_on), "noteOff": len(note_off),
                      "channels": sorted({event["channel"] for event in received}),
                      "controls": sorted({event["bytes"][1] for event in received if event["kind"] == 0xB0}),
                      "output": str(output)}), flush=True)


if __name__ == "__main__":
    main()
