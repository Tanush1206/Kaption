#!/usr/bin/env python3
"""Kaption v2 bench - run moorlee/qwen3-asr-0.6b-hinglish ("Srota") over WAV clips.

Uses the qwen-asr package (Qwen3ASRModel). Output is mixed Devanagari+Latin, so
scoring later must romanise the Devanagari. Measure only. ISOLATED container -
never run in the live vcm_worker (pip would shift transformers/torch there).

The card recommends <=30s per call, so long clips are sliced into <=28s chunks
(ffmpeg must be on PATH) and the texts joined, to be fair vs Whisper's internal
30s windowing.
"""
import argparse, json, os, time, wave


def audio_seconds(path):
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


def chunk(path, workdir, secs=28):
    """Slice >30s clips into <=28s pieces with soundfile (no ffmpeg dependency)."""
    import soundfile as sf
    data, sr = sf.read(path)
    if len(data) / float(sr) <= 30:
        return [path]
    os.makedirs(workdir, exist_ok=True)
    base = os.path.splitext(os.path.basename(path))[0]
    step = int(secs * sr)
    parts = []
    for i, start in enumerate(range(0, len(data), step)):
        out = os.path.join(workdir, f"{base}_c{i}.wav")
        sf.write(out, data[start:start + step], sr)
        parts.append(out)
    return parts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="moorlee/qwen3-asr-0.6b-hinglish")
    ap.add_argument("--clips-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--name", default="qwen")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    import torch
    from qwen_asr import Qwen3ASRModel

    os.makedirs(args.out_dir, exist_ok=True)
    t0 = time.time()
    attn_used = "default"
    if args.device.startswith("cuda"):
        # Prefer flash-attn, but it is usually not installed in a stock CUDA
        # torch image; fall back to the default (sdpa/eager) attention so the
        # GPU run still happens. Attention backend is recorded in the summary.
        try:
            model = Qwen3ASRModel.from_pretrained(
                args.model, dtype=torch.bfloat16, device_map=args.device,
                attn_implementation="flash_attention_2")
            attn_used = "flash_attention_2"
        except Exception as e:
            print(f"  flash_attention_2 unavailable ({type(e).__name__}); "
                  f"falling back to default attention", flush=True)
            model = Qwen3ASRModel.from_pretrained(
                args.model, dtype=torch.bfloat16, device_map=args.device)
    else:
        model = Qwen3ASRModel.from_pretrained(
            args.model, dtype=torch.float32, device_map="cpu")
    load_sec = time.time() - t0

    clips = sorted(f for f in os.listdir(args.clips_dir) if f.endswith(".wav"))
    summary = {"model": args.name, "device": args.device,
               "attn": attn_used, "load_sec": round(load_sec, 2), "clips": []}
    for clip in clips:
        path = os.path.join(args.clips_dir, clip)
        audio_sec = audio_seconds(path)
        parts = chunk(path, os.path.join(args.out_dir, "_chunks"))
        t = time.time()
        texts = []
        for p in parts:
            res = model.transcribe(audio=p, language=None)
            texts.append(res[0].text if res else "")
        infer_sec = time.time() - t
        text = " ".join(x.strip() for x in texts).strip()
        rec = {"clip": clip, "audio_sec": round(audio_sec, 2),
               "infer_sec": round(infer_sec, 2),
               "xrt": round(infer_sec / audio_sec, 3) if audio_sec else None,
               "n_chunks": len(parts), "text": text}
        with open(os.path.join(args.out_dir, f"{clip[:-4]}.json"), "w", encoding="utf-8") as fh:
            json.dump(rec, fh, ensure_ascii=False, indent=2)
        summary["clips"].append({"clip": clip, "audio_sec": rec["audio_sec"],
                                 "infer_sec": rec["infer_sec"], "xrt": rec["xrt"]})
        print(f"  {clip}: {audio_sec:.0f}s audio -> {infer_sec:.1f}s ({rec['xrt']}x) [{len(parts)} chunk] :: {text[:70]}", flush=True)

    with open(os.path.join(args.out_dir, "_summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)
    print(f"{args.name}: {len(clips)} clips, model load {load_sec:.1f}s", flush=True)


if __name__ == "__main__":
    main()
