#!/usr/bin/env python3
"""
Build data/words.json: the 65,025 (= 255 x 255) most frequent English words.

Source: the `wordfreq` Python package by Robyn Speer, English "best" list, which
merges Wikipedia, subtitles (OpenSubtitles/SUBTLEX), news, books, web text,
Twitter and Reddit. That mix is why contractions ("it's", "wouldn't") and
informal words ("gonna", "tbh", "idk") rank where people actually type them.

The only rule applied: walk the list from most to least frequent and keep a
token if it is purely alphabetic, allowing internal apostrophes and hyphens
(so contractions stay and numbers, symbols and dotted abbreviations go). Stop
at 65,025. The list is written in frequency order; the app sorts it
alphabetically itself. No other selection or ranking is applied.

Usage: python3 scripts/build_words.py [output-path]
"""
import datetime
import json
import re
import sys

from importlib.metadata import version as pkg_version

from wordfreq import top_n_list

N = 255 * 255
TOKEN = re.compile(r"^[a-z]+(?:['-][a-z]+)*$")

def main(out_path: str) -> None:
    words = []
    scanned = 0
    for w in top_n_list("en", 200_000, wordlist="best"):
        scanned += 1
        if TOKEN.match(w):
            words.append(w)
            if len(words) == N:
                break
    if len(words) != N:
        sys.exit(f"only found {len(words)} matching tokens, expected {N}")
    assert len(set(words)) == N, "duplicates in word list"
    payload = {
        "description": (
            "The 65,025 (255^2) most frequent English words, in descending "
            "frequency order. Contractions and informal words are included."
        ),
        "source": {
            "name": "wordfreq",
            "author": "Robyn Speer",
            "version": pkg_version("wordfreq"),
            "list": "en / best",
            "url": "https://github.com/rspeer/wordfreq",
        },
        "selection_rule": (
            "Walk wordfreq's English list from most to least frequent; keep a "
            "token if it matches ^[a-z]+(?:['-][a-z]+)*$; stop at 65,025."
        ),
        "tokens_scanned": scanned,
        "generated": datetime.date.today().isoformat(),
        "count": N,
        "words": words,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=0)
        f.write("\n")
    print(f"wrote {N} words to {out_path} (scanned {scanned} tokens)")
    print("first 20:", words[:20])
    print("last 10:", words[-10:])

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "words.json")
