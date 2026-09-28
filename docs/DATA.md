# The data: where it came from and how to rebuild it

Everything Jev navigates is a static file in `data/`. This page records how each file was produced,
under what licence, and how to regenerate it. Nothing in `data/` is consulted at inference time except
`blocks.json`.

| File | What it is | Produced by |
| --- | --- | --- |
| `words.json` | The 65,025 most frequent English words, in frequency order | `scripts/build_words.py` |
| `taxonomy.json` | 89 themes with descriptions and example words | written by hand for this project |
| `labels.json` | One theme id per word | Claude, following `docs/LABELLING.md` |
| `blocks.json` | 255 themed blocks of 255 words, with the descriptions Jev reads | `scripts/build_blocks.py` |

## words.json

The word list comes from [wordfreq](https://github.com/rspeer/wordfreq) (Robyn Speer), English "best"
list, version 3.1.1. wordfreq merges Wikipedia, subtitles, news, books, web text, Twitter and Reddit,
which is why contractions (`it's`, `wouldn't`) and informal words (`gonna`, `tbh`, `idk`) rank where
people actually type them.

One rule is applied: walk the list from most to least frequent, keep a token if it is purely
alphabetic with optional internal apostrophes (`^[a-z]+(?:['-][a-z]+)*$`), and stop at 65,025. That
drops numbers, symbols and dotted abbreviations such as `u.s`. Nothing else is filtered: proper nouns,
slang and rare words stay if they rank. The list is stored in frequency order; the block builder does
the arranging.

65,025 is 255 × 255: Jev's Choice question takes at most 255 options, so that is the largest dictionary
that two 255-way choices could cover exactly.

To rebuild: `pip install wordfreq` then `python3 scripts/build_words.py data/words.json`.

## taxonomy.json

Eighty-nine themes, grouped as function words, contractions and possessives, informal words, numbers
and time, adverbs, adjectives, verbs, nouns by topic, proper nouns, and a catch-all. Each has an id, a
name, a description, example words, and an `order` flag: `freq` themes keep frequency order inside the
theme, `alpha` themes (names, places, brands, possessives) are sorted alphabetically so that letter
ranges are meaningful in block descriptions.

The themes were chosen by hand with the word distribution in mind. The order of the file matters: it is
the order themes are laid out in when blocks are cut, so related themes sit next to each other and a
block that straddles two themes still reads coherently.

## labels.json

Each of the 65,025 words was assigned one theme by Claude, in 66 chunks of about a thousand words,
following the instructions in [`LABELLING.md`](LABELLING.md). Each chunk carried WordNet lexicographer
categories as hints where WordNet knew the word (about 47,000 of them); the hints were advisory. Every
chunk was validated for coverage and valid ids before merging.

Some judgement calls worth knowing about, as reported by the labellers: nationality and religious
group nouns went to the nationality theme; apostrophe-less contractions (`theres`, `youre`) went to
internet spellings; sports teams and bands went to organisations or media; two-letter acronyms mostly
went to abbreviations. If you disagree with a label, edit `labels.json` and rebuild the blocks, or
re-run the labelling for a chunk.

To relabel from scratch: `python3 scripts/label_chunks.py prepare <dir>` writes the chunks (with
WordNet hints if `nltk` and its `wordnet` corpus are installed), label each `chunks/chunkNN.txt` into
`out/chunkNN.json` following `LABELLING.md`, then `python3 scripts/label_chunks.py merge <dir>`.

## blocks.json

`scripts/build_blocks.py` turns the three files above into the 255 blocks:

1. The tiny function-word and contraction themes are merged into one core theme, and the four
   punctuation marks `.` `,` `?` `!` are placed at its head in place of the four rarest words, so the
   dictionary stays at 255 × 255 and Jev can end or pause a sentence.
2. Words are grouped by theme; frequency order inside a theme, alphabetical for `alpha` themes.
3. Themes are laid out end to end in taxonomy order and cut into 255 consecutive blocks of 255. About
   77 blocks straddle two themes at a boundary.
4. Each block gets an id, a title and a description: the main theme, its position within the theme
   (a frequency tier such as "most common", or a letter range such as "arnett to berg"), and example
   words. Where a block straddles themes, both are named. The description is the only thing Jev reads
   about a block at level 1. The 255 descriptions total about 36,000 characters, which is most of what
   a level-1 question costs.

To rebuild: `python3 scripts/build_blocks.py`. It prints the theme sizes and the number of mixed
blocks.

## Licences

The code in this repository is MIT. `words.json`, `labels.json` and `blocks.json` are derived from
wordfreq's data, which is [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and are
shared under the same licence with attribution to wordfreq. `taxonomy.json` and `LABELLING.md` are
MIT with the code. The WordNet hints used during labelling are not distributed; WordNet's own
licence applies to WordNet. `corpus/alice-excerpt.txt` is public domain.
