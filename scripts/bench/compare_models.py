#!/usr/bin/env python3
"""Kaption v2 bench - cross-model disagreement overlay.

All 6 truth drafts were seeded from APEX, which biases scoring toward Apex. This
tool finds every span where the challenger models disagree with Apex so the user
can listen to those first and trust the drafts less there.

Only Apex emits Roman Hinglish natively. Trelis, zero-stt and Qwen emit Devanagari
for Hindi words (English stays Latin), so their text is transliterated to Roman
(ITRANS, lowercased) before alignment - the same romanisation the scoring harness
will need later. Transliteration is imperfect, so a light normalisation (collapse
long vowels, strip punctuation) is applied for MATCHING only; the displayed
readings keep the romanised words so they stay recognisable.

Inputs:  <results>/<model>/<clip>.json  (from run_asr.py / run_qwen.py)
Outputs:
  truth_marked/<clip>.txt  - Apex everyday-spelling draft with [?] after each
                             contested span (what the user corrects first).
  disagreement.md          - per clip: each contested span with approx timecode
                             (from Apex word timestamps) + every model's reading.
"""
import argparse, difflib, json, os, re, sys

REF = "apex"
CHALLENGERS = ["trelis", "zerostt", "qwen"]
DEVA = re.compile(r"[ऀ-ॿ]")

try:
    from indic_transliteration import sanscript
    from indic_transliteration.sanscript import transliterate as _tr
    HAVE_TR = True
except Exception:
    HAVE_TR = False


def romanise(text):
    text = text or ""
    if HAVE_TR and DEVA.search(text):
        try:
            text = _tr(text, sanscript.DEVANAGARI, sanscript.ITRANS)
        except Exception:
            pass
    return text.lower()


def load(results, model, clip):
    p = os.path.join(results, model, clip + ".json")
    return json.load(open(p, encoding="utf-8")) if os.path.isfile(p) else None


def toks(text):
    return [t for t in re.split(r"\s+", romanise(text).strip()) if t]


def norm(t):
    t = re.sub(r"[^a-z0-9]", "", t.lower())   # drop ITRANS marks (~ . ^ etc.)
    t = re.sub(r"([aeiou])\1+", r"\1", t)     # collapse long vowels (ITRANS aa->a)
    if len(t) > 2 and t.endswith("a"):        # approx schwa deletion (kartika->kartik)
        t = t[:-1]
    return t


def contested_mask(ref_toks, other_toks):
    sm = difflib.SequenceMatcher(a=[norm(x) for x in ref_toks],
                                 b=[norm(x) for x in other_toks], autojunk=False)
    mask = [False] * len(ref_toks)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        if tag in ("replace", "delete"):
            for i in range(i1, i2):
                mask[i] = True
        elif tag == "insert":
            b = min(max(i1, 0), len(ref_toks) - 1)
            if 0 <= b < len(mask):
                mask[b] = True
    return mask, sm


def merge_spans(mask):
    spans, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            spans.append((i, j))
            i = j
        else:
            i += 1
    return spans


def model_slice(sm, i1, i2):
    j_start = j_end = None
    for tag, a1, a2, b1, b2 in sm.get_opcodes():
        if a2 <= i1 or a1 >= i2:
            continue
        lo = b1 + (max(0, i1 - a1) if tag != "insert" else 0)
        hi = b2 - (max(0, a2 - i2) if tag != "insert" else 0)
        if j_start is None:
            j_start = lo
        j_end = hi
    if j_start is None:
        return (0, 0)
    return (j_start, max(j_start, j_end))


def approx_time(apex, i1, i2):
    words = apex.get("words") or []
    if not words:
        return None
    a = words[min(i1, len(words) - 1)]
    b = words[min(i2 - 1, len(words) - 1)]
    s, e = a.get("start"), b.get("end")
    return (s, e) if s is not None and e is not None else None


def everyday(text):
    try:
        sys.path.insert(0, "/app")
        from app.services.hinglish_spelling import everyday as ev  # type: ignore
        return ev(text)
    except Exception:
        return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", required=True)
    ap.add_argument("--truth-out", required=True)
    ap.add_argument("--md-out", required=True)
    args = ap.parse_args()
    os.makedirs(args.truth_out, exist_ok=True)

    apex_dir = os.path.join(args.results, REF)
    clips = sorted(f[:-5] for f in os.listdir(apex_dir)
                   if f.endswith(".json") and not f.startswith("_"))
    present = [m for m in CHALLENGERS if os.path.isdir(os.path.join(args.results, m))]

    md = ["# Cross-model disagreement overlay", "",
          f"Reference: **apex** (native Roman). Challengers: **{', '.join(present)}** "
          "(Devanagari transliterated to Roman "
          f"{'via ITRANS' if HAVE_TR else '- NO TRANSLITERATOR INSTALLED, raw Devanagari compared'}).",
          "",
          "All truth drafts were seeded from Apex. `[?]` marks every span where a "
          "challenger reads it differently - listen to those first. Transliteration "
          "is imperfect, so treat borderline marks as 'worth a listen', not 'Apex is wrong'.",
          ""]

    for clip in clips:
        apex = load(args.results, REF, clip)
        if not apex:
            continue
        ref_toks = toks(apex["text"])
        others = {m: toks((load(args.results, m, clip) or {}).get("text", "")) for m in present}

        masks, sms = [], {}
        for m, ot in others.items():
            mask, sm = contested_mask(ref_toks, ot)
            masks.append(mask)
            sms[m] = sm
        union = [any(mk[i] for mk in masks) for i in range(len(ref_toks))] if masks else [False] * len(ref_toks)
        spans = merge_spans(union)

        ev_text = everyday(apex["text"])
        ev_toks = ev_text.split()
        # map [?] onto the everyday draft if token counts line up, else onto apex raw
        use = ev_toks if len(ev_toks) == len(ref_toks) else apex["text"].split()
        out_toks = list(use)
        for (i1, i2) in reversed(spans):
            end = min(i2, len(out_toks))
            if end - 1 >= 0:
                out_toks[end - 1] = out_toks[end - 1] + " [?]"
        with open(os.path.join(args.truth_out, clip + ".txt"), "w", encoding="utf-8") as fh:
            fh.write(" ".join(out_toks).strip() + "\n")

        md.append(f"## {clip}  ({len(spans)} contested span(s) of {len(ref_toks)} words)")
        if not spans:
            md.append("_All challengers agree with Apex._\n")
        for (i1, i2) in spans:
            tr = approx_time(apex, i1, i2)
            tc = f"{tr[0]:.1f}-{tr[1]:.1f}s" if tr else "?"
            md.append(f"- **[{tc}]** apex: `{' '.join(ref_toks[i1:i2])}`")
            for m, ot in others.items():
                j1, j2 = model_slice(sms[m], i1, i2)
                reading = " ".join(ot[j1:j2]) if 0 <= j1 <= j2 <= len(ot) else ""
                md.append(f"    - {m}: `{reading}`")
        md.append("")

    with open(args.md_out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(md))
    print(f"transliterator: {'indic_transliteration' if HAVE_TR else 'NONE'}")
    print(f"wrote {len(clips)} marked truth files -> {args.truth_out}")
    print(f"wrote {args.md_out}")


if __name__ == "__main__":
    main()
