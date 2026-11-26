#!/usr/bin/env python3
"""Kaption v2 bench - score ASR hypotheses against the by-ear truth.

Truth lives in test-assets/bench/truth/<clip>.txt (Tanush's corrected files),
one entry per line:  [m:ss] text   with optional -s1/-s2 speaker prefix, blank
lines ignored, duplicate timecodes = simultaneous speech, and bracket-only text
like [Music] = non-speech. Score from truth/ ONLY (truth_marked/ is the draft).

Metrics (text-based; caption-timing error is a separate forced-alignment step):
  - strict WER  : whitespace tokens, exact (case + punctuation). Devanagari
                  models score ~1.0 here by construction (script mismatch) - read
                  loose WER for them.
  - loose WER   : lowercased, punctuation stripped, everyday-spelling normalised,
                  long vowels collapsed, approx schwa-deletion; Devanagari hyps
                  romanised (ITRANS) first. This is the fair cross-script number.
  - eng acc     : of the English words in the truth, fraction the model got
                  (English detected via wordfreq zipf_en >= 3.0).
  - missed      : reference words deleted by the model (loose alignment).
  - halluc      : model words with no reference match (insertions); plus words
                  time-stamped inside a [Music]/non-speech span (models with word
                  timestamps only).

Only fully-corrected clips are scored; others are skipped with a note.
"""
import argparse, json, os, re, sys

DEVA = re.compile(r"[ऀ-ॿ]")
LINE = re.compile(r"^\[(\d+):(\d+)\]\s*(.*)$")
SPK = re.compile(r"^-s(\d+)\s+(.*)$", re.I)
BRACKET_ONLY = re.compile(r"^\[[^\]]+\]$")

try:
    from indic_transliteration import sanscript
    from indic_transliteration.sanscript import transliterate as _tr
    HAVE_TR = True
except Exception:
    HAVE_TR = False

try:
    from wordfreq import zipf_frequency
    HAVE_WF = True
except Exception:
    HAVE_WF = False
    _COMMON_EN = set(
        "the of and a to in is you that it was for on are as with they at be this have from or "
        "one but not what all were we when your can said there use which do how time look two "
        "welcome channel video hello here friend reality show congratulations music guys back "
        "again hope doing well start party edition energy intensity let go science computer "
        "curiosity understand improve test follow design delete okay bye immerse measurable".split()
    )


def romanise(text):
    text = text or ""
    if HAVE_TR and DEVA.search(text):
        try:
            text = _tr(text, sanscript.DEVANAGARI, sanscript.ITRANS)
        except Exception:
            pass
    return text


def everyday(text):
    try:
        sys.path.insert(0, "/app")
        from app.services.hinglish_spelling import everyday as ev  # type: ignore
        return ev(text)
    except Exception:
        return text


def normloose(tok):
    tok = re.sub(r"[^a-z0-9]", "", tok.lower())
    tok = re.sub(r"([aeiou])\1+", r"\1", tok)
    if len(tok) > 2 and tok.endswith("a"):
        tok = tok[:-1]
    return tok


def is_english(tok):
    t = re.sub(r"[^a-z]", "", tok.lower())
    if len(t) < 2:
        return False
    if HAVE_WF:
        return zipf_frequency(t, "en") >= 3.0
    return t in _COMMON_EN


# ---------- truth parsing ----------
def parse_truth(path):
    """Return (segments, complete). segment: {t, speaker, text, nonspeech}."""
    segs = []
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line:
                continue
            m = LINE.match(line)
            if not m:
                continue  # tolerate stray lines
            t = int(m.group(1)) * 60 + int(m.group(2))
            rest = m.group(3).strip()
            speaker = "s1"
            sm = SPK.match(rest)
            if sm:
                speaker = "s" + sm.group(1)
                rest = sm.group(2).strip()
            nonspeech = bool(BRACKET_ONLY.match(rest))
            segs.append({"t": t, "speaker": speaker, "text": rest, "nonspeech": nonspeech})
    complete = len(segs) >= 2
    return segs, complete


def nonspeech_spans(segs):
    """[(start,end)] spans covered by [Music]-type lines, end = next entry's t."""
    spans = []
    for i, s in enumerate(segs):
        if s["nonspeech"]:
            end = segs[i + 1]["t"] if i + 1 < len(segs) else s["t"] + 5
            spans.append((s["t"], end))
    return spans


def ref_words_loose(segs):
    words = []
    for s in segs:
        if s["nonspeech"]:
            continue
        t = everyday(s["text"].lower())
        words += [w for w in (normloose(x) for x in t.split()) if w]
    return words


def ref_words_strict(segs):
    out = []
    for s in segs:
        if not s["nonspeech"]:
            out += s["text"].split()
    return out


def hyp_words_loose(text):
    t = everyday(romanise(text).lower())
    return [w for w in (normloose(x) for x in t.split()) if w]


# ---------- alignment ----------
def align(ref, hyp):
    n, m = len(ref), len(hyp)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    i, j = n, m
    S = D = I = 0
    ops = []  # (ref_idx, outcome) for ref tokens: hit/sub/del
    while i > 0 or j > 0:
        diag = None
        if i > 0 and j > 0:
            diag = dp[i - 1][j - 1] + (0 if ref[i - 1] == hyp[j - 1] else 1)
        if diag is not None and dp[i][j] == diag:
            if ref[i - 1] == hyp[j - 1]:
                ops.append((i - 1, "hit"))
            else:
                S += 1
                ops.append((i - 1, "sub"))
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            D += 1
            ops.append((i - 1, "del"))
            i -= 1
        else:
            I += 1
            j -= 1
    ops.reverse()
    return {"S": S, "D": D, "I": I, "N": n, "ops": ops}


def score_clip(results, model, clip, segs):
    jp = os.path.join(results, model, clip + ".json")
    if not os.path.isfile(jp):
        return None
    hyp = json.load(open(jp, encoding="utf-8"))
    ref_l = ref_words_loose(segs)
    hyp_l = hyp_words_loose(hyp.get("text", ""))
    a = align(ref_l, hyp_l)
    loose_wer = (a["S"] + a["D"] + a["I"]) / max(1, a["N"])
    # strict
    ref_s = [re.sub(r"\s", "", w) for w in ref_words_strict(segs)]
    hyp_s = (hyp.get("text", "")).split()
    s2 = align(ref_s, hyp_s)
    strict_wer = (s2["S"] + s2["D"] + s2["I"]) / max(1, s2["N"])
    # english accuracy
    eng_idx = [i for i, w in enumerate(ref_l) if is_english(w)]
    outcome = {i: o for i, o in a["ops"]}
    eng_hit = sum(1 for i in eng_idx if outcome.get(i) == "hit")
    eng_acc = eng_hit / len(eng_idx) if eng_idx else None
    missed = a["D"] / max(1, a["N"])
    halluc_ins = a["I"] / max(1, len(hyp_l))
    # hallucination over non-speech (needs hyp word timestamps)
    halluc_music = None
    spans = nonspeech_spans(segs)
    words_ts = hyp.get("words") or []
    if spans and words_ts:
        bad = sum(1 for w in words_ts
                  if any(s <= (w.get("start") or -1) < e for s, e in spans))
        halluc_music = bad
    return {
        "loose_wer": round(loose_wer, 3), "strict_wer": round(strict_wer, 3),
        "eng_acc": None if eng_acc is None else round(eng_acc, 3),
        "missed": round(missed, 3), "halluc_ins": round(halluc_ins, 3),
        "halluc_music": halluc_music, "ref_words": a["N"], "eng_words": len(eng_idx),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", required=True)
    ap.add_argument("--truth", required=True)
    ap.add_argument("--models", default="apex,trelis,zerostt,qwen")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    models = args.models.split(",")

    clips = sorted(f[:-4] for f in os.listdir(args.truth) if f.endswith(".txt"))
    report = {"transliterator": HAVE_TR, "wordfreq": HAVE_WF, "clips": {}, "skipped": []}
    print(f"transliterator={HAVE_TR} wordfreq={HAVE_WF}")
    for clip in clips:
        segs, complete = parse_truth(os.path.join(args.truth, clip + ".txt"))
        if not complete:
            report["skipped"].append(clip)
            print(f"SKIP {clip}: truth not corrected yet")
            continue
        report["clips"][clip] = {"ref_words": len(ref_words_loose(segs))}
        nspans = len(nonspeech_spans(segs))
        print(f"\n{clip}  (ref {len(ref_words_loose(segs))} words, {nspans} non-speech span)")
        hdr = f"  {'model':8} {'looseWER':>9} {'strictWER':>10} {'engAcc':>7}"
        print(hdr + f" {'missed':>7} {'halIns':>7} {'halMus':>7}")
        for m in models:
            r = score_clip(args.results, m, clip, segs)
            if r is None:
                continue
            report["clips"][clip][m] = r
            hm = "-" if r["halluc_music"] is None else str(r["halluc_music"])
            ea = "-" if r["eng_acc"] is None else f"{r['eng_acc']:.3f}"
            print(f"  {m:8} {r['loose_wer']:>9.3f} {r['strict_wer']:>10.3f} {ea:>7} "
                  f"{r['missed']:>7.3f} {r['halluc_ins']:>7.3f} {hm:>7}")
    if args.out:
        json.dump(report, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
