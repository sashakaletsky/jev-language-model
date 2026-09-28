#!/usr/bin/env python3
"""
Build data/blocks.json: the dictionary arranged as 255 themed blocks of 255 words.

Inputs
  data/words.json     the 65,025 words in frequency order (scripts/build_words.py)
  data/taxonomy.json  the themes, in the order related themes should sit next to each other
  data/labels.json    one theme id per word, assigned by Claude at build time (docs/LABELLING.md)

Method (deliberately simple, so anyone can check it)
  1. Group the words by theme. Inside a theme keep frequency order, except themes
     marked "alpha" (names, places, brands, possessives), which are sorted
     alphabetically so that letter ranges are meaningful.
  2. Lay the themes out end to end in taxonomy order. That gives one sequence of
     65,025 words in which related words are neighbours.
  3. Cut the sequence into 255 consecutive blocks of exactly 255 words.
  4. Describe each block by its main theme, its position inside that theme
     (frequency tier, or letter range for "alpha" themes) and a few example
     words. Where a block straddles two themes, both are named.

The description is the only thing Jev reads about a block at inference time.

Usage: python3 scripts/build_blocks.py
"""
from __future__ import annotations

import datetime
import json
import os
import re
import sys
from collections import Counter, OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLOCK = 255
EXAMPLES = 7        # example words shown for a block's main theme
EXAMPLES_MINOR = 4  # example words shown for a theme that only spills into a block
MINOR_MIN = 12      # a spill-over smaller than this is just mentioned, not exemplified
EXAMPLE_OVERRIDES = {"core": 24}  # the function-word block spans several word classes; show more

# Punctuation is offered to Jev like any other option, at the head of the core block, so a
# sentence can be ended or paused. The rarest words are dropped to keep 255 x 255 entries.
PUNCTUATION = [".", ",", "?", "!"]

# Tiny themes that belong together are merged before laying out, so that the most
# important words of English (function words and contractions, 375 in all) form one
# coherent block instead of a chain of fragments. Labels in data/labels.json keep
# the fine-grained theme ids; the merge only affects how blocks are cut and named.
MERGES = [
    {
        "id": "core",
        "name": "Function words, contractions & punctuation | articles, pronouns, prepositions, "
                "conjunctions, auxiliaries, question words, it's / don't forms, . , ? !",
        "members": ["fn_determiners", "fn_pronouns", "fn_wh_words", "fn_prepositions",
                    "fn_conjunctions", "fn_auxiliaries", "ctr_pronoun_verb", "ctr_negative"],
        "order": "freq",
    },
    {
        "id": "inf_interjections",
        "name": "Interjections, greetings, responses & discourse fillers",
        "members": ["inf_interjections", "inf_discourse"],
        "order": "freq",
    },
]


def short_name(name: str) -> str:
    """Theme name without its parenthetical examples, for titles and descriptions."""
    return re.sub(r"\s*\([^)]*\)", "", name).strip()


def apply_merges(taxonomy: list[dict], labels: dict[str, str]) -> tuple[list[dict], dict[str, str]]:
    """Replace each merge's member themes with one merged theme at the first member's position."""
    for m in MERGES:
        members = set(m["members"])
        merged = {"id": m["id"], "group": "merged", "name": m["name"], "desc": "", "examples": [],
                  "order": m["order"]}
        first = next(i for i, t in enumerate(taxonomy) if t["id"] in members)
        taxonomy = [t for t in taxonomy if t["id"] not in members]
        taxonomy.insert(first, merged)
        labels = {w: (m["id"] if tid in members else tid) for w, tid in labels.items()}
    return taxonomy, labels


def load(name: str):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        return json.load(f)


def tier_name(k: int, m: int) -> str:
    """Name for the k-th (1-based) of m frequency tiers of a theme."""
    if m == 1:
        return ""
    if m == 2:
        return ["most common", "less common"][k - 1]
    if m == 3:
        return ["most common", "common", "rare"][k - 1]
    if k == 1:
        return "most common"
    if k == 2:
        return "common"
    if k == m:
        return "rarest"
    return f"less common ({k} of {m})"


def spread(words: list[str], n: int) -> list[str]:
    """n words spread evenly through the list (for alphabetical themes)."""
    if len(words) <= n:
        return list(words)
    step = len(words) / n
    return [words[int(i * step)] for i in range(n)]


def fmt(word: str) -> str:
    """Example words as shown in a description; punctuation is quoted so it reads clearly."""
    return word if word[0].isalnum() else f"'{word}'"


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main() -> None:
    words: list[str] = load("words.json")["words"]
    taxonomy: list[dict] = load("taxonomy.json")
    labels: dict[str, str] = load("labels.json")

    valid = {t["id"] for t in taxonomy}
    missing = [w for w in words if w not in labels]
    bad = [(w, labels[w]) for w in words if w in labels and labels[w] not in valid]
    if missing or bad:
        sys.exit(f"labels.json problems: {len(missing)} unlabelled words, {len(bad)} invalid ids "
                 f"(e.g. {missing[:5]} {bad[:5]})")
    taxonomy, labels = apply_merges(taxonomy, labels)
    themes = OrderedDict((t["id"], t) for t in taxonomy)
    if len(words) != BLOCK * BLOCK:
        sys.exit(f"expected {BLOCK * BLOCK} words, found {len(words)}")
    words = words[:len(words) - len(PUNCTUATION)]  # make room for punctuation

    # 1. group by theme, keeping frequency order, or alphabetical for "alpha" themes
    grouped: dict[str, list[str]] = {tid: [] for tid in themes}
    for w in words:
        grouped[labels[w]].append(w)
    grouped["core"] = PUNCTUATION + grouped["core"]
    for tid, t in themes.items():
        if t["order"] == "alpha":
            grouped[tid].sort()

    # 2. lay out end to end in taxonomy order
    sequence: list[tuple[str, str]] = []  # (word, theme id)
    for tid in themes:
        sequence.extend((w, tid) for w in grouped[tid])
    assert len(sequence) == BLOCK * BLOCK

    # where each theme's words sit in the sequence, and which blocks they touch
    theme_start: dict[str, int] = {}
    pos = 0
    for tid in themes:
        theme_start[tid] = pos
        pos += len(grouped[tid])
    theme_blocks: dict[str, list[int]] = {}
    for tid in themes:
        n = len(grouped[tid])
        if n == 0:
            theme_blocks[tid] = []
            continue
        first = theme_start[tid] // BLOCK
        last = (theme_start[tid] + n - 1) // BLOCK
        theme_blocks[tid] = list(range(first, last + 1))

    # 3. cut into blocks and 4. describe them
    blocks = []
    used_ids: set[str] = set()
    for b in range(BLOCK):
        chunk = sequence[b * BLOCK:(b + 1) * BLOCK]
        block_words = [w for w, _ in chunk]
        counts = Counter(tid for _, tid in chunk)
        order = [tid for tid in themes if tid in counts]  # taxonomy order
        primary = max(order, key=lambda tid: counts[tid])
        parts = []
        for tid in order:
            theme = themes[tid]
            own = [w for w, t in chunk if t == tid]
            k = theme_blocks[tid].index(b) + 1
            m = len(theme_blocks[tid])
            n_ex = EXAMPLE_OVERRIDES.get(tid, EXAMPLES)
            if theme["order"] == "alpha":
                where = f"{own[0]} to {own[-1]}" if m > 1 else ""
                examples = spread(own, n_ex)
            else:
                where = tier_name(k, m)
                examples = own[:n_ex]
            parts.append({"id": tid, "count": len(own), "where": where, "examples": examples,
                          "name": theme["name"]})

        prim = next(p for p in parts if p["id"] == primary)
        title = short_name(prim["name"]) + (f" ({prim['where']})" if prim["where"] else "")
        pieces = []
        for p in parts:  # in sequence order, so letter ranges and tiers read naturally
            label = short_name(p["name"]) + (f" ({p['where']})" if p["where"] else "")
            if p["id"] == primary:
                pieces.append(f"{label}: " + ", ".join(map(fmt, p["examples"][:EXAMPLE_OVERRIDES.get(p["id"], EXAMPLES)])))
            elif p["count"] >= MINOR_MIN:
                pieces.append(f"{label}: " + ", ".join(map(fmt, p["examples"][:EXAMPLES_MINOR])))
            else:
                pieces.append(f"a few {short_name(p['name'])} words")
        desc = " + ".join(pieces)
        bid = slug(primary.replace("_", "-") + "-" + (prim["where"] if prim["where"] else "all"))
        if bid in used_ids:
            bid = f"{bid}-{b + 1}"
        used_ids.add(bid)
        blocks.append({
            "id": bid,
            "title": title,
            "description": desc,
            "categories": [{"id": p["id"], "count": p["count"]} for p in parts],
            "words": block_words,
        })

    out = {
        "generated": datetime.date.today().isoformat(),
        "method": "See scripts/build_blocks.py. Themes in taxonomy order, frequency order inside a theme "
                  "(alphabetical for name-like themes), punctuation at the head of the core theme, "
                  "cut into 255 consecutive blocks of 255.",
        "block_size": BLOCK,
        "block_count": BLOCK,
        "blocks": blocks,
    }
    path = os.path.join(ROOT, "data", "blocks.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
        f.write("\n")

    mixed = sum(1 for blk in blocks if len(blk["categories"]) > 1)
    print(f"wrote {len(blocks)} blocks to {path}; {mixed} blocks span more than one theme")
    print("theme sizes:")
    for tid in themes:
        print(f"  {len(grouped[tid]):6d}  {tid}")
    total_desc = sum(len(blk["description"]) for blk in blocks)
    print(f"average description length: {total_desc / len(blocks):.0f} chars")


if __name__ == "__main__":
    main()
