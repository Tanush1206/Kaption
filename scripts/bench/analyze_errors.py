#!/usr/bin/env python3
"""Dump a model's word-level errors vs truth, keeping surface forms, for
categorising where Apex loses words. Aligns on normalised tokens."""
import argparse, json, os, re, sys
sys.path.insert(0, "/tmp")
from score import (parse_truth, romanise, everyday, normloose, is_english)  # noqa: E402


def ref_surface(segs):
    out = []
    for s in segs:
        if not s["nonspeech"]:
            out += s["text"].split()
    return out


def align_keep(ref_n, hyp_n):
    n, m = len(ref_n), len(hyp_n)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            c = 0 if ref_n[i - 1] == hyp_n[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + c)
    i, j, ops = n, m, []
    while i > 0 or j > 0:
        diag = None
        if i and j:
            diag = dp[i - 1][j - 1] + (0 if ref_n[i - 1] == hyp_n[j - 1] else 1)
        if diag is not None and dp[i][j] == diag:
            ops.append(("hit" if ref_n[i - 1] == hyp_n[j - 1] else "sub", i - 1, j - 1))
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            ops.append(("del", i - 1, None))
            i -= 1
        else:
            ops.append(("ins", None, j - 1))
            j -= 1
    ops.reverse()
    return ops


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", required=True)
    ap.add_argument("--truth", required=True)
    ap.add_argument("--model", default="apex")
    ap.add_argument("--clips", required=True)
    args = ap.parse_args()
    for clip in args.clips.split(","):
        segs, _ = parse_truth(os.path.join(args.truth, clip + ".txt"))
        rs = ref_surface(segs)
        rn = [normloose(x) for x in rs]
        hp = os.path.join(args.results, args.model, clip + ".json")
        hyp = json.load(open(hp, encoding="utf-8"))
        hs = romanise(everyday(hyp.get("text", ""))).split()
        hn = [normloose(x) for x in hs]
        # drop empties keeping parallel
        rs2, rn2 = zip(*[(a, b) for a, b in zip(rs, rn) if b]) if any(rn) else ([], [])
        hs2, hn2 = zip(*[(a, b) for a, b in zip(hs, hn) if b]) if any(hn) else ([], [])
        rs2, rn2, hs2, hn2 = list(rs2), list(rn2), list(hs2), list(hn2)
        ops = align_keep(rn2, hn2)
        subs = [(rs2[i], hs2[j]) for t, i, j in ops if t == "sub"]
        dels = [rs2[i] for t, i, j in ops if t == "del"]
        inss = [hs2[j] for t, i, j in ops if t == "ins"]
        print(f"\n===== {clip} ({args.model}) : {len(rs2)} ref words =====")
        print(f"SUBS ({len(subs)}):")
        for r, h in subs:
            print(f"   {r!r:22} -> {h!r}   {'[ENG]' if is_english(r) else ''}")
        print(f"DELS ({len(dels)}): {dels}")
        print(f"INSS ({len(inss)}): {inss}")


if __name__ == "__main__":
    main()
