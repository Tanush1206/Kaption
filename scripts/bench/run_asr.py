#!/usr/bin/env python3
"""
Kaption v2 bench — run one CTranslate2 (faster-whisper) ASR model over a folder
of 16 kHz mono WAV clips and write raw transcripts + timings as JSON.

Measure only. Uniform params across models so the bake-off is apples-to-apples:
beam size 5, no VAD, condition_on_previous_text off (so a loop in one caption
can't poison the next). Pass --language per model (Apex writes Hinglish under
Whisper's English token, so Apex uses "en"; most Hindi-finetunes use "hi").

Usage (inside a container that has faster-whisper + the model + the WAVs):
  python run_asr.py --model <ct2_dir> --clips-dir <wavs> --out-dir <out> \
      --language en --device cuda --compute-type float16 --name apex
"""
import argparse
import json
import os
import time
import wave


def audio_seconds(path: str) -> float:
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="CTranslate2 model directory")
    ap.add_argument("--clips-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--name", required=True, help="model label for the output")
    ap.add_argument("--language", default=None, help="forced language, or None=auto")
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--compute-type", default="float16")
    ap.add_argument("--beam-size", type=int, default=5)
    args = ap.parse_args()

    from faster_whisper import WhisperModel

    os.makedirs(args.out_dir, exist_ok=True)
    t0 = time.time()
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    load_sec = time.time() - t0

    clips = sorted(f for f in os.listdir(args.clips_dir) if f.endswith(".wav"))
    summary = {
        "model": args.name,
        "model_dir": args.model,
        "language": args.language,
        "device": args.device,
        "compute_type": args.compute_type,
        "beam_size": args.beam_size,
        "load_sec": round(load_sec, 2),
        "clips": [],
    }
    for clip in clips:
        path = os.path.join(args.clips_dir, clip)
        audio_sec = audio_seconds(path)
        t = time.time()
        segments, info = model.transcribe(
            path,
            language=args.language,
            beam_size=args.beam_size,
            vad_filter=False,
            condition_on_previous_text=False,
            word_timestamps=True,
        )
        segs = []
        words = []
        for s in segments:
            segs.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()})
            for wd in (s.words or []):
                words.append({"start": round(wd.start, 3), "end": round(wd.end, 3), "word": wd.word.strip()})
        infer_sec = time.time() - t
        text = " ".join(x["text"] for x in segs).strip()
        rec = {
            "clip": clip,
            "audio_sec": round(audio_sec, 2),
            "infer_sec": round(infer_sec, 2),
            "xrt": round(infer_sec / audio_sec, 3) if audio_sec else None,
            "detected_language": getattr(info, "language", None),
            "text": text,
            "segments": segs,
            "words": words,
        }
        with open(os.path.join(args.out_dir, f"{clip[:-4]}.json"), "w", encoding="utf-8") as fh:
            json.dump(rec, fh, ensure_ascii=False, indent=2)
        summary["clips"].append({"clip": clip, "audio_sec": rec["audio_sec"], "infer_sec": rec["infer_sec"], "xrt": rec["xrt"]})
        print(f"  {args.name} {clip}: {audio_sec:.0f}s audio -> {infer_sec:.1f}s ({rec['xrt']}x)", flush=True)

    with open(os.path.join(args.out_dir, "_summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)
    print(f"{args.name}: {len(clips)} clips, model load {load_sec:.1f}s", flush=True)


if __name__ == "__main__":
    main()
