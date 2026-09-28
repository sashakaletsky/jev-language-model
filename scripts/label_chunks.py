#!/usr/bin/env python3
"""
Prepare the word-labelling job that produced data/labels.json.

Splits data/words.json into chunks of ~1,000 words, one file each, with WordNet
lexicographer categories as hints where WordNet knows the word. Each chunk was
then labelled by Claude following docs/LABELLING.md, and the chunk outputs were
merged into data/labels.json (see merge_labels() below).

Usage:
  python3 scripts/label_chunks.py prepare <out-dir>     # writes chunkNN.txt files
  python3 scripts/label_chunks.py merge <out-dir>       # merges <out-dir>/out/chunkNN.json -> data/labels.json

WordNet hints need `pip install nltk` and the wordnet corpus; without them the
chunks are written with empty hints.
"""
import glob
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHUNKS = 66


def wordnet_hints(words):
    try:
        from nltk.corpus import wordnet as wn
        wn.synsets("dog")
    except Exception:
        print("WordNet unavailable; writing chunks without hints", file=sys.stderr)
        return {}
    hints = {}
    for w in words:
        seen = []
        for s in wn.synsets(w.replace("'", "")):
            if s.lexname() not in seen:
                seen.append(s.lexname())
            if len(seen) == 3:
                break
        if seen:
            hints[w] = seen
    return hints


def prepare(out_dir):
    words = json.load(open(os.path.join(ROOT, "data", "words.json"), encoding="utf-8"))["words"]
    hints = wordnet_hints(words)
    os.makedirs(os.path.join(out_dir, "chunks"), exist_ok=True)
    size = math.ceil(len(words) / CHUNKS)
    for i in range(CHUNKS):
        chunk = words[i * size:(i + 1) * size]
        with open(os.path.join(out_dir, "chunks", f"chunk{i:02d}.txt"), "w", encoding="utf-8") as f:
            f.write(f"# chunk {i:02d}: {len(chunk)} words (frequency ranks {i * size + 1}-{i * size + len(chunk)})\n")
            f.write("# format: word<TAB>wordnet-hints (may be empty)\n")
            for w in chunk:
                f.write(w + "\t" + ",".join(hints.get(w, [])) + "\n")
    print(f"wrote {CHUNKS} chunks of up to {size} words to {out_dir}/chunks")


def merge(out_dir):
    words = json.load(open(os.path.join(ROOT, "data", "words.json"), encoding="utf-8"))["words"]
    valid = {t["id"] for t in json.load(open(os.path.join(ROOT, "data", "taxonomy.json"), encoding="utf-8"))}
    labels = {}
    for path in sorted(glob.glob(os.path.join(out_dir, "out", "chunk*.json"))):
        labels.update(json.load(open(path, encoding="utf-8")))
    missing = [w for w in words if w not in labels]
    bad = {w: v for w, v in labels.items() if v not in valid}
    if missing or bad:
        sys.exit(f"{len(missing)} words unlabelled, {len(bad)} invalid ids; e.g. {missing[:10]} {list(bad.items())[:10]}")
    ordered = {w: labels[w] for w in words}
    with open(os.path.join(ROOT, "data", "labels.json"), "w", encoding="utf-8") as f:
        json.dump(ordered, f, ensure_ascii=False, indent=0)
        f.write("\n")
    print(f"wrote data/labels.json with {len(ordered)} labels")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("prepare", "merge"):
        sys.exit(__doc__)
    (prepare if sys.argv[1] == "prepare" else merge)(sys.argv[2])
