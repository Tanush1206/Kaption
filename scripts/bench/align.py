#!/usr/bin/env python3
"""Kaption v2 bench - forced-align the by-ear truth to audio (torchaudio MMS_FA).

Produces per-word start/end times for the truth, so the scorer can measure
caption-start timing error (model caption start vs the word's true onset).

MMS_FA is a multilingual CTC forced aligner. Its dictionary is Latin a-z (+ a
few marks); the truth is already Roman Hinglish, so each word is lowercased and
reduced to [a-z']. Words that reduce to empty (bare numerals like "70,126",
pure punctuation) are dropped from the alignment and listed under "dropped".

Run (in a torch+torchaudio GPU container, e.g. kaption_bench_qwen_gpu after
`pip install torchaudio` for the matching cu128 torch):
  python align.py --clips-dir /tmp/clips --truth /tmp/cmp/truth \
      --out /tmp/cmp/align --device cuda
Only clips whose truth is corrected (>=2 entries) are aligned.
"""
import argparse, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from score import parse_truth  # reuse the truth parser
except Exception:
    sys.path.insert(0, "/tmp")
    from score import parse_truth  # type: ignore

KEEP = re.compile(r"[^a-z']")


def norm_word(w):
    return KEEP.sub("", w.lower())


def ref_words(segs):
    """Surface words (speech only) + their line timecode, with dict-normalised form."""
    out = []
    for s in segs:
        if s["nonspeech"]:
            continue
        for w in s["text"].split():
            nw = norm_word(w)
            out.append((w, nw, s["t"]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips-dir", required=True)
    ap.add_argument("--truth", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--device", default="cuda")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    import torch
    import torchaudio
    from torchaudio.pipelines import MMS_FA as bundle

    device = args.device if (args.device != "cuda" or torch.cuda.is_available()) else "cpu"
    model = bundle.get_model().to(device)
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()
    sr = bundle.sample_rate  # 16000

    clips = sorted(f[:-4] for f in os.listdir(args.truth) if f.endswith(".txt"))
    for clip in clips:
        segs, complete = parse_truth(os.path.join(args.truth, clip + ".txt"))
        wav_path = os.path.join(args.clips_dir, clip + ".wav")
        if not complete or not os.path.isfile(wav_path):
            print(f"SKIP {clip}: truth incomplete or wav missing")
            continue
        rw = ref_words(segs)
        kept = [(surf, nw, t) for (surf, nw, t) in rw if nw]
        dropped = [surf for (surf, nw, t) in rw if not nw]
        words = [nw for (_, nw, _) in kept]

        wav, in_sr = torchaudio.load(wav_path)
        if in_sr != sr:
            wav = torchaudio.functional.resample(wav, in_sr, sr)
        if wav.size(0) > 1:
            wav = wav.mean(0, keepdim=True)
        with torch.inference_mode():
            emission, _ = model(wav.to(device))
        token_spans = aligner(emission[0], tokenizer(words))
        ratio = wav.size(1) / emission.size(1) / sr

        aligned = []
        for (surf, nw, line_t), spans in zip(kept, token_spans):
            start = spans[0].start * ratio
            end = spans[-1].end * ratio
            aligned.append({"w": surf, "start": round(start, 3),
                            "end": round(end, 3), "line_t": line_t})
        out = {"clip": clip, "sample_rate": sr, "n_words": len(aligned),
               "dropped": dropped, "words": aligned}
        with open(os.path.join(args.out, clip + ".json"), "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False, indent=2)
        print(f"{clip}: aligned {len(aligned)} words, dropped {len(dropped)} "
              f"({dropped[:5]}{'...' if len(dropped) > 5 else ''})")


if __name__ == "__main__":
    main()
