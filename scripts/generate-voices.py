#!/usr/bin/env python3
"""Render local VOICEVOX clips. No network, credentials, or hosted synthesis.

Install voicevox-core==0.17.0 and imageio-ffmpeg==0.6.0 in a separate Python
environment, then supply the official core runtime/dictionary/model directory.
The model files stay outside this site; only generated MP3 files are published.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import wave

import imageio_ffmpeg
from voicevox_core import AccentPhrase
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = "こんにちは。今日も少しずつ、日本語を練習しましょう。"
VOICES = [
    {"id": "metan", "label": "柔和女声", "credit": "VOICEVOX:四国めたん", "style": 2},
    {"id": "tsumugi", "label": "清晰女声", "credit": "VOICEVOX:春日部つむぎ", "style": 8},
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--input", type=Path, default=ROOT / "data/sample-words.json", help="Word JSON file; keep personal inputs outside version control")
    parser.add_argument("--output", type=Path, default=ROOT / "public/audio", help="Audio output directory")
    parser.add_argument("--manifest", type=Path, default=ROOT / "data/voices.json", help="Output manifest path")
    parser.add_argument("--keep-existing", action="store_true", help="Keep previous manifest clips for local session history")
    args = parser.parse_args()
    runtime = args.runtime.resolve()
    libraries = list((runtime / "onnxruntime/lib").glob("*voicevox_onnxruntime*"))
    library = next((p for p in libraries if p.suffix in (".dylib", ".dll", ".so")), None)
    if not library:
        library = next((p for p in libraries if ".so." in p.name), None)
    if not library:
        raise SystemExit("VOICEVOX ONNX Runtime library not found")
    dictionaries = list((runtime / "dict").glob("open_jtalk_dic*"))
    if not dictionaries:
        raise SystemExit("Open JTalk dictionary not found")
    synth = Synthesizer(Onnxruntime.load_once(filename=str(library)),
                        OpenJtalk(str(dictionaries[0])), acceleration_mode="CPU",
                        cpu_num_threads=min(os.cpu_count() or 2, 4))
    required = {v["style"] for v in VOICES}
    fingerprints = {}
    for path in sorted((runtime / "models/vvms").glob("*.vvm")):
        with VoiceModelFile.open(str(path)) as model:
            styles = {style.id for speaker in model.metas for style in speaker.styles}
            if styles & required:
                synth.load_voice_model(model)
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                fingerprints.update({style: digest for style in styles & required})
    if required - fingerprints.keys():
        raise SystemExit("Missing required VOICEVOX styles: " + str(required - fingerprints.keys()))

    words = json.loads(args.input.read_text(encoding="utf-8"))["words"]
    pronunciation = json.loads((ROOT / "data/voice-pronunciation.json").read_text())
    accents = {f"{reading}。": accent for reading, accent in pronunciation["accents"].items()}
    readings = {f"{word['reading']}。" for word in words}
    texts = dict.fromkeys([SAMPLE, *[f"第{i}問。" for i in range(1, 21)]])
    for word in words:
        texts[f"{word['reading']}。"] = None
        if word.get("example"):
            texts[word["example"]] = None

    manifest_path = args.manifest.resolve()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    previous = json.loads(manifest_path.read_text()) if args.keep_existing and manifest_path.exists() else {"clips": {}}
    clips = previous.get("clips", {})
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    generated = 0
    for voice in VOICES:
        for text in texts:
            accent = accents.get(text)
            spoken = pronunciation["substitutions"].get(text, text)
            if text in readings:
                # Hiragana plus a long-vowel dash can be split as a separate
                # word by Open JTalk. Katakana preserves the intended reading.
                spoken = "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in text)
            identity = json.dumps({"engine": "voicevox-core-0.17.0", "model": fingerprints[voice["style"]],
                                   "style": voice["style"], "spoken": spoken, "accent": accent,
                                   "speed": 1.0, "mp3_quality": 3,
                                   "recipe": "joined-reading-phrase-v1"}, ensure_ascii=False, sort_keys=True)
            name = hashlib.sha256(identity.encode()).hexdigest()[:24] + ".mp3"
            destination = output / name
            if not destination.exists():
                query = synth.create_audio_query(spoken, voice["style"])
                if accent is not None:
                    # Repeated words (e.g. ベラベラ) may be split into phrases.
                    # They are one isolated vocabulary item in this exercise.
                    moras = [mora for phrase in query.accent_phrases for mora in phrase.moras]
                    phrase = AccentPhrase(moras=moras, accent=accent or len(moras))
                    if not 1 <= phrase.accent <= len(phrase.moras):
                        raise ValueError(f"Invalid accent for {text}")
                    query.accent_phrases = synth.replace_mora_data([phrase], voice["style"])
                query.speed_scale = 1.0
                query.pre_phoneme_length = 0.1
                query.post_phoneme_length = 0.15
                wav = synth.synthesis(query, voice["style"])
                with wave.open(io.BytesIO(wav)) as handle:
                    seconds = handle.getnframes() / handle.getframerate()
                    if not 0.25 <= seconds <= 60:
                        raise ValueError(f"Unexpected audio duration {seconds} for {text}")
                temporary = destination.with_suffix(".tmp.mp3")
                try:
                    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", "pipe:0",
                                    "-codec:a", "libmp3lame", "-q:a", "3", str(temporary)],
                                   input=wav, check=True)
                    if temporary.stat().st_size < 500:
                        raise ValueError(f"Empty encoded audio for {text}")
                    temporary.replace(destination)
                finally:
                    temporary.unlink(missing_ok=True)
                generated += 1
            clips.setdefault(text, {})[voice["id"]] = "/audio/" + name
        print(f"Rendered {voice['credit']}: {len(texts)} clips", flush=True)

    manifest = {"voices": [{k: v for k, v in voice.items() if k != "style"} |
                            {"sample": clips[SAMPLE][voice["id"]]} for voice in VOICES], "clips": clips}
    with tempfile.NamedTemporaryFile(mode="w", dir=manifest_path.parent, delete=False, encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary_manifest = Path(handle.name)
    temporary_manifest.replace(manifest_path)
    # Publish only after synthesis succeeds; old manifest clips stay playable
    # if synthesis fails. Prune obsolete assets after the atomic manifest swap.
    if not args.keep_existing:
        retained = {Path(src).name for entries in clips.values() for src in entries.values()}
        for old_clip in output.glob("*.mp3"):
            if old_clip.name not in retained:
                old_clip.unlink()
    print(json.dumps({"generated": generated, "texts": len(texts), "voices": len(VOICES),
                      "asset_bytes": sum(p.stat().st_size for p in output.glob("*.mp3"))}))


if __name__ == "__main__":
    main()
